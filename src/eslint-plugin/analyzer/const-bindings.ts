import type { Scope, SourceCode } from 'eslint';
import type { Node } from 'estree';

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

// The initializer of a single same-file `const name = <value>` binding, or null
// for anything we can't safely read through: let/var, redeclarations, imports,
// function parameters, and destructuring patterns.
const getConstBindingInit = (variable: Scope.Variable | null): Node | null => {
	if (!variable || variable.defs.length !== 1) {
		return null;
	}

	const [def] = variable.defs;

	/* c8 ignore next 3 -- a length-1 defs array always has a first element */
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

	return init;
};

// Follows `const` bindings so a hoisted constant (`const base = 'flex'`) is
// analyzed as its value. Returns the original node when it doesn't resolve to
// a readable const, or the node that closes a reference cycle.
export const resolveStaticValue = (
	node: Node,
	sourceCode: SourceCode
): Node => {
	let current = node;
	const seen = new Set<Node>();

	while (current.type === 'Identifier') {
		if (seen.has(current)) {
			return current;
		}

		seen.add(current);

		const init = getConstBindingInit(
			findVariable(sourceCode.getScope(current), current.name)
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
	if (node.type !== 'Identifier') {
		return resolveStaticValue(node, sourceCode);
	}

	const init = getConstBindingInit(findVariable(scope, node.name));

	if (init === null) {
		return node;
	}

	// The initializer lives in the script, where ordinary scope resolution
	// applies again.
	return resolveStaticValue(init, sourceCode);
};