import type { Rule, Scope, SourceCode } from 'eslint';
import type {
	ArrayExpression,
	CallExpression,
	ConditionalExpression,
	Expression,
	Identifier,
	ImportDeclaration,
	Node,
	ObjectExpression,
	Property,
	SpreadElement,
	TemplateElement,
	TemplateLiteral
} from 'estree';

export const DOCS_URL = 'https://github.com/micnic/slot-variants#rules';

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

const propertiesCache = new WeakMap<
	ObjectExpression,
	ReadonlyMap<string, Node>
>();
const strictPropertiesCache = new WeakMap<
	ObjectExpression,
	ReadonlyMap<string, Node> | null
>();

const buildPropertiesMap = (
	obj: ObjectExpression
): ReadonlyMap<string, Node> => {
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
	// True only for a `createSV(defaults)` factory call — it compiles no variant
	// function, so it's exempt from require-top-level-config and the empty-call check.
	isFactoryConfig?: boolean;
};

// Resolves the last arg through hoisted `const` bindings so `const config = {...};
// sv(config)` is analyzed as a config call rather than a cn-style argument list.
const matchSvCall = (
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

const matchSvCnCall = (
	node: CallExpression,
	calleeName: string,
	svNames: Set<string>,
	cnNames: Set<string>,
	sourceCode: SourceCode
): CallMatch | null => {
	if (svNames.has(calleeName)) {
		return matchSvCall(node, sourceCode);
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

// The conditions a token renders under, as key -> required-value matchers: a
// variant value is one matcher, a compound entry one per matcher property, a
// cn-style conditional a synthetic `cond:`/`ternary@` matcher; nested
// conditionals accumulate.
type VariantMatchers = ReadonlyMap<string, string>;

type Source =
	| { kind: 'base' }
	| { kind: 'variant'; matchers: VariantMatchers }
	| { kind: 'compound' };

const baseSource: Source = { kind: 'base' };
// No readable matcher — never exclusive with anything.
const compoundSource: Source = { kind: 'compound' };

const variantSource = (key: string, value: string): Source => ({
	kind: 'variant',
	matchers: new Map([[key, value]])
});

// Accumulates onto an existing variant source so nested conditionals keep
// their outer conditions.
const withMatcher = (source: Source, key: string, value: string): Source => {
	if (source.kind !== 'variant') {
		return variantSource(key, value);
	}

	const matchers = new Map(source.matchers);

	matchers.set(key, value);

	return { kind: 'variant', matchers };
};

type Entry = {
	source: Source;
	slot: string;
	token: string;
	start: number;
	end: number;
};

type TokenEntriesBySlot = Map<string, Map<string, Entry[]>>;

const getEntryMatchers = (entry: Entry): VariantMatchers | null => {
	if (entry.source.kind === 'variant') {
		return entry.source.matchers;
	}

	return null;
};

// Exclusive when some key they both constrain requires different values —
// no render can satisfy both.
const areExclusiveMatchers = (
	a: VariantMatchers,
	b: VariantMatchers
): boolean => {
	for (const [key, value] of a) {
		const other = b.get(key);

		if (other !== undefined && other !== value) {
			return true;
		}
	}

	return false;
};

// True when every pair of entries disagrees on at least one shared matcher
// key, so they can't co-occur.
const isMutuallyExclusiveVariants = (list: Entry[]): boolean => {
	const matchers: VariantMatchers[] = [];

	for (const entry of list) {
		const entryMatchers = getEntryMatchers(entry);

		if (entryMatchers === null) {
			return false;
		}

		matchers.push(entryMatchers);
	}

	for (const [index, current] of matchers.entries()) {
		for (const other of matchers.slice(index + 1)) {
			if (!areExclusiveMatchers(current, other)) {
				return false;
			}
		}
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
	data: Record<string, string>,
	fix?: (fixer: Rule.RuleFixer) => Rule.Fix[] | null
) => {
	const { sourceCode } = context;

	for (const entry of entries) {
		context.report({
			loc: {
				start: sourceCode.getLocFromIndex(entry.start),
				end: sourceCode.getLocFromIndex(entry.end)
			},
			messageId,
			data,
			fix
		});
	}
};

// Safe for cn() too: isMutuallyExclusiveVariants short-circuits to false on
// non-variant entries, so base-only token lists are never skipped.
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

// Walks outward so shadowing is respected.
const findVariable = (
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
const resolveStaticValue = (node: Node, sourceCode: SourceCode): Node => {
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

const pushTokensFromText = (
	text: string,
	base: number,
	slot: string,
	source: Source,
	entries: Entry[]
) => {
	for (const match of text.matchAll(/\S+/g)) {
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

const pushStringLiteralTokens = (
	node: Node,
	slot: string,
	source: Source,
	entries: Entry[],
	sourceCode: SourceCode
) => {
	// String/template delimiters are single-char, so start offset + 1 is the
	// first inner character.
	const raw = sourceCode.getText(node);
	const base = sourceCode.getRange(node)[0] + 1;

	pushTokensFromText(raw.slice(1, -1), base, slot, source, entries);
};

// Flattens a (possibly chained) ternary into its leaf branches — exactly one
// renders, so each is a mutually-exclusive alternative.
const collectBranchLeaves = (node: Node, leaves: Node[]) => {
	if (node.type === 'ConditionalExpression') {
		collectBranchLeaves(node.consequent, leaves);
		collectBranchLeaves(node.alternate, leaves);
		return;
	}

	leaves.push(node);
};

// Keyed on the condition's source text so the same condition spelled twice
// resolves to one matcher. Leading `!` flips the branch instead of the key,
// so `cond && a` and `!cond && b` land on opposite values of one key.
const conditionMatcher = (
	test: Node,
	truthyBranch: boolean,
	sourceCode: SourceCode
): readonly [string, string] => {
	let condition = test;
	let truthy = truthyBranch;

	while (condition.type === 'UnaryExpression' && condition.operator === '!') {
		condition = condition.argument;
		truthy = !truthy;
	}

	const key = `cond:${sourceCode.getText(condition)}`;

	if (truthy) {
		return [key, 'truthy'];
	}

	return [key, 'falsy'];
};

const isStaticStringNode = (node: Node): boolean =>
	getStaticStringText(node) !== null;

// A clsx-style record key is itself a class string, appended verbatim when its
// (runtime) value is truthy — so a multi-token key like `'px-2 py-1'`
// contributes each of its tokens. String-literal keys are tokenized like any
// class string; identifier/numeric keys are a single, space-free token.
const pushRecordKeyTokens = (
	prop: Property,
	slot: string,
	source: Source,
	entries: Entry[],
	sourceCode: SourceCode
) => {
	const { key } = prop;

	if (key.type === 'Literal' && typeof key.value === 'string') {
		pushStringLiteralTokens(key, slot, source, entries, sourceCode);
		return;
	}

	const token = getKeyName(prop);

	/* c8 ignore next 3 -- a non-computed key is parser-emitted as Identifier or Literal */
	if (token === null) {
		return;
	}

	const [start, end] = sourceCode.getRange(key);

	entries.push({ source, slot, token, start, end });
};

// Spreads and computed keys carry an unknowable class name and are skipped
// (no-dynamic-classes flags them separately).
const extractRecordTokens = (
	node: ObjectExpression,
	slot: string,
	source: Source,
	entries: Entry[],
	sourceCode: SourceCode
) => {
	for (const prop of node.properties) {
		if (prop.type !== 'Property' || prop.computed) {
			continue;
		}

		pushRecordKeyTokens(prop, slot, source, entries, sourceCode);
	}
};

type TokenExtractionContext = {
	slot: string;
	source: Source;
	slotNames: Set<string>;
	entries: Entry[];
	sourceCode: SourceCode;
};

const extractConditionalTokens = (
	node: ConditionalExpression,
	context: TokenExtractionContext
) => {
	const { consequent, alternate } = node;
	const { slot, source, slotNames, entries, sourceCode } = context;

	if (
		consequent.type !== 'ConditionalExpression' &&
		alternate.type !== 'ConditionalExpression'
	) {
		const [key, thenBranch] = conditionMatcher(node.test, true, sourceCode);
		const [, elseBranch] = conditionMatcher(node.test, false, sourceCode);
		const branches: ReadonlyArray<readonly [Node, string]> = [
			[consequent, thenBranch],
			[alternate, elseBranch]
		];

		for (const [leaf, branch] of branches) {
			extractTokens(
				leaf,
				slot,
				withMatcher(source, key, branch),
				slotNames,
				entries,
				sourceCode,
				true
			);
		}
		return;
	}

	const ternaryKey = `ternary@${sourceCode.getRange(node)[0]}`;
	const leaves: Node[] = [];

	collectBranchLeaves(node, leaves);

	for (const [index, leaf] of leaves.entries()) {
		extractTokens(
			leaf,
			slot,
			withMatcher(source, ternaryKey, `branch${index}`),
			slotNames,
			entries,
			sourceCode,
			true
		);
	}
};

const extractTernaryTemplateTokens = (
	node: TemplateLiteral,
	context: TokenExtractionContext
) => {
	const { slot, source, slotNames, entries, sourceCode } = context;

	for (const quasi of node.quasis) {
		pushTokensFromText(
			quasi.value.raw,
			sourceCode.getRange(quasi)[0] + 1,
			slot,
			source,
			entries
		);
	}

	for (const expression of node.expressions) {
		extractTokens(
			expression,
			slot,
			source,
			slotNames,
			entries,
			sourceCode,
			true
		);
	}
};

// `cnStyle` toggles the cn() calling-convention forms — logical-AND, ternaries
// (chained or nested), ternary templates, and clsx-style records, each of
// which may nest the others. In an sv() config's class positions an object is
// instead a slot-keyed record.
const extractTokens = (
	node: Node,
	slot: string,
	source: Source,
	slotNames: Set<string>,
	entries: Entry[],
	sourceCode: SourceCode,
	cnStyle = false
) => {
	node = resolveStaticValue(node, sourceCode);
	const context = { slot, source, slotNames, entries, sourceCode };

	if (isStaticStringNode(node)) {
		pushStringLiteralTokens(node, slot, source, entries, sourceCode);
		return;
	}

	// Only the right operand is a class contribution; the left is recorded as a
	// truthy-branch matcher so a complementary `!cond && …` elsewhere resolves
	// as mutually exclusive.
	if (
		cnStyle &&
		node.type === 'LogicalExpression' &&
		node.operator === '&&'
	) {
		const [key, branch] = conditionMatcher(node.left, true, sourceCode);

		extractTokens(
			node.right,
			slot,
			withMatcher(source, key, branch),
			slotNames,
			entries,
			sourceCode,
			cnStyle
		);
		return;
	}

	// A simple two-branch ternary is keyed on its condition text, letting
	// complementary conditionals across arguments — `cond ? a : ''` with
	// `cond ? '' : b` — resolve as exclusive too. A chained ternary keeps a
	// position-based key: its leaves are only exclusive to one another.
	if (cnStyle && node.type === 'ConditionalExpression') {
		extractConditionalTokens(node, context);
		return;
	}

	// Quasis carry always-present tokens; each substitution carries its own
	// exclusive branch tokens.
	if (cnStyle && isStaticTernaryTemplate(node)) {
		extractTernaryTemplateTokens(node, context);
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
				sourceCode,
				cnStyle
			);
		});
		return;
	}

	if (cnStyle && node.type === 'ObjectExpression') {
		extractRecordTokens(node, slot, source, entries, sourceCode);
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

// Skips spreads/holes silently; use forEachItemReportingSpread to flag them.
export const forEachStaticItem = (
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

// Boolean shorthand when not a plain object, or when its keys are slot names
// rather than value names.
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
			extract(variantValue, 'base', variantSource(variantKey, 'true'));
			continue;
		}

		for (const [valueKey, valueNode] of getProperties(variantValue)) {
			extract(valueNode, 'base', variantSource(variantKey, valueKey));
		}
	}
};

const COMPOUND_NON_MATCHER_KEYS = new Set(['class', 'className', 'slots']);

// Strings, booleans, and numbers align with variant value keys (`{ true: … }`,
// `{ 2: … }`), which getKeyName also reads as strings.
const getStaticMatcherValue = (node: Node): string | null => {
	const text = getStaticStringText(node);

	if (text !== null) {
		return text;
	}

	if (
		node.type === 'Literal' &&
		(typeof node.value === 'boolean' || typeof node.value === 'number')
	) {
		return String(node.value);
	}

	return null;
};

// Derives an exclusivity source from a compound's matcher properties, so two
// compounds requiring different variant values aren't reported as conflicts.
// Only statically-known scalar matchers count; a dynamic or array matcher is
// skipped, which can only under-suppress, never wrongly suppress. With no
// readable matcher left, falls back to the never-exclusive compound source.
const getCompoundSource = (compound: ReadonlyMap<string, Node>): Source => {
	const matchers = new Map<string, string>();

	for (const [key, value] of compound) {
		if (COMPOUND_NON_MATCHER_KEYS.has(key)) {
			continue;
		}

		const matcherValue = getStaticMatcherValue(value);

		if (matcherValue !== null) {
			matchers.set(key, matcherValue);
		}
	}

	if (matchers.size === 0) {
		return compoundSource;
	}

	return { kind: 'variant', matchers };
};

const extractCompoundTokens = (
	compoundVariants: Node | undefined,
	compoundSlots: Node | undefined,
	extract: ExtractFn
) => {
	forEachCompoundClass(compoundVariants, (cls, compound) => {
		extract(cls, 'base', getCompoundSource(compound));
	});

	forEachCompoundClass(compoundSlots, (cls, compound) => {
		const targetSlots = compound.get('slots');

		if (targetSlots) {
			const source = getCompoundSource(compound);

			forEachStringLiteralElement(targetSlots, (slot) => {
				extract(cls, slot, source);
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

	// Leading args use the cn() calling convention (slots don't apply to them).
	for (const arg of baseArgs) {
		extractTokens(
			arg,
			'base',
			baseSource,
			slotNames,
			entries,
			sourceCode,
			true
		);
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

// A ternary whose every (possibly nested) branch is a static string — safe as
// a template-literal substitution, unlike a logical-AND (stringifies to
// "false" when skipped) or an array (comma-join leaks into the text).
const isStaticStringConditional = (node: Node): boolean =>
	isStaticStringNode(node) ||
	(node.type === 'ConditionalExpression' &&
		isStaticStringConditional(node.consequent) &&
		isStaticStringConditional(node.alternate));

// A substitution is only statically tokenizable when whitespace (or a
// template edge) separates it from the surrounding quasi text — otherwise a
// class token would straddle the boundary (e.g. `p-${x ? '2' : '4'}`), which
// we deliberately don't attempt to enumerate.
const quasiIsolatesExpression = (
	quasi: TemplateElement,
	index: number,
	quasis: ReadonlyArray<TemplateElement>
): boolean => {
	const raw = quasi.value.raw;
	const hasLeftExpression = index > 0;
	const hasRightExpression = index < quasis.length - 1;

	// An interior empty quasi means two expressions sit adjacent.
	if (raw.length === 0) {
		return !hasLeftExpression || !hasRightExpression;
	}

	if (hasLeftExpression && !/^\s/.test(raw)) {
		return false;
	}

	if (hasRightExpression && !/\s$/.test(raw)) {
		return false;
	}

	return true;
};

// Every substitution is a whitespace-isolated static-string ternary, so the
// full set of possible outputs is statically known.
const isStaticTernaryTemplate = (node: Node): node is TemplateLiteral =>
	node.type === 'TemplateLiteral' &&
	node.expressions.every(isStaticStringConditional) &&
	node.quasis.every(quasiIsolatesExpression);

type StaticClassValueOptions = {
	allowNestedArrays?: boolean;
	allowUndefined?: boolean;
	allowLogicalString?: boolean;
	allowConditionalString?: boolean;
	allowClassRecord?: boolean;
};

// The cn-style affordances that propagate into nested positions. `allowNestedArrays`
// and `allowUndefined` are top-level-only concerns and deliberately dropped.
const branchOptions = (
	options: StaticClassValueOptions
): StaticClassValueOptions => ({
	allowLogicalString: options.allowLogicalString === true,
	allowConditionalString: options.allowConditionalString === true,
	allowClassRecord: options.allowClassRecord === true
});

// Like forEachStaticItem, but spreads are reported as dynamic rather than skipped.
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
	node = resolveStaticValue(node, context.sourceCode);

	if (options.allowUndefined && isUndefinedIdentifier(node)) {
		return;
	}

	if (isStaticStringNode(node)) {
		return;
	}

	// Only the `&&` right operand is a class contribution, validated with the
	// same affordances.
	if (
		options.allowLogicalString &&
		node.type === 'LogicalExpression' &&
		node.operator === '&&'
	) {
		checkClassValueIsStatic(context, node.right, branchOptions(options));
		return;
	}

	if (options.allowConditionalString) {
		if (node.type === 'ConditionalExpression') {
			checkClassValueIsStatic(
				context,
				node.consequent,
				branchOptions(options)
			);
			checkClassValueIsStatic(
				context,
				node.alternate,
				branchOptions(options)
			);
			return;
		}

		if (isStaticTernaryTemplate(node)) {
			return;
		}
	}

	if (node.type === 'ArrayExpression') {
		forEachItemReportingSpread(context, node.elements, (element) => {
			if (options.allowNestedArrays === false) {
				if (element.type === 'ArrayExpression') {
					reportDynamic(context, element);
					return;
				}
			}

			checkClassValueIsStatic(context, element, branchOptions(options));
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

// In cn-style arguments an ObjectExpression is a clsx-style record: keys are
// class names, values are runtime conditions. Only the keys must be statically
// known, so forEachStaticProperty reports dynamic ones; values are left alone.
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
	hasSlotsKey: boolean,
	slotNames: Set<string>
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
			checkCompoundEntryProperty(context, prop, hasSlotsKey, slotNames);
		});
	});
};

type SvConfigValueChecker = (context: Rule.RuleContext, node: Node) => void;

const getCompoundEntryValueChecker = (
	key: string | null,
	hasSlotsKey: boolean,
	slotNames: Set<string>
): SvConfigValueChecker | null => {
	if (key === 'class' || key === 'className') {
		// A compoundSlots entry already targets specific slots, so its class value
		// is plain; a compoundVariants class follows a variant branch's shape and
		// may be a slot-keyed record.
		if (hasSlotsKey) {
			return checkConfigClassValueIsStatic;
		}

		return (context, node) => {
			checkVariantBranchValue(context, node, slotNames);
		};
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
	hasSlotsKey: boolean,
	slotNames: Set<string>
) => {
	const checker = getCompoundEntryValueChecker(
		getKeyName(prop),
		hasSlotsKey,
		slotNames
	);

	if (checker) {
		checker(context, prop.value);
	}
};

const svConfigValueCheckers: Record<string, SvConfigValueChecker> = {
	base: checkConfigClassValueIsStatic,
	slots: checkClassValueRecord
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

	if (key === 'compoundVariants') {
		checkCompoundEntries(context, prop.value, false, slotNames);
		return;
	}

	if (key === 'compoundSlots') {
		checkCompoundEntries(context, prop.value, true, slotNames);
		return;
	}

	if (key !== null) {
		svConfigValueCheckers[key]?.(context, prop.value);
	}
};

export const checkSvConfig = (
	context: Rule.RuleContext,
	configNode: ObjectExpression
) => {
	const slotNames = getConfigSlotNames(getProperties(configNode));

	forEachStaticProperty(context, configNode, (prop) => {
		checkSvConfigProperty(context, prop, slotNames);
	});
};

export const checkCnArguments = (
	context: Rule.RuleContext,
	args: ReadonlyArray<Expression | SpreadElement>
) => {
	forEachItemReportingSpread(context, args, (arg) => {
		checkClassValueIsStatic(context, arg, {
			allowLogicalString: true,
			allowConditionalString: true,
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
	const createSvNames = new Set<string>();
	const trackedNamesByImport: Record<string, Set<string>> = {
		cn: cnNames,
		sv: svNames,
		createSV: createSvNames
	};

	const importsTracker = (node: ImportDeclaration) => {
		if (node.source.value !== 'slot-variants') {
			return;
		}

		for (const specifier of node.specifiers) {
			trackNamedImport(specifier, trackedNamesByImport);
		}
	};

	return { cnNames, svNames, createSvNames, importsTracker };
};

// A tracked-name identifier could still be a local binding that shadows the
// import (e.g. a function parameter named `cn`), so confirm it resolves to
// an import binding.
const identifierResolvesToImport = (
	context: Rule.RuleContext,
	identifier: Identifier
): boolean => {
	const variable = findVariable(
		context.sourceCode.getScope(identifier),
		identifier.name
	);

	/* c8 ignore next 3 -- a tracked-name identifier always resolves to a binding */
	if (!variable) {
		return false;
	}

	return variable.defs.some((def) => def.type === 'ImportBinding');
};

// Reads the callee through same-file `const` aliases (`const cx = cn`) so
// aliased sv/cn bindings stay tracked. Null when the callee isn't an
// identifier, or is an alias of a non-identifier value.
const resolveCalleeIdentifier = (
	context: Rule.RuleContext,
	node: CallExpression
): Identifier | null => {
	if (node.callee.type !== 'Identifier') {
		return null;
	}

	const resolved = resolveStaticValue(node.callee, context.sourceCode);

	if (resolved.type !== 'Identifier') {
		return null;
	}

	return resolved;
};

// A `createSV(...)` factory call whose callee resolves to a tracked createSV
// import. The `const` binding it initializes is a pre-configured `sv()`, so
// its call sites are analyzed exactly like `sv()` calls.
const isCreateSvFactoryCall = (
	context: Rule.RuleContext,
	node: CallExpression,
	createSvNames: Set<string>
): boolean => {
	const factoryCallee = resolveCalleeIdentifier(context, node);

	if (!factoryCallee) {
		return false;
	}

	return (
		createSvNames.has(factoryCallee.name) &&
		identifierResolvesToImport(context, factoryCallee)
	);
};

// The `createSV(defaults)` call itself: its sole argument is unambiguously the
// shared config. Unlike `sv()`, whose last arg might be a cn-style class list,
// any object argument here is the config — so a spread or computed key is
// reported as dynamic rather than gating the whole object out.
const matchFactoryCall = (
	node: CallExpression,
	sourceCode: SourceCode
): CallMatch => {
	const [defaults] = node.arguments;

	if (!defaults) {
		return { config: null, args: [], isFactoryConfig: true };
	}

	const resolved = resolveStaticValue(defaults, sourceCode);

	if (resolved.type === 'ObjectExpression') {
		return { config: resolved, args: [], isFactoryConfig: true };
	}

	return { config: null, args: [], isFactoryConfig: true };
};

// Classifies a call as sv/cn-style, reading the callee through same-file
// `const` aliases. A callee resolving to a `createSV(...)`-initialized binding
// is treated like `sv`; a direct `createSV` import names a factory call; a
// direct sv/cn import uses the sv/cn convention. Null for anything untracked.
const matchTrackedCall = (
	context: Rule.RuleContext,
	node: CallExpression,
	svNames: Set<string>,
	cnNames: Set<string>,
	createSvNames: Set<string>
): CallMatch | null => {
	if (node.callee.type !== 'Identifier') {
		return null;
	}

	const resolved = resolveStaticValue(node.callee, context.sourceCode);

	// A `const button = createSV(...)(…)` binding behaves like `sv`.
	if (resolved.type === 'CallExpression') {
		if (isCreateSvFactoryCall(context, resolved, createSvNames)) {
			return matchSvCall(node, context.sourceCode);
		}

		return null;
	}

	if (resolved.type !== 'Identifier') {
		return null;
	}

	// The `createSV(defaults)` factory call itself — validate its defaults.
	if (createSvNames.has(resolved.name)) {
		if (identifierResolvesToImport(context, resolved)) {
			return matchFactoryCall(node, context.sourceCode);
		}

		return null;
	}

	const call = matchSvCnCall(
		node,
		resolved.name,
		svNames,
		cnNames,
		context.sourceCode
	);

	if (call && identifierResolvesToImport(context, resolved)) {
		return call;
	}

	return null;
};

export const createTrackedCallListeners = (
	context: Rule.RuleContext,
	onCall: (node: CallExpression, call: CallMatch) => void
) => {
	const { cnNames, svNames, createSvNames, importsTracker } =
		createImportsTracker();

	return {
		ImportDeclaration(node: ImportDeclaration) {
			importsTracker(node);
		},
		CallExpression(node: CallExpression) {
			if (
				svNames.size === 0 &&
				cnNames.size === 0 &&
				createSvNames.size === 0
			) {
				return;
			}

			const call = matchTrackedCall(
				context,
				node,
				svNames,
				cnNames,
				createSvNames
			);

			if (call) {
				onCall(node, call);
			}
		}
	};
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

// A string-literal key is checked for redundant whitespace (identifier/numeric
// keys can't contain whitespace; computed keys are dynamic).
const visitRecordKeysForRedundantSpaces = (
	context: Rule.RuleContext,
	node: ObjectExpression
) => {
	for (const prop of node.properties) {
		if (prop.type !== 'Property' || prop.computed) {
			continue;
		}

		const { key } = prop;

		if (key.type === 'Literal' && typeof key.value === 'string') {
			reportRedundantSpaces(context, key, key.value);
		}
	}
};

export const visitForRedundantSpaces = (
	context: Rule.RuleContext,
	node: Node,
	cnStyle = false
) => {
	node = resolveStaticValue(node, context.sourceCode);

	const text = getStaticStringText(node);

	if (text !== null) {
		reportRedundantSpaces(context, node, text);
		return;
	}

	// Only the `&&` right operand and each ternary branch are class contributions.
	if (cnStyle && node.type === 'LogicalExpression' && node.operator === '&&') {
		visitForRedundantSpaces(context, node.right, cnStyle);
		return;
	}

	if (cnStyle && node.type === 'ConditionalExpression') {
		visitForRedundantSpaces(context, node.consequent, cnStyle);
		visitForRedundantSpaces(context, node.alternate, cnStyle);
		return;
	}

	if (node.type === 'ArrayExpression') {
		forEachStaticItem(node.elements, (element) => {
			visitForRedundantSpaces(context, element, cnStyle);
		});
		return;
	}

	if (node.type === 'ObjectExpression') {
		if (cnStyle) {
			visitRecordKeysForRedundantSpaces(context, node);
			return;
		}

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

export const svRedundantSpacesConfigValueCheckers: Record<
	string,
	SvConfigValueChecker
> = {
	base: visitForRedundantSpaces,
	slots: checkRedundantSpacesRecord,
	variants: checkRedundantSpacesRecord,
	compoundVariants: checkCompoundsForRedundantSpaces,
	compoundSlots: checkCompoundsForRedundantSpaces
};

export const dispatchSvConfigCheckers = (
	context: Rule.RuleContext,
	configNode: ObjectExpression,
	checkers: Record<string, SvConfigValueChecker>
) => {
	for (const [key, value] of getProperties(configNode)) {
		checkers[key]?.(context, value);
	}
};

// Curated sets of Tailwind utilities that set the same CSS property but which
// the dash-namespace heuristic can't group — single words (`flex`, `absolute`)
// or hyphenated siblings that don't share a first segment (`inline-block` vs
// `flex`). Opt-in via `exclusiveGroups: true`, since a project's own
// single-word class names would otherwise be flagged.

// Every `display` value. The single-word subset (`SINGLE_WORD_DISPLAY_KEYWORDS`
// below) is also reachable via the always-on `line-clamp` overlap — unlike the
// rest of this group, which is opt-in.
const DISPLAY_KEYWORDS: ReadonlyArray<string> = [
	'block',
	'inline-block',
	'inline',
	'flex',
	'inline-flex',
	'table',
	'inline-table',
	'table-caption',
	'table-cell',
	'table-column',
	'table-column-group',
	'table-footer-group',
	'table-header-group',
	'table-row-group',
	'table-row',
	'flow-root',
	'grid',
	'inline-grid',
	'contents',
	'list-item',
	'hidden'
];

// The subset of `DISPLAY_KEYWORDS` with no `-` of their own, safe to give a
// dedicated `line-clamp` overlap node (see `SINGLE_WORD_OVERLAP_NODES`). The
// hyphenated members (`table-cell`, `inline-block`, …) are excluded: several
// are already grouped by the `table` `PREFIX_SPECS` entry, and giving each its
// own node here would shadow that grouping.
const SINGLE_WORD_DISPLAY_KEYWORDS: ReadonlyArray<string> = DISPLAY_KEYWORDS.filter(
	(word) => !word.includes('-')
);

const TAILWIND_EXCLUSIVE_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
	// display
	DISPLAY_KEYWORDS,
	// position
	['static', 'fixed', 'absolute', 'relative', 'sticky'],
	// visibility
	['visible', 'invisible', 'collapse'],
	// text-transform
	['uppercase', 'lowercase', 'capitalize', 'normal-case'],
	// text-decoration-line
	['underline', 'overline', 'line-through', 'no-underline'],
	// font-style
	['italic', 'not-italic'],
	// font-smoothing
	['antialiased', 'subpixel-antialiased'],
	// isolation
	['isolate', 'isolation-auto'],
	// screen-reader visibility
	['sr-only', 'not-sr-only']
	// Font-variant-numeric (`tabular-nums`, `normal-nums`, …) is NOT here: it's
	// a star shape, not a flat mutually-exclusive set (see the `fvn-*` entries
	// in `SINGLE_WORD_OVERLAP_NODES`, which is default-on instead).
];

// `true` enables the built-in Tailwind groups; an array supplies custom groups
// (replacing the built-ins); anything else (including the default `undefined`)
// leaves single-word grouping off.
type ExclusiveGroupsOption =
	| boolean
	| ReadonlyArray<ReadonlyArray<string>>
	| undefined;

const resolveExclusiveGroups = (
	option: ExclusiveGroupsOption
): ReadonlyArray<ReadonlyArray<string>> => {
	if (option === true) {
		return TAILWIND_EXCLUSIVE_GROUPS;
	}

	if (Array.isArray(option)) {
		return option;
	}

	return [];
};

// A group config listing the same utility in two different groups has no
// coherent meaning — which group's id should the token's conflict key use? —
// so it's rejected outright rather than silently resolved (last group wins).
const createOverlappingExclusiveGroupError = (
	token: string,
	firstGroupIndex: number,
	secondGroupIndex: number
): Error =>
	new Error(
		`slot-variants/no-conflicting-classes: "exclusiveGroups" lists "${token}" in more than one group (groups ${firstGroupIndex} and ${secondGroupIndex}) — remove it from all but one.`
	);

// A lookup from each grouped utility to a stable per-group id, so tokens in the
// same exclusive group share a conflict key. Empty when grouping is disabled,
// in which case getConflictKey behaves exactly as before.
export const buildExclusiveGroupMap = (
	option: ExclusiveGroupsOption
): ReadonlyMap<string, string> => {
	const map = new Map<string, string>();
	const groupIndexByToken = new Map<string, number>();
	let index = 0;

	for (const group of resolveExclusiveGroups(option)) {
		const groupId = String(index);

		for (const token of group) {
			const firstGroupIndex = groupIndexByToken.get(token);

			if (firstGroupIndex !== undefined) {
				throw createOverlappingExclusiveGroupError(
					token,
					firstGroupIndex,
					index
				);
			}

			groupIndexByToken.set(token, index);
			map.set(token, groupId);
		}

		index += 1;
	}

	return map;
};

// --- Property classification for overloaded prefixes ------------------------
//
// A dash count alone can't separate utilities that share a first segment and
// dash count but set different CSS properties (`bg-white` color vs `bg-cover`
// size, `text-white` color vs `text-sm` size). For a curated set of such
// prefixes we classify the value into a coarse property category and key on
// that instead. Unlisted prefixes keep the plain dash-count category, and an
// unmatched value falls back to a `short` (single value segment) or `long`
// (multi-segment) bucket — so a custom color like `text-brand-500` still groups
// with the built-in colors via `long: 'color'`, without any color palette.

type PrefixSpec = {
	keywords: ReadonlyMap<string, string>;
	// A keyword that introduces a sub-property classified from the remaining
	// segments (`ring-offset-2` width vs `ring-offset-red-500` color).
	nested?: ReadonlyMap<string, PrefixSpec>;
	short?: string;
	long?: string;
	// A trailing `reverse` segment is a composing flag, not a value — it sets a
	// CSS variable (`space-x-reverse`, `divide-x-reverse`) rather than replacing
	// the base utility, so it gets its own category and doesn't conflict with it.
	reverseComposes?: boolean;
	// The prefix has arbitrary image values (`bg-[url(...)]`,
	// `bg-[linear-gradient(...)]`) that classify as an image rather than
	// falling into the color fallback.
	arbitraryImage?: boolean;
	fallback: string;
};

const categoryMap = (
	groups: ReadonlyArray<readonly [string, ReadonlyArray<string>]>
): ReadonlyMap<string, string> => {
	const map = new Map<string, string>();

	for (const [category, tokens] of groups) {
		for (const token of tokens) {
			map.set(token, category);
		}
	}

	return map;
};

// Maps each token to a category named after itself — for axes (`x`/`y`), grid
// lines (`span`/`start`), sides, and filter functions the segment itself names
// the sub-property.
const selfMap = (tokens: ReadonlyArray<string>): ReadonlyMap<string, string> =>
	categoryMap(tokens.map((token) => [token, [token]] as const));

const COLOR_KEYWORDS = ['inherit', 'current', 'transparent', 'black', 'white'];
const SIDES = ['t', 'r', 'b', 'l', 'x', 'y', 's', 'e', 'bs', 'be'];
const CORNERS = [
	't',
	'r',
	'b',
	'l',
	's',
	'e',
	'tl',
	'tr',
	'bl',
	'br',
	'ss',
	'se',
	'es',
	'ee'
];

// x/y/z axis utilities (`gap-x`, `translate-y`, …); a bare value sets all axes.
const axisSpec: PrefixSpec = {
	keywords: selfMap(['x', 'y', 'z']),
	fallback: 'all'
};

// `space-x-*` is an axis utility that also has a composing `space-x-reverse`.
const spaceSpec: PrefixSpec = { ...axisSpec, reverseComposes: true };

// `inset` has no `z` axis but does have logical block sides (`inset-bs`,
// `inset-be`), unlike the other axis utilities that share `axisSpec`.
const insetSpec: PrefixSpec = {
	keywords: selfMap(['x', 'y', 'bs', 'be']),
	fallback: 'all'
};

// `translate-none` is a keyword value (not an axis), and it's a special case:
// it resets every axis including `z`, while the bare form (`translate-4`)
// only sets `x`/`y` — so `none` gets its own category, distinct from the
// `all` fallback the bare form uses (see `getOverlapNode`).
const translateSpec: PrefixSpec = {
	keywords: selfMap(['x', 'y', 'z', 'none']),
	fallback: 'all'
};

// `ring-offset-*` is both a width (`ring-offset-2`) and a color
// (`ring-offset-red-500`), classified from the segments after `offset`.
const offsetSpec: PrefixSpec = {
	keywords: categoryMap([['color', COLOR_KEYWORDS]]),
	short: 'width',
	long: 'color',
	fallback: 'color'
};

// A per-side border utility is both a width (`border-t-2`, bare `border-t`)
// and a color (`border-t-red-500`), classified from the segments after the
// side; an empty remainder is the bare 1px width form.
const borderSideSpec: PrefixSpec = {
	keywords: categoryMap([['color', COLOR_KEYWORDS]]),
	short: 'width',
	long: 'color',
	fallback: 'width'
};

// `touch-pan-x`/`-left`/`-right` all set the same CSS value (`pan-x`), so they
// conflict with each other; `touch-pan-y`/`-up`/`-down` likewise share
// `pan-y`. The two axes are independent of each other and compose
// (`touch-pan-x touch-pan-y` is valid).
const panSpec: PrefixSpec = {
	keywords: categoryMap([
		['x', ['x', 'left', 'right']],
		['y', ['y', 'up', 'down']]
	]),
	fallback: 'other'
};

// Single-property color utilities (`fill`, `accent`, `caret`): every value is a
// color, so they all share one category regardless of shape.
const colorSpec: PrefixSpec = {
	keywords: new Map<string, string>(),
	short: 'color',
	long: 'color',
	fallback: 'color'
};

// Gradient color stops (`from`/`via`/`to`): a color, or a `%`/number stop
// position, which is a distinct property that composes with the color.
const gradientStopSpec: PrefixSpec = {
	keywords: categoryMap([['color', COLOR_KEYWORDS]]),
	short: 'position',
	long: 'color',
	fallback: 'color'
};

// Single-property utilities whose values simply replace one another (`ease-*`
// timing function, `cursor-*`, `origin-*`, `align-*` vertical-align,
// `whitespace-*`): every value collapses to one category regardless of shape,
// so a one-segment value collides with a hyphenated one (`ease-in`/`ease-in-out`).
const unifiedSpec: PrefixSpec = {
	keywords: new Map<string, string>(),
	short: 'value',
	long: 'value',
	fallback: 'value'
};

// `line-clamp-*` (`line-clamp-3`, `line-clamp-none`, an arbitrary value) sets
// display and overflow as a side effect, so it gets its own overlap node (see
// `getOverlapNode`); `line-through` is an unrelated single-word utility that
// happens to share the `line` first segment.
const lineSpec: PrefixSpec = {
	keywords: categoryMap([['through', ['through']]]),
	nested: new Map([['clamp', unifiedSpec]]),
	fallback: 'other'
};

const PREFIX_SPECS: Record<string, PrefixSpec> = {
	text: {
		keywords: categoryMap([
			['align', ['left', 'center', 'right', 'justify', 'start', 'end']],
			['wrap', ['wrap', 'nowrap', 'balance', 'pretty']],
			['overflow', ['ellipsis', 'clip']],
			['color', COLOR_KEYWORDS],
			['opacity', ['opacity']]
		]),
		short: 'size',
		long: 'color',
		fallback: 'color'
	},
	bg: {
		keywords: categoryMap([
			['color', COLOR_KEYWORDS],
			['size', ['auto', 'cover', 'contain']],
			['position', ['bottom', 'center', 'left', 'right', 'top']],
			['repeat', ['repeat', 'no']],
			['attach', ['fixed', 'local', 'scroll']],
			['image', ['none', 'gradient', 'linear', 'radial', 'conic']],
			['clip', ['clip']],
			['origin', ['origin']],
			['blend', ['blend']],
			['opacity', ['opacity']]
		]),
		arbitraryImage: true,
		fallback: 'color'
	},
	border: {
		keywords: categoryMap([
			[
				'style',
				['solid', 'dashed', 'dotted', 'double', 'hidden', 'none']
			],
			['color', COLOR_KEYWORDS],
			['collapse', ['collapse', 'separate']],
			['opacity', ['opacity']]
		]),
		// `border-spacing-x`/`-y` compose into the single `border-spacing`
		// property, so they're keyed per axis rather than lumped together; each
		// side introduces its own width/color sub-properties.
		nested: new Map<string, PrefixSpec>([
			['spacing', axisSpec],
			...SIDES.map((side): [string, PrefixSpec] => [side, borderSideSpec])
		]),
		short: 'width',
		long: 'color',
		fallback: 'color'
	},
	ring: {
		keywords: categoryMap([
			['inset', ['inset']],
			['color', COLOR_KEYWORDS],
			['opacity', ['opacity']]
		]),
		nested: new Map([['offset', offsetSpec]]),
		short: 'width',
		long: 'color',
		fallback: 'color'
	},
	outline: {
		keywords: categoryMap([
			[
				'style',
				['none', 'dashed', 'dotted', 'double', 'solid', 'hidden']
			],
			['offset', ['offset']],
			['color', COLOR_KEYWORDS]
		]),
		short: 'width',
		long: 'color',
		fallback: 'color'
	},
	divide: {
		keywords: categoryMap([
			['style', ['solid', 'dashed', 'dotted', 'double', 'none']],
			['color', COLOR_KEYWORDS],
			['width-x', ['x']],
			['width-y', ['y']],
			['opacity', ['opacity']]
		]),
		reverseComposes: true,
		long: 'color',
		fallback: 'color'
	},
	decoration: {
		keywords: categoryMap([
			['style', ['solid', 'double', 'dotted', 'dashed', 'wavy']],
			['color', COLOR_KEYWORDS],
			['thickness', ['from', 'auto']]
		]),
		short: 'thickness',
		long: 'color',
		fallback: 'color'
	},
	stroke: {
		keywords: categoryMap([['color', COLOR_KEYWORDS]]),
		short: 'width',
		long: 'color',
		fallback: 'color'
	},
	shadow: {
		keywords: categoryMap([['color', COLOR_KEYWORDS]]),
		short: 'box',
		long: 'color',
		fallback: 'color'
	},
	fill: colorSpec,
	accent: colorSpec,
	caret: colorSpec,
	placeholder: {
		keywords: categoryMap([['opacity', ['opacity']]]),
		short: 'color',
		long: 'color',
		fallback: 'color'
	},
	from: gradientStopSpec,
	via: gradientStopSpec,
	to: gradientStopSpec,
	// `table-auto`/`table-fixed` are `table-layout`; every other `table-*`
	// (`table-cell`, `table-row`, `table-header-group`, …) is a `display` value.
	table: {
		keywords: categoryMap([['layout', ['auto', 'fixed']]]),
		fallback: 'display'
	},
	content: {
		keywords: categoryMap([
			[
				'align',
				[
					'center',
					'start',
					'end',
					'between',
					'around',
					'evenly',
					'normal',
					'stretch',
					'baseline'
				]
			]
		]),
		fallback: 'prop'
	},
	flex: {
		keywords: categoryMap([
			['direction', ['row', 'col']],
			['wrap', ['wrap', 'nowrap']]
		]),
		fallback: 'flex'
	},
	font: {
		keywords: categoryMap([
			[
				'weight',
				[
					'thin',
					'extralight',
					'light',
					'normal',
					'medium',
					'semibold',
					'bold',
					'extrabold',
					'black'
				]
			]
		]),
		fallback: 'family'
	},
	grid: { keywords: selfMap(['cols', 'rows', 'flow']), fallback: 'other' },
	auto: { keywords: selfMap(['cols', 'rows']), fallback: 'other' },
	object: {
		keywords: categoryMap([
			['fit', ['contain', 'cover', 'fill', 'none', 'scale']],
			['position', ['bottom', 'center', 'left', 'right', 'top']]
		]),
		fallback: 'other'
	},
	list: {
		keywords: categoryMap([
			['position', ['inside', 'outside']],
			['image', ['image']]
		]),
		fallback: 'type'
	},
	place: {
		keywords: selfMap(['items', 'content', 'self']),
		fallback: 'other'
	},
	justify: { keywords: selfMap(['items', 'self']), fallback: 'content' },
	col: {
		keywords: selfMap(['span', 'start', 'end', 'auto']),
		fallback: 'other'
	},
	row: {
		keywords: selfMap(['span', 'start', 'end', 'auto']),
		fallback: 'other'
	},
	min: { keywords: selfMap(['w', 'h']), fallback: 'other' },
	max: { keywords: selfMap(['w', 'h']), fallback: 'other' },
	rounded: { keywords: selfMap(CORNERS), fallback: 'all' },
	backdrop: {
		keywords: selfMap([
			'blur',
			'brightness',
			'contrast',
			'grayscale',
			'hue',
			'invert',
			'opacity',
			'saturate',
			'sepia'
		]),
		fallback: 'other'
	},
	scroll: {
		keywords: categoryMap([
			['behavior', ['smooth', 'auto']],
			...[
				'm',
				'mt',
				'mr',
				'mb',
				'ml',
				'mx',
				'my',
				'ms',
				'me',
				'mbs',
				'mbe',
				'p',
				'pt',
				'pr',
				'pb',
				'pl',
				'px',
				'py',
				'ps',
				'pe',
				'pbs',
				'pbe'
			].map((side) => [side, [side]] as const)
		]),
		fallback: 'other'
	},
	snap: {
		keywords: categoryMap([
			['axis', ['x', 'y', 'both', 'none']],
			['strict', ['mandatory', 'proximity']],
			['align', ['start', 'center', 'end', 'align']],
			['stop', ['normal', 'always']]
		]),
		fallback: 'other'
	},
	break: {
		keywords: categoryMap([
			['wrap', ['words']],
			['word', ['all', 'keep']],
			['before', ['before']],
			['after', ['after']],
			['inside', ['inside']]
		]),
		fallback: 'other'
	},
	touch: {
		keywords: categoryMap([
			['base', ['auto', 'none', 'manipulation']],
			['pinch', ['pinch']]
		]),
		nested: new Map([['pan', panSpec]]),
		fallback: 'base'
	},
	ease: unifiedSpec,
	origin: unifiedSpec,
	cursor: unifiedSpec,
	align: unifiedSpec,
	whitespace: unifiedSpec,
	// Every `drop-shadow-*` (including the bare `drop-shadow`) sets the single
	// drop-shadow filter, so collapse them all to one category.
	drop: unifiedSpec,
	line: lineSpec,
	gap: axisSpec,
	space: spaceSpec,
	translate: translateSpec,
	scale: axisSpec,
	skew: axisSpec,
	rotate: axisSpec,
	inset: insetSpec,
	overflow: axisSpec,
	overscroll: axisSpec
};

const COLOR_FUNCTIONS = [
	'rgb',
	'rgba',
	'hsl',
	'hsla',
	'hwb',
	'lab',
	'lch',
	'oklab',
	'oklch',
	'color'
];

// Detects an arbitrary color value (`text-[#f00]`, `bg-[rgb(0,0,0)]`,
// `text-[color:var(--x)]`) so it classifies as a color rather than falling into
// the size/width bucket. A bracketed length (`text-[16px]`) or otherwise
// un-hinted value is left alone.
const isArbitraryColorValue = (segment: string): boolean => {
	if (!segment.startsWith('[')) {
		return false;
	}

	const inner = segment.slice(1);

	if (inner.startsWith('#') || inner.startsWith('color:')) {
		return true;
	}

	return COLOR_FUNCTIONS.some((fn) => inner.startsWith(`${fn}(`));
};

// Detects an arbitrary image value (`bg-[url(/hero.png)]`,
// `bg-[image:var(--x)]`, `bg-[linear-gradient(...)]`) so it classifies as an
// image on prefixes that opt in via `arbitraryImage`.
const isArbitraryImageValue = (segment: string): boolean =>
	segment.startsWith('[url(') ||
	segment.startsWith('[image:') ||
	/^\[(?:repeating-)?(?:linear|radial|conic)-gradient\(/.test(segment);

// Strips a trailing top-level `/opacity` or `/leading` modifier (`white/50`,
// `lg/6`) before a keyword lookup, so the modifier doesn't shadow the exact
// keyword match (`text-white/50` should still resolve `white` to `color`).
const withoutModifier = (segment: string): string =>
	/* c8 ignore next -- splitOutsideBrackets always returns at least one segment */
	splitOutsideBrackets(segment, '/')[0] ?? segment;

const baseCategory = (
	spec: PrefixSpec,
	value: ReadonlyArray<string>,
	head: string
): string => {
	const keyworded = spec.keywords.get(withoutModifier(head));

	if (keyworded !== undefined) {
		return keyworded;
	}

	if (spec.arbitraryImage === true && isArbitraryImageValue(head)) {
		return 'image';
	}

	// A color-capable prefix keys an arbitrary color to `color` regardless of
	// segment count, so `text-[#f00]` groups with `text-red-500` and not
	// `text-sm`.
	if (spec.long === 'color' && isArbitraryColorValue(head)) {
		return 'color';
	}

	if (value.length === 1 && spec.short !== undefined) {
		return spec.short;
	}

	if (value.length >= 2 && spec.long !== undefined) {
		return spec.long;
	}

	return spec.fallback;
};

const categorizeWithSpec = (
	spec: PrefixSpec,
	value: ReadonlyArray<string>
): string => {
	const [head = ''] = value;

	// A nested keyword introduces its own sub-property, classified from the
	// remaining segments (`ring-offset-2` → `offset-width`, `ring-offset-red-500`
	// → `offset-color`).
	const nested = spec.nested?.get(head);

	if (nested) {
		return `${head}-${categorizeWithSpec(nested, value.slice(1))}`;
	}

	const category = baseCategory(spec, value, head);

	// A composing `reverse` flag (`space-x-reverse`) sits alongside the width, so
	// it gets a distinct — but still axis-aware — category from `space-x-2`.
	if (spec.reverseComposes && value[value.length - 1] === 'reverse') {
		return `${category}-reverse`;
	}

	return category;
};

// The property category for a token's value (the segments after the first),
// or the dash count as a string for prefixes we don't classify.
const categorize = (
	firstSegment: string,
	value: ReadonlyArray<string>
): string => {
	const spec = PREFIX_SPECS[firstSegment];

	if (!spec) {
		return String(value.length);
	}

	return categorizeWithSpec(spec, value);
};

// Bare single-word utilities that are the unsuffixed default of a wider family
// (`rounded` is `rounded-DEFAULT`, `border` is `border-1`, `transition` is
// `transition-DEFAULT`, …). Each maps to a representative dashed value so it
// resolves to the very same conflict key as its sibling — `rounded` collides
// with `rounded-lg`, `transition` with `transition-none` — while `border` still
// stays clear of `border-gray-200` (a color, not a width).
const BARE_UTILITIES: Record<string, ReadonlyArray<string>> = {
	rounded: ['lg'],
	border: ['2'],
	ring: ['2'],
	outline: ['2'],
	shadow: ['md'],
	blur: ['sm'],
	grow: ['0'],
	shrink: ['0'],
	transition: ['all'],
	transform: ['none'],
	filter: ['none'],
	resize: ['none'],
	grayscale: ['0'],
	invert: ['0'],
	sepia: ['0']
};

// --- Shorthand/longhand overlap nodes ----------------------------------------
//
// A shorthand utility overrides several longhand utilities at once: `size-*`
// sets width and height, `m-*` sets every margin side, `inset-x-*` sets left
// and right, `rounded-t-*` sets both top corners. Related utilities can't
// simply share a conflict key — that would also make the longhand siblings
// conflict with each other (`w-4`/`h-4`, `mt-2`/`mb-2`) — so each conflict
// group is instead tagged with an overlap node, and groups whose nodes are
// connected through the covers relation below (under the same variant prefix)
// are merged before reporting. Siblings never touch without their shorthand.

// The side nodes of a spacing-style family (`m`, `p`, `scroll-m`, `scroll-p`):
// the bare prefix covers every side, the axes cover their physical sides. The
// logical `s`/`e` sides are leaves — they only merge through the bare prefix.
const sideOverlapCovers = (
	prefix: string
): ReadonlyArray<readonly [string, ReadonlyArray<string>]> => [
	[prefix, SIDES.map((side) => `${prefix}${side}`)],
	[`${prefix}x`, [`${prefix}r`, `${prefix}l`]],
	[`${prefix}y`, [`${prefix}t`, `${prefix}b`]]
];

// An axis family (`gap`, `overflow`, `translate`, …): the bare form sets all
// axes, so it covers the per-axis forms; the axes stay independent otherwise.
const axisOverlapCovers = (
	prefix: string
): readonly [string, ReadonlyArray<string>] => [
	prefix,
	[`${prefix}-x`, `${prefix}-y`]
];

const OVERLAP_COVERS: ReadonlyMap<string, ReadonlyArray<string>> = new Map<
	string,
	ReadonlyArray<string>
>([
	['size', ['w', 'h']],
	...sideOverlapCovers('m'),
	...sideOverlapCovers('p'),
	...sideOverlapCovers('scroll-m'),
	...sideOverlapCovers('scroll-p'),
	[
		'inset',
		[
			'inset-x',
			'inset-y',
			'inset-bs',
			'inset-be',
			'top',
			'right',
			'bottom',
			'left',
			'start',
			'end'
		]
	],
	['inset-x', ['right', 'left']],
	['inset-y', ['top', 'bottom']],
	axisOverlapCovers('gap'),
	axisOverlapCovers('overflow'),
	axisOverlapCovers('overscroll'),
	axisOverlapCovers('translate'),
	// `translate-none` resets every axis, including `z` — which the bare
	// `translate` shorthand above does not reach.
	['translate-none', ['translate', 'translate-x', 'translate-y', 'translate-z']],
	axisOverlapCovers('scale'),
	axisOverlapCovers('skew'),
	axisOverlapCovers('border-spacing'),
	['rounded', CORNERS.map((corner) => `rounded-${corner}`)],
	['rounded-t', ['rounded-tl', 'rounded-tr']],
	['rounded-r', ['rounded-tr', 'rounded-br']],
	['rounded-b', ['rounded-bl', 'rounded-br']],
	['rounded-l', ['rounded-tl', 'rounded-bl']],
	['rounded-s', ['rounded-ss', 'rounded-es']],
	['rounded-e', ['rounded-se', 'rounded-ee']],
	['border-w', SIDES.map((side) => `border-w-${side}`)],
	['border-w-x', ['border-w-r', 'border-w-l']],
	['border-w-y', ['border-w-t', 'border-w-b']],
	['border-color', SIDES.map((side) => `border-color-${side}`)],
	['border-color-x', ['border-color-r', 'border-color-l']],
	['border-color-y', ['border-color-t', 'border-color-b']],
	['touch', ['touch-x', 'touch-y', 'touch-pz']],
	// A font-size always reaches its own modifier-bearing siblings; only the
	// modifier-bearing node reaches `leading` (see `getConflictKey`).
	['text-size', ['text-size-leading']],
	['text-size-leading', ['leading']],
	// `flex-1`/`flex-auto`/`flex-none` set flex-grow, flex-shrink, and
	// flex-basis at once.
	['flex-sizing', ['grow', 'shrink', 'basis']],
	// `truncate` sets overflow (both axes), text-overflow, and white-space.
	[
		'truncate',
		['overflow', 'overflow-x', 'overflow-y', 'text-overflow', 'whitespace']
	],
	// `line-clamp-*` sets `display` (to `-webkit-box`) and `overflow` (to
	// `hidden`) unconditionally — unlike `truncate`, it doesn't set
	// `text-overflow`/`white-space`, and it reaches every single-word display
	// keyword (see `SINGLE_WORD_DISPLAY_KEYWORDS`).
	[
		'line-clamp',
		[
			...SINGLE_WORD_DISPLAY_KEYWORDS.map((word) => `display-${word}`),
			'overflow',
			'overflow-x',
			'overflow-y'
		]
	],
	// Naming a container also sets its type, so it conflicts with a plain,
	// unnamed `container-type` utility too.
	['container-named', ['container-type']],
	// `normal-nums` resets the whole font-variant-numeric property, so it
	// conflicts with every other value — but a figure/spacing/fraction style
	// doesn't conflict with a style from a different one of those three.
	[
		'fvn-normal',
		['fvn-ordinal', 'fvn-slashed-zero', 'fvn-figure', 'fvn-spacing', 'fvn-fraction']
	]
]);

// The undirected adjacency of the covers relation, so component merging can
// walk from a shorthand down to its longhands and from a longhand back up.
const buildOverlapNeighborsMap = (): ReadonlyMap<
	string,
	ReadonlyArray<string>
> => {
	const map = new Map<string, string[]>();

	for (const [node, covered] of OVERLAP_COVERS) {
		for (const target of covered) {
			getOrCreate(map, node, () => []).push(target);
			getOrCreate(map, target, () => []).push(node);
		}
	}

	return map;
};

const OVERLAP_NEIGHBORS = buildOverlapNeighborsMap();

const EMPTY_NODE_LIST: ReadonlyArray<string> = [];

const overlapNeighbors = (node: string): ReadonlyArray<string> => {
	const neighbors = OVERLAP_NEIGHBORS.get(node);

	/* c8 ignore next 3 -- every node getOverlapNode emits appears in the covers table */
	if (neighbors === undefined) {
		return EMPTY_NODE_LIST;
	}

	return neighbors;
};

// Segments that are an overlap node by themselves: every value of these
// prefixes sets the same property regardless of value shape (`w-4`, `w-[…]`,
// `mt-2`, `top-1/2`), so the value category is irrelevant to the node.
const SEGMENT_OVERLAP_NODES: ReadonlySet<string> = new Set([
	'size',
	'w',
	'h',
	'top',
	'right',
	'bottom',
	'left',
	'start',
	'end',
	'grow',
	'shrink',
	'basis',
	'whitespace',
	'm',
	...SIDES.map((side) => `m${side}`),
	'p',
	...SIDES.map((side) => `p${side}`)
]);

// Prefixes classified by axisSpec whose bare form sets all axes: the category
// picks between the whole-property node and a per-axis node.
const AXIS_OVERLAP_PREFIXES: ReadonlySet<string> = new Set([
	'inset',
	'gap',
	'overflow',
	'overscroll',
	'translate',
	'scale',
	'skew'
]);

// The scroll-margin/scroll-padding categories of the `scroll` prefix spec —
// the only `scroll-*` utilities with a shorthand overlap.
const SCROLL_SPACING_CATEGORIES: ReadonlySet<string> = new Set([
	'm',
	...SIDES.map((side) => `m${side}`),
	'p',
	...SIDES.map((side) => `p${side}`)
]);

const getAxisOverlapNode = (
	segment: string,
	category: string
): string | null => {
	if (category === 'all') {
		return segment;
	}

	if (category === 'x' || category === 'y' || category === 'bs' || category === 'be') {
		return `${segment}-${category}`;
	}

	return null;
};

const getRoundedOverlapNode = (category: string): string => {
	if (category === 'all') {
		return 'rounded';
	}

	// The remaining rounded categories are the corner names themselves.
	return `rounded-${category}`;
};

const getBorderOverlapNode = (category: string): string | null => {
	if (category === 'width') {
		return 'border-w';
	}

	if (category === 'color') {
		return 'border-color';
	}

	// A per-side width category is `${side}-width` (see `borderSideSpec`).
	if (category.endsWith('-width')) {
		return `border-w-${category.slice(0, -'-width'.length)}`;
	}

	// A per-side color category is `${side}-color` (see `borderSideSpec`).
	if (category.endsWith('-color')) {
		return `border-color-${category.slice(0, -'-color'.length)}`;
	}

	if (category.startsWith('spacing-')) {
		return getAxisOverlapNode(
			'border-spacing',
			category.slice('spacing-'.length)
		);
	}

	return null;
};

// `translate-none` resets every axis including `z`, unlike the bare form
// (which only reaches `x`/`y` through the generic axis handling) — see
// `translateSpec` and the `translate-none` entry in `OVERLAP_COVERS`.
const getTranslateOverlapNode = (category: string): string | null => {
	if (category === 'none') {
		return 'translate-none';
	}

	if (category === 'z') {
		return 'translate-z';
	}

	return getAxisOverlapNode('translate', category);
};

const getScrollOverlapNode = (category: string): string | null => {
	if (SCROLL_SPACING_CATEGORIES.has(category)) {
		return `scroll-${category}`;
	}

	return null;
};

// The `flex` sizing values (`flex-1`, `flex-auto`, `flex-none`) overlap
// grow/shrink/basis; the direction and wrap categories don't.
const getFlexOverlapNode = (category: string): string | null => {
	if (category === 'flex') {
		return 'flex-sizing';
	}

	return null;
};

// A font-size utility always overlaps its sibling sizes, and — only when it
// carries a `/leading` postfix modifier (see `getConflictKey`) — the
// separate `leading-*` utility too, since the modifier sets line-height
// directly.
const getTextOverlapNode = (category: string): string | null => {
	if (category === 'overflow') {
		return 'text-overflow';
	}

	if (category === 'size') {
		return 'text-size';
	}

	return null;
};

// `line-clamp-*` sets display and overflow as a side effect (see
// `OVERLAP_COVERS['line-clamp']`); `line-through` and other `line-*`
// categories take no part in the overlap graph.
const getLineOverlapNode = (category: string): string | null => {
	if (category === 'clamp-value') {
		return 'line-clamp';
	}

	return null;
};

const getLeadingOverlapNode = (): string => 'leading';

// `touch-none`/`touch-auto`/`touch-manipulation` overlap the `pan`/`pinch`
// sub-utilities; the other pan directions (`left`/`right`/`up`/`down`)
// compose instead of conflicting, so they're left unconnected.
const getTouchOverlapNode = (category: string): string | null => {
	if (category === 'base') {
		return 'touch';
	}

	if (category === 'pan-x') {
		return 'touch-x';
	}

	if (category === 'pan-y') {
		return 'touch-y';
	}

	if (category === 'pinch') {
		return 'touch-pz';
	}

	return null;
};

const SEGMENT_OVERLAP_HANDLERS: ReadonlyMap<
	string,
	(category: string) => string | null
> = new Map([
	['translate', getTranslateOverlapNode],
	['rounded', getRoundedOverlapNode],
	['border', getBorderOverlapNode],
	['scroll', getScrollOverlapNode],
	['flex', getFlexOverlapNode],
	['text', getTextOverlapNode],
	['line', getLineOverlapNode],
	['leading', getLeadingOverlapNode],
	['touch', getTouchOverlapNode]
]);

// The overlap node for a token's conflict group, or null when the token takes
// part in no shorthand/longhand relation.
const getOverlapNode = (segment: string, category: string): string | null => {
	if (SEGMENT_OVERLAP_NODES.has(segment)) {
		return segment;
	}

	const handler = SEGMENT_OVERLAP_HANDLERS.get(segment);

	if (handler) {
		return handler(category);
	}

	if (AXIS_OVERLAP_PREFIXES.has(segment)) {
		return getAxisOverlapNode(segment, category);
	}

	return null;
};

// Single-word utilities that set the properties of several other namespaces
// (`truncate` is overflow + text-overflow + white-space at once), so they get
// a conflict key of their own despite having no dashed family — no
// exclusive-groups opt-in needed.
//
// Every single-word `display` value gets its own node too (`display-flex`,
// `display-block`, …, never one shared across keywords), so `line-clamp`
// (which always sets `display`) can reach any of them without making the
// keywords conflict with *each other* by default (that stays behind
// `exclusiveGroups: true`). Hyphenated display keywords are excluded — see
// `SINGLE_WORD_DISPLAY_KEYWORDS`.
//
// Font-variant-numeric is a star, not a flat set: `lining-nums`/`oldstyle-nums`
// share a node and conflict directly, but a figure style doesn't conflict with
// a spacing (`tabular-nums`) or fraction (`diagonal-fractions`) style — only
// `normal-nums` reaches every value, via the `fvn-normal` bridge in
// `OVERLAP_COVERS`. Default-on (unlike `display`) since these words are
// unlikely to collide with a project's own class names.
const SINGLE_WORD_OVERLAP_NODES: Record<string, string> = {
	truncate: 'truncate',
	...Object.fromEntries(
		SINGLE_WORD_DISPLAY_KEYWORDS.map((word) => [word, `display-${word}`])
	),
	'normal-nums': 'fvn-normal',
	ordinal: 'fvn-ordinal',
	'slashed-zero': 'fvn-slashed-zero',
	'lining-nums': 'fvn-figure',
	'oldstyle-nums': 'fvn-figure',
	'proportional-nums': 'fvn-spacing',
	'tabular-nums': 'fvn-spacing',
	'diagonal-fractions': 'fvn-fraction',
	'stacked-fractions': 'fvn-fraction'
};

// The conflict key plus the pieces an overlap merge needs: the variant prefix
// and the overlap node the token belongs to (null for tokens outside every
// overlap family, including exclusive-group keys).
type ConflictKeyInfo = {
	key: string;
	variantPrefix: string;
	overlap: string | null;
};

// Splits `text` on `separator` characters that sit outside square brackets or
// parens, so arbitrary values keep their content intact as a single segment —
// `[calc(100%-2rem)]` isn't split on its inner dash, `[url(data:image/png)]`
// isn't split on its inner colon, and a Tailwind v4 CSS-variable shorthand
// like `w-(--my-var)` isn't split on the dash inside the variable name.
const splitOutsideBrackets = (text: string, separator: string): string[] => {
	const segments: string[] = [];
	let depth = 0;
	let start = 0;

	for (let index = 0; index < text.length; index += 1) {
		const char = text.charAt(index);

		if (char === '[' || char === '(') {
			depth += 1;
		} else if (char === ']' || char === ')') {
			depth -= 1;
		} else if (char === separator && depth === 0) {
			segments.push(text.slice(start, index));
			start = index + 1;
		}
	}

	segments.push(text.slice(start));

	return segments;
};

// Splits a token into its variant prefix and utility on the top-level colons.
// Variant segments are sorted so stacked variants in any order
// (`hover:focus:w-2` vs `focus:hover:w-2`) share one canonical prefix — the
// prefix only ever feeds the conflict key, never a report message.
const splitVariantPrefix = (
	token: string
): { variantPrefix: string; utility: string } => {
	const segments = splitOutsideBrackets(token, ':');
	const utility = segments.pop();

	/* c8 ignore next 3 -- splitOutsideBrackets always returns at least one segment */
	if (utility === undefined) {
		return { variantPrefix: '', utility: token };
	}

	return { variantPrefix: segments.sort().join(':'), utility };
};

const CONTAINER_TYPE_PREFIX = '@container';

// `@container`/`@container-normal`/`@container-size` all set one property
// (`container-type`), so they conflict directly regardless of keyword — unlike
// every other prefix here, they don't split into further categories. A `/name`
// suffix on any of the three additionally names the container
// (`container-named`), which still conflicts with a plain, unnamed
// `container-type` utility since naming also sets the type (see
// `OVERLAP_COVERS`); different names aren't distinguished from each other,
// matching tailwind-merge's own `container-named` classGroupId. This bypasses
// the regular dash-segment parsing entirely because `@container`/
// `@container/name` have no top-level `-` while `@container-size/name` does —
// too inconsistent for the normal `firstSegment` model.
const getContainerConflictKey = (
	bare: string,
	variantPrefix: string
): ConflictKeyInfo | null => {
	if (
		bare !== CONTAINER_TYPE_PREFIX &&
		!bare.startsWith(`${CONTAINER_TYPE_PREFIX}-`) &&
		!bare.startsWith(`${CONTAINER_TYPE_PREFIX}/`)
	) {
		return null;
	}

	const hasName = splitOutsideBrackets(bare, '/').length > 1;

	return {
		key: `${variantPrefix}|container|${hasName ? 'named' : 'type'}`,
		variantPrefix,
		overlap: hasName ? 'container-named' : 'container-type'
	};
};

// Returns null for tokens that don't look like a namespaced utility — single
// words (`flex`), purely-prefixed (`-`), or anything without a top-level `-`
// after the optional leading negative marker. The `!` important marker is
// stripped — trailing (Tailwind v4 `w-200!`) or leading (Tailwind v3
// `!w-200`) — so it doesn't split the conflict key.
const getConflictKey = (
	token: string,
	exclusiveGroups: ReadonlyMap<string, string>
): ConflictKeyInfo | null => {
	let stripped = token;

	if (token.endsWith('!')) {
		stripped = token.slice(0, -1);
	}

	const { variantPrefix, utility } = splitVariantPrefix(stripped);
	let bare = utility;

	if (bare.startsWith('!')) {
		bare = bare.slice(1);
	}

	if (bare.startsWith('-')) {
		bare = bare.slice(1);
	}

	// Takes precedence — can unify utilities the heuristic can't (single words,
	// or hyphenated siblings that don't share a prefix).
	const groupId = exclusiveGroups.get(bare);

	if (groupId !== undefined) {
		return {
			key: `${variantPrefix}|#${groupId}`,
			variantPrefix,
			overlap: null
		};
	}

	const containerInfo = getContainerConflictKey(bare, variantPrefix);

	if (containerInfo !== null) {
		return containerInfo;
	}

	// Matched on the full, un-split string — many of these words contain a
	// `-` themselves (`inline-block`, `table-caption`, `diagonal-fractions`),
	// so this has to run before the dash-split below, not inside its
	// `value.length === 0` branch (which would miss every hyphenated one).
	const wordOverlap = SINGLE_WORD_OVERLAP_NODES[bare];

	if (wordOverlap !== undefined) {
		return {
			key: `${variantPrefix}|${wordOverlap}`,
			variantPrefix,
			overlap: wordOverlap
		};
	}

	const value = splitOutsideBrackets(bare, '-');
	const firstSegment = value.shift();

	/* c8 ignore next 3 -- splitOutsideBrackets always returns at least one segment */
	if (firstSegment === undefined) {
		return null;
	}

	if (value.length === 0) {
		const bareValue = BARE_UTILITIES[firstSegment];

		if (bareValue === undefined) {
			return null;
		}

		const category = categorize(firstSegment, bareValue);

		return {
			key: `${variantPrefix}|${firstSegment}|${category}`,
			variantPrefix,
			overlap: getOverlapNode(firstSegment, category)
		};
	}

	// Tokens collide when they share a first segment and resolve to the same
	// property category (see `categorize`): `text-sm` (size) and `text-red-500`
	// (color) don't, while `text-red-500` and `text-blue-500` do.
	const category = categorize(firstSegment, value);

	// `text-lg/6` sets both font-size and line-height, so it also conflicts
	// with a bare `leading-*` — but plain `text-lg` (no modifier) doesn't. The
	// two get distinct keys so a plain and a modifier-bearing font-size never
	// share a group by mistake; the `text-size`/`text-size-leading` overlap
	// nodes reunite them whenever both are actually present (see
	// `OVERLAP_COVERS`).
	if (firstSegment === 'text' && category === 'size') {
		/* c8 ignore next -- value is non-empty here (the length === 0 case returns earlier) */
		const lastValueSegment = value[value.length - 1] ?? '';

		if (splitOutsideBrackets(lastValueSegment, '/').length > 1) {
			return {
				key: `${variantPrefix}|text|size-leading`,
				variantPrefix,
				overlap: 'text-size-leading'
			};
		}
	}

	return {
		key: `${variantPrefix}|${firstSegment}|${category}`,
		variantPrefix,
		overlap: getOverlapNode(firstSegment, category)
	};
};

type ConflictGroup = {
	tokens: Set<string>;
	entries: Entry[];
	variantPrefix: string;
	overlap: string | null;
};

const groupEntriesByConflictKey = (
	tokenMap: Map<string, Entry[]>,
	exclusiveGroups: ReadonlyMap<string, string>
): Map<string, ConflictGroup> => {
	const groups = new Map<string, ConflictGroup>();

	for (const [token, list] of tokenMap) {
		const info = getConflictKey(token, exclusiveGroups);

		if (info === null) {
			continue;
		}

		const group = getOrCreate(groups, info.key, () => ({
			tokens: new Set<string>(),
			entries: [],
			variantPrefix: info.variantPrefix,
			overlap: info.overlap
		}));

		group.tokens.add(token);
		group.entries.push(...list);
	}

	return groups;
};

const mergeGroupInto = (target: ConflictGroup, source: ConflictGroup) => {
	for (const token of source.tokens) {
		target.tokens.add(token);
	}

	target.entries.push(...source.entries);
};

// Folds every group reachable from `node` through present covers edges into
// `combined`: `m` pulls in a present `mt`; `w` and `h` only reach each other
// when a bridging `size` is present.
const mergeOverlapNeighbors = (
	combined: ConflictGroup,
	node: string,
	byNode: ReadonlyMap<string, ConflictGroup>,
	visited: Set<string>
) => {
	for (const neighbor of overlapNeighbors(node)) {
		if (visited.has(neighbor)) {
			continue;
		}

		const group = byNode.get(neighbor);

		if (group === undefined) {
			continue;
		}

		visited.add(neighbor);
		mergeGroupInto(combined, group);
		mergeOverlapNeighbors(combined, neighbor, byNode, visited);
	}
};

// Merges conflict groups related through a shorthand/longhand overlap. Groups
// are bucketed per variant prefix and overlap node (distinct conflict keys of
// one node collapse here — `mt-4` vs `mt-[calc(100%-1px)]` differ only in dash
// count), then each connected component of present nodes is reported as a
// single group. Longhand siblings without their shorthand stay separate.
const mergeOverlappingGroups = (
	groups: Map<string, ConflictGroup>
): ConflictGroup[] => {
	const result: ConflictGroup[] = [];
	// variant prefix -> overlap node -> the merged group for that node.
	const overlap = new Map<string, Map<string, ConflictGroup>>();

	for (const group of groups.values()) {
		if (group.overlap === null) {
			result.push(group);
			continue;
		}

		const byNode = getOrCreate(
			overlap,
			group.variantPrefix,
			() => new Map<string, ConflictGroup>()
		);
		const existing = byNode.get(group.overlap);

		if (existing) {
			mergeGroupInto(existing, group);
		} else {
			byNode.set(group.overlap, {
				tokens: new Set(group.tokens),
				entries: [...group.entries],
				variantPrefix: group.variantPrefix,
				overlap: group.overlap
			});
		}
	}

	for (const byNode of overlap.values()) {
		const visited = new Set<string>();

		for (const [node, group] of byNode) {
			if (visited.has(node)) {
				continue;
			}

			visited.add(node);
			mergeOverlapNeighbors(group, node, byNode, visited);
			result.push(group);
		}
	}

	return result;
};

const reportConflicts = (
	context: Rule.RuleContext,
	tokenMap: Map<string, Entry[]>,
	messageId: string,
	data: Record<string, string>,
	exclusiveGroups: ReadonlyMap<string, string>
) => {
	const groups = groupEntriesByConflictKey(tokenMap, exclusiveGroups);

	for (const group of mergeOverlappingGroups(groups)) {
		if (
			group.tokens.size < 2 ||
			isMutuallyExclusiveVariants(group.entries)
		) {
			continue;
		}

		const tokens = [...group.tokens].sort().join(', ');

		reportEntryList(context, group.entries, messageId, { tokens, ...data });
	}
};

export const analyzeConfigForRule = (
	context: Rule.RuleContext,
	configNode: Node,
	baseArgs: ReadonlyArray<Expression | SpreadElement>,
	exclusiveGroups: ReadonlyMap<string, string>
) => {
	const config = getProperties(configNode);
	const slotNames = getConfigSlotNames(config);
	const bySlot = indexEntriesBySlotAndToken(
		collectConfigEntries(config, slotNames, baseArgs, context.sourceCode)
	);

	for (const [slot, tokenMap] of bySlot) {
		reportDuplicateTokens(context, tokenMap, 'duplicate', { slot });
		reportConflicts(
			context,
			tokenMap,
			'conflict',
			{ slot },
			exclusiveGroups
		);
	}
};

export const analyzeCnForRule = (
	context: Rule.RuleContext,
	args: ReadonlyArray<Expression | SpreadElement>,
	exclusiveGroups: ReadonlyMap<string, string>
) => {
	const entries: Entry[] = [];

	for (const arg of args) {
		extractTokens(
			arg,
			'base',
			baseSource,
			EMPTY_SLOT_NAMES,
			entries,
			context.sourceCode,
			true
		);
	}

	const tokenMap = indexEntriesBySlotAndToken(entries).get('base');

	if (tokenMap) {
		reportDuplicateTokens(context, tokenMap, 'duplicateCn', {});
		reportConflicts(context, tokenMap, 'conflictCn', {}, exclusiveGroups);
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

// The tokens of a static class string, in source order — the shared inputs
// to both a fix plan's target rewrite (append) and value rewrites (remove).
const splitStaticTokens = (text: string): string[] =>
	text.trim().split(/\s+/).filter(Boolean);

// The literal's inner text exactly as written — not its cooked value. Token
// identity throughout this file is always the raw source substring (see
// `pushStringLiteralTokens`), so a fix's token math must match on that same raw
// text; diffing against the cooked value would silently miscompare whenever a
// token contains an escape sequence. Callers must have already confirmed
// `node` is a plain string/template literal.
const getRawInnerText = (context: Rule.RuleContext, node: Node): string =>
	context.sourceCode.getText(node).slice(1, -1);

// Recomputes a literal node's text from a new token list, reusing
// no-redundant-spaces' quote-preserving rewrite (`canHoistAsLiteral`). Returns
// null when the new content can't be safely re-emitted at the node's own
// delimiter — in which case the whole fix is abandoned (see
// `planSharedTokensFix`), never partially applied. Callers are expected to
// have already confirmed `node` is a plain, directly-authored string/template
// literal (via `getStaticStringText`) before calling this.
const planLiteralRewrite = (
	context: Rule.RuleContext,
	node: Node,
	nextTokens: readonly string[]
): { node: Node; nextText: string; quote: string } | null => {
	const raw = context.sourceCode.getText(node);
	/* c8 ignore next -- a string-literal/template node always has at least one delimiter char */
	const quote = raw[0] ?? '';
	const nextText = nextTokens.join(' ');

	if (!canHoistAsLiteral(nextText, quote)) {
		return null;
	}

	return { node, nextText, quote };
};

// The node holding `slot`'s contribution to a single variant value. Works from
// the raw (un-resolved) node so a hoisted `const` value isn't silently
// rewritten at its own declaration site.
const getRawSlotValueNode = (
	valueNode: Node,
	slot: string,
	slotNames: Set<string>
): Node | null => {
	const slotKeyed = collectSlotKeyedProperties(valueNode, slotNames);

	if (slotKeyed) {
		/* c8 ignore next -- `slot` only ever reaches here as a key `intersectSharedTokensBySlot` found present in every value's slot-keyed record, so `.get` always hits */
		return slotKeyed.get(slot) ?? null;
	}

	if (slot !== 'base') {
		return null;
	}

	return valueNode;
};

type SharedTokensFixPlan = {
	target: { node: Node; nextText: string; quote: string };
	values: ReadonlyArray<{ node: Node; nextText: string; quote: string }>;
};

// Plans a fix that lifts every shared token of one (variant, slot) pair out
// of each variant value and into the slot's `base`/`slots[slot]` target in one
// atomic rewrite — or returns null when any piece isn't safely inferrable, in
// which case the finding is still reported, just without a fix. Eligibility
// requires the target and every variant value's contribution to this slot to
// be a plain, directly-authored string or template literal.
const planSharedTokensFix = (
	context: Rule.RuleContext,
	slot: string,
	sharedTokens: ReadonlySet<string>,
	valueEntries: ReadonlyMap<string, Node>,
	slotNames: Set<string>,
	targetNode: Node | undefined
): SharedTokensFixPlan | null => {
	if (!targetNode) {
		return null;
	}

	if (getStaticStringText(targetNode) === null) {
		return null;
	}

	const targetTokens = splitStaticTokens(getRawInnerText(context, targetNode));
	const missingShared = [...sharedTokens].filter(
		(token) => !targetTokens.includes(token)
	);
	const targetPlan = planLiteralRewrite(context, targetNode, [
		...targetTokens,
		...missingShared
	]);

	if (!targetPlan) {
		return null;
	}

	const values: Array<{ node: Node; nextText: string; quote: string }> = [];

	for (const valueNode of valueEntries.values()) {
		const slotNode = getRawSlotValueNode(valueNode, slot, slotNames);

		if (!slotNode) {
			return null;
		}

		if (getStaticStringText(slotNode) === null) {
			return null;
		}

		const remainingTokens = splitStaticTokens(
			getRawInnerText(context, slotNode)
		).filter((token) => !sharedTokens.has(token));
		const valuePlan = planLiteralRewrite(context, slotNode, remainingTokens);

		if (!valuePlan) {
			return null;
		}

		values.push(valuePlan);
	}

	return { target: targetPlan, values };
};

const literalReplacement = (part: {
	node: Node;
	nextText: string;
	quote: string;
}): { node: Node; text: string } => ({
	node: part.node,
	text: `${part.quote}${part.nextText}${part.quote}`
});

const applySharedTokensFixPlan = (
	fixer: Rule.RuleFixer,
	plan: SharedTokensFixPlan
): Rule.Fix[] =>
	[plan.target, ...plan.values].map((part) => {
		const { node, text } = literalReplacement(part);

		return fixer.replaceText(node, text);
	});

const reportSharedTokenEntries = (
	context: Rule.RuleContext,
	tokensByValue: TokenEntriesBySlot[],
	variantKey: string,
	slot: string,
	token: string,
	plan: SharedTokensFixPlan | null
) => {
	const fix = plan
		? (fixer: Rule.RuleFixer) => applySharedTokensFixPlan(fixer, plan)
		: undefined;

	for (const valueMap of tokensByValue) {
		const entryList = valueMap.get(slot)?.get(token);

		/* c8 ignore next 3 -- `sharedTokens` only retains tokens present in every value map */
		if (!entryList) {
			continue;
		}

		reportEntryList(
			context,
			entryList,
			'shared',
			{ token, variant: variantKey, slot },
			fix
		);
	}
};

const reportSharedTokensBySlot = (
	context: Rule.RuleContext,
	sharedTokens: Map<string, Set<string>>,
	tokensByValue: TokenEntriesBySlot[],
	variantKey: string,
	valueEntries: ReadonlyMap<string, Node>,
	slotNames: Set<string>,
	getTargetNode: (slot: string) => Node | undefined
) => {
	for (const [slot, tokens] of sharedTokens) {
		const plan = planSharedTokensFix(
			context,
			slot,
			tokens,
			valueEntries,
			slotNames,
			getTargetNode(slot)
		);

		for (const token of tokens) {
			reportSharedTokenEntries(
				context,
				tokensByValue,
				variantKey,
				slot,
				token,
				plan
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
	const exhaustive = collectDefaultVariantKeys(config.get('defaultVariants'));
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
			variantSource(variantKey, valueKey),
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
	slotNames: Set<string>,
	getTargetNode: (slot: string) => Node | undefined
) => {
	// Boolean shorthand has a single branch — no cross-value comparison.
	if (isBooleanShorthandVariant(variantValue, slotNames)) {
		return;
	}

	const valueEntries = getStrictProperties(variantValue);

	// A spread or computed key means we can't see every value, so we'd
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

	reportSharedTokensBySlot(
		context,
		sharedTokens,
		tokensByValue,
		variantKey,
		valueEntries,
		slotNames,
		getTargetNode
	);
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
	slotNames: Set<string>,
	getTargetNode: (slot: string) => Node | undefined
) => {
	for (const [variantKey, variantValue] of getProperties(variants)) {
		if (!exhaustive.has(variantKey)) {
			continue;
		}

		analyzeVariantSharedTokens(
			context,
			variantKey,
			variantValue,
			slotNames,
			getTargetNode
		);
	}
};

export const analyzeSharedTokens = (context: Rule.RuleContext, configNode: Node) => {
	const config = getProperties(configNode);
	const variants = config.get('variants');

	if (!variants || variants.type !== 'ObjectExpression') {
		return;
	}

	const slotNames = getConfigSlotNames(config);
	const baseNode = config.get('base');
	const slotProperties = getProperties(config.get('slots'));

	const getTargetNode = (slot: string): Node | undefined =>
		slot === 'base' ? baseNode : slotProperties.get(slot);

	analyzeExhaustiveVariants(
		context,
		variants,
		collectExhaustiveVariantKeys(config),
		slotNames,
		getTargetNode
	);
};

const isEmptyStringNode = (node: Node): boolean =>
	getStaticStringText(node) === '';

const shouldReportEmptyString = (
	node: Node,
	allowEmptyString: boolean
): boolean => !allowEmptyString && isEmptyStringNode(node);

type ListItems = ReadonlyArray<Node | null>;

// Removes `node` along with the adjacent comma so the surrounding call/array
// literal stays syntactically valid. Returns null when removal would empty
// the list — that's reported separately, so we leave it for the developer.
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

// Built by `makeListFix` for a call/array list element, or supplied directly
// for a config property.
type EmptyFix = (fixer: Rule.RuleFixer) => Rule.Fix | null;

export const makeListFix = (
	context: Rule.RuleContext,
	node: Node,
	list: ListItems
): EmptyFix => {
	return (fixer) => removeFromList(fixer, context.sourceCode, node, list);
};

// In cn-style position an ObjectExpression is a clsx-style record whose keys are
// the class strings, so an empty string-literal key is an empty class value.
const checkRecordKeysForEmpty = (
	context: Rule.RuleContext,
	node: ObjectExpression
) => {
	for (const prop of node.properties) {
		if (prop.type !== 'Property' || prop.computed) {
			continue;
		}

		const { key } = prop;

		if (key.type === 'Literal' && key.value === '') {
			context.report({ node: key, messageId: 'emptyString' });
		}
	}
};

// `allowEmptyString` is set at the top of a `slots[key]` value, where `''` is
// a meaningful "slot with no default classes" declaration. `cnStyle` marks a
// cn-style position, where an ObjectExpression is a clsx-style record and a
// `&&`/ternary is a runtime branch rather than a class value itself.
export const visitForEmptyClasses = (
	context: Rule.RuleContext,
	node: Node,
	allowEmptyString: boolean,
	fix?: EmptyFix,
	cnStyle = false
) => {
	node = resolveStaticValue(node, context.sourceCode);

	if (shouldReportEmptyString(node, allowEmptyString)) {
		context.report({ node, messageId: 'emptyString', fix });
		return;
	}

	// The same `fix` still removes the whole enclosing argument/element
	// regardless of which branch triggered the report.
	if (
		cnStyle &&
		node.type === 'LogicalExpression' &&
		node.operator === '&&'
	) {
		visitForEmptyClasses(context, node.right, false, fix, cnStyle);
		return;
	}

	if (cnStyle && node.type === 'ConditionalExpression') {
		visitForEmptyClasses(context, node.consequent, false, fix, cnStyle);
		visitForEmptyClasses(context, node.alternate, false, fix, cnStyle);
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
				makeListFix(context, element, node.elements),
				cnStyle
			);
		});
		return;
	}

	if (node.type === 'ObjectExpression') {
		if (node.properties.length === 0) {
			context.report({ node, messageId: 'emptyObject', fix });
			return;
		}

		if (cnStyle) {
			checkRecordKeysForEmpty(context, node);
		}
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

const isEmptyArrayLiteral = (node: Node): boolean =>
	node.type === 'ArrayExpression' && node.elements.length === 0;

// A compound matcher (any entry key other than `class`/`className`/`slots`)
// whose value is a literal empty array can never match: `matchesCompound` in
// sv.ts calls `.some()` over it, which is always false for an empty array —
// so the whole entry is permanently unreachable, regardless of props.
const checkCompoundMatchersForEmpty = (
	context: Rule.RuleContext,
	compoundEntries: ArrayExpression
) => {
	forEachStaticItem(compoundEntries.elements, (element) => {
		if (element.type !== 'ObjectExpression') {
			return;
		}

		for (const prop of element.properties) {
			if (prop.type !== 'Property' || prop.computed) {
				continue;
			}

			const key = getKeyName(prop);

			if (key === null || COMPOUND_NON_MATCHER_KEYS.has(key)) {
				continue;
			}

			const value = resolveStaticValue(prop.value, context.sourceCode);

			if (isEmptyArrayLiteral(value)) {
				context.report({
					node: value,
					messageId: 'unreachableMatcher',
					data: { key }
				});
			}
		}
	});
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

	checkCompoundMatchersForEmpty(context, value);

	forEachCompoundClass(value, (cls) => {
		// An empty record still falls through to the emptyObject report.
		if (cls.type === 'ObjectExpression' && cls.properties.length > 0) {
			for (const slotClass of getProperties(cls).values()) {
				visitForEmptyClasses(context, slotClass, false);
			}

			return;
		}

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

// A `createSV()` factory config may carry a spread or computed key (reported
// as dynamic by no-dynamic-classes); those aren't class-bearing, so they're
// skipped here.
export const checkConfigForEmptyClasses = (
	context: Rule.RuleContext,
	config: ObjectExpression
) => {
	for (const prop of config.properties) {
		if (prop.type !== 'Property') {
			continue;
		}

		const key = getKeyName(prop);

		if (key === null) {
			continue;
		}

		const checker = svEmptyConfigValueCheckers[key];

		if (checker) {
			checker(context, prop.value, (fixer) =>
				removeFromList(
					fixer,
					context.sourceCode,
					prop,
					config.properties
				)
			);
		}
	}
};

// An `sv()` config call compiles the variant function (and seeds its cache)
// once; nesting it inside a function rebuilds and discards that on every
// call. A function scope anywhere above the call means it isn't top level.
export const isInsideFunctionScope = (scope: Scope.Scope): boolean => {
	let current: Scope.Scope | null = scope;

	while (current) {
		if (current.type === 'function') {
			return true;
		}

		current = current.upper;
	}

	return false;
};