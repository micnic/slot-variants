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
import {
	CLASS_ATTRIBUTES,
	getJsxAttributeName,
	getJsxComponentName,
	getSvelteComponentName,
	getVueClassAttributeName,
	getVueComponentName,
	type JsxAttribute,
	type MarkupNode,
	pushRawRangeTokens,
	type VAttribute
} from './markup.ts';
import {
	type ClassParts,
	collectCallParts,
	collectParts,
	emptyParts,
	forEachOverrideParts,
	isClassListCall
} from './restyle.ts';
import {
	getOverrideValue,
	literalStyles,
	resolveInvocation,
	type StyledClasses
} from './styled-values.ts';
import { createTrackedCallResolver } from './tracked-calls.ts';

/** What a component merges its `class` prop into. */
export type ForwardedStyles = {
	prop: string;
	targets: ReadonlyArray<StyledClasses>;
};

/** The component element a class attribute was written on. */
export type ComponentSite = {
	component: string;
	prop: string;
	scope: Scope.Scope;
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

// A `class` prop read: which component's, under which name.
type PropRead = { component: Component; prop: string };

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

// The local names a props pattern destructures `class` / `className` into,
// mapped to the prop name a call site would pass. A default value
// (`{ className = '' }`) binds the same name.
const getClassPropBindings = (pattern: ObjectPattern): Map<string, string> => {
	const bindings = new Map<string, string>();

	for (const property of pattern.properties) {
		if (property.type !== 'Property') {
			continue;
		}

		const key = getKeyName(property);

		if (key === null || !CLASS_ATTRIBUTES.has(key)) {
			continue;
		}

		let target = property.value;

		if (target.type === 'AssignmentPattern') {
			target = target.left;
		}

		if (target.type === 'Identifier') {
			bindings.set(target.name, key);
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
	scope: Scope.Scope
): ComponentSite | null => {
	if (component === null) {
		return null;
	}

	return { component, prop, scope };
};

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
	// (Solid's `splitProps`, `mergeProps`).
	const propBindings = new Map<Scope.Variable, PropRead>();
	const propsObjects = new Map<Scope.Variable, Component>();
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

	const registerBindings = (
		declared: ReadonlyArray<Scope.Variable>,
		pattern: ObjectPattern,
		component: Component
	) => {
		const bindings = getClassPropBindings(pattern);

		for (const variable of declared) {
			const prop = bindings.get(variable.name);

			if (prop !== undefined) {
				propBindings.set(variable, { component, prop });
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

		if (param.type === 'ObjectPattern') {
			registerBindings(declared, param, fn);

			return;
		}

		if (param.type !== 'Identifier') {
			return;
		}

		for (const variable of declared) {
			if (variable.name === param.name) {
				propsObjects.set(variable, fn);
			}
		}
	};

	// The component whose props object a name refers to.
	const getPropsObjectComponent = (node: Identifier): Component | null =>
		lookupBinding(propsObjects, ctx.variableOf(node));

	// The component whose props a call yields: the module, for a props source
	// like `$props()`; the owner of a props object the call is handed, for a
	// derived view like `splitProps(props, …)`.
	const getPropsComponent = (init: CallExpression): Component | null => {
		if (
			init.callee.type === 'Identifier' &&
			PROPS_SOURCES.has(init.callee.name)
		) {
			return sourceCode.ast;
		}

		for (const arg of init.arguments) {
			if (arg.type !== 'Identifier') {
				continue;
			}

			const component = getPropsObjectComponent(arg);

			if (component !== null) {
				return component;
			}
		}

		return null;
	};

	// The component whose props a declarator's initializer holds: a props
	// call's result, or the props object itself, destructured or renamed in
	// the component body (`const { className } = props`).
	const getInitComponent = (init: Node): Component | null => {
		if (init.type === 'CallExpression') {
			return getPropsComponent(init);
		}

		if (init.type === 'Identifier') {
			return getPropsObjectComponent(init);
		}

		return null;
	};

	const visitDeclarator = (node: VariableDeclarator) => {
		const { id, init } = node;

		if (!init) {
			return;
		}

		const component = getInitComponent(init);

		if (component === null) {
			return;
		}

		const declared = sourceCode.getDeclaredVariables(node);

		if (id.type === 'ObjectPattern') {
			registerBindings(declared, id, component);

			return;
		}

		for (const variable of declared) {
			propsObjects.set(variable, component);
		}
	};

	// `props.className` — `class` / `className` read off a props object.
	const readMemberProp = (node: MemberExpression): PropRead | null => {
		if (
			node.computed ||
			node.property.type !== 'Identifier' ||
			!CLASS_ATTRIBUTES.has(node.property.name) ||
			node.object.type !== 'Identifier'
		) {
			return null;
		}

		const component = getPropsObjectComponent(node.object);

		if (component === null) {
			return null;
		}

		return { component, prop: node.property.name };
	};

	// The `class` prop a dynamic value reads, if it is one.
	const readProp = (node: ClassParts['dynamic'][number]): PropRead | null => {
		if (node.type === 'MemberExpression') {
			return readMemberProp(node);
		}

		return lookupBinding(propBindings, ctx.variableOf(node));
	};

	// What a forwarded prop is merged with at this position. Inside a `cn()`
	// list the literals count too — `cn('p-2', className)` applies `p-2` just
	// as a config would.
	const getForwardTargets = (parts: ClassParts): StyledClasses[] => {
		if (parts.merged && parts.literals.length > 0) {
			return [...parts.styled, literalStyles(parts.literals)];
		}

		return parts.styled;
	};

	// The first position a component forwards its prop into is the one kept.
	const trackForwarding = (parts: ClassParts) => {
		if (parts.dynamic.length === 0) {
			return;
		}

		const targets = getForwardTargets(parts);

		if (targets.length === 0) {
			return;
		}

		for (const node of parts.dynamic) {
			const read = readProp(node);

			if (read !== null && !forwarded.has(read.component)) {
				forwarded.set(read.component, { prop: read.prop, targets });
			}
		}
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

	const visitJsxAttribute = (
		attribute: JsxAttribute,
		component: string | null
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
			makeSite(component, prop, sourceCode.getScope(value)),
			(parts) => {
				collectParts(value, ctx, parts);
			}
		);
	};

	const isVueClassAttribute = (attribute: VAttribute): boolean => {
		const name = getVueClassAttributeName(attribute);

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

			for (const attribute of node.attributes) {
				if (attribute.type === 'JSXAttribute') {
					visitJsxAttribute(attribute, component);
				}
			}
		},
		SvelteElement(node: MarkupNode) {
			/* c8 ignore next 3 -- the selector only matches this type */
			if (node.type !== 'SvelteElement') {
				return;
			}

			const component = getSvelteComponentName(node);

			for (const attribute of node.startTag.attributes) {
				if (
					attribute.type !== 'SvelteAttribute' ||
					!CLASS_ATTRIBUTES.has(attribute.key.name)
				) {
					continue;
				}

				deferParts(
					makeSite(component, attribute.key.name, moduleScope()),
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
				});
			}

			// Every forward is known before any component site is checked.
			for (const position of positions) {
				trackForwarding(position.parts);
			}

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

			deferParts(
				makeSite(getVueComponentName(node), 'class', moduleScope()),
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