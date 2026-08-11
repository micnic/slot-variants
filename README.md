# slot-variants

<img src="logo.svg" alt="slot-variants logo" width="200" />

A lightweight, zero-dependency, type-safe library for managing class name variants with slots support.

## Installation

```bash
npm install slot-variants
```

## Overview

`slot-variants` exports three functions:

- **`sv()`** - creates variant-based class name generators with optional slots
- **`cn()`** - a utility for conditionally merging class names
- **`createSV()`** - builds a pre-configured `sv()` with shared config defaults

`sv()` is a drop-in replacement for [CVA](https://cva.style/) (just rename `cva` to `sv`) and covers the core feature set of [tailwind-variants](https://www.tailwind-variants.org/) (`tv`) with a simpler API. See [Migrating from CVA / tailwind-variants](#migrating-from-cva--tailwind-variants) for details.

## Why slot-variants

Compared to CVA and tailwind-variants, `sv()` adds required variants, shared variant presets, and a built-in result cache, while staying dependency-free and noticeably faster at runtime — see the benchmarks in [`bench/`](bench) if you want the numbers. `tailwind-merge` integration is opt-in (via `postProcess`) rather than always on, and the bundled ESLint / oxlint plugin catches class conflicts and duplication at lint time.

## Quick Start

```typescript
import { sv } from 'slot-variants';

const button = sv('btn font-medium rounded-lg', {
  variants: {
    size: {
      sm: 'text-sm py-1 px-2',
      md: 'text-base py-2 px-4',
      lg: 'text-lg py-3 px-6'
    },
    intent: {
      primary: 'bg-blue-500 text-white',
      secondary: 'bg-gray-200 text-gray-800',
      danger: 'bg-red-500 text-white'
    }
  },
  defaultVariants: {
    size: 'md',
    intent: 'primary'
  }
});

button();
// 'btn font-medium rounded-lg text-base py-2 px-4 bg-blue-500 text-white'

button({ size: 'lg', intent: 'danger' });
// 'btn font-medium rounded-lg text-lg py-3 px-6 bg-red-500 text-white'
```

## `cn()` - Class Name Utility

A utility for conditionally joining class names together.

```typescript
import { cn } from 'slot-variants';

// Strings
cn('foo', 'bar');                             // 'foo bar'

// Arrays (including nested)
cn(['foo', 'bar']);                           // 'foo bar'
cn(['foo', ['bar', 'baz']]);                  // 'foo bar baz'

// Objects (truthy values are included)
cn({ foo: true, bar: false, baz: true });     // 'foo baz'

// Mixed
cn('base', ['responsive'], { active: true }); // 'base responsive active'

// Falsy values are filtered out
cn('foo', null, undefined, false, 'bar');     // 'foo bar'
```

`cn()` accepts strings, arrays (including nested), and objects (keys with truthy values are included). Booleans, numbers, bigints, `null`, and `undefined` are ignored.

## `sv()` - Slot Variants

`sv()` supports three calling conventions:

### Class Name Merging (No Config)

When called without a config object, `sv()` works like `cn()` — it accepts any number of class values and returns a merged class string:

```typescript
sv('btn btn-primary');                       // 'btn btn-primary'
sv('flex', 'items-center', 'gap-2');         // 'flex items-center gap-2'
sv(['btn', 'btn-primary']);                  // 'btn btn-primary'
sv({ btn: true, disabled: false });          // 'btn'
sv('flex', ['items-center'], { gap: true }); // 'flex items-center gap'
```

### Config-Only Call

When called with a single config object (no separate base argument), `sv()` returns a variant function. Use the `base` field inside the config:

```typescript
const button = sv({
  base: 'btn font-medium',
  variants: {
    size: {
      sm: 'text-sm',
      lg: 'text-lg'
    }
  }
});

button({ size: 'sm' }); // 'btn font-medium text-sm'
```

### Base + Config Call

When the last argument is a config object preceded by one or more class values, the leading arguments are merged as the base. A `base` field inside the config is merged on top of them:

```typescript
const button = sv('btn', {
  base: 'font-medium',
  variants: {
    size: {
      sm: 'text-sm',
      lg: 'text-lg'
    }
  }
});

button({ size: 'sm' }); // 'btn font-medium text-sm'
```

### Variants

When a config object is provided, `sv()` returns a function that accepts variant props and returns the computed class string.

```typescript
const badge = sv('badge', {
  variants: {
    color: {
      gray: 'bg-gray-100 text-gray-800',
      red: 'bg-red-100 text-red-800',
      green: 'bg-green-100 text-green-800'
    },
    size: {
      sm: 'text-xs px-2 py-0.5',
      lg: 'text-base px-3 py-1'
    }
  }
});

badge({ color: 'green', size: 'sm' });
// 'badge bg-green-100 text-green-800 text-xs px-2 py-0.5'
```

Variant values accept a string or an array of strings:

```typescript
const button = sv('btn', {
  variants: {
    size: {
      sm: ['px-2', 'py-1', 'text-sm'], // array of strings
      lg: 'px-6 py-3 text-lg'          // string
    }
  }
});
```

### Boolean Variants

Variants with `true`/`false` keys accept boolean prop values:

```typescript
const input = sv('input border', {
  variants: {
    disabled: {
      true: 'opacity-50 cursor-not-allowed',
      false: 'cursor-text'
    },
    error: {
      true: 'border-red-500',
      false: 'border-gray-300'
    }
  },
  defaultVariants: {
    disabled: false,
    error: false
  }
});

input({ disabled: true, error: true });
// 'input border opacity-50 cursor-not-allowed border-red-500'
```

**Boolean shorthand** - provide a class value directly instead of a `true`/`false` record. The value is applied when `true`, and nothing is applied when `false`:

```typescript
const button = sv('btn', {
  variants: {
    loading: 'animate-spin pointer-events-none',
    disabled: 'opacity-50 cursor-not-allowed'
  }
});

button({ loading: true, disabled: false });
// 'btn animate-spin pointer-events-none'
```

### Numeric Variant Keys

Variant keys can be numbers:

```typescript
const heading = sv('font-bold', {
  variants: {
    level: {
      1: 'text-4xl',
      2: 'text-3xl',
      3: 'text-2xl'
    }
  }
});

heading({ level: 1 }); // 'font-bold text-4xl'
```

### Default Variants

Set fallback values that are used when a variant prop is not provided:

```typescript
const button = sv('btn', {
  variants: {
    size: {
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg'
    },
    rounded: {
      true: 'rounded-full',
      false: 'rounded-md'
    }
  },
  defaultVariants: {
    size: 'md',
    rounded: false
  }
});

button();                   // 'btn text-base rounded-md'
button({ size: 'lg' });     // 'btn text-lg rounded-md'
button({ rounded: true });  // 'btn text-base rounded-full'
```

Passing `undefined` for a prop falls back to the default. Passing `null` instead explicitly opts out of the variant — its default (and any [preset](#presets) value) is skipped entirely, so no classes for that variant are applied:

```typescript
button({ size: undefined }); // 'btn text-base rounded-md' — falls back to default
button({ size: null });      // 'btn rounded-md' (no size classes at all)
```

Default variants can also be functions that receive the current props and return a value dynamically. Return `undefined` to skip the variant entirely:

```typescript
const button = sv('btn', {
  variants: {
    size: {
      sm: 'text-sm',
      lg: 'text-lg'
    },
    intent: {
      primary: 'bg-blue-500',
      danger: 'bg-red-500'
    }
  },
  defaultVariants: {
    size: 'sm',
    intent: (props) => (props.size === 'lg' ? 'danger' : 'primary')
  }
});

button();               // 'btn text-sm bg-blue-500'
button({ size: 'lg' }); // 'btn text-lg bg-red-500'
```

### Compound Variants

Apply additional classes when multiple variant conditions are met simultaneously:

```typescript
const button = sv('btn', {
  variants: {
    intent: {
      primary: 'bg-blue-500',
      secondary: 'bg-gray-200'
    },
    size: {
      sm: 'text-sm',
      lg: 'text-lg'
    }
  },
  compoundVariants: [
    {
      intent: 'primary',
      size: 'lg',
      class: 'uppercase font-bold'
    }
  ]
});

button({ intent: 'primary', size: 'lg' });
// 'btn bg-blue-500 text-lg uppercase font-bold'

button({ intent: 'secondary', size: 'lg' });
// 'btn bg-gray-200 text-lg'
```

Conditions support **array matching** (OR logic), and multiple compound entries can match simultaneously — all matching classes are applied:

```typescript
compoundVariants: [
  {
    intent: ['primary', 'secondary'],
    size: 'sm',
    class: 'tracking-tight'
  }
]
```

`className` is accepted as an alternative to `class`.

When the config declares [presets](#presets), a compound entry can name one instead of restating the variant values it stands for:

```typescript
const button = sv('btn', {
  variants: {
    intent: {
      primary: 'bg-blue-500',
      secondary: 'bg-gray-200'
    },
    size: {
      sm: 'text-sm',
      lg: 'text-lg'
    }
  },
  presets: {
    cta: { intent: 'primary', size: 'lg' }
  },
  compoundVariants: [
    {
      preset: 'cta',
      class: 'uppercase font-bold'
    }
  ]
});

button({ preset: 'cta' });
// 'btn bg-blue-500 text-lg uppercase font-bold'

button({ intent: 'primary', size: 'lg' });
// 'btn bg-blue-500 text-lg uppercase font-bold'
```

The name expands to the preset's variant values when the config is evaluated, so the entry matches those values however they were reached — passing the preset is not required. Conditions written alongside `preset` override the values it contributes, mirroring how an explicit prop overrides a preset value at call time:

```typescript
compoundVariants: [
  {
    preset: 'cta',
    size: 'sm',
    class: 'tracking-tight'
  }
]
// matches intent: 'primary' with size: 'sm'
```

An unknown preset name is rejected by TypeScript and throws when the config is evaluated.

### Required Variants

Mark variants as required so they must be provided at call time. Required variants cannot have default values:

```typescript
const button = sv('btn', {
  variants: {
    size: {
      sm: 'text-sm',
      lg: 'text-lg'
    },
    intent: {
      primary: 'bg-blue-500',
      danger: 'bg-red-500'
    }
  },
  requiredVariants: ['intent']
});

button({ intent: 'primary' });              // OK
button({ intent: 'primary', size: 'lg' });  // OK
button({ size: 'lg' });                     // Throws: Missing required variant: "intent"
```

Pass `true` to make every variant required, or `false` to require none.

### Presets

Presets are predefined named combinations of variant values. Use them to create reusable variant shortcuts:

```typescript
const button = sv('btn', {
  variants: {
    size: {
      sm: 'text-sm',
      lg: 'text-lg'
    },
    intent: {
      primary: 'bg-blue-500',
      danger: 'bg-red-500'
    },
    rounded: {
      true: 'rounded-full',
      false: 'rounded-md'
    }
  },
  presets: {
    cta: { size: 'lg', intent: 'primary', rounded: true },
    subtle: { size: 'sm', intent: 'primary' }
  },
  defaultVariants: {
    rounded: false
  }
});

button({ preset: 'cta' });
// 'btn text-lg bg-blue-500 rounded-full'

button({ preset: 'subtle' });
// 'btn text-sm bg-blue-500 rounded-md'
```

Explicit props override preset values, and presets override defaults. The priority order is: `defaultVariants` < `preset` < explicit props:

```typescript
button({ preset: 'cta', size: 'sm' });
// 'btn text-sm bg-blue-500 rounded-full'
// size overridden to 'sm', rest from preset
```

Presets can satisfy required variants at runtime. Passing `null` for a variant prop overrides the preset's value for that variant too, skipping it entirely. An invalid preset name throws an error.

A preset name must not match a variant name — such a config is rejected by TypeScript and throws when the config is evaluated.

A preset name can also stand in for its variant values inside a [compound variant](#compound-variants) or compound slot matcher.

### Slots

Slots allow you to define multiple named class targets for multi-element components. When slots are defined, the returned function produces an object with `base` and each named slot as keys:

```typescript
const card = sv('card border rounded-lg', {
  slots: {
    header: 'card-header font-semibold',
    body: 'card-body',
    footer: 'card-footer border-t'
  }
});

const { base, header, body, footer } = card();
// base:   'card border rounded-lg'
// header: 'card-header font-semibold'
// body:   'card-body'
// footer: 'card-footer border-t'
```

The `base` slot can also be defined explicitly in the slots config, and it merges with the first argument:

```typescript
const card = sv('border', {
  slots: {
    base: 'rounded-lg shadow-md',
    header: 'font-bold'
  }
});

card().base; // 'border rounded-lg shadow-md'
```

#### Slots with Variants

Variant values can target specific slots by providing an object with slot keys. Variants don't need to target every slot — untargeted slots remain unchanged:

```typescript
const card = sv('card border rounded-lg', {
  slots: {
    header: 'font-bold',
    body: 'py-4',
    footer: 'border-t'
  },
  variants: {
    size: {
      sm: {
        base: 'p-2 text-sm',
        header: 'pb-1'
        // body and footer are unaffected
      },
      lg: {
        base: 'p-6 text-lg',
        header: 'pb-4',
        body: 'py-4',
        footer: 'pt-4'
      }
    }
  },
  defaultVariants: {
    size: 'sm'
  }
});

const { base, header, body, footer } = card({ size: 'lg' });
// base:   'card border rounded-lg p-6 text-lg'
// header: 'font-bold pb-4'
// body:   'py-4 py-4'
// footer: 'border-t pt-4'
```

A boolean shorthand variant can also be a slot object:

```typescript
const card = sv('border rounded-lg', {
  slots: {
    header: 'font-bold',
    body: 'py-4'
  },
  variants: {
    highlighted: {
      base: 'ring-2 ring-blue-500',
      header: 'bg-blue-100'
    }
  }
});

card({ highlighted: true });
// base:   'border rounded-lg ring-2 ring-blue-500'
// header: 'font-bold bg-blue-100'
```

### Slot Groups

A group is a name for a set of slots. Declare groups with the `groups` config, then use a group name anywhere a slot name is accepted — in variant and compound variant class objects, in `compoundSlots`, in `multiSlots`, and in the runtime `class`/`className` prop:

```typescript
const card = sv('border', {
  slots: {
    header: 'font-bold',
    body: 'py-4',
    footer: 'text-xs'
  },
  groups: {
    content: ['header', 'body']
  },
  variants: {
    size: {
      sm: { content: 'text-sm' },
      lg: { content: 'text-lg', footer: 'text-sm' }
    }
  }
});

const { base, header, body, footer } = card({ size: 'lg' });
// base:   'border'
// header: 'font-bold text-lg'
// body:   'py-4 text-lg'
// footer: 'text-xs text-sm'
```

Groups are a way to write one class value for several slots — they never become keys of the result, which always holds exactly `base` plus each declared slot.

When the same object names both a group and one of its slots, the group's classes are applied first, so the slot-specific value always comes last and wins under [`tailwind-merge`](#post-processing), no matter which key was written first:

```typescript
const card = sv({
  slots: {
    header: 'h',
    body: 'b'
  },
  groups: {
    content: ['header', 'body']
  },
  variants: {
    size: {
      lg: { header: 'px-6', content: 'px-2' }
    }
  }
});

card({ size: 'lg' });
// header: 'h px-2 px-6' — the group's class, then the slot's
// body:   'b px-2'
```

A group holds slot names only — it cannot name another group. Group names must not collide with a slot name (including `base`), a group must list at least one slot, and every listed slot must exist; otherwise `sv()` throws when the config is evaluated.

### Compound Slots

Apply classes to multiple slots at once, optionally conditioned on variant values:

```typescript
const dialog = sv('fixed inset-0', {
  slots: {
    overlay: 'bg-black/50',
    content: 'bg-white rounded-lg',
    title: 'text-lg font-bold',
    actions: 'flex gap-2'
  },
  variants: {
    size: {
      sm: 'max-w-sm',
      lg: 'max-w-lg'
    }
  },
  compoundSlots: [
    {
      slots: ['content', 'title', 'actions'],
      class: 'px-6'
    },
    {
      size: 'sm',
      slots: ['title', 'actions'],
      class: 'text-sm'
    }
  ]
});

const result = dialog({ size: 'sm' });
// base:    'fixed inset-0 max-w-sm'
// overlay: 'bg-black/50'
// content: 'bg-white rounded-lg px-6'
// title:   'text-lg font-bold px-6 text-sm'
// actions: 'flex gap-2 px-6 text-sm'
```

Compound slots support the same array matching and [`preset` matchers](#compound-variants) as compound variants. The `slots` array accepts [group names](#slot-groups) alongside slot names, and a slot reached through more than one name in the same entry still gets the class once.

### Multi Slots

By default each slot in the result object is a plain class string. The `multiSlots` option turns the listed slots into reconfigurable functions instead — the list accepts [group names](#slot-groups) as well, turning every slot of the group into a function. A slot function accepts variant prop overrides, a `preset` name when the config declares [presets](#presets), and a `class`/`className` override, and returns that slot's class string.

This is designed for cases where a single slot is rendered multiple times with different props — for example a list of items where each item needs its own variant values:

```typescript
const card = sv('border', {
  slots: {
    header: 'font-bold',
    body: 'py-4'
  },
  variants: {
    size: {
      sm: { base: 'p-2', header: 'text-sm' },
      lg: { base: 'p-6', header: 'text-lg' }
    }
  },
  multiSlots: ['header']
});

const result = card({ size: 'sm' });
// result.base   -> 'border p-2'        (plain string)
// result.body   -> 'py-4'              (plain string)
// result.header -> function

result.header();                  // 'font-bold text-sm'
result.header({ size: 'lg' });    // 'font-bold text-lg'
result.header({ class: 'mt-2' }); // 'font-bold text-sm mt-2'
```

Slots not listed in `multiSlots` stay plain strings. Pass `true` to make every slot a function, or `false` (the default) to keep them all strings.

A slot function may also switch presets per call. It inherits the preset passed to the outer call, and its own `preset` takes precedence:

```typescript
const badge = sv({
  slots: {
    label: 'font-medium'
  },
  variants: {
    tone: {
      neutral: { label: 'text-gray-900' },
      danger: { label: 'text-red-600' }
    }
  },
  presets: {
    alert: { tone: 'danger' },
    plain: { tone: 'neutral' }
  },
  multiSlots: ['label']
});

const result = badge({ preset: 'alert' });

result.label();                    // 'font-medium text-red-600' (outer preset)
result.label({ preset: 'plain' }); // 'font-medium text-gray-900'
result.label({ tone: 'neutral' }); // 'font-medium text-gray-900'
```

### Class Override at Runtime

Append additional classes at call time using `class` or `className`:

```typescript
const button = sv('btn', {
  variants: {
    size: {
      sm: 'text-sm',
      lg: 'text-lg'
    }
  }
});

button({ size: 'sm', class: 'mt-4 mx-auto' });
// 'btn text-sm mt-4 mx-auto'

button({ size: 'sm', class: { 'mt-4': true, hidden: false } });
// 'btn text-sm mt-4'
```

With slots, a string `class` appends to the base slot. Use a slot object to target specific slots:

```typescript
const card = sv('border', {
  slots: {
    header: 'font-bold',
    body: 'py-4'
  }
});

// String targets the base slot
card({ class: 'shadow-xl' });
// base: 'border shadow-xl', header: 'font-bold', body: 'py-4'

// Object targets specific slots
card({ class: { base: 'shadow-xl', header: 'text-blue-700', body: 'min-h-24' } });
// base: 'border shadow-xl', header: 'font-bold text-blue-700', body: 'py-4 min-h-24'
```

A key of that object can also be a [group name](#slot-groups), targeting every slot of the group at once.

Both `class` and `className` are supported, but `class` takes priority when both are passed at the same time.

### Post-Processing

Apply a custom transformation to the final class strings using `postProcess`. This is useful for integrating with libraries like `tailwind-merge`:

```typescript
import { sv } from 'slot-variants';
import { twMerge } from 'tailwind-merge';

const button = sv('px-4 py-2 bg-blue-500', {
  variants: {
    size: {
      sm: 'px-2 py-1 text-sm',
      lg: 'px-6 py-3 text-lg'
    }
  },
  postProcess: twMerge
});
```

`sv()` and `cn()` concatenate classes in order without deduplicating or resolving conflicts — a class repeated across `base` and a variant value appears twice in the output, and conflicting Tailwind utilities are both kept. Use `postProcess: twMerge` when you need duplicates collapsed and later utilities to win.

For statically-defined classes, the bundled [ESLint / oxlint plugin](#eslint--oxlint-plugin) catches most duplication at lint time, before it ever reaches the output.

### Shared Defaults with `createSV()`

`createSV(defaults)` returns a pre-configured `sv()` that merges `defaults` into every config-based call. This avoids repeating the same options — most commonly `postProcess: twMerge` — across every component:

```typescript
import { createSV } from 'slot-variants';
import { twMerge } from 'tailwind-merge';

export const customSV = createSV({
  postProcess: twMerge,
  cacheSize: 512
});

// twMerge is applied without restating it per component
const button = customSV('px-4 py-2 bg-blue-500', {
  variants: {
    size: {
      sm: 'px-2 py-1 text-sm',
      lg: 'px-6 py-3 text-lg'
    }
  }
});
```

`defaults` accepts any config option. A per-call value always wins over the matching default — there is no deep merging of variants or compound rules. Calls with no config object are forwarded straight to `cn()`-style merging and never see the defaults.

A factory-level `introspection: true` is reflected in each component's return type, so the [introspection](#introspection) API is available without setting the flag on every config.

### Caching

Results are cached automatically for performance — repeated calls with the same props (a common pattern across re-renders) skip re-resolving variants entirely. The default cache size is **256** entries; tune it with the `cacheSize` option:

```typescript
const button = sv('btn', {
  variants: {
    size: {
      sm: 'text-sm',
      lg: 'text-lg'
    }
  },
  cacheSize: 512  // customize the cache size
});
```

Setting `cacheSize` to `0` (or a negative number) disables caching entirely — every call recomputes its result. This is useful when variant combinations are effectively unbounded and you'd rather not retain any entries.

Cache inspection and control methods (`getCacheSize`, `clearCache`, `getMaxEntries`) are exposed on the returned function only when `introspection: true` is set — see [Introspection](#introspection).

### Introspection

Set `introspection: true` in the config to expose configuration properties and cache controls on the returned function for runtime inspection. Introspection is **disabled by default** to keep the returned function lean; opt in only when you need it:

```typescript
const button = sv('btn', {
  slots: {
    icon: 'w-4 h-4'
  },
  groups: {
    all: ['base', 'icon']
  },
  variants: {
    size: {
      sm: 'text-sm',
      lg: 'text-lg'
    },
    intent: {
      primary: 'bg-blue-500',
      danger: 'bg-red-500'
    }
  },
  defaultVariants: {
    size: 'sm'
  },
  requiredVariants: ['intent'],
  presets: {
    cta: { size: 'lg', intent: 'primary' }
  },
  introspection: true
});

button.variantKeys;                 // ['size', 'intent']
button.variants;                    // { size: { sm: 'text-sm', lg: 'text-lg' }, intent: { ... } }
button.slotKeys;                    // ['base', 'icon']
button.slots;                       // { icon: 'w-4 h-4' }
button.groupKeys;                   // ['all']
button.groups;                      // { all: ['base', 'icon'] }
button.defaultVariants;             // { size: 'sm' }
button.requiredVariants;            // ['intent']
button.multiSlots;                  // [] (slot names exposed as functions)
button.presetKeys;                  // ['cta']
button.presets;                     // { cta: { size: 'lg', intent: 'primary' } }
button.getVariantValues('size');    // ['sm', 'lg']
button.getVariantValues('intent');  // ['primary', 'danger']
button.getMaxEntries();             // 4 — distinct variant combinations
button.getCacheSize();              // current number of cached entries
button.clearCache();                // clear all cached entries
```

Without `introspection: true`, only the variant function itself is returned — accessing introspection or cache properties is a type error.

### Errors & Validation

`sv()` validates both the config and the runtime props, throwing an `Error` on misconfiguration. Config problems (an unknown variant referenced by `requiredVariants`, `defaultVariants`, a preset, or a compound entry; a value that isn't one of the variant's defined values; a preset named after a variant; an unknown preset named by a compound entry; a group named after a slot, left empty, or naming a slot that doesn't exist; a compound or slot entry missing required fields) throw as soon as the config is evaluated. Runtime problems (a missing required variant, an invalid variant value, or an unknown preset name) throw when the variant function is called — these guard against untyped input, such as a value coming from a form or API, since TypeScript already prevents most of these at compile time.

## TypeScript

`slot-variants` is fully typed. Variant props are inferred from your config:

```typescript
import { sv, type VariantProps } from 'slot-variants';

const button = sv('btn', {
  variants: {
    size: {
      sm: 'text-sm',
      lg: 'text-lg'
    },
    intent: {
      primary: 'bg-blue-500',
      danger: 'bg-red-500'
    }
  },
  requiredVariants: ['intent']
});

// Extract the variant props type (excludes class, className, and preset)
type ButtonProps = VariantProps<typeof button>;
// { size?: 'sm' | 'lg' | undefined; intent: 'primary' | 'danger' }
```

`VariantProps` accepts an optional second type parameter to exclude specific variants — useful when some variants are controlled internally by a component and shouldn't be exposed to consumers:

```typescript
type ButtonProps = VariantProps<typeof button, 'internalState'>;
type ButtonProps = VariantProps<typeof button, 'internalState' | 'intent'>; // union for multiple
```

`VariantValue` extracts the value union for a single variant key, without `undefined` — useful when a component only needs to forward one variant as a typed prop:

```typescript
import { sv, type VariantValue } from 'slot-variants';

type SizeValue = VariantValue<typeof button, 'size'>;
// 'sm' | 'lg' — no undefined, even though size is optional

type ButtonGroupProps = {
  size?: VariantValue<typeof button, 'size'>;
};
```

`SlotClassProps<T>` extracts the per-slot class injection shape from an `sv()` return type — useful when building wrapper components that expose a typed prop for consumers to pass additional classes into specific slots:

```typescript
import { sv, type SlotClassProps, type VariantProps } from 'slot-variants';

const card = sv('border rounded-lg', {
  slots: {
    header: 'font-bold',
    body: 'py-4',
    footer: 'border-t'
  },
  variants: {
    size: { sm: 'text-sm', lg: 'text-lg' }
  }
});

type CardProps = VariantProps<typeof card> & {
  classNames?: SlotClassProps<typeof card>;
  // { base?: ClassValue; header?: ClassValue; body?: ClassValue; footer?: ClassValue }
};

function Card({ classNames, ...variants }: CardProps) {
  const { base, header, body, footer } = card({ ...variants, class: classNames });
  // ...
}
```

When used on an `sv()` definition without slots, `SlotClassProps` resolves to `{ base?: ClassValue }`.

### Exported Types

| Type | Description |
| --- | --- |
| `ClassValue` | Valid input types for `cn()` |
| `VariantProps<T, E>` | Extracts variant props from an `sv()` return type, optionally excluding keys in `E` |
| `VariantValue<T, K>` | Extracts the value union for a single variant key `K`, without `undefined` |
| `SlotClassProps<T>` | Extracts the per-slot class injection shape from an `sv()` return type |
| `SV<D>` | The shape of an `sv()` function, with the factory's introspection default `D`; the return type of `createSV()` |

### Return Type

- **Without slots** - the function returns a `string`
- **With slots** - the function returns a `Record` with `base` and each slot name as keys, all typed as `string`

## Config Reference

Class values inside the config (`base`, `variants`, `slots`, and `compound*` `class`/`className`) accept `string`, `string[]`, or `undefined`, where `undefined` applies no classes, the same as an empty string. Dynamic class values (objects, booleans, nested arrays) are only accepted at call time via the `class`/`className` prop.

| Option | Type | Description |
| --- | --- | --- |
| `base` | `string \| string[]` | Additional base classes merged with the base argument and `slots.base` |
| `variants` | `Record<string, Record<string \| number, string \| string[]>>` | Variant definitions mapping variant names to their possible values |
| `slots` | `Record<string, string \| string[]>` | Named slot definitions for multi-element components |
| `groups` | `Record<string, string[]>` | Named sets of slot names, usable anywhere a slot name is accepted |
| `compoundVariants` | `Array` | Additional classes applied when multiple variant conditions match |
| `compoundSlots` | `Array` | Classes applied to multiple slots based on variant conditions |
| `defaultVariants` | `Object` | Default values for variants (static values or functions) |
| `requiredVariants` | `string[] \| boolean` | Variant names that must be provided at call time; `true` makes every variant required, `false` none |
| `multiSlots` | `string[] \| boolean` | Slot names exposed as reconfigurable functions instead of strings; `true` makes every slot a function, `false` none |
| `presets` | `Record<string, Partial<VariantProps>>` | Named combinations of variant values selectable via `preset` prop |
| `postProcess` | `(className: string) => string` | Custom transformation applied to final class strings |
| `cacheSize` | `number` | Maximum number of cached results (default: `256`); `0` or a negative value disables caching |
| `introspection` | `boolean` | When `true`, exposes variant/slot/preset introspection and cache methods on the returned function (default: `false`) |

## Framework Usage

`sv()` is a plain function with no framework dependency — it takes props and returns a class string (or a per-slot object). React needs no wrapper at all; frameworks with a different reactivity model need a small one to keep the result in sync with reactive state. With slots, wrap the whole call once and read individual slot classes off that single result — don't call `sv()` separately per slot.

The examples below share this config:

```typescript
const card = sv('rounded-lg border', {
  slots: {
    header: 'font-bold px-4 pt-4',
    body: 'px-4 pb-4 text-sm'
  },
  variants: {
    tone: {
      neutral: { header: 'text-gray-900', body: 'text-gray-600' },
      danger: { header: 'text-red-900', body: 'text-red-600' }
    }
  },
  defaultVariants: { tone: 'neutral' }
});
```

### React

Call it directly during render — re-renders recompute it naturally:

```tsx
function Card({ tone, className, title, children }: CardProps) {
  const classes = card({ tone, class: className });

  return (
    <div className={classes.base}>
      <div className={classes.header}>{title}</div>
      <div className={classes.body}>{children}</div>
    </div>
  );
}
```

### Solid

Component bodies run once, so reactive prop reads must stay lazy. Wrap the call in `createMemo` (or call it inline inside JSX, where Solid's fine-grained reactivity tracks the prop access itself):

```tsx
function Card(props: CardProps) {
  const classes = createMemo(() => card({ tone: props.tone, class: props.class }));

  return (
    <div class={classes().base}>
      <div class={classes().header}>{props.title}</div>
      <div class={classes().body}>{props.children}</div>
    </div>
  );
}
```

### Svelte

```svelte
<script>
  let { tone, class: className, title, children } = $props();
  const classes = $derived(card({ tone, class: className }));
</script>

<div class={classes.base}>
  <div class={classes.header}>{title}</div>
  <div class={classes.body}>{@render children()}</div>
</div>
```

### Vue

```vue
<script setup>
const classes = computed(() => card({ tone: props.tone, class: props.class }));
</script>

<template>
  <div :class="classes.base">
    <div :class="classes.header">{{ title }}</div>
    <div :class="classes.body"><slot /></div>
  </div>
</template>
```

### Multi Slots

If a slot is listed in [`multiSlots`](#multi-slots), it resolves to a function instead of a string; call that function per rendered item, still reading it off the same memoized/computed result. The examples below share this config:

```typescript
const list = sv({
  slots: { item: 'px-2 py-1' },
  variants: { active: { true: 'bg-blue-100', false: '' } },
  multiSlots: ['item']
});
```

React:

```tsx
function List({ items, activeId }: ListProps) {
  const classes = list();

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className={classes.item({ active: item.id === activeId })}>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
```

Solid:

```tsx
function List(props: ListProps) {
  const classes = createMemo(() => list());

  return (
    <For each={props.items}>
      {(item) => <li class={classes().item({ active: item.id === props.activeId })}>{item.label}</li>}
    </For>
  );
}
```

Svelte:

```svelte
<script>
  let { items, activeId } = $props();
  const classes = $derived(list());
</script>

<ul>
  {#each items as item}
    <li class={classes.item({ active: item.id === activeId })}>{item.label}</li>
  {/each}
</ul>
```

Vue:

```vue
<script setup>
const classes = computed(() => list());
</script>

<template>
  <ul>
    <li v-for="item in items" :key="item.id" :class="classes.item({ active: item.id === activeId })">
      {{ item.label }}
    </li>
  </ul>
</template>
```

## ESLint / oxlint Plugin

`slot-variants` ships an ESLint-compatible plugin at the `slot-variants/eslint-plugin` subpath. It runs under ESLint v9+ (flat config) and under [oxlint](https://oxc.rs/docs/guide/usage/linter/js-plugins) via its `jsPlugins` API. The plugin is a separate entry point with no runtime imports — consuming it doesn't pull any library code into your bundle.

### Rules

Rules analyze `sv`/`cn` imported from `'slot-variants'` (including aliased and namespace imports), same-file `const` aliases of them, and `const` bindings to a [`createSV()`](#shared-defaults-with-createsv) result. Values reachable only through `let`/`var`, imported bindings, or destructuring are treated as dynamic and are not analyzed.

#### `slot-variants/no-conflicting-classes`

Flags class tokens that collide within the output of an `sv()` or `cn()` call: exact duplicates and distinct tokens targeting the same Tailwind utility (e.g. `w-100`/`w-200`, or shorthand/longhand overlaps like `px-4`/`pl-2`). It skips positions that can't actually co-occur, like different values of the same variant. Single-word utilities (`flex`, `block`) are ignored by default; set `exclusiveGroups: true` to catch conflicts between them too (`display`, `position`, etc.), or pass your own list of mutually-exclusive groups. If your Tailwind v3 config sets a `prefix`, pass the same value via the `prefix` option so the rule can read the namespace correctly.

```typescript
const button = sv({
  base: 'flex items-center',
  variants: {
    orientation: {
      row: ['flex', 'flex-row'], // 'flex' duplicates base
      col: ['flex', 'flex-col']  // 'flex' duplicates base
    }
  }
});

cn('flex items-center', 'flex'); // 'flex' duplicated across args
```

Move the shared class into `base` — or use compound variants — so each class has a single source.

#### `slot-variants/no-dynamic-classes`

Flags class-bearing positions that aren't statically inferrable (identifiers, member access, calls, spreads, computed keys, template expressions), so every class in your config can be verified at lint time. Simple conditional forms in `cn()`-style positions (`cond && 'px-4'`, `cond ? 'px-4' : 'px-2'`) stay allowed as long as every branch is static.

```typescript
const extra = getDynamicClass();

sv({ base: extra });              // dynamic base
sv({ variants: { [key]: 'x' } }); // computed variant key
cn(extra, 'flex');                // identifier argument
```

Replace dynamic class strings with static ones, or move them to the runtime `class` / `className` prop on the returned function, which is intentionally outside the analyzer's scope.

#### `slot-variants/no-empty-classes`

Flags empty class values (empty strings, arrays, objects) and zero-argument `sv()` / `cn()` calls, plus an empty-array matcher in `compoundVariants`/`compoundSlots` (which can never match, making the entry permanently unreachable). Partially auto-fixable.

```typescript
sv({ base: '' });                       // empty base
sv({ variants: { size: { sm: '' } } });  // empty variant value
sv();                                    // zero-arg call — always produces ''
```

#### `slot-variants/no-redundant-spaces`

Flags class strings whose whitespace isn't canonical (leading/trailing space, repeated spaces, tabs, newlines). Auto-fixable.

```typescript
sv({ base: ' flex items-center' }); // leading space
sv({ base: 'flex  items-center' }); // double space
```

Run `eslint --fix` to rewrite these to the canonical single-space form.

#### `slot-variants/no-shared-tokens`

Flags class tokens repeated in every value of a variant that's always applied (has a static default, or is required), since those tokens are constant in the output and belong in `base` (or the corresponding slot) instead. Partially auto-fixable — it lifts the token into `base`/`slots[slot]` where that's straightforward to do automatically.

```typescript
const button = sv({
  variants: {
    size: {
      sm: 'rounded text-sm',
      lg: 'rounded text-lg'
    }
  },
  defaultVariants: { size: 'sm' }
});
```

`rounded` is present in every value of an exhaustive variant. Lift it into `base` (or the corresponding slot for slot-based variants) so each variant value contains only the classes that actually vary.

The same rule also flags a `compoundVariants`/`compoundSlots` entry whose matcher covers exactly one variant key — it isn't combining variants, so it isn't really a compound; its class belongs directly on that variant's value instead. `compoundVariants` is auto-fixed when its class and the target variant value are plain string/template literals; `compoundSlots` is always reported without a fix, since its class targets a specific slot rather than the whole variant value.

```typescript
const button = sv({
  variants: {
    variant: { primary: '...', link: 'underline-offset-4' }
  },
  compoundVariants: [
    { variant: 'link', className: 'hover:underline' }
  ]
});
```

This entry only matches `variant: 'link'` — merge `hover:underline` into `variants.variant.link` directly instead.

#### `slot-variants/require-top-level-config`

Flags `sv()` calls with a config object that aren't at module top level (e.g. inside a function body or a non-static class field), since the config form compiles the variant function and seeds its cache once, and re-entering the call throws that work away every time.

```typescript
function createButton() {
  return sv('btn', { variants: { size: { sm: 'text-sm' } } }); // rebuilt on every call
}

class Card {
  button = sv('btn', { variants: { size: { sm: 'text-sm' } } }); // rebuilt on every `new Card()`
}
```

Move the `sv()` call to a module-level `const` so it's compiled once and its cache persists across calls.

#### `slot-variants/sv-config-style`

Enforces a canonical `sv()`/`createSV()` config key order (`base`, `slots`, `groups`, `multiSlots`, `variants`, `presets`, `compoundSlots`, `compoundVariants`, `defaultVariants`, `requiredVariants`, `cacheSize`, `introspection`, `postProcess`) and a single style for expressing base classes, selected via the `baseStyle` option (`'field'` by default):

- `'field'` — a `base` field inside the config (tv-style)
- `'separateArg'` — a leading class argument before the config object (cva-style)
- `'slotsBase'` — a `base` entry inside `slots`, only enforced once the config already declares `slots`

```typescript
sv({ variants: { size: { sm: 'text-sm' } }, base: 'flex' }); // base out of order

sv('flex', { variants: {} }); // baseStyle: 'field' expects a base field instead
```

Partially auto-fixable — a fix is only applied when the change is unambiguous: reordering skips a config containing a spread, a computed/unknown key, or a comment anywhere inside the config object, and a base-style rewrite skips a call whose base value isn't a static string/array, whose target location already holds a value of its own, that passes more than one leading class argument, or whose config object is a `const` declared outside the call.

Disabled by default (`recommended: false`) since it's a pure style/consistency check with no runtime correctness impact — enable it explicitly in your ESLint config.

### ESLint (flat config)

Use the `recommended` preset to enable every rule marked `recommended` at `error` in one line (that's all rules except `sv-config-style`, which is opt-in):

```js
import svPlugin from 'slot-variants/eslint-plugin';

export default [svPlugin.configs.recommended];
```

Or wire each rule by hand if you want per-rule control:

```js
import svPlugin from 'slot-variants/eslint-plugin';

export default [
  {
    plugins: { 'slot-variants': svPlugin },
    rules: {
      'slot-variants/no-conflicting-classes': 'error',
      'slot-variants/no-dynamic-classes': 'error',
      'slot-variants/no-empty-classes': 'error',
      'slot-variants/no-redundant-spaces': 'error',
      'slot-variants/no-shared-tokens': 'error',
      'slot-variants/require-top-level-config': 'error',
      'slot-variants/sv-config-style': ['error', { baseStyle: 'field' }]
    }
  }
];
```

### oxlint

```json
{
  "jsPlugins": ["slot-variants/eslint-plugin"],
  "rules": {
    "slot-variants/no-conflicting-classes": "error",
    "slot-variants/no-dynamic-classes": "error",
    "slot-variants/no-empty-classes": "error",
    "slot-variants/no-redundant-spaces": "error",
    "slot-variants/no-shared-tokens": "error",
    "slot-variants/require-top-level-config": "error",
    "slot-variants/sv-config-style": ["error", { "baseStyle": "field" }]
  }
}
```

## IntelliSense Setup (Optional)

If you're using Tailwind CSS, you can opt into class autocompletion and automatic class sorting inside `sv()` and `cn()` calls.

### VSCode

The [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss) extension recognizes calls listed in `tailwindCSS.classFunctions`. Add `cn` and `sv` to your workspace or user settings:

```json
{
  "tailwindCSS.classFunctions": ["cn", "sv"]
}
```

### Prettier

The [`prettier-plugin-tailwindcss`](https://github.com/tailwindlabs/prettier-plugin-tailwindcss) plugin sorts Tailwind classes inside the functions listed in `tailwindFunctions`:

```js
module.exports = {
  plugins: [require('prettier-plugin-tailwindcss')],
  tailwindFunctions: ['cn', 'sv']
};
```

## Migrating from CVA / tailwind-variants

### From CVA

`sv()` is a drop-in replacement for CVA. Rename `cva` to `sv` and the `VariantProps` import source — everything else, including the config shape, `class`/`className` override, and variant prop handling, works identically:

```diff
- import { cva, type VariantProps } from 'class-variance-authority';
+ import { sv, type VariantProps } from 'slot-variants';

- const button = cva('btn font-medium', {
+ const button = sv('btn font-medium', {
    variants: {
      size: { sm: 'text-sm', lg: 'text-lg' },
      intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
    },
    defaultVariants: { size: 'sm' },
    compoundVariants: [
      { size: 'lg', intent: 'primary', class: 'uppercase' }
    ]
  });
```

### From tailwind-variants

`sv()` covers the core feature set of tailwind-variants with a simpler API. The config-only calling convention matches `tv()`:

```diff
- import { tv, type VariantProps } from 'tailwind-variants';
+ import { sv, type VariantProps } from 'slot-variants';

- const button = tv({
+ const button = sv({
    base: 'btn font-medium',
    variants: {
      size: { sm: 'text-sm', lg: 'text-lg' }
    },
    defaultVariants: { size: 'sm' }
  });
```

Key differences to be aware of:

| Feature | tailwind-variants | slot-variants |
| --- | --- | --- |
| Slot return type | Always functions: `slot({ class: '...' })` | Strings by default; functions for slots listed in `multiSlots` |
| `extend` (composition) | Supported | Not supported |
| Built-in `twMerge` | Enabled by default | Use `postProcess: twMerge`, globally via `createSV` |

**Slot return type** is the most significant difference. In `tv()`, each slot returns a function that can accept additional props. In `sv()`, slots resolve to strings directly — use the `class` prop with a slot object for per-slot overrides, or list a slot in [`multiSlots`](#multi-slots) to expose it as a `tv`-style reconfigurable function:

```typescript
// tailwind-variants
const { base, icon } = component({ size: 'sm' });
base({ class: 'extra' }); // slot is a function

// slot-variants
const { base, icon } = component({ size: 'sm', class: { base: 'extra' } });
base; // slot is a string
```

**tailwind-merge** is not built in but can be added via `postProcess`, or applied globally with [`createSV()`](#shared-defaults-with-createsv) — the closest equivalent to `tv`'s default `twMerge`:

```typescript
// custom-sv.ts
import { createSV } from 'slot-variants';
import { twMerge } from 'tailwind-merge';

export const customSV = createSV({ postProcess: twMerge });
```
