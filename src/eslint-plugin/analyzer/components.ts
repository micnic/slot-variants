import type { Scope } from 'eslint';
import type {
	ArrowFunctionExpression,
	FunctionDeclaration,
	FunctionExpression,
	Identifier,
	MaybeNamedClassDeclaration,
	MaybeNamedFunctionDeclaration,
	Node,
	Program
} from 'estree';
import {
	findSingleBinding,
	getConstDefInit,
	isTransparentWrapper
} from './const-bindings.ts';
import {
	DEFAULT_EXPORT,
	getExportName,
	getModuleSpecifier
} from './module-syntax.ts';

export type ComponentFunction =
	| FunctionDeclaration
	| FunctionExpression
	| ArrowFunctionExpression;

// Anything that may name or wrap a component, including what `export default`
// takes besides an expression: a function or class declaration, maybe unnamed.
type WrapperCandidate =
	| Node
	| MaybeNamedFunctionDeclaration
	| MaybeNamedClassDeclaration;

/**
 * Something a `class` prop is passed to: a component function, or a whole
 * single-file component module (Svelte, Vue), whose props are declared at the
 * top level of its script.
 */
export type Component = ComponentFunction | Program;

/** The module an identifier is imported from, and under which name. */
export type ImportSource = { specifier: string; exportName: string };

export type ImportDefinition = Extract<
	Scope.Definition,
	{ type: 'ImportBinding' }
>;

/** What a component name is bound to: a same-file function, or an import. */
type ComponentBinding =
	| { kind: 'local'; fn: ComponentFunction }
	| { kind: 'import'; source: ImportSource }
	| null;

// Takes the structural minimum so framework node unions narrow through it too.
export const isComponentFunction = (node: {
	type: string;
}): node is ComponentFunction =>
	node.type === 'FunctionDeclaration' ||
	node.type === 'FunctionExpression' ||
	node.type === 'ArrowFunctionExpression';

/**
 * The component `node` is, or wraps: a function, or the name of one, handed to
 * `forwardRef()`, `memo()` or any other call, however deeply nested
 * (`memo(forwardRef(fn))`, `memo(Impl)`), read through type-only wrappers
 * (`memo(Impl) as typeof Impl`). The first argument that leads
 * somewhere wins, so a later one (`memo(Impl, areEqual)`) isn't mistaken for
 * the component. Null when nothing is reachable that way.
 */
export const findWrappedComponent = (
	node: WrapperCandidate
): ComponentFunction | Identifier | null => {
	if (isComponentFunction(node) || node.type === 'Identifier') {
		return node;
	}

	if (isTransparentWrapper(node)) {
		return findWrappedComponent(node.expression);
	}

	if (node.type !== 'CallExpression') {
		return null;
	}

	for (const arg of node.arguments) {
		if (arg.type === 'SpreadElement') {
			continue;
		}

		const wrapped = findWrappedComponent(arg);

		if (wrapped !== null) {
			return wrapped;
		}
	}

	return null;
};

/**
 * The module and export name an import binding reads, or null for a namespace
 * import, whose members are read through a dotted name instead.
 */
export const getImportSource = (def: ImportDefinition): ImportSource | null => {
	const value = getModuleSpecifier(def.parent.source);

	if (def.node.type === 'ImportDefaultSpecifier') {
		return { specifier: value, exportName: DEFAULT_EXPORT };
	}

	if (def.node.type !== 'ImportSpecifier') {
		return null;
	}

	return { specifier: value, exportName: getExportName(def.node.imported) };
};

/**
 * What a component name is bound to: a same-file function — a function
 * declaration, or a `const` bound to a function expression, possibly through a
 * wrapper call — or the module and export name it is imported from. Null for
 * anything else: a `let`/`var`, a redeclared binding, a namespace import.
 *
 * A name wrapped (`memo(Impl)`) or aliased (`const Button = Impl`) is
 * resolved from the scope that declares the wrapper. `seen` stops a binding
 * that wraps itself (`const Loop = memo(Loop)`).
 */
export const resolveComponentBinding = (
	name: string,
	scope: Scope.Scope,
	seen = new Set<Scope.Definition>()
): ComponentBinding => {
	const binding = findSingleBinding(scope, name);

	if (binding === null || seen.has(binding.def)) {
		return null;
	}

	const { def } = binding;

	seen.add(def);

	if (def.type === 'ImportBinding') {
		const source = getImportSource(def);

		if (source === null) {
			return null;
		}

		return { kind: 'import', source };
	}

	if (def.type === 'FunctionName') {
		return { kind: 'local', fn: def.node };
	}

	const init = getConstDefInit(def);

	if (!init) {
		return null;
	}

	const wrapped = findWrappedComponent(init);

	if (wrapped === null) {
		return null;
	}

	if (wrapped.type === 'Identifier') {
		return resolveComponentBinding(wrapped.name, binding.scope, seen);
	}

	return { kind: 'local', fn: wrapped };
};

/**
 * What a component tag names: a plain name as `resolveComponentBinding` reads
 * it, or a member of a namespace import (`UI.Button`), as the import of that
 * export. Null for a member of anything else.
 */
export const resolveTagBinding = (
	tag: string,
	scope: Scope.Scope
): ComponentBinding => {
	const dot = tag.indexOf('.');

	if (dot === -1) {
		return resolveComponentBinding(tag, scope);
	}

	const binding = findSingleBinding(scope, tag.slice(0, dot));

	if (binding === null) {
		return null;
	}

	const { def } = binding;

	if (
		def.type !== 'ImportBinding' ||
		def.node.type !== 'ImportNamespaceSpecifier'
	) {
		return null;
	}

	const specifier = getModuleSpecifier(def.parent.source);

	return {
		kind: 'import',
		source: { specifier, exportName: tag.slice(dot + 1) }
	};
};