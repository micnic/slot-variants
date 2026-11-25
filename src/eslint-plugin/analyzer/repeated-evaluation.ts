import type { SourceCode } from 'eslint';
import type { CallExpression, Node } from 'estree';
import { isComponentFunction } from './components.ts';
import { unwrapExpression } from './const-bindings.ts';
import type { SvelteAttribute, VAttribute } from './markup.ts';

// Why a call would be evaluated more than once, or null when it runs exactly
// once at module evaluation. The reasons double as require-top-level-config's
// messageIds, so the report needs no mapping.
type RepeatedEvaluation =
	| 'nested'
	| 'loop'
	| 'field'
	| 'template'
	| 'instance'
	| null;

// A class field: a `PropertyDefinition`, or the `AccessorProperty` an
// `accessor` field is read as, which ESTree's own node types don't list.
type ClassField = { type: string; static: boolean; value?: Node | null };

type InvokedCheck = (fn: Node) => boolean;

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

// The methods that invoke the function they're read off on the spot.
const CALL_METHODS: ReadonlySet<string> = new Set(['call', 'apply']);

const CLASS_FIELD_TYPES: ReadonlySet<string> = new Set([
	'PropertyDefinition',
	'AccessorProperty'
]);

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

	return (
		type === VUE_EXPRESSION_CONTAINER || type.startsWith(SVELTE_NODE_PREFIX)
	);
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

const isClassField = (node: Node): node is Node & ClassField =>
	CLASS_FIELD_TYPES.has(node.type);

// Whether `child` is a part of the loop `ancestor` that runs again on every
// iteration: any but a `for` loop's initializer and the object a `for…in` or
// `for…of` loop iterates.
const isRepeatedLoopPart = (ancestor: Node, child: Node): boolean => {
	if (
		ancestor.type === 'WhileStatement' ||
		ancestor.type === 'DoWhileStatement'
	) {
		return true;
	}

	if (ancestor.type === 'ForStatement') {
		return ancestor.init !== child;
	}

	if (
		ancestor.type === 'ForInStatement' ||
		ancestor.type === 'ForOfStatement'
	) {
		return ancestor.right !== child;
	}

	return false;
};

// The function a call invokes right where it's written: its callee, through
// type-only wrappers and a `.call()`/`.apply()` read off it.
const getInvokedFunction = (callee: Node): Node => {
	const target = unwrapExpression(callee);

	if (
		target.type === 'MemberExpression' &&
		!target.computed &&
		target.property.type === 'Identifier' &&
		CALL_METHODS.has(target.property.name)
	) {
		return unwrapExpression(target.object);
	}

	return target;
};

// Whether a function around a node is invoked right where it's written
// (`(() => …)()`) by one of the calls around it, so its body runs once, where
// the call sits. Those calls are only gathered once a function is met.
const createInvokedCheck = (outward: readonly Node[]): InvokedCheck => {
	let invoked: ReadonlySet<Node> | null = null;

	return (fn) => {
		if (invoked === null) {
			invoked = new Set(
				outward
					.filter((node) => node.type === 'CallExpression')
					.map((call) => getInvokedFunction(call.callee))
			);
		}

		return invoked.has(fn);
	};
};

// Why entering `ancestor`, on the way down to `child`, would evaluate the call
// again, or null when it doesn't. `isInvoked` tells the functions the calls
// around it invoke on the spot.
const getAncestorReason = (
	ancestor: Node,
	child: Node,
	isInvoked: InvokedCheck
): RepeatedEvaluation => {
	if (isSvelteScriptElement(ancestor)) {
		if (isSvelteModuleScript(ancestor)) {
			return null;
		}

		return 'instance';
	}

	if (isComponentFunction(ancestor)) {
		if (isInvoked(ancestor)) {
			return null;
		}

		return 'nested';
	}

	if (isRepeatedLoopPart(ancestor, child)) {
		return 'loop';
	}

	if (
		isClassField(ancestor) &&
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
// function body re-runs per call, a loop body per iteration, an instance field
// initializer per `new`, and a template expression per render. A component's
// instance script runs per instance too: Svelte's `<script>` (unlike its
// module script) and Vue's `<script setup>` (unlike a plain `<script>`).
// A `static` field and a static block both run once with the class definition,
// and so does any field's computed key and an immediately invoked function's
// body, so they're fine on their own — but each may itself sit inside a
// function, which is why the walk doesn't stop at them. The innermost reason
// wins, so the report names what the author can see around the call: the walk
// goes outwards and stops at the first one.
export const findRepeatedEvaluation = (
	sourceCode: SourceCode,
	node: CallExpression
): RepeatedEvaluation => {
	// `getAncestors` returns a fresh array, so reversing it in place is safe.
	const outward = sourceCode.getAncestors(node).reverse();
	const isInvoked = createInvokedCheck(outward);
	let child: Node = node;

	for (const ancestor of outward) {
		const reason = getAncestorReason(ancestor, child, isInvoked);

		if (reason !== null) {
			return reason;
		}

		child = ancestor;
	}

	// `<script setup>` holds every other reason, so it's the outermost one.
	if (isInVueScriptSetup(sourceCode, node)) {
		return 'instance';
	}

	return null;
};