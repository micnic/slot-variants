# AGENTS.md - AI Agent Guide for slot-variants

## Overview

`slot-variants` is a lightweight, zero-dependency, type-safe library for managing CSS class name variants with slots support.

## Quick Reference

```typescript
import { sv, cn, type VariantProps } from 'slot-variants';
```

## Best Practices

### 1. Keep CSS Classes Mutually Exclusive

Define classes in base and variants such that they don't overlap. Use compound variants for intersecting classes to avoid duplication:

```typescript
// GOOD - classes are mutually exclusive
const button = sv('btn', {
	variants: {
		size: { sm: 'text-sm', lg: 'text-lg' },
		intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
	},
	compoundVariants: [{ size: 'lg', intent: 'primary', class: 'font-bold' }]
});

// AVOID - duplicate classes across variants
const buttonBad = sv('btn font-medium', {
	variants: {
		size: { sm: 'text-sm font-medium', lg: 'text-lg font-medium' }
	}
});
```

### 2. Use Boolean Shorthand for Simple States

For boolean variants (on/off), use shorthand to reduce boilerplate:

```typescript
// GOOD - boolean shorthand
const button = sv('btn', {
	variants: {
		disabled: 'opacity-50 cursor-not-allowed',
		loading: 'animate-spin pointer-events-none'
	}
});

button({ disabled: true, loading: false });

// AVOID - verbose boolean record
const buttonVerbose = sv('btn', {
	variants: {
		disabled: {
			true: 'opacity-50 cursor-not-allowed',
			false: ''
		}
	}
});
```

### 3. Use Required Variants for Mandatory Props

When a variant must always be provided, use `requiredVariants`:

```typescript
const button = sv('btn', {
	variants: {
		size: { sm: 'text-sm', lg: 'text-lg' },
		intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
	},
	requiredVariants: ['intent'] // intent must always be provided
});

// button() throws: Missing required variant: "intent"
button({ intent: 'primary' }); // OK
```

### 4. Use Slots for Multi-Element Components

For components with multiple elements (card, dialog, etc.), use slots:

```typescript
const card = sv('border rounded-lg', {
	slots: {
		header: 'font-semibold px-4 py-2',
		body: 'px-4 py-4',
		footer: 'px-4 py-2 border-t'
	}
});

const { base, header, body, footer } = card();
// Use: <div class={base}><header class={header}>...</div>
```

### 5. Use VariantProps Type for Component Props

Extract types for React/Preact/Vue component props:

```typescript
const button = sv('btn', {
	variants: {
		size: { sm: 'text-sm', lg: 'text-lg' },
		intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
	},
	requiredVariants: ['intent']
});

type ButtonProps = VariantProps<typeof button>;
// { size?: 'sm' | 'lg' | undefined; intent: 'primary' | 'danger' }

// Exclude internal variants from props
type InternalButtonProps = VariantProps<typeof button, 'internalState'>;
```

### 6. Use Compound Variants for Conditional Combinations

Apply classes when multiple conditions are met:

```typescript
const button = sv('btn', {
	variants: {
		size: { sm: 'text-sm', lg: 'text-lg' },
		intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
	},
	compoundVariants: [
		{ size: 'lg', intent: 'primary', class: 'font-bold uppercase' }
	]
});

button({ size: 'lg', intent: 'primary' });
// Includes: 'btn text-lg bg-blue-500 font-bold uppercase'
```

### 7. Use Function-Based Default Variants for Dynamic Defaults

For defaults that depend on other variant values:

```typescript
const button = sv('btn', {
	variants: {
		size: { sm: 'text-sm', lg: 'text-lg' },
		intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
	},
	defaultVariants: {
		size: 'sm',
		intent: (props) => (props.size === 'lg' ? 'danger' : 'primary')
	}
});
```

### 8. Use Post-Processing with tailwind-merge

For Tailwind projects, use `postProcess` to handle class conflicts:

```typescript
import { sv } from 'slot-variants';
import { twMerge } from 'tailwind-merge';

const button = sv('px-4 py-2', {
	variants: {
		size: {
			sm: 'px-2 py-1 text-sm',
			lg: 'px-6 py-3 text-lg'
		}
	},
	postProcess: twMerge
});

// tailwind-merge handles conflicting classes
button({ size: 'lg', class: 'px-2' });
// Result: 'px-2 py-3 text-lg' (not 'px-4 px-2 py-2')
```

### 9. Leverage Caching for Performance

The library caches results automatically (default 256 entries). Estimate the cache size based on the number of variant combinations and enlarge it accordingly:

```typescript
// Estimate: size * intent * disabled = 2 * 2 * 2 = 8 combinations
const button = sv('btn', {
	variants: {
		size: { sm: 'text-sm', lg: 'text-lg' },
		intent: { primary: 'bg-blue-500', danger: 'bg-red-500' },
		disabled: 'opacity-50 cursor-not-allowed'
	},
	cacheSize: 512 // increase cache for complex components
});

// Access cache methods
button.getCacheSize();
button.clearCache();
```

Note: Using `class` or `className` prop bypasses caching.

### 10. Use Presets for Reusable Variant Combinations

Define presets for frequently used combinations of variants (rarely needed):

```typescript
const button = sv('btn', {
	variants: {
		size: { sm: 'text-sm', lg: 'text-lg' },
		intent: { primary: 'bg-blue-500', danger: 'bg-red-500' },
		rounded: { true: 'rounded-full', false: 'rounded-md' }
	},
	presets: {
		primarySm: { size: 'sm', intent: 'primary', rounded: false },
		cta: { size: 'lg', intent: 'primary', rounded: true }
	}
});

button({ preset: 'cta' });
```

### 11. Use Introspection for Single Source of Truth

The returned function exposes configuration properties for runtime introspection. Use these to access variant/slot definitions and reuse them elsewhere, avoiding duplication:

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

button.variantKeys; // ['size', 'intent']
button.variants; // { size: { sm: 'text-sm', lg: 'text-lg' }, intent: { ... } }
button.slotKeys; // ['base', 'icon']
button.slots; // { icon: 'w-4 h-4' }
button.defaultVariants; // { size: 'sm' }
button.requiredVariants; // ['intent']
button.presetKeys; // ['cta']
button.presets; // { cta: { size: 'lg', intent: 'primary' } }
```

Use introspection to share variant/slot definitions with other parts of your codebase:

```typescript
// variants.ts - centralize variant definitions
export const button = sv('btn font-medium rounded-lg', {
  variants: {
    size: {
      sm: 'text-sm px-3 py-1.5',
      md: 'text-base px-4 py-2',
      lg: 'text-lg px-6 py-3'
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

// Reuse variant keys for form validation
const validSizes = button.variantKeys.includes('size')
  ? Object.keys(button.variants.size as Record<string, string>)
  : [];
// validSizes: ['sm', 'md', 'lg']

// Reuse slot keys for component composition
const card = sv('card', {
  slots: {
    header: 'font-bold',
    body: 'py-4'
  }
});

// Dynamically render all slots
function renderCardWithSlots(slotClasses: ReturnType<typeof card>) {
  return card.slotKeys.map((key) => (
    <div key={key} className={slotClasses[key as keyof typeof slotClasses]}>
      {key}
    </div>
  ));
}
```

This approach ensures variant and slot definitions live in one place, making updates easy and reducing the risk of inconsistencies.

## Common Patterns

### React Component Pattern

```typescript
// button.ts
import { sv, type VariantProps } from 'slot-variants';

const button = sv('btn font-medium rounded-lg', {
  variants: {
    size: {
      sm: 'text-sm px-3 py-1.5',
      md: 'text-base px-4 py-2',
      lg: 'text-lg px-6 py-3'
    },
    intent: {
      primary: 'bg-blue-500 text-white hover:bg-blue-600',
      secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
      danger: 'bg-red-500 text-white hover:bg-red-600'
    },
    disabled: {
      true: 'opacity-50 cursor-not-allowed pointer-events-none'
    }
  },
  defaultVariants: {
    size: 'md',
    intent: 'primary'
  }
});

export type ButtonProps = VariantProps<typeof button>;

export const Button = ({ class: className, ...props }: ButtonProps & { class?: string }) => {
  return <button className={button({ ...props, class: className })} />;
};
```

### Multi-Element Component Pattern

```typescript
// card.ts
import { sv, type VariantProps } from 'slot-variants';

const card = sv('border rounded-lg shadow-sm', {
	slots: {
		header: 'font-semibold px-4 py-3 border-b',
		body: 'px-4 py-4',
		footer: 'px-4 py-3 border-t bg-gray-50'
	},
	variants: {
		size: {
			sm: { base: 'p-2', header: 'text-sm', body: 'text-sm' },
			md: { base: 'p-4', header: 'text-base', body: 'text-base' },
			lg: { base: 'p-6', header: 'text-lg', body: 'text-lg' }
		},
		elevated: {
			true: { base: 'shadow-lg' }
		}
	},
	compoundSlots: [{ slots: ['header', 'footer'], class: 'text-gray-600' }]
});

type CardProps = VariantProps<typeof card>;

export const Card = (props: CardProps) => {
	const { base, header, body, footer } = card(props);
	return { base, header, body, footer };
};
```

## Configuration Reference

| Option             | Type                             | Description                       |
| ------------------ | -------------------------------- | --------------------------------- |
| `variants`         | `Record<string, VariantConfig>`  | Variant definitions               |
| `slots`            | `Record<string, ClassValue>`     | Named slot definitions            |
| `compoundVariants` | `CompoundVariant[]`              | Conditional class combinations    |
| `compoundSlots`    | `CompoundSlot[]`                 | Multi-slot conditional classes    |
| `defaultVariants`  | `Record<string, Value>`          | Static or function-based defaults |
| `requiredVariants` | `string[]`                       | Mandatory variant names           |
| `presets`          | `Record<string, Partial<Props>>` | Named preset combinations         |
| `postProcess`      | `(className: string) => string`  | Class transformation              |
| `cacheSize`        | `number`                         | Cache size (default: 256)         |

## Exported Types

- `ClassValue` - Valid input for `cn()` (string, array, object, boolean, null, undefined)
- `VariantProps<T, E>` - Extract variant props from an `sv()` return, optionally excluding keys

## Imports

```typescript
// Default exports
import { sv, cn } from 'slot-variants';

// Types only
import type { VariantProps, ClassValue } from 'slot-variants';
```

## Performance Notes

1. **Caching is automatic** - Results are cached by default
2. **Class prop bypasses cache** - Dynamic classes at runtime should use `class` prop
3. **Complex components benefit from larger cache** - Increase `cacheSize` for components with many variant combinations
4. **Prefer static defaults** - Function-based defaults are called on every invocation
