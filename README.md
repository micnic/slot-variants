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

Compared to CVA and tailwind-variants, `sv()` adds required variants, shared variant presets, slot groups, and a built-in result cache, while staying dependency-free and noticeably faster at runtime — see the benchmarks in [`bench/`](bench) if you want the numbers. `tailwind-merge` integration is opt-in (via `postProcess`) rather than always on, and the bundled ESLint / oxlint plugin catches class conflicts and duplication at lint time.

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

The last argument is a config when it defines `slots` or `variants`; anything else is a class value. A component with neither declares `variants: {}`.

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

`class`, `className`, `preset`, and `slots` are reserved and can't be used as variant names.

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

A `true` or `false` key can sit beside named values too. The variant then accepts both booleans as well as its named values, and the boolean it doesn't name applies nothing:

```typescript
const badge = sv('badge', {
  variants: {
    size: { true: 'px-2', big: 'px-4' }
  }
});

badge({ size: true });  // 'badge px-2'
badge({ size: 'big' }); // 'badge px-4'
badge({ size: false }); // 'badge'
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

Default variants can also be functions that receive the call's props (including any [preset](#presets) values) and return a value. Return `undefined` to skip the variant:

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

The entry matches whenever those values apply, whether or not the preset itself was passed. Conditions written alongside `preset` override its values:

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

Presets can satisfy required variants, and `null` skips a preset's value just like a default. A preset can't share a name with a variant, and can also be used in a [compound variant](#compound-variants) or compound slot matcher.

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
        body: 'py-6',
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
// body:   'py-4 py-6'
// footer: 'border-t pt-4'
```

A boolean variant can also target slots — put the slot object under a `true` key (and, if needed, another under `false`):

```typescript
const card = sv('border rounded-lg', {
  slots: {
    header: 'font-bold',
    body: 'py-4'
  },
  variants: {
    highlighted: {
      true: {
        base: 'ring-2 ring-blue-500',
        header: 'bg-blue-100'
      }
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

Groups are only a shorthand for writing one class value for several slots — they never appear in the result. A group lists existing slots (not other groups), and its name can't match a slot name.

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

Compound slots support the same array matching and [`preset` matchers](#compound-variants) as compound variants, and the `slots` array accepts [group names](#slot-groups).

### Multi Slots

By default each slot in the result is a class string. Slots (or [groups](#slot-groups)) listed in `multiSlots` become functions instead, which accept variant props, a `preset`, and `class`/`className`, and return that slot's class string. Use this when one slot is rendered many times with different props, like the items of a list:

```typescript
const card = sv('border', {
  slots: {
    header: 'font-bold',
    body: 'py-4'
  },
  multiSlots: ['header'],
  variants: {
    size: {
      sm: { base: 'p-2', header: 'text-sm' },
      lg: { base: 'p-6', header: 'text-lg' }
    }
  }
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

A slot function inherits the outer call's preset, and its own `preset` takes precedence:

```typescript
const badge = sv({
  slots: {
    label: 'font-medium'
  },
  multiSlots: ['label'],
  variants: {
    tone: {
      neutral: { label: 'text-gray-900' },
      danger: { label: 'text-red-600' }
    }
  },
  presets: {
    alert: { tone: 'danger' },
    plain: { tone: 'neutral' }
  }
});

const result = badge({ preset: 'alert' });

result.label();                    // 'font-medium text-red-600' (outer preset)
result.label({ preset: 'plain' }); // 'font-medium text-gray-900'
result.label({ tone: 'neutral' }); // 'font-medium text-gray-900'
```

### Extending Components

`extend` builds a component on top of one or more existing `sv()` components. The child gets everything the parent defines, and its own config is merged in on top:

```typescript
const baseButton = sv('btn font-medium', {
  variants: {
    size: { sm: 'text-sm', lg: 'text-lg' }
  },
  defaultVariants: { size: 'sm' }
});

const iconButton = sv({
  extend: baseButton,
  base: 'inline-flex gap-2',
  variants: {
    size: { sm: 'p-1', xl: 'text-xl p-4' },
    round: { true: 'rounded-full' }
  }
});

iconButton();
// 'btn font-medium inline-flex gap-2 text-sm p-1'

iconButton({ size: 'xl', round: true });
// 'btn font-medium inline-flex gap-2 text-xl p-4 rounded-full'
```

How each option is merged:

- **Classes** (`base`, `slots`, and the classes of a variant value both define) are appended after the parent's — a child adds classes but never removes them. Add `postProcess: twMerge` to let a child's classes override conflicting parent ones.
- **`variants`** — new variants and new values are added; a value both define gets both sets of classes.
- **`defaultVariants`** — the child's defaults win.
- **`compoundVariants` / `compoundSlots`** — the child's entries run after the parent's.
- **`groups` / `presets`** — combined; a group or preset both define gets the slots, or the variant values, of both, the child's values winning.
- **`requiredVariants` / `multiSlots`** — combined. A child default for a variant the parent requires makes it optional, and a child requirement drops the parent's default.
- **`postProcess`, `cacheSize`, `introspection`** — the child's own, else the last parent's that sets one, else the `createSV()` default.

The child's types follow: it accepts the parent's variants, slots and presets everywhere its own are accepted, and its props and result include them.

Pass a list to extend several components; they are merged left to right, then the child on top:

```typescript
const card = sv({ extend: [surface, interactive], base: 'p-4', variants: {} });
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

A key of that object can also be a [group name](#slot-groups). Pass either `class` or `className`, not both.

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

`sv()` and `cn()` join classes in order without removing duplicates or resolving conflicts. Use `postProcess: twMerge` when you need that, or let the [ESLint / oxlint plugin](#eslint--oxlint-plugin) catch duplicates at lint time.

### Shared Defaults with `createSV()`

`createSV(defaults)` returns a pre-configured `sv()` that merges `defaults` into every config-based call. This avoids repeating the same options — most commonly `postProcess: twMerge` — across every component:

```typescript
import { createSV } from 'slot-variants';
import { twMerge } from 'tailwind-merge';

export const customSV = createSV({
  cacheSize: 512,
  postProcess: twMerge
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

`defaults` accepts `base`, `cacheSize`, `postProcess`, `introspection`, and `true`/`false` for `requiredVariants` and `multiSlots`. Component-specific options like `variants` or `slots` belong in each call. A per-call value always wins over the default, and the defaults are reflected in each component's types:

```typescript
const strictSV = createSV({ requiredVariants: true });

const badge = strictSV('badge', {
  variants: {
    tone: { info: 'bg-blue-100', warn: 'bg-amber-100' }
  }
});

badge({ tone: 'info' }); // 'badge bg-blue-100'
badge(); // Type error: `tone` is required
```

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

Raising `cacheSize` only helps when a component has more variant combinations than the current size; [`getMaxEntries()`](#introspection) tells you how many it has. Set `cacheSize` to `0` to disable caching.

`sv()` also works under a Content Security Policy that blocks `'unsafe-eval'`, just somewhat slower.

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
  presets: {
    cta: { size: 'lg', intent: 'primary' }
  },
  compoundVariants: [
    { size: 'lg', intent: 'danger', class: 'uppercase' }
  ],
  defaultVariants: {
    size: 'sm'
  },
  requiredVariants: ['intent'],
  introspection: true
});

button.base;                        // 'btn' — base args, `base` and `slots.base`, merged
button.variantKeys;                 // ['size', 'intent']
button.variants;                    // { size: { sm: 'text-sm', lg: 'text-lg' }, intent: { ... } }
button.slotKeys;                    // ['base', 'icon']
button.slots;                       // { icon: 'w-4 h-4' }
button.groupKeys;                   // ['all']
button.groups;                      // { all: ['base', 'icon'] }
button.defaultVariants;             // { size: 'sm' }
button.requiredVariants;            // ['intent']
button.multiSlots;                  // [] — no slots exposed as functions
button.presetKeys;                  // ['cta']
button.presets;                     // { cta: { size: 'lg', intent: 'primary' } }
button.compoundVariants;            // [{ size: 'lg', intent: 'danger', class: 'uppercase' }]
button.compoundSlots;               // [] — none configured
button.getVariantValues('size');    // ['sm', 'lg']
button.getVariantValues('intent');  // ['primary', 'danger']
button.splitProps(props);           // [variantProps, restProps]
button.explain(props);              // where each class of the call comes from
button.getMaxEntries();             // 6 — distinct variant combinations
button.getCacheSize();              // current number of cached entries
button.clearCache();                // clear all cached entries
```

Without `introspection: true`, these members don't exist and accessing them is a type error.

#### Splitting Props

`splitProps()` splits a props object into the props the variant function uses (its variants plus `class`, `className` and `preset`) and everything else, ready to forward to an element:

```tsx
const button = sv('btn', {
  variants: {
    size: { sm: 'text-sm', lg: 'text-lg' },
    intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
  },
  introspection: true
});

type ButtonProps = VariantProps<typeof button> &
  ComponentProps<'button'>;

const Button = (props: ButtonProps) => {

  const [variantProps, rest] = button.splitProps(props);

  return <button className={button(variantProps)} {...rest} />;
};
```

#### Explaining a Call

`explain()` takes the same props as the function and shows where each class of that call comes from: each variant's value and its source (`'prop'`, `'preset'`, `'default'` or `'unset'`), then, per slot, the slot's own classes, what each variant added, the matched compound entries, the `class`/`className` classes, the classes before and after `postProcess`, and the ones `postProcess` dropped:

```typescript
const button = sv('btn', {
  variants: {
    size: { sm: 'text-sm', lg: 'text-lg' },
    intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
  },
  compoundVariants: [
    { size: 'lg', intent: 'primary', class: 'uppercase' }
  ],
  defaultVariants: { intent: 'primary' },
  introspection: true
});

button.explain({ size: 'lg', class: 'mt-2' });
// {
//   variants: {
//     size: { value: 'lg', from: 'prop' },
//     intent: { value: 'primary', from: 'default' }
//   },
//   slots: {
//     base: {
//       base: 'btn',
//       variants: { size: 'text-lg', intent: 'bg-blue-500' },
//       compounds: [{ kind: 'compoundVariants', index: 0, class: 'uppercase' }],
//       class: 'mt-2',
//       raw: 'btn text-lg bg-blue-500 uppercase mt-2',
//       result: 'btn text-lg bg-blue-500 uppercase mt-2',
//       dropped: []
//     }
//   }
// }
```

A component without slots is reported under `slots.base`. A compound entry's `kind` and `index` point into `compoundVariants` or `compoundSlots`. With `postProcess: twMerge`, `dropped` lists the classes it removed. Invalid props throw like a call does, and the cache is left untouched.

### Errors & Validation

TypeScript catches most mistakes at compile time. At runtime, `sv()` throws an `Error` for an invalid config (such as an unknown variant, value, slot or preset name) as soon as it is defined, and for invalid props (a missing required variant, an unknown value or preset) when the variant function is called — useful for untyped input like form or API data.

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
// { size?: 'sm' | 'lg' | null | undefined; intent: 'primary' | 'danger' }
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

`SlotClassProps<T>` extracts the per-slot class injection shape from an `sv()` return type, keyed by `base`, each slot and each [group](#slot-groups) — useful when building wrapper components that expose a typed prop for consumers to pass additional classes into specific slots:

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

When used on an `sv()` definition without slots or groups, `SlotClassProps` resolves to `{ base?: ClassValue }`.

### Exported Types

| Type                 | Description                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ClassValue`         | Valid input types for `cn()`                                                                                                                                           |
| `VariantProps<T, E>` | Extracts variant props from an `sv()` return type, optionally excluding keys in `E`                                                                                    |
| `VariantValue<T, K>` | Extracts the value union for a single variant key `K`, without `undefined`                                                                                             |
| `SlotClassProps<T>`  | Extracts the per-slot class injection shape from an `sv()` return type                                                                                                 |
| `SV<D, DR, DM>`      | The shape of an `sv()` function, with the factory's `introspection` (`D`), `requiredVariants` (`DR`) and `multiSlots` (`DM`) defaults; the return type of `createSV()` |

### Return Type

- **Without slots** - the function returns a `string`, unless [`multiSlots`](#multi-slots) is `true` or lists `base` — then it returns `{ base }`, with `base` a slot function
- **With slots** - the function returns a `Record` with `base` and each slot name as keys, each typed as `string` — or, for a slot listed in [`multiSlots`](#multi-slots), as a slot function that returns a `string`

## Config Reference

Class values inside the config accept `string`, `string[]`, or `undefined`. Dynamic class values (objects, booleans, nested arrays) are only accepted at call time via the `class`/`className` prop.

Options are listed in the order enforced by the opt-in [`sv-config-style`](#slot-variantssv-config-style) lint rule.

| Option             | Type                                                                    | Description                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extend`           | `sv()` component or array of them                                       | `sv()` components whose config this one [builds on](#extending-components)                                                                               |
| `base`             | `string \| string[]`                                                    | Additional base classes merged with the base argument and `slots.base`                                                                                   |
| `slots`            | `Record<string, string \| string[]>`                                    | Named slot definitions for multi-element components                                                                                                      |
| `groups`           | `Record<string, string[]>`                                              | Named sets of slot names, usable anywhere a slot name is accepted                                                                                        |
| `multiSlots`       | `string[] \| boolean`                                                   | Slot names exposed as reconfigurable functions instead of strings; `true` makes every slot a function, `false` none                                      |
| `variants`         | `Record<string, Record<string \| number, Value> \| string \| string[]>` | Variant names mapped to their values, or to a class value ([boolean shorthand](#boolean-variants)); `Value` is `string \| string[]` or a per-slot object |
| `presets`          | `Record<string, Partial<VariantProps>>`                                 | Named combinations of variant values selectable via `preset` prop                                                                                        |
| `compoundSlots`    | `Array`                                                                 | Classes applied to multiple slots based on variant conditions                                                                                            |
| `compoundVariants` | `Array`                                                                 | Additional classes applied when multiple variant conditions match                                                                                        |
| `defaultVariants`  | `Object`                                                                | Default values for variants (static values or functions)                                                                                                 |
| `requiredVariants` | `string[] \| boolean`                                                   | Variant names that must be provided at call time; `true` makes every variant required, `false` none                                                      |
| `cacheSize`        | `number`                                                                | Maximum number of cached results (default: `256`); `0` or a negative value disables caching                                                              |
| `introspection`    | `boolean`                                                               | When `true`, exposes variant/slot/preset introspection and cache methods on the returned function (default: `false`)                                     |
| `postProcess`      | `(className: string) => string`                                         | Custom transformation applied to final class strings                                                                                                     |

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
  multiSlots: ['item'],
  variants: { active: 'bg-blue-100' }
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

`slot-variants` ships an ESLint plugin at `slot-variants/eslint-plugin`, for ESLint v9+ (flat config) and [oxlint](https://oxc.rs/docs/guide/usage/linter/js-plugins) (`jsPlugins`). It's a separate entry point, so it never ends up in your app bundle.

### Rules

Rules check calls to `sv`/`cn` imported from `'slot-variants'` and to functions created with [`createSV()`](#shared-defaults-with-createsv).

#### `slot-variants/no-conflicting-classes`

Flags classes that collide in the output of an `sv()` or `cn()` call: exact duplicates and Tailwind utilities that target the same property (e.g. `w-100`/`w-200`, `px-4`/`pl-2`, or `[color:red]`/`[color:blue]`). Classes that can never apply together, like two values of the same variant, are not flagged. Single-word utilities (`flex`, `block`) are ignored unless `exclusiveGroups` is set. If your Tailwind v3 config sets a `prefix`, pass it via the `prefix` option.

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

It also flags a slot object whose keys reach the same slot twice (a slot and a group containing it, or two overlapping groups):

```typescript
const card = sv({
  slots: { header: 'font-bold', body: 'text-sm' },
  groups: { content: ['header', 'body'] },
  variants: {
    size: { lg: { header: 'px-6', content: 'px-2' } } // header gets both
  }
});

card({ class: { header: 'mt-1', content: 'mt-2' } }); // same, at a call site
```

A group that lists the same slot twice is flagged and auto-fixed.

`exclusiveGroups: true` turns on built-in groups of mutually exclusive Tailwind utilities (`display`, `position`, etc.). Or pass your own groups, written without `md:`-style variants or the `prefix`:

```js
'slot-variants/no-conflicting-classes': ['error', {
  exclusiveGroups: [
    ['flex', 'grid', 'block', 'hidden'],
    ['static', 'relative', 'absolute', 'fixed', 'sticky']
  ]
}]
```

#### `slot-variants/no-dynamic-classes`

Flags class values that can't be known at lint time (variables, function calls, spreads, computed keys, template expressions), so the other rules can check every class. Simple conditionals in `cn()` (`cond && 'px-4'`, `cond ? 'px-4' : 'px-2'`) are allowed when every branch is static.

```typescript
const extra = getDynamicClass();

sv({ base: extra, variants: {} }); // dynamic base
sv({ variants: { [key]: 'x' } });  // computed variant key
cn(extra, 'flex');                 // identifier argument
```

Replace dynamic class strings with static ones, or move them to the runtime `class` / `className` prop, which this rule leaves alone. The output of another `sv()`/`cn()` call counts as static:

```tsx
const classes = card();

cn(classes.base, 'p-4'); // allowed — `classes.base` resolves to card()'s base slot
```

#### `slot-variants/no-empty-classes`

Flags empty class values (empty strings, arrays, objects), zero-argument `sv()` / `cn()` calls, and empty compound matcher arrays. Partially auto-fixable.

```typescript
sv({ base: '', variants: {} });         // empty base
sv({ variants: { size: { sm: [] } } }); // empty variant value
sv();                                   // zero-arg call — always produces ''
```

An empty string is allowed as a slot or variant value, since declaring a slot or value with no classes of its own is meaningful:

```typescript
sv({ slots: { body: '' } });                            // allowed
sv({ variants: { size: { sm: '', lg: 'text-lg' } } });  // allowed
```

#### `slot-variants/no-redundant-spaces`

Flags class strings whose whitespace isn't canonical (leading/trailing space, repeated spaces, tabs, newlines). Auto-fixable.

```typescript
sv({ base: ' flex items-center', variants: {} }); // leading space
sv({ base: 'flex  items-center', variants: {} }); // double space
```

Run `eslint --fix` to rewrite these to the canonical single-space form.

#### `slot-variants/no-restyle`

Flags classes added on top of an `sv()` / `cn()` result that collide with the classes it already applies, using the same checks as [`no-conflicting-classes`](#slot-variantsno-conflicting-classes). It checks three places:

```tsx
const card = sv('border p-2', { slots: { header: 'font-bold px-4' } });

// 1. The runtime `class` / `className` override, including the per-slot form
card({ class: 'p-4' });                  // p-4 vs p-2
card({ class: { header: 'px-8' } });     // px-8 vs px-4

// 2. Literal classes written next to a slot-variants result in one class list
const classes = card();

<div className={cn(classes.base, 'p-4')} />;
<div className={`${classes.header} px-8`} />;

// 3. The class attribute of a component that forwards the prop into 1. or 2.
function Button({ className }) {
  return <button className={card({ class: className }).base} />;
}

<Button className="p-4" />;              // p-4 vs p-2
```

The same checks apply to Svelte and Vue templates and components (with `svelte-eslint-parser` / `vue-eslint-parser` configured as usual):

```svelte
<div class="p-4 {classes.base}">…</div>
```

```vue
<div :class="[classes.base, 'p-4']">…</div>
```

Classes from variant values the call doesn't select are ignored, so `card({ size: 'sm', class: 'mt-4' })` doesn't collide with a margin from `size: 'lg'`. The same goes for a component that passes a variant on from its own props: `<Button size="sm" className="…" />` is checked against `size: 'sm'`, and an element that doesn't pass `size` against the prop's default, if it has one: `{ size = 'sm' }`, Vue's `withDefaults()` or `default`, or Solid's `merge({ size: 'sm' }, props)`. Props spread into the call (`{ ...rest }`) and a forwarded `preset` are followed the same way, while a variant that comes from no prop, like `size: big ? 'lg' : 'sm'`, may take any of its values.

Components imported from another file are followed to the file that declares them (ESLint only; under oxlint, imported components are skipped):

```tsx
// ui/button.tsx
const button = sv({ base: 'p-2 rounded', variants: {} });

export function Button({ className }) {
  return <button className={button({ class: className })} />;
}

// page.tsx
import { Button } from './ui/button.tsx';

<Button className="p-4" />; // p-4 vs the button's own p-2
```

Relative imports work out of the box; path aliases need the `alias` option. Packages from `node_modules` are not followed.

```js
'slot-variants/no-restyle': ['error', { alias: { '@/': './src' } }]
```

`exclusiveGroups` and `prefix` work as in [`no-conflicting-classes`](#slot-variantsno-conflicting-classes).

Either drop the overriding class, or, if the override is deliberate, move it into the config as a variant.

#### `slot-variants/no-shared-tokens`

Flags classes repeated in every value of a variant that always applies (it has a default or is required). Those classes belong in `base` (or the matching slot), and the rule offers to move them there.

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

`rounded` is in every value of `size` — move it into `base`.

The rule also flags a `compoundVariants`/`compoundSlots` entry that matches only one variant, since its class belongs on that variant's value instead:

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

Move `hover:underline` into `variants.variant.link`.

#### `slot-variants/require-top-level-config`

Flags `sv()` calls with a config that aren't at module top level — inside a function, a loop, a class field, a template, or a Svelte `<script>` / Vue `<script setup>` block. Such a call is rebuilt every time it runs and loses its cache.

```typescript
function createButton() {
  return sv('btn', { variants: { size: { sm: 'text-sm' } } }); // rebuilt on every call
}

class Card {
  button = sv('btn', { variants: { size: { sm: 'text-sm' } } }); // rebuilt on every `new Card()`
}
```

Move the `sv()` call to a module-level `const`.

#### `slot-variants/sv-config-style`

Enforces the config key order shown in the [Config Reference](#config-reference) and one way of writing base classes, chosen with the `baseStyle` option (`'field'` by default):

- `'field'` — a `base` field inside the config (tv-style)
- `'separateArg'` — a leading class argument before the config object (cva-style)
- `'slotsBase'` — a `base` entry inside `slots`, only enforced once the config already declares `slots`

```typescript
sv({ variants: { size: { sm: 'text-sm' } }, base: 'flex' }); // base out of order

sv('flex', { variants: {} }); // baseStyle: 'field' expects a base field instead
```

Auto-fixable when the fix is unambiguous. Not part of `recommended`, since it's purely stylistic — enable it explicitly.

### ESLint (flat config)

The `recommended` preset enables every rule except `sv-config-style`:

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
      'slot-variants/no-restyle': 'error',
      'slot-variants/no-shared-tokens': 'error',
      'slot-variants/require-top-level-config': 'error',
      'slot-variants/sv-config-style': ['error', { baseStyle: 'field' }]
    }
  }
];
```

In a CommonJS config (`eslint.config.cjs`), the plugin is the module's `default` export:

```js
const svPlugin = require('slot-variants/eslint-plugin').default;

module.exports = [svPlugin.configs.recommended];
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
    "slot-variants/no-restyle": "error",
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

### oxfmt

[oxfmt](https://oxc.rs/docs/guide/usage/formatter) sorts Tailwind classes natively. List the functions under `sortTailwindcss.functions` in `.oxfmtrc.json`:

```json
{
  "sortTailwindcss": {
    "functions": ["cn", "sv"]
  }
}
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

| Feature                | tailwind-variants                          | slot-variants                                                  |
| ---------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| Slot return type       | Always functions: `slot({ class: '...' })` | Strings by default; functions for slots listed in `multiSlots` |
| `extend` (composition) | Supported                                  | Supported, append-only like `tv`; see below                    |
| Built-in `twMerge`     | Enabled by default                         | Use `postProcess: twMerge`, globally via `createSV`            |

**Slot return type** is the most significant difference. In `tv()`, each slot returns a function that can accept additional props. In `sv()`, slots resolve to strings directly — use the `class` prop with a slot object for per-slot overrides, or list a slot in [`multiSlots`](#multi-slots) to expose it as a `tv`-style reconfigurable function:

```typescript
// tailwind-variants
const { base, icon } = component({ size: 'sm' });
base({ class: 'extra' }); // slot is a function

// slot-variants
const { base, icon } = component({ size: 'sm', class: { base: 'extra' } });
base; // slot is a string
```

**`extend`** merges configs the same way `tv` does. As `tv` resolves the resulting class conflicts with its built-in `twMerge`, add `postProcess: twMerge` to a parent (children inherit it) to get the same output.

**tailwind-merge** is not built in but can be added via `postProcess`, or applied globally with [`createSV()`](#shared-defaults-with-createsv) — the closest equivalent to `tv`'s default `twMerge`:

```typescript
// custom-sv.ts
import { createSV } from 'slot-variants';
import { twMerge } from 'tailwind-merge';

export const customSV = createSV({ postProcess: twMerge });
```