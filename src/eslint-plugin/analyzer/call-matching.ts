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
	// True only for a `createSV(defaults)` factory call —
	// it compiles no variant function, so it's exempt from
	// require-top-level-config and the empty-call check.
	isFactoryConfig: boolean;
};

// Reads a node through same-file `const` bindings, from whichever scope the
// caller's context assigns it.
type ResolveNode = (node: Node) => Node;

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
	const last = args[args.length - 1];

	if (last) {
		const resolved = resolve(last);

		if (isConfigLike(resolved)) {
			return {
				config: resolved,
				args: args.slice(0, -1),
				isFactoryConfig: false
			};
		}
	}

	return { config: null, args, isFactoryConfig: false };
};

const isConfigLike = (node: Node | undefined): node is ObjectExpression =>
	getStrictPropertiesWithKeys(node, (key) => CONFIG_KEYS.has(key)) !== null;