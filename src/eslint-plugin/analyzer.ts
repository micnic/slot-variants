import type { AST, Rule, Scope, SourceCode } from 'eslint';
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
import { getOrCreate } from './map-utils.ts';
import {
	type ConflictOptions,
	getConflictKey,
	overlapNeighbors
} from './tailwind-categories.ts';

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

const matchCnCall = (node: CallExpression): CallMatch => ({
	config: null,
	args: node.arguments
});

// The local names each tracked export is reachable under, plus the locals bound
// to a whole-module namespace import.
type TrackedNames = {
	svNames: Set<string>;
	cnNames: Set<string>;
	createSvNames: Set<string>;
	namespaceNames: Set<string>;
};

const matchSvCnCall = (
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

// Token identity follows the value the browser sees, so a class string with an
// escape has to be split on its cooked value: `'w-1 w-2'` is two classes
// even though its source holds no whitespace to split on, and `'w-1'` is
// the same class as `w-1`. Escapes are the only thing that can make the two
// disagree, so a source without a backslash tokenizes exactly as written (the
// caller's fast path) and keeps per-token report offsets. With one, mapping each
// token back through the escapes would be needed to place it, so the whole
// literal is highlighted instead — the trade-off `reportRedundantSpaces` already
// makes. A fix is unaffected: `canHoistAsLiteral` refuses any rewrite whose text
// would contain a backslash, so an escape-bearing literal is reported unfixed
// either way.
const hasEscape = (rawText: string): boolean => rawText.includes('\\');

const pushCookedTokens = (
	cooked: string,
	[start, end]: AST.Range,
	slot: string,
	source: Source,
	entries: Entry[]
) => {
	for (const match of cooked.matchAll(/\S+/g)) {
		entries.push({
			source,
			slot,
			token: match[0],
			start,
			end
		});
	}
};

// The literal's inner text exactly as written — not its cooked value. Shared
// by token extraction and the shared-tokens/no-redundant-spaces fixers, which
// all need to diff or rewrite the raw source rather than the cooked value.
const getInnerText = (sourceCode: SourceCode, node: Node): string =>
	sourceCode.getText(node).slice(1, -1);

const pushStringLiteralTokens = (
	node: Node,
	slot: string,
	source: Source,
	entries: Entry[],
	sourceCode: SourceCode
) => {
	const raw = getInnerText(sourceCode, node);
	const range = sourceCode.getRange(node);

	if (hasEscape(raw)) {
		/* c8 ignore next -- callers only pass a static string/template literal */
		const cooked = getStaticStringText(node) ?? raw;

		pushCookedTokens(cooked, range, slot, source, entries);

		return;
	}

	// String/template delimiters are single-char, so start offset + 1 is the
	// first inner character.
	pushTokensFromText(raw, range[0] + 1, slot, source, entries);
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
		const raw = quasi.value.raw;

		if (hasEscape(raw)) {
			/* c8 ignore next -- cooked is always defined on untagged templates */
			const cooked = quasi.value.cooked ?? raw;

			pushCookedTokens(
				cooked,
				sourceCode.getRange(quasi),
				slot,
				source,
				entries
			);

			continue;
		}

		pushTokensFromText(
			raw,
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
	const names: TrackedNames = {
		cnNames: new Set<string>(),
		svNames: new Set<string>(),
		createSvNames: new Set<string>(),
		namespaceNames: new Set<string>()
	};
	const trackedNamesByImport: Record<string, Set<string>> = {
		cn: names.cnNames,
		sv: names.svNames,
		createSV: names.createSvNames
	};

	const importsTracker = (node: ImportDeclaration) => {
		if (node.source.value !== 'slot-variants') {
			return;
		}

		for (const specifier of node.specifiers) {
			// `import * as SV` reaches every export through one local binding, so
			// the export being called is only known at the call site.
			if (specifier.type === 'ImportNamespaceSpecifier') {
				names.namespaceNames.add(specifier.local.name);
				continue;
			}

			trackNamedImport(specifier, trackedNamesByImport);
		}
	};

	return { names, importsTracker };
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

// The export a namespace member call names — `SV.sv(…)` for
// `import * as SV from 'slot-variants'`. Null when the callee isn't a member of
// a tracked namespace binding, including a computed one (`SV[name](…)`), whose
// export can't be read statically.
const resolveNamespaceExportName = (
	context: Rule.RuleContext,
	node: CallExpression,
	namespaceNames: Set<string>
): string | null => {
	const { callee } = node;

	if (callee.type !== 'MemberExpression' || callee.computed) {
		return null;
	}

	const { object, property } = callee;

	if (object.type !== 'Identifier' || property.type !== 'Identifier') {
		return null;
	}

	if (
		!namespaceNames.has(object.name) ||
		!identifierResolvesToImport(context, object)
	) {
		return null;
	}

	return property.name;
};

// A namespace member call names its export outright, so there are no aliases to
// resolve — `SV.sv(…)` is an `sv()` call by construction.
const matchNamespaceCall = (
	node: CallExpression,
	exportName: string,
	sourceCode: SourceCode
): CallMatch | null => {
	if (exportName === 'sv') {
		return matchSvCall(node, sourceCode);
	}

	if (exportName === 'cn') {
		return matchCnCall(node);
	}

	if (exportName === 'createSV') {
		return matchFactoryCall(node, sourceCode);
	}

	return null;
};

// A `createSV(...)` factory call whose callee resolves to a tracked createSV
// import, named directly or reached through a namespace binding. The `const`
// binding it initializes is a pre-configured `sv()`, so its call sites are
// analyzed exactly like `sv()` calls.
const isCreateSvFactoryCall = (
	context: Rule.RuleContext,
	node: CallExpression,
	names: TrackedNames
): boolean => {
	if (
		resolveNamespaceExportName(context, node, names.namespaceNames) ===
		'createSV'
	) {
		return true;
	}

	const factoryCallee = resolveCalleeIdentifier(context, node);

	if (!factoryCallee) {
		return false;
	}

	return (
		names.createSvNames.has(factoryCallee.name) &&
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
// `const` aliases. A namespace member call (`SV.sv(…)`) names its export
// directly; a callee resolving to a `createSV(...)`-initialized binding is
// treated like `sv`; a direct `createSV` import names a factory call; a direct
// sv/cn import uses the sv/cn convention. Null for anything untracked.
const matchTrackedCall = (
	context: Rule.RuleContext,
	node: CallExpression,
	names: TrackedNames
): CallMatch | null => {
	const namespaceExport = resolveNamespaceExportName(
		context,
		node,
		names.namespaceNames
	);

	if (namespaceExport !== null) {
		return matchNamespaceCall(node, namespaceExport, context.sourceCode);
	}

	if (node.callee.type !== 'Identifier') {
		return null;
	}

	const resolved = resolveStaticValue(node.callee, context.sourceCode);

	// A `const button = createSV(...)(…)` binding behaves like `sv`.
	if (resolved.type === 'CallExpression') {
		if (isCreateSvFactoryCall(context, resolved, names)) {
			return matchSvCall(node, context.sourceCode);
		}

		return null;
	}

	if (resolved.type !== 'Identifier') {
		return null;
	}

	// The `createSV(defaults)` factory call itself — validate its defaults.
	if (names.createSvNames.has(resolved.name)) {
		if (identifierResolvesToImport(context, resolved)) {
			return matchFactoryCall(node, context.sourceCode);
		}

		return null;
	}

	const call = matchSvCnCall(
		node,
		resolved.name,
		names,
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
	const { names, importsTracker } = createImportsTracker();

	return {
		ImportDeclaration(node: ImportDeclaration) {
			importsTracker(node);
		},
		CallExpression(node: CallExpression) {
			if (
				names.svNames.size === 0 &&
				names.cnNames.size === 0 &&
				names.createSvNames.size === 0 &&
				names.namespaceNames.size === 0
			) {
				return;
			}

			const call = matchTrackedCall(context, node, names);

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

// A string/template literal's opening delimiter, read from its source text.
const getQuoteChar = (sourceCode: SourceCode, node: Node): string => {
	const raw = sourceCode.getText(node);

	/* c8 ignore next -- a string-literal/template node always has at least one delimiter char */
	return raw[0] ?? '';
};

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

	const quote = getQuoteChar(context.sourceCode, node);
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
	if (
		cnStyle &&
		node.type === 'LogicalExpression' &&
		node.operator === '&&'
	) {
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

type ConflictGroup = {
	tokens: Set<string>;
	entries: Entry[];
	variantPrefix: string;
	overlap: string | null;
};

const groupEntriesByConflictKey = (
	tokenMap: Map<string, Entry[]>,
	options: ConflictOptions
): Map<string, ConflictGroup> => {
	const groups = new Map<string, ConflictGroup>();

	for (const [token, list] of tokenMap) {
		const info = getConflictKey(token, options);

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
	options: ConflictOptions
) => {
	const groups = groupEntriesByConflictKey(tokenMap, options);

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
	options: ConflictOptions
) => {
	const config = getProperties(configNode);
	const slotNames = getConfigSlotNames(config);
	const bySlot = indexEntriesBySlotAndToken(
		collectConfigEntries(config, slotNames, baseArgs, context.sourceCode)
	);

	for (const [slot, tokenMap] of bySlot) {
		reportDuplicateTokens(context, tokenMap, 'duplicate', { slot });
		reportConflicts(context, tokenMap, 'conflict', { slot }, options);
	}
};

export const analyzeCnForRule = (
	context: Rule.RuleContext,
	args: ReadonlyArray<Expression | SpreadElement>,
	options: ConflictOptions
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
		reportConflicts(context, tokenMap, 'conflictCn', {}, options);
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

// Token identity throughout this file is always the raw source substring (see
// `pushStringLiteralTokens`), so a fix's token math must match on that same raw
// text; diffing against the cooked value would silently miscompare whenever a
// token contains an escape sequence. Callers must have already confirmed
// `node` is a plain string/template literal.
const getRawInnerText = (context: Rule.RuleContext, node: Node): string =>
	getInnerText(context.sourceCode, node);

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
	const quote = getQuoteChar(context.sourceCode, node);
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

	const targetTokens = splitStaticTokens(
		getRawInnerText(context, targetNode)
	);
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

		// Lifting every token out would leave an empty class string behind, which
		// no-empty-classes then reports — so there's no rewrite here that leaves
		// the config clean. Whether the value should keep an empty string or go
		// away entirely is the author's call, so the finding is reported unfixed.
		if (remainingTokens.length === 0) {
			return null;
		}

		const valuePlan = planLiteralRewrite(
			context,
			slotNode,
			remainingTokens
		);

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
	// over-flag tokens that may differ in the unseen branches. An empty record
	// has no tokens to compare and is reported by no-empty-classes instead. A
	// single value needs no comparison — the variant is exhaustive, so that one
	// value always applies and every token in it is constant.
	if (!valueEntries || valueEntries.size === 0) {
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

export const analyzeSharedTokens = (
	context: Rule.RuleContext,
	configNode: Node
) => {
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

// `charAt` returns '' past either end of the string, so neither of the walks
// below needs a bounds check.
const isSpaceOrTab = (char: string): boolean => char === ' ' || char === '\t';

// The end of the run of horizontal whitespace starting at `from`. A newline
// stops it: a line break belongs to the line that follows, so it's removed with
// the element ahead of it rather than trailed behind.
const skipSpacesAndTabs = (text: string, from: number): number => {
	let index = from;

	while (isSpaceOrTab(text.charAt(index))) {
		index += 1;
	}

	return index;
};

// The offset of the line break introducing the element at `start`, when the
// element sits on its own line and so owns the indentation before it. Null when
// it shares a line with whatever precedes it.
const startOfOwnLine = (text: string, start: number): number | null => {
	let index = start;

	while (isSpaceOrTab(text.charAt(index - 1))) {
		index -= 1;
	}

	if (text.charAt(index - 1) === '\n') {
		return index - 1;
	}

	return null;
};

// Removes `node` along with one adjacent comma so the surrounding call/array
// literal stays syntactically valid, and with the separating whitespace on that
// same side so no double space or dangling indent is left behind. Returns null
// when removal would empty the list — that's reported separately, so we leave it
// for the developer.
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

	const source = sourceCode.getText();
	const [start, end] = sourceCode.getRange(node);
	const after = sourceCode.getTokenAfter(node);

	if (after && after.value === ',') {
		const ownLine = startOfOwnLine(source, start);

		// An own-line element takes the line break and indentation that introduce
		// it, so the elements after it keep theirs.
		if (ownLine !== null) {
			return fixer.removeRange([ownLine, after.range[1]]);
		}

		return fixer.removeRange([
			start,
			skipSpacesAndTabs(source, after.range[1])
		]);
	}

	const before = sourceCode.getTokenBefore(node);

	/* c8 ignore next 3 -- a non-trailing list element always has a comma after; trailing always has one before */
	if (!before || before.value !== ',') {
		return null;
	}

	// The last element: its own comma is the one before it, and the whitespace
	// after that comma separates the two.
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

// `[]` and `{}` are the empty forms of a config container. `requiredVariants`
// and `multiSlots` also accept a boolean, which is never empty.
const isEmptyContainer = (value: Node): boolean => {
	if (value.type === 'ObjectExpression') {
		return value.properties.length === 0;
	}

	if (value.type === 'ArrayExpression') {
		return value.elements.length === 0;
	}

	return false;
};

// The config containers that hold no class values of their own — variant
// selections and slot/variant name lists. Empty, each is inert: it reads as
// configuration but changes nothing about the output, so it's reported to be
// removed rather than left to look meaningful.
const checkEmptyConfigContainer =
	(key: string): EmptyConfigChecker =>
	(context, value, remove) => {
		if (!isEmptyContainer(value)) {
			return;
		}

		context.report({
			node: value,
			messageId: 'emptyConfig',
			data: { key },
			fix: remove
		});
	};

const svEmptyConfigValueCheckers: Record<string, EmptyConfigChecker> = {
	base: (context, node, remove) => {
		visitForEmptyClasses(context, node, false, remove);
	},
	slots: checkSlotsForEmpty,
	variants: checkVariantsForEmpty,
	compoundVariants: checkCompoundsForEmpty,
	compoundSlots: checkCompoundsForEmpty,
	defaultVariants: checkEmptyConfigContainer('defaultVariants'),
	requiredVariants: checkEmptyConfigContainer('requiredVariants'),
	multiSlots: checkEmptyConfigContainer('multiSlots'),
	presets: checkEmptyConfigContainer('presets')
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

const FUNCTION_TYPES: ReadonlySet<string> = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression'
]);

// Why a call would be evaluated more than once, or null when it runs exactly
// once at module evaluation. The two reasons double as require-top-level-config's
// messageIds, so the report needs no mapping.
export type RepeatedEvaluation = 'nested' | 'field' | null;

// An `sv()` config call compiles the variant function (and seeds its cache)
// once; anything that re-enters the call rebuilds and discards that work. A
// function body re-runs per call, and an instance field initializer per `new`.
// A `static` field and a static block both run once with the class definition,
// so they're fine on their own — but the class may itself sit inside a
// function, which is why the walk doesn't stop at them. The innermost reason
// wins, so the report names what the author can see around the call.
export const findRepeatedEvaluation = (
	context: Rule.RuleContext,
	node: CallExpression
): RepeatedEvaluation => {
	let reason: RepeatedEvaluation = null;

	for (const ancestor of context.sourceCode.getAncestors(node)) {
		if (FUNCTION_TYPES.has(ancestor.type)) {
			reason = 'nested';
		} else if (
			ancestor.type === 'PropertyDefinition' &&
			ancestor.static === false
		) {
			reason = 'field';
		}
	}

	return reason;
};