import type { Rule, SourceCode } from 'eslint';
import type {
	Expression,
	Literal,
	Node,
	ObjectExpression,
	Property,
	SpreadElement
} from 'estree';

const CONFIG_KEYS = new Set([
	'base',
	'variants',
	'slots',
	'compoundVariants',
	'compoundSlots',
	'defaultVariants',
	'requiredVariants',
	'presets',
	'cacheSize',
	'postProcess',
	'introspection'
]);

// Returns the statically-known key name of a Property node, or null when it
// can't be determined (computed key). For non-computed keys the parser only
// emits Identifier or Literal(string|number), so those are the two cases we
// handle.
const getKeyName = (prop: Property): string | null => {
	if (prop.computed) {
		return null;
	}

	const { key } = prop;

	if (key.type === 'Identifier') {
		return key.name;
	}

	return String((key as Literal).value);
};

const getOrCreate = <K, V>(map: Map<K, V>, key: K, make: () => V): V => {
	const existing = map.get(key);

	if (existing !== undefined) {
		return existing;
	}

	const created = make();

	map.set(key, created);

	return created;
};

const getProperties = (obj: Node | undefined): Map<string, Node> => {
	const map = new Map<string, Node>();

	if (!obj || obj.type !== 'ObjectExpression') {
		return map;
	}

	for (const prop of obj.properties) {
		if (prop.type !== 'Property') {
			continue;
		}

		const key = getKeyName(prop);

		if (key !== null) {
			map.set(key, prop.value);
		}
	}

	return map;
};

// Returns true when every property of `node` has a statically-known key that
// names a slot (or 'base'). This is the shape a variant uses when written as
// boolean shorthand — `{ rounded: { root: '...', icon: '...' } }` — as opposed
// to a value-keyed variant like `{ size: { sm: '...', md: '...' } }`.
const isSlotKeyedShorthand = (node: Node, slotNames: Set<string>): boolean => {
	if (
		node.type !== 'ObjectExpression' ||
		node.properties.length === 0 ||
		slotNames.size === 0
	) {
		return false;
	}

	for (const prop of node.properties) {
		if (prop.type !== 'Property') {
			return false;
		}

		const key = getKeyName(prop);

		if (key === null || (key !== 'base' && !slotNames.has(key))) {
			return false;
		}
	}

	return true;
};

const isConfigLike = (node: Node | undefined): node is ObjectExpression => {
	if (!node || node.type !== 'ObjectExpression') {
		return false;
	}

	if (node.properties.length === 0) {
		return false;
	}

	for (const prop of node.properties) {
		if (prop.type !== 'Property') {
			return false;
		}

		const key = getKeyName(prop);

		if (key === null || !CONFIG_KEYS.has(key)) {
			return false;
		}
	}
	return true;
};

type Source =
	| { kind: 'base' }
	| { kind: 'variant'; key: string; value: string }
	| { kind: 'compound' };

// Shared instances for the parameterless source kinds. Nothing mutates Source
// values, so all call sites that emit a 'base' or 'compound' entry can point
// at the same object instead of allocating a fresh literal per token.
const baseSource: Source = { kind: 'base' };
const compoundSource: Source = { kind: 'compound' };

type Entry = {
	source: Source;
	slot: string;
	token: string;
	start: number;
	end: number;
};

// Returns true when the entries in `list` cannot collide at runtime: they all
// come from different values of a single variant key, so slot-variants will
// only ever pick one of them on any given render. Any other shape — a base
// class, a compound, or tokens from two different variant keys — means they
// *will* co-occur, and the token is a real duplicate.
const isMutuallyExclusiveVariants = (list: Entry[]): boolean => {
	const seenValues = new Set<string>();
	let sharedKey: string | null = null;

	for (const entry of list) {
		if (entry.source.kind !== 'variant') {
			return false;
		}

		if (sharedKey === null) {
			sharedKey = entry.source.key;
		} else if (sharedKey !== entry.source.key) {
			return false;
		}

		if (seenValues.has(entry.source.value)) {
			return false;
		}

		seenValues.add(entry.source.value);
	}

	return true;
};

const pushStringLiteralTokens = (
	node: Node,
	slot: string,
	source: Source,
	entries: Entry[],
	sourceCode: SourceCode
): void => {
	const { range } = node;

	/* c8 ignore next 3 -- ESLint always populates range on parsed nodes */
	if (!range) {
		return;
	}

	// Both string literals and template literals (without expressions) use a
	// single-character opening delimiter (', ", or `), so range[0] + 1 is the
	// absolute index of the first inner character, and slicing the delimiters
	// off the raw text yields the token-bearing content.
	const raw = sourceCode.getText(node);
	const inner = raw.slice(1, -1);
	const base = range[0] + 1;

	for (const match of inner.matchAll(/\S+/g)) {
		const token = match[0];
		const start = base + match.index;
		const end = start + token.length;

		entries.push({
			source,
			slot,
			token,
			start,
			end
		});
	}
};

const extractTokens = (
	node: Node,
	slot: string,
	source: Source,
	slotNames: Set<string>,
	entries: Entry[],
	sourceCode: SourceCode
): void => {
	if (node.type === 'Literal') {
		if (typeof node.value === 'string') {
			pushStringLiteralTokens(node, slot, source, entries, sourceCode);
		}

		return;
	}

	if (node.type === 'TemplateLiteral') {
		if (node.expressions.length === 0) {
			pushStringLiteralTokens(node, slot, source, entries, sourceCode);
		}

		return;
	}

	if (node.type === 'ArrayExpression') {
		for (const element of node.elements) {
			if (!element || element.type === 'SpreadElement') {
				continue;
			}

			extractTokens(
				element,
				slot,
				source,
				slotNames,
				entries,
				sourceCode
			);
		}

		return;
	}

	if (node.type !== 'ObjectExpression') {
		return;
	}

	// Only analyze as slot-keyed object when every key matches a slot name.
	// Otherwise it's a cn-style record and we can't statically determine
	// which keys are active, so skip.
	if (!isSlotKeyedShorthand(node, slotNames)) {
		return;
	}

	for (const [key, value] of getProperties(node)) {
		extractTokens(value, key, source, slotNames, entries, sourceCode);
	}
};

const analyzeConfig = (
	context: Rule.RuleContext,
	configNode: Node,
	baseArgs: Array<Expression | SpreadElement>
): void => {
	const { sourceCode } = context;
	const config = getProperties(configNode);
	const base = config.get('base');
	const variants = config.get('variants');
	const slots = config.get('slots');
	const compoundVariants = config.get('compoundVariants');
	const compoundSlots = config.get('compoundSlots');

	const slotsMap = getProperties(slots);
	const slotNames = new Set(slotsMap.keys());

	// 'base' is a reserved key meaning "default slot", not a slot name.
	slotNames.delete('base');

	const entries: Entry[] = [];
	const extract = (node: Node, slot: string, source: Source): void => {
		extractTokens(node, slot, source, slotNames, entries, sourceCode);
	};

	for (const [slotKey, slotValue] of slotsMap.entries()) {
		extract(slotValue, slotKey, baseSource);
	}

	for (const arg of baseArgs) {
		extract(arg, 'base', baseSource);
	}

	if (base) {
		extract(base, 'base', baseSource);
	}

	const variantsMap = getProperties(variants);

	for (const [variantKey, variantValue] of variantsMap.entries()) {
		const isValueKeyed =
			variantValue.type === 'ObjectExpression' &&
			!isSlotKeyedShorthand(variantValue, slotNames);

		if (!isValueKeyed) {
			extract(variantValue, 'base', {
				kind: 'variant',
				key: variantKey,
				value: 'true'
			});
			continue;
		}

		for (const [valueKey, valueNode] of getProperties(variantValue)) {
			extract(valueNode, 'base', {
				kind: 'variant',
				key: variantKey,
				value: valueKey
			});
		}
	}

	if (compoundVariants && compoundVariants.type === 'ArrayExpression') {
		for (const element of compoundVariants.elements) {
			if (!element || element.type !== 'ObjectExpression') {
				continue;
			}

			const compound = getProperties(element);
			const cls = compound.get('class') ?? compound.get('className');

			if (cls) {
				extract(cls, 'base', compoundSource);
			}
		}
	}

	if (compoundSlots && compoundSlots.type === 'ArrayExpression') {
		for (const element of compoundSlots.elements) {
			if (!element || element.type !== 'ObjectExpression') {
				continue;
			}

			const compound = getProperties(element);
			const cls = compound.get('class') ?? compound.get('className');
			const targetSlots = compound.get('slots');

			if (
				!cls ||
				!targetSlots ||
				targetSlots.type !== 'ArrayExpression'
			) {
				continue;
			}

			for (const slotEl of targetSlots.elements) {
				if (!slotEl || slotEl.type !== 'Literal') {
					continue;
				}

				if (typeof slotEl.value !== 'string') {
					continue;
				}

				extract(cls, slotEl.value, compoundSource);
			}
		}
	}

	const bySlot = new Map<string, Map<string, Entry[]>>();

	for (const entry of entries) {
		const tokenMap = getOrCreate(
			bySlot,
			entry.slot,
			() => new Map<string, Entry[]>()
		);
		const list = getOrCreate(tokenMap, entry.token, () => []);

		list.push(entry);
	}

	for (const [slotKey, tokenMap] of bySlot.entries()) {
		for (const [token, list] of tokenMap.entries()) {
			if (list.length < 2 || isMutuallyExclusiveVariants(list)) {
				continue;
			}

			for (const entry of list) {
				context.report({
					loc: {
						start: sourceCode.getLocFromIndex(entry.start),
						end: sourceCode.getLocFromIndex(entry.end)
					},
					messageId: 'duplicate',
					data: { token, slot: slotKey }
				});
			}
		}
	}
};

const analyzeCnCall = (
	context: Rule.RuleContext,
	args: ReadonlyArray<Expression | SpreadElement>
): void => {
	const { sourceCode } = context;
	const entries: Entry[] = [];
	const slotNames = new Set<string>();

	for (const arg of args) {
		extractTokens(arg, 'base', baseSource, slotNames, entries, sourceCode);
	}

	const tokenMap = new Map<string, Entry[]>();

	for (const entry of entries) {
		const list = getOrCreate(tokenMap, entry.token, () => []);

		list.push(entry);
	}

	for (const [token, list] of tokenMap.entries()) {
		if (list.length < 2) {
			continue;
		}

		for (const entry of list) {
			context.report({
				loc: {
					start: sourceCode.getLocFromIndex(entry.start),
					end: sourceCode.getLocFromIndex(entry.end)
				},
				messageId: 'duplicateCn',
				data: { token }
			});
		}
	}
};

// Reports `node` as a dynamic value the static analyzer cannot infer.
const reportDynamic = (context: Rule.RuleContext, node: Node): void => {
	context.report({ node, messageId: 'dynamic' });
};

// Validates that `node` is a string-only class value: a string Literal, a
// TemplateLiteral with no expressions, or an ArrayExpression of those (with
// sparse holes allowed). Anything else — identifiers, member access, calls,
// spreads, non-string literals, templates with expressions, object records —
// is reported.
const checkClassValueIsStatic = (
	context: Rule.RuleContext,
	node: Node
): void => {
	if (node.type === 'Literal') {
		if (typeof node.value !== 'string') {
			reportDynamic(context, node);
		}

		return;
	}

	if (node.type === 'TemplateLiteral') {
		if (node.expressions.length > 0) {
			reportDynamic(context, node);
		}

		return;
	}

	if (node.type === 'ArrayExpression') {
		for (const element of node.elements) {
			if (!element) {
				continue;
			}

			if (element.type === 'SpreadElement') {
				reportDynamic(context, element);
				continue;
			}

			checkClassValueIsStatic(context, element);
		}

		return;
	}

	reportDynamic(context, node);
};

// Validates that `node` is an ObjectExpression where every property has a
// statically-known key (no spreads, no computed keys) and every value is a
// static class value. Used for `slots` and for variant value records.
const checkClassValueRecord = (
	context: Rule.RuleContext,
	node: Node
): void => {
	if (node.type !== 'ObjectExpression') {
		reportDynamic(context, node);
		return;
	}

	for (const prop of node.properties) {
		if (prop.type === 'SpreadElement') {
			reportDynamic(context, prop);
			continue;
		}

		if (prop.computed) {
			reportDynamic(context, prop.key);
			continue;
		}

		checkClassValueIsStatic(context, prop.value);
	}
};

// Validates the `variants` config field — an ObjectExpression where each
// variant value is either a record of value-keyed class strings or a class
// value (boolean shorthand).
const checkVariants = (context: Rule.RuleContext, node: Node): void => {
	if (node.type !== 'ObjectExpression') {
		reportDynamic(context, node);
		return;
	}

	for (const prop of node.properties) {
		if (prop.type === 'SpreadElement') {
			reportDynamic(context, prop);
			continue;
		}

		if (prop.computed) {
			reportDynamic(context, prop.key);
			continue;
		}

		const { value } = prop;

		if (value.type === 'ObjectExpression') {
			checkClassValueRecord(context, value);
		} else {
			checkClassValueIsStatic(context, value);
		}
	}
};

// Validates a `compoundVariants` or `compoundSlots` array — every entry must
// be a static ObjectExpression. Within each entry the `class`/`className`
// field must be a static class value, and (for compoundSlots) the `slots`
// field must be a static array of string literals. Other keys are runtime
// matchers and are not validated by this rule.
const checkCompoundEntries = (
	context: Rule.RuleContext,
	node: Node,
	hasSlotsKey: boolean
): void => {
	if (node.type !== 'ArrayExpression') {
		reportDynamic(context, node);
		return;
	}

	for (const element of node.elements) {
		if (!element) {
			continue;
		}

		if (element.type !== 'ObjectExpression') {
			reportDynamic(context, element);
			continue;
		}

		for (const prop of element.properties) {
			if (prop.type === 'SpreadElement') {
				reportDynamic(context, prop);
				continue;
			}

			if (prop.computed) {
				reportDynamic(context, prop.key);
				continue;
			}

			const key = getKeyName(prop);

			if (key === 'class' || key === 'className') {
				checkClassValueIsStatic(context, prop.value);
				continue;
			}

			if (hasSlotsKey && key === 'slots') {
				if (prop.value.type !== 'ArrayExpression') {
					reportDynamic(context, prop.value);
					continue;
				}

				for (const slotEl of prop.value.elements) {
					if (!slotEl) {
						continue;
					}

					if (
						slotEl.type !== 'Literal' ||
						typeof slotEl.value !== 'string'
					) {
						reportDynamic(context, slotEl);
					}
				}
			}
		}
	}
};

// Validates a config ObjectExpression — every known class-bearing field must
// be statically inferrable. Top-level spreads and computed keys are already
// filtered out upstream by `isConfigLike`, so this only iterates regular
// Property entries with statically-known keys. Non-class-bearing keys
// (defaultVariants, presets, requiredVariants, cacheSize, postProcess,
// introspection) are not validated here.
const checkSvConfig = (
	context: Rule.RuleContext,
	configNode: ObjectExpression
): void => {
	for (const prop of configNode.properties) {
		/* c8 ignore next 3 -- isConfigLike filters out spreads upstream */
		if (prop.type !== 'Property') {
			continue;
		}

		switch (getKeyName(prop)) {
			case 'base':
				checkClassValueIsStatic(context, prop.value);
				break;
			case 'slots':
				checkClassValueRecord(context, prop.value);
				break;
			case 'variants':
				checkVariants(context, prop.value);
				break;
			case 'compoundVariants':
				checkCompoundEntries(context, prop.value, false);
				break;
			case 'compoundSlots':
				checkCompoundEntries(context, prop.value, true);
				break;
			default:
				break;
		}
	}
};

// Validates a list of cn-style arguments — each must be a static class value;
// SpreadElement arguments are reported.
const checkCnArguments = (
	context: Rule.RuleContext,
	args: ReadonlyArray<Expression | SpreadElement>
): void => {
	for (const arg of args) {
		if (arg.type === 'SpreadElement') {
			reportDynamic(context, arg);
			continue;
		}

		checkClassValueIsStatic(context, arg);
	}
};

/**
 * Flags dynamic values in `sv()` and `cn()` calls. Only statically inferrable
 * values — string literals, template literals without expressions, arrays of
 * those, and ObjectExpressions whose keys/values are themselves inferrable —
 * are allowed in class-bearing positions.
 */
export const noDynamicClasses: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow dynamic values in sv() and cn() calls — only statically inferrable class values are allowed'
		},
		schema: [],
		messages: {
			dynamic:
				'Dynamic value in sv()/cn() call. Only statically inferrable class values are allowed.'
		}
	},
	create(context) {
		const svNames = new Set<string>();
		const cnNames = new Set<string>();

		return {
			ImportDeclaration(node) {
				if (node.source.value !== 'slot-variants') {
					return;
				}

				for (const spec of node.specifiers) {
					if (
						spec.type !== 'ImportSpecifier' ||
						spec.imported.type !== 'Identifier'
					) {
						continue;
					}

					if (spec.imported.name === 'sv') {
						svNames.add(spec.local.name);
					} else if (spec.imported.name === 'cn') {
						cnNames.add(spec.local.name);
					}
				}
			},
			CallExpression(node) {
				if (svNames.size === 0 && cnNames.size === 0) {
					return;
				}

				const callee = node.callee;

				if (callee.type !== 'Identifier') {
					return;
				}

				if (svNames.has(callee.name)) {
					const args = node.arguments;

					if (args.length === 0) {
						return;
					}

					const last = args[args.length - 1];

					if (isConfigLike(last)) {
						checkCnArguments(context, args.slice(0, -1));
						checkSvConfig(context, last);
					} else {
						checkCnArguments(context, args);
					}
				} else if (cnNames.has(callee.name)) {
					checkCnArguments(context, node.arguments);
				}
			}
		};
	}
};

/**
 * Flags class name tokens that are guaranteed (or guaranteed-on-some-path) to
 * appear more than once in the output of an `sv()` or `cn()` call.
 */
export const noDuplicateClasses: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow duplicate class names in sv() and cn() outputs across slots, variants, and compounds'
		},
		schema: [],
		messages: {
			duplicate:
				'Class "{{token}}" will appear more than once in the "{{slot}}" slot output.',
			duplicateCn:
				'Class "{{token}}" will appear more than once in the cn() output.'
		}
	},
	create(context) {
		const svNames = new Set<string>();
		const cnNames = new Set<string>();

		return {
			ImportDeclaration(node) {
				if (node.source.value !== 'slot-variants') {
					return;
				}

				for (const spec of node.specifiers) {
					if (
						spec.type !== 'ImportSpecifier' ||
						spec.imported.type !== 'Identifier'
					) {
						continue;
					}

					if (spec.imported.name === 'sv') {
						svNames.add(spec.local.name);
					} else if (spec.imported.name === 'cn') {
						cnNames.add(spec.local.name);
					}
				}
			},
			CallExpression(node) {
				if (svNames.size === 0 && cnNames.size === 0) {
					return;
				}

				const callee = node.callee;

				if (callee.type !== 'Identifier') {
					return;
				}

				if (svNames.has(callee.name)) {
					const args = node.arguments;

					if (args.length === 0) {
						return;
					}

					const last = args[args.length - 1];

					if (isConfigLike(last)) {
						const baseArgs = args.slice(0, -1);
						analyzeConfig(context, last, baseArgs);
					} else {
						analyzeCnCall(context, args);
					}
				} else if (cnNames.has(callee.name)) {
					analyzeCnCall(context, node.arguments);
				}
			}
		};
	}
};

/**
 * Rules exported by the plugin.
 */
export const rules = {
	'no-duplicate-classes': noDuplicateClasses,
	'no-dynamic-classes': noDynamicClasses
};

/**
 * Plugin metadata.
 */
export const meta = { name: 'slot-variants' };

const plugin = { meta, rules };

export default plugin;