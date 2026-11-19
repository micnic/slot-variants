import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import t from 'tap';
import { IMPORT, IMPORT_SV_CN } from './helpers.ts';

// Cross-file resolution needs modules that really exist on disk, so the
// fixtures below are written to a temp directory for the duration of the run.
export const fixtureDir = mkdtempSync(join(tmpdir(), 'slot-variants-'));

export const writeFixture = (name: string, content: string): string => {
	const path = join(fixtureDir, name);

	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, content);

	return path;
};

t.teardown(() => {
	rmSync(fixtureDir, { recursive: true, force: true });
});

writeFixture(
	'ui/button.tsx',
	`${IMPORT}const button = sv({
		base: 'p-2 rounded',
		variants: { size: { sm: 'text-sm', lg: 'mt-8' } },
		defaultVariants: { size: 'sm' }
	});

	export function Button({ className, size }) {
		return <button className={button({ size, class: className })} />;
	}

	export default function Chip({ className }) {
		return <span className={button({ class: className })} />;
	}

	export const NotAComponent = 5;
	`
);

writeFixture(
	'ui/card.tsx',
	`${IMPORT}const card = sv('border rounded-lg', { slots: { header: 'px-4' } });

	const Card = ({ class: cls }) => <div class={card({ class: cls }).base} />;

	export { Card };
	export { Card as Panel };
	`
);

// A barrel: one named re-export, one star re-export.
writeFixture(
	'ui/index.ts',
	`export { Button } from './button.tsx';
	export * from './card.tsx';
	`
);

// A barrel that imports first and re-exports the bindings: by name, and as
// its default export.
writeFixture(
	'ui/relay.ts',
	`import Chip, { Button } from './button.tsx';

	export { Button as RelayedButton };
	export default Chip;
	`
);

// A component whose own file never calls sv().
writeFixture(
	'ui/plain.tsx',
	'export function Plain({ className }) { return <i className={className} />; }\n'
);

// A module whose own exports shadow the components its `export *` sources
// export under the same names: one forwards its class prop to no sv() call,
// the other is a class.
writeFixture(
	'ui/shadowing.tsx',
	`export function Button({ className }) {
		return <i className={className} />;
	}

	export class Badge {}

	export * from './button.tsx';
	export * from './badge.tsx';
	`
);

// A barrel that only star-exports a module with a default export, which
// `export *` doesn't carry over.
writeFixture('ui/star-only.ts', "export * from './button.tsx';\n");

// Every default-export shape, plus a class export, which names no component,
// and an export name that isn't an identifier.
writeFixture(
	'ui/anon.tsx',
	`${IMPORT}const anon = sv({ base: 'm-1', variants: {} });

	export class Ignored {}

	export default function ({ className }) {
		return <i className={anon({ class: className })} />;
	}
	`
);

writeFixture(
	'ui/arrow.tsx',
	`${IMPORT}const arrow = sv({ base: 'm-2', variants: {} });

	export default ({ className }) => <i className={arrow({ class: className })} />;
	`
);

writeFixture(
	'ui/named-default.tsx',
	`${IMPORT}const named = sv({ base: 'm-3', variants: {} });

	function Named({ className }) {
		return <i className={named({ class: className })} />;
	}

	export default Named;
	export { Named as "odd name" };
	`
);

// An anonymous default export that forwards nothing, and one that is neither
// a function nor a call.
writeFixture('ui/bare.tsx', 'export default ({ id }) => <i id={id} />;\n');

writeFixture('ui/object.tsx', "export default { name: 'x' };\n");

// A default-exported call that wraps neither a function nor a name.
writeFixture('ui/factory.tsx', "export default createThing({ name: 'x' });\n");

// An exported name bound more than once, which resolves to no single binding.
writeFixture(
	'ui/redeclared.ts',
	'var Twice = () => null;\nvar Twice = () => null;\nexport { Twice };\n'
);

// Two modules re-exporting each other — the walk must stop rather than loop.
writeFixture('ui/loop-a.ts', "export { Looped } from './loop-b.ts';\n");

writeFixture('ui/loop-b.ts', "export { Looped } from './loop-a.ts';\n");

// A file the parser can't read at all.
writeFixture('ui/broken.tsx', 'export function Broken( { unclosed\n');

// Components wrapped in `forwardRef()` / `memo()`, exported both ways.
writeFixture(
	'ui/wrapped.tsx',
	`${IMPORT}const wrapped = sv({ base: 'm-5', variants: {} });

	export const Memoized = memo(function Memoized({ className }) {
		return <i className={wrapped({ class: className })} />;
	});

	export default forwardRef(({ className }, ref) => <i ref={ref} className={wrapped({ class: className })} />);
	`
);

// Components wrapped by name: a function declared here, and one imported.
writeFixture(
	'ui/wrapped-by-name.tsx',
	`${IMPORT}import { Button } from './button.tsx';
	const named = sv({ base: 'm-7', variants: {} });

	function Impl({ className }) {
		return <i className={named({ class: className })} />;
	}

	export const Named = memo(Impl);
	export const WrappedButton = memo(Button);
	export default memo(Impl);
	`
);

// A barrel with more `export *` lines than the re-export hop limit, ahead of
// the one that leads to the component.
for (let index = 0; index < 11; index += 1) {
	writeFixture(
		`ui/many/empty-${index}.ts`,
		`export const value${index} = ${index};\n`
	);
}

writeFixture(
	'ui/many/index.ts',
	`${Array.from({ length: 11 }, (_, index) => `export * from './empty-${index}.ts';`).join('\n')}\nexport * from '../button.tsx';\n`
);

// Single-file components: the module itself is the component, whose props
// come from `$props()` (Svelte) or `defineProps()` / `useAttrs()` (Vue).
writeFixture(
	'ui/Button.svelte',
	`<script>
	${IMPORT}const button = sv({ base: 'p-2 rounded', variants: {} });
	let { class: className = '', ...rest } = $props();
	</script>
	<button class={button({ class: className })} {...rest}>x</button>`
);

// The template above the script, a whole-props object, and a `cn()` sibling.
writeFixture(
	'ui/Chip.svelte',
	`<span class={cn(chip(), props.class)}>x</span>
	<script>
	${IMPORT_SV_CN}const chip = sv({ base: 'px-1', variants: {} });
	const props = $props();
	</script>`
);

writeFixture(
	'ui/Plain.svelte',
	'<script>let { id } = $props();</script>\n<i {id}></i>'
);

// TypeScript syntax, which the default parser can't read.
writeFixture(
	'ui/typed.ts',
	`${IMPORT}const typed = sv({ base: 'p-2', variants: {} });

	export const Typed = ({ className }: { className: string }) =>
		typed({ class: className });
	`
);

// Barrels of single-file components: plain script modules, which the Svelte
// parser can't read.
writeFixture(
	'ui/svelte-barrel.js',
	"export { default as Button } from './Button.svelte';\n"
);

writeFixture(
	'ui/svelte-barrel.ts',
	"export type Size = 'sm' | 'lg';\nexport { default as Chip } from './Chip.svelte';\n"
);

writeFixture(
	'ui/Button.vue',
	`<script setup>
	${IMPORT}const button = sv({ base: 'p-2 rounded', variants: { size: { sm: 'text-sm' } } });
	const props = defineProps({ class: String, size: String });
	</script>
	<template><button :class="button({ size: props.size, class: props.class })">x</button></template>`
);

writeFixture(
	'ui/Chip.vue',
	`<script setup>
	${IMPORT_SV_CN}const chip = sv({ base: 'px-1', variants: {} });
	const { class: cls } = withDefaults(defineProps(), {});
	</script>
	<template><span :class="cn(chip(), cls)">x</span></template>`
);

writeFixture(
	'ui/Tag.vue',
	`<script setup>
	${IMPORT}const tag = sv({ base: 'm-1', variants: {} });
	const attrs = useAttrs();
	</script>
	<template><span :class="[tag(), attrs.class]">x</span></template>`
);

writeFixture(
	'ui/vue-barrel.js',
	"export { default as Button } from './Button.vue';\n"
);

writeFixture(
	'ui/Plain.vue',
	'<script setup>defineProps({ id: String });</script>\n<template><i /></template>'
);

// Imported with a `.js` specifier that only exists as `.tsx`.
writeFixture(
	'ui/badge.tsx',
	`${IMPORT}const badge = sv({ base: 'px-1 text-xs', variants: {} });

	export function Badge({ className }) {
		return <b className={badge({ class: className })} />;
	}
	`
);

// A re-export chain longer than the loader will follow.
const HOP_COUNT = 12;

for (let index = 0; index < HOP_COUNT; index++) {
	writeFixture(
		`hops/hop${index}.ts`,
		`export { Hopped } from './hop${index + 1}.ts';\n`
	);
}

writeFixture(
	`hops/hop${HOP_COUNT}.tsx`,
	`${IMPORT}const hopped = sv({ base: 'p-2', variants: {} });

	export function Hopped({ className }) {
		return <i className={hopped({ class: className })} />;
	}
	`
);

// Enough modules to push the loader's bounded cache past its limit, so the
// oldest entry is evicted rather than the map growing without end.
const CACHED_MODULE_COUNT = 210;

export const cacheImports: string[] = [];

export const cacheUsages: string[] = [];

for (let index = 0; index < CACHED_MODULE_COUNT; index++) {
	writeFixture(
		`many/mod${index}.tsx`,
		`${IMPORT}const mod = sv({ base: 'p-2', variants: {} });

		export function Mod${index}({ className }) {
			return <i className={mod({ class: className })} />;
		}
		`
	);
	cacheImports.push(`import { Mod${index} } from './many/mod${index}.tsx';`);
	cacheUsages.push(`<Mod${index} className="gap-1" />;`);
}