import type { Scope, SourceCode } from 'eslint';
import type { Node } from 'estree';

// A node that only wraps another expression without changing its value.
type TransparentWrapper = Node & { expression: Node };

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
export const unwrapExpression = (node: Node): Node => {
	let current = node;

	while (isTransparentWrapper(current)) {
		current = current.expression;
	}

	return current;
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

// The one definition `name` resolves to, or null when it's unbound or
// declared more than once.
export const findSingleDef = (
	scope: Scope.Scope,
	name: string
): Scope.Definition | null => {
	const variable = findVariable(scope, name);

	if (!variable || variable.defs.length !== 1) {
		return null;
	}

	const [def] = variable.defs;

	/* c8 ignore next -- a length-1 defs array always has a first element */
	return def ?? null;
};

// The initializer of a single same-file `const name = <value>` binding, or null
// for anything we can't safely read through: let/var, redeclarations, imports,
// function parameters, and destructuring patterns.
const getConstBindingInit = (scope: Scope.Scope, name: string): Node | null =>
	getConstDefInit(findSingleDef(scope, name));

// The initializer of a `const name = <value>` definition, or null for any other
// kind of definition, including a destructuring pattern.
export const getConstDefInit = (def: Scope.Definition | null): Node | null => {
	if (!def) {
		return null;
	}

	if (def.type !== 'Variable' || def.parent.kind !== 'const') {
		return null;
	}

	if (def.node.id.type !== 'Identifier') {
		return null;
	}

	const { init } = def.node;

	/* c8 ignore next 3 -- a const declarator always has an initializer */
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

		const init = getConstBindingInit(
			sourceCode.getScope(current),
			current.name
		);

		if (!init) {
			return current;
		}

		current = init;
	}

	return current;
};

// Resolves an identifier against a fixed scope instead of the one it sits in.
// Vue template expressions live in a scope of their own that never reaches the
// `<script>` bindings they name, so the script's module scope is passed in.
export const resolveStaticValueFrom = (
	node: Node,
	sourceCode: SourceCode,
	scope: Scope.Scope
): Node => {
	const unwrapped = unwrapExpression(node);

	if (unwrapped.type !== 'Identifier') {
		return resolveStaticValue(unwrapped, sourceCode);
	}

	const init = getConstBindingInit(scope, unwrapped.name);

	if (init === null) {
		return unwrapped;
	}

	// The initializer lives in the script, where ordinary scope resolution
	// applies again.
	return resolveStaticValue(init, sourceCode);
};