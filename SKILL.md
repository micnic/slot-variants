# slot-variants — AI Agent Guide

## Overview

`slot-variants` is a lightweight, zero-dependency, type-safe library for managing class name variants with slots support. It exports three functions — `sv()` (variant-based class name generators with optional slots), `cn()` (conditional class name merging), and `createSV()` (a pre-configured `sv()` with shared config defaults) — plus an ESLint/oxlint plugin at the `slot-variants/eslint-plugin` subpath.

```typescript
import { cn, createSV, sv, type VariantProps } from 'slot-variants';
```

`sv()` is a drop-in replacement for CVA (`cva` → `sv`) and covers the core feature set of tailwind-variants (`tv`) with a simpler API. Slots return strings directly by default, or reconfigurable functions (like in `tv`) when listed in `multiSlots`. Features not in CVA/TV: `requiredVariants`, `presets`, `groups`, `cacheSize`, `introspection`, `postProcess`, function-based `defaultVariants`, variadic base args, and `null`-to-unset variant props. `tailwind-merge` is opt-in via `postProcess` rather than always on. `extend` builds on other `sv()` components like `tv`'s: classes are appended after the parent's (never replaced), so add `postProcess: twMerge` when a child must override parent classes.

Without `slots`, the returned function returns a `string` (or `{ base }` with a `base` function when `multiSlots` is `true` or lists `base`). With `slots`, it returns a `Record<string, string>` keyed by `base` plus each slot name (or a function for slots in `multiSlots`).

## Calling Conventions

`sv()` supports three calling conventions:

```typescript
// 1. Class name merging (no config, like cn())
sv('flex', 'items-center', 'gap-2'); // 'flex items-center gap-2'

// 2. Config-only
sv({ base: 'btn', variants: { size: { sm: 'text-sm', lg: 'text-lg' } } });

// 3. Base + config
sv('btn', { variants: { size: { sm: 'text-sm', lg: 'text-lg' } } });
```

The last argument is a config only when it defines `slots` or `variants`; otherwise it's a class value. A component with neither (only `base`, `extend`, `postProcess`, …) declares `variants: {}`.

Base classes can come from all three places at once, and they are applied in this order: the leading class arguments, then the `base` config field, then `slots.base`.

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

Shorthand is a class value only. To target slots, put the slot object under a `true` key: `highlighted: { true: { base: 'ring-2', header: 'bg-blue-100' } }`.

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

Groups never appear in the result. A group lists existing slots (not other groups), and its name can't match a slot name. Don't name both a group and one of its slots in the same slot object.

### 6. Use Multi Slots for Repeated Renders

List a slot in `multiSlots` to get a reconfigurable function instead of a plain string — for a slot rendered multiple times with different props (e.g. list items), so each occurrence can pass its own variant values:

```typescript
const card = sv('border', {
  slots: { header: 'font-bold', body: 'py-4' },
  multiSlots: ['header'],
  variants: { size: { sm: { header: 'text-sm' }, lg: { header: 'text-lg' } } }
});

const { header } = card({ size: 'sm' });
header();                  // 'font-bold text-sm'
header({ size: 'lg' });    // 'font-bold text-lg' — override per instance
header({ class: 'mt-2' }); // 'font-bold text-sm mt-2'
```

Pass `true` to make every slot a function. A slot function also accepts `preset`; it inherits the outer call's preset, and its own wins.

### 7. Use the Runtime `class` Prop for Call-Site Overrides

Append call-site classes with `class` (or `className` — one or the other: passing both is a type error). This is the only place dynamic class values — objects, booleans, nested arrays — are accepted:

```typescript
button({ size: 'sm', class: 'mt-4' });
button({ size: 'sm', class: { 'mt-4': true, hidden: false } });
```

With slots, a string targets the `base` slot; use an object to target specific slots (or [groups](#5-use-groups-to-name-a-set-of-slots)):

```typescript
card({ class: { base: 'shadow-xl', header: 'text-blue-700' } });
```

`SlotClassProps<typeof card>` is the type of that object — use it for a wrapper component's `classNames` prop.

### 8. Use VariantProps Type for Component Props

```typescript
type ButtonProps = VariantProps<typeof button>;
// Exclude internal variants from props:
type InternalButtonProps = VariantProps<typeof button, 'internalState'>;
```

### 9. Use Compound Variants for Conditional Combinations

Apply classes when multiple conditions are met. A matcher value can be an array for OR matching, and multiple compound entries can match simultaneously:

```typescript
compoundVariants: [
  { size: 'lg', intent: 'primary', class: 'font-bold uppercase' },
  { intent: ['primary', 'secondary'], size: 'sm', class: 'tracking-tight' }
]
```

A `preset` name can stand in for its variant values in `compoundVariants` and `compoundSlots`. The entry matches those values whether or not the preset was passed, and conditions written alongside it override its values:

```typescript
presets: { cta: { size: 'lg', intent: 'primary' } },
compoundVariants: [
  { preset: 'cta', class: 'font-bold uppercase' },
  { preset: 'cta', size: 'sm', class: 'tracking-tight' } // intent: 'primary', size: 'sm'
]
```

### 10. Use Function-Based Default Variants for Dynamic Defaults

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

The function receives the call's props (including preset values), not other defaults. Prefer static defaults when possible.

### 11. Use Post-Processing with tailwind-merge

For Tailwind projects, pass `postProcess` to resolve class conflicts:

```typescript
import { twMerge } from 'tailwind-merge';

sv('px-4 py-2', { variants: { size: { lg: 'px-6 py-3' } }, postProcess: twMerge });
```

To avoid restating `postProcess` per component, wrap `sv` once with `createSV`. Defaults accept only `base`, `cacheSize`, `postProcess`, `introspection`, and boolean `requiredVariants`/`multiSlots`; a per-call value always wins:

```typescript
import { createSV } from 'slot-variants';
import { twMerge } from 'tailwind-merge';

const customSV = createSV({ cacheSize: 512, postProcess: twMerge });
```

### 12. Leverage Caching for Performance

Results are cached automatically (default 256 entries). Leave `cacheSize` alone unless a component has more variant combinations than that — `getMaxEntries()` (with `introspection: true`) reports the count. `cacheSize: 0` disables caching.

### 13. Use Presets for Reusable Variant Combinations

```typescript
const button = sv('btn', {
  variants: { size: { sm: 'text-sm', lg: 'text-lg' }, intent: { primary: 'bg-blue-500', danger: 'bg-red-500' } },
  presets: { cta: { size: 'lg', intent: 'primary' } }
});

button({ preset: 'cta' }); // applies size: 'lg', intent: 'primary'
```

A preset name must not match a variant name.

### 14. Pass `null` to Explicitly Opt Out of a Defaulted Variant

`undefined` (an omitted prop) falls back to `defaultVariants`/`preset`; `null` skips that resolution entirely, so no classes for that variant are applied:

```typescript
button({ size: undefined }); // falls back to the default/preset size
button({ size: null });      // no size classes at all, default and preset skipped
```

### 15. Use Introspection for Single Source of Truth

Set `introspection: true` to expose configuration and cache members on the returned function (off by default): `base` (merged base classes), `variantKeys`, `variants`, `slotKeys`, `slots`, `groupKeys`, `groups`, `defaultVariants`, `requiredVariants`, `multiSlots`, `presetKeys`, `presets`, `compoundVariants`, `compoundSlots`, `getVariantValues(key)`, `splitProps(props)`, `explain(props)`, `getMaxEntries()`, `getCacheSize()`, and `clearCache()`. `splitProps(props)` returns `[variantProps, restProps]`, so the rest can be forwarded to an element. `explain(props)` reports where each class of that call comes from (variant values and their source, then per slot: base, variant, compound and `class` classes, the result before/after `postProcess`, and the classes it dropped) — use it to debug a missing or unexpected class.

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

## Config Reference

Class values inside the config accept only `string`, `string[]`, or `undefined`. Dynamic class values (objects, booleans, nested arrays) belong on the `class`/`className` runtime prop, not in the config. Variant keys are strings or numbers (`level: { 1: 'text-4xl' }`), plus `true`/`false` for boolean variants.

The table lists the options in the canonical key order enforced by the opt-in `sv-config-style` lint rule.

| Option             | Type                                 | Description                                                                                 |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `extend`           | `sv()` component or array of them    | Components to build on; their config is merged in first, classes appended after theirs      |
| `base`             | `string \| string[]`                 | Additional base classes                                                                     |
| `slots`            | `Record<string, string \| string[]>` | Named slot definitions                                                                      |
| `groups`           | `Record<string, string[]>`           | Named sets of slot names                                                                    |
| `multiSlots`       | `string[] \| boolean`                | Slots exposed as reconfigurable functions; `true` makes every slot a function, `false` none |
| `variants`         | `Record<string, VariantConfig>`      | Variant definitions                                                                         |
| `presets`          | `Record<string, Partial<Props>>`     | Named preset combinations                                                                   |
| `compoundSlots`    | `CompoundSlot[]`                     | Multi-slot conditional classes                                                              |
| `compoundVariants` | `CompoundVariant[]`                  | Conditional class combinations                                                              |
| `defaultVariants`  | `Record<string, Value>`              | Static or function-based defaults                                                           |
| `requiredVariants` | `string[] \| boolean`                | Mandatory variant names; `true` makes every variant required, `false` none                  |
| `cacheSize`        | `number`                             | Maximum number of cached results (default: `256`); `0` or a negative value disables caching |
| `introspection`    | `boolean`                            | Expose introspection and cache methods (default: `false`)                                   |
| `postProcess`      | `(className: string) => string`      | Class transformation                                                                        |

## Errors & Validation

`sv()` throws for an invalid config (unknown variant, value, slot or preset name; a reserved variant name like `class`/`className`/`preset`/`slots`; a preset or group named after a variant or slot) when it is defined, and for invalid props (missing required variant, unknown value or preset) when the variant function is called. Treat a thrown error as expected validation, not a library bug — fix the config or the calling props.

## Linting

`slot-variants/eslint-plugin` (ESLint v9+ flat config, or oxlint via `jsPlugins`) catches issues in `sv()`/`cn()` calls before runtime: conflicting/duplicate classes, non-static (dynamic) class values, empty classes, non-canonical whitespace, tokens repeated across every variant value that belong in `base` instead, `sv()` calls with a config object placed outside module scope, and class names passed to a component or element that conflict with the classes its config already applies (JSX, Svelte and Vue class attributes included). If a project has this plugin enabled, prefer static, deduplicated class strings and module-level `sv()` calls so generated code doesn't trip these rules.

An opt-in `sv-config-style` rule additionally enforces a canonical config key order — `extend`, `base`, `slots`, `groups`, `multiSlots`, `variants`, `presets`, `compoundSlots`, `compoundVariants`, `defaultVariants`, `requiredVariants`, `cacheSize`, `introspection`, `postProcess` — and a single way of expressing base classes. Follow that order when writing configs; it is a safe default whether or not the rule is enabled.

## Exported Types

| Type                 | Description                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ClassValue`         | Valid input types for `cn()` — string, array, object, boolean, number, bigint, `null`, `undefined`                                                                     |
| `VariantProps<T, E>` | Extracts variant props from an `sv()` return type, optionally excluding keys in `E`                                                                                    |
| `VariantValue<T, K>` | Extracts the value union for a single variant key `K`, without `undefined`                                                                                             |
| `SlotClassProps<T>`  | Extracts the per-slot class injection shape from an `sv()` return type                                                                                                 |
| `SV<D, DR, DM>`      | The shape of an `sv()` function, with the factory's `introspection` (`D`), `requiredVariants` (`DR`) and `multiSlots` (`DM`) defaults; the return type of `createSV()` |

Functions are imported as named values; types via `import type { ... } from 'slot-variants'`.