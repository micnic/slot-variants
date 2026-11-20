import type { Rule } from 'eslint';
import { resolveTagBinding } from '../analyzer/components.ts';
import { docsUrl } from '../analyzer/config-keys.ts';
import {
	conflictOptionProperties,
	readConflictOptions
} from '../analyzer/conflict-options.ts';
import {
	type ComponentSite,
	createForwardingScan,
	type ForwardedStyles,
	getSiteTargets
} from '../analyzer/forwarding.ts';
import {
	cacheLintedModule,
	getModuleContext,
	resolveImportedComponent
} from '../analyzer/module-loader.ts';
import { canPairParts, createLiteralReporter } from '../analyzer/restyle.ts';
import { getOrCreate } from '../map-utils.ts';

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
 * A component forwards its prop when the prop reaches a variant call's override
 * (`button({ class: className })`) or sits beside a slot-variants result in one
 * class list (`cn(button(), className)`, `` `${button()} ${className}` ``).
 * The literals inside a `cn()` list count as well — `cn('p-2', className)`
 * applies `p-2` just as a config would. A variant the component reads from a
 * prop (`button({ size, class: className })`) takes the value the element
 * passes it (`<Button size="sm" />`); when the element passes none, the
 * prop's default — from destructuring (`{ size = 'sm' }`), Vue's
 * `withDefaults()` or `defineProps()` `default`, or Solid's `merge()` —
 * or else the variant's. The prop is read off a function component's first
 * parameter, destructured (with or without a default) or as a whole props
 * object, including one destructured or renamed in the component body
 * (`const { className } = props`) and an object derived from it (Solid's
 * `merge`, `omit`); a wrapper call like `forwardRef()` or `memo()` around the
 * function is looked through. A Svelte or Vue single-file component
 * is a component too, its props coming from `$props()`, `defineProps()` (bare
 * or under `withDefaults()`) or `useAttrs()` at the top level of its script.
 *
 * A component imported from another module is followed to the file that
 * declares it, through any re-export or barrel file in between. Relative
 * specifiers resolve on their own; a path alias (`@/components/button`) needs
 * the `alias` option to map its prefix to a directory.
 *
 * Classes that can't render together are not flagged: the variant values a
 * call site fixes (directly, through its `preset` or through
 * `defaultVariants`, or unset with `null` or by not passing a variant that
 * has no default) rule out every variant and compound entry that requires a
 * different value, and the two sides of a ternary, `||` or `??` are never
 * checked against each other.
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
			url: docsUrl('no-restyle')
		},
		schema: [
			{
				type: 'object',
				properties: {
					...conflictOptionProperties,
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
		const options = readConflictOptions(context.options[0]);
		const moduleContext = getModuleContext(
			context,
			context.options[0]?.alias
		);
		// Shared by every position, so a class list reached from two of
		// them — a `cn()` call is its own site and a part of the attribute
		// holding it — reports each literal once.
		const reportLiterals = createLiteralReporter(context, options);
		// Each import resolved once per file, however many sites render it:
		// resolving one walks the filesystem.
		const importedStyles = new Map<string, ForwardedStyles | null>();

		// A component declared in this file, or one reached through an import —
		// the import is followed to the module that declares it, through any
		// re-export or barrel file in between.
		const resolveSiteComponent = (
			site: ComponentSite
		): ForwardedStyles | null => {
			const binding = resolveTagBinding(site.component, site.scope);

			if (binding === null) {
				return null;
			}

			if (binding.kind === 'local') {
				return scan.forwarded.get(binding.fn) ?? null;
			}

			const { specifier, exportName } = binding.source;

			return getOrCreate(
				importedStyles,
				`${specifier}|${exportName}`,
				() =>
					resolveImportedComponent(
						specifier,
						exportName,
						context.physicalFilename,
						moduleContext
					)
			);
		};

		const scan = createForwardingScan(context, {
			onPosition(parts, site) {
				if (site !== null) {
					const styles = resolveSiteComponent(site);

					if (styles !== null && styles.prop === site.prop) {
						reportLiterals(
							getSiteTargets(styles, site),
							parts.literals
						);
					}
				}

				reportLiterals(
					parts.styled,
					parts.literals,
					canPairParts(parts)
				);
			},
			// A later file importing this one reads the scan from the cache
			// rather than parsing the file again.
			onExit(moduleScan) {
				cacheLintedModule(context, moduleScan);
			}
		});

		return scan.listener;
	}
};