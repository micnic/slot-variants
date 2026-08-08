import type { Rule, SourceCode } from 'eslint';
import type {
	CallExpression,
	Expression,
	Node,
	ObjectExpression,
	Property,
	SpreadElement
} from 'estree';
import {
	CONFIG_KEY_ORDER,
	createTrackedCallListeners,
	DOCS_URL,
	getKeyName,
	getStaticStringText
} from '../analyzer.ts';

const ORDER_INDEX = new Map(
	CONFIG_KEY_ORDER.map((key, index) => [key, index])
);

type KeyEntry = {
	prop: Property;
	key: string;
	index: number;
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
		if (prop.type !== 'Property' || prop.computed) {
			fixable = false;
			continue;
		}

		const key = getKeyName(prop);

		/* c8 ignore next 4 -- property is guaranteed non-computed at this point, so getKeyName won't return null */
		if (key === null) {
			fixable = false;
			continue;
		}

		const index = ORDER_INDEX.get(key);

		// Reachable through `createSV(defaults)`, which accepts any object
		// literal — an unrecognized key can't be placed in the canonical order,
		// so the whole object becomes unfixable while known keys stay checked.
		if (index === undefined) {
			fixable = false;
			continue;
		}

		entries.push({ prop, key, index });
	}

	return { entries, fixable };
};

// Any comment inside the config object (attached to a property, or floating
// between them) disables the reorder fixer for that call — safely reattaching
// comments to their moved property isn't attempted, matching the "under-suppress,
// never wrongly rewrite" bail-out pattern used elsewhere in this plugin.
const hasCommentsInside = (
	context: Rule.RuleContext,
	node: ObjectExpression
): boolean => context.sourceCode.getCommentsInside(node).length > 0;

const DEFAULT_SEPARATOR = ',\n\t';

// The separator (comma + whitespace) between the first two properties in
// their original source order, reused between every reordered property so
// the rewritten object keeps the file's existing formatting.
// Tradeoff: sampling a single separator can normalize away uneven spacing —
// most visibly when a base-style fix has just inserted an inline
// `base: 'x', ` before the first property, so a following reorder pass samples
// that inline separator and collapses a multi-line object onto one line.
// Accepted as cosmetic: the result is still valid, correctly ordered code, and
// a formatter pass restores the layout.
const getEntrySeparator = (sourceCode: SourceCode, entries: ReadonlyArray<KeyEntry>): string => {
	const first = entries[0];
	const second = entries[1];

	if (!first || !second) {
		return DEFAULT_SEPARATOR;
	}

	const [, firstEnd] = sourceCode.getRange(first.prop);
	const [secondStart] = sourceCode.getRange(second.prop);

	return sourceCode.getText().slice(firstEnd, secondStart);
};

const buildReorderFix = (
	sourceCode: SourceCode,
	entries: ReadonlyArray<KeyEntry>
): ((fixer: Rule.RuleFixer) => Rule.Fix | null) => {
	const sorted = [...entries].sort((a, b) => a.index - b.index);
	const separator = getEntrySeparator(sourceCode, entries);
	const text = sorted.map((entry) => sourceCode.getText(entry.prop)).join(separator);

	return (fixer) => {
		const first = entries[0];
		const last = entries[entries.length - 1];

		/* c8 ignore next 3 -- callers only build this fix for a non-empty entries array */
		if (!first || !last) {
			return null;
		}

		const [start] = sourceCode.getRange(first.prop);
		const [, end] = sourceCode.getRange(last.prop);

		return fixer.replaceTextRange([start, end], text);
	};
};

const checkKeyOrder = (context: Rule.RuleContext, configNode: ObjectExpression) => {
	const { entries, fixable } = collectOrderedEntries(configNode.properties);
	let fix: ((fixer: Rule.RuleFixer) => Rule.Fix | null) | undefined;

	if (fixable && !hasCommentsInside(context, configNode)) {
		fix = buildReorderFix(context.sourceCode, entries);
	}

	let runningMax: KeyEntry | null = null;

	for (const entry of entries) {
		if (runningMax !== null && entry.index < runningMax.index) {
			context.report({
				node: entry.prop,
				messageId: 'wrongOrder',
				data: { key: entry.key, before: runningMax.key },
				fix
			});
			continue;
		}

		runningMax = entry;
	}
};

type BaseStyle = 'field' | 'separateArg' | 'slotsBase';

const BASE_STYLE_LABELS: Record<BaseStyle, string> = {
	field: 'a "base" field in the config',
	separateArg: 'a separate leading argument',
	slotsBase: 'a "base" entry in "slots"'
};

const normalizeBaseStyle = (option: BaseStyle | undefined): BaseStyle => {
	if (option === undefined) {
		return 'field';
	}

	return option;
};

const findProperty = (obj: ObjectExpression, key: string): Property | null => {
	for (const prop of obj.properties) {
		if (prop.type === 'Property' && !prop.computed && getKeyName(prop) === key) {
			return prop;
		}
	}

	return null;
};

const getSlotsObject = (configNode: ObjectExpression): ObjectExpression | null => {
	const slotsProp = findProperty(configNode, 'slots');

	if (slotsProp && slotsProp.value.type === 'ObjectExpression') {
		return slotsProp.value;
	}

	return null;
};

// The three places base classes can live. `slotsBase` carries the resolved
// `slots` object so a fix can insert/remove directly on it.
type BaseSource =
	| { style: 'separateArg'; arg: Expression | SpreadElement }
	| { style: 'field'; prop: Property }
	| { style: 'slotsBase'; prop: Property; slotsObj: ObjectExpression };

const detectBaseSources = (
	configNode: ObjectExpression,
	args: ReadonlyArray<Expression | SpreadElement>
): BaseSource[] => {
	const sources: BaseSource[] = [];
	const [arg] = args;

	if (arg) {
		sources.push({ style: 'separateArg', arg });
	}

	const baseProp = findProperty(configNode, 'base');

	if (baseProp) {
		sources.push({ style: 'field', prop: baseProp });
	}

	const slotsObj = getSlotsObject(configNode);

	if (slotsObj) {
		const slotsBaseProp = findProperty(slotsObj, 'base');

		if (slotsBaseProp) {
			sources.push({ style: 'slotsBase', prop: slotsBaseProp, slotsObj });
		}
	}

	return sources;
};

const getBaseSourceNode = (source: BaseSource): Node => {
	if (source.style === 'separateArg') {
		return source.arg;
	}

	return source.prop;
};

const getBaseSourceValue = (source: BaseSource): Node => {
	if (source.style === 'separateArg') {
		return source.arg;
	}

	return source.prop.value;
};

const isStaticallyMovableValue = (node: Node): boolean => {
	if (getStaticStringText(node) !== null) {
		return true;
	}

	if (node.type !== 'ArrayExpression') {
		return false;
	}

	for (const element of node.elements) {
		if (element === null || element.type === 'SpreadElement') {
			return false;
		}

		if (getStaticStringText(element) === null) {
			return false;
		}
	}

	return true;
};

const removePropertyFix = (
	fixer: Rule.RuleFixer,
	sourceCode: SourceCode,
	obj: ObjectExpression,
	prop: Property
): Rule.Fix => {
	const { properties } = obj;
	const index = properties.indexOf(prop);

	if (properties.length === 1) {
		return fixer.remove(prop);
	}

	if (index === properties.length - 1) {
		const previous = properties[index - 1];

		/* c8 ignore next 3 -- a non-first, non-only property always has a predecessor */
		if (!previous) {
			return fixer.remove(prop);
		}

		const [, previousEnd] = sourceCode.getRange(previous);
		const [, propEnd] = sourceCode.getRange(prop);

		return fixer.removeRange([previousEnd, propEnd]);
	}

	const next = properties[index + 1];

	/* c8 ignore next 3 -- index < length - 1 always has a successor */
	if (!next) {
		return fixer.remove(prop);
	}

	const [propStart] = sourceCode.getRange(prop);
	const [nextStart] = sourceCode.getRange(next);

	return fixer.removeRange([propStart, nextStart]);
};

const insertAsFirstPropertyFix = (
	fixer: Rule.RuleFixer,
	sourceCode: SourceCode,
	obj: ObjectExpression,
	text: string
): Rule.Fix => {
	const [first] = obj.properties;

	if (!first) {
		const openBrace = sourceCode.getFirstToken(obj);

		/* c8 ignore next 3 -- an ObjectExpression always has an opening brace token */
		if (!openBrace) {
			return fixer.insertTextAfter(obj, text);
		}

		return fixer.insertTextAfter(openBrace, ` ${text} `);
	}

	return fixer.insertTextBefore(first, `${text}, `);
};

const removeLeadingArgFix = (
	fixer: Rule.RuleFixer,
	sourceCode: SourceCode,
	arg: Expression | SpreadElement,
	configNode: ObjectExpression
): Rule.Fix => {
	const [argStart] = sourceCode.getRange(arg);
	const [configStart] = sourceCode.getRange(configNode);

	return fixer.removeRange([argStart, configStart]);
};

const insertLeadingArgFix = (
	fixer: Rule.RuleFixer,
	configNode: ObjectExpression,
	text: string
): Rule.Fix => fixer.insertTextBefore(configNode, `${text}, `);

const buildBaseStyleFix = (
	sourceCode: SourceCode,
	configNode: ObjectExpression,
	source: BaseSource,
	target: BaseStyle
): ((fixer: Rule.RuleFixer) => Rule.Fix[]) => {
	const valueText = sourceCode.getText(getBaseSourceValue(source));
	const propertyText = `base: ${valueText}`;

	return (fixer) => {
		const fixes: Rule.Fix[] = [];

		if (source.style === 'separateArg') {
			fixes.push(removeLeadingArgFix(fixer, sourceCode, source.arg, configNode));
		} else if (source.style === 'field') {
			fixes.push(removePropertyFix(fixer, sourceCode, configNode, source.prop));
		} else {
			fixes.push(removePropertyFix(fixer, sourceCode, source.slotsObj, source.prop));
		}

		if (target === 'separateArg') {
			fixes.push(insertLeadingArgFix(fixer, configNode, valueText));
			return fixes;
		}

		if (target === 'field') {
			fixes.push(insertAsFirstPropertyFix(fixer, sourceCode, configNode, propertyText));
			return fixes;
		}

		const slotsObj = getSlotsObject(configNode);

		/* c8 ignore next 3 -- target 'slotsBase' is only reached when slots already exists (checkBaseStyle returns early otherwise) */
		if (!slotsObj) {
			return [];
		}

		fixes.push(insertAsFirstPropertyFix(fixer, sourceCode, slotsObj, propertyText));

		return fixes;
	};
};

// Whether the single detected base source can be rewritten into `target`
// without risking a silent loss of classes or an edit at the wrong place.
const canFixBaseStyle = (
	call: CallExpression,
	configNode: ObjectExpression,
	args: ReadonlyArray<Expression | SpreadElement>,
	source: BaseSource,
	target: BaseStyle
): boolean => {
	if (!isStaticallyMovableValue(getBaseSourceValue(source))) {
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
	return call.arguments[call.arguments.length - 1] === configNode;
};

const checkBaseStyle = (
	context: Rule.RuleContext,
	call: CallExpression,
	configNode: ObjectExpression,
	args: ReadonlyArray<Expression | SpreadElement>,
	baseStyle: BaseStyle,
	isFactoryConfig: boolean
) => {
	const slotsObj = getSlotsObject(configNode);

	if (baseStyle === 'slotsBase' && !slotsObj) {
		return;
	}

	// `createSV(defaults)` takes exactly one argument and ignores any extra, so
	// a leading class argument there is unsatisfiable, not merely un-fixable.
	if (baseStyle === 'separateArg' && isFactoryConfig) {
		return;
	}

	const sources = detectBaseSources(configNode, args);
	const mismatched = sources.filter((source) => source.style !== baseStyle);

	if (mismatched.length === 0) {
		return;
	}

	let fix: ((fixer: Rule.RuleFixer) => Rule.Fix[]) | undefined;
	const [onlySource] = sources;

	if (
		sources.length === 1 &&
		onlySource &&
		canFixBaseStyle(call, configNode, args, onlySource, baseStyle)
	) {
		fix = buildBaseStyleFix(context.sourceCode, configNode, onlySource, baseStyle);
	}

	for (const source of mismatched) {
		context.report({
			node: getBaseSourceNode(source),
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
			url: DOCS_URL
		},
		fixable: 'code',
		schema: [
			{
				type: 'object',
				properties: {
					baseStyle: {
						type: 'string',
						enum: ['field', 'separateArg', 'slotsBase']
					}
				},
				additionalProperties: false
			}
		],
		messages: {
			wrongOrder:
				'Config key "{{key}}" should come before "{{before}}" (canonical order: base, slots, groups, multiSlots, variants, presets, compoundSlots, compoundVariants, defaultVariants, requiredVariants, cacheSize, introspection, postProcess).',
			wrongBaseStyle:
				'Base classes should be expressed as {{style}} — found as {{found}}.'
		}
	},
	create(context) {
		const baseStyle = normalizeBaseStyle(context.options[0]?.baseStyle);

		return createTrackedCallListeners(context, (node, call) => {
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
				call.isFactoryConfig === true
			);
		});
	}
};