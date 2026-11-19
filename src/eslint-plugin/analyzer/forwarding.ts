import type { Rule, Scope } from 'eslint';
import type {
	CallExpression,
	Identifier,
	MemberExpression,
	Node,
	ObjectPattern,
	Program,
	VariableDeclarator
} from 'estree';
import {
	type Component,
	type ComponentFunction,
	isComponentFunction
} from './components.ts';
import { getKeyName } from './config-keys.ts';
import { getModuleScope } from './const-bindings.ts';
import { getProperties } from './properties.ts';
import {
	CLASS_ATTRIBUTES,
	getJsxAttributeName,
	getJsxComponentName,
	getSvelteComponentName,
	getVueAttributeName,
	getVueComponentName,
	hasIsolatedSvelteParts,
	type JsxAttribute,
	type JsxOpeningElement,
	type MarkupNode,
	pushRawRangeTokens,
	type SvelteAttributePart,
	type SvelteStartTag,
	type VAttribute
} from './markup.ts';
import {
	areExclusivePaths,
	type BranchPath,
	type ClassParts,
	collectCallParts,
	collectParts,
	emptyParts,
	forEachOverrideParts,
	isClassListCall,
	pathAt
} from './restyle.ts';
import { isUndefinedValue } from './static-predicates.ts';
import {
	getOverrideValue,
	literalStyles,
	readVariantValue,
	resolveInvocation,
	type StyledClasses
} from './styled-values.ts';
import { createTrackedCallResolver } from './tracked-calls.ts';

/**
 * A part a component merges its `class` prop into, with the component prop
 * each of its unread variant props is read from.
 */
export type ForwardTarget = StyledClasses & {
	variantProps: ReadonlyMap<string, string>;
};

/** What a component merges its `class` prop into. */
export type ForwardedStyles = {
	prop: string;
	targets: ReadonlyArray<ForwardTarget>;
};

/**
 * The variant values an element passes a prop as, null when they can't be
 * read. A prop it doesn't pass, or passes as `undefined`, has no entry.
 */
export type SiteProps = ReadonlyMap<string, ReadonlySet<string> | null>;

// The site props being read off an element.
type SiteValues = Map<string, ReadonlySet<string> | null>;

/** The component element a class attribute was written on. */
export type ComponentSite = {
	component: string;
	prop: string;
	scope: Scope.Scope;
	props: SiteProps;
};

/** A file's scan, as the module cache analyzes it. */
export type ModuleScan = {
	ast: Program;
	moduleScope: Scope.Scope;
	forwarded: ReadonlyMap<Component, ForwardedStyles>;
};

type PositionHandlers = {
	onPosition?: (parts: ClassParts, site: ComponentSite | null) => void;
	onExit?: (scan: ModuleScan) => void;
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

// An object holding a component's props, with the defaults it gives them:
// Vue's `withDefaults()` or `defineProps()` defaults, or the objects Solid's
// `merge()` merges below the props.
type PropsObject = {
	component: Component;
	defaults: ReadonlyMap<string, Node>;
};

// A position found during the walk, read once the walk is over — so an import
// or a props declaration written below its use (a Svelte template above its
// `<script>`) has been seen by then.
type PendingPosition = {
	site: ComponentSite | null;
	run: (emit: PartsCallback) => void;
};

// Receives a position's class parts: filled by a collector, or read by an
// emitter.
type PartsCallback = (parts: ClassParts) => void;

// A pending position once its walk has run: the class parts it produced.
type CollectedPosition = Omit<PendingPosition, 'run'> & { parts: ClassParts };

// Calls whose result is a single-file component's props, read at the top level
// of its script: Svelte's `$props()` rune, and Vue's `defineProps()` (bare or
// under `withDefaults()`) and `useAttrs()`.
const PROPS_SOURCES = new Set([
	'$props',
	'defineProps',
	'withDefaults',
	'useAttrs'
]);

const EMPTY_VARIANT_PROPS: ReadonlyMap<string, string> = new Map();

const EMPTY_UNREAD_PROPS: ReadonlyMap<string, Node> = new Map();

const NO_SITE_PROPS: SiteProps = new Map();

const NO_DEFAULTS: ReadonlyMap<string, Node> = new Map();

// What a JSX or Svelte attribute written without a value passes.
const TRUE_VALUE: ReadonlySet<string> = new Set(['true']);

// What `bindings` holds for a variable. A null one is unbound, or a name a
// Vue template binds itself (`v-for`, `v-slot`), which no script binding
// stands for.
const lookupBinding = <T>(
	bindings: ReadonlyMap<Scope.Variable, T>,
	variable: Scope.Variable | null
): T | null => {
	if (variable === null) {
		return null;
	}

	return bindings.get(variable) ?? null;
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

// The local names a props pattern destructures props into, mapped to the prop
// name a call site would pass and the default (`{ size = 'md' }`) it's given.
const getPropBindings = (pattern: ObjectPattern): Map<string, PropBinding> => {
	const bindings = new Map<string, PropBinding>();

	for (const property of pattern.properties) {
		if (property.type !== 'Property') {
			continue;
		}

		const key = getKeyName(property);

		if (key === null) {
			continue;
		}

		let target = property.value;
		let defaultValue: Node | null = null;

		if (target.type === 'AssignmentPattern') {
			defaultValue = target.right;
			target = target.left;
		}

		if (target.type === 'Identifier') {
			bindings.set(target.name, { prop: key, defaultValue });
		}
	}

	return bindings;
};

// Emits the parts `collect` gathers into a fresh class list.
const emitCollected = (emit: PartsCallback, collect: PartsCallback) => {
	const parts = emptyParts();

	collect(parts);
	emit(parts);
};

const makeSite = (
	component: string | null,
	prop: string,
	scope: Scope.Scope,
	props: SiteProps
): ComponentSite | null => {
	if (component === null) {
		return null;
	}

	return { component, prop, scope, props };
};

// The props an element passes, read only for a component's element.
const readSiteProps = (
	component: string | null,
	read: (props: SiteValues) => void
): SiteProps => {
	if (component === null) {
		return NO_SITE_PROPS;
	}

	const props: SiteValues = new Map();

	read(props);

	return props;
};

// `icon-size` as the `iconSize` prop Vue passes it as.
const camelize = (name: string): string =>
	name.replace(/-(\w)/g, (_match, letter: string) => letter.toUpperCase());

/**
 * The classes a forwarded part applies at an element: each variant the
 * component reads from a prop takes the value the element passes it.
 */
export const getSiteTargets = (
	styles: ForwardedStyles,
	site: ComponentSite
): StyledClasses[] =>
	styles.targets.map((target) => {
		const matchers = new Map(target.matchers);

		for (const [variant, prop] of target.variantProps) {
			const value = site.props.get(prop);

			if (value === null) {
				matchers.delete(variant);
			} else if (value !== undefined) {
				matchers.set(variant, value);
			}
		}

		return { ...target, matchers };
	});

export const createForwardingScan = (
	context: Rule.RuleContext,
	handlers: PositionHandlers
): ForwardingScan => {
	const { sourceCode } = context;
	const ctx = createTrackedCallResolver(context);
	const forwarded = new Map<Component, ForwardedStyles>();
	// Where a component's `class` prop can be read from: the binding a props
	// pattern put it in, or an object holding the whole props — the props
	// parameter, a `defineProps()` result, or a view derived from either
	// (Solid's `merge`, `omit`).
	const propBindings = new Map<Scope.Variable, PropRead>();
	const propsObjects = new Map<Scope.Variable, PropsObject>();
	const pending: PendingPosition[] = [];

	const moduleScope = (): Scope.Scope => getModuleScope(sourceCode);

	const deferParts = (site: ComponentSite | null, collect: PartsCallback) => {
		pending.push({
			site,
			run(emit) {
				emitCollected(emit, collect);
			}
		});
	};

	// A pattern's own default for a prop wins over the props object's.
	const registerBindings = (
		declared: ReadonlyArray<Scope.Variable>,
		pattern: ObjectPattern,
		{ component, defaults }: PropsObject
	) => {
		const bindings = getPropBindings(pattern);

		for (const variable of declared) {
			const binding = bindings.get(variable.name);

			if (binding !== undefined) {
				propBindings.set(variable, {
					component,
					prop: binding.prop,
					defaultValue:
						binding.defaultValue ??
						defaults.get(binding.prop) ??
						null
				});
			}
		}
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
		const props: PropsObject = { component: fn, defaults: NO_DEFAULTS };

		if (param.type === 'ObjectPattern') {
			registerBindings(declared, param, props);

			return;
		}

		if (param.type !== 'Identifier') {
			return;
		}

		for (const variable of declared) {
			if (variable.name === param.name) {
				propsObjects.set(variable, props);
			}
		}
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

	// The defaults a props source declares: `withDefaults()`'s second
	// argument, or each `default` of a `defineProps()` runtime declaration.
	const readSourceDefaults = (
		name: string,
		[declaration, defaults]: CallExpression['arguments']
	): ReadonlyMap<string, Node> => {
		if (name === 'withDefaults') {
			return readObjectArgument(defaults);
		}

		if (name !== 'defineProps') {
			return NO_DEFAULTS;
		}

		const result = new Map<string, Node>();

		for (const [prop, value] of readObjectArgument(declaration)) {
			const fallback = getProperties(ctx.resolve(value)).get('default');

			if (fallback !== undefined) {
				result.set(prop, fallback);
			}
		}

		return result;
	};

	// The props object a call yields: the module's, for a props source like
	// `$props()`; a view of a props object the call is handed, for a derived
	// one like `omit(props, …)`, whose defaults gain the objects `merge()`
	// merges below it (`merge({ size: 'sm' }, props)`).
	const getPropsSource = (init: CallExpression): PropsObject | null => {
		const { callee } = init;

		if (callee.type === 'Identifier' && PROPS_SOURCES.has(callee.name)) {
			return {
				component: sourceCode.ast,
				defaults: readSourceDefaults(callee.name, init.arguments)
			};
		}

		const defaults = new Map<string, Node>();

		for (const arg of init.arguments) {
			if (arg.type === 'Identifier') {
				const source = getPropsObject(arg);

				if (source !== null) {
					return {
						component: source.component,
						defaults: new Map([...defaults, ...source.defaults])
					};
				}
			}

			for (const [key, value] of readObjectArgument(arg)) {
				defaults.set(key, value);
			}
		}

		return null;
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

	const visitDeclarator = (node: VariableDeclarator) => {
		const { id, init } = node;

		if (!init) {
			return;
		}

		const source = getInitSource(init);

		if (source === null) {
			return;
		}

		const declared = sourceCode.getDeclaredVariables(node);

		if (id.type === 'ObjectPattern') {
			registerBindings(declared, id, source);

			return;
		}

		for (const variable of declared) {
			propsObjects.set(variable, source);
		}
	};

	// `props.className` — a prop read off a props object.
	const readMemberProp = (node: MemberExpression): PropRead | null => {
		if (
			node.computed ||
			node.property.type !== 'Identifier' ||
			node.object.type !== 'Identifier'
		) {
			return null;
		}

		const source = getPropsObject(node.object);

		if (source === null) {
			return null;
		}

		const prop = node.property.name;

		return {
			component: source.component,
			prop,
			defaultValue: source.defaults.get(prop) ?? null
		};
	};

	// The prop a value reads, if it is one.
	const readProp = (node: Node): PropRead | null => {
		if (node.type === 'MemberExpression') {
			return readMemberProp(node);
		}

		if (node.type !== 'Identifier') {
			return null;
		}

		return lookupBinding(propBindings, ctx.variableOf(node));
	};

	// The component prop each of a part's unread variant props reads.
	// A part a component forwards its prop into, as an element that passes
	// it nothing renders it: each variant read from a destructured prop with
	// a default takes that default.
	const getForwardTarget = (
		part: StyledClasses,
		component: Component
	): ForwardTarget => {
		const matchers = new Map(part.defaultMatchers);
		const variantProps = new Map<string, string>();

		for (const [variant, value] of part.unreadProps) {
			const read = readProp(ctx.resolve(value));

			if (read === null || read.component !== component) {
				continue;
			}

			variantProps.set(variant, read.prop);

			if (read.defaultValue !== null) {
				setVariantValue(matchers, variant, read.defaultValue);
			}
		}

		return {
			...part,
			matchers,
			unreadProps: EMPTY_UNREAD_PROPS,
			variantProps
		};
	};

	// What a forwarded prop, written in `path`, is merged with at this
	// position: the parts outside the other sides of its branch nodes. The
	// literals inside a `cn()` list count too — `cn('p-2', className)` applies
	// `p-2` just as a config would. A variant the call can't read is left to
	// its default, as it is for an element that doesn't pass the component
	// the prop it's read from; one read from a component prop takes the value
	// an element passes it.
	const getForwardTargets = (
		parts: ClassParts,
		path: BranchPath,
		component: Component
	): ForwardTarget[] => {
		const { paths } = parts;
		const styled = parts.styled
			.filter(
				(_part, index) =>
					!areExclusivePaths(path, pathAt(paths.styled, index))
			)
			.map((part) => getForwardTarget(part, component));
		const literals = parts.literals.filter(
			(entry, index) =>
				parts.merged.has(entry) &&
				!areExclusivePaths(path, pathAt(paths.literals, index))
		);

		if (literals.length > 0) {
			return [
				...styled,
				{
					...literalStyles(literals),
					variantProps: EMPTY_VARIANT_PROPS
				}
			];
		}

		return styled;
	};

	// The first position a component forwards its prop into is the one kept.
	const trackForwarding = (parts: ClassParts) => {
		parts.dynamic.forEach((node, index) => {
			const read = readProp(node);

			if (
				read === null ||
				!CLASS_ATTRIBUTES.has(read.prop) ||
				forwarded.has(read.component)
			) {
				return;
			}

			const path = pathAt(parts.paths.dynamic, index);
			const targets = getForwardTargets(parts, path, read.component);

			if (targets.length > 0) {
				forwarded.set(read.component, { prop: read.prop, targets });
			}
		});
	};

	// A `cn()` (or config-less `sv()`) call is a class list in its own right,
	// wherever it is written; a variant-function call is checked through the
	// override it is passed.
	const visitCall = (node: CallExpression) => {
		pending.push({
			site: null,
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

				const value = getOverrideValue(node.arguments[0], ctx);

				if (value !== null) {
					forEachOverrideParts(value, invocation, ctx, emit);
				}
			}
		});
	};

	// A prop passed as `value`; one passed as `undefined` isn't passed.
	const setSiteValue = (props: SiteValues, name: string, value: Node) => {
		if (!isUndefinedValue(ctx.resolve(value))) {
			props.set(name, readVariantValue(value, ctx));
		}
	};

	// A variant set to `value`, open when it can't be read; an `undefined`
	// one leaves the variant as it is.
	const setVariantValue = (
		matchers: Map<string, ReadonlySet<string>>,
		variant: string,
		value: Node
	) => {
		if (isUndefinedValue(ctx.resolve(value))) {
			return;
		}

		const values = readVariantValue(value, ctx);

		if (values === null) {
			matchers.delete(variant);
		} else {
			matchers.set(variant, values);
		}
	};

	const readJsxProps = (node: JsxOpeningElement, props: SiteValues) => {
		for (const attribute of node.attributes) {
			if (attribute.type !== 'JSXAttribute') {
				continue;
			}

			const name = getJsxAttributeName(attribute);
			const value = getJsxAttributeValue(attribute);

			if (name === null) {
				continue;
			}

			if (value === null) {
				props.set(name, TRUE_VALUE);
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
			props.set(name, TRUE_VALUE);
		} else if (parts.length > 1) {
			props.set(name, null);
		} else if (part.type === 'SvelteLiteral') {
			props.set(name, new Set([part.value]));
		} else {
			setSiteValue(props, name, part.expression);
		}
	};

	const readSvelteProps = (tag: SvelteStartTag, props: SiteValues) => {
		for (const attribute of tag.attributes) {
			if (attribute.type === 'SvelteAttribute') {
				setSvelteValue(props, attribute.key.name, attribute.value);
			} else if (attribute.type === 'SvelteShorthandAttribute') {
				setSiteValue(props, attribute.key.name, attribute.value);
			}
		}
	};

	// A Vue attribute's value: static text, or a `v-bind` expression. One
	// without a value is cast by the prop's declared type, so it isn't read.
	const setVueValue = (props: SiteValues, attribute: VAttribute) => {
		const name = getVueAttributeName(attribute);

		if (name === null) {
			return;
		}

		const key = camelize(name);
		const { value } = attribute;

		if (value?.type === 'VLiteral') {
			props.set(key, new Set([value.value]));
		} else if (value?.expression) {
			setSiteValue(props, key, value.expression);
		} else {
			props.set(key, null);
		}
	};

	const visitJsxAttribute = (
		attribute: JsxAttribute,
		component: string | null,
		props: SiteProps
	) => {
		const prop = getJsxAttributeName(attribute);

		if (prop === null || !CLASS_ATTRIBUTES.has(prop)) {
			return;
		}

		const value = getJsxAttributeValue(attribute);

		if (value === null) {
			return;
		}

		deferParts(
			makeSite(component, prop, sourceCode.getScope(value), props),
			(parts) => {
				collectParts(value, ctx, parts);
			}
		);
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
		JSXOpeningElement(node: MarkupNode) {
			/* c8 ignore next 3 -- the selector only matches this type */
			if (node.type !== 'JSXOpeningElement') {
				return;
			}

			const component = getJsxComponentName(node);
			const props = readSiteProps(component, (values) => {
				readJsxProps(node, values);
			});

			for (const attribute of node.attributes) {
				if (attribute.type === 'JSXAttribute') {
					visitJsxAttribute(attribute, component, props);
				}
			}
		},
		SvelteElement(node: MarkupNode) {
			/* c8 ignore next 3 -- the selector only matches this type */
			if (node.type !== 'SvelteElement') {
				return;
			}

			const component = getSvelteComponentName(node);
			const props = readSiteProps(component, (values) => {
				readSvelteProps(node.startTag, values);
			});

			for (const attribute of node.startTag.attributes) {
				if (
					attribute.type !== 'SvelteAttribute' ||
					!CLASS_ATTRIBUTES.has(attribute.key.name) ||
					!hasIsolatedSvelteParts(attribute)
				) {
					continue;
				}

				deferParts(
					makeSite(
						component,
						attribute.key.name,
						moduleScope(),
						props
					),
					(parts) => {
						for (const part of attribute.value) {
							if (part.type === 'SvelteLiteral') {
								pushRawRangeTokens(
									sourceCode,
									part.range,
									parts.literals
								);
							} else {
								collectParts(part.expression, ctx, parts);
							}
						}
					}
				);
			}
		},
		'Program:exit'() {
			const positions: CollectedPosition[] = [];

			for (const item of pending) {
				item.run((parts) => {
					positions.push({ parts, site: item.site });
					trackForwarding(parts);
				});
			}

			// Every forward is known before any component site is checked.
			for (const position of positions) {
				handlers.onPosition?.(position.parts, position.site);
			}

			handlers.onExit?.({
				ast: sourceCode.ast,
				moduleScope: moduleScope(),
				forwarded
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

			if (attributes.length === 0) {
				return;
			}

			const component = getVueComponentName(node);
			const props = readSiteProps(component, (values) => {
				for (const attribute of node.startTag.attributes) {
					setVueValue(values, attribute);
				}
			});

			deferParts(
				makeSite(component, 'class', moduleScope(), props),
				(parts) => {
					for (const attribute of attributes) {
						collectVueAttribute(attribute, parts);
					}
				}
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