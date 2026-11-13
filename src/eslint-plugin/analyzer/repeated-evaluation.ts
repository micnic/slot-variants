import type { Rule, SourceCode } from 'eslint';
import type { CallExpression, Node } from 'estree';
import { isComponentFunction } from './components.ts';
import type { SvelteAttribute, VAttribute } from './markup.ts';

// Why a call would be evaluated more than once, or null when it runs exactly
// once at module evaluation. The reasons double as require-top-level-config's
// messageIds, so the report needs no mapping.
type RepeatedEvaluation = 'nested' | 'field' | 'template' | 'instance' | null;

// svelte-eslint-parser reads every attribute of a `<script>` tag as a plain
// `SvelteAttribute`, even a shorthand or spread one.
type SvelteScriptElement = {
	type: 'SvelteScriptElement';
	startTag: { attributes: ReadonlyArray<SvelteAttribute> };
};

// A top-level child of a Vue file's document fragment: its blocks, and any
// text between them.
type VDocumentElement = {
	type: 'VElement';
	name: string;
	range: [number, number];
	startTag: { attributes: ReadonlyArray<VAttribute> };
};

type VDocumentChild = VDocumentElement | { type: 'VText' };

type VDocumentFragment = { children: ReadonlyArray<VDocumentChild> };

// Every Svelte markup node is a `Svelte*` one; the script's code sits under its
// `SvelteScriptElement` instead.
const SVELTE_NODE_PREFIX = 'Svelte';
const SVELTE_SCRIPT_ELEMENT = 'SvelteScriptElement';

// Wraps every Vue template expression: `{{ }}` and directive values alike.
const VUE_EXPRESSION_CONTAINER = 'VExpressionContainer';

// `<script module>` (Svelte 5) and `<script context="module">` (Svelte 4) run
// once per module, unlike the instance script. Any other `context` value is a
// parse error, so the attribute alone marks a module script.
const SVELTE_MODULE_ATTRIBUTES: ReadonlySet<string> = new Set([
	'module',
	'context'
]);

// A Svelte markup or Vue template node, whose expressions are evaluated again
// on every render. Its type is read as a plain string, since these nodes
// aren't ESTree's.
const isTemplateNode = (node: Node): boolean => {
	const type: string = node.type;

	if (type === VUE_EXPRESSION_CONTAINER) {
		return true;
	}

	return type.startsWith(SVELTE_NODE_PREFIX);
};

const isSvelteScriptElement = (
	node: Node | SvelteScriptElement
): node is SvelteScriptElement => node.type === SVELTE_SCRIPT_ELEMENT;

const isSvelteModuleScript = (script: SvelteScriptElement): boolean =>
	script.startTag.attributes.some(({ key }) =>
		SVELTE_MODULE_ATTRIBUTES.has(key.name)
	);

const isVueScriptSetup = (child: VDocumentChild): child is VDocumentElement =>
	child.type === 'VElement' &&
	child.name === 'script' &&
	child.startTag.attributes.some(
		({ key }) => key.type === 'VIdentifier' && key.name === 'setup'
	);

// Whether the call sits in a Vue file's `<script setup>`, which runs again for
// every component instance. vue-eslint-parser merges both script blocks into
// one program, so the block is told by its source range.
const isInVueScriptSetup = (
	sourceCode: SourceCode,
	node: CallExpression
): boolean => {
	const { getDocumentFragment } = sourceCode.parserServices;

	if (typeof getDocumentFragment !== 'function') {
		return false;
	}

	// Null for a file vue-eslint-parser reads as a plain script.
	const fragment: VDocumentFragment | null = getDocumentFragment();

	if (fragment === null) {
		return false;
	}

	const [start] = sourceCode.getRange(node);

	return fragment.children.some(
		(child) =>
			isVueScriptSetup(child) &&
			child.range[0] <= start &&
			start < child.range[1]
	);
};

// Why entering `ancestor`, on the way down to `child`, would evaluate the call
// again, or null when it doesn't.
const getAncestorReason = (ancestor: Node, child: Node): RepeatedEvaluation => {
	if (isSvelteScriptElement(ancestor)) {
		if (isSvelteModuleScript(ancestor)) {
			return null;
		}

		return 'instance';
	}

	if (isComponentFunction(ancestor)) {
		return 'nested';
	}

	if (
		ancestor.type === 'PropertyDefinition' &&
		ancestor.static === false &&
		ancestor.value === child
	) {
		return 'field';
	}

	if (isTemplateNode(ancestor)) {
		return 'template';
	}

	return null;
};

// An `sv()` config call compiles the variant function (and seeds its cache)
// once; anything that re-enters the call rebuilds and discards that work. A
// function body re-runs per call, an instance field initializer per `new`, and
// a template expression per render. A component's instance script runs per
// instance too: Svelte's `<script>` (unlike its module script) and Vue's
// `<script setup>` (unlike a plain `<script>`).
// A `static` field and a static block both run once with the class definition,
// and so does any field's computed key, so they're fine on their own — but the
// class may itself sit inside a function, which is why the walk doesn't stop
// at them. The innermost reason wins, so the report names what the author can
// see around the call: the walk goes outwards and stops at the first one.
export const findRepeatedEvaluation = (
	context: Rule.RuleContext,
	node: CallExpression
): RepeatedEvaluation => {
	const { sourceCode } = context;
	const ancestors = sourceCode.getAncestors(node);
	let child: Node = node;

	for (let index = ancestors.length - 1; index >= 0; index -= 1) {
		const ancestor = ancestors[index];

		if (ancestor !== undefined) {
			const reason = getAncestorReason(ancestor, child);

			if (reason !== null) {
				return reason;
			}

			child = ancestor;
		}
	}

	// `<script setup>` holds every other reason, so it's the outermost one.
	if (isInVueScriptSetup(sourceCode, node)) {
		return 'instance';
	}

	return null;
};