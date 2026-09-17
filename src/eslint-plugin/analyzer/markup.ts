import type { Rule, SourceCode } from 'eslint';
import type { Expression, Node } from 'estree';
import { pushTokensFromText } from './token-extraction.ts';
import { baseSource, type Entry } from './token-model.ts';

// Minimal shapes for the framework AST nodes this rule reads. They are
// declared here rather than pulled from each framework's parser so the plugin
// keeps its single optional peer dependency on ESLint — every field below is
// only ever reached after its `type` has been checked.

export type JsxIdentifier = { type: 'JSXIdentifier'; name: string };

// An attribute's container always holds an expression — `class={}` is a parse
// error, so the `JSXEmptyExpression` a child container can hold never reaches
// the visitor here.
export type JsxExpressionContainer = {
	type: 'JSXExpressionContainer';
	expression: Expression;
};

export type JsxAttribute = {
	type: 'JSXAttribute';
	name: JsxIdentifier | { type: 'JSXNamespacedName' };
	value: Node | JsxExpressionContainer | null;
};

export type JsxOpeningElement = {
	type: 'JSXOpeningElement';
	name: JsxIdentifier | { type: 'JSXMemberExpression' | 'JSXNamespacedName' };
	attributes: ReadonlyArray<JsxAttribute | { type: 'JSXSpreadAttribute' }>;
};

export type SvelteLiteral = {
	type: 'SvelteLiteral';
	range: [number, number];
};

export type SvelteMustacheTag = {
	type: 'SvelteMustacheTag';
	expression: Expression;
};

export type SvelteAttribute = {
	type: 'SvelteAttribute';
	key: { name: string };
	value: ReadonlyArray<SvelteLiteral | SvelteMustacheTag>;
};

// Every other attribute kind svelte-eslint-parser emits on a start tag.
export type SvelteOtherAttribute = {
	type:
		| 'SvelteShorthandAttribute'
		| 'SvelteSpreadAttribute'
		| 'SvelteDirective'
		| 'SvelteSpecialDirective'
		| 'SvelteStyleDirective';
};

export type SvelteStartTag = {
	type: 'SvelteStartTag';
	attributes: ReadonlyArray<SvelteAttribute | SvelteOtherAttribute>;
};

export type SvelteElement = {
	type: 'SvelteElement';
	startTag: SvelteStartTag;
};

export type VIdentifier = { type: 'VIdentifier'; name: string };

export type VLiteral = { type: 'VLiteral'; range: [number, number] };

export type VExpressionContainer = {
	type: 'VExpressionContainer';
	expression: Expression | null;
};

export type VDirectiveKey = {
	type: 'VDirectiveKey';
	name: { name: string };
	argument: VIdentifier | null;
};

export type VAttribute = {
	type: 'VAttribute';
	key: VIdentifier | VDirectiveKey;
	value: VLiteral | VExpressionContainer | null;
};

export type VElement = {
	type: 'VElement';
	startTag: { attributes: ReadonlyArray<VAttribute> };
};

/**
 * Every node type a `no-restyle` visitor may be handed. ESLint types extra
 * visitor keys with the estree node union, so the framework shapes are joined
 * to it here and narrowed by `type` inside each handler.
 */
export type MarkupNode =
	Rule.Node | JsxOpeningElement | SvelteElement | VElement;

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
		pushTokensFromText(
			raw.slice(1, -1),
			start + 1,
			'base',
			baseSource,
			literals
		);

		return;
	}

	pushTokensFromText(raw, start, 'base', baseSource, literals);
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
 * dotted or namespaced name never resolves to a same-file binding.
 */
export const getJsxComponentName = (node: JsxOpeningElement): string | null => {
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

/** The `class` name a Vue attribute binds, plain or through `v-bind`. */
export const getVueClassAttributeName = (node: VAttribute): string | null => {
	if (node.key.type === 'VIdentifier') {
		return node.key.name;
	}

	if (node.key.name.name !== 'bind' || node.key.argument === null) {
		return null;
	}

	if (node.key.argument.type !== 'VIdentifier') {
		/* c8 ignore next 2 -- a dynamic argument is a VExpressionContainer */
		return null;
	}

	return node.key.argument.name;
};