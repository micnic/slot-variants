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

### Supported Input Types

| Type | Behavior |
| --- | --- |
| `string` | Included as-is |
| `string[]` | Flattened recursively |
| `Record<string, unknown>` | Keys with truthy values included |
| `boolean`, `number`, `bigint` | Ignored |
| `null`, `undefined` | Ignored |

## `sv()` - Slot Variants

`sv()` supports three calling conventions:

### Class Name Merging (No Config)

When called without a config object, `sv()` works like `cn()` — it accepts any number of `ClassValue` arguments and returns a merged class string:

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

When the last argument is a config object preceded by one or more `ClassValue` arguments, the leading arguments are merged as the base:

```typescript
const button = sv('btn font-medium', {
  variants: {
    size: {
      sm: 'text-sm',
      lg: 'text-lg'
    }
  }
});
```

The `base` field in the config is merged with the base arguments: `cn(baseArgs..., config.base, slots.base)`:

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

**Boolean shorthand** - provide a `ClassValue` directly instead of a `true`/`false` record. The value is applied when `true`, and nothing is applied when `false`:

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

Passing `undefined` for a prop falls back to the default:

```typescript
button({ size: undefined }); // 'btn text-base rounded-md'
```

Passing `null` instead explicitly opts out of the variant — its default (and any [preset](#presets) value) is skipped entirely, so no classes for that variant are applied:

```typescript
button({ size: null }); // 'btn rounded-md' (no size classes at all)
```

#### Function-Based Default Variants

Default variants can be functions that receive the current props and return a value dynamically. Return `undefined` to skip the variant entirely:

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

Compound variant conditions support **array matching** (OR logic):

```typescript
compoundVariants: [
  {
    intent: ['primary', 'secondary'],
    size: 'sm',
    class: 'tracking-tight'
  }
]
```

Multiple compound variants can match simultaneously, and all matching classes are applied.

Compound variants also support `className` as an alternative to `class`:

```typescript
compoundVariants: [
  {
    size: 'sm',
    className: 'shadow-sm'
  }
]
```

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

Pass `true` to make every variant required, or `false` to require none:

```typescript
const button = sv('btn', {
  variants: {
    size: { sm: 'text-sm', lg: 'text-lg' },
    intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
  },
  requiredVariants: true
});

button({ size: 'sm', intent: 'primary' });  // OK
button({ size: 'sm' });                     // Throws: Missing required variant: "intent"
```

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

Presets can satisfy required variants at runtime — if a preset provides a required variant, it does not need to be passed explicitly.

Passing `null` for a variant prop overrides the preset's value for that variant too, skipping it entirely:

```typescript
button({ preset: 'cta', size: null });
// 'btn bg-blue-500 rounded-full' (preset's size is skipped, no default either)
```

An invalid preset name throws an error:

```typescript
button({ preset: 'nonexistent' }); // Throws: Invalid preset "nonexistent"
```

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

Variant values can target specific slots by providing an object with slot keys:

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
        header: 'pb-1',
        body: 'py-1',
        footer: 'pt-1'
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

Variants don't need to target every slot - untargeted slots remain unchanged:

```typescript
variants: {
  size: {
    sm: { base: 'p-2', header: 'text-sm' }
    // body and footer are unaffected
  }
}
```

#### Boolean Shorthand with Slots

When using slots, a boolean shorthand variant can be a slot object:

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

card({ highlighted: false });
// base:   'border rounded-lg'
// header: 'font-bold'
```

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

Compound slots support the same array matching as compound variants:

```typescript
compoundSlots: [
  {
    size: ['sm', 'md'],
    slots: ['cell', 'header'],
    class: 'px-3'
  }
]
```

### Multi Slots

By default each slot in the result object is a plain class string. The
`multiSlots` option turns the listed slots into reconfigurable functions
instead. A slot function accepts variant prop overrides and a
`class`/`className` override, and returns that slot's class string.

This is designed for cases where a single slot is rendered multiple times
with different props — for example a list of items where each item needs
its own variant values — so the same slot can be re-evaluated per use
without recreating the whole variant function:

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

Slots not listed in `multiSlots` stay plain strings. Pass `true` to make
every slot a function, or `false` (the default) to keep them all strings:

```typescript
const card = sv('border', {
  slots: { header: 'font-bold', body: 'py-4' },
  multiSlots: true
});

const { base, header, body } = card();
base();   // 'border'
header(); // 'font-bold'
body();   // 'py-4'
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

// String
button({ size: 'sm', class: 'mt-4 mx-auto' });
// 'btn text-sm mt-4 mx-auto'

// Array
button({ size: 'sm', class: ['mt-4', 'mx-auto'] });
// 'btn text-sm mt-4 mx-auto'

// Object
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

Both `class` and `className` are supported, but `class` takes priority when both are passed at the same time.

The runtime `class`/`className` override is not part of the cache key — it is merged on top of the cached variant result on every call (and `postProcess`, if set, is re-applied to the merged output). Two calls with identical variants but different `class` values therefore share the same cached base result.

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

The `postProcess` function is applied to each slot's final class string independently.

`sv()` and `cn()` concatenate classes in order without deduplicating or resolving conflicts — a class repeated across `base` and a variant value appears twice in the output, and conflicting Tailwind utilities are both kept. Use `postProcess: twMerge` when you need duplicates collapsed and later utilities to win at runtime.

For statically-defined classes, the bundled [ESLint / oxlint plugin](#eslint--oxlint-plugin) catches most duplication at lint time — before it ever reaches the output: `no-conflicting-classes` flags duplicate and same-namespace tokens within a call, and `no-shared-tokens` flags a class repeated across every value of a variant (which belongs in `base` instead). The two approaches complement each other — the plugin keeps your source clean, while `postProcess: twMerge` handles duplicates that only arise from dynamic, runtime-supplied classes.

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

`defaults` accepts **any** config option (`base`, `variants`, `slots`, `compoundVariants`, `cacheSize`, `introspection`, `postProcess`, …). The merge is shallow and **a per-call value always wins** over the matching default — there is no deep merging of variants or compound rules:

```typescript
const customSV = createSV({ postProcess: twMerge });

// This component opts out of twMerge entirely
const raw = customSV('btn', {
  variants: { size: { sm: 'text-sm' } },
  postProcess: (className) => className // overrides the default
});
```

Calls with no config object are forwarded straight to `cn()`-style merging and never see the defaults:

```typescript
const customSV = createSV({ postProcess: (c) => c.toUpperCase() });

customSV('flex', 'items-center'); // 'flex items-center' — defaults are skipped
```

A factory-level `introspection: true` is reflected in each component's return type, so the [introspection](#introspection) API is available without setting the flag on every config. A per-call `introspection: false` opts an individual component back out.

### Caching

Results are cached automatically for performance. The default cache size is **256** entries.

Each cache entry corresponds to one distinct combination of resolved variant values. The largest number of combinations a config can produce is the product, over every variant, of its value count plus one — the `+ 1` counts the variant being left unset:

```
maxEntries = (values₁ + 1) × (values₂ + 1) × ... × (valuesₙ + 1)
```

For example, four variants with three values each yield `(3 + 1) ** 4 = 256` combinations — exactly the default. A config whose `maxEntries` is at or below its `cacheSize` never evicts, so raising `cacheSize` past that point has no effect.

The `+ 1` is dropped for any variant that cannot actually be left unset — one listed in `requiredVariants` (or all of them when `requiredVariants` is `true`), or one with a static `defaultVariants` value that always fills it in. A function-based default keeps the `+ 1`, since it may return `undefined`. The `getMaxEntries()` introspection method computes this exact count for a given config — see [Introspection](#introspection).

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

Cache inspection and control methods (`getCacheSize`, `clearCache`) are exposed on the returned function only when `introspection: true` is set — see [Introspection](#introspection).

### Introspection

Set `introspection: true` in the config to expose configuration properties and cache controls on the returned function for runtime inspection. Introspection is **disabled by default** to keep the returned function lean; opt in only when you need it:

```typescript
const button = sv('btn', {
  slots: {
    icon: 'w-4 h-4'
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

`sv()` validates both the config and the runtime props, throwing an `Error` on misconfiguration. TypeScript prevents most of these statically, but they still guard against untyped runtime input (e.g. a value coming from a form or API).

**Config-time** — thrown when `sv(config)` is evaluated (at module load, when the variant function is built):

| Message | Cause |
| --- | --- |
| `Required variant "X" is not defined in variants` | `requiredVariants` lists a variant that doesn't exist |
| `Required variant "X" cannot have a default value` | A variant is both in `requiredVariants` and `defaultVariants` |
| `Default variant "X" is not defined in variants` | `defaultVariants` references an unknown variant |
| `Default variant "X" has invalid value "V"` | A static default value isn't one of the variant's values |
| `Preset "P" references unknown variant "X"` | A preset references an unknown variant |
| `Preset "P" has invalid value "V" for variant "X"` | A preset value isn't one of the variant's values |
| `Compound matcher references unknown variant "X"` | A compound variant/slot matches on an unknown variant |
| `Compound matcher for variant "X" has invalid value "V"` | A compound matcher value isn't one of the variant's values |
| `Compound variant must define "class" or "className"` | A `compoundVariants` entry has no class value |
| `Compound slot must define "class" or "className"` | A `compoundSlots` entry has no class value |
| `Compound slot must define at least one slot` | A `compoundSlots` entry has an empty `slots` array |
| `Compound slot references unknown slot "S"` | A `compoundSlots` entry targets an undefined slot |
| `Multi slot references unknown slot "S"` | `multiSlots` lists a slot that doesn't exist |

**Runtime** — thrown when the returned variant function is called:

| Message | Cause |
| --- | --- |
| `Missing required variant: "X"` | A required variant wasn't provided (by prop or preset) |
| `Invalid value "V" for variant "X"` | A prop value isn't one of the variant's defined values |
| `Invalid preset "P"` | The `preset` prop names a preset that doesn't exist |

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

### Excluding Variants from Props

`VariantProps` accepts an optional second type parameter to exclude specific variants from the extracted props. This is useful when some variants are controlled internally by a component and should not be exposed to consumers:

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
    internalState: {
      active: 'ring-2',
      idle: ''
    }
  }
});

type ButtonProps = VariantProps<typeof button, 'internalState'>;
// { size?: 'sm' | 'lg' | undefined; intent?: 'primary' | 'danger' | undefined }
```

Multiple variants can be excluded using a union:

```typescript
type ButtonProps = VariantProps<typeof button, 'internalState' | 'intent'>;
// { size?: 'sm' | 'lg' | undefined }
```

### Extracting a Single Variant's Values

`VariantValue` extracts the value union for a specific variant key. Unlike indexing into `VariantProps`, it always returns a clean union without `undefined`:

```typescript
import { sv, type VariantValue } from 'slot-variants';

const button = sv('btn', {
  variants: {
    size: {
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg'
    },
    intent: {
      primary: 'bg-blue-500',
      danger: 'bg-red-500'
    }
  },
  requiredVariants: ['intent']
});

type SizeValue = VariantValue<typeof button, 'size'>;
// 'sm' | 'md' | 'lg'  (no undefined, even though size is optional)

type IntentValue = VariantValue<typeof button, 'intent'>;
// 'primary' | 'danger'
```

This is useful when a component only needs to forward a single variant as a typed prop:

```typescript
type ButtonGroupProps = {
  size?: VariantValue<typeof button, 'size'>;
};
```

### Slot Class Injection Props

`SlotClassProps<T>` extracts the per-slot class injection shape from an `sv()` return type. This is useful when building wrapper components that expose a typed prop for consumers to pass additional classes into specific slots:

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

type CardClassProps = SlotClassProps<typeof card>;
// { base?: ClassValue; header?: ClassValue; body?: ClassValue; footer?: ClassValue }

type CardProps = VariantProps<typeof card> & {
  classNames?: SlotClassProps<typeof card>;
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
| `SV<DI>` | The shape of an `sv()` function, with the factory's introspection default `DI`; the return type of `createSV()` |

### Return Type

- **Without slots** - the function returns a `string`
- **With slots** - the function returns a `Record` with `base` and each slot name as keys, all typed as `string`

## Config Reference

Class values inside the config (`base`, `variants`, `slots`, and `compound*` `class`/`className`) accept `string`, `string[]`, or `undefined`. Dynamic class values (objects, booleans, nested arrays) are only accepted at call time via the `class`/`className` prop.

| Option | Type | Description |
| --- | --- | --- |
| `base` | `string \| string[]` | Additional base classes merged with the base argument and `slots.base` |
| `variants` | `Record<string, Record<string \| number, string \| string[]>>` | Variant definitions mapping variant names to their possible values |
| `slots` | `Record<string, string \| string[]>` | Named slot definitions for multi-element components |
| `compoundVariants` | `Array` | Additional classes applied when multiple variant conditions match |
| `compoundSlots` | `Array` | Classes applied to multiple slots based on variant conditions |
| `defaultVariants` | `Object` | Default values for variants (static values or functions) |
| `requiredVariants` | `string[] \| boolean` | Variant names that must be provided at call time; `true` makes every variant required, `false` none |
| `multiSlots` | `string[] \| boolean` | Slot names exposed as reconfigurable functions instead of strings; `true` makes every slot a function, `false` none |
| `presets` | `Record<string, Partial<VariantProps>>` | Named combinations of variant values selectable via `preset` prop |
| `postProcess` | `(className: string) => string` | Custom transformation applied to final class strings |
| `cacheSize` | `number` | Maximum number of cached results (default: `256`); `0` or a negative value disables caching |
| `introspection` | `boolean` | When `true`, exposes variant/slot/preset introspection and cache methods on the returned function (default: `false`) |

## ESLint / oxlint Plugin

`slot-variants` ships an ESLint-compatible plugin at the `slot-variants/eslint-plugin` subpath. It runs under ESLint v9+ (flat config) and under [oxlint](https://oxc.rs/docs/guide/usage/linter/js-plugins) via its `jsPlugins` API. The plugin is a separate entry point with no runtime imports — consuming it doesn't pull any library code into your bundle.

### Rules

- **`slot-variants/no-conflicting-classes`** — flags class tokens that collide within the output of an `sv()` or `cn()` call: exact duplicates and distinct tokens targeting the same Tailwind utility namespace (e.g. `w-100`/`w-200`, or shorthand/longhand overlaps like `px-4`/`pl-2`). It parses the structure of both calls and skips mutually-exclusive positions that can't co-occur — different values of one variant, compound entries with conflicting matchers, ternary branches, and complementary conditions (`cond && 'p-2'` with `!cond && 'p-4'`). The namespace check is Tailwind-aware (variant prefixes, `!` markers, and arbitrary `[...]` values are handled), encoding Tailwind's default utility shapes rather than parsing your config, so a few edge cases remain. Single-word utilities (`flex`, `block`) are ignored by default; set `exclusiveGroups: true` to enable built-in groups for `display`, `position`, etc., or pass your own array of mutually-exclusive groups:

  ```js
  // eslint.config.js
  {
  	rules: {
  		'slot-variants/no-conflicting-classes': ['error', { exclusiveGroups: true }]
  	}
  }
  ```

  A custom `exclusiveGroups` array is validated on load: listing the same utility in two different groups throws (there's no coherent way to pick which group's conflict key it should use), so a config mistake surfaces immediately instead of silently picking the last group.

- **`slot-variants/no-dynamic-classes`** — flags class-bearing positions in `sv()` and `cn()` calls that aren't statically inferrable: identifiers, member access, calls, spreads, computed keys, templates with expressions, and so on. In cn-style positions, the conditional forms of the `cn()` calling convention stay allowed (`cond && 'px-4'`, `cond ? 'px-4' : 'px-2'`, and static-string ternaries inside template literals) as long as every branch is itself static; inside an `sv()` config, only static values are accepted. Non-class-bearing config keys (`defaultVariants`, `requiredVariants`, `cacheSize`, …) and runtime matchers in compound entries are not validated.

- **`slot-variants/no-empty-classes`** — flags empty class values — empty strings, arrays, and objects — at any class-bearing position of an `sv()` or `cn()` call, plus zero-argument `sv()` / `cn()` calls themselves. The one exception: an empty string as a direct `slots[key]` value is allowed, since declaring a slot with no default classes is a valid use case. Also flags an empty array (`[]`) as a `compoundVariants`/`compoundSlots` matcher value — since a matcher is tested with `.some()`, an empty array can never match, so the whole compound entry is permanently unreachable. **Partially auto-fixable**: `eslint --fix` removes empty positional arguments, array elements, and top-level config properties when other items remain.

- **`slot-variants/no-redundant-spaces`** — flags class strings whose whitespace isn't canonical (a single ASCII space between tokens): leading/trailing whitespace, repeated spaces, tabs, newlines. **Auto-fixable**: `eslint --fix` rewrites each offending literal in place, preserving its quote style.

- **`slot-variants/no-shared-tokens`** — flags class tokens repeated in every value of an exhaustive variant (one with a static default, or listed in / covered by `requiredVariants`). Those tokens are constant in the rendered output and belong in `base` or the corresponding `slots[slot]` entry instead. **Partially auto-fixable**: `eslint --fix` lifts the token into `base`/`slots[slot]` and strips it from each variant value, but only when that target and every variant value's contribution to the slot are plain, directly-authored string or template literals — an array, a value nested inside further structure, or one read through a hoisted `const` binding leaves the finding reported without a fix.

- **`slot-variants/require-top-level-config`** — flags `sv()` calls with a config object that aren't at module top level. The config form compiles the variant function and seeds its cache once; nesting it inside a function rebuilds that work — and throws away the cache — on every call. Config-less cn-style calls are left alone.

Analysis covers `sv`/`cn` imported from `'slot-variants'`, same-file `const` aliases of them, and `const` bindings to a [`createSV()`](#shared-defaults-with-createsv) result (the `defaults` object is validated like an `sv()` config, except `require-top-level-config` doesn't apply). Class values and config objects hoisted into a same-file `const` are read through to their value; `let`/`var`, imported bindings, and destructuring are treated as dynamic. `no-conflicting-classes` skips dynamic inputs silently, while `no-dynamic-classes` flags exactly those positions — enable both for full coverage.

### ESLint (flat config)

Use the `recommended` preset to enable every rule at `error` in one line:

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
      'slot-variants/require-top-level-config': 'error'
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
    "slot-variants/require-top-level-config": "error"
  }
}
```

### Example

```typescript
import { sv, cn } from 'slot-variants';

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

`no-conflicting-classes` reports `flex` on the `base` literal and on both variant values; for the `cn()` call, both occurrences of `'flex'` are flagged. Move the shared class into `base` — or use compound variants — so each class has a single source.

```typescript
import { sv, cn } from 'slot-variants';

const extra = getDynamicClass();

sv({ base: extra });                   // dynamic base
sv({ base: `text-sm ${size}` });       // template with expression
sv({ ...rest, variants: {} });         // spread inside config
sv({ variants: { [key]: 'x' } });      // computed variant key
sv({ slots: { body: ['p-4', ...rest] } }); // spread inside slot array
cn(extra, 'flex');                     // identifier argument
```

`no-dynamic-classes` reports each of the dynamic positions above. Replace dynamic class strings with static ones (or move them to the runtime `class` / `className` prop on the returned function, which is intentionally outside the analyzer's scope) so every call can be statically verified.

```typescript
import { sv, cn } from 'slot-variants';

sv({ base: '' });                              // empty base
sv({ base: [] });                              // empty array
sv({ variants: { size: { sm: '' } } });        // empty variant value
sv({ compoundVariants: [{ size: 'lg', class: '' }] }); // empty compound class
cn('flex', '');                                // empty cn arg
sv();                                          // zero-arg call
cn();                                          // zero-arg call
```

`no-empty-classes` reports each empty class value — strings, arrays, or objects — plus zero-argument `sv()` / `cn()` calls (they always produce an empty string). The one exception is a direct empty string at `slots[key]`, which is allowed because declaring a slot with no default classes is a real use case (`sv({ slots: { extra: '' } })`). Either remove the empty value or replace it with a meaningful class string.

It also reports an empty array matcher value in `compoundVariants`/`compoundSlots`, since it can never match:

```typescript
sv({
  variants: { size: { sm: 'text-sm', lg: 'text-lg' } },
  compoundVariants: [
    { size: [], class: 'font-bold' } // unreachable — [] never matches
  ]
});
```

```typescript
import { sv, cn } from 'slot-variants';

sv({ base: ' flex items-center' });            // leading space
sv({ base: 'flex  items-center' });            // double space
sv({ slots: { body: 'p-4 ' } });               // trailing space
cn(`flex\titems-center`);                      // tab between tokens
```

`no-redundant-spaces` reports each literal whose whitespace deviates from the canonical "tokens separated by exactly one space" form. Trim and collapse the strings — or split them into array entries — so the stored class output is byte-stable and easy to scan in diffs. Run `eslint --fix` to apply the canonical form automatically; the fixer rewrites the literal in place using the original quote style.

```typescript
import { sv } from 'slot-variants';

const button = sv({
  variants: {
    size: {
      sm: 'rounded text-sm',
      lg: 'rounded text-lg'
    }
  },
  defaultVariants: { size: 'sm' }
});

const card = sv({
  slots: { root: 'flex', body: 'p-4' },
  variants: {
    size: {
      sm: { root: 'rounded text-sm', body: 'p-1' },
      lg: { root: 'rounded text-lg', body: 'p-2' }
    }
  },
  requiredVariants: ['size']
});
```

`no-shared-tokens` reports `rounded` in both `button` variant values and in both `card` `root` slot values, because the token is present in every value of an exhaustive variant. Lift that class into `base` — or into `slots.root` for slot-based variants — so each variant value contains only the classes that actually vary.

`eslint --fix` can do this automatically for `card`, since `slots.root` already exists as a plain string (`'flex'`) to lift `rounded` into. It can't for `button`, since there's no `base` property to lift `rounded` into — the finding is still reported, just without a fix.

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

`sv()` is a drop-in replacement for CVA. Rename `cva` to `sv` and `VariantProps` import source:

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

Everything else works identically — the config shape, `class`/`className` override, `VariantProps` extraction, and variant prop handling are all compatible.

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

**tailwind-merge** is not built-in but can be added via `postProcess`:

```typescript
import { sv } from 'slot-variants';
import { twMerge } from 'tailwind-merge';

const button = sv({
  base: 'px-4 py-2',
  variants: { size: { sm: 'px-2 py-1' } },
  postProcess: twMerge
});
```

To enable it globally — the closest equivalent to `tv`'s default `twMerge` — wrap it once with [`createSV()`](#shared-defaults-with-createsv) and import the result everywhere:

```typescript
// custom-sv.ts
import { createSV } from 'slot-variants';
import { twMerge } from 'tailwind-merge';

export const customSV = createSV({ postProcess: twMerge });
```
