import type { Scope, SourceCode } from 'eslint';
import type { ArrayExpression, Identifier, Node } from 'estree';

// A node that only wraps another expression without changing its value.
type TransparentWrapper = Node & { expression: Node };

// A name's single definition, and the scope that declares it.
type SingleBinding = { def: Scope.Definition; scope: Scope.Scope };

// A name a Vue template expression reads, as vue-eslint-parser records it on
// the expression's container: the identifier, and the template variable
// (`v-for`, `v-slot`) that binds it, or null when the `<script>` does.
type TemplateReference = { id: object; variable: object | null };

// The structural minimum to walk a node's ancestors, across the ESTree and Vue
// template node kinds alike.
type ParentedNode = {
	type: string;
	parent?: ParentedNode | null;
	references?: ReadonlyArray<TemplateReference>;
};

type TemplateContainer = ParentedNode & {
	references: ReadonlyArray<TemplateReference>;
};

// Type-only wrappers (`as`, `satisfies`, `!`, `<T>`), which the TypeScript
// parser adds and ESTree's own node types don't list, and the optional-chain
// wrapper around `a?.b` / `a?.()`.
const TRANSPARENT_WRAPPER_TYPES: ReadonlySet<string> = new Set([
	'ChainExpression',
	'TSAsExpression',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion'
]);

const isTransparentWrapper = (node: Node): node is TransparentWrapper =>
	TRANSPARENT_WRAPPER_TYPES.has(node.type) && 'expression' in node;

// The expression a chain of transparent wrappers stands for: `x as const`,
// `x satisfies T` and `x!` are read as `x`.
const unwrapExpression = (node: Node): Node => {
	let current = node;

	while (isTransparentWrapper(current)) {
		current = current.expression;
	}

	return current;
};

const isTemplateContainer = (node: ParentedNode): node is TemplateContainer =>
	node.type === 'VExpressionContainer' && node.references !== undefined;

// The Vue template expression container `node` sits in, or null outside a Vue
// template (any other file only pays for the parser-services check).
const findTemplateContainer = (
	node: ParentedNode,
	sourceCode: SourceCode
): TemplateContainer | null => {
	if (
		typeof sourceCode.parserServices.defineTemplateBodyVisitor !==
		'function'
	) {
		return null;
	}

	let current = node.parent;

	while (current) {
		if (isTemplateContainer(current)) {
			return current;
		}

		current = current.parent;
	}

	return null;
};

export const getModuleScope = (sourceCode: SourceCode): Scope.Scope =>
	/* c8 ignore next -- a Program node always owns a scope */
	sourceCode.scopeManager.acquire(sourceCode.ast, true) ??
	sourceCode.getScope(sourceCode.ast);

/**
 * The scope a name read at `node` is looked up from. A Vue template expression
 * gets a scope of its own that never reaches the `<script>` bindings it names,
 * so it reads the script's module scope instead — unless the template itself
 * binds the name (`v-for`, `v-slot`), which is null: nothing it can be
 * resolved to statically.
 */
export const getLookupScope = (
	node: Node,
	sourceCode: SourceCode
): Scope.Scope | null => {
	const container = findTemplateContainer(node, sourceCode);

	if (container === null) {
		return sourceCode.getScope(node);
	}

	const isTemplateBound = container.references.some(
		(reference) => reference.id === node && reference.variable !== null
	);

	if (isTemplateBound) {
		return null;
	}

	return getModuleScope(sourceCode);
};

// Walks outward so shadowing is respected.
export const findVariable = (
	scope: Scope.Scope,
	name: string
): Scope.Variable | null => {
	let current: Scope.Scope | null = scope;

	while (current) {
		const variable = current.set.get(name);

		if (variable) {
			return variable;
		}

		current = current.upper;
	}

	return null;
};

// The variable an identifier reads, looked up as `getLookupScope` describes.
// Null when nothing binds it, or a Vue template does.
export const findLookupVariable = (
	node: Identifier,
	sourceCode: SourceCode
): Scope.Variable | null => {
	const scope = getLookupScope(node, sourceCode);

	if (scope === null) {
		return null;
	}

	return findVariable(scope, node.name);
};

// The innermost scope the program node owns — the module scope holding the
// file's own bindings, rather than the global one `getScope()` hands back for
// a Program.

// The one definition `name` resolves to, with the scope it's declared in, or
// null when it's unbound or declared more than once.
export const findSingleBinding = (
	scope: Scope.Scope,
	name: string
): SingleBinding | null => {
	const variable = findVariable(scope, name);

	if (!variable) {
		return null;
	}

	const [def, extra] = variable.defs;

	// A global has no definition, a redeclared name more than one
	if (def === undefined || extra !== undefined) {
		return null;
	}

	return { def, scope: variable.scope };
};

// The initializer of a `const name = <value>` definition, or null for any other
// kind of definition — let/var, imports, function parameters — and for a
// destructuring pattern.
export const getConstDefInit = (def: Scope.Definition): Node | null => {
	if (def.type !== 'Variable' || def.parent.kind !== 'const') {
		return null;
	}

	if (def.node.id.type !== 'Identifier') {
		return null;
	}

	const { init } = def.node;

	// An ambient `declare const` has a type but no value to read
	if (!init) {
		return null;
	}

	return unwrapExpression(init);
};

// Follows `const` bindings so a hoisted constant (`const base = 'flex'`) is
// analyzed as its value. Returns the original node when it doesn't resolve to
// a readable const, or the node that closes a reference cycle.
export const resolveStaticValue = (
	node: Node,
	sourceCode: SourceCode
): Node => {
	let current = unwrapExpression(node);
	const seen = new Set<Node>();

	while (current.type === 'Identifier') {
		if (seen.has(current)) {
			return current;
		}

		seen.add(current);

		const scope = getLookupScope(current, sourceCode);

		if (scope === null) {
			return current;
		}

		const binding = findSingleBinding(scope, current.name);

		if (binding === null) {
			return current;
		}

		const init = getConstDefInit(binding.def);

		if (!init) {
			return current;
		}

		current = init;
	}

	return current;
};

// A config container (`variants`, a variant's value record, a compound array,
// …) read through `const` bindings, like a class value is. Undefined stays
// undefined, for a config key that isn't set.
export const resolveContainer = (
	node: Node | undefined,
	sourceCode: SourceCode
): Node | undefined => {
	if (node === undefined) {
		return undefined;
	}

	return resolveStaticValue(node, sourceCode);
};

// A list config value (`compoundVariants`, a group's slots, …) read through
// `const` bindings, or null when it's unset or not an array literal.
export const resolveArray = (
	node: Node | undefined,
	sourceCode: SourceCode
): ArrayExpression | null => {
	const list = resolveContainer(node, sourceCode);

	if (list === undefined || list.type !== 'ArrayExpression') {
		return null;
	}

	return list;
};

// Whether `node` is written inside `container`, rather than in a `const`
// declared elsewhere that other code may share.
export const isWithinNode = (
	sourceCode: SourceCode,
	node: Node,
	container: Node
): boolean => {
	const [start, end] = sourceCode.getRange(node);
	const [containerStart, containerEnd] = sourceCode.getRange(container);

	return start >= containerStart && end <= containerEnd;
};