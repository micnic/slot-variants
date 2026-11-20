import type { Rule, SourceCode } from 'eslint';
import type { Expression, Node } from 'estree';
import { LEADING_SEPARATOR, TRAILING_SEPARATOR } from './literals.ts';
import { pushBaseTokensFromText } from './token-extraction.ts';
import type { Entry } from './token-model.ts';

// Minimal shapes for the framework AST nodes this rule reads. They are
// declared here rather than pulled from each framework's parser so the plugin
// keeps its single optional peer dependency on ESLint — every field below is
// only ever reached after its `type` has been checked.

type JsxIdentifier = { type: 'JSXIdentifier'; name: string };

// An attribute's container always holds an expression — `class={}` is a parse
// error, so the `JSXEmptyExpression` a child container can hold never reaches
// the visitor here.
type JsxExpressionContainer = {
	type: 'JSXExpressionContainer';
	expression: Expression;
};

export type JsxAttribute = {
	type: 'JSXAttribute';
	name: JsxIdentifier | { type: 'JSXNamespacedName' };
	value: Node | JsxExpressionContainer | null;
};

// `<UI.Button>`: a member read off a name, possibly off another member.
type JsxMemberName = {
	type: 'JSXMemberExpression';
	object: JsxIdentifier | { type: 'JSXMemberExpression' };
	property: JsxIdentifier;
};

// `{...props}`: every prop of an object.
type JsxSpreadAttribute = { type: 'JSXSpreadAttribute'; argument: Node };

export type JsxOpeningElement = {
	type: 'JSXOpeningElement';
	name: JsxIdentifier | JsxMemberName | { type: 'JSXNamespacedName' };
	attributes: ReadonlyArray<JsxAttribute | JsxSpreadAttribute>;
};

type SvelteLiteral = {
	type: 'SvelteLiteral';
	value: string;
	range: [number, number];
};

export type SvelteAttributePart = SvelteLiteral | SvelteMustacheTag;

type SvelteMustacheTag = {
	type: 'SvelteMustacheTag';
	expression: Expression;
};

export type SvelteAttribute = {
	type: 'SvelteAttribute';
	key: { name: string };
	value: ReadonlyArray<SvelteAttributePart>;
};

// `{size}`: an attribute named after the expression it passes.
type SvelteShorthandAttribute = {
	type: 'SvelteShorthandAttribute';
	key: { name: string };
	value: Expression;
};

// `{...props}`: every prop of an object.
type SvelteSpreadAttribute = {
	type: 'SvelteSpreadAttribute';
	argument: Expression;
};

// A directive: `bind:size={value}` is of kind `Binding`.
type SvelteDirective = {
	type: 'SvelteDirective';
	kind: string;
	key: { name: { name: string } };
};

// Every other attribute kind svelte-eslint-parser emits on a start tag.
type SvelteOtherAttribute = {
	type: 'SvelteSpecialDirective' | 'SvelteStyleDirective';
};

export type SvelteStartTag = {
	type: 'SvelteStartTag';
	attributes: ReadonlyArray<
		| SvelteAttribute
		| SvelteShorthandAttribute
		| SvelteSpreadAttribute
		| SvelteDirective
		| SvelteOtherAttribute
	>;
};

// `<UI.Button>`: a member read off a name, possibly off another member.
type SvelteMemberName = {
	type: 'SvelteMemberExpressionName';
	object:
		| { type: 'Identifier'; name: string }
		| { type: 'SvelteMemberExpressionName' };
	property: { name: string };
};

// A component element names its import (`<Button>`) or a member of one
// (`<UI.Button>`); a host element and a special one (`<svelte:head>`) carry a
// `SvelteName`.
type SvelteElement = {
	type: 'SvelteElement';
	kind: 'component' | 'html' | 'special';
	name:
		| { type: 'Identifier'; name: string }
		| SvelteMemberName
		| { type: 'SvelteName' };
	startTag: SvelteStartTag;
};

type VIdentifier = { type: 'VIdentifier'; name: string };

type VLiteral = { type: 'VLiteral'; value: string; range: [number, number] };

type VExpressionContainer = {
	type: 'VExpressionContainer';
	expression: Expression | null;
};

type VDirectiveKey = {
	type: 'VDirectiveKey';
	name: { name: string };
	argument: VIdentifier | { type: 'VExpressionContainer' } | null;
};

export type VAttribute = {
	type: 'VAttribute';
	key: VIdentifier | VDirectiveKey;
	value: VLiteral | VExpressionContainer | null;
};

type VElement = {
	type: 'VElement';
	rawName: string;
	startTag: { attributes: ReadonlyArray<VAttribute> };
};

/**
 * Every node type a `no-restyle` visitor may be handed. ESLint types extra
 * visitor keys with the estree node union, so the framework shapes are joined
 * to it here and narrowed by `type` inside each handler.
 */
export type MarkupNode =
	| Rule.Node
	| JsxOpeningElement
	| SvelteElement
	| VElement;

export const CLASS_ATTRIBUTES = new Set(['class', 'className']);

/**
 * Tokenizes a run of raw class text addressed by source range, stripping a
 * surrounding quote pair when the range includes one. Used where no string
 * literal node covers the text: HTML-style attribute values and the text runs
 * between a Svelte attribute's substitutions.
 */
export const pushRawRangeTokens = (
	sourceCode: SourceCode,
	[start, end]: readonly [number, number],
	literals: Entry[]
) => {
	const raw = sourceCode.getText().slice(start, end);
	const quote = raw[0];

	if (quote === '"' || quote === "'") {
		pushBaseTokensFromText(raw.slice(1, -1), start + 1, literals);

		return;
	}

	pushBaseTokensFromText(raw, start, literals);
};

// Whether whitespace separates a Svelte attribute part from the substitutions
// beside it, so no class name straddles the boundary.
const isIsolatedSveltePart = (
	part: SvelteAttributePart,
	index: number,
	parts: ReadonlyArray<SvelteAttributePart>
): boolean => {
	const hasLeft = index > 0;
	const next = parts[index + 1];

	if (part.type === 'SvelteMustacheTag') {
		// Two substitutions side by side join into one class name.
		return next === undefined || next.type === 'SvelteLiteral';
	}

	if (hasLeft && !LEADING_SEPARATOR.test(part.value)) {
		return false;
	}

	return next === undefined || TRAILING_SEPARATOR.test(part.value);
};

/**
 * The Svelte counterpart of `hasIsolatedQuasis`: every substitution in a
 * class attribute stands apart from the text around it, so the text's
 * classes tokenize on their own (`class="{c}p-4"` is one class, `p-2p-4`).
 */
export const hasIsolatedSvelteParts = (attribute: SvelteAttribute): boolean =>
	attribute.value.every(isIsolatedSveltePart);

// `UI.Button` for a member read off a name, null for one read off another
// member: only a namespace import's direct members are resolved.
const getDottedName = (
	node: JsxMemberName | SvelteMemberName
): string | null => {
	const { object, property } = node;

	if (object.type !== 'JSXIdentifier' && object.type !== 'Identifier') {
		return null;
	}

	return `${object.name}.${property.name}`;
};

/** A JSX attribute's name, or null for a namespaced one (`xlink:href`). */
export const getJsxAttributeName = (node: JsxAttribute): string | null => {
	if (node.name.type !== 'JSXIdentifier') {
		return null;
	}

	return node.name.name;
};

/**
 * The component name a JSX element opens, or null for a host element. A
 * lowercase first character marks a DOM tag in every JSX dialect, and a
 * member read off a name (`<UI.Button>`) is always a component, named as
 * written; a deeper member or a namespaced name names none.
 */
export const getJsxComponentName = (node: JsxOpeningElement): string | null => {
	if (node.name.type === 'JSXMemberExpression') {
		return getDottedName(node.name);
	}

	if (node.name.type !== 'JSXIdentifier') {
		return null;
	}

	const { name } = node.name;
	const initial = name[0];

	if (initial === undefined || initial !== initial.toUpperCase()) {
		return null;
	}

	return name;
};

/**
 * The component a Svelte element renders, named as written (`Button`,
 * `UI.Button`), or null for a host element or a deeper member.
 */
export const getSvelteComponentName = (node: SvelteElement): string | null => {
	// A component's name is never a `SvelteName`, which narrows it here.
	if (node.kind !== 'component' || node.name.type === 'SvelteName') {
		return null;
	}

	if (node.name.type === 'Identifier') {
		return node.name.name;
	}

	return getDottedName(node.name);
};

const capitalize = (word: string): string =>
	word.charAt(0).toUpperCase() + word.slice(1);

/**
 * The binding a Vue template element refers to, or null for a host element.
 * A PascalCase tag names its import directly; a kebab-case one (`<my-button>`)
 * is the PascalCase import spelled the HTML way.
 */
export const getVueComponentName = (node: VElement): string | null => {
	const { rawName } = node;

	if (rawName.includes('-')) {
		return rawName.split('-').map(capitalize).join('');
	}

	if (rawName === capitalize(rawName)) {
		return rawName;
	}

	return null;
};

/** The name a Vue attribute binds, plain or through `v-bind`. */
export const getVueAttributeName = (node: VAttribute): string | null => {
	if (node.key.type === 'VIdentifier') {
		return node.key.name;
	}

	if (node.key.name.name !== 'bind' || node.key.argument === null) {
		return null;
	}

	// A dynamic argument (`:[name]="…"`) names no attribute statically
	if (node.key.argument.type !== 'VIdentifier') {
		return null;
	}

	return node.key.argument.name;
};