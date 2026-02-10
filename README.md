# slot-variants

A lightweight, zero-dependency, type-safe library for managing class name variants with slots support.

## Installation

```bash
npm install slot-variants
```

## Overview

`slot-variants` exports two functions:

- **`sv()`** - creates variant-based class name generators with optional slots
- **`cn()`** - a utility for conditionally merging class names

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
cn('base', ['responsive'], { active: true }); // 'base active responsive'

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

### Base Only (No Config)

When called without a config object, `sv()` processes the base classes through `cn()` and returns a string:

```typescript
sv('btn btn-primary');              // 'btn btn-primary'
sv(['btn', 'btn-primary']);         // 'btn btn-primary'
sv({ btn: true, disabled: false }); // 'btn'
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

Variant values can be strings, arrays, or objects:

```typescript
const button = sv('btn', {
  variants: {
    size: {
      sm: ['px-2', 'py-1', 'text-sm'],                    // array
      lg: 'px-6 py-3 text-lg',                            // string
      xl: { 'px-8': true, 'py-4': true, 'text-xl': true } // object
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

Both `class` and `className` are supported, but `class` is prioritized when both are used in the same time.

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

### Caching

Results are cached automatically for performance. The default cache size is **256** entries. Calls with `class` or `className` props bypass the cache.

```typescript
const button = sv('btn', {
  variants: {
    size: {
      sm: 'text-sm',
      lg: 'text-lg'
    }
  },
  cacheSize: 512        // customize the cache size
});

button.getCacheSize();  // current number of cached entries
button.clearCache();    // clear all cached entries
```

### Introspection

The returned function exposes configuration properties for runtime introspection:

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
  }
});

button.variantKeys;      // ['size', 'intent']
button.variants;         // { size: { sm: 'text-sm', lg: 'text-lg' }, intent: { ... } }
button.slotKeys;         // ['base', 'icon']
button.slots;            // { icon: 'w-4 h-4' }
button.defaultVariants;  // { size: 'sm' }
button.requiredVariants; // ['intent']
button.presetKeys;       // ['cta']
button.presets;          // { cta: { size: 'lg', intent: 'primary' } }
```

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

// Extract the variant props type (excludes class/className)
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

### Exported Types

| Type | Description |
| --- | --- |
| `ClassValue` | Valid input types for `cn()` |
| `VariantProps<T, E>` | Extracts variant props from an `sv()` return type, optionally excluding keys in `E` |

### Return Type

- **Without slots** - the function returns a `string`
- **With slots** - the function returns a `Record` with `base` and each slot name as keys, all typed as `string`

## Config Reference

| Option | Type | Description |
| --- | --- | --- |
| `variants` | `SVVariants` | Variant definitions mapping variant names to their possible values |
| `slots` | `SVSlots` | Named slot definitions for multi-element components |
| `compoundVariants` | `Array` | Additional classes applied when multiple variant conditions match |
| `compoundSlots` | `Array` | Classes applied to multiple slots based on variant conditions |
| `defaultVariants` | `Object` | Default values for variants (static values or functions) |
| `requiredVariants` | `string[]` | Variant names that must be provided at call time |
| `presets` | `Record<string, Partial<VariantProps>>` | Named combinations of variant values selectable via `preset` prop |
| `postProcess` | `(className: string) => string` | Custom transformation applied to final class strings |
| `cacheSize` | `number` | Maximum number of cached results (default: `256`) |