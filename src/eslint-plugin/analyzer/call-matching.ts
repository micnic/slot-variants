import type { SourceCode } from 'eslint';
import type {
	CallExpression,
	Expression,
	Node,
	ObjectExpression,
	SpreadElement
} from 'estree';
import { CONFIG_KEYS } from './config-keys.ts';
import { resolveStaticValue } from './const-bindings.ts';
import { getStrictProperties } from './properties.ts';

export type CallMatch = {
	config: ObjectExpression | null;
	args: ReadonlyArray<Expression | SpreadElement>;
	// True only for a `createSV(defaults)` factory call — it compiles no variant
	// function, so it's exempt from require-top-level-config and the empty-call check.
	isFactoryConfig?: boolean;
};

// Resolves the last arg through hoisted `const` bindings so `const config = {...};
// sv(config)` is analyzed as a config call rather than a cn-style argument list.
export const matchSvCall = (
	node: CallExpression,
	sourceCode: SourceCode
): CallMatch => {
	const args = node.arguments;
	const last = args[args.length - 1];

	if (!last) {
		return { config: null, args };
	}

	const resolved = resolveStaticValue(last, sourceCode);

	if (!isConfigLike(resolved)) {
		return { config: null, args };
	}

	return { config: resolved, args: args.slice(0, -1) };
};

export const matchCnCall = (node: CallExpression): CallMatch => ({
	config: null,
	args: node.arguments
});

// The local names each tracked export is reachable under, plus the locals bound
// to a whole-module namespace import.
export type TrackedNames = {
	svNames: Set<string>;
	cnNames: Set<string>;
	createSvNames: Set<string>;
	namespaceNames: Set<string>;
};

export const matchSvCnCall = (
	node: CallExpression,
	calleeName: string,
	{ svNames, cnNames }: TrackedNames,
	sourceCode: SourceCode
): CallMatch | null => {
	if (svNames.has(calleeName)) {
		return matchSvCall(node, sourceCode);
	}

	if (cnNames.has(calleeName)) {
		return matchCnCall(node);
	}

	return null;
};

const hasOnlyConfigKeys = (properties: ReadonlyMap<string, Node>): boolean => {
	for (const key of properties.keys()) {
		if (!CONFIG_KEYS.has(key)) {
			return false;
		}
	}

	return true;
};

const isConfigLike = (node: Node | undefined): node is ObjectExpression => {
	const properties = getStrictProperties(node);

	if (!properties || properties.size === 0) {
		return false;
	}

	return hasOnlyConfigKeys(properties);
};