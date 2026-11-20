import { join } from 'node:path';
import * as svelteParser from 'svelte-eslint-parser';
import { parser as tsParser } from 'typescript-eslint';
import { cacheImports, cacheUsages, fixtureDir } from './fixtures.ts';
import { dup, restyle } from './helpers.ts';

export const CROSS_FILE_VALID = [
	{
		// A dotted name off anything but a namespace import, or nested deeper
		// than one member, names no import.
		code: `import { UI } from './ui';\nimport * as NS from './ui';\n<UI.Button className="p-6" />;\n<NS.Button.Inner className="p-6" />;\n<Local.Button className="p-6" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// A module the default parser can't read has no other parser to be
		// read with, so its component stays unknown.
		code: `import { Typed } from './ui/typed.ts';\n<Typed className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// The chain runs past the hop limit, so the component at its end is
		// never reached.
		code: `import { Hopped } from './hops/hop0.ts';\n<Hopped className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		code: `${cacheImports.join('\n')}\n${cacheUsages.join('\n')}`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// A class that collides with nothing the imported component applies.
		code: `import { Button } from './ui/button.tsx';\n<Button className="gap-1" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// `mt-8` only ships with `size: 'lg'`, which the component's own
		// defaultVariants rules out — exclusivity survives the file boundary.
		code: `import { Button } from './ui/button.tsx';\n<Button className="mt-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// The component forwards `class`, so `className` isn't its prop.
		code: `import { Card } from './ui/card.tsx';\n<Card className="rounded-lg" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// An export that isn't a function, a module that doesn't exist, a bare
		// package specifier with no alias, and a component with no sv() call.
		code: `import { NotAComponent } from './ui/button.tsx';\n<NotAComponent className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		code: `import { Button } from './ui/missing.tsx';\n<Button className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		code: `import { Button } from 'some-package';\n<Button className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// A specifier too long to name a file fails to stat, rather than
		// just missing.
		code: `import { Button } from './${'x'.repeat(300)}';\n<Button className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		code: `import { Plain } from './ui/plain.tsx';\n<Plain className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// A name the barrel doesn't export is followed and then given up on.
		code: `import { Nothing } from './ui';\n<Nothing className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// A namespace binding used as an element name directly names no export.
		code: `import * as Button from './ui/button.tsx';\n<Button className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// A `.js` specifier with no source file behind it.
		code: `import { Badge } from './ui/nothing.js';\n<Badge className="px-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// An anonymous default export that never forwards a class prop, and a
		// default export that is no component at all.
		code: `import Bare from './ui/bare.tsx';\n<Bare className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		code: `import Obj from './ui/object.tsx';\n<Obj className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		code: `import Thing from './ui/factory.tsx';\n<Thing className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		code: `import { Twice } from './ui/redeclared.ts';\n<Twice className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// A file the parser can't read leaves its usages alone.
		code: `import { Broken } from './ui/broken.tsx';\n<Broken className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// A module's own export shadows the same name its `export *` sources
		// export.
		code: `import { Button, Badge } from './ui/shadowing.tsx';\n<><Button className="p-4" /><Badge className="px-4" /></>;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// `export *` never re-exports a default.
		code: `import Btn from './ui/star-only.ts';\n<Btn className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// Mutually re-exporting modules terminate instead of looping.
		code: `import { Looped } from './ui/loop-a.ts';\n<Looped className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx')
	},
	{
		// An alias whose prefix doesn't match the specifier.
		code: `import { Button } from '~other/button.tsx';\n<Button className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		options: [{ alias: { '@ui/': join(fixtureDir, 'ui') } }]
	}
];

export const CROSS_FILE_INVALID = [
	{
		// A component read off a namespace import, of its module or a barrel.
		code: `import * as UI from './ui/button.tsx';\n<UI.Button className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('p-4', 'p-2')]
	},
	{
		code: `import * as UI from './ui';\n<UI.Button className="p-6" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('p-6', 'p-2')]
	},
	{
		// A named import, resolved through the file that declares it.
		code: `import { Button } from './ui/button.tsx';\n<Button className="p-4 rounded" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('p-4', 'p-2'), dup('rounded')]
	},
	{
		// A default import.
		code: `import Chip from './ui/button.tsx';\n<Chip className="p-8" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('p-8', 'p-2')]
	},
	{
		// Through a barrel's named re-export, and a directory import that
		// lands on its index file.
		code: `import { Button } from './ui';\n<Button className="p-6" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('p-6', 'p-2')]
	},
	{
		// Through a barrel that re-exports an imported binding by name, and
		// one it re-exports as its default.
		code: `import { RelayedButton } from './ui/relay.ts';\n<RelayedButton className="p-6" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('p-6', 'p-2')]
	},
	{
		code: `import Relayed from './ui/relay.ts';\n<Relayed className="p-8" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('p-8', 'p-2')]
	},
	{
		// Through the barrel's `export *`, to a renamed export.
		code: `import { Panel } from './ui/index.ts';\n<Panel class="rounded-lg" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [dup('rounded-lg')]
	},
	{
		// A `.js` specifier resolved to the `.tsx` file behind it.
		code: `import { Badge } from './ui/badge.js';\n<Badge className="px-4" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('px-4', 'px-1')]
	},
	{
		// A path alias, mapped by the `alias` option.
		code: `import { Button } from '@ui/button.tsx';\n<Button className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		options: [{ alias: { '@ui/': join(fixtureDir, 'ui') } }],
		errors: [restyle('p-4', 'p-2')]
	},
	{
		// The imported component's own variant props still narrow what it can
		// render, so `mt-4` collides once `size: 'lg'` is what it applies.
		code: `import { Button } from './ui/button.tsx';\n<Button className="text-base" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('text-base', 'text-sm')]
	},
	{
		// An anonymous default export has no name to look up, so the function
		// node itself is the target.
		code: `import Anon from './ui/anon.tsx';\n<Anon className="m-4" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('m-4', 'm-1')]
	},
	{
		code: `import Arrow from './ui/arrow.tsx';\n<Arrow className="m-4" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('m-4', 'm-2')]
	},
	{
		// `export default <identifier>` resolves through the module scope.
		code: `import Named from './ui/named-default.tsx';\n<Named className="m-4" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('m-4', 'm-3')]
	},
	{
		// A string export name, imported under one.
		code: `import { "odd name" as Odd } from './ui/named-default.tsx';\n<Odd className="m-4" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('m-4', 'm-3')]
	},
	{
		// An absolute specifier resolves straight to the file.
		code: `import { Button } from '${join(fixtureDir, 'ui/button.tsx')}';\n<Button className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('p-4', 'p-2')]
	},
	{
		// A wrapped component, as a named and as a default export.
		code: `import Ref, { Memoized } from './ui/wrapped.tsx';\n<><Memoized className="m-4" /><Ref className="m-6" /></>;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('m-4', 'm-5'), restyle('m-6', 'm-5')]
	},
	{
		// Components wrapped by name, exported by name and as the default, and
		// a wrapped import followed on to its own module.
		code: `import Memo, { Named, WrappedButton } from './ui/wrapped-by-name.tsx';\n<><Named className="m-4" /><Memo className="m-6" /><WrappedButton className="p-4" /></>;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [
			restyle('m-4', 'm-7'),
			restyle('m-6', 'm-7'),
			restyle('p-4', 'p-2')
		]
	},
	{
		// Through a barrel whose sibling re-exports outnumber the hop limit.
		code: `import { Button } from './ui/many/index.ts';\n<Button className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		errors: [restyle('p-4', 'p-2')]
	},
	{
		// The longest matching alias wins over a broader one.
		code: `import { Button } from '@/ui/button.tsx';\n<Button className="p-4" />;`,
		filename: join(fixtureDir, 'page.tsx'),
		options: [
			{
				alias: {
					'@/': join(fixtureDir, 'nowhere'),
					'@/ui/': join(fixtureDir, 'ui')
				}
			}
		],
		errors: [restyle('p-4', 'p-2')]
	}
];

// Single-file components are always another file, so a component usage in
// Svelte and Vue is cross-file by nature.
// Cases whose fixture modules only the TypeScript parser reads, which the
// oxlint tester can't be given.
export const TS_CROSS_FILE_VALID = [
	{
		// A module's own export declared through a binding pattern, or as a
		// TypeScript value, shadows `export *` too.
		code: `import { Button, Badge, Card, Tag } from './ui/shadowing-declarations.ts';\n<><Button className="p-4" /><Badge className="px-4" /><Card className="p-4" /><Tag className="p-4" /></>;`,
		filename: join(fixtureDir, 'page.tsx'),
		languageOptions: { parser: tsParser }
	}
];

export const TS_CROSS_FILE_INVALID = [
	{
		// A type-only or erased export leaves the value to `export *`.
		code: `import { Chip, Pill, Ghost, Phantom, Shade, Mist } from './ui/shadowing-declarations.ts';\n<><Chip className="p-4" /><Pill className="p-4" /><Ghost className="p-4" /><Phantom className="p-4" /><Shade className="p-4" /><Mist className="p-4" /></>;`,
		filename: join(fixtureDir, 'page.tsx'),
		languageOptions: { parser: tsParser },
		errors: Array.from({ length: 6 }, () => restyle('p-4', 'p-2'))
	}
];

export const SVELTE_CROSS_FILE_VALID = [
	{
		// A component that forwards no class prop, and one the module never
		// imports.
		code: `<script>import Plain from './ui/Plain.svelte';</script>\n<Plain class="p-4" /><Missing class="p-4" />`,
		filename: join(fixtureDir, 'page.svelte')
	}
];

export const SVELTE_CROSS_FILE_INVALID = [
	{
		// A component read off a namespace import.
		code: `<script>import * as UI from './ui/svelte-barrel.js';</script>\n<UI.Button class="p-4" />`,
		filename: join(fixtureDir, 'page.svelte'),
		errors: [restyle('p-4', 'p-2')]
	},
	{
		// A barrel isn't Svelte markup, so it's read as a plain script: with
		// the default parser when the config names no script parser…
		code: `<script>import { Button } from './ui/svelte-barrel.js';</script>\n<Button class="p-4" />`,
		filename: join(fixtureDir, 'page.svelte'),
		errors: [restyle('p-4', 'p-2')]
	},
	{
		// …and with the configured one otherwise, here for TypeScript.
		code: `<script lang="ts">import { Chip } from './ui/svelte-barrel.ts';</script>\n<Chip class="px-4" />`,
		filename: join(fixtureDir, 'page.svelte'),
		languageOptions: {
			parser: svelteParser,
			parserOptions: { parser: tsParser }
		},
		errors: [restyle('px-4', 'px-1')]
	},
	{
		code: `<script>import Button from './ui/Button.svelte';\nimport Chip from './ui/Chip.svelte';</script>\n<Button class="p-4 rounded" /><Chip class="px-4" />`,
		filename: join(fixtureDir, 'page.svelte'),
		errors: [restyle('p-4', 'p-2'), dup('rounded'), restyle('px-4', 'px-1')]
	}
];

SVELTE_CROSS_FILE_INVALID.push({
	// Static text, a static expression, a bare attribute and a shorthand
	// variable; text mixed with an expression can't be read.
	code: `<script>import Sized from './ui/Sized.svelte';\nconst size = 'sm';</script>\n<Sized size="sm" class="text-lg" /><Sized size={'sm'} class="text-xl" /><Sized flat class="shadow-lg" /><Sized {size} class="text-2xl" /><Sized size="s{x}" class="text-3xl" /><Sized size={undefined} class="text-4xl" />`,
	filename: join(fixtureDir, 'page.svelte'),
	errors: [
		restyle('text-lg', 'text-sm'),
		restyle('text-xl', 'text-sm'),
		restyle('shadow-lg', 'shadow-none'),
		restyle('text-2xl', 'text-sm'),
		restyle('text-3xl', 'text-sm'),
		restyle('text-4xl', 'text-base')
	]
});

SVELTE_CROSS_FILE_INVALID.push({
	// A spread passes the props of an object literal, and may pass any prop
	// otherwise; a `bind:` directive passes a state that can't be read, and
	// an event handler leaves the default.
	code: `<script>import Sized from './ui/Sized.svelte';</script>\n<Sized {...{ size: 'md' }} class="text-lg" /><Sized {...o} class="text-xl" /><Sized bind:size={s} class="text-2xl" /><Sized on:click={f} class="text-3xl" />`,
	filename: join(fixtureDir, 'page.svelte'),
	errors: [
		restyle('text-lg', 'text-base'),
		restyle('text-xl', 'text-sm'),
		restyle('text-2xl', 'text-sm'),
		restyle('text-3xl', 'text-base')
	]
});

export const VUE_CROSS_FILE_VALID = [
	{
		// A component that forwards no class prop, a globally registered one
		// the module never imports, and a host element.
		code: `<script setup>import Plain from './ui/Plain.vue';</script>\n<template><Plain class="p-4" /><router-link class="p-4" /><div class="p-4" /></template>`,
		filename: join(fixtureDir, 'page.vue')
	}
];

export const VUE_CROSS_FILE_INVALID = [
	{
		// A default from `withDefaults()` or a runtime declaration stands in
		// for a prop the element doesn't pass.
		code: `<script setup>import Defaulted from './ui/Defaulted.vue';\nimport RuntimeDefault from './ui/RuntimeDefault.vue';</script>\n<template><Defaulted class="text-lg" /><Defaulted size="md" class="text-xl" /><RuntimeDefault class="text-2xl" /></template>`,
		filename: join(fixtureDir, 'page.vue'),
		errors: [
			restyle('text-lg', 'text-sm'),
			restyle('text-xl', 'text-base'),
			restyle('text-2xl', 'text-sm')
		]
	},
	{
		// A kebab-case attribute names its camelCase prop: static text and a
		// bound expression are read; a bare attribute, an empty binding, one
		// that can't be read and `v-bind` of an object that can't be may
		// select any value; an event leaves the default.
		code: `<script setup>import Sized from './ui/Sized.vue';</script>\n<template><Sized icon-size="sm" class="text-lg" /><Sized :icon-size="'sm'" class="text-xl" /><Sized icon-size class="text-2xl" /><Sized :icon-size="" class="text-3xl" /><Sized :icon-size="pick()" class="text-4xl" /><Sized v-bind="o" @click="f" class="text-5xl" /></template>`,
		filename: join(fixtureDir, 'page.vue'),
		errors: [
			restyle('text-lg', 'text-sm'),
			restyle('text-xl', 'text-sm'),
			restyle('text-2xl', 'text-sm'),
			restyle('text-3xl', 'text-sm'),
			restyle('text-4xl', 'text-sm'),
			restyle('text-5xl', 'text-sm')
		]
	},
	{
		// `v-bind` of an object literal passes its props; `v-model:icon-size`
		// a state that can't be read, as does a dynamic argument; a bare
		// `v-model` passes no variant.
		code: `<script setup>import Sized from './ui/Sized.vue';</script>\n<template><Sized v-bind="{ iconSize: 'md' }" class="text-lg" /><Sized v-model:icon-size="s" class="text-xl" /><Sized :[k]="x" class="text-2xl" /><Sized v-model="m" class="text-3xl" /></template>`,
		filename: join(fixtureDir, 'page.vue'),
		errors: [
			restyle('text-lg', 'text-base'),
			restyle('text-xl', 'text-sm'),
			restyle('text-2xl', 'text-sm'),
			restyle('text-3xl', 'text-base')
		]
	},
	{
		// A template reads a `defineProps()` prop by its bare name, with its
		// `withDefaults()` default; a `v-for` binding, a script binding and a
		// global read in the script are no prop, and may select any value.
		code: `<script setup>import Bare from './ui/Bare.vue';\nimport BareDefault from './ui/BareDefault.vue';\nimport Looped from './ui/Looped.vue';\nimport Picked from './ui/Picked.vue';\nimport ScriptGlobal from './ui/ScriptGlobal.vue';</script>\n<template><Bare size="lg" class="text-lg" /><Bare size="lg" class="mt-2" /><Bare class="text-xl" /><BareDefault class="mt-3" /><Looped size="sm" class="mt-4" /><Picked size="sm" class="mt-5" /><ScriptGlobal size="sm" class="mt-6" /></template>`,
		filename: join(fixtureDir, 'page.vue'),
		errors: [
			restyle('mt-2', 'mt-8'),
			restyle('text-xl', 'text-sm'),
			restyle('mt-3', 'mt-8'),
			restyle('mt-4', 'mt-8'),
			restyle('mt-5', 'mt-8'),
			restyle('mt-6', 'mt-8')
		]
	},
	{
		// A component read off a namespace import.
		code: `<script setup>import * as UI from './ui/vue-barrel.js';</script>\n<template><UI.Button class="p-4" /></template>`,
		filename: join(fixtureDir, 'page.vue'),
		errors: [restyle('p-4', 'p-2')]
	},
	{
		// A PascalCase tag, a kebab-case one, and a bound literal.
		code: `<script setup>import Button from './ui/Button.vue';\nimport MyChip from './ui/Chip.vue';\nimport Tag from './ui/Tag.vue';</script>\n<template><Button class="p-4" /><my-chip class="px-4" /><Tag :class="'m-4'" /></template>`,
		filename: join(fixtureDir, 'page.vue'),
		errors: [
			restyle('p-4', 'p-2'),
			restyle('px-4', 'px-1'),
			restyle('m-4', 'm-1')
		]
	}
];