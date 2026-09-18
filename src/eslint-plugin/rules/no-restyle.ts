import type { Rule } from 'eslint';
import {
	resolveComponentFunction,
	resolveImportSource
} from '../analyzer/components.ts';
import { DOCS_URL } from '../analyzer/config-keys.ts';
import {
	type ComponentSite,
	createForwardingScan,
	type ForwardedStyles
} from '../analyzer/forwarding.ts';
import {
	type ModuleContext,
	resolveImportedComponent
} from '../analyzer/module-loader.ts';
import { buildAliasMap } from '../analyzer/module-paths.ts';
import { reportLiterals, reportParts } from '../analyzer/restyle.ts';
import {
	buildExclusiveGroupMap,
	type ConflictOptions,
	normalizePrefix
} from '../tailwind-categories.ts';

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
 * `class` / `className` attribute of a component that forwards that prop into
 * such a position (`<Button className="p-4" />`).
 *
 * A component forwards its prop when the prop reaches a variant call's
 * override (`button({ class: className })`) or sits beside a slot-variants
 * result in one class list (`cn(button(), className)`, `` `${button()}
 * ${className}` ``). Inside a `cn()` list the literals count as well —
 * `cn('p-2', className)` applies `p-2` just as a config would. The prop is
 * read off a function component's first parameter, destructured (with or
 * without a default) or as a whole props object, including an object derived
 * from it (Solid's `splitProps`, `mergeProps`); a wrapper call like
 * `forwardRef()` or `memo()` around the function is looked through. A Svelte
 * or Vue single-file component is a component too, its props coming from
 * `$props()`, `defineProps()` (bare or under `withDefaults()`) or `useAttrs()`
 * at the top level of its script.
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
		const moduleContext: ModuleContext = {
			aliases: buildAliasMap(context.options[0]?.alias, context.cwd),
			cwd: context.cwd,
			languageOptions: context.languageOptions
		};
		// Shared by every position, so a class list reached from two of them —
		// a `cn()` call is its own site and a part of the attribute holding it —
		// reports each literal once.
		const reported = new Set<string>();

		// A component declared in this file, or one reached through an import —
		// the import is followed to the module that declares it, through any
		// re-export or barrel file in between.
		const resolveSiteComponent = (
			site: ComponentSite
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

		const scan = createForwardingScan(context, {
			onPosition(parts, site) {
				if (site !== null) {
					const styles = resolveSiteComponent(site);

					if (styles !== null && styles.prop === site.prop) {
						reportLiterals(
							context,
							styles.targets,
							parts.literals,
							reported,
							options
						);
					}
				}

				reportParts(context, parts, reported, options);
			},
			onExit() {}
		});

		return scan.listener;
	}
};