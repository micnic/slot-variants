import type { SourceCode } from 'eslint';
import type {
	CallExpression,
	Expression,
	Node,
	ObjectExpression,
	SpreadElement
} from 'estree';
import { resolveStaticValue } from './const-bindings.ts';
import { getConfigProperties } from './properties.ts';
import { isDefinedValue } from './static-predicates.ts';
import type { InternalStyles } from './styled-values.ts';

/**
 * A `createSV()` factory imported from another module: the keys its defaults
 * set, or null when they can't all be read, whether they make every variant
 * required, and the classes of their `base`, null when they set none.
 */
export type ImportedFactory = {
	defaultKeys: ReadonlySet<string> | null;
	requiresAll: boolean;
	base: InternalStyles | null;
};

export type CallMatch = {
	config: ObjectExpression | null;
	args: ReadonlyArray<Expression | SpreadElement>;
	isFactoryConfig: boolean;
	// True for an `sv()` class list whose argument before the last reads as a
	// config: removing the last would turn the call into a config call.
	keepsLastArg: boolean;
	// Set for a call through a factory imported from another module.
	imported?: ImportedFactory;
};

/** Which of the keys that make an object `sv()`'s config it defines. */
export type ConfigMarkers = { slots: boolean; variants: boolean };

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
	sourceCode: SourceCode
): CallMatch => {
	const resolve = (value: Node) => resolveStaticValue(value, sourceCode);
	const args = node.arguments;
	const last = args.at(-1);

	if (last) {
		const resolved = resolve(last);

		if (isConfigLike(resolved, sourceCode)) {
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
			beforeLast !== undefined &&
			isConfigLike(resolve(beforeLast), sourceCode)
	};
};

/**
 * Whether an object defines `slots` and `variants`, the keys that make it
 * `sv()`'s config: a property left `undefined` defines nothing, and one an
 * object literal it spreads holds counts too.
 */
export const getConfigMarkers = (
	node: ObjectExpression,
	sourceCode: SourceCode
): ConfigMarkers => {
	const properties = getConfigProperties(node, sourceCode);
	const defines = (key: string) =>
		isDefinedValue(properties.get(key), (value) =>
			resolveStaticValue(value, sourceCode)
		);

	return { slots: defines('slots'), variants: defines('variants') };
};

// An object defining `slots` or `variants`, as `sv()` tells its config apart
// from a class record.
const isConfigLike = (
	node: Node,
	sourceCode: SourceCode
): node is ObjectExpression => {
	if (node.type !== 'ObjectExpression') {
		return false;
	}

	const { slots, variants } = getConfigMarkers(node, sourceCode);

	return slots || variants;
};