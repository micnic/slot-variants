import type { Rule, SourceCode } from 'eslint';
import type {
	ArrayExpression,
	CallExpression,
	Expression,
	ImportDeclaration,
	Node,
	ObjectExpression,
	Property,
	SpreadElement,
	TemplateLiteral
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

const buildPropertiesMap = (obj: ObjectExpression): Map<string, Node> => {
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

	return map;
};

const getProperties = (obj: Node | undefined): Map<string, Node> => {
	if (!obj || obj.type !== 'ObjectExpression') {
		return new Map<string, Node>();
	}

	const cached = propertiesCache.get(obj);

	if (cached) {
		return cached;
	}

	const map = buildPropertiesMap(obj);

	propertiesCache.set(obj, map);

	return map;
};

const buildStrictPropertiesMap = (
	obj: ObjectExpression
): Map<string, Node> | null => {
	const map = new Map<string, Node>();

	for (const prop of obj.properties) {
		if (prop.type !== 'Property') {
			return null;
		}

		const key = getKeyName(prop);

		if (key === null) {
			return null;
		}

		map.set(key, prop.value);
	}

	return map;
};

const getCachedStrictProperties = (
	obj: ObjectExpression
): Map<string, Node> | null | undefined => {
	if (!strictPropertiesCache.has(obj)) {
		return undefined;
	}

	return strictPropertiesCache.get(obj) ?? null;
};

const getStrictProperties = (
	obj: Node | undefined
): Map<string, Node> | null => {
	if (!obj || obj.type !== 'ObjectExpression') {
		return null;
	}

	const cached = getCachedStrictProperties(obj);

	if (cached !== undefined) {
		return cached;
	}

	const map = buildStrictPropertiesMap(obj);

	strictPropertiesCache.set(obj, map);

	return map;
};

const isSlotKeyedPropertyKey = (
	key: string | null,
	slotNames: Set<string>
): key is string => key === 'base' || (key !== null && slotNames.has(key));

const getSlotKeyedPropertyEntry = (
	prop: ObjectExpression['properties'][number],
	slotNames: Set<string>
): [string, Node] | null => {
	if (prop.type !== 'Property') {
		return null;
	}

	const key = getKeyName(prop);

	if (!isSlotKeyedPropertyKey(key, slotNames)) {
		return null;
	}

	return [key, prop.value];
};

const buildSlotKeyedMap = (
	obj: ObjectExpression,
	slotNames: Set<string>
): Map<string, Node> | null => {
	const result = new Map<string, Node>();

	for (const prop of obj.properties) {
		const entry = getSlotKeyedPropertyEntry(prop, slotNames);

		if (!entry) {
			return null;
		}

		const [key, value] = entry;

		result.set(key, value);
	}

	return result;
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

	return buildSlotKeyedMap(node, slotNames);
};

type CallMatch = {
	config: ObjectExpression | null;
	args: ReadonlyArray<Expression | SpreadElement>;
};

const getIdentifierCalleeName = (node: CallExpression): string | null =>
	node.callee.type === 'Identifier' ? node.callee.name : null;

const matchSvCall = (node: CallExpression): CallMatch => {
	const args = node.arguments;
	const last = args[args.length - 1];

	if (!isConfigLike(last)) {
		return { config: null, args };
	}

	return { config: last, args: args.slice(0, -1) };
};

const matchSvCnCall = (
	node: CallExpression,
	svNames: Set<string>,
	cnNames: Set<string>
): CallMatch | null => {
	const calleeName = getIdentifierCalleeName(node);

	if (calleeName === null) {
		return null;
	}

	if (svNames.has(calleeName)) {
		return matchSvCall(node);
	}

	if (cnNames.has(calleeName)) {
		return { config: null, args: node.arguments };
	}

	return null;
};

const hasOnlyConfigKeys = (properties: Map<string, Node>): boolean => {
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
type VariantSource = Extract<Source, { kind: 'variant' }>;

const getVariantSource = (entry: Entry): VariantSource | null =>
	entry.source.kind === 'variant' ? entry.source : null;

const sharesVariantKey = (
	sharedKey: string | null,
	source: VariantSource
): boolean => sharedKey === null || sharedKey === source.key;

const isExclusiveVariantSource = (
	source: VariantSource | null,
	sharedKey: string | null,
	seenValues: Set<string>
): source is VariantSource =>
	source !== null &&
	sharesVariantKey(sharedKey, source) &&
	!seenValues.has(source.value);

// Entries can't co-occur when they all come from different values of a single
// variant key — only one branch fires per render.
const isMutuallyExclusiveVariants = (list: Entry[]): boolean => {
	const seenValues = new Set<string>();
	let sharedKey: string | null = null;

	for (const entry of list) {
		const source = getVariantSource(entry);

		if (!isExclusiveVariantSource(source, sharedKey, seenValues)) {
			return false;
		}

		sharedKey = source.key;
		seenValues.add(source.value);
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
) => {
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
) => {
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
) => {
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

const isStaticStringNode = (node: Node): boolean =>
	getStaticStringText(node) !== null;

const extractArrayTokens = (
	node: ArrayExpression,
	slot: string,
	source: Source,
	slotNames: Set<string>,
	entries: Entry[],
	sourceCode: SourceCode
) => {
	forEachStaticItem(node.elements, (element) => {
		extractTokens(element, slot, source, slotNames, entries, sourceCode);
	});
};

const extractSlotKeyedTokens = (
	node: Node,
	source: Source,
	slotNames: Set<string>,
	entries: Entry[],
	sourceCode: SourceCode
) => {
	const slotKeyedProps = collectSlotKeyedProperties(node, slotNames);

	if (!slotKeyedProps) {
		return;
	}

	for (const [key, value] of slotKeyedProps) {
		extractTokens(value, key, source, slotNames, entries, sourceCode);
	}
};

const extractTokens = (
	node: Node,
	slot: string,
	source: Source,
	slotNames: Set<string>,
	entries: Entry[],
	sourceCode: SourceCode
) => {
	if (isStaticStringNode(node)) {
		pushStringLiteralTokens(node, slot, source, entries, sourceCode);
		return;
	}

	if (node.type === 'ArrayExpression') {
		extractArrayTokens(node, slot, source, slotNames, entries, sourceCode);
		return;
	}

	extractSlotKeyedTokens(node, source, slotNames, entries, sourceCode);
};

// Skips spreads and holes silently. Validators that need to flag spreads
// should use forEachItemReportingSpread instead.
const forEachStaticItem = (
	items: ReadonlyArray<Expression | SpreadElement | null>,
	visit: (item: Expression) => void
) => {
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
) => {
	if (node.type !== 'ArrayExpression') {
		return;
	}

	forEachStaticItem(node.elements, (element) => {
		if (element.type === 'Literal' && typeof element.value === 'string') {
			visit(element.value);
		}
	});
};

const getCompoundObjectExpression = (
	element: Expression | SpreadElement | null
): ObjectExpression | null =>
	element?.type === 'ObjectExpression' ? element : null;

const getCompoundClassNode = (compound: Map<string, Node>): Node | null =>
	compound.get('class') ?? compound.get('className') ?? null;

const matchCompoundClass = (
	element: Expression | SpreadElement | null
): { cls: Node; compound: Map<string, Node> } | null => {
	const objectExpression = getCompoundObjectExpression(element);

	if (!objectExpression) {
		return null;
	}

	const compound = getProperties(objectExpression);
	const cls = getCompoundClassNode(compound);

	if (!cls) {
		return null;
	}

	return { cls, compound };
};

const visitCompoundClassMatch = (
	element: Expression,
	visit: (cls: Node, compound: Map<string, Node>) => void
) => {
	const match = matchCompoundClass(element);

	if (match) {
		visit(match.cls, match.compound);
	}
};

const forEachCompoundClass = (
	node: Node | undefined,
	visit: (cls: Node, compound: Map<string, Node>) => void
) => {
	if (!node || node.type !== 'ArrayExpression') {
		return;
	}

	forEachStaticItem(node.elements, (element) => {
		visitCompoundClassMatch(element, visit);
	});
};

type ExtractFn = (node: Node, slot: string, source: Source) => void;

const extractVariantTokens = (
	variantsMap: Map<string, Node>,
	slotNames: Set<string>,
	extract: ExtractFn
) => {
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
};

const extractCompoundTokens = (
	compoundVariants: Node | undefined,
	compoundSlots: Node | undefined,
	extract: ExtractFn
) => {
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
};

const collectConfigEntries = (
	config: Map<string, Node>,
	slotsMap: Map<string, Node>,
	slotNames: Set<string>,
	baseArgs: ReadonlyArray<Expression | SpreadElement>,
	sourceCode: SourceCode
): Entry[] => {
	const entries: Entry[] = [];
	const extract: ExtractFn = (node, slot, source) => {
		extractTokens(node, slot, source, slotNames, entries, sourceCode);
	};

	for (const [slotKey, slotValue] of slotsMap.entries()) {
		extract(slotValue, slotKey, baseSource);
	}

	for (const arg of baseArgs) {
		extract(arg, 'base', baseSource);
	}

	const base = config.get('base');

	if (base) {
		extract(base, 'base', baseSource);
	}

	extractVariantTokens(
		getProperties(config.get('variants')),
		slotNames,
		extract
	);
	extractCompoundTokens(
		config.get('compoundVariants'),
		config.get('compoundSlots'),
		extract
	);

	return entries;
};

const reportDuplicatesBySlot = (
	context: Rule.RuleContext,
	bySlot: TokenEntriesBySlot
) => {
	for (const [slotKey, tokenMap] of bySlot.entries()) {
		reportDuplicateTokens(context, tokenMap, 'duplicate', {
			slot: slotKey
		});
	}
};

const analyzeConfig = (
	context: Rule.RuleContext,
	configNode: Node,
	baseArgs: ReadonlyArray<Expression | SpreadElement>
) => {
	const config = getProperties(configNode);
	const slotsMap = getProperties(config.get('slots'));
	const slotNames = new Set(slotsMap.keys());

	// 'base' is a reserved key meaning "default slot", not a slot name.
	slotNames.delete('base');

	reportDuplicatesBySlot(
		context,
		indexEntriesBySlotAndToken(
			collectConfigEntries(
				config,
				slotsMap,
				slotNames,
				baseArgs,
				context.sourceCode
			)
		)
	);
};

const analyzeCnCall = (
	context: Rule.RuleContext,
	args: ReadonlyArray<Expression | SpreadElement>
) => {
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

const reportDynamic = (context: Rule.RuleContext, node: Node) => {
	context.report({ node, messageId: 'dynamic' });
};

// Validator counterpart to forEachStaticItem: spreads are reported as dynamic
// rather than skipped.
const forEachItemReportingSpread = (
	context: Rule.RuleContext,
	items: ReadonlyArray<Expression | SpreadElement | null>,
	visit: (item: Expression) => void
) => {
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

const checkClassValueIsStatic = (context: Rule.RuleContext, node: Node) => {
	if (isStaticStringNode(node)) {
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
) => {
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

const checkClassValueRecord = (context: Rule.RuleContext, node: Node) => {
	if (node.type !== 'ObjectExpression') {
		reportDynamic(context, node);
		return;
	}

	forEachStaticProperty(context, node, (prop) => {
		checkClassValueIsStatic(context, prop.value);
	});
};

const checkVariants = (context: Rule.RuleContext, node: Node) => {
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

const checkCompoundSlotsArray = (context: Rule.RuleContext, value: Node) => {
	if (value.type !== 'ArrayExpression') {
		reportDynamic(context, value);
		return;
	}

	forEachItemReportingSpread(context, value.elements, (element) => {
		if (element.type !== 'Literal' || typeof element.value !== 'string') {
			reportDynamic(context, element);
		}
	});
};

// Other keys on compound entries are runtime matchers and are not validated.
const checkCompoundEntries = (
	context: Rule.RuleContext,
	node: Node,
	hasSlotsKey: boolean
) => {
	if (node.type !== 'ArrayExpression') {
		reportDynamic(context, node);
		return;
	}

	forEachItemReportingSpread(context, node.elements, (element) => {
		if (element.type !== 'ObjectExpression') {
			reportDynamic(context, element);
			return;
		}

		forEachStaticProperty(context, element, (prop) => {
			checkCompoundEntryProperty(context, prop, hasSlotsKey);
		});
	});
};

type SvConfigValueChecker = (context: Rule.RuleContext, node: Node) => void;

const compoundEntryValueCheckers: Record<string, SvConfigValueChecker> = {
	class: checkClassValueIsStatic,
	className: checkClassValueIsStatic,
	slots: checkCompoundSlotsArray
};

const getCompoundEntrySlotsChecker = (
	hasSlotsKey: boolean
): SvConfigValueChecker | null =>
	hasSlotsKey ? checkCompoundSlotsArray : null;

const getCompoundEntryValueChecker = (
	key: string | null,
	hasSlotsKey: boolean
): SvConfigValueChecker | null => {
	/* c8 ignore next 3 -- forEachStaticProperty skips computed keys before dispatch */
	if (key === null) {
		return null;
	}

	if (key === 'slots') {
		return getCompoundEntrySlotsChecker(hasSlotsKey);
	}

	return compoundEntryValueCheckers[key] ?? null;
};

const checkCompoundEntryProperty = (
	context: Rule.RuleContext,
	prop: Property,
	hasSlotsKey: boolean
) => {
	const checker = getCompoundEntryValueChecker(getKeyName(prop), hasSlotsKey);

	if (checker) {
		checker(context, prop.value);
	}
};

const svConfigValueCheckers: Record<string, SvConfigValueChecker> = {
	base: checkClassValueIsStatic,
	slots: checkClassValueRecord,
	variants: checkVariants,
	compoundVariants: (context, node) => {
		checkCompoundEntries(context, node, false);
	},
	compoundSlots: (context, node) => {
		checkCompoundEntries(context, node, true);
	}
};

const checkSvConfigProperty = (
	context: Rule.RuleContext,
	prop: Property
) => {
	const key = getKeyName(prop);

	if (key !== null) {
		svConfigValueCheckers[key]?.(context, prop.value);
	}
};

// Non-class-bearing keys (defaultVariants, presets, etc.) are not checked.
const checkSvConfig = (
	context: Rule.RuleContext,
	configNode: ObjectExpression
) => {
	forEachStaticProperty(context, configNode, (prop) => {
		checkSvConfigProperty(context, prop);
	});
};

const checkCnArguments = (
	context: Rule.RuleContext,
	args: ReadonlyArray<Expression | SpreadElement>
) => {
	forEachItemReportingSpread(context, args, (arg) => {
		checkClassValueIsStatic(context, arg);
	});
};

const trackNamedImport = (
	specifier: ImportDeclaration['specifiers'][number],
	trackedNamesByImport: Record<string, Set<string>>
) => {
	if (
		specifier.type !== 'ImportSpecifier' ||
		specifier.imported.type !== 'Identifier'
	) {
		return;
	}

	trackedNamesByImport[specifier.imported.name]?.add(specifier.local.name);
};

const createImportsTracker = () => {
	const cnNames = new Set<string>();
	const svNames = new Set<string>();
	const trackedNamesByImport: Record<string, Set<string>> = {
		cn: cnNames,
		sv: svNames
	};

	const importsTracker = (node: ImportDeclaration) => {
		if (node.source.value !== 'slot-variants') {
			return;
		}

		for (const specifier of node.specifiers) {
			trackNamedImport(specifier, trackedNamesByImport);
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
const noDynamicClasses: Rule.RuleModule = {
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
) => {
	if (hasRedundantSpaces(value)) {
		context.report({ node, messageId: 'redundant' });
	}
};

const isStaticTemplateLiteral = (
	node: Node
): node is TemplateLiteral =>
	node.type === 'TemplateLiteral' && node.expressions.length === 0;

const getStaticTemplateLiteralText = (node: TemplateLiteral): string | null => {
	const [quasi] = node.quasis;

	/* c8 ignore next 3 -- a TemplateLiteral always has at least one quasi */
	if (!quasi) {
		return null;
	}

	/* c8 ignore next -- cooked is always defined on untagged templates */
	return quasi.value.cooked ?? quasi.value.raw;
};

const getStaticStringText = (node: Node): string | null => {
	if (node.type === 'Literal') {
		return typeof node.value === 'string' ? node.value : null;
	}

	if (isStaticTemplateLiteral(node)) {
		return getStaticTemplateLiteralText(node);
	}

	return null;
};

const visitArrayForRedundantSpaces = (
	context: Rule.RuleContext,
	node: ArrayExpression
) => {
	forEachStaticItem(node.elements, (element) => {
		visitForRedundantSpaces(context, element);
	});
};

const visitObjectForRedundantSpaces = (
	context: Rule.RuleContext,
	node: ObjectExpression
) => {
	for (const value of getProperties(node).values()) {
		visitForRedundantSpaces(context, value);
	}
};

const visitForRedundantSpaces = (context: Rule.RuleContext, node: Node) => {
	const text = getStaticStringText(node);

	if (text !== null) {
		reportRedundantSpaces(context, node, text);
		return;
	}

	if (node.type === 'ArrayExpression') {
		visitArrayForRedundantSpaces(context, node);
		return;
	}

	if (node.type === 'ObjectExpression') {
		visitObjectForRedundantSpaces(context, node);
	}
};

/**
 * Flags redundant whitespace inside class strings passed to `sv()` and `cn()`
 * calls. A class string's whitespace is canonical only as a single ASCII space
 * between non-whitespace tokens; leading, trailing, repeated, or non-space
 * whitespace runs are reported. Dynamic expressions are skipped silently.
 */
const noRedundantSpaces: Rule.RuleModule = {
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
const noDuplicateClasses: Rule.RuleModule = {
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
const intersectSlotTokens = (
	tokens: Set<string>,
	tokenMap: Map<string, Entry[]>
) => {
	for (const token of tokens) {
		if (!tokenMap.has(token)) {
			tokens.delete(token);
		}
	}
};

const intersectSharedTokensStep = (
	sharedTokens: Map<string, Set<string>>,
	valueMap: TokenEntriesBySlot
) => {
	for (const [slot, tokens] of sharedTokens) {
		const tokenMap = valueMap.get(slot);

		if (!tokenMap) {
			sharedTokens.delete(slot);
			continue;
		}

		intersectSlotTokens(tokens, tokenMap);

		if (tokens.size === 0) {
			sharedTokens.delete(slot);
		}
	}
};

const seedSharedTokens = (
	valueMap: TokenEntriesBySlot
): Map<string, Set<string>> => {
	const sharedTokens = new Map<string, Set<string>>();

	for (const [slot, tokenMap] of valueMap) {
		sharedTokens.set(slot, new Set(tokenMap.keys()));
	}

	return sharedTokens;
};

const applySharedTokenIntersections = (
	sharedTokens: Map<string, Set<string>>,
	valueMaps: TokenEntriesBySlot[]
) => {
	for (const valueMap of valueMaps) {
		intersectSharedTokensStep(sharedTokens, valueMap);

		if (sharedTokens.size === 0) {
			break;
		}
	}
};

const intersectSharedTokensBySlot = (
	tokensByValue: TokenEntriesBySlot[]
): Map<string, Set<string>> => {
	const firstValueMap = tokensByValue[0];

	/* c8 ignore next 3 -- callers guarantee tokensByValue has at least two entries */
	if (!firstValueMap) {
		return new Map<string, Set<string>>();
	}

	const sharedTokens = seedSharedTokens(firstValueMap);

	applySharedTokenIntersections(sharedTokens, tokensByValue.slice(1));

	return sharedTokens;
};

const reportSharedTokenEntries = (
	context: Rule.RuleContext,
	tokensByValue: TokenEntriesBySlot[],
	variantKey: string,
	slot: string,
	token: string
) => {
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
};

const reportSharedTokensBySlot = (
	context: Rule.RuleContext,
	sharedTokens: Map<string, Set<string>>,
	tokensByValue: TokenEntriesBySlot[],
	variantKey: string
) => {
	for (const [slot, tokens] of sharedTokens) {
		for (const token of tokens) {
			reportSharedTokenEntries(
				context,
				tokensByValue,
				variantKey,
				slot,
				token
			);
		}
	}
};

const collectExhaustiveVariantKeys = (
	config: Map<string, Node>
): Set<string> => {
	const exhaustive = new Set<string>(
		getProperties(config.get('defaultVariants')).keys()
	);
	const requiredVariants = config.get('requiredVariants');

	if (requiredVariants) {
		forEachStringLiteralElement(requiredVariants, (value) => {
			exhaustive.add(value);
		});
	}

	return exhaustive;
};

const collectVariantTokensByValue = (
	variantEntries: Map<string, Node>,
	variantKey: string,
	slotNames: Set<string>,
	sourceCode: SourceCode
): TokenEntriesBySlot[] => {
	const tokensByValue: TokenEntriesBySlot[] = [];

	for (const [valueKey, valueNode] of variantEntries) {
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

	return tokensByValue;
};

const analyzeVariantSharedTokens = (
	context: Rule.RuleContext,
	variantKey: string,
	variantValue: Node,
	slotNames: Set<string>
) => {
	// Boolean shorthand has a single branch — no cross-value comparison.
	if (isBooleanShorthandVariant(variantValue, slotNames)) {
		return;
	}

	const valueEntries = getStrictProperties(variantValue);

	// A spread or computed key means we can't see every value; we'd
	// over-flag tokens that may differ in the unseen branches.
	if (!valueEntries || valueEntries.size < 2) {
		return;
	}

	const { sourceCode } = context;
	const tokensByValue = collectVariantTokensByValue(
		valueEntries,
		variantKey,
		slotNames,
		sourceCode
	);

	const sharedTokens = intersectSharedTokensBySlot(tokensByValue);

	reportSharedTokensBySlot(context, sharedTokens, tokensByValue, variantKey);
};

const getConfigSlotNames = (config: Map<string, Node>): Set<string> => {
	const slotNames = new Set(getProperties(config.get('slots')).keys());

	slotNames.delete('base');

	return slotNames;
};

const analyzeExhaustiveVariants = (
	context: Rule.RuleContext,
	variants: ObjectExpression,
	exhaustive: Set<string>,
	slotNames: Set<string>
) => {
	for (const [variantKey, variantValue] of getProperties(variants)) {
		if (!exhaustive.has(variantKey)) {
			continue;
		}

		analyzeVariantSharedTokens(
			context,
			variantKey,
			variantValue,
			slotNames
		);
	}
};

const analyzeSharedTokens = (context: Rule.RuleContext, configNode: Node) => {
	const config = getProperties(configNode);
	const variants = config.get('variants');

	if (!variants || variants.type !== 'ObjectExpression') {
		return;
	}

	analyzeExhaustiveVariants(
		context,
		variants,
		collectExhaustiveVariantKeys(config),
		getConfigSlotNames(config)
	);
};

/**
 * Flags class name tokens that appear in every value of an exhaustively-covered
 * variant — the token is constant in the rendered output and belongs in `base`
 * (or the corresponding `slots[slot]` entry) rather than being repeated across
 * each variant value. Coverage is treated as exhaustive when the variant has a
 * `defaultVariants` entry or is listed in `requiredVariants`.
 */
const noSharedTokens: Rule.RuleModule = {
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

const isEmptyStringNode = (node: Node): boolean =>
	getStaticStringText(node) === '';

const shouldReportEmptyString = (
	node: Node,
	allowEmptyString: boolean
): boolean => !allowEmptyString && isEmptyStringNode(node);

const isEmptyObjectExpression = (node: Node): node is ObjectExpression =>
	node.type === 'ObjectExpression' && node.properties.length === 0;

// `allowEmptyString` is set at the top of a `slots[key]` value, where `''`
// is a meaningful "slot with no default classes" declaration.
const visitArrayForEmpty = (
	context: Rule.RuleContext,
	node: ArrayExpression
) => {
	if (node.elements.length === 0) {
		context.report({ node, messageId: 'emptyArray' });
		return;
	}

	forEachStaticItem(node.elements, (element) => {
		visitForEmptyClasses(context, element, false);
	});
};

const visitForEmptyClasses = (
	context: Rule.RuleContext,
	node: Node,
	allowEmptyString: boolean
) => {
	if (shouldReportEmptyString(node, allowEmptyString)) {
		context.report({ node, messageId: 'emptyString' });
		return;
	}

	if (node.type === 'ArrayExpression') {
		visitArrayForEmpty(context, node);
		return;
	}

	if (isEmptyObjectExpression(node)) {
		context.report({ node, messageId: 'emptyObject' });
	}
};

const visitRecordEntriesForEmpty = (
	context: Rule.RuleContext,
	node: ObjectExpression,
	allowEmptyString: boolean
) => {
	if (node.properties.length === 0) {
		context.report({ node, messageId: 'emptyObject' });
		return;
	}

	for (const value of getProperties(node).values()) {
		visitForEmptyClasses(context, value, allowEmptyString);
	}
};

const visitVariantValueForEmpty = (
	context: Rule.RuleContext,
	variantValue: Node
) => {
	if (variantValue.type === 'ObjectExpression') {
		visitRecordEntriesForEmpty(context, variantValue, false);
		return;
	}

	visitForEmptyClasses(context, variantValue, false);
};

const checkVariantsForEmpty = (context: Rule.RuleContext, value: Node) => {
	if (value.type !== 'ObjectExpression') {
		return;
	}

	if (value.properties.length === 0) {
		context.report({ node: value, messageId: 'emptyObject' });
		return;
	}

	for (const variantValue of getProperties(value).values()) {
		visitVariantValueForEmpty(context, variantValue);
	}
};

const checkCompoundsForEmpty = (context: Rule.RuleContext, value: Node) => {
	if (value.type !== 'ArrayExpression') {
		return;
	}

	if (value.elements.length === 0) {
		context.report({ node: value, messageId: 'emptyArray' });
		return;
	}

	forEachCompoundClass(value, (cls) => {
		visitForEmptyClasses(context, cls, false);
	});
};

const checkSlotsForEmpty = (context: Rule.RuleContext, value: Node) => {
	if (value.type === 'ObjectExpression') {
		visitRecordEntriesForEmpty(context, value, true);
	}
};

const svEmptyConfigValueCheckers: Record<string, SvConfigValueChecker> = {
	base: (context, node) => {
		visitForEmptyClasses(context, node, false);
	},
	slots: checkSlotsForEmpty,
	variants: checkVariantsForEmpty,
	compoundVariants: checkCompoundsForEmpty,
	compoundSlots: checkCompoundsForEmpty
};

const checkSvConfigForEmpty = (
	context: Rule.RuleContext,
	configNode: ObjectExpression
) => {
	for (const [key, value] of getProperties(configNode)) {
		svEmptyConfigValueCheckers[key]?.(context, value);
	}
};

/**
 * Flags empty class values — empty strings, empty arrays, and empty objects —
 * in `sv()` and `cn()` calls, plus zero-argument `sv()` / `cn()` calls (which
 * always produce an empty class string). Inside an `sv()` config, an empty
 * string is still allowed as a direct `slots[key]` value, since declaring a
 * slot with no default classes is a meaningful use case.
 */
const noEmptyClasses: Rule.RuleModule = {
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
const meta = { name: 'slot-variants' };

const plugin = { meta, rules };

export default plugin;