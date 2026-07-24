import { getOrCreate } from './map-utils.ts';

// Curated sets of Tailwind utilities that set the same CSS property but which
// the dash-namespace heuristic can't group — single words (`flex`, `absolute`)
// or hyphenated siblings that don't share a first segment (`inline-block` vs
// `flex`). Opt-in via `exclusiveGroups: true`, since a project's own
// single-word class names would otherwise be flagged.

// Every `display` value. The single-word subset (`SINGLE_WORD_DISPLAY_KEYWORDS`
// below) is also reachable via the always-on `line-clamp` overlap — unlike the
// rest of this group, which is opt-in.
const DISPLAY_KEYWORDS: ReadonlyArray<string> = [
	'block',
	'inline-block',
	'inline',
	'flex',
	'inline-flex',
	'table',
	'inline-table',
	'table-caption',
	'table-cell',
	'table-column',
	'table-column-group',
	'table-footer-group',
	'table-header-group',
	'table-row-group',
	'table-row',
	'flow-root',
	'grid',
	'inline-grid',
	'contents',
	'list-item',
	'hidden'
];

// The subset of `DISPLAY_KEYWORDS` with no `-` of their own, safe to give a
// dedicated `line-clamp` overlap node (see `SINGLE_WORD_OVERLAP_NODES`). The
// hyphenated members (`table-cell`, `inline-block`, …) are excluded: several
// are already grouped by the `table` `PREFIX_SPECS` entry, and giving each its
// own node here would shadow that grouping.
const SINGLE_WORD_DISPLAY_KEYWORDS: ReadonlyArray<string> =
	DISPLAY_KEYWORDS.filter((word) => !word.includes('-'));

const TAILWIND_EXCLUSIVE_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
	// display
	DISPLAY_KEYWORDS,
	// position
	['static', 'fixed', 'absolute', 'relative', 'sticky'],
	// visibility
	['visible', 'invisible', 'collapse'],
	// text-transform
	['uppercase', 'lowercase', 'capitalize', 'normal-case'],
	// text-decoration-line
	['underline', 'overline', 'line-through', 'no-underline'],
	// font-style
	['italic', 'not-italic'],
	// font-smoothing
	['antialiased', 'subpixel-antialiased'],
	// isolation
	['isolate', 'isolation-auto'],
	// screen-reader visibility
	['sr-only', 'not-sr-only']
	// Font-variant-numeric (`tabular-nums`, `normal-nums`, …) is NOT here: it's
	// a star shape, not a flat mutually-exclusive set (see the `fvn-*` entries
	// in `SINGLE_WORD_OVERLAP_NODES`, which is default-on instead).
];

// `true` enables the built-in Tailwind groups; an array supplies custom groups
// (replacing the built-ins); anything else (including the default `undefined`)
// leaves single-word grouping off.
type ExclusiveGroupsOption =
	| boolean
	| ReadonlyArray<ReadonlyArray<string>>
	| undefined;

const resolveExclusiveGroups = (
	option: ExclusiveGroupsOption
): ReadonlyArray<ReadonlyArray<string>> => {
	if (option === true) {
		return TAILWIND_EXCLUSIVE_GROUPS;
	}

	if (Array.isArray(option)) {
		return option;
	}

	return [];
};

// A group config listing the same utility in two different groups has no
// coherent meaning — which group's id should the token's conflict key use? —
// so it's rejected outright rather than silently resolved (last group wins).
const createOverlappingExclusiveGroupError = (
	token: string,
	firstGroupIndex: number,
	secondGroupIndex: number
): Error =>
	new Error(
		`slot-variants/no-conflicting-classes: "exclusiveGroups" lists "${token}" in more than one group (groups ${firstGroupIndex} and ${secondGroupIndex}) — remove it from all but one.`
	);

// A lookup from each grouped utility to a stable per-group id, so tokens in the
// same exclusive group share a conflict key. Empty when grouping is disabled,
// in which case getConflictKey behaves exactly as before.
export const buildExclusiveGroupMap = (
	option: ExclusiveGroupsOption
): ReadonlyMap<string, string> => {
	const map = new Map<string, string>();
	const groupIndexByToken = new Map<string, number>();
	let index = 0;

	for (const group of resolveExclusiveGroups(option)) {
		const groupId = String(index);

		for (const token of group) {
			const firstGroupIndex = groupIndexByToken.get(token);

			if (firstGroupIndex !== undefined) {
				throw createOverlappingExclusiveGroupError(
					token,
					firstGroupIndex,
					index
				);
			}

			groupIndexByToken.set(token, index);
			map.set(token, groupId);
		}

		index += 1;
	}

	return map;
};

// --- Property classification for overloaded prefixes ------------------------
//
// A dash count alone can't separate utilities that share a first segment and
// dash count but set different CSS properties (`bg-white` color vs `bg-cover`
// size, `text-white` color vs `text-sm` size). For a curated set of such
// prefixes we classify the value into a coarse property category and key on
// that instead. Unlisted prefixes keep the plain dash-count category, and an
// unmatched value falls back to a `short` (single value segment) or `long`
// (multi-segment) bucket — so a custom color like `text-brand-500` still groups
// with the built-in colors via `long: 'color'`, without any color palette.

type PrefixSpec = {
	keywords: ReadonlyMap<string, string>;
	// A keyword that introduces a sub-property classified from the remaining
	// segments (`ring-offset-2` width vs `ring-offset-red-500` color).
	nested?: ReadonlyMap<string, PrefixSpec>;
	short?: string;
	long?: string;
	// A trailing `reverse` segment is a composing flag, not a value — it sets a
	// CSS variable (`space-x-reverse`, `divide-x-reverse`) rather than replacing
	// the base utility, so it gets its own category and doesn't conflict with it.
	reverseComposes?: boolean;
	// The prefix has arbitrary image values (`bg-[url(...)]`,
	// `bg-[linear-gradient(...)]`) that classify as an image rather than
	// falling into the color fallback.
	arbitraryImage?: boolean;
	fallback: string;
};

const categoryMap = (
	groups: ReadonlyArray<readonly [string, ReadonlyArray<string>]>
): ReadonlyMap<string, string> => {
	const map = new Map<string, string>();

	for (const [category, tokens] of groups) {
		for (const token of tokens) {
			map.set(token, category);
		}
	}

	return map;
};

// Maps each token to a category named after itself — for axes (`x`/`y`), grid
// lines (`span`/`start`), sides, and filter functions the segment itself names
// the sub-property.
const selfMap = (tokens: ReadonlyArray<string>): ReadonlyMap<string, string> =>
	categoryMap(tokens.map((token) => [token, [token]] as const));

const COLOR_KEYWORDS = ['inherit', 'current', 'transparent', 'black', 'white'];
const SIDES = ['t', 'r', 'b', 'l', 'x', 'y', 's', 'e', 'bs', 'be'];
const CORNERS = [
	't',
	'r',
	'b',
	'l',
	's',
	'e',
	'tl',
	'tr',
	'bl',
	'br',
	'ss',
	'se',
	'es',
	'ee'
];

// x/y/z axis utilities (`gap-x`, `translate-y`, …); a bare value sets all axes.
const axisSpec: PrefixSpec = {
	keywords: selfMap(['x', 'y', 'z']),
	fallback: 'all'
};

// `space-x-*` is an axis utility that also has a composing `space-x-reverse`.
const spaceSpec: PrefixSpec = { ...axisSpec, reverseComposes: true };

// `translate-none` is a keyword value (not an axis), and it's a special case:
// it resets every axis including `z`, while the bare form (`translate-4`)
// only sets `x`/`y` — so `none` gets its own category, distinct from the
// `all` fallback the bare form uses (see `getOverlapNode`).
const translateSpec: PrefixSpec = {
	keywords: selfMap(['x', 'y', 'z', 'none']),
	fallback: 'all'
};

// `ring-offset-*` is both a width (`ring-offset-2`) and a color
// (`ring-offset-red-500`), classified from the segments after `offset`.
const offsetSpec: PrefixSpec = {
	keywords: categoryMap([['color', COLOR_KEYWORDS]]),
	short: 'width',
	long: 'color',
	fallback: 'color'
};

// A per-side border utility is both a width (`border-t-2`, bare `border-t`)
// and a color (`border-t-red-500`), classified from the segments after the
// side; an empty remainder is the bare 1px width form.
const borderSideSpec: PrefixSpec = {
	keywords: categoryMap([['color', COLOR_KEYWORDS]]),
	short: 'width',
	long: 'color',
	fallback: 'width'
};

// `text-shadow-*`/`inset-shadow-*` size-or-color value (`text-shadow-sm`,
// `text-shadow-red-500`); the bare form (`text-shadow`, `inset-shadow`) is
// the default preset, itself a size — unlike `offsetSpec`/`borderSideSpec`,
// whose bare form is a width.
const shadowSizeSpec: PrefixSpec = {
	keywords: categoryMap([['color', COLOR_KEYWORDS]]),
	short: 'size',
	long: 'color',
	fallback: 'size'
};

// `inset` has no `z` axis but does have logical block sides (`inset-bs`,
// `inset-be`), unlike the other axis utilities that share `axisSpec`. Its
// `shadow`/`ring` keywords introduce the unrelated `inset-shadow-*`/
// `inset-ring-*` families — without this, they'd fall into the `all`
// bucket and falsely conflict with the physical/logical offset utilities.
const insetSpec: PrefixSpec = {
	keywords: selfMap(['x', 'y', 'bs', 'be']),
	nested: new Map([
		['shadow', shadowSizeSpec],
		['ring', borderSideSpec]
	]),
	fallback: 'all'
};

// `touch-pan-x`/`-left`/`-right` all set the same CSS value (`pan-x`), so they
// conflict with each other; `touch-pan-y`/`-up`/`-down` likewise share
// `pan-y`. The two axes are independent of each other and compose
// (`touch-pan-x touch-pan-y` is valid).
const panSpec: PrefixSpec = {
	keywords: categoryMap([
		['x', ['x', 'left', 'right']],
		['y', ['y', 'up', 'down']]
	]),
	fallback: 'other'
};

// Single-property color utilities (`fill`, `accent`, `caret`): every value is a
// color, so they all share one category regardless of shape.
const colorSpec: PrefixSpec = {
	keywords: new Map<string, string>(),
	short: 'color',
	long: 'color',
	fallback: 'color'
};

// Gradient color stops (`from`/`via`/`to`): a color, or a `%`/number stop
// position, which is a distinct property that composes with the color.
const gradientStopSpec: PrefixSpec = {
	keywords: categoryMap([['color', COLOR_KEYWORDS]]),
	short: 'position',
	long: 'color',
	fallback: 'color'
};

// Single-property utilities whose values simply replace one another (`ease-*`
// timing function, `cursor-*`, `origin-*`, `align-*` vertical-align,
// `whitespace-*`): every value collapses to one category regardless of shape,
// so a one-segment value collides with a hyphenated one (`ease-in`/`ease-in-out`).
const unifiedSpec: PrefixSpec = {
	keywords: new Map<string, string>(),
	short: 'value',
	long: 'value',
	fallback: 'value'
};

// `line-clamp-*` (`line-clamp-3`, `line-clamp-none`, an arbitrary value) sets
// display and overflow as a side effect, so it gets its own overlap node (see
// `getOverlapNode`); `line-through` is an unrelated single-word utility that
// happens to share the `line` first segment.
const lineSpec: PrefixSpec = {
	keywords: categoryMap([['through', ['through']]]),
	nested: new Map([['clamp', unifiedSpec]]),
	fallback: 'other'
};

// `mask-{t,r,b,l,x,y,linear,conic,radial}-{from,to}-*` gradient-stop value: a
// position/percentage or a color — mirroring `gradientStopSpec`, the two
// don't merge since a position and a color modifier compose
// (`mask-t-from-30% mask-t-from-red-500` is valid together).
const maskStopSpec: PrefixSpec = {
	keywords: categoryMap([['color', COLOR_KEYWORDS]]),
	short: 'pos',
	long: 'color',
	fallback: 'pos'
};

// A directional mask gradient (`mask-t-from-*`, `mask-r-to-*`, …its `x`/`y`
// axis siblings): only its `from`/`to` stops are meaningful, classified by
// `maskStopSpec`.
const maskDirectionSpec: PrefixSpec = {
	keywords: new Map<string, string>(),
	nested: new Map([
		['from', maskStopSpec],
		['to', maskStopSpec]
	]),
	fallback: 'other'
};

// `mask-linear-*`/`mask-conic-*`: a bare angle (`mask-linear-45`) alongside
// the same `from`/`to` stops as the directional families.
const maskAngleStopSpec: PrefixSpec = {
	keywords: new Map<string, string>(),
	nested: new Map([
		['from', maskStopSpec],
		['to', maskStopSpec]
	]),
	short: 'angle',
	fallback: 'angle'
};

// `mask-radial-*`: a shape (`circle`/`ellipse`), a size (`closest`/`farthest`,
// each paired with `side`/`corner` — the pairing is ignored since all four
// combinations set the same property and conflict with each other), a
// position (`mask-radial-at-*`), or the same `from`/`to` stops as the other
// gradient families. An arbitrary shorthand value (`mask-radial-[...]`) falls
// back to its own bucket.
const maskRadialSpec: PrefixSpec = {
	keywords: categoryMap([
		['shape', ['circle', 'ellipse']],
		['size', ['closest', 'farthest']],
		['at', ['at']]
	]),
	nested: new Map([
		['from', maskStopSpec],
		['to', maskStopSpec]
	]),
	fallback: 'value'
};

// `mask-no-clip`/`mask-no-repeat` are the boolean-off form of the `clip`/
// `repeat` sub-properties — kept distinct from each other (so they don't
// falsely conflict with one another) but not merged with their positive
// counterparts (`mask-clip-border`, `mask-repeat-x`, …); a documented gap
// rather than a false positive.
const maskNoSpec: PrefixSpec = {
	keywords: categoryMap([
		['clip', ['clip']],
		['repeat', ['repeat']]
	]),
	fallback: 'other'
};

const PREFIX_SPECS: Record<string, PrefixSpec> = {
	text: {
		keywords: categoryMap([
			['align', ['left', 'center', 'right', 'justify', 'start', 'end']],
			['wrap', ['wrap', 'nowrap', 'balance', 'pretty']],
			['overflow', ['ellipsis', 'clip']],
			['color', COLOR_KEYWORDS],
			['opacity', ['opacity']]
		]),
		nested: new Map([['shadow', shadowSizeSpec]]),
		short: 'size',
		long: 'color',
		fallback: 'color'
	},
	bg: {
		keywords: categoryMap([
			['color', COLOR_KEYWORDS],
			['size', ['auto', 'cover', 'contain']],
			['position', ['bottom', 'center', 'left', 'right', 'top']],
			['repeat', ['repeat', 'no']],
			['attach', ['fixed', 'local', 'scroll']],
			['image', ['none', 'gradient', 'linear', 'radial', 'conic']],
			['clip', ['clip']],
			['origin', ['origin']],
			['blend', ['blend']],
			['opacity', ['opacity']]
		]),
		arbitraryImage: true,
		fallback: 'color'
	},
	border: {
		keywords: categoryMap([
			[
				'style',
				['solid', 'dashed', 'dotted', 'double', 'hidden', 'none']
			],
			['color', COLOR_KEYWORDS],
			['collapse', ['collapse', 'separate']],
			['opacity', ['opacity']]
		]),
		// `border-spacing-x`/`-y` compose into the single `border-spacing`
		// property, so they're keyed per axis rather than lumped together; each
		// side introduces its own width/color sub-properties.
		nested: new Map<string, PrefixSpec>([
			['spacing', axisSpec],
			...SIDES.map((side): [string, PrefixSpec] => [side, borderSideSpec])
		]),
		short: 'width',
		long: 'color',
		fallback: 'color'
	},
	ring: {
		keywords: categoryMap([
			['inset', ['inset']],
			['color', COLOR_KEYWORDS],
			['opacity', ['opacity']]
		]),
		nested: new Map([['offset', offsetSpec]]),
		short: 'width',
		long: 'color',
		fallback: 'color'
	},
	outline: {
		keywords: categoryMap([
			[
				'style',
				['none', 'dashed', 'dotted', 'double', 'solid', 'hidden']
			],
			['offset', ['offset']],
			['color', COLOR_KEYWORDS]
		]),
		short: 'width',
		long: 'color',
		fallback: 'color'
	},
	divide: {
		keywords: categoryMap([
			['style', ['solid', 'dashed', 'dotted', 'double', 'none']],
			['color', COLOR_KEYWORDS],
			['width-x', ['x']],
			['width-y', ['y']],
			['opacity', ['opacity']]
		]),
		reverseComposes: true,
		long: 'color',
		fallback: 'color'
	},
	decoration: {
		keywords: categoryMap([
			['style', ['solid', 'double', 'dotted', 'dashed', 'wavy']],
			['color', COLOR_KEYWORDS],
			['thickness', ['from', 'auto']]
		]),
		short: 'thickness',
		long: 'color',
		fallback: 'color'
	},
	stroke: {
		keywords: categoryMap([['color', COLOR_KEYWORDS]]),
		short: 'width',
		long: 'color',
		fallback: 'color'
	},
	shadow: {
		keywords: categoryMap([['color', COLOR_KEYWORDS]]),
		short: 'box',
		long: 'color',
		fallback: 'color'
	},
	mask: {
		keywords: categoryMap([
			['composite', ['add', 'subtract', 'intersect', 'exclude']],
			['mode', ['alpha', 'luminance', 'match']],
			['position', ['center', 'top', 'bottom', 'left', 'right']],
			['size', ['auto', 'cover', 'contain']],
			['repeat', ['repeat']],
			['image', ['none']]
		]),
		nested: new Map([
			['linear', maskAngleStopSpec],
			['conic', maskAngleStopSpec],
			['radial', maskRadialSpec],
			['t', maskDirectionSpec],
			['r', maskDirectionSpec],
			['b', maskDirectionSpec],
			['l', maskDirectionSpec],
			['x', maskDirectionSpec],
			['y', maskDirectionSpec],
			['clip', unifiedSpec],
			['origin', unifiedSpec],
			['type', unifiedSpec],
			['no', maskNoSpec]
		]),
		fallback: 'other'
	},
	fill: colorSpec,
	accent: colorSpec,
	caret: colorSpec,
	placeholder: {
		keywords: categoryMap([['opacity', ['opacity']]]),
		short: 'color',
		long: 'color',
		fallback: 'color'
	},
	from: gradientStopSpec,
	via: gradientStopSpec,
	to: gradientStopSpec,
	// `table-auto`/`table-fixed` are `table-layout`; every other `table-*`
	// (`table-cell`, `table-row`, `table-header-group`, …) is a `display` value.
	table: {
		keywords: categoryMap([['layout', ['auto', 'fixed']]]),
		fallback: 'display'
	},
	content: {
		keywords: categoryMap([
			[
				'align',
				[
					'center',
					'start',
					'end',
					'between',
					'around',
					'evenly',
					'normal',
					'stretch',
					'baseline'
				]
			]
		]),
		fallback: 'prop'
	},
	flex: {
		keywords: categoryMap([
			['direction', ['row', 'col']],
			['wrap', ['wrap', 'nowrap']]
		]),
		fallback: 'flex'
	},
	font: {
		keywords: categoryMap([
			[
				'weight',
				[
					'thin',
					'extralight',
					'light',
					'normal',
					'medium',
					'semibold',
					'bold',
					'extrabold',
					'black'
				]
			]
		]),
		fallback: 'family'
	},
	grid: { keywords: selfMap(['cols', 'rows', 'flow']), fallback: 'other' },
	auto: { keywords: selfMap(['cols', 'rows']), fallback: 'other' },
	object: {
		keywords: categoryMap([
			['fit', ['contain', 'cover', 'fill', 'none', 'scale']],
			['position', ['bottom', 'center', 'left', 'right', 'top']]
		]),
		fallback: 'other'
	},
	list: {
		keywords: categoryMap([
			['position', ['inside', 'outside']],
			['image', ['image']]
		]),
		fallback: 'type'
	},
	place: {
		keywords: selfMap(['items', 'content', 'self']),
		fallback: 'other'
	},
	justify: { keywords: selfMap(['items', 'self']), fallback: 'content' },
	col: {
		keywords: selfMap(['span', 'start', 'end', 'auto']),
		fallback: 'other'
	},
	row: {
		keywords: selfMap(['span', 'start', 'end', 'auto']),
		fallback: 'other'
	},
	min: { keywords: selfMap(['w', 'h']), fallback: 'other' },
	max: { keywords: selfMap(['w', 'h']), fallback: 'other' },
	rounded: { keywords: selfMap(CORNERS), fallback: 'all' },
	backdrop: {
		keywords: selfMap([
			'blur',
			'brightness',
			'contrast',
			'grayscale',
			'hue',
			'invert',
			'opacity',
			'saturate',
			'sepia'
		]),
		fallback: 'other'
	},
	scroll: {
		keywords: categoryMap([
			['behavior', ['smooth', 'auto']],
			...[
				'm',
				'mt',
				'mr',
				'mb',
				'ml',
				'mx',
				'my',
				'ms',
				'me',
				'mbs',
				'mbe',
				'p',
				'pt',
				'pr',
				'pb',
				'pl',
				'px',
				'py',
				'ps',
				'pe',
				'pbs',
				'pbe'
			].map((side) => [side, [side]] as const)
		]),
		fallback: 'other'
	},
	snap: {
		keywords: categoryMap([
			['axis', ['x', 'y', 'both', 'none']],
			['strict', ['mandatory', 'proximity']],
			['align', ['start', 'center', 'end', 'align']],
			['stop', ['normal', 'always']]
		]),
		fallback: 'other'
	},
	break: {
		keywords: categoryMap([
			['wrap', ['words']],
			['word', ['all', 'keep']],
			['before', ['before']],
			['after', ['after']],
			['inside', ['inside']]
		]),
		fallback: 'other'
	},
	touch: {
		keywords: categoryMap([
			['base', ['auto', 'none', 'manipulation']],
			['pinch', ['pinch']]
		]),
		nested: new Map([['pan', panSpec]]),
		fallback: 'base'
	},
	ease: unifiedSpec,
	origin: unifiedSpec,
	cursor: unifiedSpec,
	align: unifiedSpec,
	whitespace: unifiedSpec,
	// Every `drop-shadow-*` (including the bare `drop-shadow`) sets the single
	// drop-shadow filter, so collapse them all to one category.
	drop: unifiedSpec,
	line: lineSpec,
	gap: axisSpec,
	space: spaceSpec,
	translate: translateSpec,
	scale: axisSpec,
	skew: axisSpec,
	rotate: axisSpec,
	inset: insetSpec,
	overflow: axisSpec,
	overscroll: axisSpec
};

const COLOR_FUNCTIONS = [
	'rgb',
	'rgba',
	'hsl',
	'hsla',
	'hwb',
	'lab',
	'lch',
	'oklab',
	'oklch',
	'color'
];

// Detects an arbitrary color value (`text-[#f00]`, `bg-[rgb(0,0,0)]`,
// `text-[color:var(--x)]`) so it classifies as a color rather than falling into
// the size/width bucket. A bracketed length (`text-[16px]`) or otherwise
// un-hinted value is left alone.
const isArbitraryColorValue = (segment: string): boolean => {
	if (!segment.startsWith('[')) {
		return false;
	}

	const inner = segment.slice(1);

	if (inner.startsWith('#') || inner.startsWith('color:')) {
		return true;
	}

	return COLOR_FUNCTIONS.some((fn) => inner.startsWith(`${fn}(`));
};

// Detects an arbitrary image value (`bg-[url(/hero.png)]`,
// `bg-[image:var(--x)]`, `bg-[linear-gradient(...)]`) so it classifies as an
// image on prefixes that opt in via `arbitraryImage`.
const isArbitraryImageValue = (segment: string): boolean =>
	segment.startsWith('[url(') ||
	segment.startsWith('[image:') ||
	/^\[(?:repeating-)?(?:linear|radial|conic)-gradient\(/.test(segment);

// Strips a trailing top-level `/opacity` or `/leading` modifier (`white/50`,
// `lg/6`) before a keyword lookup, so the modifier doesn't shadow the exact
// keyword match (`text-white/50` should still resolve `white` to `color`).
const withoutModifier = (segment: string): string =>
	/* c8 ignore next -- splitOutsideBrackets always returns at least one segment */
	splitOutsideBrackets(segment, '/')[0] ?? segment;

const baseCategory = (
	spec: PrefixSpec,
	value: ReadonlyArray<string>,
	head: string
): string => {
	const keyworded = spec.keywords.get(withoutModifier(head));

	if (keyworded !== undefined) {
		return keyworded;
	}

	if (spec.arbitraryImage === true && isArbitraryImageValue(head)) {
		return 'image';
	}

	// A color-capable prefix keys an arbitrary color to `color` regardless of
	// segment count, so `text-[#f00]` groups with `text-red-500` and not
	// `text-sm`.
	if (spec.long === 'color' && isArbitraryColorValue(head)) {
		return 'color';
	}

	if (value.length === 1 && spec.short !== undefined) {
		return spec.short;
	}

	if (value.length >= 2 && spec.long !== undefined) {
		return spec.long;
	}

	return spec.fallback;
};

const categorizeWithSpec = (
	spec: PrefixSpec,
	value: ReadonlyArray<string>
): string => {
	const [head = ''] = value;

	// A nested keyword introduces its own sub-property, classified from the
	// remaining segments (`ring-offset-2` → `offset-width`, `ring-offset-red-500`
	// → `offset-color`).
	const nested = spec.nested?.get(head);

	if (nested) {
		return `${head}-${categorizeWithSpec(nested, value.slice(1))}`;
	}

	const category = baseCategory(spec, value, head);

	// A composing `reverse` flag (`space-x-reverse`) sits alongside the width, so
	// it gets a distinct — but still axis-aware — category from `space-x-2`.
	if (spec.reverseComposes && value[value.length - 1] === 'reverse') {
		return `${category}-reverse`;
	}

	return category;
};

// The property category for a token's value (the segments after the first),
// or the dash count as a string for prefixes we don't classify.
const categorize = (
	firstSegment: string,
	value: ReadonlyArray<string>
): string => {
	const spec = PREFIX_SPECS[firstSegment];

	if (!spec) {
		return String(value.length);
	}

	return categorizeWithSpec(spec, value);
};

// Bare single-word utilities that are the unsuffixed default of a wider family
// (`rounded` is `rounded-DEFAULT`, `border` is `border-1`, `transition` is
// `transition-DEFAULT`, …). Each maps to a representative dashed value so it
// resolves to the very same conflict key as its sibling — `rounded` collides
// with `rounded-lg`, `transition` with `transition-none` — while `border` still
// stays clear of `border-gray-200` (a color, not a width).
const BARE_UTILITIES: Record<string, ReadonlyArray<string>> = {
	rounded: ['lg'],
	border: ['2'],
	ring: ['2'],
	outline: ['2'],
	shadow: ['md'],
	blur: ['sm'],
	grow: ['0'],
	shrink: ['0'],
	transition: ['all'],
	transform: ['none'],
	filter: ['none'],
	resize: ['none'],
	grayscale: ['0'],
	invert: ['0'],
	sepia: ['0']
};

// --- Shorthand/longhand overlap nodes ----------------------------------------
//
// A shorthand utility overrides several longhand utilities at once: `size-*`
// sets width and height, `m-*` sets every margin side, `inset-x-*` sets left
// and right, `rounded-t-*` sets both top corners. Related utilities can't
// simply share a conflict key — that would also make the longhand siblings
// conflict with each other (`w-4`/`h-4`, `mt-2`/`mb-2`) — so each conflict
// group is instead tagged with an overlap node, and groups whose nodes are
// connected through the covers relation below (under the same variant prefix)
// are merged before reporting. Siblings never touch without their shorthand.

// The side nodes of a spacing-style family (`m`, `p`, `scroll-m`, `scroll-p`):
// the bare prefix covers every side, the axes cover their physical sides. The
// logical `s`/`e` sides are leaves — they only merge through the bare prefix.
const sideOverlapCovers = (
	prefix: string
): ReadonlyArray<readonly [string, ReadonlyArray<string>]> => [
	[prefix, SIDES.map((side) => `${prefix}${side}`)],
	[`${prefix}x`, [`${prefix}r`, `${prefix}l`]],
	[`${prefix}y`, [`${prefix}t`, `${prefix}b`]]
];

// An axis family (`gap`, `overflow`, `translate`, …): the bare form sets all
// axes, so it covers the per-axis forms; the axes stay independent otherwise.
const axisOverlapCovers = (
	prefix: string
): readonly [string, ReadonlyArray<string>] => [
	prefix,
	[`${prefix}-x`, `${prefix}-y`]
];

const OVERLAP_COVERS: ReadonlyMap<string, ReadonlyArray<string>> = new Map<
	string,
	ReadonlyArray<string>
>([
	['size', ['w', 'h']],
	...sideOverlapCovers('m'),
	...sideOverlapCovers('p'),
	...sideOverlapCovers('scroll-m'),
	...sideOverlapCovers('scroll-p'),
	[
		'inset',
		[
			'inset-x',
			'inset-y',
			'inset-bs',
			'inset-be',
			'top',
			'right',
			'bottom',
			'left',
			'start',
			'end'
		]
	],
	['inset-x', ['right', 'left']],
	['inset-y', ['top', 'bottom']],
	axisOverlapCovers('gap'),
	axisOverlapCovers('overflow'),
	axisOverlapCovers('overscroll'),
	axisOverlapCovers('translate'),
	// `translate-none` resets every axis, including `z` — which the bare
	// `translate` shorthand above does not reach.
	[
		'translate-none',
		['translate', 'translate-x', 'translate-y', 'translate-z']
	],
	axisOverlapCovers('scale'),
	axisOverlapCovers('skew'),
	axisOverlapCovers('border-spacing'),
	['rounded', CORNERS.map((corner) => `rounded-${corner}`)],
	['rounded-t', ['rounded-tl', 'rounded-tr']],
	['rounded-r', ['rounded-tr', 'rounded-br']],
	['rounded-b', ['rounded-bl', 'rounded-br']],
	['rounded-l', ['rounded-tl', 'rounded-bl']],
	['rounded-s', ['rounded-ss', 'rounded-es']],
	['rounded-e', ['rounded-se', 'rounded-ee']],
	['border-w', SIDES.map((side) => `border-w-${side}`)],
	['border-w-x', ['border-w-r', 'border-w-l']],
	['border-w-y', ['border-w-t', 'border-w-b']],
	['border-color', SIDES.map((side) => `border-color-${side}`)],
	['border-color-x', ['border-color-r', 'border-color-l']],
	['border-color-y', ['border-color-t', 'border-color-b']],
	['touch', ['touch-x', 'touch-y', 'touch-pz']],
	// A font-size always reaches its own modifier-bearing siblings; only the
	// modifier-bearing node reaches `leading` (see `getConflictKey`).
	['text-size', ['text-size-leading']],
	['text-size-leading', ['leading']],
	// `flex-1`/`flex-auto`/`flex-none` set flex-grow, flex-shrink, and
	// flex-basis at once.
	['flex-sizing', ['grow', 'shrink', 'basis']],
	// `truncate` sets overflow (both axes), text-overflow, and white-space.
	[
		'truncate',
		['overflow', 'overflow-x', 'overflow-y', 'text-overflow', 'whitespace']
	],
	// `line-clamp-*` sets `display` (to `-webkit-box`) and `overflow` (to
	// `hidden`) unconditionally — unlike `truncate`, it doesn't set
	// `text-overflow`/`white-space`, and it reaches every single-word display
	// keyword (see `SINGLE_WORD_DISPLAY_KEYWORDS`).
	[
		'line-clamp',
		[
			...SINGLE_WORD_DISPLAY_KEYWORDS.map((word) => `display-${word}`),
			'overflow',
			'overflow-x',
			'overflow-y'
		]
	],
	// Naming a container also sets its type, so it conflicts with a plain,
	// unnamed `container-type` utility too.
	['container-named', ['container-type']],
	// `normal-nums` resets the whole font-variant-numeric property, so it
	// conflicts with every other value — but a figure/spacing/fraction style
	// doesn't conflict with a style from a different one of those three.
	[
		'fvn-normal',
		[
			'fvn-ordinal',
			'fvn-slashed-zero',
			'fvn-figure',
			'fvn-spacing',
			'fvn-fraction'
		]
	]
]);

// The undirected adjacency of the covers relation, so component merging can
// walk from a shorthand down to its longhands and from a longhand back up.
const buildOverlapNeighborsMap = (): ReadonlyMap<
	string,
	ReadonlyArray<string>
> => {
	const map = new Map<string, string[]>();

	for (const [node, covered] of OVERLAP_COVERS) {
		for (const target of covered) {
			getOrCreate(map, node, () => []).push(target);
			getOrCreate(map, target, () => []).push(node);
		}
	}

	return map;
};

const OVERLAP_NEIGHBORS = buildOverlapNeighborsMap();

const EMPTY_NODE_LIST: ReadonlyArray<string> = [];

export const overlapNeighbors = (node: string): ReadonlyArray<string> => {
	const neighbors = OVERLAP_NEIGHBORS.get(node);

	/* c8 ignore next 3 -- every node getOverlapNode emits appears in the covers table */
	if (neighbors === undefined) {
		return EMPTY_NODE_LIST;
	}

	return neighbors;
};

// Segments that are an overlap node by themselves: every value of these
// prefixes sets the same property regardless of value shape (`w-4`, `w-[…]`,
// `mt-2`, `top-1/2`), so the value category is irrelevant to the node.
const SEGMENT_OVERLAP_NODES: ReadonlySet<string> = new Set([
	'size',
	'w',
	'h',
	'top',
	'right',
	'bottom',
	'left',
	'start',
	'end',
	'grow',
	'shrink',
	'basis',
	'whitespace',
	'm',
	...SIDES.map((side) => `m${side}`),
	'p',
	...SIDES.map((side) => `p${side}`)
]);

// Prefixes classified by axisSpec whose bare form sets all axes: the category
// picks between the whole-property node and a per-axis node.
const AXIS_OVERLAP_PREFIXES: ReadonlySet<string> = new Set([
	'inset',
	'gap',
	'overflow',
	'overscroll',
	'translate',
	'scale',
	'skew'
]);

// The scroll-margin/scroll-padding categories of the `scroll` prefix spec —
// the only `scroll-*` utilities with a shorthand overlap.
const SCROLL_SPACING_CATEGORIES: ReadonlySet<string> = new Set([
	'm',
	...SIDES.map((side) => `m${side}`),
	'p',
	...SIDES.map((side) => `p${side}`)
]);

const getAxisOverlapNode = (
	segment: string,
	category: string
): string | null => {
	if (category === 'all') {
		return segment;
	}

	if (
		category === 'x' ||
		category === 'y' ||
		category === 'bs' ||
		category === 'be'
	) {
		return `${segment}-${category}`;
	}

	return null;
};

const getRoundedOverlapNode = (category: string): string => {
	if (category === 'all') {
		return 'rounded';
	}

	// The remaining rounded categories are the corner names themselves.
	return `rounded-${category}`;
};

const getBorderOverlapNode = (category: string): string | null => {
	if (category === 'width') {
		return 'border-w';
	}

	if (category === 'color') {
		return 'border-color';
	}

	// A per-side width category is `${side}-width` (see `borderSideSpec`).
	if (category.endsWith('-width')) {
		return `border-w-${category.slice(0, -'-width'.length)}`;
	}

	// A per-side color category is `${side}-color` (see `borderSideSpec`).
	if (category.endsWith('-color')) {
		return `border-color-${category.slice(0, -'-color'.length)}`;
	}

	if (category.startsWith('spacing-')) {
		return getAxisOverlapNode(
			'border-spacing',
			category.slice('spacing-'.length)
		);
	}

	return null;
};

// `translate-none` resets every axis including `z`, unlike the bare form
// (which only reaches `x`/`y` through the generic axis handling) — see
// `translateSpec` and the `translate-none` entry in `OVERLAP_COVERS`.
const getTranslateOverlapNode = (category: string): string | null => {
	if (category === 'none') {
		return 'translate-none';
	}

	if (category === 'z') {
		return 'translate-z';
	}

	return getAxisOverlapNode('translate', category);
};

const getScrollOverlapNode = (category: string): string | null => {
	if (SCROLL_SPACING_CATEGORIES.has(category)) {
		return `scroll-${category}`;
	}

	return null;
};

// The `flex` sizing values (`flex-1`, `flex-auto`, `flex-none`) overlap
// grow/shrink/basis; the direction and wrap categories don't.
const getFlexOverlapNode = (category: string): string | null => {
	if (category === 'flex') {
		return 'flex-sizing';
	}

	return null;
};

// A font-size utility always overlaps its sibling sizes, and — only when it
// carries a `/leading` postfix modifier (see `getConflictKey`) — the
// separate `leading-*` utility too, since the modifier sets line-height
// directly.
const getTextOverlapNode = (category: string): string | null => {
	if (category === 'overflow') {
		return 'text-overflow';
	}

	if (category === 'size') {
		return 'text-size';
	}

	return null;
};

// `line-clamp-*` sets display and overflow as a side effect (see
// `OVERLAP_COVERS['line-clamp']`); `line-through` and other `line-*`
// categories take no part in the overlap graph.
const getLineOverlapNode = (category: string): string | null => {
	if (category === 'clamp-value') {
		return 'line-clamp';
	}

	return null;
};

const getLeadingOverlapNode = (): string => 'leading';

// `touch-none`/`touch-auto`/`touch-manipulation` overlap the `pan`/`pinch`
// sub-utilities; the other pan directions (`left`/`right`/`up`/`down`)
// compose instead of conflicting, so they're left unconnected.
const getTouchOverlapNode = (category: string): string | null => {
	if (category === 'base') {
		return 'touch';
	}

	if (category === 'pan-x') {
		return 'touch-x';
	}

	if (category === 'pan-y') {
		return 'touch-y';
	}

	if (category === 'pinch') {
		return 'touch-pz';
	}

	return null;
};

const SEGMENT_OVERLAP_HANDLERS: ReadonlyMap<
	string,
	(category: string) => string | null
> = new Map([
	['translate', getTranslateOverlapNode],
	['rounded', getRoundedOverlapNode],
	['border', getBorderOverlapNode],
	['scroll', getScrollOverlapNode],
	['flex', getFlexOverlapNode],
	['text', getTextOverlapNode],
	['line', getLineOverlapNode],
	['leading', getLeadingOverlapNode],
	['touch', getTouchOverlapNode]
]);

// The overlap node for a token's conflict group, or null when the token takes
// part in no shorthand/longhand relation.
const getOverlapNode = (segment: string, category: string): string | null => {
	if (SEGMENT_OVERLAP_NODES.has(segment)) {
		return segment;
	}

	const handler = SEGMENT_OVERLAP_HANDLERS.get(segment);

	if (handler) {
		return handler(category);
	}

	if (AXIS_OVERLAP_PREFIXES.has(segment)) {
		return getAxisOverlapNode(segment, category);
	}

	return null;
};

// Single-word utilities that set the properties of several other namespaces
// (`truncate` is overflow + text-overflow + white-space at once), so they get
// a conflict key of their own despite having no dashed family — no
// exclusive-groups opt-in needed.
//
// Every single-word `display` value gets its own node too (`display-flex`,
// `display-block`, …, never one shared across keywords), so `line-clamp`
// (which always sets `display`) can reach any of them without making the
// keywords conflict with *each other* by default (that stays behind
// `exclusiveGroups: true`). Hyphenated display keywords are excluded — see
// `SINGLE_WORD_DISPLAY_KEYWORDS`.
//
// Font-variant-numeric is a star, not a flat set: `lining-nums`/`oldstyle-nums`
// share a node and conflict directly, but a figure style doesn't conflict with
// a spacing (`tabular-nums`) or fraction (`diagonal-fractions`) style — only
// `normal-nums` reaches every value, via the `fvn-normal` bridge in
// `OVERLAP_COVERS`. Default-on (unlike `display`) since these words are
// unlikely to collide with a project's own class names.
const SINGLE_WORD_OVERLAP_NODES: Record<string, string> = {
	truncate: 'truncate',
	...Object.fromEntries(
		SINGLE_WORD_DISPLAY_KEYWORDS.map((word) => [word, `display-${word}`])
	),
	'normal-nums': 'fvn-normal',
	ordinal: 'fvn-ordinal',
	'slashed-zero': 'fvn-slashed-zero',
	'lining-nums': 'fvn-figure',
	'oldstyle-nums': 'fvn-figure',
	'proportional-nums': 'fvn-spacing',
	'tabular-nums': 'fvn-spacing',
	'diagonal-fractions': 'fvn-fraction',
	'stacked-fractions': 'fvn-fraction'
};

// The conflict key plus the pieces an overlap merge needs: the variant prefix
// and the overlap node the token belongs to (null for tokens outside every
// overlap family, including exclusive-group keys).
export type ConflictKeyInfo = {
	key: string;
	variantPrefix: string;
	overlap: string | null;
};

// Splits `text` on `separator` characters that sit outside square brackets or
// parens, so arbitrary values keep their content intact as a single segment —
// `[calc(100%-2rem)]` isn't split on its inner dash, `[url(data:image/png)]`
// isn't split on its inner colon, and a Tailwind v4 CSS-variable shorthand
// like `w-(--my-var)` isn't split on the dash inside the variable name.
const splitOutsideBrackets = (text: string, separator: string): string[] => {
	const segments: string[] = [];
	let depth = 0;
	let start = 0;

	for (let index = 0; index < text.length; index += 1) {
		const char = text.charAt(index);

		if (char === '[' || char === '(') {
			depth += 1;
		} else if (char === ']' || char === ')') {
			depth -= 1;
		} else if (char === separator && depth === 0) {
			segments.push(text.slice(start, index));
			start = index + 1;
		}
	}

	segments.push(text.slice(start));

	return segments;
};

// Splits a token into its variant prefix and utility on the top-level colons.
// Variant segments are sorted so stacked variants in any order
// (`hover:focus:w-2` vs `focus:hover:w-2`) share one canonical prefix — the
// prefix only ever feeds the conflict key, never a report message.
const splitVariantPrefix = (
	token: string
): { variantPrefix: string; utility: string } => {
	const segments = splitOutsideBrackets(token, ':');
	const utility = segments.pop();

	/* c8 ignore next 3 -- splitOutsideBrackets always returns at least one segment */
	if (utility === undefined) {
		return { variantPrefix: '', utility: token };
	}

	return { variantPrefix: segments.sort().join(':'), utility };
};

const CONTAINER_TYPE_PREFIX = '@container';

// `@container`/`@container-normal`/`@container-size` all set one property
// (`container-type`), so they conflict directly regardless of keyword — unlike
// every other prefix here, they don't split into further categories. A `/name`
// suffix on any of the three additionally names the container
// (`container-named`), which still conflicts with a plain, unnamed
// `container-type` utility since naming also sets the type (see
// `OVERLAP_COVERS`); different names aren't distinguished from each other,
// matching tailwind-merge's own `container-named` classGroupId. This bypasses
// the regular dash-segment parsing entirely because `@container`/
// `@container/name` have no top-level `-` while `@container-size/name` does —
// too inconsistent for the normal `firstSegment` model.
const getContainerConflictKey = (
	bare: string,
	variantPrefix: string
): ConflictKeyInfo | null => {
	if (
		bare !== CONTAINER_TYPE_PREFIX &&
		!bare.startsWith(`${CONTAINER_TYPE_PREFIX}-`) &&
		!bare.startsWith(`${CONTAINER_TYPE_PREFIX}/`)
	) {
		return null;
	}

	const hasName = splitOutsideBrackets(bare, '/').length > 1;

	return {
		key: `${variantPrefix}|container|${hasName ? 'named' : 'type'}`,
		variantPrefix,
		overlap: hasName ? 'container-named' : 'container-type'
	};
};

// Returns null for tokens that don't look like a namespaced utility — single
// words (`flex`), purely-prefixed (`-`), or anything without a top-level `-`
// after the optional leading negative marker. The `!` important marker is
// stripped — trailing (Tailwind v4 `w-200!`) or leading (Tailwind v3
// `!w-200`) — so it doesn't split the conflict key.
export const getConflictKey = (
	token: string,
	exclusiveGroups: ReadonlyMap<string, string>
): ConflictKeyInfo | null => {
	let stripped = token;

	if (token.endsWith('!')) {
		stripped = token.slice(0, -1);
	}

	const { variantPrefix, utility } = splitVariantPrefix(stripped);
	let bare = utility;

	if (bare.startsWith('!')) {
		bare = bare.slice(1);
	}

	if (bare.startsWith('-')) {
		bare = bare.slice(1);
	}

	// Takes precedence — can unify utilities the heuristic can't (single words,
	// or hyphenated siblings that don't share a prefix).
	const groupId = exclusiveGroups.get(bare);

	if (groupId !== undefined) {
		return {
			key: `${variantPrefix}|#${groupId}`,
			variantPrefix,
			overlap: null
		};
	}

	const containerInfo = getContainerConflictKey(bare, variantPrefix);

	if (containerInfo !== null) {
		return containerInfo;
	}

	// Matched on the full, un-split string — many of these words contain a
	// `-` themselves (`inline-block`, `table-caption`, `diagonal-fractions`),
	// so this has to run before the dash-split below, not inside its
	// `value.length === 0` branch (which would miss every hyphenated one).
	const wordOverlap = SINGLE_WORD_OVERLAP_NODES[bare];

	if (wordOverlap !== undefined) {
		return {
			key: `${variantPrefix}|${wordOverlap}`,
			variantPrefix,
			overlap: wordOverlap
		};
	}

	const value = splitOutsideBrackets(bare, '-');
	const firstSegment = value.shift();

	/* c8 ignore next 3 -- splitOutsideBrackets always returns at least one segment */
	if (firstSegment === undefined) {
		return null;
	}

	if (value.length === 0) {
		const bareValue = BARE_UTILITIES[firstSegment];

		if (bareValue === undefined) {
			return null;
		}

		const category = categorize(firstSegment, bareValue);

		return {
			key: `${variantPrefix}|${firstSegment}|${category}`,
			variantPrefix,
			overlap: getOverlapNode(firstSegment, category)
		};
	}

	// Tokens collide when they share a first segment and resolve to the same
	// property category (see `categorize`): `text-sm` (size) and `text-red-500`
	// (color) don't, while `text-red-500` and `text-blue-500` do.
	const category = categorize(firstSegment, value);

	// `text-lg/6` sets both font-size and line-height, so it also conflicts
	// with a bare `leading-*` — but plain `text-lg` (no modifier) doesn't. The
	// two get distinct keys so a plain and a modifier-bearing font-size never
	// share a group by mistake; the `text-size`/`text-size-leading` overlap
	// nodes reunite them whenever both are actually present (see
	// `OVERLAP_COVERS`).
	if (firstSegment === 'text' && category === 'size') {
		/* c8 ignore next -- value is non-empty here (the length === 0 case returns earlier) */
		const lastValueSegment = value[value.length - 1] ?? '';

		if (splitOutsideBrackets(lastValueSegment, '/').length > 1) {
			return {
				key: `${variantPrefix}|text|size-leading`,
				variantPrefix,
				overlap: 'text-size-leading'
			};
		}
	}

	return {
		key: `${variantPrefix}|${firstSegment}|${category}`,
		variantPrefix,
		overlap: getOverlapNode(firstSegment, category)
	};
};