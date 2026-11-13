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
	getStaticStringText,
	hasEscape
} from './literals.ts';
import {
	collectSlotKeyedProperties,
	getClassValue,
	getProperties
} from './properties.ts';
import { isStaticTernaryTemplate } from './static-predicates.ts';
import {
	baseSource,
	compoundSource,
	EMPTY_SLOT_NAMES,
	type Entry,
	type Source,
	variantSource,
	withMatcher
} from './token-model.ts';

type TokenExtractionContext = {
	slot: string;
	source: Source;
	slotNames: ReadonlySet<string>;
	entries: Entry[];
	sourceCode: SourceCode;
};

type NodeVisitor = (node: Node) => void;

type TokenOffsets = number | AST.Range;

type StringKeyVisitor = (key: Literal, text: string) => void;

type ExtractFn = (
	node: Node,
	slot: string,
	source: Source,
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

// A compound entry's `slots` names the slots it targets, not a variant.
export const COMPOUND_NON_MATCHER_KEYS: ReadonlySet<string> = new Set([
	...NON_MATCHER_KEYS,
	'slots'
]);

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
	slot: string,
	source: Source,
	entries: Entry[]
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
	pushTokensFromText(text, base, 'base', baseSource, entries);
};

// The tokens of a string literal or template quasi spanning `range`. Raw text
// maps onto source offsets one-to-one; an escape breaks that, so the cooked
// tokens are pinned to the whole range instead.
const pushLiteralTokens = (
	raw: string,
	cooked: string | null | undefined,
	range: AST.Range,
	slot: string,
	source: Source,
	entries: Entry[]
) => {
	if (hasEscape(raw)) {
		/* c8 ignore next -- static literals and untagged quasis are cooked */
		pushTokensFromText(cooked ?? raw, range, slot, source, entries);

		return;
	}

	// String/template delimiters are single-char, so start offset + 1 is the
	// first inner character.
	pushTokensFromText(raw, range[0] + 1, slot, source, entries);
};

// The tokens of a template's quasis, the classes around its substitutions.
// Callers make sure no token straddles a substitution.
const pushQuasiTokens = (
	node: TemplateLiteral,
	slot: string,
	source: Source,
	entries: Entry[],
	sourceCode: SourceCode
) => {
	for (const quasi of node.quasis) {
		pushLiteralTokens(
			quasi.value.raw,
			quasi.value.cooked,
			sourceCode.getRange(quasi),
			slot,
			source,
			entries
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
	pushQuasiTokens(node, 'base', baseSource, entries, sourceCode);
};

// `text` is the literal's static (cooked) value, already read by the caller.
const pushStringLiteralTokens = (
	node: Node,
	text: string,
	slot: string,
	source: Source,
	entries: Entry[],
	sourceCode: SourceCode
) => {
	pushLiteralTokens(
		getInnerText(sourceCode, node),
		text,
		sourceCode.getRange(node),
		slot,
		source,
		entries
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

// Keyed on the condition's source text so the same condition spelled twice
// resolves to one matcher. Leading `!` flips the branch instead of the key,
// so `cond && a` and `!cond && b` land on opposite values of one key.
const conditionMatcher = (
	test: Node,
	sourceCode: SourceCode
): readonly [string, boolean] => {
	let condition = test;
	let truthy = true;

	while (condition.type === 'UnaryExpression' && condition.operator === '!') {
		condition = condition.argument;
		truthy = !truthy;
	}

	return [`cond:${sourceCode.getText(condition)}`, truthy];
};

const branchName = (truthy: boolean) => {
	if (truthy) {
		return 'truthy';
	}

	return 'falsy';
};

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
		pushStringLiteralTokens(
			key,
			key.value,
			slot,
			source,
			entries,
			sourceCode
		);
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
	slot: string,
	source: Source,
	entries: Entry[],
	sourceCode: SourceCode
) => {
	for (const prop of node.properties) {
		if (prop.type !== 'Property' || prop.computed) {
			continue;
		}

		const [key, truthy] = conditionMatcher(prop.value, sourceCode);
		const keySource = withMatcher(source, key, branchName(truthy));

		pushRecordKeyTokens(prop, slot, keySource, entries, sourceCode);
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
		const [key, truthy] = conditionMatcher(node.test, sourceCode);
		const branches: ReadonlyArray<readonly [Node, string]> = [
			[consequent, branchName(truthy)],
			[alternate, branchName(!truthy)]
		];

		for (const [leaf, branch] of branches) {
			extractTokens(
				leaf,
				{ ...context, source: withMatcher(source, key, branch) },
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
	const { slot, source, entries, sourceCode } = context;

	pushQuasiTokens(node, slot, source, entries, sourceCode);

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
	const { slot, source, entries, sourceCode } = context;

	// Only the right operand is a class contribution; the left is recorded as a
	// truthy-branch matcher so a complementary `!cond && …` elsewhere resolves
	// as mutually exclusive.
	if (node.type === 'LogicalExpression' && node.operator === '&&') {
		const [key, truthy] = conditionMatcher(node.left, sourceCode);

		extractTokens(
			node.right,
			{
				...context,
				source: withMatcher(source, key, branchName(truthy))
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
		extractRecordTokens(node, slot, source, entries, sourceCode);

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
	const { slot, source, slotNames, entries, sourceCode } = context;

	node = resolveStaticValue(node, sourceCode);

	const text = getStaticStringText(node);

	if (text !== null) {
		pushStringLiteralTokens(node, text, slot, source, entries, sourceCode);
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
			source: baseSource,
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

// Boolean shorthand when not a plain object; any record is keyed by value.
export const isBooleanShorthandVariant = (node: Node): boolean =>
	node.type !== 'ObjectExpression';

export const forEachStringLiteralElement = (
	node: Node | undefined,
	sourceCode: SourceCode,
	visit: (value: string) => void
) => {
	const list = resolveArray(node, sourceCode);

	if (list === null) {
		return;
	}

	forEachStaticItem(list.elements, (element) => {
		const text = getStaticStringText(
			resolveStaticValue(element, sourceCode)
		);

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
	const list = resolveArray(node, sourceCode);

	if (list === null) {
		return;
	}

	forEachStaticItem(list.elements, (item) => {
		const element = resolveStaticValue(item, sourceCode);

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

// Strings, booleans, and numbers align with variant value keys (`{ true: … }`,
// `{ 2: … }`), which getKeyName also reads as strings.
export const getStaticMatcherValue = (node: Node): string | null => {
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

// A matcher property's value set: a scalar reads as one value, an array of
// scalars (`variant: ["primary", "secondary"]`) as every value it statically
// resolves — matching any one of them satisfies the compound. A dynamic
// element inside the array is skipped, same as a wholly dynamic matcher;
// an array with no statically-readable element gives up, same as null.
export const getStaticMatcherValues = (
	node: Node
): ReadonlySet<string> | null => {
	const scalar = getStaticMatcherValue(node);

	if (scalar !== null) {
		return new Set([scalar]);
	}

	if (node.type !== 'ArrayExpression') {
		return null;
	}

	const values = new Set<string>();

	forEachStaticItem(node.elements, (element) => {
		const value = getStaticMatcherValue(element);

		if (value !== null) {
			values.add(value);
		}
	});

	if (values.size === 0) {
		return null;
	}

	return values;
};

export const readMatchers = (
	properties: ReadonlyMap<string, Node>,
	skip: ReadonlySet<string>
): Map<string, ReadonlySet<string>> => {
	const matchers = new Map<string, ReadonlySet<string>>();

	for (const [key, value] of properties) {
		if (skip.has(key)) {
			continue;
		}

		const values = getStaticMatcherValues(value);

		if (values !== null) {
			matchers.set(key, values);
		}
	}

	return matchers;
};

// Derives an exclusivity source from a compound's matcher properties, so two
// compounds requiring disjoint variant values aren't reported as conflicts.
// Only statically-known matchers count; a wholly dynamic matcher (or an array
// with no statically-readable element) is skipped, which can only
// under-suppress, never wrongly suppress. With no readable matcher left,
// falls back to the never-exclusive compound source.
const getCompoundSource = (compound: ReadonlyMap<string, Node>): Source => {
	const matchers = readMatchers(compound, COMPOUND_NON_MATCHER_KEYS);

	if (matchers.size === 0) {
		return compoundSource;
	}

	return { kind: 'variant', matchers };
};

const extractCompoundTokens = (
	compoundVariants: Node | undefined,
	compoundSlots: Node | undefined,
	sourceCode: SourceCode,
	extract: ExtractFn
) => {
	forEachCompoundClass(compoundVariants, sourceCode, (cls, compound) => {
		extract(cls, 'base', getCompoundSource(compound));
	});

	forEachCompoundClass(compoundSlots, sourceCode, (cls, compound) => {
		const source = getCompoundSource(compound);

		forEachStringLiteralElement(
			compound.get('slots'),
			sourceCode,
			(slot) => {
				extract(cls, slot, source);
			}
		);
	});
};

export const collectConfigEntries = (
	config: ReadonlyMap<string, Node>,
	slotNames: ReadonlySet<string>,
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

	const slots = resolveContainer(config.get('slots'), sourceCode);

	for (const [slotKey, slotValue] of getProperties(slots)) {
		extract(slotValue, slotKey, baseSource);
	}

	// Leading args use the cn() calling convention (slots don't apply to them).
	for (const arg of baseArgs) {
		extract(arg, 'base', baseSource, true);
	}

	const base = config.get('base');

	if (base) {
		extract(base, 'base', baseSource);
	}

	extractVariantTokens(
		getProperties(resolveContainer(config.get('variants'), sourceCode)),
		sourceCode,
		extract
	);
	extractCompoundTokens(
		config.get('compoundVariants'),
		config.get('compoundSlots'),
		sourceCode,
		extract
	);

	return entries;
};