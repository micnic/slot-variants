import type { Rule, Scope } from 'eslint';
import type { CallExpression, ImportDeclaration, Node } from 'estree';
import {
	type ForwardedStyles,
	resolveComponentFunction,
	resolveImportSource
} from '../analyzer/components.ts';
import { DOCS_URL } from '../analyzer/config-keys.ts';
import { resolveStaticValueFrom } from '../analyzer/const-bindings.ts';
import { createForwardingScan } from '../analyzer/forwarding.ts';
import {
	CLASS_ATTRIBUTES,
	getJsxAttributeName,
	getJsxComponentName,
	getVueClassAttributeName,
	type JsxAttribute,
	type MarkupNode,
	pushRawRangeTokens,
	type SvelteAttribute,
	type VAttribute,
	type VElement
} from '../analyzer/markup.ts';
import {
	type ClassParts,
	checkOverrideValue,
	collectCallParts,
	collectParts,
	emptyParts,
	reportAgainstStyled,
	reportParts
} from '../analyzer/restyle.ts';
import {
	type ModuleContext,
	resolveImportedComponent
} from '../analyzer/module-loader.ts';
import { buildAliasMap } from '../analyzer/module-paths.ts';
import {
	resolveTargetSlots,
	type StyledContext
} from '../analyzer/styled-values.ts';
import { type Entry } from '../analyzer/token-model.ts';
import {
	buildExclusiveGroupMap,
	type ConflictOptions,
	normalizePrefix
} from '../tailwind-categories.ts';

// A JSX class attribute, deferred until the whole file has been walked so a
// component used above its own declaration still resolves.
type JsxSite = {
	component: string;
	prop: string;
	collect: (parts: ClassParts) => void;
	// The scope the component name is looked up from, captured where the
	// element was written — JSX element names aren't estree nodes, so there is
	// nothing to ask for a scope once the walk has moved on.
	scope: Scope.Scope;
};

const getJsxAttributeValue = (node: JsxAttribute): Node | null => {
	const { value } = node;

	if (value === null) {
		return null;
	}

	if (value.type !== 'JSXExpressionContainer') {
		return value;
	}

	return value.expression;
};

// A component's forwarded `class` prop always lands in a single slot: a JSX or
// template attribute carries a class string, never the slot-keyed object form.
const checkAgainstComponent = (
	context: Rule.RuleContext,
	forwarded: ForwardedStyles,
	literals: ReadonlyArray<Entry>,
	reported: Set<string>,
	options: ConflictOptions
) => {
	const { styles, matchers, slot } = forwarded.invocation;

	for (const target of resolveTargetSlots(styles, slot ?? 'base')) {
		reportAgainstStyled(
			context,
			{ styles, slot: target, matchers },
			literals,
			reported,
			options
		);
	}
};

/**
 * Flags literal classes written on a component or element that collide with
 * the classes `sv()` / `cn()` already applies there — the component-level
 * counterpart of `no-conflicting-classes`, which only sees inside one config.
 *
 * Three positions are checked, in whichever framework spells them:
 * the runtime `class` / `className` override a variant function is called with
 * (`card({ class: 'p-4' })`, including the per-slot object form); literal
 * classes written next to a slot-variants result in one class list
 * (`` className={`${classes.base} p-4`} ``, `cn(classes.base, 'p-4')`,
 * `:class="[classes.base, 'p-4']"`, `class="p-4 {classes.base}"`); and the
 * `class` / `className` attribute of a same-file component that forwards that
 * prop into an `sv()` call (`<Button className="p-4" />`).
 *
 * A component imported from another module is followed to the file that
 * declares it, through any re-export or barrel file in between. Relative
 * specifiers resolve on their own; a path alias (`@/components/button`) needs
 * the `alias` option to map its prefix to a directory.
 *
 * Classes that can't render together are not flagged: the variant values a
 * call site fixes (directly or through `defaultVariants`) rule out every
 * variant and compound entry that requires a different value.
 *
 * The `exclusiveGroups` and `prefix` options mean exactly what they do in
 * `no-conflicting-classes`.
 */
export const noRestyle: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow class names on a component or element that conflict with the classes its sv() or cn() config already applies',
			recommended: true,
			url: DOCS_URL
		},
		schema: [
			{
				type: 'object',
				properties: {
					exclusiveGroups: {
						oneOf: [
							{ type: 'boolean' },
							{
								type: 'array',
								items: {
									type: 'array',
									items: { type: 'string' },
									minItems: 2
								}
							}
						]
					},
					prefix: { type: 'string', minLength: 1 },
					alias: {
						type: 'object',
						additionalProperties: { type: 'string' }
					}
				},
				additionalProperties: false
			}
		],
		messages: {
			duplicate:
				'Class "{{token}}" is already applied to the "{{slot}}" slot.',
			conflict:
				'Class "{{token}}" conflicts with "{{internal}}" applied to the "{{slot}}" slot.'
		}
	},
	create(context) {
		const options: ConflictOptions = {
			exclusiveGroups: buildExclusiveGroupMap(
				context.options[0]?.exclusiveGroups
			),
			prefix: normalizePrefix(context.options[0]?.prefix)
		};
		const { sourceCode } = context;
		const scan = createForwardingScan(context);
		const { ctx, currentScope, moduleScope, matchCall } = scan;
		const moduleContext: ModuleContext = {
			aliases: buildAliasMap(context.options[0]?.alias, context.cwd),
			cwd: context.cwd,
			languageOptions: context.languageOptions
		};
		// Vue template expressions resolve against the `<script>` module scope;
		// their own scope never reaches the bindings they name.
		let templateCtx: StyledContext | null = null;
		// Shared by every position, so a class list reached from two of them —
		// a `cn()` call is its own site and a part of the attribute holding it —
		// reports each literal once.
		const reported = new Set<string>();
		const jsxSites: JsxSite[] = [];

		const getTemplateCtx = (): StyledContext => {
			if (templateCtx === null) {
				const scope = moduleScope();

				templateCtx = {
					sourceCode,
					matchCall,
					resolve: (node) =>
						resolveStaticValueFrom(node, sourceCode, scope)
				};
			}

			return templateCtx;
		};

		// A component declared in this file, or one reached through an import —
		// the import is followed to the module that declares it, through any
		// re-export or barrel file in between.
		const resolveSiteComponent = (
			site: JsxSite
		): ForwardedStyles | null => {
			const fn = resolveComponentFunction(site.component, site.scope);

			if (fn !== null) {
				return scan.forwarded.get(fn) ?? null;
			}

			const source = resolveImportSource(site.component, site.scope);

			if (source === null) {
				return null;
			}

			return resolveImportedComponent(
				source.specifier,
				source.exportName,
				context.physicalFilename,
				moduleContext,
				new Set()
			);
		};

		const checkAttribute = (
			collect: (parts: ClassParts) => void,
			site: JsxSite | null
		) => {
			const parts = emptyParts();

			collect(parts);

			if (site !== null) {
				const styles = resolveSiteComponent(site);

				if (styles !== null && styles.prop === site.prop) {
					checkAgainstComponent(
						context,
						styles,
						parts.literals,
						reported,
						options
					);
				}
			}

			reportParts(context, parts, reported, options);
		};

		const visitJsxAttribute = (
			attribute: JsxAttribute,
			component: string | null
		) => {
			const prop = getJsxAttributeName(attribute);

			if (prop === null || !CLASS_ATTRIBUTES.has(prop)) {
				return;
			}

			const value = getJsxAttributeValue(attribute);

			if (value === null) {
				return;
			}

			const collect = (parts: ClassParts) => {
				collectParts(value, ctx, parts);
			};

			if (component === null) {
				checkAttribute(collect, null);

				return;
			}

			jsxSites.push({ component, prop, collect, scope: currentScope() });
		};

		const visitSvelteAttribute = (attribute: SvelteAttribute) => {
			if (!CLASS_ATTRIBUTES.has(attribute.key.name)) {
				return;
			}

			checkAttribute((parts) => {
				for (const part of attribute.value) {
					if (part.type === 'SvelteLiteral') {
						pushRawRangeTokens(
							sourceCode,
							part.range,
							parts.literals
						);
					} else {
						collectParts(part.expression, ctx, parts);
					}
				}
			}, null);
		};

		// Vue merges a static `class` attribute with a `:class` binding on the
		// same element, so both are read into one class list.
		const collectVueAttribute = (
			attribute: VAttribute,
			parts: ClassParts
		) => {
			const name = getVueClassAttributeName(attribute);

			if (name === null || !CLASS_ATTRIBUTES.has(name)) {
				return;
			}

			const { value } = attribute;

			if (value === null) {
				return;
			}

			if (value.type === 'VLiteral') {
				pushRawRangeTokens(sourceCode, value.range, parts.literals);

				return;
			}

			if (value.expression !== null) {
				collectParts(value.expression, getTemplateCtx(), parts);
			}
		};

		const visitVueElement = (node: VElement) => {
			checkAttribute((parts) => {
				for (const attribute of node.startTag.attributes) {
					collectVueAttribute(attribute, parts);
				}
			}, null);
		};

		const scriptVisitors = {
			ImportDeclaration(node: ImportDeclaration) {
				scan.importsTracker(node);
			},
			':function'(node: MarkupNode) {
				scan.enterFunction(node);
			},
			':function:exit'() {
				scan.exitFunction();
			},
			CallExpression(node: CallExpression) {
				const call = matchCall(node);

				// A `cn()` (or config-less `sv()`) call is a class list in its
				// own right, wherever it is written.
				if (
					call !== null &&
					call.isFactoryConfig !== true &&
					call.config === null
				) {
					checkAttribute((parts) => {
						collectCallParts(node, ctx, parts);
					}, null);

					return;
				}

				const visited = scan.visitCall(node);

				if (visited === null) {
					return;
				}

				checkOverrideValue(
					context,
					visited.value,
					visited.invocation,
					ctx,
					reported,
					options
				);
			},
			JSXOpeningElement(node: MarkupNode) {
				/* c8 ignore next 3 -- the selector only matches this type */
				if (node.type !== 'JSXOpeningElement') {
					return;
				}

				const component = getJsxComponentName(node);

				for (const attribute of node.attributes) {
					if (attribute.type === 'JSXAttribute') {
						visitJsxAttribute(attribute, component);
					}
				}
			},
			SvelteElement(node: MarkupNode) {
				/* c8 ignore next 3 -- the selector only matches this type */
				if (node.type !== 'SvelteElement') {
					return;
				}

				for (const attribute of node.startTag.attributes) {
					if (attribute.type === 'SvelteAttribute') {
						visitSvelteAttribute(attribute);
					}
				}
			},
			'Program:exit'() {
				for (const site of jsxSites) {
					checkAttribute(site.collect, site);
				}
			}
		};

		const { defineTemplateBodyVisitor } = sourceCode.parserServices;

		if (typeof defineTemplateBodyVisitor === 'function') {
			return defineTemplateBodyVisitor(
				{
					/* c8 ignore next 4 -- the selector only matches this type */
					VElement(node: MarkupNode) {
						if (node.type === 'VElement') {
							visitVueElement(node);
						}
					}
				},
				scriptVisitors
			);
		}

		return scriptVisitors;
	}
};