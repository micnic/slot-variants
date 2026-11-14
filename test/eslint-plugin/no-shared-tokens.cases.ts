import {
	IMPORT,
	IMPORT_CN,
	IMPORT_CREATE_SV,
	IMPORT_NS,
	repeat,
	shared,
	sharedLift,
	singleKeyCompound
} from './helpers.ts';

export const NO_SHARED_TOKENS_VALID = [
	// A record mixing `true` with named keys also takes `false`, which applies
	// nothing, so a token in every written value isn't always applied.
	IMPORT +
		"sv({ variants: { size: { true: 'p-2 a', big: 'p-2 b' } }, requiredVariants: true });",
	// Non-object variants field bails out immediately.
	IMPORT + 'sv({ variants: dynamic });',
	// No defaultVariants and no requiredVariants — variant prop
	// can be undefined at runtime, no value branch is guaranteed.
	IMPORT +
		"sv({ variants: { size: { sm: 'rounded text-sm', lg: 'rounded text-lg' } } });",
	// defaultVariants targets a different variant — `size` still
	// not exhaustive.
	IMPORT +
		`sv({
			variants: {
				size: { sm: 'rounded text-sm', lg: 'rounded text-lg' },
				intent: { primary: 'bg-blue-500', danger: 'bg-red-500' }
			},
			defaultVariants: { intent: 'primary' }
		});`,
	// Explicit undefined default does not make a variant exhaustive.
	IMPORT +
		`sv({
			variants: {
				size: { sm: 'rounded text-sm', lg: 'rounded text-lg' }
			},
			defaultVariants: { size: undefined }
		});`,
	// Dynamic/function defaults may return undefined, so they do
	// not prove a value branch always renders.
	IMPORT +
		`sv({
			variants: {
				size: { sm: 'rounded text-sm', lg: 'rounded text-lg' },
				intent: { primary: 'font-bold text-blue', danger: 'font-bold text-red' }
			},
			defaultVariants: {
				size: getDefaultSize(),
				intent: () => 'primary'
			}
		});`,
	// Single-value variant that isn't exhaustive — the prop can be left off, so
	// the value doesn't always apply.
	IMPORT + "sv({ variants: { size: { sm: 'rounded text-sm' } } });",
	// Token in only some values, not all.
	IMPORT +
		`sv({
			variants: {
				size: {
					sm: 'rounded text-sm',
					md: 'text-md',
					lg: 'rounded text-lg'
				}
			},
			defaultVariants: { size: 'md' }
		});`,
	// Boolean shorthand — only one branch fires.
	IMPORT +
		`sv({
			variants: { disabled: 'opacity-50 cursor-not-allowed' },
			defaultVariants: { disabled: false }
		});`,
	// A `true`-only slot object — the `false` side applies nothing.
	IMPORT +
		`sv({
			slots: { body: 'p-4' },
			variants: { disabled: { true: { body: 'opacity-50' } } },
			defaultVariants: { disabled: false }
		});`,
	// A record with only a `true` value still accepts `false`, which applies
	// nothing — here it's even the default, so the value's tokens aren't
	// constant.
	IMPORT +
		`sv({
			base: 'x',
			variants: { disabled: { true: 'opacity-50 cursor-not-allowed' } },
			defaultVariants: { disabled: false }
		});`,
	// The same holds for a required variant, and for a lone `false` value.
	IMPORT +
		`sv({
			variants: {
				disabled: { true: 'opacity-50 cursor-not-allowed' },
				open: { false: 'hidden' }
			},
			requiredVariants: true
		});`,
	// Spread inside variant value record — can't enumerate values.
	IMPORT +
		`sv({
			variants: {
				size: { ...extra, sm: 'rounded text-sm', lg: 'rounded text-lg' }
			},
			defaultVariants: { size: 'sm' }
		});`,
	// Computed key inside variant value record — same reason.
	IMPORT +
		`sv({
			variants: {
				size: { [k]: 'x', sm: 'rounded text-sm', lg: 'rounded text-lg' }
			},
			defaultVariants: { size: 'sm' }
		});`,
	// Spread in defaultVariants is ignored while static keys still
	// make the variant exhaustive.
	IMPORT +
		`sv({
			variants: {
				size: { sm: 'rounded text-sm', lg: 'text-lg' }
			},
			defaultVariants: { ...defaults, size: 'sm' }
		});`,
	// Non-string requiredVariants entries are ignored, and computed
	// top-level variant keys are skipped before analysis continues.
	IMPORT +
		`sv({
			variants: {
				[k]: { sm: 'rounded text-sm', lg: 'rounded text-lg' },
				size: { sm: 'text-sm', lg: 'text-lg' }
			},
			requiredVariants: [42, 'size']
		});`,
	// Shared token only in one slot for one value, missing in another.
	IMPORT +
		`sv({
			slots: { root: 'flex', body: 'p-4' },
			variants: {
				size: {
					sm: { root: 'rounded text-sm', body: 'p-1' },
					lg: { root: 'text-lg', body: 'rounded p-2' }
				}
			},
			defaultVariants: { size: 'sm' }
		});`,
	// Token in every value but in different slots — not shared
	// per-slot.
	IMPORT +
		`sv({
			slots: { root: 'flex', body: 'p-4' },
			variants: {
				size: {
					sm: { root: 'rounded' },
					lg: { body: 'rounded' }
				}
			},
			defaultVariants: { size: 'sm' }
		});`,
	// cn() call — never analyzed.
	IMPORT_CN + "cn('flex', 'flex-row');",
	// sv() with no config — never analyzed.
	IMPORT + "sv('flex', 'rounded');",
	// Without the import the rule stays quiet.
	"sv({ variants: { size: { sm: 'rounded', lg: 'rounded' } }, defaultVariants: { size: 'sm' } });",
	// Dynamic variant value — opaque, no tokens collected.
	IMPORT +
		`sv({
			variants: { size: { sm: dynamic, lg: 'rounded' } },
			defaultVariants: { size: 'sm' }
		});`,
	// Empty config — no variants.
	IMPORT + 'sv({});',
	// `requiredVariants: false` marks nothing required — without a
	// default the variant is not exhaustive, so the shared token
	// is not flagged.
	IMPORT +
		`sv({
			variants: {
				size: { sm: 'rounded text-sm', lg: 'rounded text-lg' }
			},
			requiredVariants: false
		});`,
	// A compound entry with two matcher keys is combining variants — the
	// single-key check doesn't apply.
	IMPORT +
		`sv({
			variants: {
				variant: { primary: 'a', link: 'b' },
				size: { sm: 'c', lg: 'd' }
			},
			compoundVariants: [
				{ variant: 'link', size: 'sm', className: 'e' }
			]
		});`,
	// A single-key compound entry without a class has nothing to merge into
	// the matched variant value, so the single-key check doesn't apply.
	IMPORT +
		`sv({
			variants: { variant: { primary: 'a', link: 'b' } },
			compoundVariants: [{ variant: 'link' }]
		});`,
	// A dynamic `variants` object means the matcher's variant can't be
	// resolved, so there's nowhere known to merge the class into.
	IMPORT +
		`sv({
			variants: dynamicVariants,
			compoundVariants: [{ variant: 'link', className: 'e' }]
		});`,
	// An array shorthand has a single branch — no other value to hold the
	// class for the matcher's false case.
	IMPORT +
		`sv({
			variants: {
				variant: { primary: 'a', link: 'b' },
				disabled: ['opacity-50']
			},
			compoundVariants: [{ disabled: true, className: 'e' }]
		});`,
	// A spread inside the compound entry could hide a second matcher, so the
	// entry is skipped entirely rather than risk under-reporting it.
	IMPORT +
		`sv({
			variants: { variant: { primary: 'a', link: 'b' } },
			compoundVariants: [{ ...rest, variant: 'link', className: 'e' }]
		});`,
	// A computed key could likewise hide a second matcher.
	IMPORT +
		`sv({
			variants: { variant: { primary: 'a', link: 'b' } },
			compoundVariants: [{ variant: 'link', [k]: true, className: 'e' }]
		});`,
	// A `preset` matcher adds the preset's own variant values as matchers, so
	// the entry is combining variants after all.
	IMPORT +
		`sv({
			slots: { icon: 'w-4' },
			variants: {
				size: { sm: 'a', lg: 'b' },
				tone: { y: 't', z: 'u' }
			},
			presets: { hero: { tone: 'y' } },
			compoundVariants: [{ size: 'sm', preset: 'hero', class: 'q' }],
			compoundSlots: [{ slots: ['icon'], size: 'sm', preset: 'hero', class: 'r' }]
		});`,
	// No matcher at all — this entry always applies, a different concern than
	// this check.
	IMPORT +
		`sv({
			variants: { variant: { primary: 'a', link: 'b' } },
			compoundVariants: [{ className: 'e' }]
		});`,
	// A non-object compound entry (e.g. a spread source read as an
	// identifier) is skipped rather than inspected.
	IMPORT +
		`sv({
			variants: { variant: { primary: 'a', link: 'b' } },
			compoundVariants: [dynamicEntry, { variant: 'primary', size: 'sm', className: 'p-1' }]
		});`
];

export const NO_SHARED_TOKENS_INVALID = [
	{
		// A `defaultVariants` value read through a `const` still makes the
		// variant exhaustive.
		code:
			IMPORT +
			"const SIZE = 'sm';\nsv({ variants: { size: { sm: 'flex a', lg: 'flex b' } }, defaultVariants: { size: SIZE } });",
		output: null,
		errors: repeat(
			sharedLift(
				'flex',
				'size',
				IMPORT +
					"const SIZE = 'sm';\nsv({ base: 'flex', variants: { size: { sm: 'a', lg: 'b' } }, defaultVariants: { size: SIZE } });"
			),
			2
		)
	},
	{
		// A single-key compound's matcher is read through a `const` binding.
		code:
			IMPORT +
			"const SM = 'sm';\nsv({ variants: { size: { sm: 'p-1', lg: 'p-2' } }, compoundVariants: [{ size: SM, class: 'gap-2' }] });",
		output:
			IMPORT +
			"const SM = 'sm';\nsv({ variants: { size: { sm: 'p-1 gap-2', lg: 'p-2' } } });",
		errors: [singleKeyCompound('compoundVariants', 'size', 'SM')]
	},
	{
		// The same for an element of an array matcher.
		code:
			IMPORT +
			"const LG = 'lg';\nsv({ variants: { size: { sm: 'p-1', lg: 'p-2', xl: 'p-3' } }, compoundVariants: [{ size: [LG, 'xl'], class: 'gap-4' }] });",
		output:
			IMPORT +
			"const LG = 'lg';\nsv({ variants: { size: { sm: 'p-1', lg: 'p-2 gap-4', xl: 'p-3 gap-4' } } });",
		errors: [singleKeyCompound('compoundVariants', 'size', "[LG, 'xl']")]
	},
	{
		// A `true` key is a value like any other, so a compound matching only
		// it is reported; its value is a slot object, so there's no fix.
		code:
			IMPORT +
			`sv({
			slots: { body: 'p-4' },
			variants: {
				variant: { primary: 'a', link: 'b' },
				disabled: { true: { body: 'opacity-50' } }
			},
			compoundVariants: [{ disabled: true, className: 'e' }]
		});`,
		output: null,
		errors: [singleKeyCompound('compoundVariants', 'disabled', 'true')]
	},
	{
		// Values named like slots are values, so a token in each is shared.
		code:
			IMPORT +
			"sv({ base: 'flex', slots: { top: 't', bottom: 'b' }, variants: { placement: { top: 'z-10 a', bottom: 'z-10 b' } }, requiredVariants: true });",
		output:
			IMPORT +
			"sv({ base: 'flex z-10', slots: { top: 't', bottom: 'b' }, variants: { placement: { top: 'a', bottom: 'b' } }, requiredVariants: true });",
		errors: repeat(shared('z-10', 'placement'), 2)
	},
	{
		// With a merging `postProcess`, the last of two conflicting classes
		// wins, so lifting `p-2` ahead of the later variant's `p-4` would
		// change the output: offered as a suggestion only.
		code:
			IMPORT +
			"sv({ base: 'flex', variants: { pad: { x: 'p-4', y: 'm-1' }, size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: true, postProcess: twMerge });",
		output: null,
		errors: repeat(
			{
				...shared('p-2', 'size'),
				suggestions: [
					{
						messageId: 'liftSharedOrder',
						data: { variant: 'size', slot: 'base' },
						output:
							IMPORT +
							"sv({ base: 'flex p-2', variants: { pad: { x: 'p-4', y: 'm-1' }, size: { sm: 'a', md: 'b' } }, requiredVariants: true, postProcess: twMerge });"
					}
				]
			},
			2
		)
	},
	{
		// The same for a `postProcess` inherited from a `createSV()` factory.
		code:
			IMPORT_CREATE_SV +
			"const customSV = createSV({ postProcess: twMerge });\ncustomSV({ base: 'flex', variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: true });",
		output: null,
		errors: repeat(
			{
				...shared('p-2', 'size'),
				suggestions: [
					{
						messageId: 'liftSharedOrder',
						data: { variant: 'size', slot: 'base' },
						output:
							IMPORT_CREATE_SV +
							"const customSV = createSV({ postProcess: twMerge });\ncustomSV({ base: 'flex p-2', variants: { size: { sm: 'a', md: 'b' } }, requiredVariants: true });"
					}
				]
			},
			2
		)
	},
	{
		// And for factory defaults that can't be read, which may hold one.
		code:
			IMPORT_CREATE_SV +
			"const customSV = createSV(defaults);\ncustomSV({ base: 'flex', variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: true });",
		output: null,
		errors: repeat(
			{
				...shared('p-2', 'size'),
				suggestions: [
					{
						messageId: 'liftSharedOrder',
						data: { variant: 'size', slot: 'base' },
						output:
							IMPORT_CREATE_SV +
							"const customSV = createSV(defaults);\ncustomSV({ base: 'flex p-2', variants: { size: { sm: 'a', md: 'b' } }, requiredVariants: true });"
					}
				]
			},
			2
		)
	},
	{
		// A single-key compound's class would move ahead of the later
		// variant's `p-4` too.
		code:
			IMPORT +
			"sv({ variants: { size: { sm: 'a', md: 'b' }, pad: { x: 'p-4' } }, compoundVariants: [{ size: 'sm', class: 'p-2' }, { size: 'md', pad: 'x', class: 'c' }], postProcess: twMerge });",
		output: null,
		errors: [
			{
				...singleKeyCompound('compoundVariants', 'size', "'sm'"),
				suggestions: [
					{
						messageId: 'moveCompoundClass',
						data: { key: 'size' },
						output:
							IMPORT +
							"sv({ variants: { size: { sm: 'a p-2', md: 'b' }, pad: { x: 'p-4' } }, compoundVariants: [{ size: 'md', pad: 'x', class: 'c' }], postProcess: twMerge });"
					}
				]
			}
		]
	},
	{
		// A spread may override whatever a fix edits or creates — here a
		// `base` created before it — so a factory config with one is left
		// unfixed.
		code:
			IMPORT_CREATE_SV +
			"const shared = { base: 'x' };\ncreateSV({ ...shared, variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: ['size'] });",
		output: null,
		errors: repeat(shared('p-2', 'size'), 2)
	},
	{
		// The same for a single-key compound merged into a variant a later
		// spread may replace.
		code:
			IMPORT_CREATE_SV +
			"createSV({ variants: { variant: { primary: 'a', link: 'underline' } }, compoundVariants: [{ variant: 'link', className: 'px-none' }], ...shared });",
		output: null,
		errors: [singleKeyCompound('compoundVariants', 'variant', "'link'")]
	},
	{
		// A `base` created in a call through a `createSV()`-derived function
		// would replace the factory's own `base`, so it's left uncreated.
		code:
			IMPORT_CREATE_SV +
			"const customSV = createSV({ base: 'box' });\ncustomSV({ variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: ['size'] });",
		output: null,
		errors: repeat(shared('p-2', 'size'), 2)
	},
	{
		// The same when the factory's defaults can't be read.
		code:
			IMPORT_CREATE_SV +
			"const customSV = createSV(defaults);\ncustomSV({ variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: ['size'] });",
		output: null,
		errors: repeat(shared('p-2', 'size'), 2)
	},
	{
		// A factory without a `base` default leaves nothing to replace.
		code:
			IMPORT_CREATE_SV +
			"const customSV = createSV({ cacheSize: 512 });\ncustomSV({ variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: ['size'] });",
		output:
			IMPORT_CREATE_SV +
			"const customSV = createSV({ cacheSize: 512 });\ncustomSV({ base: 'p-2', variants: { size: { sm: 'a', md: 'b' } }, requiredVariants: ['size'] });",
		errors: repeat(shared('p-2', 'size'), 2)
	},
	{
		// The same for a factory with no defaults at all.
		code:
			IMPORT_CREATE_SV +
			"const customSV = createSV();\ncustomSV({ variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: ['size'] });",
		output:
			IMPORT_CREATE_SV +
			"const customSV = createSV();\ncustomSV({ base: 'p-2', variants: { size: { sm: 'a', md: 'b' } }, requiredVariants: ['size'] });",
		errors: repeat(shared('p-2', 'size'), 2)
	},
	{
		// With no `base` field, the tokens go where the base classes already
		// are: a leading argument.
		code:
			IMPORT +
			"sv('flex', { variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: true });",
		output:
			IMPORT +
			"sv('flex p-2', { variants: { size: { sm: 'a', md: 'b' } }, requiredVariants: true });",
		errors: repeat(shared('p-2', 'size'), 2)
	},
	{
		// The last one of several leading arguments, so the classes keep
		// coming after the others.
		code:
			IMPORT +
			"sv('flex', 'gap-2', { variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: true });",
		output:
			IMPORT +
			"sv('flex', 'gap-2 p-2', { variants: { size: { sm: 'a', md: 'b' } }, requiredVariants: true });",
		errors: repeat(shared('p-2', 'size'), 2)
	},
	{
		// Or a `slots.base` entry.
		code:
			IMPORT +
			"sv({ slots: { base: 'flex', icon: 'w-4' }, variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: true });",
		output:
			IMPORT +
			"sv({ slots: { base: 'flex p-2', icon: 'w-4' }, variants: { size: { sm: 'a', md: 'b' } }, requiredVariants: true });",
		errors: repeat(shared('p-2', 'size'), 2)
	},
	{
		// A `slots.base` that can't be rewritten passes on to the next
		// candidate: here the leading argument.
		code:
			IMPORT +
			"sv('box', { slots: { base: ['flex'], icon: 'w-4' }, variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: true });",
		output:
			IMPORT +
			"sv('box p-2', { slots: { base: ['flex'], icon: 'w-4' }, variants: { size: { sm: 'a', md: 'b' } }, requiredVariants: true });",
		errors: repeat(shared('p-2', 'size'), 2)
	},
	{
		// A hoisted `slots` record may be shared by other configs, so its
		// `base` is passed on too, and the `base` field is created.
		code:
			IMPORT +
			"const slots = { base: 'flex', icon: 'w-4' };\nsv({ slots, variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: true });",
		output:
			IMPORT +
			"const slots = { base: 'flex', icon: 'w-4' };\nsv({ base: 'p-2', slots, variants: { size: { sm: 'a', md: 'b' } }, requiredVariants: true });",
		errors: repeat(shared('p-2', 'size'), 2)
	},
	{
		// The same for a leading argument that isn't a plain literal.
		code:
			IMPORT +
			"sv(['flex'], { variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: true });",
		output:
			IMPORT +
			"sv(['flex'], { base: 'p-2', variants: { size: { sm: 'a', md: 'b' } }, requiredVariants: true });",
		errors: repeat(shared('p-2', 'size'), 2)
	},
	{
		// A hoisted config's tokens never go into one call's leading
		// argument, since the config's other calls would lose them.
		code:
			IMPORT +
			"const config = { variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: true };\nsv('flex', config);",
		output:
			IMPORT +
			"const config = { base: 'p-2', variants: { size: { sm: 'a', md: 'b' } }, requiredVariants: true };\nsv('flex', config);",
		errors: repeat(shared('p-2', 'size'), 2)
	},
	{
		// A comment before the config's first property stays where it is: the
		// created `base` only repeats the whitespace leading to that property.
		code:
			IMPORT +
			"sv({ // button styles\n  variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: true });",
		output:
			IMPORT +
			"sv({ // button styles\n  base: 'p-2',\n  variants: { size: { sm: 'a', md: 'b' } }, requiredVariants: true });",
		errors: repeat(shared('p-2', 'size'), 2)
	},
	{
		// The same for a block comment on the same line.
		code:
			IMPORT +
			"sv({ /* button */ variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: true });",
		output:
			IMPORT +
			"sv({ /* button */ base: 'p-2', variants: { size: { sm: 'a', md: 'b' } }, requiredVariants: true });",
		errors: repeat(shared('p-2', 'size'), 2)
	},
	{
		// A call that already has its own `base` replaced the factory's one
		// already, so lifting into it changes nothing more.
		code:
			IMPORT_CREATE_SV +
			"const customSV = createSV({ base: 'box' });\ncustomSV({ base: 'flex', variants: { size: { sm: 'p-2 a', md: 'p-2 b' } }, requiredVariants: ['size'] });",
		output:
			IMPORT_CREATE_SV +
			"const customSV = createSV({ base: 'box' });\ncustomSV({ base: 'flex p-2', variants: { size: { sm: 'a', md: 'b' } }, requiredVariants: ['size'] });",
		errors: repeat(shared('p-2', 'size'), 2)
	},
	{
		// A hoisted variant record may be shared by other configs, so lifting
		// its tokens into this config's `base` is left undone.
		code:
			IMPORT +
			"const sizes = { sm: 'rounded text-sm', lg: 'rounded text-lg' };\nsv({ base: 'flex', variants: { size: sizes }, requiredVariants: ['size'] });",
		output: null,
		errors: repeat(shared('rounded', 'size'), 2)
	},
	{
		// The same for a hoisted `slots` record the tokens would go into.
		code:
			IMPORT +
			"const slots = { root: 'flex', body: 'p-4' };\nsv({ slots, variants: { size: { sm: { root: 'rounded a' }, lg: { root: 'rounded b' } } }, requiredVariants: ['size'] });",
		output: null,
		errors: repeat(shared('rounded', 'size', 'root'), 2)
	},
	{
		// A single-key compound's class isn't merged into a hoisted variant.
		code:
			IMPORT +
			"const variants = { variant: { primary: 'a', link: 'underline' } };\nsv({ variants, compoundVariants: [{ variant: 'link', className: 'px-none' }] });",
		output: null,
		errors: [singleKeyCompound('compoundVariants', 'variant', "'link'")]
	},
	{
		// Nor is a hoisted compound entry removed.
		code:
			IMPORT +
			"const entry = { variant: 'link', className: 'px-none' };\nsv({ variants: { variant: { primary: 'a', link: 'underline' } }, compoundVariants: [entry, { variant: 'primary', size: 'sm', className: 'p-1' }] });",
		output: null,
		errors: [singleKeyCompound('compoundVariants', 'variant', "'link'")]
	},
	{
		// A dynamic `base` can't be read, so there's nothing to
		// append the lifted token to — reported without a fix.
		code:
			IMPORT +
			"sv({ base: dyn, variants: { size: { sm: 'flex p-1', lg: 'flex p-2' } }, defaultVariants: { size: 'sm' } });",
		errors: repeat(shared('flex', 'size'), 2)
	},
	{
		// A `base` whose own text carries a backslash can't be re-emitted
		// with the lifted token appended, so the whole fix bails.
		code:
			IMPORT +
			"sv({ base: 'a\\\\b', variants: { size: { sm: 'flex p-1', lg: 'flex p-2' } }, defaultVariants: { size: 'sm' } });",
		errors: repeat(shared('flex', 'size'), 2)
	},
	{
		// A single-value exhaustive variant always applies that one value,
		// so every token in it is constant and belongs in `base`. No fix:
		// lifting all of them would leave an empty class string behind.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'rounded text-sm' } },
				defaultVariants: { size: 'sm' }
			});`,
		errors: [shared('rounded', 'size'), shared('text-sm', 'size')]
	},
	{
		// Exhaustive via requiredVariants instead of a default.
		code:
			IMPORT +
			`sv({
				variants: { size: { sm: 'rounded text-sm' } },
				requiredVariants: ['size']
			});`,
		errors: [shared('rounded', 'size'), shared('text-sm', 'size')]
	},
	{
		// The same for a slot-keyed single value.
		code:
			IMPORT +
			`sv({
				slots: { root: 'block' },
				variants: { size: { sm: { root: 'rounded text-sm' } } },
				defaultVariants: { size: 'sm' }
			});`,
		errors: [
			shared('rounded', 'size', 'root'),
			shared('text-sm', 'size', 'root')
		]
	},
	{
		// Two values where one is entirely shared: the rewrite would
		// empty it, so the finding is reported without a fix rather
		// than leaving `sm: ''` behind for no-empty-classes to flag.
		code:
			IMPORT +
			`sv({
				base: 'block',
				variants: { size: { sm: 'rounded', lg: 'rounded text-lg' } },
				defaultVariants: { size: 'sm' }
			});`,
		errors: repeat(shared('rounded', 'size'), 2)
	},
	{
		// A shared token is found across values even when one of
		// them writes its separator as an escape. No fix: the
		// surviving token would carry a backslash into the rewrite.
		code:
			IMPORT +
			"sv({ base: 'block', variants: { size: { sm: 'flex\\u0020p-1', lg: 'flex p-2' } }, defaultVariants: { size: 'sm' } });",
		errors: repeat(shared('flex', 'size'), 2)
	},
	{
		// A namespace member call is analyzed like the named import.
		code:
			IMPORT_NS +
			"SV.sv({ variants: { size: { sm: 'flex p-1', lg: 'flex p-2' } }, defaultVariants: { size: 'sm' } });",
		output: null,
		errors: repeat(
			sharedLift(
				'flex',
				'size',
				IMPORT_NS +
					"SV.sv({ base: 'flex', variants: { size: { sm: 'p-1', lg: 'p-2' } }, defaultVariants: { size: 'sm' } });"
			),
			2
		)
	},
	{
		// Token shared across all values of a defaulted variant — flag every
		// occurrence. `{ size: null }` skips the default, so lifting the token
		// would change that call's output: the lift is a suggestion, not a
		// fix. With no `base` property to lift into, it creates one, laid out
		// like the config's existing first property.
		code:
			IMPORT +
			`sv({
				variants: {
					size: {
						sm: 'rounded text-sm',
						md: 'rounded text-md',
						lg: 'rounded text-lg'
					}
				},
				defaultVariants: { size: 'md' }
			});`,
		output: null,
		errors: repeat(
			sharedLift(
				'rounded',
				'size',
				IMPORT +
					`sv({
				base: 'rounded',
				variants: {
					size: {
						sm: 'text-sm',
						md: 'text-md',
						lg: 'text-lg'
					}
				},
				defaultVariants: { size: 'md' }
			});`
			),
			3
		)
	},
	{
		// Two-value variant, exhaustive via requiredVariants —
		// entry given as a static template literal.
		code:
			IMPORT +
			`sv({
				variants: {
					intent: {
						primary: 'rounded font-bold bg-blue-500',
						danger: 'rounded font-bold bg-red-500'
					}
				},
				requiredVariants: [\`intent\`]
			});`,
		output:
			IMPORT +
			`sv({
				base: 'rounded font-bold',
				variants: {
					intent: {
						primary: 'bg-blue-500',
						danger: 'bg-red-500'
					}
				},
				requiredVariants: [\`intent\`]
			});`,
		errors: [
			shared('rounded', 'intent'),
			shared('font-bold', 'intent'),
			shared('rounded', 'intent'),
			shared('font-bold', 'intent')
		]
	},
	{
		// Every variant required via `requiredVariants: true` —
		// the shared token is flagged just like an array-listed
		// required variant.
		code:
			IMPORT +
			`sv({
				variants: {
					size: {
						sm: 'rounded text-sm',
						lg: 'rounded text-lg'
					}
				},
				requiredVariants: true
			});`,
		output:
			IMPORT +
			`sv({
				base: 'rounded',
				variants: {
					size: {
						sm: 'text-sm',
						lg: 'text-lg'
					}
				},
				requiredVariants: true
			});`,
		errors: repeat(shared('rounded', 'size'), 2)
	},
	{
		// Shared token under a group name — the group has no `slots` entry of
		// its own to lift the token into, so it's reported without a fix.
		code:
			IMPORT +
			`sv({
				slots: { root: 'flex', body: 'p-4' },
				groups: { content: ['root', 'body'] },
				variants: {
					size: {
						sm: { content: 'rounded text-sm' },
						lg: { content: 'rounded text-lg' }
					}
				},
				defaultVariants: { size: 'sm' }
			});`,
		errors: repeat(shared('rounded', 'size', 'content'), 2)
	},
	{
		// Shared token in a non-base slot — must be flagged for the actual
		// slot, not base. The slot's target and every value are plain string
		// literals, so the fix lifts the token into `slots.root` and strips
		// it from each value in one pass.
		code:
			IMPORT +
			`sv({
				slots: { root: 'flex', body: 'p-4' },
				variants: {
					size: {
						sm: { root: 'rounded text-sm', body: 'p-1' },
						lg: { root: 'rounded text-lg', body: 'p-2' }
					}
				},
				defaultVariants: { size: 'sm' }
			});`,
		output: null,
		errors: repeat(
			sharedLift(
				'rounded',
				'size',
				IMPORT +
					`sv({
				slots: { root: 'flex rounded', body: 'p-4' },
				variants: {
					size: {
						sm: { root: 'text-sm', body: 'p-1' },
						lg: { root: 'text-lg', body: 'p-2' }
					}
				},
				defaultVariants: { size: 'sm' }
			});`,
				'root'
			),
			2
		)
	},
	{
		// Variant value as an array of strings — extractor walks
		// the array; the shared token is still detected.
		code:
			IMPORT +
			`sv({
				variants: {
					size: {
						sm: ['rounded', 'text-sm'],
						lg: ['rounded', 'text-lg']
					}
				},
				defaultVariants: { size: 'sm' }
			});`,
		errors: repeat(shared('rounded', 'size'), 2)
	},
	{
		// Boolean record (true/false keys) with a shared token,
		// exhaustive via defaultVariants.
		code:
			IMPORT +
			`sv({
				variants: {
					on: {
						true: 'highlight bg-blue-500',
						false: 'highlight bg-gray-200'
					}
				},
				defaultVariants: { on: false }
			});`,
		output: null,
		errors: repeat(
			sharedLift(
				'highlight',
				'on',
				IMPORT +
					`sv({
				base: 'highlight',
				variants: {
					on: {
						true: 'bg-blue-500',
						false: 'bg-gray-200'
					}
				},
				defaultVariants: { on: false }
			});`
			),
			2
		)
	},
	{
		// Numeric variant value keys are parsed as literal property keys
		// and should still participate in shared-token detection.
		code:
			IMPORT +
			`sv({
				variants: {
					size: {
						1: 'rounded text-sm',
						2: 'rounded text-lg'
					}
				},
				defaultVariants: { size: 1 }
			});`,
		output: null,
		errors: repeat(
			sharedLift(
				'rounded',
				'size',
				IMPORT +
					`sv({
				base: 'rounded',
				variants: {
					size: {
						1: 'text-sm',
						2: 'text-lg'
					}
				},
				defaultVariants: { size: 1 }
			});`
			),
			2
		)
	},
	{
		// A value read through a hoisted `const` still counts for shared-token
		// detection (extraction resolves through it), but the fix bails: the
		// raw (un-resolved) node is an Identifier, not a slot-keyed record, so
		// nothing is rewritten — the finding is still reported, unfixed.
		code:
			IMPORT +
			`const rootCls = { root: 'rounded text-sm', body: 'p-1' };
			sv({
				slots: { root: 'flex', body: 'p-4' },
				variants: {
					size: {
						sm: rootCls,
						lg: { root: 'rounded text-lg', body: 'p-2' }
					}
				},
				defaultVariants: { size: 'sm' }
			});`,
		errors: repeat(shared('rounded', 'size', 'root'), 2)
	},
	{
		// A slot value given as an array of strings is detected like any
		// other, but isn't a plain string/template literal, so the fix bails.
		code:
			IMPORT +
			`sv({
				slots: { root: 'flex', body: 'p-4' },
				variants: {
					size: {
						sm: { root: ['rounded', 'text-sm'], body: 'p-1' },
						lg: { root: 'rounded text-lg', body: 'p-2' }
					}
				},
				defaultVariants: { size: 'sm' }
			});`,
		errors: repeat(shared('rounded', 'size', 'root'), 2)
	},
	{
		// A remaining value token containing a literal backslash can't be
		// safely re-emitted at the same string delimiter, so the fix bails
		// for the whole slot rather than partially rewriting it.
		code:
			IMPORT +
			`sv({
				slots: { root: 'flex', body: 'p-4' },
				variants: {
					size: {
						sm: { root: 'rounded text-sm', body: 'p-1' },
						lg: { root: 'rounded a\\\\b', body: 'p-2' }
					}
				},
				defaultVariants: { size: 'sm' }
			});`,
		errors: repeat(shared('rounded', 'size', 'root'), 2)
	},
	{
		// The shared token itself contains a literal backslash — appending it
		// to the target's existing text can't be safely re-emitted, so the fix
		// bails before ever touching the variant values. The message names the
		// class as the browser sees it (`a\b`), not as the source escapes it.
		code:
			IMPORT +
			`sv({
				slots: { root: 'flex', body: 'p-4' },
				variants: {
					size: {
						sm: { root: 'a\\\\b text-sm', body: 'p-1' },
						lg: { root: 'a\\\\b text-lg', body: 'p-2' }
					}
				},
				defaultVariants: { size: 'sm' }
			});`,
		errors: repeat(shared('a\\b', 'size', 'root'), 2)
	},
	{
		// A base-only (unslotted) config: the shared token's target is the
		// top-level `base` property and every value contributes to `base`
		// directly (no slot-keyed record to unwrap) — the fully fixable path.
		code:
			IMPORT +
			`sv({
				base: 'flex',
				variants: {
					size: {
						sm: 'rounded text-sm',
						lg: 'rounded text-lg'
					}
				},
				defaultVariants: { size: 'sm' }
			});`,
		output: null,
		errors: repeat(
			sharedLift(
				'rounded',
				'size',
				IMPORT +
					`sv({
				base: 'flex rounded',
				variants: {
					size: {
						sm: 'text-sm',
						lg: 'text-lg'
					}
				},
				defaultVariants: { size: 'sm' }
			});`
			),
			2
		)
	},
	{
		// A required variant can't be skipped (`null` throws), so the lift is
		// an autofix there — the same config as above, required instead of
		// defaulted.
		code:
			IMPORT +
			`sv({
				base: 'flex',
				variants: {
					size: {
						sm: 'rounded text-sm',
						lg: 'rounded text-lg'
					}
				},
				requiredVariants: ['size']
			});`,
		output:
			IMPORT +
			`sv({
				base: 'flex rounded',
				variants: {
					size: {
						sm: 'text-sm',
						lg: 'text-lg'
					}
				},
				requiredVariants: ['size']
			});`,
		errors: repeat(shared('rounded', 'size'), 2)
	},
	{
		// A single-key `compoundVariants` entry isn't combining variants — its
		// class merges into that variant value directly, and the entry is
		// removed. The sibling two-key entry keeps the array non-empty and is
		// left alone.
		code:
			IMPORT +
			`sv({
				variants: {
					variant: { primary: 'a', link: 'underline' }
				},
				compoundVariants: [
					{ variant: 'primary', size: 'sm', className: 'p-1' },
					{ variant: 'link', className: 'px-none' }
				]
			});`,
		output:
			IMPORT +
			`sv({
				variants: {
					variant: { primary: 'a', link: 'underline px-none' }
				},
				compoundVariants: [
					{ variant: 'primary', size: 'sm', className: 'p-1' }
				]
			});`,
		errors: [singleKeyCompound('compoundVariants', 'variant', "'link'")]
	},
	{
		// An array-valued matcher merges the class into every value it
		// statically resolves to.
		code:
			IMPORT +
			`sv({
				variants: {
					size: { sm: 'h-28', default: 'h-32', lg: 'h-36' }
				},
				compoundVariants: [
					{ size: ['sm', 'lg'], className: 'rounded' },
					{ size: 'default', variant: 'x', className: 'p-1' }
				]
			});`,
		output:
			IMPORT +
			`sv({
				variants: {
					size: { sm: 'h-28 rounded', default: 'h-32', lg: 'h-36 rounded' }
				},
				compoundVariants: [
					{ size: 'default', variant: 'x', className: 'p-1' }
				]
			});`,
		errors: [singleKeyCompound('compoundVariants', 'size', "['sm', 'lg']")]
	},
	{
		// `compoundSlots`' class targets a specific slot rather than the whole
		// variant value, so it's reported without a fix.
		code:
			IMPORT +
			`sv({
				slots: { root: 'flex', icon: 'block' },
				variants: {
					iconOnly: { on: 'w-8', off: 'w-auto' }
				},
				compoundSlots: [
					{ iconOnly: 'on', slots: ['icon'], className: 'shrink-0' }
				]
			});`,
		errors: [singleKeyCompound('compoundSlots', 'iconOnly', "'on'")]
	},
	{
		// A dynamic class can't be read, so there's nothing to merge — reported
		// without a fix.
		code:
			IMPORT +
			`sv({
				variants: {
					variant: { primary: 'a', link: 'b' }
				},
				compoundVariants: [
					{ variant: 'primary', size: 'sm', className: 'p-1' },
					{ variant: 'link', className: dynamicCls }
				]
			});`,
		errors: [singleKeyCompound('compoundVariants', 'variant', "'link'")]
	},
	{
		// The matcher's value has no corresponding variant value to merge
		// into — reported without a fix.
		code:
			IMPORT +
			`sv({
				variants: {
					variant: { primary: 'a', link: 'b' }
				},
				compoundVariants: [
					{ variant: 'primary', size: 'sm', className: 'p-1' },
					{ variant: 'ghost', className: 'e' }
				]
			});`,
		errors: [singleKeyCompound('compoundVariants', 'variant', "'ghost'")]
	},
	{
		// Removing the sole compound entry would leave `compoundVariants`
		// empty, which no-empty-classes would then flag — so the whole
		// property goes instead.
		code:
			IMPORT +
			`sv({
				variants: {
					variant: { primary: 'a', link: 'b' }
				},
				compoundVariants: [{ variant: 'link', className: 'e' }]
			});`,
		output:
			IMPORT +
			`sv({
				variants: {
					variant: { primary: 'a', link: 'b e' }
				}
			});`,
		errors: [singleKeyCompound('compoundVariants', 'variant', "'link'")]
	},
	{
		// Removing the property would delete the comment inside it, so it's
		// reported without a fix.
		code:
			IMPORT +
			`sv({
				variants: {
					variant: { primary: 'a', link: 'b' }
				},
				compoundVariants: [{ variant: 'link', className: 'e' /* why */ }]
			});`,
		output: null,
		errors: [singleKeyCompound('compoundVariants', 'variant', "'link'")]
	},
	{
		// A spread inside the matched variant's value record means its values
		// can't be enumerated safely, so the merge target can't be found —
		// reported without a fix.
		code:
			IMPORT +
			`sv({
				variants: {
					variant: { ...rest, primary: 'a', link: 'b' }
				},
				compoundVariants: [
					{ variant: 'primary', size: 'sm', className: 'p-1' },
					{ variant: 'link', className: 'e' }
				]
			});`,
		errors: [singleKeyCompound('compoundVariants', 'variant', "'link'")]
	},
	{
		// The target variant value is an array rather than a plain string, so
		// it can't be rewritten — reported without a fix.
		code:
			IMPORT +
			`sv({
				variants: {
					variant: { primary: 'a', link: ['underline'] }
				},
				compoundVariants: [
					{ variant: 'primary', size: 'sm', className: 'p-1' },
					{ variant: 'link', className: 'e' }
				]
			});`,
		errors: [singleKeyCompound('compoundVariants', 'variant', "'link'")]
	},
	{
		// An empty class string has no tokens to merge — reported without a
		// fix (no-empty-classes separately flags the empty string itself).
		code:
			IMPORT +
			`sv({
				variants: {
					variant: { primary: 'a', link: 'b' }
				},
				compoundVariants: [
					{ variant: 'primary', size: 'sm', className: 'p-1' },
					{ variant: 'link', className: '' }
				]
			});`,
		errors: [singleKeyCompound('compoundVariants', 'variant', "'link'")]
	},
	{
		// A dynamic matcher value can't be resolved to a target variant
		// value — reported without a fix.
		code:
			IMPORT +
			`sv({
				variants: {
					variant: { primary: 'a', link: 'b' }
				},
				compoundVariants: [
					{ variant: 'primary', size: 'sm', className: 'p-1' },
					{ variant: someVar, className: 'e' }
				]
			});`,
		errors: [singleKeyCompound('compoundVariants', 'variant', 'someVar')]
	}
];