import type { Rule, SourceCode } from 'eslint';
import type {
	Expression,
	Literal,
	Node,
	Property,
	SourceLocation,
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

// Tokenize the raw inner text of a string/template literal into tokens paired
// with their offset within that inner text. Using raw (not cooked) keeps offsets
// aligned with source positions, which is what we need for precise reporting.
const tokenizeWithOffsets = (
	text: string
): Array<{ token: string; offset: number }> => {
	const tokens: Array<{ token: string; offset: number }> = [];
	const regex = /\S+/g;

	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		tokens.push({ token: match[0], offset: match.index });
	}

	return tokens;
};

// Returns the statically-known key name of a Property node, or null when it
// can't be determined (computed key). For non-computed keys the parser only
// emits Identifier or Literal(string|number), so those are the two cases we
// handle.
const getKeyName = (prop: Property): string | null => {
	if (prop.computed) {
		return null;
	}

	const { key } = prop;

	if (key.type === 'Identifier') {
		return key.name;
	}

	return String((key as Literal).value);
};

const getProperties = (obj: Node | undefined): Map<string, Node> => {
	const map = new Map<string, Node>();

	if (!obj || obj.type !== 'ObjectExpression') {
		return map;
	}

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

const isConfigLike = (node: Node | undefined): boolean => {
	if (!node || node.type !== 'ObjectExpression') {
		return false;
	}

	if (node.properties.length === 0) {
		return false;
	}

	for (const prop of node.properties) {
		if (prop.type !== 'Property') {
			return false;
		}

		const key = getKeyName(prop);

		if (key === null || !CONFIG_KEYS.has(key)) {
			return false;
		}
	}
	return true;
};

type Source =
	| { kind: 'base' }
	| { kind: 'variant'; key: string; value: string }
	| { kind: 'compound' };

type Entry = {
	source: Source;
	slot: string;
	token: string;
	loc: SourceLocation;
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

	// Both string literals and template literals (without expressions) use a
	// single-character opening delimiter (', ", or `), so range[0] + 1 is the
	// absolute index of the first inner character, and slicing the delimiters
	// off the raw text yields the token-bearing content.
	const raw = sourceCode.getText(node);
	const inner = raw.slice(1, -1);
	const base = range[0] + 1;

	for (const { token, offset } of tokenizeWithOffsets(inner)) {
		const start = base + offset;
		const end = start + token.length;

		entries.push({
			source,
			slot,
			token,
			loc: {
				start: sourceCode.getLocFromIndex(start),
				end: sourceCode.getLocFromIndex(end)
			}
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

	// Only analyze as slot-keyed object when every key matches a slot name.
	// Otherwise it's a cn-style record and we can't statically determine
	// which keys are active, so skip.
	if (slotNames.size === 0) {
		return;
	}

	const collected: [key: string, value: Node][] = [];

	for (const prop of node.properties) {
		if (prop.type !== 'Property') {
			return;
		}

		const key = getKeyName(prop);

		if (key === null) {
			return;
		}

		if (key !== 'base' && !slotNames.has(key)) {
			return;
		}

		collected.push([key, prop.value]);
	}

	for (const [key, value] of collected) {
		extractTokens(value, key, source, slotNames, entries, sourceCode);
	}
};

const analyzeConfig = (
	context: Rule.RuleContext,
	configNode: Node,
	baseArgs: Array<Expression | SpreadElement>
): void => {
	const { sourceCode } = context;
	const config = getProperties(configNode);
	const base = config.get('base');
	const variants = config.get('variants');
	const slots = config.get('slots');
	const compoundVariants = config.get('compoundVariants');
	const compoundSlots = config.get('compoundSlots');

	const slotsMap = getProperties(slots);
	const slotNames = new Set<string>();

	for (const key of slotsMap.keys()) {
		if (key !== 'base') slotNames.add(key);
	}

	const entries: Entry[] = [];

	for (const [slotKey, slotValue] of slotsMap.entries()) {
		extractTokens(
			slotValue,
			slotKey,
			{ kind: 'base' },
			slotNames,
			entries,
			sourceCode
		);
	}

	for (const arg of baseArgs) {
		extractTokens(
			arg,
			'base',
			{ kind: 'base' },
			slotNames,
			entries,
			sourceCode
		);
	}

	if (base) {
		extractTokens(
			base,
			'base',
			{ kind: 'base' },
			slotNames,
			entries,
			sourceCode
		);
	}

	const variantsMap = getProperties(variants);

	for (const [variantKey, variantValue] of variantsMap.entries()) {
		if (variantValue.type === 'ObjectExpression') {
			// Boolean shorthand w/ slot-keyed object: every property has a
			// statically-known key naming a slot (or 'base').
			let allKeysAreSlots = variantValue.properties.length > 0;

			for (const prop of variantValue.properties) {
				if (prop.type !== 'Property') {
					allKeysAreSlots = false;
					break;
				}

				const key = getKeyName(prop);

				if (
					key === null ||
					(key !== 'base' && !slotNames.has(key))
				) {
					allKeysAreSlots = false;
					break;
				}
			}

			const isSlotShorthand = allKeysAreSlots && slotNames.size > 0;

			if (isSlotShorthand) {
				extractTokens(
					variantValue,
					'base',
					{ kind: 'variant', key: variantKey, value: 'true' },
					slotNames,
					entries,
					sourceCode
				);
			} else {
				for (const prop of variantValue.properties) {
					if (prop.type !== 'Property') {
						continue;
					}

					const valueKey = getKeyName(prop);

					if (valueKey === null) {
						continue;
					}

					extractTokens(
						prop.value,
						'base',
						{
							kind: 'variant',
							key: variantKey,
							value: valueKey
						},
						slotNames,
						entries,
						sourceCode
					);
				}
			}
		} else {
			extractTokens(
				variantValue,
				'base',
				{ kind: 'variant', key: variantKey, value: 'true' },
				slotNames,
				entries,
				sourceCode
			);
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
				extractTokens(
					cls,
					'base',
					{ kind: 'compound' },
					slotNames,
					entries,
					sourceCode
				);
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

				extractTokens(
					cls,
					slotEl.value,
					{ kind: 'compound' },
					slotNames,
					entries,
					sourceCode
				);
			}
		}
	}

	const bySlot = new Map<string, Map<string, Entry[]>>();

	for (const entry of entries) {
		let tokenMap = bySlot.get(entry.slot);

		if (!tokenMap) {
			tokenMap = new Map();
			bySlot.set(entry.slot, tokenMap);
		}

		let list = tokenMap.get(entry.token);

		if (!list) {
			list = [];
			tokenMap.set(entry.token, list);
		}

		list.push(entry);
	}

	for (const [slotKey, tokenMap] of bySlot.entries()) {
		for (const [token, list] of tokenMap.entries()) {
			if (list.length < 2) {
				continue;
			}

			const seenValues = new Set<string>();

			let duplicated = false;
			let sharedKey: string | null = null;

			for (const entry of list) {
				if (entry.source.kind !== 'variant') {
					duplicated = true;
					break;
				}

				if (sharedKey === null) {
					sharedKey = entry.source.key;
				} else if (sharedKey !== entry.source.key) {
					duplicated = true;
					break;
				}

				if (seenValues.has(entry.source.value)) {
					duplicated = true;
					break;
				}

				seenValues.add(entry.source.value);
			}

			if (!duplicated) {
				continue;
			}

			for (const entry of list) {
				context.report({
					loc: entry.loc,
					messageId: 'duplicate',
					data: { token, slot: slotKey }
				});
			}
		}
	}
};

const analyzeCnCall = (
	context: Rule.RuleContext,
	args: ReadonlyArray<Expression | SpreadElement>
): void => {
	const { sourceCode } = context;
	const entries: Entry[] = [];
	const slotNames = new Set<string>();

	for (const arg of args) {
		extractTokens(
			arg,
			'base',
			{ kind: 'base' },
			slotNames,
			entries,
			sourceCode
		);
	}

	const tokenMap = new Map<string, Entry[]>();

	for (const entry of entries) {
		let list = tokenMap.get(entry.token);

		if (!list) {
			list = [];
			tokenMap.set(entry.token, list);
		}

		list.push(entry);
	}

	for (const [token, list] of tokenMap.entries()) {
		if (list.length < 2) {
			continue;
		}

		for (const entry of list) {
			context.report({
				loc: entry.loc,
				messageId: 'duplicateCn',
				data: { token }
			});
		}
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
		const svNames = new Set<string>();
		const cnNames = new Set<string>();

		return {
			ImportDeclaration(node) {
				if (node.source.value !== 'slot-variants') {
					return;
				}

				for (const spec of node.specifiers) {
					if (
						spec.type !== 'ImportSpecifier' ||
						spec.imported.type !== 'Identifier'
					) {
						continue;
					}

					if (spec.imported.name === 'sv') {
						svNames.add(spec.local.name);
					} else if (spec.imported.name === 'cn') {
						cnNames.add(spec.local.name);
					}
				}
			},
			CallExpression(node) {
				if (svNames.size === 0 && cnNames.size === 0) {
					return;
				}

				const callee = node.callee;

				if (callee.type !== 'Identifier') {
					return;
				}

				if (svNames.has(callee.name)) {
					const args = node.arguments;

					if (args.length === 0) {
						return;
					}

					const last = args[args.length - 1];

					if (isConfigLike(last)) {
						const baseArgs = args.slice(0, -1);
						analyzeConfig(context, last as Node, baseArgs);
					} else {
						analyzeCnCall(context, args);
					}
				} else if (cnNames.has(callee.name)) {
					analyzeCnCall(context, node.arguments);
				}
			}
		};
	}
};

/**
 * Rules exported by the plugin.
 */
export const rules = {
	'no-duplicate-classes': noDuplicateClasses
};

/**
 * Plugin metadata.
 */
export const meta = { name: 'slot-variants' };

const plugin = { meta, rules };

export default plugin;