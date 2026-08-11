# slot-variants — AI Agent Guide

## Overview

`slot-variants` is a lightweight, zero-dependency, type-safe library for managing CSS class name variants with slots support.

```typescript
import { sv, cn, type VariantProps } from 'slot-variants';
```

`sv()` is a drop-in replacement for CVA (`cva` → `sv`) and covers the core feature set of tailwind-variants (`tv`) with a simpler API. Slots return strings directly by default, or reconfigurable functions (like in `tv`) when listed in `multiSlots`. Features not in CVA/TV: `requiredVariants`, `presets`, `cacheSize`, `postProcess`, function-based `defaultVariants`, variadic base args, and `null`-to-unset variant props.

Without `slots`, the returned function returns a `string`. With `slots`, it returns a `Record<string, string>` keyed by `base` plus each slot name (or a function for slots in `multiSlots`).

## Calling Conventions

`sv()` supports three calling conventions:

```typescript
// 1. Config-only
sv({ base: 'btn', variants: { size: { sm: 'text-sm', lg: 'text-lg' } } });

// 2. Base + config
sv('btn', { variants: { size: { sm: 'text-sm', lg: 'text-lg' } } });

// 3. Class name merging (like cn())
sv('flex', 'items-center', 'gap-2'); // 'flex items-center gap-2'
```

The `base` config field merges with base arguments and `slots.base`: `cn(baseArgs..., config.base, slots.base)`.

## Best Practices

### 1. Keep CSS Classes Mutually Exclusive

Define classes in base and variants so they don't overlap; use compound variants for intersecting classes. Don't repeat a token across every variant value — lift it into `base`.

### 2. Use Boolean Shorthand for Simple States

For boolean variants (on/off), use shorthand instead of a verbose `{ true, false }` record:

```typescript
const button = sv('btn', {
	variants: { disabled: 'opacity-50 cursor-not-allowed' }
});

button({ disabled: true });
```

### 3. Use Required Variants for Mandatory Props

List a variant in `requiredVariants: ['intent']` to make it mandatory — `button()` throws when it is missing.

### 4. Use Slots for Multi-Element Components

For components with multiple elements (card, dialog, etc.), use slots:

```typescript
const card = sv('border rounded-lg', {
	slots: { header: 'font-semibold px-4', body: 'px-4 py-4', footer: 'px-4 border-t' }
});

const { base, header, body, footer } = card();
```

Variant values can target slots: `size: { sm: { base: 'p-2', header: 'text-sm' } }`. Use `compoundSlots` to apply classes to multiple slots at once.

### 5. Use Groups to Name a Set of Slots

Declare `groups` to give a set of slots one name, then use that name anywhere a slot name is accepted — variant and compound variant class objects, `compoundSlots`, `multiSlots`, and the runtime `class`/`className` prop:

```typescript
const card = sv('border', {
	slots: { header: 'font-bold', body: 'py-4', footer: 'text-xs' },
	groups: { content: ['header', 'body'] },
	variants: { size: { sm: { content: 'text-sm' }, lg: { content: 'text-lg', footer: 'text-sm' } } }
});

card({ size: 'lg' }); // header and body both get 'text-lg'
```

Groups never become keys of the result — it always holds `base` plus each declared slot. When one object names both a group and one of its slots, the group's classes apply first, so the slot-specific value wins under `tailwind-merge` regardless of key order. A group lists slot names only (it cannot name another group), must be non-empty, and its name must not match a slot name (including `base`).

### 6. Use Multi Slots for Repeated Renders

List a slot in `multiSlots` to get a reconfigurable function instead of a plain string — for a slot rendered multiple times with different props (e.g. list items), so it can be re-evaluated per use without recreating the whole variant function:

```typescript
const card = sv('border', {
	slots: { header: 'font-bold', body: 'py-4' },
	variants: { size: { sm: { header: 'text-sm' }, lg: { header: 'text-lg' } } },
	multiSlots: ['header']
});

const { header } = card({ size: 'sm' });
header();                  // 'font-bold text-sm'
header({ size: 'lg' });    // 'font-bold text-lg' — override per instance
header({ class: 'mt-2' }); // 'font-bold text-sm mt-2'
```

Pass `true` to make every slot a function, `false` (default) to keep them all strings.

A slot function also accepts `preset` when the config declares `presets`. It inherits the outer call's preset, and its own `preset` wins.

### 7. Use VariantProps Type for Component Props

```typescript
type ButtonProps = VariantProps<typeof button>;
// Exclude internal variants from props:
type InternalButtonProps = VariantProps<typeof button, 'internalState'>;
```

### 8. Use Compound Variants for Conditional Combinations

Apply classes when multiple conditions are met. A matcher value can be an array for OR matching, and multiple compound entries can match simultaneously:

```typescript
compoundVariants: [
	{ size: 'lg', intent: 'primary', class: 'font-bold uppercase' },
	{ intent: ['primary', 'secondary'], size: 'sm', class: 'tracking-tight' }
]
```

A `preset` name may stand in for the variant values it holds, in `compoundVariants` and `compoundSlots` alike. It expands when the config is evaluated, so the entry matches those values however they were reached; a matcher written alongside it overrides the value it contributes:

```typescript
presets: { cta: { size: 'lg', intent: 'primary' } },
compoundVariants: [
	{ preset: 'cta', class: 'font-bold uppercase' },
	{ preset: 'cta', size: 'sm', class: 'tracking-tight' } // intent: 'primary', size: 'sm'
]
```

### 9. Use Function-Based Default Variants for Dynamic Defaults

A default can be a function of the other variant values:

```typescript
defaultVariants: {
	size: 'sm',
	intent: (props) => {
		if (props.size === 'lg') return 'danger';
		return 'primary';
	}
}
```

Prefer static defaults — function-based defaults run on every invocation.

### 10. Use Post-Processing with tailwind-merge

For Tailwind projects, pass `postProcess` to resolve class conflicts:

```typescript
import { twMerge } from 'tailwind-merge';

sv('px-4 py-2', { variants: { size: { lg: 'px-6 py-3' } }, postProcess: twMerge });
```

To avoid restating `postProcess` (or any config default) per component, wrap `sv` once with `createSV`. Defaults are shallow merged into every config-based call and a per-call value always wins:

```typescript
import { createSV } from 'slot-variants';
import { twMerge } from 'tailwind-merge';

const customSV = createSV({ postProcess: twMerge, cacheSize: 512 });
```

### 11. Leverage Caching for Performance

The library caches results automatically (default 256 entries). Each cache entry is one distinct combination of resolved variant values:

```
maxEntries = factor₁ × factor₂ × ... × factorₙ
```

A variant's factor is its value count `+ 1` (the `+ 1` counts the variant being left unset). The `+ 1` is dropped — factor is just the value count — when the variant is required or has a static default, since it can never be unset. Function-based defaults still count as unset-able, so they keep the `+ 1`. Raise `cacheSize` only when `maxEntries` exceeds 256 — below that the cache never evicts. With `introspection: true`, `getMaxEntries()` returns this exact number, and `getCacheSize()`/`clearCache()` inspect the live cache.

### 12. Use Presets for Reusable Variant Combinations

```typescript
const button = sv('btn', {
	variants: { size: { sm: 'text-sm', lg: 'text-lg' }, intent: { primary: 'bg-blue-500', danger: 'bg-red-500' } },
	presets: { cta: { size: 'lg', intent: 'primary' } }
});

button({ preset: 'cta' }); // applies size: 'lg', intent: 'primary'
```

A preset name must not match a variant name — TypeScript rejects it and the config throws. A preset name can also be used as a compound matcher, see above.

### 13. Pass `null` to Explicitly Opt Out of a Defaulted Variant

`undefined` (an omitted prop) falls back to `defaultVariants`/`preset`; `null` skips that resolution entirely, so no classes for that variant are applied:

```typescript
button({ size: undefined }); // falls back to the default/preset size
button({ size: null });      // no size classes at all, default and preset skipped
```

### 14. Use Introspection for Single Source of Truth

Set `introspection: true` to expose configuration and cache members on the returned function (off by default): `variantKeys`, `variants`, `slotKeys`, `slots`, `groupKeys`, `groups`, `defaultVariants`, `requiredVariants`, `multiSlots`, `presetKeys`, `presets`, `getVariantValues(key)`, `getMaxEntries()`, `getCacheSize()`, and `clearCache()`.

Without `introspection: true`, accessing these is a type error. Use it to centralize variant/slot definitions and reuse them across the codebase.

## Common Patterns

### React Component Pattern

```typescript
import { sv, type VariantProps } from 'slot-variants';

const button = sv('btn font-medium rounded-lg', {
	variants: {
		size: { sm: 'text-sm px-3', md: 'text-base px-4', lg: 'text-lg px-6' },
		intent: { primary: 'bg-blue-500 text-white', danger: 'bg-red-500 text-white' }
	},
	defaultVariants: { size: 'md', intent: 'primary' }
});

export type ButtonProps = VariantProps<typeof button>;

export const Button = ({ class: className, ...props }: ButtonProps & { class?: string }) => {
	return <button className={button({ ...props, class: className })} />;
};
```

### Multi-Element Component Pattern

```typescript
const card = sv('border rounded-lg', {
	slots: { header: 'font-semibold px-4 border-b', body: 'px-4 py-4', footer: 'px-4 border-t' },
	variants: {
		size: { sm: { base: 'p-2', header: 'text-sm' }, md: { base: 'p-4', header: 'text-base' } },
		elevated: { true: { base: 'shadow-lg' }, false: { base: 'shadow-sm' } }
	},
	compoundSlots: [{ slots: ['header', 'footer'], class: 'text-gray-600' }]
});

const { base, header, body, footer } = card({ size: 'md' });
```

## Framework Usage

`sv()` has no framework dependency — it's a plain function returning a class string (or per-slot object). React needs no wrapper; frameworks with a different reactivity model need one so the result stays in sync with reactive state:

- **React**: call directly during render.
- **Solid**: component bodies run once — wrap in `createMemo(() => card({ ... }))`, or call inline inside JSX so Solid tracks the prop access.
- **Svelte**: `const classes = $derived(card({ ... }))`.
- **Vue**: `const classes = computed(() => card({ ... }))`.

With slots, wrap the whole call once (one memo/computed/derived) and read individual slot classes off the result — never call `sv()` per slot:

```tsx
// Solid, with slots: { header: '...', body: '...' }
const classes = createMemo(() => card({ tone: props.tone, class: props.class }));
// classes().base, classes().header, classes().body
```

A `multiSlots` function is called per rendered item, still reading off the same wrapped result:

- **React**: `list().item({ active: item.id === activeId })`.
- **Solid**: `classes().item({ active: item.id === props.activeId })` where `classes = createMemo(() => list())`.
- **Svelte**: `classes.item({ active: item.id === activeId })` where `classes = $derived(list())`.
- **Vue**: `classes.item({ active: item.id === activeId })` where `classes = computed(() => list())`.

## Configuration Reference

Class values inside the config (`base`, `variants` values, `slots` values, and `compound*` `class`/`className`) accept only `string`, `string[]`, or `undefined`, where `undefined` applies no classes, the same as an empty string. Dynamic class values (objects, booleans, nested arrays) belong on the `class`/`className` runtime prop, not in the config. Variant keys are strings or numbers (`level: { 1: 'text-4xl' }`), plus `true`/`false` for boolean variants.

| Option             | Type                                 | Description                       |
| ------------------ | ------------------------------------ | --------------------------------- |
| `base`             | `string \| string[]`                 | Additional base classes           |
| `variants`         | `Record<string, VariantConfig>`      | Variant definitions               |
| `slots`            | `Record<string, string \| string[]>` | Named slot definitions            |
| `groups`           | `Record<string, string[]>`           | Named sets of slot names          |
| `compoundVariants` | `CompoundVariant[]`                  | Conditional class combinations    |
| `compoundSlots`    | `CompoundSlot[]`                     | Multi-slot conditional classes    |
| `defaultVariants`  | `Record<string, Value>`              | Static or function-based defaults |
| `requiredVariants` | `string[] \| boolean`                | Mandatory variant names           |
| `multiSlots`       | `string[] \| boolean`                | Slots exposed as reconfigurable functions |
| `presets`          | `Record<string, Partial<Props>>`     | Named preset combinations         |
| `postProcess`      | `(className: string) => string`      | Class transformation              |
| `cacheSize`        | `number`                             | Cache size (default: 256)         |
| `introspection`    | `boolean`                            | Expose introspection and cache methods (default: false) |

## Errors & Validation

`sv()` throws on misconfiguration. Config errors (unknown variant referenced by `requiredVariants`/`defaultVariants`/a preset/a compound entry, an invalid default/preset/compound value, a preset sharing a name with a variant, an unknown preset named by a compound entry, a group sharing a name with a slot or naming an unknown/no slot, a compound entry missing `class`/`className`) throw when the config is evaluated. Runtime errors (missing required variant, invalid variant value, unknown preset name) throw when the variant function is called with bad props. Treat a thrown error as expected validation, not a library bug — fix the config or the calling props.

## Linting

`slot-variants/eslint-plugin` (ESLint v9+ flat config, or oxlint via `jsPlugins`) catches issues in `sv()`/`cn()` calls before runtime: conflicting/duplicate classes, non-static (dynamic) class values, empty classes, non-canonical whitespace, tokens repeated across every variant value that belong in `base` instead, and `sv()` config objects built outside module scope. If a project has this plugin enabled, prefer static, deduplicated class strings and module-level `sv()` calls so generated code doesn't trip these rules.

## Exported Types

- `ClassValue` — Valid input for `cn()` (string, number, bigint, array, object, boolean, null, undefined)
- `VariantProps<T, E>` — Extract variant props from an `sv()` return, optionally excluding keys
- `VariantValue<T, K>` — Extract the value union for a single variant key, without `undefined`
- `SlotClassProps<T>` — Extract the per-slot class injection shape from an `sv()` return type
- `SV<D>` — The shape of an `sv()` function (the return type of `createSV()`), carrying the factory's introspection default `D`

Functions are imported as named values; types via `import type { ... } from 'slot-variants'`.