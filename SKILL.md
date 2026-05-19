# slot-variants — AI Agent Guide

## Overview

`slot-variants` is a lightweight, zero-dependency, type-safe library for managing CSS class name variants with slots support.

```typescript
import { sv, cn, type VariantProps } from 'slot-variants';
```

`sv()` is a drop-in replacement for CVA (`cva` → `sv`) and covers the core feature set of tailwind-variants (`tv`) with a simpler API. Slots return strings directly by default, or reconfigurable functions (like in `tv`) when listed in `multiSlots`. Features not in CVA/TV: `requiredVariants`, `presets`, `cacheSize`, `postProcess`, function-based `defaultVariants`, and variadic base args.

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

### 5. Use VariantProps Type for Component Props

```typescript
type ButtonProps = VariantProps<typeof button>;
// Exclude internal variants from props:
type InternalButtonProps = VariantProps<typeof button, 'internalState'>;
```

### 6. Use Compound Variants for Conditional Combinations

Apply classes when multiple conditions are met:

```typescript
compoundVariants: [
	{ size: 'lg', intent: 'primary', class: 'font-bold uppercase' }
]
```

### 7. Use Function-Based Default Variants for Dynamic Defaults

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

### 8. Use Post-Processing with tailwind-merge

For Tailwind projects, pass `postProcess` to resolve class conflicts:

```typescript
import { twMerge } from 'tailwind-merge';

sv('px-4 py-2', { variants: { size: { lg: 'px-6 py-3' } }, postProcess: twMerge });
```

### 9. Leverage Caching for Performance

The library caches results automatically (default 256 entries). Each cache entry is one distinct combination of resolved variant values:

```
maxEntries = (values₁ + 1) × (values₂ + 1) × ... × (valuesₙ + 1)
```

The `+ 1` counts the variant being left unset. Raise `cacheSize` only when `maxEntries` exceeds 256 — below that the cache never evicts. Cache inspection methods (`getCacheSize`, `clearCache`) are only exposed when `introspection: true`.

### 10. Use Presets for Reusable Variant Combinations

```typescript
const button = sv('btn', {
	variants: { size: { sm: 'text-sm', lg: 'text-lg' }, intent: { primary: 'bg-blue-500', danger: 'bg-red-500' } },
	presets: { cta: { size: 'lg', intent: 'primary' } }
});

button({ preset: 'cta' }); // applies size: 'lg', intent: 'primary'
```

### 11. Use Introspection for Single Source of Truth

Set `introspection: true` to expose configuration and cache members on the returned function (off by default): `variantKeys`, `variants`, `slotKeys`, `slots`, `defaultVariants`, `requiredVariants`, `presetKeys`, `presets`, `getVariantValues(key)`, `getCacheSize()`, and `clearCache()`.

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

## Configuration Reference

Class values inside the config (`base`, `variants` values, `slots` values, and `compound*` `class`/`className`) accept only `string`, `string[]`, or `undefined`. Dynamic class values (objects, booleans, nested arrays) belong on the `class`/`className` runtime prop, not in the config.

| Option             | Type                                 | Description                       |
| ------------------ | ------------------------------------ | --------------------------------- |
| `base`             | `string \| string[]`                 | Additional base classes           |
| `variants`         | `Record<string, VariantConfig>`      | Variant definitions               |
| `slots`            | `Record<string, string \| string[]>` | Named slot definitions            |
| `compoundVariants` | `CompoundVariant[]`                  | Conditional class combinations    |
| `compoundSlots`    | `CompoundSlot[]`                     | Multi-slot conditional classes    |
| `defaultVariants`  | `Record<string, Value>`              | Static or function-based defaults |
| `requiredVariants` | `string[] \| boolean`                | Mandatory variant names           |
| `multiSlots`       | `string[] \| boolean`                | Slots exposed as reconfigurable functions |
| `presets`          | `Record<string, Partial<Props>>`     | Named preset combinations         |
| `postProcess`      | `(className: string) => string`      | Class transformation              |
| `cacheSize`        | `number`                             | Cache size (default: 256)         |
| `introspection`    | `boolean`                            | Expose introspection and cache methods (default: false) |

## Exported Types

- `ClassValue` — Valid input for `cn()` (string, array, object, boolean, null, undefined)
- `VariantProps<T, E>` — Extract variant props from an `sv()` return, optionally excluding keys
- `VariantValue<T, K>` — Extract the value union for a single variant key, without `undefined`
- `SlotClassProps<T>` — Extract the per-slot class injection shape from an `sv()` return type

Functions are imported as named values; types via `import type { ... } from 'slot-variants'`.