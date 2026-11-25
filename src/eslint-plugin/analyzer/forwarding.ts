import type { Rule, Scope } from 'eslint';
import type {
	ArrayPattern,
	CallExpression,
	Identifier,
	MemberExpression,
	Node,
	ObjectPattern,
	Pattern,
	Program,
	VariableDeclarator
} from 'estree';
import type { Component } from './components.ts';
import { getKeyName } from './config-keys.ts';
import {
	type ComponentFunction,
	findVariable,
	getConstDefInit,
	getLookupScope,
	getModuleScope,
	isComponentFunction,
	isInTemplate,
	resolveArray,
	unwrapExpression
} from './const-bindings.ts';
import { getProperties, getStrictProperties } from './properties.ts';
import {
	CLASS_ATTRIBUTES,
	getJsxAttributeName,
	getJsxComponentName,
	getSvelteComponentName,
	getSvelteTagRoot,
	getVueAttributeName,
	getVueComponentName,
	getVueRootElements,
	hasIsolatedSvelteParts,
	type JsxAttribute,
	type JsxOpeningElement,
	type MarkupNode,
	pushRawRangeTokens,
	type SvelteAttribute,
	type SvelteAttributePart,
	type SvelteStartTag,
	type VAttribute,
	type VElement
} from './markup.ts';
import {
	areExclusivePaths,
	type BranchPath,
	type ClassParts,
	collectCallParts,
	collectParts,
	EMPTY_PATH,
	emptyParts,
	forEachOverrideParts,
	isClassListCall,
	pathAt
} from './restyle.ts';
import { getStaticStringText } from './literals.ts';
import {
	isDefinedValue,
	isLiteralTrue,
	isUndefinedValue
} from './static-predicates.ts';
import {
	readOverride,
	literalStyles,
	readVariantValue,
	resolveInvocation,
	type CallInputs,
	type StyledClasses,
	type StyledContext
} from './styled-values.ts';
import {
	forEachStringLiteralElement,
	type PresetValues
} from './token-extraction.ts';
import { createTrackedCallResolver } from './tracked-calls.ts';
import { readTypedProps } from './typed-props.ts';

// The props a call's spreads of a component's props leave out: the ones in
// `omits`, and any outside `picks` when every spread holds only picked props.
type SpreadOmits = {
	omits: ReadonlySet<string>;
	picks: ReadonlySet<string> | null;
};

/**
 * A part a component merges its `class` prop into, as an element passing it
 * no props renders it, with what an element's props change: the component
 * prop each of its unread variant props is read from, the ones of those with
 * no default (an element leaving one out has the call pass `undefined`), the
 * prop its `preset` is read from, and the props its spreads of the
 * component's props leave out, null when it doesn't spread them into its
 * own. `spreadProps` is set for a part the class reaches through such a
 * spread rather than by name: the class props the spread carries.
 */
type ForwardTarget = StyledClasses & {
	variantProps: ReadonlyMap<string, string>;
	optionalProps: ReadonlyMap<string, string>;
	presetProp: string | null;
	spread: SpreadOmits | null;
	spreadProps: ReadonlySet<string> | null;
};

/**
 * What a component merges its class prop into: the prop it reads by name,
 * null when it only spreads its props, and each part.
 */
export type ForwardedStyles = {
	prop: string | null;
	targets: ReadonlyArray<ForwardTarget>;
};

// The values an element passes its props as.
type SitePropValues = Map<string, ReadonlySet<string> | null>;

/**
 * The variant values an element passes each prop as, null when they can't be
 * read; a prop it doesn't pass, or passes as `undefined`, has no entry. `open`
 * tells that a spread may pass any prop without one.
 */
type SiteProps = {
	values: ReadonlyMap<string, ReadonlySet<string> | null>;
	open: boolean;
};

// The site props being read off an element.
type SiteValues = { values: SitePropValues; open: boolean };

/** The component element a class attribute was written on. */
export type ComponentSite = {
	component: string;
	prop: string;
	scope: Scope.Scope;
	props: SiteProps;
};

// The site of a class attribute written on an element, under `prop` and
// looked up in `scope`: null for an element that isn't a component's.
type SiteMaker = (prop: string, scope: Scope.Scope) => ComponentSite | null;

/** A file's scan, as the module cache analyzes it. */
export type ModuleScan = {
	ast: Program;
	moduleScope: Scope.Scope;
	forwarded: ReadonlyMap<Component, ForwardedStyles>;
	ctx: StyledContext;
};

type PositionHandlers = {
	onPosition?: (parts: ClassParts, site: ComponentSite | null) => void;
	onExit: (scan: ModuleScan) => void;
};

/**
 * The shared half of `no-restyle`: every class-list position in a file, and
 * which components forward a `class` prop into one of them. The rule layers
 * reporting on top of it for the file being linted; the cross-file loader runs
 * it bare over an imported module.
 */
type ForwardingScan = {
	forwarded: ReadonlyMap<Component, ForwardedStyles>;
	listener: Rule.RuleListener;
};

// A prop a props pattern destructures, with the default it's given, if any.
type PropBinding = { prop: string; defaultValue: Node | null };

// A prop read: which component's, under which name, with which default.
type PropRead = PropBinding & { component: Component };

// What a props pattern destructures: its bindings by local name, the props it
// names, and the name of its rest.
type PropsPattern = {
	bindings: Map<string, PropBinding>;
	keys: string[];
	rest: string | null;
};

// An object holding a component's props, with the defaults it gives them:
// Vue's `withDefaults()` or `defineProps()` defaults, or the objects Solid's
// `merge()` merges below the props. A rest of them (`...rest`) leaves out the
// props its pattern destructures, as Solid's `omit()` and `splitProps()` do
// the ones they name, an object `splitProps()` picks holds only the `picked`
// ones, and the objects `merge()` merges above the props force their values
// over the element's.
type PropsObject = {
	component: Component;
	defaults: ReadonlyMap<string, Node>;
	omitted: ReadonlySet<string>;
	picked: ReadonlySet<string> | null;
	forced: ReadonlyMap<string, Node>;
};

// The keys a `splitProps()` key list names that can be read, and whether
// every one of them can.
type KeyList = { keys: string[]; complete: boolean };

// A props object a call is handed, and the index of the argument it is.
type PropsArgument = { source: PropsObject; index: number };

// The variants a call reads from a component's props, and those of them whose
// prop has no default.
type VariantProps = Pick<ForwardTarget, 'variantProps' | 'optionalProps'>;

// A prop read off a props object by name: `props.size`.
type MemberRead = { source: PropsObject; prop: string };

// A position found during the walk, read once the walk is over — so an import
// or a props declaration written below its use (a Svelte template above its
// `<script>`) has been seen by then.
type PendingPosition = {
	site: ComponentSite | null;
	run: (emit: PartsCallback) => void;
	forwards: () => boolean;
	fallsThrough: boolean;
};

// Receives a position's class parts: filled by a collector, or read by an
// emitter.
type PartsCallback = (parts: ClassParts) => void;

// A pending position once its walk has run: the class parts it produced.
type CollectedPosition = Pick<PendingPosition, 'site'> & { parts: ClassParts };

// Calls whose result is a single-file component's props, read at the top level
// of its script: Svelte's `$props()` rune, and Vue's `defineProps()` (bare or
// under `withDefaults()`) and `useAttrs()`.
const PROPS_SOURCES = new Set([
	'$props',
	'defineProps',
	'withDefaults',
	'useAttrs'
]);

const NO_DEFAULTS: ReadonlyMap<string, Node> = new Map();

const NO_PROPS: ReadonlySet<string> = new Set();

// Vue's one class attribute: the one a component's undeclared attributes carry
// to its root element, and the one it merges from a `v-bind` object.
const VUE_CLASS: ReadonlySet<string> = new Set(['class']);

// What Vue casts a `Boolean` prop the element leaves out to.
const ABSENT_BOOLEAN: Node = { type: 'Literal', value: false, raw: 'false' };

// What a JSX or Svelte attribute written without a value passes.
const TRUE_VALUE: ReadonlySet<string> = new Set(['true']);

// The props object of a component as a whole, with the defaults it gives.
const wholeProps = (
	component: Component,
	defaults: ReadonlyMap<string, Node>
): PropsObject => ({
	component,
	defaults,
	omitted: NO_PROPS,
	picked: null,
	forced: NO_DEFAULTS
});

// The read of `prop` off a props object.
const propReadOf = (source: PropsObject, prop: string): PropRead => ({
	component: source.component,
	prop,
	defaultValue: source.defaults.get(prop) ?? null
});

// The object a `v-bind="object"` directive passes, null for any other
// attribute.
const getVueBindObject = ({ key, value }: VAttribute): Node | null => {
	if (
		key.type !== 'VDirectiveKey' ||
		key.name.name !== 'bind' ||
		key.argument !== null ||
		value?.type !== 'VExpressionContainer'
	) {
		return null;
	}

	return value.expression;
};

const isBooleanConstructor = (node: Node): boolean =>
	node.type === 'Identifier' && node.name === 'Boolean';

// Whether a variable is written to after it's declared, so it may hold
// something else than what it was declared with.
const isReassigned = (variable: Scope.Variable): boolean =>
	variable.references.some(
		(reference) => reference.isWrite() && !reference.init
	);

// What `bindings` holds for a variable. A null one is unbound, or a name a
// Vue template binds itself (`v-for`, `v-slot`), which no script binding
// stands for. One assigned to again no longer stands for what it was bound
// to.
const lookupBinding = <T>(
	bindings: ReadonlyMap<Scope.Variable, T>,
	variable: Scope.Variable | null
): T | null => {
	if (variable === null || isReassigned(variable)) {
		return null;
	}

	return bindings.get(variable) ?? null;
};

// The names of the attributes after the one at `index`, which replace a prop
// a spread there passes.
const getNamesAfter = <T>(
	attributes: ReadonlyArray<T>,
	index: number,
	getName: (attribute: T) => string | null
): ReadonlySet<string> => {
	const names = new Set<string>();

	for (const attribute of attributes.slice(index + 1)) {
		const name = getName(attribute);

		if (name !== null) {
			names.add(name);
		}
	}

	return names;
};

const getJsxSpreadReplacer = (
	attribute: JsxOpeningElement['attributes'][number]
): string | null => {
	if (attribute.type !== 'JSXAttribute') {
		return null;
	}

	return getJsxAttributeName(attribute);
};

const getSvelteReplacer = (
	attribute: SvelteStartTag['attributes'][number]
): string | null => {
	if (
		attribute.type === 'SvelteAttribute' ||
		attribute.type === 'SvelteShorthandAttribute'
	) {
		return attribute.key.name;
	}

	return null;
};

const getJsxAttributeValue = (node: JsxAttribute): Node | null => {
	const { value } = node;

	if (value === null) {
		return null;
	}

	if (value.type !== 'JSXExpressionContainer') {
		return value;
	}

	return value.expression;
};

// Reads a props pattern: each local name maps to the prop a call site would
// pass and the default (`{ size = 'md' }`) it's given, and the props it names
// are the ones its rest (`...rest`) leaves out.
const readPropsPattern = (pattern: ObjectPattern): PropsPattern => {
	const result: PropsPattern = { bindings: new Map(), keys: [], rest: null };

	for (const property of pattern.properties) {
		if (property.type === 'RestElement') {
			if (property.argument.type === 'Identifier') {
				result.rest = property.argument.name;
			}

			continue;
		}

		const key = getKeyName(property);

		if (key === null) {
			continue;
		}

		result.keys.push(key);

		let target = property.value;
		let defaultValue: Node | null = null;

		if (target.type === 'AssignmentPattern') {
			defaultValue = target.right;
			target = target.left;
		}

		if (target.type === 'Identifier') {
			result.bindings.set(target.name, { prop: key, defaultValue });
		}
	}

	return result;
};

const isSplitPropsCall = (node: Node): node is CallExpression =>
	node.type === 'CallExpression' &&
	node.callee.type === 'Identifier' &&
	node.callee.name === 'splitProps';

// Emits the parts `collect` gathers into a fresh class list.
const emitCollected = (emit: PartsCallback, collect: PartsCallback) => {
	const parts = emptyParts();

	collect(parts);
	emit(parts);
};

// The sites of an element's class attributes, with the props `read` finds
// it passes, read only for a component's element.
const createSiteMaker = (
	component: string | null,
	read: (props: SiteValues) => void
): SiteMaker => {
	if (component === null) {
		return () => null;
	}

	const props: SiteValues = { values: new Map(), open: false };

	read(props);

	return (prop, scope) => ({ component, prop, scope, props });
};

// `icon-size` as the `iconSize` prop Vue passes it as.
const camelize = (name: string): string =>
	name.replace(/-(\w)/g, (_match, letter: string) => letter.toUpperCase());

// What an element passes a prop as: `undefined` when it doesn't, null when
// that can't be read, as for any prop a spread may pass.
const readSiteProp = (
	props: SiteProps,
	prop: string
): ReadonlySet<string> | null | undefined => {
	const value = props.values.get(prop);

	if (value === undefined && props.open) {
		return null;
	}

	return value;
};

// Opens each variant the call doesn't pass itself, as something it can't read
// may set any of them.
const openUnpassed = (
	matchers: Map<string, ReadonlySet<string>>,
	passed: ReadonlySet<string>
) => {
	for (const variant of matchers.keys()) {
		if (!passed.has(variant)) {
			matchers.delete(variant);
		}
	}
};

// A variant read from a prop an element passes: set to its value, open when
// that can't be read, and left alone when it isn't passed.
const setSiteVariant = (
	matchers: Map<string, ReadonlySet<string>>,
	variant: string,
	value: ReadonlySet<string> | null | undefined
) => {
	if (value === null) {
		matchers.delete(variant);
	} else if (value !== undefined) {
		matchers.set(variant, value);
	}
};

// The props a call passes at an element: its own, less each variant read from
// a prop with no default that the element leaves out, which passes `undefined`.
const getSitePassed = (
	{ inputs, optionalProps }: ForwardTarget,
	props: SiteProps
): ReadonlySet<string> => {
	const passed = new Set(inputs.passed);

	for (const [variant, prop] of optionalProps) {
		if (readSiteProp(props, prop) === undefined) {
			passed.delete(variant);
		}
	}

	return passed;
};

// The values of the preset an element passes, below the call's own props. One
// that can't be read, or isn't known in full, may set any of the others.
const applySitePreset = (
	matchers: Map<string, ReadonlySet<string>>,
	{ presets }: ForwardTarget['styles'],
	passed: ReadonlySet<string>,
	value: ReadonlySet<string> | null
) => {
	let preset: PresetValues | undefined;

	if (value !== null) {
		for (const name of value) {
			preset = presets.get(name);
		}
	}

	if (preset === undefined || !preset.complete) {
		openUnpassed(matchers, passed);
	}

	if (preset === undefined) {
		return;
	}

	for (const [variant, values] of preset.matchers) {
		if (!passed.has(variant)) {
			matchers.set(variant, values);
		}
	}
};

// Whether a props object holds no prop of the element's under a name: one it
// leaves out or forces a value of its own for (a forced prop is omitted too),
// or one outside those it picks.
const lacksProp = ({ omitted, picked }: PropsObject, prop: string): boolean =>
	omitted.has(prop) || (picked !== null && !picked.has(prop));

// The props every rest in `whole` leaves out, less those a picked object
// holds.
const getWholeOmits = (
	whole: readonly PropsObject[],
	picks: ReadonlySet<string>
): Set<string> => {
	const omitted = new Set<string>();

	for (const source of whole) {
		for (const key of source.omitted) {
			if (
				!picks.has(key) &&
				whole.every((other) => other.omitted.has(key))
			) {
				omitted.add(key);
			}
		}
	}

	return omitted;
};

// Whether the spreads of a component's props a call holds carry a prop.
const carriesProp = ({ omits, picks }: SpreadOmits, prop: string): boolean =>
	!omits.has(prop) && (picks === null || picks.has(prop));

// The props an element passes, which a call spreading the component's props
// passes on: each one the call doesn't pass itself sets the variant it names,
// the class, the preset and the props the spreads leave out aside.
const applySpreadProps = (
	matchers: Map<string, ReadonlySet<string>>,
	passed: ReadonlySet<string>,
	spread: SpreadOmits,
	props: SiteProps
) => {
	const isSpread = (prop: string): boolean =>
		!passed.has(prop) && carriesProp(spread, prop);

	if (props.open) {
		for (const variant of matchers.keys()) {
			if (isSpread(variant)) {
				matchers.delete(variant);
			}
		}
	}

	for (const [prop, value] of props.values) {
		if (
			isSpread(prop) &&
			!CLASS_ATTRIBUTES.has(prop) &&
			prop !== 'preset'
		) {
			setSiteVariant(matchers, prop, value);
		}
	}
};

// The component prop a call's preset comes from: the one it reads, or the
// `preset` prop itself when it spreads the component's props and passes none.
const getPresetProp = ({
	presetProp,
	spread,
	inputs
}: ForwardTarget): string | null => {
	if (presetProp !== null) {
		return presetProp;
	}

	if (
		spread !== null &&
		!inputs.passed.has('preset') &&
		carriesProp(spread, 'preset')
	) {
		return 'preset';
	}

	return null;
};

// Whether the class attribute an element is written with reaches a part:
// the one the component reads by name, or one its spread carries.
const isTargetOf =
	({ prop }: ForwardedStyles, site: ComponentSite) =>
	({ spreadProps }: ForwardTarget): boolean => {
		if (spreadProps !== null) {
			return spreadProps.has(site.prop);
		}

		return prop === site.prop;
	};

/**
 * The classes a forwarded part applies at an element. Later steps win, as at
 * runtime: the preset the element passes, then the props a call spreading the
 * component's props passes on, then each variant read from a prop.
 */
export const getSiteTargets = (
	styles: ForwardedStyles,
	site: ComponentSite
): StyledClasses[] =>
	styles.targets.filter(isTargetOf(styles, site)).map((target) => {
		const matchers = new Map(target.matchers);
		const presetProp = getPresetProp(target);
		const passed = getSitePassed(target, site.props);

		if (presetProp !== null) {
			const value = readSiteProp(site.props, presetProp);

			if (value !== undefined) {
				applySitePreset(matchers, target.styles, passed, value);
			}
		}

		if (target.spread !== null) {
			applySpreadProps(matchers, passed, target.spread, site.props);
		}

		for (const [variant, prop] of target.variantProps) {
			setSiteVariant(matchers, variant, readSiteProp(site.props, prop));
		}

		return { ...target, matchers };
	});

export const createForwardingScan = (
	context: Rule.RuleContext,
	handlers: PositionHandlers,
	alias?: Record<string, string>
): ForwardingScan => {
	const { sourceCode } = context;
	const ctx = createTrackedCallResolver(context, createForwardingScan, alias);
	const forwarded = new Map<Component, ForwardedStyles>();
	// Where a component's `class` prop can be read from: the binding a props
	// pattern put it in, or an object holding the whole props — the props
	// parameter, a `defineProps()` result, or a view derived from either
	// (Solid's `merge`, `omit`).
	const propBindings = new Map<Scope.Variable, PropRead>();
	// The names destructured off a props object that forces their value.
	const forcedBindings = new Map<Scope.Variable, Node>();
	const propsObjects = new Map<Scope.Variable, PropsObject>();
	const pending: PendingPosition[] = [];
	// The class props each read made up for a spread of the props stands for.
	const spreadReads = new WeakMap<Node, ReadonlySet<string>>();
	// The props a Vue `<script setup>` declares, which its template reads by
	// name.
	let templateProps: PropsObject | null = null;

	// The values `const` declarations hold, read wherever the name is used.
	const constValues = new Set<Node>();
	// Whether a Vue component lets the attributes it doesn't declare as props
	// fall through to its root element, and whether `class` is one it does.
	let inheritsAttrs = true;
	let declaresClass = false;
	let vueRoots: ReadonlyArray<VElement> | null = null;

	const moduleScope = (): Scope.Scope => getModuleScope(sourceCode);

	const deferParts = (
		site: ComponentSite | null,
		collect: PartsCallback,
		fallsThrough = false
	) => {
		pending.push({
			site,
			run(emit) {
				emitCollected(emit, collect);
			},
			forwards: () => true,
			fallsThrough
		});
	};

	// Makes the variable of `declared` named `name` refer to `object`.
	const bindPropsObject = (
		declared: ReadonlyArray<Scope.Variable>,
		name: string,
		object: PropsObject
	) => {
		for (const variable of declared) {
			if (variable.name === name) {
				propsObjects.set(variable, object);
			}
		}
	};

	// A pattern's own default for a prop wins over the props object's. The
	// rest of the props (`...rest`) is a props object of its own.
	const registerBindings = (
		declared: ReadonlyArray<Scope.Variable>,
		pattern: ObjectPattern,
		source: PropsObject
	) => {
		const { bindings, keys, rest } = readPropsPattern(pattern);

		for (const variable of declared) {
			const binding = bindings.get(variable.name);

			if (variable.name === rest) {
				propsObjects.set(variable, {
					...source,
					omitted: new Set([...source.omitted, ...keys])
				});
			} else if (binding !== undefined) {
				registerBinding(variable, binding, source);
			}
		}
	};

	// A props object bound to a name, or destructured by a pattern.
	const registerPropsTarget = (
		declared: ReadonlyArray<Scope.Variable>,
		target: Pattern,
		object: PropsObject
	) => {
		if (target.type === 'ObjectPattern') {
			registerBindings(declared, target, object);
		} else if (target.type === 'Identifier') {
			bindPropsObject(declared, target.name, object);
		}
	};

	// A name a pattern destructures a prop into: the element's prop, or the
	// value the props object forces over it.
	const registerBinding = (
		variable: Scope.Variable,
		binding: PropBinding,
		source: PropsObject
	) => {
		const { component, defaults, forced } = source;
		const value = forced.get(binding.prop);

		if (value !== undefined) {
			forcedBindings.set(variable, value);

			return;
		}

		// A prop the object doesn't hold reads as nothing of the element's
		if (lacksProp(source, binding.prop)) {
			return;
		}

		propBindings.set(variable, {
			component,
			prop: binding.prop,
			defaultValue:
				binding.defaultValue ?? defaults.get(binding.prop) ?? null
		});
	};

	// A component function's props are its first parameter, destructured or
	// taken whole, with or without a default (`{ className } = {}`).
	const registerFunctionProps = (fn: ComponentFunction) => {
		let [param] = fn.params;

		if (param === undefined) {
			return;
		}

		if (param.type === 'AssignmentPattern') {
			param = param.left;
		}

		const declared = sourceCode.getDeclaredVariables(fn);
		const props = wholeProps(fn, NO_DEFAULTS);

		registerPropsTarget(declared, param, props);
	};

	// The props object a name refers to.
	const getPropsObject = (node: Identifier): PropsObject | null =>
		lookupBinding(propsObjects, ctx.variableOf(node));

	// The properties of an object a call is handed.
	const readObjectArgument = (
		arg: CallExpression['arguments'][number] | undefined
	): ReadonlyMap<string, Node> => {
		if (arg === undefined) {
			return NO_DEFAULTS;
		}

		return getProperties(ctx.resolve(arg));
	};

	// Whether a runtime prop declaration's type is or lists `Boolean`: bare
	// (`Boolean`, `[String, Boolean]`) or as an options object's `type`.
	const declaresBoolean = (options: Node): boolean => {
		let type = options;

		if (options.type === 'ObjectExpression') {
			type = ctx.resolve(getProperties(options).get('type') ?? options);
		}

		if (type.type === 'ArrayExpression') {
			return type.elements.some(
				(element) => element !== null && isBooleanConstructor(element)
			);
		}

		return isBooleanConstructor(type);
	};

	// `defaults`, with each `boolean` prop of a type-based `defineProps<…>()`
	// declaration that it gives no default cast to `false`, as Vue does.
	const withTypedBooleans = (
		defaults: ReadonlyMap<string, Node>,
		declaration: Node | undefined
	): ReadonlyMap<string, Node> => {
		if (declaration?.type !== 'CallExpression') {
			return defaults;
		}

		const result = new Map(defaults);

		for (const [prop, isBoolean] of readTypedProps(
			declaration,
			sourceCode.ast
		)) {
			if (isBoolean && !result.has(prop)) {
				result.set(prop, ABSENT_BOOLEAN);
			}
		}

		return result;
	};

	// The defaults a props source declares: `withDefaults()`'s second
	// argument, or each `default` of a `defineProps()` runtime declaration,
	// where a `Boolean` prop without one defaults to `false` — or a `boolean`
	// one of a type-based declaration, under `withDefaults()` too.
	const readSourceDefaults = (
		name: string,
		call: CallExpression
	): ReadonlyMap<string, Node> => {
		const [declaration, defaults] = call.arguments;

		if (name === 'withDefaults') {
			return withTypedBooleans(readObjectArgument(defaults), declaration);
		}

		if (name !== 'defineProps') {
			return NO_DEFAULTS;
		}

		const result = new Map<string, Node>();

		for (const [prop, value] of readObjectArgument(declaration)) {
			const options = ctx.resolve(value);
			const fallback = getProperties(options).get('default');

			if (fallback !== undefined) {
				result.set(prop, fallback);
			} else if (declaresBoolean(options)) {
				result.set(prop, ABSENT_BOOLEAN);
			}
		}

		return withTypedBooleans(result, call);
	};

	// A view of a props object a call is handed as its argument `index`: the
	// objects before it merge `defaults` below it, the ones after force each
	// defined prop of theirs over it, and Solid's `omit()` leaves out the
	// props its other arguments name.
	const getPropsView = (
		source: PropsObject,
		defaults: ReadonlyMap<string, Node>,
		{ callee, arguments: args }: CallExpression,
		index: number
	): PropsObject => {
		const isOmit = callee.type === 'Identifier' && callee.name === 'omit';
		const omitted = new Set(source.omitted);
		const forced = new Map(source.forced);

		for (const arg of args.slice(index + 1)) {
			for (const [key, value] of readObjectArgument(arg)) {
				if (isDefinedValue(value, sourceCode)) {
					forced.set(key, value);
					omitted.add(key);
				}
			}

			const key = getStaticStringText(ctx.resolve(arg));

			if (isOmit && key !== null) {
				omitted.add(key);
			}
		}

		return {
			...source,
			defaults: new Map([...defaults, ...source.defaults]),
			omitted,
			forced
		};
	};

	// The first argument of a call that names a props object, or null when
	// none does.
	const findPropsArgument = (
		args: CallExpression['arguments']
	): PropsArgument | null => {
		for (const [index, arg] of args.entries()) {
			if (arg.type === 'Identifier') {
				const source = getPropsObject(arg);

				if (source !== null) {
					return { source, index };
				}
			}
		}

		return null;
	};

	// The props object a call yields: the module's, for a props source like
	// `$props()`; a view of a props object the call is handed, for a derived
	// one like `omit(props, …)`, whose defaults gain the objects `merge()`
	// merges below it (`merge({ size: 'sm' }, props)`).
	const getPropsSource = (init: CallExpression): PropsObject | null => {
		const { callee } = init;

		if (callee.type === 'Identifier' && PROPS_SOURCES.has(callee.name)) {
			return wholeProps(
				sourceCode.ast,
				readSourceDefaults(callee.name, init)
			);
		}

		const found = findPropsArgument(init.arguments);

		// Most calls are handed no props object, so their arguments are
		// never read as defaults.
		if (found === null) {
			return null;
		}

		const defaults = new Map<string, Node>();

		for (const arg of init.arguments.slice(0, found.index)) {
			for (const [key, value] of readObjectArgument(arg)) {
				defaults.set(key, value);
			}
		}

		return getPropsView(found.source, defaults, init, found.index);
	};

	// The props object a declarator's initializer holds: a props call's
	// result, or the props object itself, destructured or renamed in the
	// component body (`const { className } = props`).
	const getInitSource = (init: Node): PropsObject | null => {
		if (init.type === 'CallExpression') {
			return getPropsSource(init);
		}

		if (init.type === 'Identifier') {
			return getPropsObject(init);
		}

		return null;
	};

	// The keys a `splitProps()` key list names that can be read, and whether
	// that is all of them.
	const readKeyList = (list: Node): KeyList => {
		const array = resolveArray(list, sourceCode);
		const keys: string[] = [];

		if (array === null) {
			return { keys, complete: false };
		}

		let complete = true;

		for (const element of array.elements) {
			let key: string | null = null;

			if (element !== null) {
				key = getStaticStringText(ctx.resolve(element));
			}

			if (key === null) {
				complete = false;
			} else {
				keys.push(key);
			}
		}

		return { keys, complete };
	};

	// A props object holding only the props a key list names, or all of
	// them when the list can't be read in full.
	const pickProps = (
		source: PropsObject,
		{ keys, complete }: KeyList
	): PropsObject => {
		if (!complete) {
			return source;
		}

		const { picked } = source;

		return {
			...source,
			picked: new Set(
				keys.filter((key) => picked === null || picked.has(key))
			)
		};
	};

	// The props objects Solid's `splitProps(props, [...keys], …)` returns: one
	// per key list, holding the props it names, then the rest, which leaves
	// out every key they list. Each is bound to a name, or destructured.
	const registerSplitProps = (
		declared: ReadonlyArray<Scope.Variable>,
		pattern: ArrayPattern,
		init: CallExpression,
		source: PropsObject
	) => {
		const [, ...lists] = init.arguments;
		const keyLists = lists.map(readKeyList);
		const rest: PropsObject = {
			...source,
			omitted: new Set([
				...source.omitted,
				...keyLists.flatMap(({ keys }) => keys)
			])
		};

		pattern.elements.forEach((element, index) => {
			// An element past the rest holds nothing
			if (element === null || index > keyLists.length) {
				return;
			}

			const list = keyLists[index];
			let object = rest;

			if (list !== undefined) {
				object = pickProps(source, list);
			}

			registerPropsTarget(declared, element, object);
		});
	};

	const visitDeclarator = (node: VariableDeclarator) => {
		const { id, init } = node;

		if (!init) {
			return;
		}

		const declared = sourceCode.getDeclaredVariables(node);

		for (const variable of declared) {
			for (const def of variable.defs) {
				const value = getConstDefInit(def);

				if (value !== null) {
					constValues.add(value);
				}
			}
		}

		const value = unwrapExpression(init);
		const source = getInitSource(value);

		if (source === null) {
			return;
		}

		if (id.type === 'ObjectPattern') {
			registerBindings(declared, id, source);

			return;
		}

		if (id.type === 'ArrayPattern' && isSplitPropsCall(value)) {
			registerSplitProps(declared, id, value, source);

			return;
		}

		for (const variable of declared) {
			propsObjects.set(variable, source);
		}
	};

	// A name a Vue template reads that no `<script>` or template binding
	// declares.
	const isUnboundTemplateName = (node: Identifier): boolean => {
		if (!isInTemplate(node, sourceCode)) {
			return false;
		}

		const scope = getLookupScope(node, sourceCode);

		return scope !== null && findVariable(scope, node.name) === null;
	};

	// `$attrs` in a Vue template: the attributes the component is passed,
	// unless a binding of that name shadows it.
	const readTemplateAttrs = (node: Identifier): PropsObject | null => {
		if (node.name !== '$attrs' || !isUnboundTemplateName(node)) {
			return null;
		}

		return wholeProps(sourceCode.ast, NO_DEFAULTS);
	};

	// The props object a name refers to, or `$attrs` in a Vue template.
	const getPropsOrAttrs = (node: Identifier): PropsObject | null =>
		getPropsObject(node) ?? readTemplateAttrs(node);

	// The props object a non-computed member read is off, or `$attrs` in a
	// Vue template, and the prop it names.
	const readMember = (node: MemberExpression): MemberRead | null => {
		// Read through type-only wrappers: `props!.size`, `(props as P).size`
		const object = unwrapExpression(node.object);

		if (
			node.computed ||
			node.property.type !== 'Identifier' ||
			object.type !== 'Identifier'
		) {
			return null;
		}

		const source = getPropsOrAttrs(object);

		if (source === null) {
			return null;
		}

		return { source, prop: node.property.name };
	};

	// The value a props object forces over the element's for a prop read off
	// it (`merge(props, { size: 'lg' }).size`), or destructured off it.
	const readForcedValue = (node: Node): Node | null => {
		if (node.type === 'Identifier') {
			return lookupBinding(forcedBindings, ctx.variableOf(node));
		}

		if (node.type !== 'MemberExpression') {
			return null;
		}

		const read = readMember(node);

		if (read === null) {
			return null;
		}

		return read.source.forced.get(read.prop) ?? null;
	};

	// `props.className` — a prop read off a props object, or off `$attrs` in
	// a Vue template. One the object forces a value of its own for is no
	// prop of the element's.
	const readMemberProp = (node: MemberExpression): PropRead | null => {
		const read = readMember(node);

		if (read === null || lacksProp(read.source, read.prop)) {
			return null;
		}

		return propReadOf(read.source, read.prop);
	};

	// A name a Vue template reads that no `<script>` or template binding
	// declares: a prop `defineProps()` declares, which the template reaches
	// by name.
	const readTemplateProp = (node: Identifier): PropRead | null => {
		if (templateProps === null || !isUnboundTemplateName(node)) {
			return null;
		}

		return propReadOf(templateProps, node.name);
	};

	// The prop a value reads, if it is one.
	const readProp = (node: Node): PropRead | null => {
		if (node.type === 'MemberExpression') {
			return readMemberProp(node);
		}

		if (node.type !== 'Identifier') {
			return null;
		}

		return (
			lookupBinding(propBindings, ctx.variableOf(node)) ??
			readTemplateProp(node)
		);
	};

	// The prop of `component` a value reads, if it is one.
	const readComponentProp = (
		value: Node,
		component: Component
	): PropRead | null => {
		const read = readProp(ctx.resolve(value));

		if (read === null || read.component !== component) {
			return null;
		}

		return read;
	};

	// The props object of `component` a value is, whole or the rest of them.
	const getComponentProps = (
		value: Node,
		component: Component
	): PropsObject | null => {
		// Read by name, not resolved: a `const` holding a view of the props
		// (`omit(props, …)`) is a props object of its own, unlike its call.
		const node = unwrapExpression(value);

		if (node.type !== 'Identifier') {
			return null;
		}

		const source = getPropsObject(node);

		if (source === null || source.component !== component) {
			return null;
		}

		return source;
	};

	// The props none of a call's spreads of `component`'s props carries: the
	// ones every rest among them leaves out, less those a picked object holds,
	// or any but those when each spread is a picked object. Null unless it
	// spreads them, and nothing else.
	const getSpreadOmits = (
		spreads: CallInputs['spreads'],
		component: Component
	): SpreadOmits | null => {
		if (spreads === null || spreads.length === 0) {
			return null;
		}

		const whole: PropsObject[] = [];
		const picks = new Set<string>();

		for (const spread of spreads) {
			const source = getComponentProps(spread, component);

			if (source === null) {
				return null;
			}

			if (source.picked === null) {
				whole.push(source);
				continue;
			}

			// The props a picked object holds of the element's: those it
			// picks, less the ones it leaves out.
			for (const key of source.picked) {
				if (!source.omitted.has(key)) {
					picks.add(key);
				}
			}
		}

		if (whole.length === 0) {
			return { omits: NO_PROPS, picks };
		}

		return { omits: getWholeOmits(whole, picks), picks: null };
	};

	// The component prop a call's preset is read from, null when it reads
	// none. One that can't be read, or is read with a default, may set any
	// variant the call doesn't pass itself.
	const readPresetProp = (
		{ passed, preset }: CallInputs,
		component: Component,
		matchers: Map<string, ReadonlySet<string>>
	): string | null => {
		if (preset === undefined) {
			return null;
		}

		const read = readComponentProp(preset, component);

		if (read === null || read.defaultValue !== null) {
			openUnpassed(matchers, passed);

			return null;
		}

		return read.prop;
	};

	// The variants a call reads from `component`'s props, setting each to the
	// value it is forced to or the default of its prop, and opening each the
	// call sets to something else it can't read.
	const readVariantProps = (
		unreadProps: ReadonlyMap<string, Node>,
		component: Component,
		matchers: Map<string, ReadonlySet<string>>
	): VariantProps => {
		const variantProps = new Map<string, string>();
		const optionalProps = new Map<string, string>();

		for (const [variant, value] of unreadProps) {
			const forced = readForcedValue(ctx.resolve(value));

			if (forced !== null) {
				setVariantValue(matchers, variant, forced);
				continue;
			}

			const read = readComponentProp(value, component);

			if (read === null) {
				matchers.delete(variant);
				continue;
			}

			variantProps.set(variant, read.prop);

			if (read.defaultValue === null) {
				optionalProps.set(variant, read.prop);
			} else {
				setVariantValue(matchers, variant, read.defaultValue);
			}
		}

		return { variantProps, optionalProps };
	};

	/**
	 * A part a component forwards its prop into, as an element passing it no
	 * props renders it: a variant read from a prop takes the prop's default,
	 * if it has one, and the call's spread of the component's props passes
	 * nothing. Anything else the call can't read may set any variant it
	 * doesn't pass itself: a variant or preset not read from a prop, a preset
	 * read from a prop with a default, and any other spread.
	 */
	const getForwardTarget = (
		part: StyledClasses,
		component: Component,
		spreadProps: ReadonlySet<string> | null
	): ForwardTarget => {
		const { passed, spreads } = part.inputs;
		const matchers = new Map(part.defaultMatchers);
		const spread = getSpreadOmits(spreads, component);
		const presetProp = readPresetProp(part.inputs, component, matchers);

		if (spreads === null || (spreads.length > 0 && spread === null)) {
			openUnpassed(matchers, passed);
		}

		return {
			...part,
			matchers,
			unreadProps: NO_DEFAULTS,
			...readVariantProps(part.unreadProps, component, matchers),
			presetProp,
			spread,
			spreadProps
		};
	};

	// What a forwarded prop, written in `path`, is merged with at this
	// position: the parts outside the other sides of its branch nodes. The
	// literals inside a `cn()` list count too — `cn('p-2', className)` applies
	// `p-2` just as a config would — and with `mergesAll` every one does, for
	// a class merged onto the whole position. Each target reaches the class
	// through `spreadProps`, when through a spread.
	const getForwardTargets = (
		parts: ClassParts,
		path: BranchPath,
		component: Component,
		spreadProps: ReadonlySet<string> | null,
		mergesAll = false
	): ForwardTarget[] => {
		const { paths } = parts;
		const styled = parts.styled
			.filter(
				(_part, index) =>
					!areExclusivePaths(path, pathAt(paths.styled, index))
			)
			.map((part) => getForwardTarget(part, component, spreadProps));
		const literals = parts.literals.filter(
			(entry, index) =>
				(mergesAll || parts.merged.has(entry)) &&
				!areExclusivePaths(path, pathAt(paths.literals, index))
		);

		if (literals.length > 0) {
			return [
				...styled,
				getForwardTarget(
					literalStyles(literals),
					component,
					spreadProps
				)
			];
		}

		return styled;
	};

	// Adds the targets a component forwards `prop` into to those kept for it.
	// A null prop, for a class reached other than by name, keeps the one it
	// already forwards by name.
	const addForwarded = (
		component: Component,
		prop: string | null,
		targets: ReadonlyArray<ForwardTarget>
	) => {
		if (targets.length === 0) {
			return;
		}

		const kept = forwarded.get(component);

		forwarded.set(component, {
			prop: prop ?? kept?.prop ?? null,
			targets: [...(kept?.targets ?? []), ...targets]
		});
	};

	// Every position a component forwards its prop into is kept, as any of
	// them may render: two elements, or the branches of an early return. A
	// component forwarding both `class` and `className` by name keeps the
	// first; a spread of its props carries either.
	const trackForwarding = (parts: ClassParts) => {
		parts.dynamic.forEach((node, index) => {
			const read = readProp(node);

			if (read === null || !CLASS_ATTRIBUTES.has(read.prop)) {
				return;
			}

			const spreadProps = spreadReads.get(node) ?? null;
			let prop: string | null = null;

			if (spreadProps === null) {
				const kept = forwarded.get(read.component)?.prop ?? read.prop;

				// A second class prop read by name is left to the first
				if (kept !== read.prop) {
					return;
				}

				prop = read.prop;
			}

			addForwarded(
				read.component,
				prop,
				getForwardTargets(
					parts,
					pathAt(parts.paths.dynamic, index),
					read.component,
					spreadProps
				)
			);
		});
	};

	// The class a Vue component's element passes falls through to its root
	// element, merged with every class written there.
	const trackFallthrough = (parts: ClassParts) => {
		const component = sourceCode.ast;

		addForwarded(
			component,
			null,
			getForwardTargets(parts, EMPTY_PATH, component, VUE_CLASS, true)
		);
	};

	// Whether a runtime props declaration names `class`: in an array of
	// names, or as a key of an object.
	const declaresClassProp = (declaration: Node): boolean => {
		const resolved = ctx.resolve(declaration);

		if (resolved.type === 'ObjectExpression') {
			return getProperties(resolved).has('class');
		}

		let found = false;

		forEachStringLiteralElement(resolved, sourceCode, (name) => {
			found ||= name === 'class';
		});

		return found;
	};

	// A Vue component's options (`defineOptions()`, `defineComponent()` or
	// the default export): an `inheritAttrs` that isn't `true` keeps the
	// undeclared attributes off its root element, and `props` may declare
	// `class`.
	const recordComponentOptions = (options: Node) => {
		const properties = getProperties(ctx.resolve(options));
		const inherit = properties.get('inheritAttrs');
		const props = properties.get('props');

		if (inherit !== undefined) {
			const value = ctx.resolve(inherit);

			inheritsAttrs = isLiteralTrue(value);
		}

		if (props !== undefined && declaresClassProp(props)) {
			declaresClass = true;
		}
	};

	// The component options or props declaration a Vue macro is handed.
	const recordComponentCall = (node: CallExpression) => {
		const { callee } = node;
		const [options] = node.arguments;

		if (callee.type !== 'Identifier') {
			return;
		}

		let declaration: Node | null = null;

		if (options !== undefined && options.type !== 'SpreadElement') {
			declaration = options;
		}

		if (callee.name === 'defineProps') {
			declaresClass ||=
				readTypedProps(node, sourceCode.ast).has('class') ||
				(declaration !== null && declaresClassProp(declaration));
		} else if (
			declaration !== null &&
			(callee.name === 'defineOptions' ||
				callee.name === 'defineComponent')
		) {
			recordComponentOptions(declaration);
		}
	};

	// A read of the class prop a spread of a component's props carries, made
	// up to stand for it: `props.class` for `button(props)`. Null for a spread
	// of anything else, or of props that leave both class props out.
	const readSpreadClass = (spread: Node): MemberExpression | null => {
		const object = unwrapExpression(spread);

		if (object.type !== 'Identifier') {
			return null;
		}

		const source = getPropsOrAttrs(object);

		if (source === null) {
			return null;
		}

		const carried = [...CLASS_ATTRIBUTES].filter(
			(prop) => !lacksProp(source, prop)
		);
		const [name] = carried;

		if (name === undefined) {
			return null;
		}

		const read: MemberExpression = {
			type: 'MemberExpression',
			object,
			property: { type: 'Identifier', name },
			computed: false,
			optional: false
		};

		spreadReads.set(read, new Set(carried));

		return read;
	};

	// The props a `defineProps()` call declares, with the defaults it or a
	// `withDefaults()` around it gives them. `withDefaults()` is entered
	// first, so the `defineProps()` inside adds to its defaults.
	const recordTemplateProps = (node: CallExpression) => {
		const { callee } = node;

		if (
			callee.type !== 'Identifier' ||
			(callee.name !== 'defineProps' && callee.name !== 'withDefaults')
		) {
			return;
		}

		const defaults = new Map([
			...readSourceDefaults(callee.name, node),
			...(templateProps?.defaults ?? NO_DEFAULTS)
		]);

		templateProps = wholeProps(sourceCode.ast, defaults);
	};

	// A `cn()` (or config-less `sv()`) call is a class list in its own right,
	// wherever it is written; a variant-function call is checked through the
	// override it is passed.
	const visitCall = (node: CallExpression) => {
		recordTemplateProps(node);
		recordComponentCall(node);
		pending.push({
			site: null,
			fallsThrough: false,
			// A class list that is a `const`'s value is read in full wherever
			// the `const` is used, so a prop forwarded into it is tracked there.
			forwards: () =>
				!(constValues.has(node) && isClassListCall(node, ctx)),
			run(emit) {
				if (isClassListCall(node, ctx)) {
					emitCollected(emit, (parts) => {
						collectCallParts(node, ctx, parts);
					});

					return;
				}

				const invocation = resolveInvocation(node, ctx);

				if (invocation === null) {
					return;
				}

				const { value, spreads } = readOverride(node.arguments[0], ctx);

				if (value !== null) {
					forEachOverrideParts(value, invocation, ctx, emit);
				}

				// The class an element passes reaches the call through a
				// spread of the component's props too
				for (const spread of spreads) {
					const read = readSpreadClass(spread);

					if (read !== null) {
						forEachOverrideParts(read, invocation, ctx, emit);
					}
				}
			}
		});
	};

	// A prop passed as `value`; one passed as `undefined` isn't passed, even
	// when an earlier attribute or spread passed it.
	const setSiteValue = (props: SiteValues, name: string, value: Node) => {
		if (isUndefinedValue(ctx.resolve(value))) {
			props.values.delete(name);
		} else {
			props.values.set(name, readVariantValue(value, ctx));
		}
	};

	// A spread passes each prop of the object it spreads, over the ones passed
	// before it. An object that can't be read in full may pass any prop.
	const setSpreadValues = (props: SiteValues, value: Node | null) => {
		let object: ReadonlyMap<string, Node> | null = null;

		if (value !== null) {
			object = getStrictProperties(ctx.resolve(value));
		}

		if (object === null) {
			for (const name of props.values.keys()) {
				props.values.set(name, null);
			}

			props.open = true;

			return;
		}

		for (const [name, prop] of object) {
			setSiteValue(props, name, prop);
		}
	};

	// A variant set to `value`, open when it can't be read; an `undefined`
	// one leaves the variant as it is.
	const setVariantValue = (
		matchers: Map<string, ReadonlySet<string>>,
		variant: string,
		value: Node
	) => {
		if (!isUndefinedValue(ctx.resolve(value))) {
			setSiteVariant(matchers, variant, readVariantValue(value, ctx));
		}
	};

	const readJsxProps = (node: JsxOpeningElement, props: SiteValues) => {
		for (const attribute of node.attributes) {
			if (attribute.type === 'JSXSpreadAttribute') {
				setSpreadValues(props, attribute.argument);
				continue;
			}

			const name = getJsxAttributeName(attribute);
			const value = getJsxAttributeValue(attribute);

			if (name === null) {
				continue;
			}

			if (value === null) {
				props.values.set(name, TRUE_VALUE);
			} else {
				setSiteValue(props, name, value);
			}
		}
	};

	// A Svelte attribute's value: none passes `true`, a lone text or
	// expression is read, and text mixed with expressions can't be.
	const setSvelteValue = (
		props: SiteValues,
		name: string,
		parts: ReadonlyArray<SvelteAttributePart>
	) => {
		const [part] = parts;

		if (part === undefined) {
			props.values.set(name, TRUE_VALUE);
		} else if (parts.length > 1) {
			props.values.set(name, null);
		} else if (part.type === 'SvelteLiteral') {
			props.values.set(name, new Set([part.value]));
		} else {
			setSiteValue(props, name, part.expression);
		}
	};

	// A `bind:` directive passes a state the element reads back, which can't
	// be read.
	const readSvelteProps = (tag: SvelteStartTag, props: SiteValues) => {
		for (const attribute of tag.attributes) {
			if (attribute.type === 'SvelteAttribute') {
				setSvelteValue(props, attribute.key.name, attribute.value);
			} else if (attribute.type === 'SvelteShorthandAttribute') {
				setSiteValue(props, attribute.key.name, attribute.value);
			} else if (attribute.type === 'SvelteSpreadAttribute') {
				setSpreadValues(props, attribute.argument);
			} else if (
				attribute.type === 'SvelteDirective' &&
				attribute.kind === 'Binding'
			) {
				props.values.set(attribute.key.name.name, null);
			}
		}
	};

	// A Vue directive passing props other than by attribute: `v-model:size`
	// a state it reads back, `v-bind="object"` each prop of the object, and
	// `:[name]` a prop it can't name.
	const setVueDirectiveValue = (props: SiteValues, attribute: VAttribute) => {
		const { key } = attribute;

		/* c8 ignore next 3 -- only a directive has no attribute name */
		if (key.type !== 'VDirectiveKey') {
			return;
		}

		if (key.name.name === 'model') {
			if (key.argument?.type === 'VIdentifier') {
				props.values.set(camelize(key.argument.name), null);
			}

			return;
		}

		if (key.name.name !== 'bind') {
			return;
		}

		setSpreadValues(props, getVueBindObject(attribute));
	};

	// A Vue attribute's value: static text, or a `v-bind` expression. One
	// without a value is cast by the prop's declared type, so it isn't read.
	const setVueValue = (props: SiteValues, attribute: VAttribute) => {
		const name = getVueAttributeName(attribute);

		if (name === null) {
			setVueDirectiveValue(props, attribute);

			return;
		}

		const key = camelize(name);
		const { value } = attribute;

		if (value?.type === 'VLiteral') {
			props.values.set(key, new Set([value.value]));
		} else if (value?.expression) {
			setSiteValue(props, key, value.expression);
		} else {
			props.values.set(key, null);
		}
	};

	// The class props an object spread into an element's attributes passes,
	// read through `const` bindings; none unless it can be read in full.
	const readSpreadClasses = (
		argument: Node,
		names: ReadonlySet<string>
	): Map<string, Node> => {
		const classes = new Map<string, Node>();
		const properties = getStrictProperties(ctx.resolve(argument));

		if (properties === null) {
			return classes;
		}

		for (const name of names) {
			const value = properties.get(name);

			if (value !== undefined) {
				classes.set(name, value);
			}
		}

		return classes;
	};

	// Each class an object spread into an element's attributes passes, as a
	// class attribute would, unless an attribute after it replaces it.
	const visitClassSpread = (
		argument: Node,
		replaced: ReadonlySet<string>,
		site: (prop: string) => ComponentSite | null
	) => {
		for (const [prop, value] of readSpreadClasses(
			argument,
			CLASS_ATTRIBUTES
		)) {
			if (!replaced.has(prop)) {
				deferParts(site(prop), (parts) => {
					collectParts(value, ctx, parts);
				});
			}
		}
	};

	// A Svelte class attribute, read when each of its parts is a class list
	// of its own.
	const visitSvelteAttribute = (
		attribute: SvelteAttribute,
		site: ComponentSite | null
	) => {
		if (
			!CLASS_ATTRIBUTES.has(attribute.key.name) ||
			!hasIsolatedSvelteParts(attribute)
		) {
			return;
		}

		deferParts(site, (parts) => {
			for (const part of attribute.value) {
				if (part.type === 'SvelteLiteral') {
					pushRawRangeTokens(sourceCode, part.range, parts.literals);
				} else {
					collectParts(part.expression, ctx, parts);
				}
			}
		});
	};

	const visitJsxAttribute = (attribute: JsxAttribute, site: SiteMaker) => {
		const prop = getJsxAttributeName(attribute);

		if (prop === null || !CLASS_ATTRIBUTES.has(prop)) {
			return;
		}

		const value = getJsxAttributeValue(attribute);

		if (value === null) {
			return;
		}

		deferParts(site(prop, sourceCode.getScope(value)), (parts) => {
			collectParts(value, ctx, parts);
		});
	};

	// The class a `v-bind="object"` directive passes, which Vue merges with
	// the element's other classes: none unless the object can be read in full.
	const readVueBoundClass = (attribute: VAttribute): Node[] => {
		const object = getVueBindObject(attribute);

		if (object === null) {
			return [];
		}

		return [...readSpreadClasses(object, VUE_CLASS).values()];
	};

	const isVueClassAttribute = (attribute: VAttribute): boolean => {
		const name = getVueAttributeName(attribute);

		return name !== null && CLASS_ATTRIBUTES.has(name);
	};

	// Vue merges a static `class` attribute with a `:class` binding on the
	// same element, so both are read into one class list.
	const collectVueAttribute = (attribute: VAttribute, parts: ClassParts) => {
		const { value } = attribute;

		if (value === null) {
			return;
		}

		if (value.type === 'VLiteral') {
			pushRawRangeTokens(sourceCode, value.range, parts.literals);

			return;
		}

		if (value.expression !== null) {
			collectParts(value.expression, ctx, parts);
		}
	};

	const scriptVisitors = {
		':function'(node: MarkupNode) {
			if (isComponentFunction(node)) {
				registerFunctionProps(node);
			}
		},
		VariableDeclarator: visitDeclarator,
		CallExpression: visitCall,
		ExportDefaultDeclaration(node: MarkupNode) {
			/* c8 ignore next 3 -- the selector only matches this type */
			if (node.type !== 'ExportDefaultDeclaration') {
				return;
			}

			const { declaration } = node;

			if (
				declaration.type !== 'FunctionDeclaration' &&
				declaration.type !== 'ClassDeclaration'
			) {
				recordComponentOptions(declaration);
			}
		},
		JSXOpeningElement(node: MarkupNode) {
			/* c8 ignore next 3 -- the selector only matches this type */
			if (node.type !== 'JSXOpeningElement') {
				return;
			}

			const site = createSiteMaker(
				getJsxComponentName(node),
				(values) => {
					readJsxProps(node, values);
				}
			);

			node.attributes.forEach((attribute, index) => {
				if (attribute.type === 'JSXAttribute') {
					visitJsxAttribute(attribute, site);

					return;
				}

				const { argument } = attribute;

				visitClassSpread(
					argument,
					getNamesAfter(node.attributes, index, getJsxSpreadReplacer),
					(prop) => site(prop, sourceCode.getScope(argument))
				);
			});
		},
		SvelteElement(node: MarkupNode) {
			/* c8 ignore next 3 -- the selector only matches this type */
			if (node.type !== 'SvelteElement') {
				return;
			}

			const root = getSvelteTagRoot(node);
			const site = createSiteMaker(
				getSvelteComponentName(node),
				(values) => {
					readSvelteProps(node.startTag, values);
				}
			);
			// A tag is looked up where it's written, as a block or a snippet
			// may bind its name (`{#each items as Item}`)
			let scope = moduleScope();

			if (root !== null) {
				scope = sourceCode.getScope(root);
			}

			const { attributes } = node.startTag;

			attributes.forEach((attribute, index) => {
				if (attribute.type === 'SvelteSpreadAttribute') {
					visitClassSpread(
						attribute.argument,
						getNamesAfter(attributes, index, getSvelteReplacer),
						(prop) => site(prop, scope)
					);
				} else if (attribute.type === 'SvelteAttribute') {
					visitSvelteAttribute(
						attribute,
						site(attribute.key.name, scope)
					);
				}
			});
		},
		'Program:exit'() {
			const positions: CollectedPosition[] = [];

			for (const item of pending) {
				item.run((parts) => {
					positions.push({ parts, site: item.site });

					if (item.forwards()) {
						trackForwarding(parts);
					}

					if (item.fallsThrough && inheritsAttrs && !declaresClass) {
						trackFallthrough(parts);
					}
				});
			}

			// Every forward is known before any component site is checked.
			for (const position of positions) {
				handlers.onPosition?.(position.parts, position.site);
			}

			handlers.onExit({
				ast: sourceCode.ast,
				moduleScope: moduleScope(),
				forwarded,
				ctx
			});
		}
	};

	// Template expressions are only ever walked by the template visitor, so a
	// call written inside a `:class` binding is picked up here.
	const templateVisitors = {
		CallExpression: visitCall,
		VElement(node: MarkupNode) {
			/* c8 ignore next 3 -- the selector only matches this type */
			if (node.type !== 'VElement') {
				return;
			}

			const attributes =
				node.startTag.attributes.filter(isVueClassAttribute);
			const bound = node.startTag.attributes.flatMap(readVueBoundClass);

			if (attributes.length === 0 && bound.length === 0) {
				return;
			}

			const site = createSiteMaker(
				getVueComponentName(node),
				(values) => {
					for (const attribute of node.startTag.attributes) {
						setVueValue(values, attribute);
					}
				}
			);

			vueRoots ??= getVueRootElements(sourceCode.ast);

			deferParts(
				site('class', moduleScope()),
				(parts) => {
					for (const attribute of attributes) {
						collectVueAttribute(attribute, parts);
					}

					for (const value of bound) {
						collectParts(value, ctx, parts);
					}
				},
				vueRoots.includes(node)
			);
		}
	};

	const { defineTemplateBodyVisitor } = sourceCode.parserServices;
	let listener: Rule.RuleListener = scriptVisitors;

	// The template is walked when the program is entered, so the script's own
	// `Program:exit` above is the last thing to run — the parser's default
	// would walk the template only after it.
	if (typeof defineTemplateBodyVisitor === 'function') {
		listener = defineTemplateBodyVisitor(templateVisitors, scriptVisitors, {
			templateBodyTriggerSelector: 'Program'
		});
	}

	return { forwarded, listener };
};