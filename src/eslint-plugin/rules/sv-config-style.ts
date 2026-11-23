import type { Rule, SourceCode } from 'eslint';
import type {
	CallExpression,
	Expression,
	Node,
	ObjectExpression,
	Property,
	SpreadElement
} from 'estree';
import { isLastArgument } from '../analyzer/call-matching.ts';
import {
	CONFIG_KEY_ORDER,
	docsUrl,
	getKeyName
} from '../analyzer/config-keys.ts';
import { isWithinNode, resolveContainer } from '../analyzer/const-bindings.ts';
import { removeFromList, removeSoleItem } from '../analyzer/list-fix.ts';
import { getProperties, hasSpreadProperty } from '../analyzer/properties.ts';
import { isStaticStringNode } from '../analyzer/static-predicates.ts';
import {
	getFactoryDefaults,
	mayInheritKey
} from '../analyzer/styled-values.ts';
import { createTrackedCallListeners } from '../analyzer/tracked-calls.ts';

type KeyEntry = {
	prop: Property;
	key: string;
	index: number;
};

// A key reported as out of order, and the earlier key it should precede.
type OrderViolation = { entry: KeyEntry; before: KeyEntry };

type ReorderFix = (fixer: Rule.RuleFixer) => Rule.Fix;

type BaseStyle = 'field' | 'separateArg' | 'slotsBase';

// A base written as a property: the config's `base`, or `slots.base`.
type PropertyBaseStyle = 'field' | 'slotsBase';

// The three places base classes can live. `node` is what a mismatch is
// reported on and `value` holds the classes; a property source also carries the
// object it sits in (the config, or the resolved `slots` object) so a fix can
// remove it from there.
type BaseSource =
	| { style: 'separateArg'; node: Expression | SpreadElement; value: Node }
	| {
			style: PropertyBaseStyle;
			node: Property;
			value: Node;
			container: ObjectExpression;
	  };

const ORDER_INDEX = new Map(CONFIG_KEY_ORDER.map((key, index) => [key, index]));

// What may follow a bare last argument: the call's closing parenthesis,
// possibly after a trailing comma.
const CALL_END_PATTERN = /^\s*,?\s*\)$/;

// What may separate a bare leading argument from the config: a single comma.
const ARGUMENT_SEPARATOR_PATTERN = /^\s*,\s*$/;

const BASE_STYLE_LABELS: Record<BaseStyle, string> = {
	field: 'a "base" field in the config',
	separateArg: 'a separate leading argument',
	slotsBase: 'a "base" entry in "slots"'
};

// Reads each property's canonical-order index. A spread, a computed key, or a
// key outside CONFIG_KEY_ORDER makes the whole object's fixer unsafe (returned
// via `fixable: false`), but known keys are still collected so their order can
// still be checked and reported.
const collectOrderedEntries = (
	properties: ReadonlyArray<Property | SpreadElement>
): { entries: KeyEntry[]; fixable: boolean } => {
	const entries: KeyEntry[] = [];
	let fixable = true;

	for (const prop of properties) {
		if (prop.type !== 'Property') {
			fixable = false;
			continue;
		}

		const key = getKeyName(prop);

		if (key === null) {
			fixable = false;
			continue;
		}

		const index = ORDER_INDEX.get(key);

		// A config only needs `slots` or `variants` to be one, and
		// `createSV(defaults)` takes any object literal, so other keys may sit
		// beside them — an unrecognized key can't be placed in the canonical
		// order, so the whole object becomes unfixable while known keys stay
		// checked.
		if (index === undefined) {
			fixable = false;
			continue;
		}

		entries.push({ prop, key, index });
	}

	return { entries, fixable };
};

// Rewrites the run of known properties in canonical order. The separator
// (comma + whitespace) between the first two properties in their original
// source order is reused between every reordered property, so the rewritten
// object keeps the file's existing formatting.
// Tradeoff: sampling a single separator can normalize away uneven spacing —
// most visibly when a base-style fix has just inserted an inline
// `base: 'x', ` before the first property, so a following reorder pass samples
// that inline separator and collapses a multi-line object onto one line.
// Accepted as cosmetic: the result is still valid, correctly ordered code, and
// a formatter pass restores the layout.
const buildReorderFix = (
	sourceCode: SourceCode,
	entries: ReadonlyArray<KeyEntry>
): ReorderFix | undefined => {
	const [first, second] = entries;
	const last = entries[entries.length - 1];

	/* c8 ignore next 3 -- only built once a key is out of order: 2+ entries */
	if (!first || !second || !last) {
		return undefined;
	}

	const [start, firstEnd] = sourceCode.getRange(first.prop);
	const [secondStart] = sourceCode.getRange(second.prop);
	const [, end] = sourceCode.getRange(last.prop);
	const separator = sourceCode.getText().slice(firstEnd, secondStart);
	const text = [...entries]
		.sort((a, b) => a.index - b.index)
		.map((entry) => sourceCode.getText(entry.prop))
		.join(separator);

	return (fixer) => fixer.replaceTextRange([start, end], text);
};

// Each key that comes after a key it should precede, paired with the latest
// such key seen so far.
const findOrderViolations = (
	entries: ReadonlyArray<KeyEntry>
): OrderViolation[] => {
	const violations: OrderViolation[] = [];
	let runningMax: KeyEntry | null = null;

	for (const entry of entries) {
		if (runningMax !== null && entry.index < runningMax.index) {
			violations.push({ entry, before: runningMax });
			continue;
		}

		runningMax = entry;
	}

	return violations;
};

const checkKeyOrder = (
	context: Rule.RuleContext,
	configNode: ObjectExpression
) => {
	const { entries, fixable } = collectOrderedEntries(configNode.properties);
	const violations = findOrderViolations(entries);

	if (violations.length === 0) {
		return;
	}

	let fix: ReorderFix | undefined;

	// Any comment inside the config object (attached to a property, or
	// floating between them) disables the reorder fixer for that call —
	// safely reattaching comments to their moved property isn't attempted,
	// matching the "under-suppress, never wrongly rewrite" bail-out pattern
	// used elsewhere in this plugin.
	if (
		fixable &&
		context.sourceCode.getCommentsInside(configNode).length === 0
	) {
		fix = buildReorderFix(context.sourceCode, entries);
	}

	for (const { entry, before } of violations) {
		context.report({
			node: entry.prop,
			messageId: 'wrongOrder',
			data: { key: entry.key, before: before.key },
			fix
		});
	}
};

const findBaseProperty = (obj: ObjectExpression): Property | null => {
	for (const prop of obj.properties) {
		if (prop.type === 'Property' && getKeyName(prop) === 'base') {
			return prop;
		}
	}

	return null;
};

// The `slots` record, read through a `const` binding like other containers.
const getSlotsObject = (
	configNode: ObjectExpression,
	sourceCode: SourceCode
): ObjectExpression | null => {
	const slots = resolveContainer(
		getProperties(configNode).get('slots'),
		sourceCode
	);

	if (slots !== undefined && slots.type === 'ObjectExpression') {
		return slots;
	}

	return null;
};

// Whether a base-style fix would edit a `slots` record declared outside the
// config — one other configs may share.
const touchesHoistedSlots = (
	sourceCode: SourceCode,
	configNode: ObjectExpression,
	source: BaseSource,
	insertInto: ObjectExpression | null
): boolean => {
	if (
		insertInto !== null &&
		!isWithinNode(sourceCode, insertInto, configNode)
	) {
		return true;
	}

	return (
		'container' in source &&
		!isWithinNode(sourceCode, source.container, configNode)
	);
};

// Whether a base-style fix would move a base into or out of a `slots` record
// with a spread, whose own `base` may override the moved one or join it.
const touchesSpreadSlots = (
	slotsObj: ObjectExpression | null,
	source: BaseSource,
	insertInto: ObjectExpression | null
): boolean => {
	if (slotsObj === null) {
		return false;
	}

	const isTouched = insertInto === slotsObj || source.style === 'slotsBase';

	return isTouched && hasSpreadProperty(slotsObj);
};

// Adds the `base` property of `container`, if it has one, as a base source.
const addBaseProperty = (
	sources: BaseSource[],
	style: PropertyBaseStyle,
	container: ObjectExpression | null
) => {
	if (container === null) {
		return;
	}

	const node = findBaseProperty(container);

	if (node !== null) {
		sources.push({ style, node, value: node.value, container });
	}
};

const detectBaseSources = (
	configNode: ObjectExpression,
	slotsObj: ObjectExpression | null,
	args: ReadonlyArray<Expression | SpreadElement>
): BaseSource[] => {
	const sources: BaseSource[] = [];
	const [arg] = args;

	if (arg) {
		sources.push({ style: 'separateArg', node: arg, value: arg });
	}

	addBaseProperty(sources, 'field', configNode);
	addBaseProperty(sources, 'slotsBase', slotsObj);

	return sources;
};

const isStaticallyMovableValue = (node: Node): boolean => {
	if (isStaticStringNode(node)) {
		return true;
	}

	if (node.type !== 'ArrayExpression') {
		return false;
	}

	// A spread or hole is no static string either.
	return node.elements.every(
		(element) => element !== null && isStaticStringNode(element)
	);
};

const insertAsFirstPropertyFix = (
	fixer: Rule.RuleFixer,
	sourceCode: SourceCode,
	obj: ObjectExpression,
	text: string
): Rule.Fix => {
	const [first] = obj.properties;

	if (!first) {
		// An object literal's range always starts at its `{`.
		const [objStart] = sourceCode.getRange(obj);

		return fixer.insertTextAfterRange(
			[objStart, objStart + 1],
			` ${text} `
		);
	}

	return fixer.insertTextBefore(first, `${text}, `);
};

// The fix removing a base source from where it is now, or null when that
// would delete a comment.
const removeBaseSourceFix = (
	fixer: Rule.RuleFixer,
	sourceCode: SourceCode,
	configNode: ObjectExpression,
	source: BaseSource
): Rule.Fix | null => {
	if (source.style === 'separateArg') {
		// Only made once `isBareLeadingArgument` holds, so nothing but the
		// argument, moved along whole, and its comma is removed.
		const [argStart] = sourceCode.getRange(source.node);
		const [configStart] = sourceCode.getRange(configNode);

		return fixer.removeRange([argStart, configStart]);
	}

	// Null when removing the property would delete a comment beside it.
	if (source.container.properties.length > 1) {
		return removeFromList(
			fixer,
			sourceCode,
			source.node,
			source.container.properties
		);
	}

	return removeSoleItem(fixer, sourceCode, source.node);
};

// `insertInto` is the object that receives the `base` property, or null when
// the classes become a leading argument instead. No fix is made when moving
// the base would delete a comment.
const buildBaseStyleFix = (
	sourceCode: SourceCode,
	configNode: ObjectExpression,
	source: BaseSource,
	insertInto: ObjectExpression | null
): Rule.ReportFixer => {
	const valueText = sourceCode.getText(source.value);

	return (fixer) => {
		const removal = removeBaseSourceFix(
			fixer,
			sourceCode,
			configNode,
			source
		);

		if (removal === null) {
			return null;
		}

		if (insertInto === null) {
			return [
				removal,
				fixer.insertTextBefore(configNode, `${valueText}, `)
			];
		}

		return [
			removal,
			insertAsFirstPropertyFix(
				fixer,
				sourceCode,
				insertInto,
				`base: ${valueText}`
			)
		];
	};
};

// Whether the config is written as the call's last argument itself, not
// wrapped in parentheses: an argument list edit next to a wrapped config
// lands inside them, forming a comma expression or splitting the pair.
const isBareLastArgument = (
	sourceCode: SourceCode,
	call: CallExpression,
	configNode: ObjectExpression
): boolean => {
	if (!isLastArgument(call, configNode)) {
		return false;
	}

	const [, configEnd] = sourceCode.getRange(configNode);
	const [, callEnd] = sourceCode.getRange(call);

	return CALL_END_PATTERN.test(sourceCode.text.slice(configEnd, callEnd));
};

// Whether the leading argument is followed directly by the config, not
// wrapped in parentheses: removing it up to the config would otherwise leave
// its opening parenthesis behind.
const isBareLeadingArgument = (
	sourceCode: SourceCode,
	arg: Expression | SpreadElement,
	configNode: ObjectExpression
): boolean => {
	const [, argEnd] = sourceCode.getRange(arg);
	const [configStart] = sourceCode.getRange(configNode);

	return ARGUMENT_SEPARATOR_PATTERN.test(
		sourceCode.text.slice(argEnd, configStart)
	);
};

// Whether the single detected base source can be rewritten into `target`
// without risking a silent loss of classes or an edit at the wrong place.
const canFixBaseStyle = (
	sourceCode: SourceCode,
	call: CallExpression,
	configNode: ObjectExpression,
	args: ReadonlyArray<Expression | SpreadElement>,
	source: BaseSource,
	target: BaseStyle
): boolean => {
	if (!isStaticallyMovableValue(source.value)) {
		return false;
	}

	// Several leading class arguments can't be folded into one base value
	// without dropping the extras, and merging them isn't attempted.
	if (source.style === 'separateArg' && args.length > 1) {
		return false;
	}

	if (source.style !== 'separateArg' && target !== 'separateArg') {
		return true;
	}

	// Adding or removing a leading argument edits the call's own argument list,
	// which is only safe when the config literal really is that last argument —
	// it can also be a hoisted `const` declared elsewhere in the file, in which
	// case those ranges would rewrite unrelated code.
	if (!isBareLastArgument(sourceCode, call, configNode)) {
		return false;
	}

	return (
		source.style !== 'separateArg' ||
		isBareLeadingArgument(sourceCode, source.node, configNode)
	);
};

const checkBaseStyle = (
	context: Rule.RuleContext,
	call: CallExpression,
	configNode: ObjectExpression,
	args: ReadonlyArray<Expression | SpreadElement>,
	baseStyle: BaseStyle,
	isFactoryConfig: boolean,
	inheritsBase: boolean
) => {
	// `createSV(defaults)` takes exactly one argument and ignores any extra, so
	// a leading class argument there is unsatisfiable, not merely un-fixable.
	if (baseStyle === 'separateArg' && isFactoryConfig) {
		return;
	}

	const slotsObj = getSlotsObject(configNode, context.sourceCode);

	let insertInto: ObjectExpression | null = null;

	if (baseStyle === 'field') {
		insertInto = configNode;
	} else if (baseStyle === 'slotsBase') {
		if (!slotsObj) {
			return;
		}

		insertInto = slotsObj;
	}

	const sources = detectBaseSources(configNode, slotsObj, args);
	const mismatched = sources.filter((source) => source.style !== baseStyle);

	if (mismatched.length === 0) {
		return;
	}

	let fix: Rule.ReportFixer | undefined;
	const [onlySource] = sources;

	if (
		sources.length === 1 &&
		onlySource &&
		// Moving the base can change what the call applies: a spread in the
		// config may set `base` or `slots` over or under the moved one, and a
		// factory `base` is replaced by a config `base` but joined by a
		// leading argument or a `slots.base`.
		!inheritsBase &&
		!hasSpreadProperty(configNode) &&
		canFixBaseStyle(
			context.sourceCode,
			call,
			configNode,
			args,
			onlySource,
			baseStyle
		) &&
		!touchesHoistedSlots(
			context.sourceCode,
			configNode,
			onlySource,
			insertInto
		) &&
		!touchesSpreadSlots(slotsObj, onlySource, insertInto)
	) {
		fix = buildBaseStyleFix(
			context.sourceCode,
			configNode,
			onlySource,
			insertInto
		);
	}

	for (const source of mismatched) {
		context.report({
			node: source.node,
			messageId: 'wrongBaseStyle',
			data: {
				style: BASE_STYLE_LABELS[baseStyle],
				found: BASE_STYLE_LABELS[source.style]
			},
			fix
		});
	}
};

export const svConfigStyle: Rule.RuleModule = {
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Enforce a canonical sv() config key order and a single base-class style',
			recommended: false,
			url: docsUrl('sv-config-style')
		},
		fixable: 'code',
		schema: [
			{
				type: 'object',
				properties: {
					baseStyle: {
						type: 'string',
						enum: Object.keys(BASE_STYLE_LABELS)
					}
				},
				additionalProperties: false
			}
		],
		messages: {
			wrongOrder: `Config key "{{key}}" should come before "{{before}}" (canonical order: ${CONFIG_KEY_ORDER.join(', ')}).`,
			wrongBaseStyle:
				'Base classes should be expressed as {{style}} — found as {{found}}.'
		}
	},
	create(context) {
		const baseStyle: BaseStyle = context.options[0]?.baseStyle ?? 'field';

		return createTrackedCallListeners(context, (node, call, ctx) => {
			if (!call.config) {
				return;
			}

			checkKeyOrder(context, call.config);
			checkBaseStyle(
				context,
				node,
				call.config,
				call.args,
				baseStyle,
				call.isFactoryConfig,
				// The call's `createSV()` factory may give it a `base`.
				mayInheritKey(getFactoryDefaults(node, call, ctx), 'base')
			);
		});
	}
};