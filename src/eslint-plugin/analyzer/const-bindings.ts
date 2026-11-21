import type { AST, Scope, SourceCode } from 'eslint';
import type { ArrayExpression, Identifier, Node } from 'estree';
import { getKeyName } from './config-keys.ts';

// A node that only wraps another expression without changing its value.
type TransparentWrapper = Node & { expression: Node };

// A name's variable, its single definition, and the scope that declares it.
type SingleBinding = {
	variable: Scope.Variable;
	def: Scope.Definition;
	scope: Scope.Scope;
};

type VariableSet = Set<Scope.Variable>;

/** A name destructured off a value: the value, and the key it reads. */
export type DestructuredRead = { object: Node; key: string };

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

// The variables whose values read each variable; kept per variable, as every
// read of it asks.
const dependentVariables = new WeakMap<
	Scope.Variable,
	ReadonlySet<Scope.Variable>
>();

/** Whether `node` is a type-only or optional-chain wrapper of another. */
export const isTransparentWrapper = (node: {
	type: string;
}): node is TransparentWrapper =>
	TRANSPARENT_WRAPPER_TYPES.has(node.type) && 'expression' in node;

// The expression a chain of transparent wrappers stands for: `x as const`,
// `x satisfies T` and `x!` are read as `x`.
export const unwrapExpression = (node: Node): Node => {
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

/** Whether `node` is written in a Vue template expression. */
export const isInTemplate = (node: Node, sourceCode: SourceCode): boolean =>
	findTemplateContainer(node, sourceCode) !== null;

// The innermost scope the program node owns — the module scope holding the
// file's own bindings, rather than the global one `getScope()` hands back for
// a Program.
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

// Whether a definition the TypeScript parser records declares no value of its
// own: a type alias, interface or type parameter, a function overload
// signature, or a namespace, which only adds members to what it merges with.
// Read as strings, as ESLint's own types list none of these kinds.
const isTypeOnlyDef = (def: Scope.Definition): boolean => {
	const kind: string = def.type;
	const nodeType: string = def.node.type;

	return (
		kind === 'Type' ||
		kind === 'TSModuleName' ||
		nodeType === 'TSDeclareFunction'
	);
};

// The one value definition `name` resolves to, with the scope it's declared
// in, or null when it's unbound or declared more than once. A type sharing the
// name (`type Size = keyof typeof Size`) doesn't count as another declaration.
export const findSingleBinding = (
	scope: Scope.Scope,
	name: string
): SingleBinding | null => {
	const variable = findVariable(scope, name);

	if (!variable) {
		return null;
	}

	const [def, extra] = variable.defs.filter((item) => !isTypeOnlyDef(item));

	// A global has no definition, a redeclared name more than one
	if (def === undefined || extra !== undefined) {
		return null;
	}

	return { variable, def, scope: variable.scope };
};

const isRangeWithin = (
	[start, end]: AST.Range,
	[containerStart, containerEnd]: AST.Range
): boolean => start >= containerStart && end <= containerEnd;

// Whether `def` declares a variable with an initializer written around `range`.
const hasInitializerAround = (
	def: Scope.Definition,
	range: AST.Range,
	sourceCode: SourceCode
): boolean => {
	if (def.type !== 'Variable' || !def.node.init) {
		return false;
	}

	return isRangeWithin(range, sourceCode.getRange(def.node.init));
};

// Adds to `readers` each variable whose initializer evaluates what's written
// at `range` in the scope `from`: one declared around it, up to the nearest
// function, whose body runs later.
const addReaders = (
	range: AST.Range,
	from: Scope.Scope,
	sourceCode: SourceCode,
	readers: VariableSet
) => {
	let scope: Scope.Scope | null = from;

	while (scope) {
		for (const variable of scope.variables) {
			const isReader = variable.defs.some((def) =>
				hasInitializerAround(def, range, sourceCode)
			);

			if (isReader) {
				readers.add(variable);
			}
		}

		if (scope.type === 'function') {
			return;
		}

		scope = scope.upper;
	}
};

const addVariableReaders = (
	variable: Scope.Variable,
	sourceCode: SourceCode,
	readers: VariableSet
) => {
	for (const reference of variable.references) {
		const { range } = reference.identifier;

		/* c8 ignore next 3 -- every parsed node has a range */
		if (!range) {
			continue;
		}

		addReaders(range, reference.from, sourceCode, readers);
	}
};

// The variables whose values read `variable` as they're evaluated, straight
// (`const a = [variable]`) or through other values.
const getDependents = (
	variable: Scope.Variable,
	sourceCode: SourceCode
): ReadonlySet<Scope.Variable> => {
	const known = dependentVariables.get(variable);

	if (known) {
		return known;
	}

	const dependents: VariableSet = new Set();

	addVariableReaders(variable, sourceCode, dependents);

	// A set also iterates the items added along the way.
	for (const dependent of dependents) {
		addVariableReaders(dependent, sourceCode, dependents);
	}

	dependentVariables.set(variable, dependents);

	return dependents;
};

// Whether reading `variable` at `node` closes a cycle: `node` is written in
// its own value (`const a = [a]`), or in a value its own reads
// (`const a = [b]; const b = [a]`).
const closesCycle = (
	node: Identifier,
	variable: Scope.Variable,
	scope: Scope.Scope,
	sourceCode: SourceCode
): boolean => {
	const readers: VariableSet = new Set();

	addReaders(sourceCode.getRange(node), scope, sourceCode, readers);

	for (const reader of readers) {
		if (
			reader === variable ||
			getDependents(reader, sourceCode).has(variable)
		) {
			return true;
		}
	}

	return false;
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

/**
 * The value and key a `const { key: name } = value` definition binds `name`
 * to. Null for any other definition, and for a name a nested pattern, a
 * default value, a rest element or a computed key binds.
 */
export const getDestructuredRead = (
	node: Identifier,
	sourceCode: SourceCode
): DestructuredRead | null => {
	const scope = getLookupScope(node, sourceCode);

	if (scope === null) {
		return null;
	}

	const binding = findSingleBinding(scope, node.name);

	if (binding === null) {
		return null;
	}

	const { def } = binding;

	if (
		def.type !== 'Variable' ||
		def.parent.kind !== 'const' ||
		def.node.id.type !== 'ObjectPattern' ||
		!def.node.init
	) {
		return null;
	}

	for (const property of def.node.id.properties) {
		if (
			property.type === 'Property' &&
			property.value.type === 'Identifier' &&
			property.value.name === node.name
		) {
			const key = getKeyName(property);

			if (key === null) {
				return null;
			}

			return { object: unwrapExpression(def.node.init), key };
		}
	}

	return null;
};

// Follows `const` bindings from `node` to the value it names. A read that
// closes a reference cycle ends it, as following that one would never end;
// with `entersCycle`, only from the second binding on.
const followConstBindings = (
	node: Node,
	sourceCode: SourceCode,
	entersCycle: boolean
): Node => {
	let current = unwrapExpression(node);
	let guarded = !entersCycle;

	while (current.type === 'Identifier') {
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

		if (
			guarded &&
			closesCycle(current, binding.variable, scope, sourceCode)
		) {
			return current;
		}

		guarded = true;
		current = init;
	}

	return current;
};

// Follows `const` bindings so a hoisted constant (`const base = 'flex'`) is
// analyzed as its value. Returns the original node when it doesn't resolve to
// a readable const, or when reading it there closes a reference cycle
// (`const list = ['flex', list]`).
export const resolveStaticValue = (node: Node, sourceCode: SourceCode): Node =>
	followConstBindings(node, sourceCode, false);

// Like `resolveStaticValue`, but a `const` is read even where that closes a
// cycle (`const a = { ...a }`), for a caller that tracks the values it has
// entered and stops at one itself.
export const resolveEnteredValue = (node: Node, sourceCode: SourceCode): Node =>
	followConstBindings(node, sourceCode, true);

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
): boolean =>
	isRangeWithin(sourceCode.getRange(node), sourceCode.getRange(container));