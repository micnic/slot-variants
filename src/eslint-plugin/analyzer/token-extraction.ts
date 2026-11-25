import type { AST, SourceCode } from 'eslint';
import type {
	ConditionalExpression,
	Expression,
	Literal,
	Node,
	ObjectExpression,
	Property,
	SpreadElement,
	TemplateLiteral
} from 'estree';
import { getKeyName } from './config-keys.ts';
import {
	resolveArray,
	resolveContainer,
	resolveStaticValue
} from './const-bindings.ts';
import {
	CLASS_TOKEN,
	getInnerText,
	getQuasiInnerRange,
	getQuasiText,
	getStaticStringText
} from './literals.ts';
import {
	collectSlotKeyedProperties,
	getClassValue,
	getConfigRecord,
	getProperties,
	getStrictProperties,
	type GroupSlots
} from './properties.ts';
import { isStaticTernaryTemplate } from './static-predicates.ts';
import {
	EMPTY_MATCHERS,
	EMPTY_SLOT_NAMES,
	type Entry,
	type VariantMatchers,
	variantSource,
	withMatcher
} from './token-model.ts';

type TokenExtractionContext = {
	slot: string;
	source: VariantMatchers;
	slotNames: ReadonlySet<string>;
	entries: Entry[];
	sourceCode: SourceCode;
};

// Where the tokens of a class string land, and what they render under.
type TokenSink = Pick<TokenExtractionContext, 'slot' | 'source' | 'entries'>;

// A token sink that also reads the literals' source text.
type LiteralSink = TokenSink & Pick<TokenExtractionContext, 'sourceCode'>;

export type NodeVisitor = (node: Node) => void;

/**
 * The variant values a preset sets that can be read, and whether that is all
 * of them: one with a spread or a value that can't be read may set others.
 */
export type PresetValues = { matchers: VariantMatchers; complete: boolean };

type TokenOffsets = number | AST.Range;

type StringKeyVisitor = (key: Literal, text: string) => void;

type ExtractFn = (
	node: Node,
	slot: string,
	source: VariantMatchers,
	cnStyle?: boolean
) => void;

// Keys of a call site's props or a compound entry that name something other
// than a variant. `preset` selects variant values indirectly; expanding it
// would need the `presets` config in hand, so it is skipped: a compound or call
// left with no other matcher only ever widens what's reported.
export const NON_MATCHER_KEYS: ReadonlySet<string> = new Set([
	'class',
	'className',
	'preset'
]);

// The keys `readMatchers` skips by default: none.
const NO_MATCHER_SKIP: ReadonlySet<string> = new Set();

// A compound entry's `slots` names the slots it targets, not a variant.
export const COMPOUND_NON_MATCHER_KEYS: ReadonlySet<string> = new Set([
	...NON_MATCHER_KEYS,
	'slots'
]);

// Token identity follows the value the browser sees, so a class string
// with an escape has to be split on its cooked value: `'w-1\x20w-2'` is two
// classes even though its source holds no whitespace to split on, and
// `'w\-1'` is the same class as `w-1`. Escapes are the only thing that
// can make the two disagree, so a source without a backslash tokenizes
// exactly as written (the caller's fast path) and keeps per-token report
// offsets. With one, mapping each token back through the escapes would be
// needed to place it, so the whole literal is highlighted instead — the
// trade-off `reportRedundantSpaces` already makes. A fix is unaffected:
// `canHoistAsLiteral` refuses any rewrite whose text would contain a backslash,
// so an escape-bearing literal is reported unfixed either way.
const hasEscape = (rawText: string): boolean => rawText.includes('\\');

// Where each token of a text lands: a start offset places every token at its
// own position after it; a range pins every token to that whole range.
const getTokenRange = (
	offsets: TokenOffsets,
	index: number,
	token: string
): AST.Range => {
	if (typeof offsets === 'number') {
		const start = offsets + index;

		return [start, start + token.length];
	}

	return offsets;
};

const pushTokensFromText = (
	text: string,
	offsets: TokenOffsets,
	{ slot, source, entries }: TokenSink
) => {
	for (const match of text.matchAll(CLASS_TOKEN)) {
		const token = match[0];
		const [start, end] = getTokenRange(offsets, match.index, token);

		entries.push({ source, slot, token, start, end });
	}
};

// Exported for `no-restyle`, which tokenizes markup class text that no estree
// string literal covers, like the text runs of a Svelte `class` attribute.
export const pushBaseTokensFromText = (
	text: string,
	base: number,
	entries: Entry[]
) => {
	pushTokensFromText(text, base, {
		slot: 'base',
		source: EMPTY_MATCHERS,
		entries
	});
};

// The tokens of a string literal or template quasi spanning `range`. Raw text
// maps onto source offsets one-to-one; an escape breaks that, so the cooked
// tokens are pinned to the whole range instead.
const pushLiteralTokens = (
	raw: string,
	cooked: string,
	range: AST.Range,
	sink: TokenSink
) => {
	if (hasEscape(raw)) {
		pushTokensFromText(cooked, range, sink);

		return;
	}

	// String/template delimiters are single-char, so start offset + 1 is the
	// first inner character.
	pushTokensFromText(raw, range[0] + 1, sink);
};

// The tokens of a template's quasis, the classes around its substitutions.
// Callers make sure no token straddles a substitution. A quasi's text is read
// from the source rather than its `raw` value, which turns a `\r\n` into a
// `\n` and would shift every offset after one.
const pushQuasiTokens = (node: TemplateLiteral, sink: LiteralSink) => {
	const { sourceCode } = sink;

	for (const quasi of node.quasis) {
		const [start, end] = getQuasiInnerRange(sourceCode, quasi);

		pushLiteralTokens(
			sourceCode.text.slice(start, end),
			getQuasiText(quasi),
			sourceCode.getRange(quasi),
			sink
		);
	}
};

// Exported for `no-restyle`, which reads the literal classes of a template
// whose substitutions aren't static, so no other extraction covers them.
export const pushBaseQuasiTokens = (
	node: TemplateLiteral,
	entries: Entry[],
	sourceCode: SourceCode
) => {
	pushQuasiTokens(node, {
		slot: 'base',
		source: EMPTY_MATCHERS,
		entries,
		sourceCode
	});
};

// `text` is the literal's static (cooked) value, already read by the caller.
const pushStringLiteralTokens = (
	node: Node,
	text: string,
	sink: LiteralSink
) => {
	const { sourceCode } = sink;

	pushLiteralTokens(
		getInnerText(sourceCode, node),
		text,
		sourceCode.getRange(node),
		sink
	);
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

// `source` under the branch of `test` that renders, its truthy one unless
// `truthy` is false. Keyed on the condition's source text so the same
// condition spelled twice resolves to one matcher. Leading `!` flips the branch
// instead of the key, so `cond && a` and `!cond && b` land on opposite values
// of one key.
const withCondition = (
	source: VariantMatchers,
	test: Node,
	sourceCode: SourceCode,
	truthy = true
): VariantMatchers => {
	let condition = test;
	let holds = truthy;

	while (condition.type === 'UnaryExpression' && condition.operator === '!') {
		condition = condition.argument;
		holds = !holds;
	}

	let branch = 'falsy';

	if (holds) {
		branch = 'truthy';
	}

	return withMatcher(source, `cond:${sourceCode.getText(condition)}`, branch);
};

// A clsx-style record key is itself a class string, appended verbatim when its
// (runtime) value is truthy — so a multi-token key like `'px-2 py-1'`
// contributes each of its tokens. String-literal keys are tokenized like any
// class string; identifier/numeric keys are a single, space-free token.
const pushRecordKeyTokens = (prop: Property, sink: LiteralSink) => {
	const { slot, source, entries, sourceCode } = sink;
	const { key } = prop;

	if (key.type === 'Literal' && typeof key.value === 'string') {
		pushStringLiteralTokens(key, key.value, sink);
		return;
	}

	const token = getKeyName(prop);

	/* c8 ignore next 3 -- a non-computed key is an Identifier or Literal */
	if (token === null) {
		return;
	}

	const [start, end] = sourceCode.getRange(key);

	entries.push({ source, slot, token, start, end });
};

// Spreads and computed keys carry an unknowable class name and are skipped
// (no-dynamic-classes flags them separately). Each key applies when its value
// is truthy, so `{ a: cond }` is matched like `cond && a`: keys under `cond`
// and `!cond` resolve as mutually exclusive.
const extractRecordTokens = (
	node: ObjectExpression,
	context: TokenExtractionContext
) => {
	for (const prop of node.properties) {
		if (prop.type !== 'Property' || prop.computed) {
			continue;
		}

		pushRecordKeyTokens(prop, {
			...context,
			source: withCondition(
				context.source,
				prop.value,
				context.sourceCode
			)
		});
	}
};

const extractConditionalTokens = (
	node: ConditionalExpression,
	context: TokenExtractionContext
) => {
	const { consequent, alternate } = node;
	const { source, sourceCode } = context;

	if (
		consequent.type !== 'ConditionalExpression' &&
		alternate.type !== 'ConditionalExpression'
	) {
		extractTokens(
			consequent,
			{
				...context,
				source: withCondition(source, node.test, sourceCode)
			},
			true
		);
		extractTokens(
			alternate,
			{
				...context,
				source: withCondition(source, node.test, sourceCode, false)
			},
			true
		);
		return;
	}

	const ternaryKey = `ternary@${sourceCode.getRange(node)[0]}`;
	const leaves: Node[] = [];

	collectBranchLeaves(node, leaves);

	for (const [index, leaf] of leaves.entries()) {
		extractTokens(
			leaf,
			{
				...context,
				source: withMatcher(source, ternaryKey, `branch${index}`)
			},
			true
		);
	}
};

const extractTernaryTemplateTokens = (
	node: TemplateLiteral,
	context: TokenExtractionContext
) => {
	pushQuasiTokens(node, context);

	for (const expression of node.expressions) {
		extractTokens(expression, context, true);
	}
};

// The shapes only a cn-style position can hold: the conditional forms of the
// calling convention, and a clsx-style record whose keys are the classes. True
// when the node was one of them and its tokens have been extracted.
const extractCnStyleTokens = (
	node: Node,
	context: TokenExtractionContext
): boolean => {
	const { source, sourceCode } = context;

	// Only the right operand is a class contribution; the left is recorded as a
	// truthy-branch matcher so a complementary `!cond && …` elsewhere resolves
	// as mutually exclusive.
	if (node.type === 'LogicalExpression' && node.operator === '&&') {
		extractTokens(
			node.right,
			{
				...context,
				source: withCondition(source, node.left, sourceCode)
			},
			true
		);

		return true;
	}

	// A simple two-branch ternary is keyed on its condition text, letting
	// complementary conditionals across arguments — `cond ? a : ''` with
	// `cond ? '' : b` — resolve as exclusive too. A chained ternary keeps a
	// position-based key: its leaves are only exclusive to one another.
	if (node.type === 'ConditionalExpression') {
		extractConditionalTokens(node, context);

		return true;
	}

	// Quasis carry always-present tokens; each substitution carries its own
	// exclusive branch tokens.
	if (isStaticTernaryTemplate(node)) {
		extractTernaryTemplateTokens(node, context);

		return true;
	}

	if (node.type === 'ObjectExpression') {
		extractRecordTokens(node, context);

		return true;
	}

	return false;
};

// `cnStyle` toggles the cn() calling-convention forms — logical-AND, ternaries
// (chained or nested), ternary templates, and clsx-style records, each of
// which may nest the others. In an sv() config's class positions an object is
// instead a slot-keyed record.
export const extractTokens = (
	node: Node,
	context: TokenExtractionContext,
	cnStyle = false
) => {
	const { slotNames, sourceCode } = context;

	node = resolveStaticValue(node, sourceCode);

	const text = getStaticStringText(node);

	if (text !== null) {
		pushStringLiteralTokens(node, text, context);
		return;
	}

	if (cnStyle && extractCnStyleTokens(node, context)) {
		return;
	}

	if (node.type === 'ArrayExpression') {
		forEachStaticItem(node.elements, (element) => {
			extractTokens(element, context, cnStyle);
		});
		return;
	}

	const slotKeyedProps = collectSlotKeyedProperties(node, slotNames);

	if (!slotKeyedProps) {
		return;
	}

	for (const [key, value] of slotKeyedProps) {
		extractTokens(value, { ...context, slot: key });
	}
};

// A `cn()`-style class list: every token lands in the base slot, unconditioned.
export const extractCnTokens = (
	node: Node,
	entries: Entry[],
	sourceCode: SourceCode
) => {
	extractTokens(
		node,
		{
			slot: 'base',
			source: EMPTY_MATCHERS,
			slotNames: EMPTY_SLOT_NAMES,
			entries,
			sourceCode
		},
		true
	);
};

// The tokens of a cn()-style argument list, all in the `base` slot.
export const collectCnEntries = (
	args: ReadonlyArray<Expression | SpreadElement>,
	sourceCode: SourceCode
): Entry[] => {
	const entries: Entry[] = [];

	for (const arg of args) {
		extractCnTokens(arg, entries, sourceCode);
	}

	return entries;
};

// The conditional forms of the cn() calling convention: only the `&&` right
// operand and each ternary branch carry classes. True when `node` was one of
// them.
export const forEachCnBranch = (node: Node, visit: NodeVisitor): boolean => {
	if (node.type === 'LogicalExpression' && node.operator === '&&') {
		visit(node.right);

		return true;
	}

	if (node.type === 'ConditionalExpression') {
		visit(node.consequent);
		visit(node.alternate);

		return true;
	}

	return false;
};

// The string-literal keys of a clsx-style record, which are its class strings.
// Identifier/numeric keys are plain single tokens; computed keys are dynamic.
export const forEachStringRecordKey = (
	node: ObjectExpression,
	visit: StringKeyVisitor
) => {
	for (const prop of node.properties) {
		if (prop.type !== 'Property' || prop.computed) {
			continue;
		}

		const { key } = prop;

		if (key.type === 'Literal' && typeof key.value === 'string') {
			visit(key, key.value);
		}
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

// Visits each statically readable item of the array `node` resolves to, itself
// resolved. Nothing when `node` is no array.
const forEachResolvedItem = (
	node: Node | undefined,
	sourceCode: SourceCode,
	visit: NodeVisitor
) => {
	const list = resolveArray(node, sourceCode);

	if (list === null) {
		return;
	}

	forEachStaticItem(list.elements, (item) => {
		visit(resolveStaticValue(item, sourceCode));
	});
};

// Boolean shorthand when not a plain object; any record is keyed by value.
export const isBooleanShorthandVariant = (node: Node): boolean =>
	node.type !== 'ObjectExpression';

export const forEachStringLiteralElement = (
	node: Node | undefined,
	sourceCode: SourceCode,
	visit: (value: string) => void
) => {
	forEachResolvedItem(node, sourceCode, (element) => {
		const text = getStaticStringText(element);

		if (text !== null) {
			visit(text);
		}
	});
};

export const forEachCompoundClass = (
	node: Node | undefined,
	sourceCode: SourceCode,
	visit: (cls: Node, compound: ReadonlyMap<string, Node>) => void
) => {
	forEachResolvedItem(node, sourceCode, (element) => {
		if (element.type !== 'ObjectExpression') {
			return;
		}

		const compound = getProperties(element);
		const cls = getClassValue(compound);

		if (cls) {
			visit(cls, compound);
		}
	});
};

const extractVariantTokens = (
	variantsMap: ReadonlyMap<string, Node>,
	sourceCode: SourceCode,
	extract: ExtractFn
) => {
	for (const [variantKey, rawValue] of variantsMap.entries()) {
		const variantValue = resolveStaticValue(rawValue, sourceCode);

		if (isBooleanShorthandVariant(variantValue)) {
			extract(variantValue, 'base', variantSource(variantKey, 'true'));
			continue;
		}

		for (const [valueKey, valueNode] of getProperties(variantValue)) {
			extract(valueNode, 'base', variantSource(variantKey, valueKey));
		}
	}
};

// A negative number matcher (`-1`), which ESTree writes as a unary minus,
// read as `sv()` stringifies it. Null for anything else.
const getNegativeNumberText = (
	node: Node,
	sourceCode: SourceCode
): string | null => {
	if (node.type !== 'UnaryExpression' || node.operator !== '-') {
		return null;
	}

	const argument = resolveStaticValue(node.argument, sourceCode);

	if (argument.type !== 'Literal' || typeof argument.value !== 'number') {
		return null;
	}

	return String(-argument.value);
};

// Strings, booleans, and numbers align with variant value keys (`{ true: … }`,
// `{ 2: … }`), which getKeyName also reads as strings. Read through `const`
// bindings, like class values, as are negative numbers.
export const getStaticMatcherValue = (
	raw: Node,
	sourceCode: SourceCode
): string | null => {
	const node = resolveStaticValue(raw, sourceCode);
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

	return getNegativeNumberText(node, sourceCode);
};

// A matcher property's value set: a scalar reads as one value, an array of
// scalars (`variant: ["primary", "secondary"]`) as all of its values —
// matching any one of them satisfies the compound. An array is read in full or
// not at all: a hole, spread or dynamic element could stand for any value.
export const getStaticMatcherValues = (
	node: Node,
	sourceCode: SourceCode
): ReadonlySet<string> | null => {
	const scalar = getStaticMatcherValue(node, sourceCode);

	if (scalar !== null) {
		return new Set([scalar]);
	}

	const list = resolveArray(node, sourceCode);

	if (list === null) {
		return null;
	}

	const values = new Set<string>();

	for (const item of list.elements) {
		if (item === null || item.type === 'SpreadElement') {
			return null;
		}

		const value = getStaticMatcherValue(item, sourceCode);

		if (value === null) {
			return null;
		}

		values.add(value);
	}

	if (values.size === 0) {
		return null;
	}

	return values;
};

export const readMatchers = (
	properties: ReadonlyMap<string, Node>,
	sourceCode: SourceCode,
	skip: ReadonlySet<string> = NO_MATCHER_SKIP
): Map<string, ReadonlySet<string>> => {
	const matchers = new Map<string, ReadonlySet<string>>();

	for (const [key, value] of properties) {
		if (skip.has(key)) {
			continue;
		}

		const values = getStaticMatcherValues(value, sourceCode);

		if (values !== null) {
			matchers.set(key, values);
		}
	}

	return matchers;
};

/** One preset's variant values, and whether every one of them was read. */
export const readPresetValues = (
	value: Node | undefined,
	sourceCode: SourceCode
): PresetValues => {
	const container = resolveContainer(value, sourceCode);
	const values = getStrictProperties(container);
	const matchers = readMatchers(getProperties(container), sourceCode);

	return {
		matchers,
		complete: values !== null && matchers.size === values.size
	};
};

// The variant values a compound's `preset` stands for, as matchers, the way
// `sv()` reads them: none when the preset can't be named, isn't one of the
// config's own or can't be read in full, which can only under-suppress.
const readPresetMatchers = (
	compound: ReadonlyMap<string, Node>,
	presets: ReadonlyMap<string, PresetValues>,
	sourceCode: SourceCode
): VariantMatchers => {
	const node = compound.get('preset');

	if (node === undefined) {
		return EMPTY_MATCHERS;
	}

	const name = getStaticMatcherValue(node, sourceCode);

	if (name === null) {
		return EMPTY_MATCHERS;
	}

	const preset = presets.get(name);

	// A value that can't be read may be any, so it proves nothing
	if (preset === undefined || !preset.complete) {
		return EMPTY_MATCHERS;
	}

	return preset.matchers;
};

// Derives an exclusivity source from a compound's matcher properties, so two
// compounds requiring disjoint variant values aren't reported as conflicts.
// Its `preset` stands for the values it sets, which the compound's own
// matchers override, as in `sv()`. Only fully read matchers count; any other
// is skipped, which can only under-suppress, never wrongly suppress. With no
// readable matcher left, it is never exclusive, like the base.
const getCompoundSource = (
	compound: ReadonlyMap<string, Node>,
	presets: ReadonlyMap<string, PresetValues>,
	sourceCode: SourceCode
): VariantMatchers =>
	new Map([
		...readPresetMatchers(compound, presets, sourceCode),
		...readMatchers(compound, sourceCode, COMPOUND_NON_MATCHER_KEYS)
	]);

// The slots a `compoundSlots` entry targets, each once: `sv()` expands a group
// to its slots and applies the class to every slot a single time, however
// many of the targets reach it. A group also holds the slots its parents in
// `extend` list under its name. A group of the config whose slot list can't
// be read stays a target of its own.
const getCompoundSlotTargets = (
	targets: Node | undefined,
	groups: ReadonlyMap<string, Node>,
	inheritedGroups: GroupSlots,
	sourceCode: SourceCode
): ReadonlySet<string> => {
	const slots = new Set<string>();

	forEachStringLiteralElement(targets, sourceCode, (target) => {
		const group = groups.get(target);
		const inherited = inheritedGroups.get(target);

		if (
			(group === undefined && inherited === undefined) ||
			(group !== undefined && resolveArray(group, sourceCode) === null)
		) {
			slots.add(target);
			return;
		}

		for (const slot of inherited ?? []) {
			slots.add(slot);
		}

		forEachStringLiteralElement(group, sourceCode, (slot) => {
			slots.add(slot);
		});
	});

	return slots;
};

const extractCompoundTokens = (
	config: ReadonlyMap<string, Node>,
	inheritedGroups: GroupSlots,
	presets: ReadonlyMap<string, PresetValues>,
	sourceCode: SourceCode,
	extract: ExtractFn
) => {
	const groups = getConfigRecord(config, 'groups', sourceCode);

	forEachCompoundClass(
		config.get('compoundVariants'),
		sourceCode,
		(cls, compound) => {
			extract(
				cls,
				'base',
				getCompoundSource(compound, presets, sourceCode)
			);
		}
	);

	forEachCompoundClass(
		config.get('compoundSlots'),
		sourceCode,
		(cls, compound) => {
			const source = getCompoundSource(compound, presets, sourceCode);
			const targets = getCompoundSlotTargets(
				compound.get('slots'),
				groups,
				inheritedGroups,
				sourceCode
			);

			for (const slot of targets) {
				extract(cls, slot, source);
			}
		}
	);
};

// `inheritedGroups` holds the groups of the parents in `extend`, `presets` the
// values of the config's own presets.
export const collectConfigEntries = (
	config: ReadonlyMap<string, Node>,
	slotNames: ReadonlySet<string>,
	inheritedGroups: GroupSlots,
	presets: ReadonlyMap<string, PresetValues>,
	baseArgs: ReadonlyArray<Expression | SpreadElement>,
	sourceCode: SourceCode
): Entry[] => {
	const entries: Entry[] = [];
	const extract: ExtractFn = (node, slot, source, cnStyle) => {
		extractTokens(
			node,
			{ slot, source, slotNames, entries, sourceCode },
			cnStyle
		);
	};

	const slots = getConfigRecord(config, 'slots', sourceCode);

	for (const [slotKey, slotValue] of slots) {
		extract(slotValue, slotKey, EMPTY_MATCHERS);
	}

	// Leading args use the cn() calling convention (slots don't apply to them).
	for (const arg of baseArgs) {
		extract(arg, 'base', EMPTY_MATCHERS, true);
	}

	const base = config.get('base');

	if (base) {
		extract(base, 'base', EMPTY_MATCHERS);
	}

	extractVariantTokens(
		getConfigRecord(config, 'variants', sourceCode),
		sourceCode,
		extract
	);
	extractCompoundTokens(
		config,
		inheritedGroups,
		presets,
		sourceCode,
		extract
	);

	return entries;
};