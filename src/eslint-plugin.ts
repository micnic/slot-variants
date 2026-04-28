import type { Rule, SourceCode } from 'eslint';
import type {
	CallExpression,
	Expression,
	ImportDeclaration,
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

// Statically-known key name of a Property node, or null for computed keys.
const getKeyName = (prop: Property): string | null => {
	if (prop.computed) {
		return null;
	}

	const { key } = prop;

	if (key.type === 'Identifier') {
		return key.name;
	}

	if (key.type === 'Literal') {
		return String(key.value);
	}
	/* c8 ignore next 2 -- non-computed object keys are parser-emitted as Identifier or Literal */
	return null;
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

const propertiesCache = new WeakMap<ObjectExpression, Map<string, Node>>();
const strictPropertiesCache = new WeakMap<ObjectExpression, Map<string, Node> | null>();

const getProperties = (obj: Node | undefined): Map<string, Node> => {
	if (!obj || obj.type !== 'ObjectExpression') {
		return new Map<string, Node>();
	}

	const cached = propertiesCache.get(obj);

	if (cached) {
		return cached;
	}

	const map = new Map<string, Node>();

	for (const prop of obj.properties) {
		if (prop.type !== 'Property') {
			continue;
		}

		const key = getKeyName(prop);

		if (key !== null) {
			map.set(key, prop.value);
		}
	}

	propertiesCache.set(obj, map);

	return map;
};

const getStrictProperties = (obj: Node | undefined): Map<string, Node> | null => {
	if (!obj || obj.type !== 'ObjectExpression') {
		return null;
	}

	if (strictPropertiesCache.has(obj)) {
		return strictPropertiesCache.get(obj) ?? null;
	}

	const map = new Map<string, Node>();

	for (const prop of obj.properties) {
		if (prop.type !== 'Property') {
			strictPropertiesCache.set(obj, null);
			return null;
		}

		const key = getKeyName(prop);

		if (key === null) {
			strictPropertiesCache.set(obj, null);
			return null;
		}

		map.set(key, prop.value);
	}

	strictPropertiesCache.set(obj, map);

	return map;
};

const collectSlotKeyedProperties = (
	node: Node,
	slotNames: Set<string>
): Map<string, Node> | null => {
	if (
		node.type !== 'ObjectExpression' ||
		node.properties.length === 0 ||
		slotNames.size === 0
	) {
		return null;
	}

	const result = new Map<string, Node>();

	for (const prop of node.properties) {
		if (prop.type !== 'Property') {
			return null;
		}

		const key = getKeyName(prop);

		if (key === null || (key !== 'base' && !slotNames.has(key))) {
			return null;
		}

		result.set(key, prop.value);
	}

	return result;
};

type CallMatch = {
	config: ObjectExpression | null;
	args: ReadonlyArray<Expression | SpreadElement>;
};

// Matches a CallExpression against tracked sv/cn imports; splits the trailing
// config argument off when present.
const matchSvCnCall = (
	node: CallExpression,
	svNames: Set<string>,
	cnNames: Set<string>
): CallMatch | null => {
	const { callee } = node;

	if (callee.type !== 'Identifier') {
		return null;
	}

	if (svNames.has(callee.name)) {
		const args = node.arguments;

		if (args.length === 0) {
			return { config: null, args };
		}

		const last = args[args.length - 1];

		if (isConfigLike(last)) {
			return { config: last, args: args.slice(0, -1) };
		}

		return { config: null, args };
	}

	if (cnNames.has(callee.name)) {
		return { config: null, args: node.arguments };
	}

	return null;
};

const isConfigLike = (node: Node | undefined): node is ObjectExpression => {
	const properties = getStrictProperties(node);

	if (!properties || properties.size === 0) {
		return false;
	}

	for (const key of properties.keys()) {
		if (!CONFIG_KEYS.has(key)) {
			return false;
		}
	}

	return true;
};

type Source =
	| { kind: 'base' }
	| { kind: 'variant'; key: string; value: string }
	| { kind: 'compound' };

const baseSource: Source = { kind: 'base' };
const compoundSource: Source = { kind: 'compound' };

type Entry = {
	source: Source;
	slot: string;
	token: string;
	start: number;
	end: number;
};

type TokenEntriesBySlot = Map<string, Map<string, Entry[]>>;

// True when the entries can never co-occur: all come from different values of
// a single variant key, so only one branch fires on any given render.
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

const EMPTY_SLOT_NAMES = new Set<string>();

const indexEntriesBySlotAndToken = (
	entries: Iterable<Entry>
): TokenEntriesBySlot => {
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

	return bySlot;
};

const reportEntryList = (
	context: Rule.RuleContext,
	entries: ReadonlyArray<Entry>,
	messageId: string,
	data: Record<string, string>
): void => {
	const { sourceCode } = context;

	for (const entry of entries) {
		context.report({
			loc: {
				start: sourceCode.getLocFromIndex(entry.start),
				end: sourceCode.getLocFromIndex(entry.end)
			},
			messageId,
			data
		});
	}
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

	// String literals and untagged templates have a single-char opening
	// delimiter, so range[0] + 1 is the first inner character.
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

	const slotKeyedProps = collectSlotKeyedProperties(node, slotNames);

	if (!slotKeyedProps) {
		return;
	}

	for (const [key, value] of slotKeyedProps) {
		extractTokens(value, key, source, slotNames, entries, sourceCode);
	}
};

const analyzeConfig = (
	context: Rule.RuleContext,
	configNode: Node,
	baseArgs: ReadonlyArray<Expression | SpreadElement>
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
		if (
			variantValue.type !== 'ObjectExpression' ||
			collectSlotKeyedProperties(variantValue, slotNames) !== null
		) {
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

	const bySlot = indexEntriesBySlotAndToken(entries);

	for (const [slotKey, tokenMap] of bySlot.entries()) {
		for (const [token, list] of tokenMap.entries()) {
			if (list.length < 2 || isMutuallyExclusiveVariants(list)) {
				continue;
			}

			reportEntryList(context, list, 'duplicate', {
				token,
				slot: slotKey
			});
		}
	}
};

const analyzeCnCall = (
	context: Rule.RuleContext,
	args: ReadonlyArray<Expression | SpreadElement>
): void => {
	const entries: Entry[] = [];

	for (const arg of args) {
		extractTokens(
			arg,
			'base',
			baseSource,
			EMPTY_SLOT_NAMES,
			entries,
			context.sourceCode
		);
	}

	const tokenMap = indexEntriesBySlotAndToken(entries).get('base');

	if (!tokenMap) {
		return;
	}

	for (const [token, list] of tokenMap.entries()) {
		if (list.length < 2) {
			continue;
		}

		reportEntryList(context, list, 'duplicateCn', { token });
	}
};

const reportDynamic = (context: Rule.RuleContext, node: Node): void => {
	context.report({ node, messageId: 'dynamic' });
};

// Reports anything that isn't a static class value (string literal,
// expressionless template, or array of those).
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

// Validates an ObjectExpression of statically-known keys mapped to static
// class values (slots, variant value records).
const checkClassValueRecord = (context: Rule.RuleContext, node: Node): void => {
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

// Validates the `variants` field: each value is a class-value record or a
// class value (boolean shorthand).
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

// Validates a compound array: each entry's `class`/`className` is static and
// (for compoundSlots) `slots` is a literal string array. Other keys are
// runtime matchers and are not validated.
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

// Validates each class-bearing field in an sv() config. Non-class-bearing
// keys (defaultVariants, presets, etc.) are not checked here.
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

// Validates cn-style arguments: each must be a static class value.
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

const createImportsTracker = () => {
	const cnNames = new Set<string>();
	const svNames = new Set<string>();

	const importsTracker = (node: ImportDeclaration): void => {
		if (node.source.value !== 'slot-variants') {
			return;
		}

		for (const specifier of node.specifiers) {
			if (
				specifier.type !== 'ImportSpecifier' ||
				specifier.imported.type !== 'Identifier'
			) {
				continue;
			}

			if (specifier.imported.name === 'cn') {
				cnNames.add(specifier.local.name);
			} else if (specifier.imported.name === 'sv') {
				svNames.add(specifier.local.name);
			}
		}
	};

	return { cnNames, svNames, importsTracker };
};

const createTrackedCallListeners = (
	onCall: (node: CallExpression, call: CallMatch) => void
) => {
	const { cnNames, svNames, importsTracker } = createImportsTracker();

	return {
		ImportDeclaration(node: ImportDeclaration) {
			importsTracker(node);
		},
		CallExpression(node: CallExpression) {
			if (svNames.size === 0 && cnNames.size === 0) {
				return;
			}

			const call = matchSvCnCall(node, svNames, cnNames);

			if (call) {
				onCall(node, call);
			}
		}
	};
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
		return createTrackedCallListeners((_node, call) => {
				checkCnArguments(context, call.args);

				if (call.config) {
					checkSvConfig(context, call.config);
				}
		});
	}
};

const hasRedundantSpaces = (value: string): boolean =>
	!/^(?:[^\s]+(?: [^\s]+)*)?$/.test(value);

// Highlights the entire literal — span-level reports would have to chase
// raw-text/escape-sequence mismatches.
const reportRedundantSpaces = (
	context: Rule.RuleContext,
	node: Node,
	value: string
): void => {
	if (hasRedundantSpaces(value)) {
		context.report({ node, messageId: 'redundant' });
	}
};

// Walks a node and reports redundant whitespace in string/template literals;
// silently ignores dynamic values.
const visitForRedundantSpaces = (
	context: Rule.RuleContext,
	node: Node
): void => {
	if (node.type === 'Literal') {
		if (typeof node.value === 'string') {
			reportRedundantSpaces(context, node, node.value);
		}

		return;
	}

	if (node.type === 'TemplateLiteral') {
		const [quasi] = node.quasis;

		if (node.expressions.length === 0 && quasi) {
			reportRedundantSpaces(
				context,
				node,
				/* c8 ignore next -- cooked is always defined on untagged templates */
				quasi.value.cooked ?? quasi.value.raw
			);
		}

		return;
	}

	if (node.type === 'ArrayExpression') {
		for (const element of node.elements) {
			if (!element || element.type === 'SpreadElement') {
				continue;
			}

			visitForRedundantSpaces(context, element);
		}

		return;
	}

	if (node.type === 'ObjectExpression') {
		for (const prop of node.properties) {
			if (prop.type !== 'Property' || prop.computed) {
				continue;
			}

			visitForRedundantSpaces(context, prop.value);
		}
	}
};

/**
 * Flags redundant whitespace inside class strings passed to `sv()` and `cn()`
 * calls. A class string's whitespace is canonical only as a single ASCII space
 * between non-whitespace tokens; leading, trailing, repeated, or non-space
 * whitespace runs are reported. Dynamic expressions are skipped silently.
 */
export const noRedundantSpaces: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow redundant whitespace inside class strings passed to sv() and cn() calls'
		},
		schema: [],
		messages: {
			redundant: 'Redundant whitespace in class string.'
		}
	},
	create(context) {
		return createTrackedCallListeners((_node, call) => {
				for (const arg of call.args) {
					if (arg.type === 'SpreadElement') {
						continue;
					}

					visitForRedundantSpaces(context, arg);
				}

				if (call.config) {
					visitForRedundantSpaces(context, call.config);
				}
		});
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
		return createTrackedCallListeners((_node, call) => {
				if (call.config) {
					analyzeConfig(context, call.config, call.args);
				} else {
					analyzeCnCall(context, call.args);
				}
		});
	}
};

// Reports tokens shared across every value of an exhaustive variant — one
// with a `defaultVariants` entry or listed in `requiredVariants`. Without
// coverage the prop can be undefined at runtime, so the token isn't
// guaranteed to render.
const analyzeSharedTokens = (
	context: Rule.RuleContext,
	configNode: Node
): void => {
	const { sourceCode } = context;
	const config = getProperties(configNode);
	const variants = config.get('variants');

	if (!variants || variants.type !== 'ObjectExpression') {
		return;
	}

	const slotsMap = getProperties(config.get('slots'));
	const slotNames = new Set(slotsMap.keys());

	slotNames.delete('base');

	const exhaustive = new Set<string>();
	const defaultVariants = config.get('defaultVariants');

	if (defaultVariants && defaultVariants.type === 'ObjectExpression') {
		for (const prop of defaultVariants.properties) {
			if (prop.type !== 'Property') {
				continue;
			}

			const key = getKeyName(prop);

			if (key !== null) {
				exhaustive.add(key);
			}
		}
	}

	const requiredVariants = config.get('requiredVariants');

	if (requiredVariants && requiredVariants.type === 'ArrayExpression') {
		for (const element of requiredVariants.elements) {
			if (
				element &&
				element.type === 'Literal' &&
				typeof element.value === 'string'
			) {
				exhaustive.add(element.value);
			}
		}
	}

	for (const variantProp of variants.properties) {
		if (variantProp.type !== 'Property' || variantProp.computed) {
			continue;
		}

		const variantKey = getKeyName(variantProp);

		if (variantKey === null || !exhaustive.has(variantKey)) {
			continue;
		}

		const variantValue = variantProp.value;

		// Boolean shorthand has a single branch — no cross-value comparison.
		if (
			variantValue.type !== 'ObjectExpression' ||
			collectSlotKeyedProperties(variantValue, slotNames) !== null
		) {
			continue;
		}

		const valueEntries = getStrictProperties(variantValue);

		// A spread or computed key means we can't see every value; we'd
		// over-flag tokens that may differ in the unseen branches.
		if (!valueEntries || valueEntries.size < 2) {
			continue;
		}

		const tokensByValue: TokenEntriesBySlot[] = [];

		for (const [valueKey, valueNode] of valueEntries) {
			const entries: Entry[] = [];

			extractTokens(
				valueNode,
				'base',
				{ kind: 'variant', key: variantKey, value: valueKey },
				slotNames,
				entries,
				sourceCode
			);

			tokensByValue.push(indexEntriesBySlotAndToken(entries));
		}

		const firstValueMap = tokensByValue[0];

		/* c8 ignore next 3 -- valueEntries.size >= 2 guarantees at least one extracted value map */
		if (!firstValueMap) {
			continue;
		}

		const sharedTokens = new Map<string, Set<string>>();

		for (const [slot, tokenMap] of firstValueMap) {
			sharedTokens.set(slot, new Set(tokenMap.keys()));
		}

		for (const valueMap of tokensByValue.slice(1)) {
			const emptySlots: string[] = [];

			for (const [slot, tokens] of sharedTokens) {
				const tokenMap = valueMap.get(slot);

				if (!tokenMap) {
					emptySlots.push(slot);
					continue;
				}

				for (const token of tokens) {
					if (!tokenMap.has(token)) {
						tokens.delete(token);
					}
				}

				if (tokens.size === 0) {
					emptySlots.push(slot);
				}
			}

			for (const slot of emptySlots) {
				sharedTokens.delete(slot);
			}

			if (sharedTokens.size === 0) {
				break;
			}
		}

		for (const [slot, tokens] of sharedTokens) {
			for (const token of tokens) {
				for (const valueMap of tokensByValue) {
					const entryList = valueMap.get(slot)?.get(token);

					/* c8 ignore next 3 -- `sharedTokens` only retains tokens present in every value map */
					if (!entryList) {
						continue;
					}

					reportEntryList(context, entryList, 'shared', {
						token,
						variant: variantKey,
						slot
					});
				}
			}
		}
	}
};

/**
 * Flags class name tokens that appear in every value of an exhaustively-covered
 * variant — the token is constant in the rendered output and belongs in `base`
 * (or the corresponding `slots[slot]` entry) rather than being repeated across
 * each variant value. Coverage is treated as exhaustive when the variant has a
 * `defaultVariants` entry or is listed in `requiredVariants`.
 */
export const noSharedTokens: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow class tokens that appear in every value of an exhaustively-covered variant — lift them out of the variant'
		},
		schema: [],
		messages: {
			shared: 'Class "{{token}}" appears in every value of variant "{{variant}}" for slot "{{slot}}" — lift it out of the variant.'
		}
	},
	create(context) {
		return createTrackedCallListeners((_node, call) => {
				if (!call.config) {
					return;
				}

				analyzeSharedTokens(context, call.config);
		});
	}
};

// True when the node is an empty string literal or expressionless template.
const isEmptyStringNode = (node: Node): boolean => {
	if (node.type === 'Literal') {
		return node.value === '';
	}

	if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
		const [quasi] = node.quasis;

		/* c8 ignore next 3 -- a TemplateLiteral always has at least one quasi */
		if (!quasi) {
			return false;
		}

		/* c8 ignore next -- cooked is always defined on untagged templates */
		return (quasi.value.cooked ?? quasi.value.raw) === '';
	}

	return false;
};

// Reports empty class values. `allowEmptyString` suppresses the empty-string
// report at the top of a `slots[key]` value, where `''` declares a slot with
// no default.
const visitForEmptyClasses = (
	context: Rule.RuleContext,
	node: Node,
	allowEmptyString: boolean
): void => {
	if (node.type === 'Literal' || node.type === 'TemplateLiteral') {
		if (!allowEmptyString && isEmptyStringNode(node)) {
			context.report({ node, messageId: 'emptyString' });
		}

		return;
	}

	if (node.type === 'ArrayExpression') {
		if (node.elements.length === 0) {
			context.report({ node, messageId: 'emptyArray' });
			return;
		}

		for (const element of node.elements) {
			if (!element || element.type === 'SpreadElement') {
				continue;
			}

			visitForEmptyClasses(context, element, false);
		}

		return;
	}

	if (node.type === 'ObjectExpression' && node.properties.length === 0) {
		context.report({ node, messageId: 'emptyObject' });
	}
};

// Visits each value of a record ObjectExpression; reports the record itself when empty.
const visitRecordEntriesForEmpty = (
	context: Rule.RuleContext,
	node: ObjectExpression,
	allowEmptyString: boolean
): void => {
	if (node.properties.length === 0) {
		context.report({ node, messageId: 'emptyObject' });
		return;
	}

	for (const prop of node.properties) {
		if (prop.type !== 'Property' || prop.computed) {
			continue;
		}

		visitForEmptyClasses(context, prop.value, allowEmptyString);
	}
};

const checkSvConfigForEmpty = (
	context: Rule.RuleContext,
	configNode: ObjectExpression
): void => {
	for (const [key, value] of getProperties(configNode)) {
		if (key === 'base') {
			visitForEmptyClasses(context, value, false);
			continue;
		}

		if (key === 'slots') {
			if (value.type !== 'ObjectExpression') {
				continue;
			}

			visitRecordEntriesForEmpty(context, value, true);
			continue;
		}

		if (key === 'variants') {
			if (value.type !== 'ObjectExpression') {
				continue;
			}

			if (value.properties.length === 0) {
				context.report({ node: value, messageId: 'emptyObject' });
				continue;
			}

			for (const variantProp of value.properties) {
				if (variantProp.type !== 'Property' || variantProp.computed) {
					continue;
				}

				const variantValue = variantProp.value;

				if (variantValue.type === 'ObjectExpression') {
					visitRecordEntriesForEmpty(context, variantValue, false);
				} else {
					visitForEmptyClasses(context, variantValue, false);
				}
			}

			continue;
		}

		if (key === 'compoundVariants' || key === 'compoundSlots') {
			if (value.type !== 'ArrayExpression') {
				continue;
			}

			if (value.elements.length === 0) {
				context.report({ node: value, messageId: 'emptyArray' });
				continue;
			}

			for (const element of value.elements) {
				if (!element || element.type !== 'ObjectExpression') {
					continue;
				}

				for (const innerProp of element.properties) {
					if (innerProp.type !== 'Property' || innerProp.computed) {
						continue;
					}

					const innerKey = getKeyName(innerProp);

					if (innerKey === 'class' || innerKey === 'className') {
						visitForEmptyClasses(context, innerProp.value, false);
					}
				}
			}
		}
	}
};

/**
 * Flags empty class values — empty strings, empty arrays, and empty objects —
 * in `sv()` and `cn()` calls, plus zero-argument `sv()` / `cn()` calls (which
 * always produce an empty class string). Inside an `sv()` config, an empty
 * string is still allowed as a direct `slots[key]` value, since declaring a
 * slot with no default classes is a meaningful use case.
 */
export const noEmptyClasses: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow empty class values (empty strings, arrays, or objects) and zero-argument calls in sv() and cn()'
		},
		schema: [],
		messages: {
			emptyString: 'Empty class string is not allowed.',
			emptyArray: 'Empty class array is not allowed.',
			emptyObject: 'Empty class object is not allowed.',
			emptyCall: 'Empty sv()/cn() call is not allowed.'
		}
	},
	create(context) {
		return createTrackedCallListeners((node, call) => {
				if (node.arguments.length === 0) {
					context.report({ node, messageId: 'emptyCall' });
					return;
				}

				for (const arg of call.args) {
					if (arg.type === 'SpreadElement') {
						continue;
					}

					visitForEmptyClasses(context, arg, false);
				}

				if (call.config) {
					checkSvConfigForEmpty(context, call.config);
				}
		});
	}
};

/**
 * Rules exported by the plugin.
 */
export const rules = {
	'no-duplicate-classes': noDuplicateClasses,
	'no-dynamic-classes': noDynamicClasses,
	'no-empty-classes': noEmptyClasses,
	'no-redundant-spaces': noRedundantSpaces,
	'no-shared-tokens': noSharedTokens
};

/**
 * Plugin metadata.
 */
export const meta = { name: 'slot-variants' };

const plugin = { meta, rules };

export default plugin;