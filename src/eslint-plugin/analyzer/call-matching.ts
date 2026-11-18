import type {
	CallExpression,
	Expression,
	Node,
	ObjectExpression,
	SpreadElement
} from 'estree';
import { CONFIG_KEYS } from './config-keys.ts';
import { getStrictPropertiesWithKeys } from './properties.ts';

export type CallMatch = {
	config: ObjectExpression | null;
	args: ReadonlyArray<Expression | SpreadElement>;
	isFactoryConfig: boolean;
	// True for an `sv()` class list whose argument before the last reads as a
	// config: removing the last would turn the call into a config call.
	keepsLastArg: boolean;
};

// Reads a node through same-file `const` bindings, from whichever scope the
// caller's context assigns it.
type ResolveNode = (node: Node) => Node;

/** Whether `node` is the last argument `call` is passed. */
export const isLastArgument = (call: CallExpression, node: Node): boolean =>
	call.arguments.at(-1) === node;

/**
 * A config-less, non-factory `sv()`/`cn()` call: a class list in its own
 * right rather than a variant function or a factory.
 */
export const isClassListMatch = (call: CallMatch): boolean =>
	!call.isFactoryConfig && call.config === null;

// Resolves the last arg through hoisted `const` bindings so
// `const config = {...}; sv(config)` is analyzed as a config
// call rather than a cn-style argument list.
export const matchSvCall = (
	node: CallExpression,
	resolve: ResolveNode
): CallMatch => {
	const args = node.arguments;
	const last = args.at(-1);

	if (last) {
		const resolved = resolve(last);

		if (isConfigLike(resolved)) {
			return {
				config: resolved,
				args: args.slice(0, -1),
				isFactoryConfig: false,
				keepsLastArg: false
			};
		}
	}

	const beforeLast = args.at(-2);

	return {
		config: null,
		args,
		isFactoryConfig: false,
		keepsLastArg:
			beforeLast !== undefined && isConfigLike(resolve(beforeLast))
	};
};

// An object holding only config keys.
const isConfigLike = (node: Node): node is ObjectExpression => {
	if (node.type !== 'ObjectExpression') {
		return false;
	}

	// An empty object is a config too, as `sv()` reads it at runtime: a
	// variant function with nothing configured.
	if (node.properties.length === 0) {
		return true;
	}

	const isConfigKey = (key: string) => CONFIG_KEYS.has(key);

	return getStrictPropertiesWithKeys(node, isConfigKey) !== null;
};