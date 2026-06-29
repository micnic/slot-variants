import type { Linter, Rule, Scope, SourceCode } from 'eslint';
import type {
	CallExpression,
	Expression,
	ImportDeclaration,
	Node,
	ObjectExpression,
	Property,
	SpreadElement
} from 'estree';

// Surfaced by ESLint as each rule's documentation link (editors, the `--format`
// output, etc.). Points at the plugin's rule reference in the README.
const DOCS_URL = 'https://github.com/micnic/slot-variants#rules';

const CONFIG_KEYS = new Set([
	'base',
	'variants',
	'slots',
	'compoundVariants',
	'compoundSlots',
	'defaultVariants',
	'requiredVariants',
	'multiSlots',
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

const EMPTY_PROPERTIES: ReadonlyMap<string, Node> = new Map();

const propertiesCache = new WeakMap<ObjectExpression, ReadonlyMap<string, Node>>();
const strictPropertiesCache = new WeakMap<
	ObjectExpression,
	ReadonlyMap<string, Node> | null
>();

const buildPropertiesMap = (obj: ObjectExpression): ReadonlyMap<string, Node> => {
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

const getProperties = (obj: Node | undefined): ReadonlyMap<string, Node> => {
	if (!obj || obj.type !== 'ObjectExpression') {
		return EMPTY_PROPERTIES;
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
): ReadonlyMap<string, Node> | null => {
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

const getStrictProperties = (
	obj: Node | undefined
): ReadonlyMap<string, Node> | null => {
	if (!obj || obj.type !== 'ObjectExpression') {
		return null;
	}

	const cached = strictPropertiesCache.get(obj);

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
): key is string => key !== null && (key === 'base' || slotNames.has(key));

const buildSlotKeyedMap = (
	obj: ObjectExpression,
	slotNames: Set<string>
): ReadonlyMap<string, Node> | null => {
	const result = new Map<string, Node>();

	for (const prop of obj.properties) {
		if (prop.type !== 'Property') {
			return null;
		}

		const key = getKeyName(prop);

		if (!isSlotKeyedPropertyKey(key, slotNames)) {
			return null;
		}

		result.set(key, prop.value);
	}

	return result;
};

const collectSlotKeyedProperties = (
	node: Node,
	slotNames: Set<string>
): ReadonlyMap<string, Node> | null => {
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

const getIdentifierCalleeName = (node: CallExpression): string | null => {
	if (node.callee.type === 'Identifier') {
		return node.callee.name;
	}

	return null;
};

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

const getVariantSource = (entry: Entry): VariantSource | null => {
	if (entry.source.kind === 'variant') {
		return entry.source;
	}

	return null;
};

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
	// String/untagged-template delimiters are single-char, so the node's
	// start offset + 1 is the first inner character.
	const raw = sourceCode.getText(node);
	const inner = raw.slice(1, -1);
	const base = sourceCode.getRange(node)[0] + 1;

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
		forEachStaticItem(node.elements, (element) => {
			extractTokens(element, slot, source, slotNames, entries, sourceCode);
		});
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
		const text = getStaticStringText(element);

		if (text !== null) {
			visit(text);
		}
	});
};

const matchCompoundClass = (
	element: Expression | SpreadElement | null
): { cls: Node; compound: ReadonlyMap<string, Node> } | null => {
	if (element?.type !== 'ObjectExpression') {
		return null;
	}

	const compound = getProperties(element);
	const cls = compound.get('class') ?? compound.get('className');

	if (!cls) {
		return null;
	}

	return { cls, compound };
};

const forEachCompoundClass = (
	node: Node | undefined,
	visit: (cls: Node, compound: ReadonlyMap<string, Node>) => void
) => {
	if (!node || node.type !== 'ArrayExpression') {
		return;
	}

	forEachStaticItem(node.elements, (element) => {
		const match = matchCompoundClass(element);

		if (match) {
			visit(match.cls, match.compound);
		}
	});
};

type ExtractFn = (node: Node, slot: string, source: Source) => void;

const extractVariantTokens = (
	variantsMap: ReadonlyMap<string, Node>,
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
	config: ReadonlyMap<string, Node>,
	slotNames: Set<string>,
	baseArgs: ReadonlyArray<Expression | SpreadElement>,
	sourceCode: SourceCode
): Entry[] => {
	const entries: Entry[] = [];
	const extract: ExtractFn = (node, slot, source) => {
		extractTokens(node, slot, source, slotNames, entries, sourceCode);
	};

	for (const [slotKey, slotValue] of getProperties(config.get('slots'))) {
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

const reportDynamic = (context: Rule.RuleContext, node: Node) => {
	context.report({ node, messageId: 'dynamic' });
};

const isUndefinedIdentifier = (node: Node): boolean =>
	node.type === 'Identifier' && node.name === 'undefined';

const isLogicalClassStaticString = (node: Node): boolean =>
	node.type === 'LogicalExpression' &&
	node.operator === '&&' &&
	isStaticStringNode(node.right);

type StaticClassValueOptions = {
	allowNestedArrays?: boolean;
	allowUndefined?: boolean;
	allowLogicalString?: boolean;
	allowClassRecord?: boolean;
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

const checkClassValueIsStatic = (
	context: Rule.RuleContext,
	node: Node,
	options: StaticClassValueOptions = {}
) => {
	if (options.allowUndefined && isUndefinedIdentifier(node)) {
		return;
	}

	if (isStaticStringNode(node)) {
		return;
	}

	if (options.allowLogicalString && isLogicalClassStaticString(node)) {
		return;
	}

	if (node.type === 'ArrayExpression') {
		forEachItemReportingSpread(context, node.elements, (element) => {
			if (options.allowNestedArrays === false) {
				if (element.type === 'ArrayExpression') {
					reportDynamic(context, element);
					return;
				}
			}

			checkClassValueIsStatic(context, element, {
				allowLogicalString: options.allowLogicalString === true,
				allowClassRecord: options.allowClassRecord === true
			});
		});

		return;
	}

	if (options.allowClassRecord && node.type === 'ObjectExpression') {
		checkClassRecordKeys(context, node);
		return;
	}

	reportDynamic(context, node);
};

const checkConfigClassValueIsStatic = (
	context: Rule.RuleContext,
	node: Node
) => {
	checkClassValueIsStatic(context, node, {
		allowNestedArrays: false,
		allowUndefined: true
	});
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

// In cn-style arguments an ObjectExpression is a clsx-style record: its keys
// are class names and its values are runtime conditions. Only the keys must be
// statically known — spreads and computed keys make the class name dynamic, so
// forEachStaticProperty reports them; the condition values are left alone.
const checkClassRecordKeys = (
	context: Rule.RuleContext,
	node: ObjectExpression
) => {
	forEachStaticProperty(context, node, () => {});
};

const checkClassValueRecord = (context: Rule.RuleContext, node: Node) => {
	if (node.type !== 'ObjectExpression') {
		reportDynamic(context, node);
		return;
	}

	forEachStaticProperty(context, node, (prop) => {
		checkConfigClassValueIsStatic(context, prop.value);
	});
};

const checkSlotKeyedClassValueRecord = (
	context: Rule.RuleContext,
	node: ObjectExpression
) => {
	for (const value of getProperties(node).values()) {
		checkConfigClassValueIsStatic(context, value);
	}
};

const isSlotKeyedClassValueRecord = (
	node: ObjectExpression,
	slotNames: Set<string>
): boolean => collectSlotKeyedProperties(node, slotNames) !== null;

const checkVariantBranchValue = (
	context: Rule.RuleContext,
	node: Node,
	slotNames: Set<string>
) => {
	if (node.type === 'ObjectExpression') {
		if (isSlotKeyedClassValueRecord(node, slotNames)) {
			checkSlotKeyedClassValueRecord(context, node);
			return;
		}
	}

	checkConfigClassValueIsStatic(context, node);
};

const checkValueKeyedVariant = (
	context: Rule.RuleContext,
	node: ObjectExpression,
	slotNames: Set<string>
) => {
	forEachStaticProperty(context, node, (prop) => {
		checkVariantBranchValue(context, prop.value, slotNames);
	});
};

const checkVariantDefinition = (
	context: Rule.RuleContext,
	node: Node,
	slotNames: Set<string>
) => {
	if (node.type === 'ObjectExpression') {
		if (isSlotKeyedClassValueRecord(node, slotNames)) {
			checkSlotKeyedClassValueRecord(context, node);
			return;
		}

		checkValueKeyedVariant(context, node, slotNames);
		return;
	}

	checkConfigClassValueIsStatic(context, node);
};

const checkVariants = (
	context: Rule.RuleContext,
	node: Node,
	slotNames: Set<string>
) => {
	if (node.type !== 'ObjectExpression') {
		reportDynamic(context, node);
		return;
	}

	forEachStaticProperty(context, node, (prop) => {
		checkVariantDefinition(context, prop.value, slotNames);
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

const getCompoundEntryValueChecker = (
	key: string | null,
	hasSlotsKey: boolean
): SvConfigValueChecker | null => {
	if (key === 'class' || key === 'className') {
		return checkConfigClassValueIsStatic;
	}

	if (key === 'slots') {
		if (hasSlotsKey) {
			return checkCompoundSlotsArray;
		}

		return null;
	}

	return null;
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
	base: checkConfigClassValueIsStatic,
	slots: checkClassValueRecord,
	compoundVariants: (context, node) => {
		checkCompoundEntries(context, node, false);
	},
	compoundSlots: (context, node) => {
		checkCompoundEntries(context, node, true);
	}
};

const checkSvConfigProperty = (
	context: Rule.RuleContext,
	prop: Property,
	slotNames: Set<string>
) => {
	const key = getKeyName(prop);

	if (key === 'variants') {
		checkVariants(context, prop.value, slotNames);
		return;
	}

	if (key !== null) {
		svConfigValueCheckers[key]?.(context, prop.value);
	}
};

// Non-class-bearing keys (defaultVariants, presets, etc.) are not checked.
const checkSvConfig = (
	context: Rule.RuleContext,
	configNode: ObjectExpression
) => {
	const slotNames = getConfigSlotNames(getProperties(configNode));

	forEachStaticProperty(context, configNode, (prop) => {
		checkSvConfigProperty(context, prop, slotNames);
	});
};

const checkCnArguments = (
	context: Rule.RuleContext,
	args: ReadonlyArray<Expression | SpreadElement>
) => {
	forEachItemReportingSpread(context, args, (arg) => {
		checkClassValueIsStatic(context, arg, {
			allowLogicalString: true,
			allowClassRecord: true
		});
	});
};

const getImportedName = (
	specifier: ImportDeclaration['specifiers'][number]
): string | null => {
	if (specifier.type !== 'ImportSpecifier') {
		return null;
	}

	const { imported } = specifier;

	if (imported.type === 'Identifier') {
		return imported.name;
	}

	return String(imported.value);
};

const trackNamedImport = (
	specifier: ImportDeclaration['specifiers'][number],
	trackedNamesByImport: Record<string, Set<string>>
) => {
	const importedName = getImportedName(specifier);

	if (importedName === null) {
		return;
	}

	trackedNamesByImport[importedName]?.add(specifier.local.name);
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

// A call whose callee name matches a tracked import could still be a local
// binding that shadows it (e.g. a function parameter named `cn`). Resolve the
// callee identifier to its variable and confirm it's an import binding.
const calleeResolvesToImport = (
	context: Rule.RuleContext,
	node: CallExpression
): boolean => {
	/* c8 ignore next 3 -- matchSvCnCall only returns a match for an Identifier callee */
	if (node.callee.type !== 'Identifier') {
		return false;
	}

	const { name } = node.callee;
	let scope: Scope.Scope = context.sourceCode.getScope(node);

	while (true) {
		const variable = scope.set.get(name);

		if (variable) {
			return variable.defs.some((def) => def.type === 'ImportBinding');
		}

		/* c8 ignore next 3 -- a tracked-name callee always resolves before global scope */
		if (!scope.upper) {
			return false;
		}

		scope = scope.upper;
	}
};

const createTrackedCallListeners = (
	context: Rule.RuleContext,
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

			if (call && calleeResolvesToImport(context, node)) {
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
				'Disallow dynamic values in sv() and cn() calls — only statically inferrable class values are allowed',
			recommended: true,
			url: DOCS_URL
		},
		schema: [],
		messages: {
			dynamic:
				'Dynamic value in sv()/cn() call. Only statically inferrable class values are allowed.'
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (_node, call) => {
			checkCnArguments(context, call.args);

			if (call.config) {
				checkSvConfig(context, call.config);
			}
		});
	}
};

const hasRedundantSpaces = (value: string): boolean =>
	!/^(?:\S+(?: \S+)*)?$/.test(value);

const canonicalizeWhitespace = (value: string): string =>
	value.split(/\s+/).filter(Boolean).join(' ');

// Class tokens shouldn't contain the surrounding quote, backslashes, or `${` —
// re-emitting at the same delimiter is safe without escaping.
/* c8 ignore next 7 -- realistic class tokens don't contain backslashes, quotes, or `${` */
const canHoistAsLiteral = (canonical: string, quote: string): boolean => {
	if (canonical.includes('\\') || canonical.includes(quote)) {
		return false;
	}

	return quote !== '`' || !canonical.includes('${');
};

// Highlights the whole literal: span-level reports would need to chase
// raw-text/escape-sequence mismatches.
const reportRedundantSpaces = (
	context: Rule.RuleContext,
	node: Node,
	value: string
) => {
	if (!hasRedundantSpaces(value)) {
		return;
	}

	const raw = context.sourceCode.getText(node);
	/* c8 ignore next -- a string-literal/template node always has at least one delimiter char */
	const quote = raw[0] ?? '';
	const canonical = canonicalizeWhitespace(value);

	context.report({
		node,
		messageId: 'redundant',
		fix: (fixer) => {
			/* c8 ignore next 3 -- canHoistAsLiteral is itself ignored above */
			if (!canHoistAsLiteral(canonical, quote)) {
				return null;
			}

			return fixer.replaceText(node, `${quote}${canonical}${quote}`);
		}
	});
};

const getStaticStringText = (node: Node): string | null => {
	if (node.type === 'Literal') {
		if (typeof node.value === 'string') {
			return node.value;
		}

		return null;
	}

	if (node.type !== 'TemplateLiteral' || node.expressions.length > 0) {
		return null;
	}

	const [quasi] = node.quasis;

	/* c8 ignore next 3 -- a TemplateLiteral always has at least one quasi */
	if (!quasi) {
		return null;
	}

	/* c8 ignore next -- cooked is always defined on untagged templates */
	return quasi.value.cooked ?? quasi.value.raw;
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
		forEachStaticItem(node.elements, (element) => {
			visitForRedundantSpaces(context, element);
		});
		return;
	}

	if (node.type === 'ObjectExpression') {
		visitObjectForRedundantSpaces(context, node);
	}
};

const checkRedundantSpacesRecord = (context: Rule.RuleContext, node: Node) => {
	if (node.type !== 'ObjectExpression') {
		return;
	}

	visitObjectForRedundantSpaces(context, node);
};

const checkCompoundsForRedundantSpaces = (
	context: Rule.RuleContext,
	node: Node
) => {
	forEachCompoundClass(node, (cls) => {
		visitForRedundantSpaces(context, cls);
	});
};

const svRedundantSpacesConfigValueCheckers: Record<
	string,
	SvConfigValueChecker
> = {
	base: visitForRedundantSpaces,
	slots: checkRedundantSpacesRecord,
	variants: checkRedundantSpacesRecord,
	compoundVariants: checkCompoundsForRedundantSpaces,
	compoundSlots: checkCompoundsForRedundantSpaces
};

const dispatchSvConfigCheckers = (
	context: Rule.RuleContext,
	configNode: ObjectExpression,
	checkers: Record<string, SvConfigValueChecker>
) => {
	for (const [key, value] of getProperties(configNode)) {
		checkers[key]?.(context, value);
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
				'Disallow redundant whitespace inside class strings passed to sv() and cn() calls',
			recommended: true,
			url: DOCS_URL
		},
		fixable: 'code',
		schema: [],
		messages: {
			redundant: 'Redundant whitespace in class string.'
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (_node, call) => {
			forEachStaticItem(call.args, (arg) => {
				visitForRedundantSpaces(context, arg);
			});

			if (call.config) {
				dispatchSvConfigCheckers(
					context,
					call.config,
					svRedundantSpacesConfigValueCheckers
				);
			}
		});
	}
};

// Returns null for tokens that don't look like a namespaced utility — single
// words (`flex`), purely-prefixed (`-`), or anything without a `-` after the
// optional leading negative marker. The `!` important marker is stripped —
// trailing (Tailwind v4 `w-200!`) or leading (Tailwind v3 `!w-200`) — so it
// doesn't split the conflict key.
const getConflictKey = (token: string): string | null => {
	let stripped = token;

	if (token.endsWith('!')) {
		stripped = token.slice(0, -1);
	}

	const lastColon = stripped.lastIndexOf(':');
	let variantPrefix = '';
	let utility = stripped;

	if (lastColon !== -1) {
		variantPrefix = stripped.slice(0, lastColon);
		utility = stripped.slice(lastColon + 1);
	}

	if (utility.startsWith('!')) {
		utility = utility.slice(1);
	}

	let utilStart = 0;

	if (utility.startsWith('-')) {
		utilStart = 1;
	}

	const firstDash = utility.indexOf('-', utilStart + 1);

	if (firstDash === -1) {
		return null;
	}

	return `${variantPrefix}|${utility.slice(utilStart, firstDash)}`;
};

type ConflictGroup = { tokens: Set<string>; entries: Entry[] };

const groupEntriesByConflictKey = (
	tokenMap: Map<string, Entry[]>
): Map<string, ConflictGroup> => {
	const groups = new Map<string, ConflictGroup>();

	for (const [token, list] of tokenMap) {
		const key = getConflictKey(token);

		if (key === null) {
			continue;
		}

		const group = getOrCreate(groups, key, () => ({
			tokens: new Set<string>(),
			entries: []
		}));

		group.tokens.add(token);
		group.entries.push(...list);
	}

	return groups;
};

const reportConflicts = (
	context: Rule.RuleContext,
	tokenMap: Map<string, Entry[]>,
	messageId: string,
	data: Record<string, string>
) => {
	for (const group of groupEntriesByConflictKey(tokenMap).values()) {
		if (group.tokens.size < 2 || isMutuallyExclusiveVariants(group.entries)) {
			continue;
		}

		const tokens = [...group.tokens].sort().join(', ');

		reportEntryList(context, group.entries, messageId, { tokens, ...data });
	}
};

const analyzeConfigForRule = (
	context: Rule.RuleContext,
	configNode: Node,
	baseArgs: ReadonlyArray<Expression | SpreadElement>
) => {
	const config = getProperties(configNode);
	const slotNames = getConfigSlotNames(config);
	const bySlot = indexEntriesBySlotAndToken(
		collectConfigEntries(config, slotNames, baseArgs, context.sourceCode)
	);

	for (const [slot, tokenMap] of bySlot) {
		reportDuplicateTokens(context, tokenMap, 'duplicate', { slot });
		reportConflicts(context, tokenMap, 'conflict', { slot });
	}
};

const analyzeCnForRule = (
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
		reportConflicts(context, tokenMap, 'conflictCn', {});
	}
};

/**
 * Flags class tokens that collide within the same slot output: exact-duplicate
 * tokens that will appear more than once (including across `base`, variants,
 * compounds, and within a single literal), and distinct tokens that target the
 * same Tailwind-style utility namespace (e.g. `w-100` and `w-200`). Tokens with
 * different variant prefixes (`w-100` vs `hover:w-200`) don't conflict, a
 * leading or trailing `!` important marker is ignored when computing the
 * namespace, and
 * tokens that only co-occur across mutually-exclusive variant values are not
 * flagged.
 */
const noConflictingClasses: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow duplicate class tokens and tokens targeting the same utility namespace within an sv() or cn() output',
			recommended: true,
			url: DOCS_URL
		},
		schema: [],
		messages: {
			duplicate:
				'Class "{{token}}" will appear more than once in the "{{slot}}" slot output.',
			duplicateCn:
				'Class "{{token}}" will appear more than once in the call output.',
			conflict:
				'Conflicting classes "{{tokens}}" target the same utility namespace in the "{{slot}}" slot output.',
			conflictCn:
				'Conflicting classes "{{tokens}}" target the same utility namespace in the call output.'
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (_node, call) => {
			if (call.config) {
				analyzeConfigForRule(context, call.config, call.args);
			} else {
				analyzeCnForRule(context, call.args);
			}
		});
	}
};

// A variant is "exhaustive" when it has a defaultVariants entry, is listed in
// requiredVariants, or every variant is required (`requiredVariants: true`).
// Without coverage the prop can be undefined at runtime, so a shared token
// isn't guaranteed to render.
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

		for (const token of tokens) {
			if (!tokenMap.has(token)) {
				tokens.delete(token);
			}
		}

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

const intersectSharedTokensBySlot = (
	tokensByValue: TokenEntriesBySlot[]
): Map<string, Set<string>> => {
	const firstValueMap = tokensByValue[0];

	/* c8 ignore next 3 -- callers guarantee tokensByValue has at least two entries */
	if (!firstValueMap) {
		return new Map<string, Set<string>>();
	}

	const sharedTokens = seedSharedTokens(firstValueMap);

	for (const valueMap of tokensByValue.slice(1)) {
		intersectSharedTokensStep(sharedTokens, valueMap);

		if (sharedTokens.size === 0) {
			break;
		}
	}

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

const isStaticDefinedDefaultVariantValue = (node: Node): boolean => {
	if (isUndefinedIdentifier(node)) {
		return false;
	}

	if (getStaticStringText(node) !== null) {
		return true;
	}

	return (
		node.type === 'Literal' &&
		(typeof node.value === 'boolean' || typeof node.value === 'number')
	);
};

const collectDefaultVariantKeys = (
	defaultVariants: Node | undefined
): Set<string> => {
	const keys = new Set<string>();

	for (const [key, value] of getProperties(defaultVariants)) {
		if (isStaticDefinedDefaultVariantValue(value)) {
			keys.add(key);
		}
	}

	return keys;
};

const isLiteralTrue = (node: Node): boolean =>
	node.type === 'Literal' && node.value === true;

const collectExhaustiveVariantKeys = (
	config: ReadonlyMap<string, Node>
): Set<string> => {
	const exhaustive = collectDefaultVariantKeys(
		config.get('defaultVariants')
	);
	const requiredVariants = config.get('requiredVariants');

	if (!requiredVariants) {
		return exhaustive;
	}

	// `requiredVariants: true` makes every variant required — hence exhaustive.
	if (isLiteralTrue(requiredVariants)) {
		for (const key of getProperties(config.get('variants')).keys()) {
			exhaustive.add(key);
		}

		return exhaustive;
	}

	forEachStringLiteralElement(requiredVariants, (value) => {
		exhaustive.add(value);
	});

	return exhaustive;
};

const collectVariantTokensByValue = (
	variantEntries: ReadonlyMap<string, Node>,
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

const getConfigSlotNames = (config: ReadonlyMap<string, Node>): Set<string> => {
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
 * `defaultVariants` entry, is listed in `requiredVariants`, or every variant is
 * required via `requiredVariants: true`.
 */
const noSharedTokens: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow class tokens that appear in every value of an exhaustively-covered variant — lift them out of the variant',
			recommended: true,
			url: DOCS_URL
		},
		schema: [],
		messages: {
			shared: 'Class "{{token}}" appears in every value of variant "{{variant}}" for slot "{{slot}}" — lift it out of the variant.'
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (_node, call) => {
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

type ListItems = ReadonlyArray<Node | null>;

// Removes `node` (a member of `list`) along with the adjacent comma so the
// surrounding call/array literal stays syntactically valid. Returns null when
// removal would empty the list — the resulting empty call/array is itself
// reported separately, so we leave it for the developer.
const removeFromList = (
	fixer: Rule.RuleFixer,
	sourceCode: SourceCode,
	node: Node,
	list: ListItems
): Rule.Fix | null => {
	let nonNullCount = 0;

	for (const item of list) {
		if (item) {
			nonNullCount += 1;
		}
	}

	if (nonNullCount <= 1) {
		return null;
	}

	const [start, end] = sourceCode.getRange(node);
	const after = sourceCode.getTokenAfter(node);

	if (after && after.value === ',') {
		return fixer.removeRange([start, after.range[1]]);
	}

	const before = sourceCode.getTokenBefore(node);

	/* c8 ignore next 3 -- a non-trailing list element always has a comma after; trailing always has one before */
	if (!before || before.value !== ',') {
		return null;
	}

	return fixer.removeRange([before.range[0], end]);
};

// A fix that removes the offending node — built by `makeListFix` for an
// element of a call/array list, or supplied directly for a config property.
type EmptyFix = (fixer: Rule.RuleFixer) => Rule.Fix | null;

const makeListFix = (
	context: Rule.RuleContext,
	node: Node,
	list: ListItems
): EmptyFix => {
	return (fixer) => removeFromList(fixer, context.sourceCode, node, list);
};

// `allowEmptyString` is set at the top of a `slots[key]` value, where `''`
// is a meaningful "slot with no default classes" declaration. `fix`, when
// provided, removes `node` (and its adjacent comma) on `--fix`.
const visitForEmptyClasses = (
	context: Rule.RuleContext,
	node: Node,
	allowEmptyString: boolean,
	fix?: EmptyFix
) => {
	if (shouldReportEmptyString(node, allowEmptyString)) {
		context.report({ node, messageId: 'emptyString', fix });
		return;
	}

	if (node.type === 'ArrayExpression') {
		if (node.elements.length === 0) {
			context.report({ node, messageId: 'emptyArray', fix });
			return;
		}

		forEachStaticItem(node.elements, (element) => {
			visitForEmptyClasses(
				context,
				element,
				false,
				makeListFix(context, element, node.elements)
			);
		});
		return;
	}

	if (isEmptyObjectExpression(node)) {
		context.report({ node, messageId: 'emptyObject', fix });
	}
};

const visitVariantRecordForEmpty = (
	context: Rule.RuleContext,
	node: ObjectExpression,
	remove?: EmptyFix
) => {
	if (node.properties.length === 0) {
		context.report({ node, messageId: 'emptyObject', fix: remove });
		return;
	}

	for (const value of getProperties(node).values()) {
		visitVariantValueForEmpty(context, value);
	}
};

const visitVariantValueForEmpty = (
	context: Rule.RuleContext,
	variantValue: Node
) => {
	if (variantValue.type === 'ObjectExpression') {
		visitVariantRecordForEmpty(context, variantValue);
		return;
	}

	visitForEmptyClasses(context, variantValue, false);
};

const checkVariantsForEmpty = (
	context: Rule.RuleContext,
	value: Node,
	remove: EmptyFix
) => {
	if (value.type !== 'ObjectExpression') {
		return;
	}

	visitVariantRecordForEmpty(context, value, remove);
};

const checkCompoundsForEmpty = (
	context: Rule.RuleContext,
	value: Node,
	remove: EmptyFix
) => {
	if (value.type !== 'ArrayExpression') {
		return;
	}

	if (value.elements.length === 0) {
		context.report({ node: value, messageId: 'emptyArray', fix: remove });
		return;
	}

	forEachCompoundClass(value, (cls) => {
		visitForEmptyClasses(context, cls, false);
	});
};

const checkSlotsForEmpty = (
	context: Rule.RuleContext,
	value: Node,
	remove: EmptyFix
) => {
	if (value.type !== 'ObjectExpression') {
		return;
	}

	if (value.properties.length === 0) {
		context.report({ node: value, messageId: 'emptyObject', fix: remove });
		return;
	}

	for (const slotValue of getProperties(value).values()) {
		visitForEmptyClasses(context, slotValue, true);
	}
};

type EmptyConfigChecker = (
	context: Rule.RuleContext,
	value: Node,
	remove: EmptyFix
) => void;

const svEmptyConfigValueCheckers: Record<string, EmptyConfigChecker> = {
	base: (context, node, remove) => {
		visitForEmptyClasses(context, node, false, remove);
	},
	slots: checkSlotsForEmpty,
	variants: checkVariantsForEmpty,
	compoundVariants: checkCompoundsForEmpty,
	compoundSlots: checkCompoundsForEmpty
};

// A recognized `sv()` config (see `isConfigLike`) has only plain, statically
// keyed properties — so an empty top-level class property can be dropped
// wholesale, removing the property and its comma.
const checkConfigForEmptyClasses = (
	context: Rule.RuleContext,
	config: ObjectExpression
) => {
	for (const prop of config.properties) {
		/* c8 ignore next 3 -- a recognized config has no spread properties */
		if (prop.type !== 'Property') {
			continue;
		}

		const key = getKeyName(prop);

		/* c8 ignore next 3 -- a recognized config has only static, non-computed keys */
		if (key === null) {
			continue;
		}

		const checker = svEmptyConfigValueCheckers[key];

		if (checker) {
			checker(context, prop.value, (fixer) =>
				removeFromList(fixer, context.sourceCode, prop, config.properties)
			);
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
const noEmptyClasses: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow empty class values (empty strings, arrays, or objects) and zero-argument calls in sv() and cn()',
			recommended: true,
			url: DOCS_URL
		},
		fixable: 'code',
		schema: [],
		messages: {
			emptyString: 'Empty class string is not allowed.',
			emptyArray: 'Empty class array is not allowed.',
			emptyObject: 'Empty class object is not allowed.',
			emptyCall: 'Empty sv()/cn() call is not allowed.'
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (node, call) => {
			if (node.arguments.length === 0) {
				context.report({ node, messageId: 'emptyCall' });
				return;
			}

			forEachStaticItem(call.args, (arg) => {
				visitForEmptyClasses(
					context,
					arg,
					false,
					makeListFix(context, arg, node.arguments)
				);
			});

			if (call.config) {
				checkConfigForEmptyClasses(context, call.config);
			}
		});
	}
};

// An `sv()` config call compiles the variant function (and seeds its cache)
// once. Nesting it inside a function rebuilds all of that — and discards the
// cache — on every call, so the config form belongs at module scope. A
// function scope anywhere above the call means it isn't top level.
const isInsideFunctionScope = (scope: Scope.Scope): boolean => {
	let current: Scope.Scope | null = scope;

	while (current) {
		if (current.type === 'function') {
			return true;
		}

		current = current.upper;
	}

	return false;
};

/**
 * Flags `sv()` calls made with a config object that aren't at the module top
 * level. The config form compiles the variant function once; nesting it inside
 * a function recreates that work — and throws away the variant cache — on every
 * call, so it must live at module scope. The cn-style calling convention of
 * `sv()` (and every `cn()` call) carries no config and is left alone.
 */
const requireTopLevelConfig: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Require sv() calls with a config object to be at the module top level',
			recommended: true,
			url: DOCS_URL
		},
		schema: [],
		messages: {
			nested:
				'sv() with a config object must be called at the module top level, not nested inside a function — otherwise its compiled config and variant cache are rebuilt on every call.'
		}
	},
	create(context) {
		return createTrackedCallListeners(context, (node, call) => {
			if (!call.config) {
				return;
			}

			if (isInsideFunctionScope(context.sourceCode.getScope(node))) {
				context.report({ node, messageId: 'nested' });
			}
		});
	}
};

/**
 * Rules exported by the plugin.
 */
export const rules = {
	'no-conflicting-classes': noConflictingClasses,
	'no-dynamic-classes': noDynamicClasses,
	'no-empty-classes': noEmptyClasses,
	'no-redundant-spaces': noRedundantSpaces,
	'no-shared-tokens': noSharedTokens,
	'require-top-level-config': requireTopLevelConfig
};

/**
 * Plugin metadata.
 */
const meta = { name: 'slot-variants' };

// Derived from each rule's `meta.docs.recommended` flag so adding a rule to
// the preset is a single edit on the rule itself.
const recommendedRules: Record<string, 'error'> = {};

for (const [name, rule] of Object.entries(rules)) {
	if (rule.meta?.docs?.recommended === true) {
		recommendedRules[`slot-variants/${name}`] = 'error';
	}
}

const plugin = {
	meta,
	rules,
	configs: {} as Record<string, Linter.Config>
};

/**
 * Flat-config preset enabling every rule at `error`. Spread into your ESLint
 * v9+ config array (or list under `oxlint`'s `extends`) instead of wiring up
 * each rule by hand.
 */
plugin.configs.recommended = {
	// A `name` lets the config object be identified in `eslint --inspect-config`
	// and in config-resolution error messages.
	name: 'slot-variants/recommended',
	plugins: { 'slot-variants': plugin },
	rules: recommendedRules
};

export default plugin;