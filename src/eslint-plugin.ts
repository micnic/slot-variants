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
const strictPropertiesCache = new WeakMap<
	ObjectExpression,
	Map<string, Node> | null
>();

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

const getStrictProperties = (
	obj: Node | undefined
): Map<string, Node> | null => {
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

// Entries can't co-occur when they all come from different values of a single
// variant key — only one branch fires per render.
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

// Safe for cn() callers too: isMutuallyExclusiveVariants short-circuits to
// false on non-variant entries, so base-only token lists are never skipped.
const reportDuplicateTokens = (
	context: Rule.RuleContext,
	tokenMap: Map<string, Entry[]>,
	messageId: string,
	data: Record<string, string>
): void => {
	for (const [token, list] of tokenMap.entries()) {
		if (list.length < 2 || isMutuallyExclusiveVariants(list)) {
			continue;
		}

		reportEntryList(context, list, messageId, { token, ...data });
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

	// String/untagged-template delimiters are single-char, so range[0] + 1
	// is the first inner character.
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
		forEachStaticItem(node.elements, (element) => {
			extractTokens(
				element,
				slot,
				source,
				slotNames,
				entries,
				sourceCode
			);
		});

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

// Skips spreads and holes silently. Validators that need to flag spreads
// should use forEachItemReportingSpread instead.
const forEachStaticItem = (
	items: ReadonlyArray<Expression | SpreadElement | null>,
	visit: (item: Expression) => void
): void => {
	for (const item of items) {
		if (!item || item.type === 'SpreadElement') {
			continue;
		}

		visit(item);
	}
};

// A variants[key] is a boolean shorthand when it's not a plain object, or
// when its keys are slot names rather than value names.
const isBooleanShorthandVariant = (
	node: Node,
	slotNames: Set<string>
): boolean =>
	node.type !== 'ObjectExpression' ||
	collectSlotKeyedProperties(node, slotNames) !== null;

const forEachStringLiteralElement = (
	node: Node,
	visit: (value: string) => void
): void => {
	if (node.type !== 'ArrayExpression') {
		return;
	}

	for (const element of node.elements) {
		if (
			element &&
			element.type === 'Literal' &&
			typeof element.value === 'string'
		) {
			visit(element.value);
		}
	}
};

const forEachCompoundClass = (
	node: Node | undefined,
	visit: (cls: Node, compound: Map<string, Node>) => void
): void => {
	if (!node || node.type !== 'ArrayExpression') {
		return;
	}

	for (const element of node.elements) {
		if (!element || element.type !== 'ObjectExpression') {
			continue;
		}

		const compound = getProperties(element);
		const cls = compound.get('class') ?? compound.get('className');

		if (cls) {
			visit(cls, compound);
		}
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
		if (isBooleanShorthandVariant(variantValue, slotNames)) {
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

	forEachCompoundClass(compoundVariants, (cls) => {
		extract(cls, 'base', compoundSource);
	});

	forEachCompoundClass(compoundSlots, (cls, compound) => {
		const targetSlots = compound.get('slots');

		if (targetSlots) {
			forEachStringLiteralElement(targetSlots, (slot) => {
				extract(cls, slot, compoundSource);
			});
		}
	});

	const bySlot = indexEntriesBySlotAndToken(entries);

	for (const [slotKey, tokenMap] of bySlot.entries()) {
		reportDuplicateTokens(context, tokenMap, 'duplicate', { slot: slotKey });
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

	if (tokenMap) {
		reportDuplicateTokens(context, tokenMap, 'duplicateCn', {});
	}
};

const reportDynamic = (context: Rule.RuleContext, node: Node): void => {
	context.report({ node, messageId: 'dynamic' });
};

// Validator counterpart to forEachStaticItem: spreads are reported as dynamic
// rather than skipped.
const forEachItemReportingSpread = (
	context: Rule.RuleContext,
	items: ReadonlyArray<Expression | SpreadElement | null>,
	visit: (item: Expression) => void
): void => {
	for (const item of items) {
		if (!item) {
			continue;
		}

		if (item.type === 'SpreadElement') {
			reportDynamic(context, item);
			continue;
		}

		visit(item);
	}
};

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
		forEachItemReportingSpread(context, node.elements, (element) => {
			checkClassValueIsStatic(context, element);
		});

		return;
	}

	reportDynamic(context, node);
};

const forEachStaticProperty = (
	context: Rule.RuleContext,
	node: ObjectExpression,
	visit: (prop: Property) => void
): void => {
	for (const prop of node.properties) {
		if (prop.type === 'SpreadElement') {
			reportDynamic(context, prop);
			continue;
		}

		if (prop.computed) {
			reportDynamic(context, prop.key);
			continue;
		}

		visit(prop);
	}
};

const checkClassValueRecord = (context: Rule.RuleContext, node: Node): void => {
	if (node.type !== 'ObjectExpression') {
		reportDynamic(context, node);
		return;
	}

	forEachStaticProperty(context, node, (prop) => {
		checkClassValueIsStatic(context, prop.value);
	});
};

const checkVariants = (context: Rule.RuleContext, node: Node): void => {
	if (node.type !== 'ObjectExpression') {
		reportDynamic(context, node);
		return;
	}

	forEachStaticProperty(context, node, (prop) => {
		const { value } = prop;

		if (value.type === 'ObjectExpression') {
			checkClassValueRecord(context, value);
		} else {
			checkClassValueIsStatic(context, value);
		}
	});
};

// Other keys on compound entries are runtime matchers and are not validated.
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

		forEachStaticProperty(context, element, (prop) => {
			const key = getKeyName(prop);

			if (key === 'class' || key === 'className') {
				checkClassValueIsStatic(context, prop.value);
				return;
			}

			if (hasSlotsKey && key === 'slots') {
				if (prop.value.type !== 'ArrayExpression') {
					reportDynamic(context, prop.value);
					return;
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
		});
	}
};

// Non-class-bearing keys (defaultVariants, presets, etc.) are not checked.
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

const checkCnArguments = (
	context: Rule.RuleContext,
	args: ReadonlyArray<Expression | SpreadElement>
): void => {
	forEachItemReportingSpread(context, args, (arg) => {
		checkClassValueIsStatic(context, arg);
	});
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

// Highlights the whole literal: span-level reports would need to chase
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
		forEachStaticItem(node.elements, (element) => {
			visitForRedundantSpaces(context, element);
		});

		return;
	}

	if (node.type === 'ObjectExpression') {
		for (const value of getProperties(node).values()) {
			visitForRedundantSpaces(context, value);
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
			forEachStaticItem(call.args, (arg) => {
				visitForRedundantSpaces(context, arg);
			});

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

// A variant is "exhaustive" when it has a defaultVariants entry or is in
// requiredVariants. Without coverage the prop can be undefined at runtime,
// so a shared token isn't guaranteed to render.
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

	const exhaustive = new Set<string>(
		getProperties(config.get('defaultVariants')).keys()
	);
	const requiredVariants = config.get('requiredVariants');

	if (requiredVariants) {
		forEachStringLiteralElement(requiredVariants, (value) => {
			exhaustive.add(value);
		});
	}

	for (const [variantKey, variantValue] of getProperties(variants)) {
		if (!exhaustive.has(variantKey)) {
			continue;
		}

		// Boolean shorthand has a single branch — no cross-value comparison.
		if (isBooleanShorthandVariant(variantValue, slotNames)) {
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

// `allowEmptyString` is set at the top of a `slots[key]` value, where `''`
// is a meaningful "slot with no default classes" declaration.
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

		forEachStaticItem(node.elements, (element) => {
			visitForEmptyClasses(context, element, false);
		});

		return;
	}

	if (node.type === 'ObjectExpression' && node.properties.length === 0) {
		context.report({ node, messageId: 'emptyObject' });
	}
};

const visitRecordEntriesForEmpty = (
	context: Rule.RuleContext,
	node: ObjectExpression,
	allowEmptyString: boolean
): void => {
	if (node.properties.length === 0) {
		context.report({ node, messageId: 'emptyObject' });
		return;
	}

	for (const value of getProperties(node).values()) {
		visitForEmptyClasses(context, value, allowEmptyString);
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

			for (const variantValue of getProperties(value).values()) {
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

			forEachCompoundClass(value, (cls) => {
				visitForEmptyClasses(context, cls, false);
			});
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

			forEachStaticItem(call.args, (arg) => {
				visitForEmptyClasses(context, arg, false);
			});

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