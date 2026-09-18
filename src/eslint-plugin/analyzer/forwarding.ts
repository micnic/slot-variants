import type { Rule, Scope } from 'eslint';
import type {
	CallExpression,
	ImportDeclaration,
	MemberExpression,
	Node,
	ObjectPattern,
	VariableDeclarator
} from 'estree';
import {
	type Component,
	type ComponentFunction,
	isComponentFunction
} from './components.ts';
import { getKeyName } from './config-keys.ts';
import { findVariable } from './const-bindings.ts';
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
	createStyledContext,
	getOverrideValue,
	literalStyles,
	resolveInvocation,
	type StyledClasses,
	type StyledContext
} from './styled-values.ts';
import { createTrackedCallResolver } from './tracked-calls.ts';

/** What a component merges its `class` prop into. */
export type ForwardedStyles = {
	// The prop name a call site passes — the key the component reads, not the
	// key it forwards under.
	prop: string;
	// The styled parts the prop lands beside: the slots an override targets,
	// or the slot-variants parts (and `cn()` literals) written next to it in
	// one class list.
	targets: ReadonlyArray<StyledClasses>;
};

/** The component element a class attribute was written on. */
export type ComponentSite = {
	component: string;
	prop: string;
	// Where the component name is looked up from.
	scope: Scope.Scope;
};

export type PositionHandlers = {
	// Called once per class-list position after the whole file has been
	// walked: a variant call's override (per slot it targets), a `cn()` call,
	// a class attribute in whichever framework spells it. `site` names the
	// component element the attribute sits on, or is null for a host element
	// and for a call.
	onPosition: (parts: ClassParts, site: ComponentSite | null) => void;
	// Called after the last position.
	onExit: () => void;
};

/**
 * The shared half of `no-restyle`: every class-list position in a file, and
 * which components forward a `class` prop into one of them. The rule layers
 * reporting on top of it for the file being linted; the cross-file loader runs
 * it bare over an imported module.
 */
export type ForwardingScan = {
	moduleScope: () => Scope.Scope;
	// Components of this file, by the function that declares them — or by the
	// program itself for a single-file component.
	forwarded: ReadonlyMap<Component, ForwardedStyles>;
	listener: Rule.RuleListener;
};

// A `class` prop read: which component's, under which name.
type PropRead = { component: Component; prop: string };

// A position found during the walk, read once the walk is over — so an import
// or a props declaration written below its use (a Svelte template above its
// `<script>`) has been seen by then.
type PendingPosition = {
	ctx: StyledContext;
	site: ComponentSite | null;
	run: (emit: (parts: ClassParts) => void) => void;
};

// Calls whose result is a single-file component's props, read at the top level
// of its script: Svelte's `$props()` rune, and Vue's `defineProps()` (bare or
// under `withDefaults()`) and `useAttrs()`.
const PROPS_SOURCES = new Set(['$props', 'defineProps', 'withDefaults', 'useAttrs']);

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
const getClassPropBindings = (
	pattern: ObjectPattern
): Map<string, string> => {
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
	const { importsTracker, matchCallFrom } = createTrackedCallResolver(context);
	const ctx = createStyledContext(sourceCode, matchCallFrom, (node) =>
		sourceCode.getScope(node)
	);
	const forwarded = new Map<Component, ForwardedStyles>();
	// Where a component's `class` prop can be read from: the binding a props
	// pattern put it in, or an object holding the whole props — the props
	// parameter, a `defineProps()` result, or a view derived from either
	// (Solid's `splitProps`, `mergeProps`).
	const propBindings = new Map<Scope.Variable, PropRead>();
	const propsObjects = new Map<Scope.Variable, Component>();
	const pending: PendingPosition[] = [];

	// The innermost scope the program node owns — the module scope holding the
	// file's own bindings, rather than the global one `getScope()` hands back
	// for a Program.
	/* c8 ignore next 4 -- a Program node always owns a scope */
	const moduleScope = (): Scope.Scope =>
		sourceCode.scopeManager.acquire(sourceCode.ast, true) ??
		sourceCode.getScope(sourceCode.ast);

	// Vue template expressions resolve against the `<script>` module scope;
	// their own scope never reaches the bindings they name.
	let templateCtx: StyledContext | null = null;

	const getTemplateCtx = (): StyledContext => {
		if (templateCtx === null) {
			const scope = moduleScope();

			templateCtx = createStyledContext(
				sourceCode,
				matchCallFrom,
				() => scope
			);
		}

		return templateCtx;
	};

	const deferParts = (
		positionCtx: StyledContext,
		site: ComponentSite | null,
		collect: (parts: ClassParts) => void
	) => {
		pending.push({
			ctx: positionCtx,
			site,
			run(emit) {
				const parts = emptyParts();

				collect(parts);
				emit(parts);
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
	// taken whole.
	const registerFunctionProps = (fn: ComponentFunction) => {
		const [param] = fn.params;

		if (param === undefined) {
			return;
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

			const variable = findVariable(sourceCode.getScope(arg), arg.name);

			if (variable === null) {
				continue;
			}

			const component = propsObjects.get(variable);

			if (component !== undefined) {
				return component;
			}
		}

		return null;
	};

	const visitDeclarator = (node: VariableDeclarator) => {
		const { id, init } = node;

		if (!init || init.type !== 'CallExpression') {
			return;
		}

		const component = getPropsComponent(init);

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
	const readMemberProp = (
		node: MemberExpression,
		positionCtx: StyledContext
	): PropRead | null => {
		if (
			node.computed ||
			node.property.type !== 'Identifier' ||
			!CLASS_ATTRIBUTES.has(node.property.name) ||
			node.object.type !== 'Identifier'
		) {
			return null;
		}

		const variable = findVariable(
			positionCtx.scopeOf(node.object),
			node.object.name
		);

		if (variable === null) {
			return null;
		}

		const component = propsObjects.get(variable);

		if (component === undefined) {
			return null;
		}

		return { component, prop: node.property.name };
	};

	// The `class` prop a dynamic value reads, if it is one.
	const readProp = (
		node: ClassParts['dynamic'][number],
		positionCtx: StyledContext
	): PropRead | null => {
		if (node.type === 'MemberExpression') {
			return readMemberProp(node, positionCtx);
		}

		const variable = findVariable(positionCtx.scopeOf(node), node.name);

		if (variable === null) {
			return null;
		}

		return propBindings.get(variable) ?? null;
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
	const trackForwarding = (parts: ClassParts, positionCtx: StyledContext) => {
		if (parts.dynamic.length === 0) {
			return;
		}

		const targets = getForwardTargets(parts);

		if (targets.length === 0) {
			return;
		}

		for (const node of parts.dynamic) {
			const read = readProp(node, positionCtx);

			if (read !== null && !forwarded.has(read.component)) {
				forwarded.set(read.component, { prop: read.prop, targets });
			}
		}
	};

	// A `cn()` (or config-less `sv()`) call is a class list in its own right,
	// wherever it is written; a variant-function call is checked through the
	// override it is passed.
	const visitCall = (node: CallExpression, positionCtx: StyledContext) => {
		pending.push({
			ctx: positionCtx,
			site: null,
			run(emit) {
				if (isClassListCall(node, positionCtx)) {
					const parts = emptyParts();

					collectCallParts(node, positionCtx, parts);
					emit(parts);

					return;
				}

				const invocation = resolveInvocation(node, positionCtx);

				if (invocation === null) {
					return;
				}

				const value = getOverrideValue(node.arguments[0], positionCtx);

				if (value !== null) {
					forEachOverrideParts(value, invocation, positionCtx, emit);
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
			ctx,
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
			collectParts(value.expression, getTemplateCtx(), parts);
		}
	};

	const scriptVisitors = {
		ImportDeclaration(node: ImportDeclaration) {
			importsTracker(node);
		},
		':function'(node: MarkupNode) {
			if (isComponentFunction(node)) {
				registerFunctionProps(node);
			}
		},
		VariableDeclarator(node: VariableDeclarator) {
			visitDeclarator(node);
		},
		CallExpression(node: CallExpression) {
			visitCall(node, ctx);
		},
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
					ctx,
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
			const positions: Array<{
				parts: ClassParts;
				ctx: StyledContext;
				site: ComponentSite | null;
			}> = [];

			for (const item of pending) {
				item.run((parts) => {
					positions.push({ parts, ctx: item.ctx, site: item.site });
				});
			}

			// Every forward is known before any component site is checked.
			for (const position of positions) {
				trackForwarding(position.parts, position.ctx);
			}

			for (const position of positions) {
				handlers.onPosition(position.parts, position.site);
			}

			handlers.onExit();
		}
	};

	// Template expressions are only ever walked by the template visitor, so a
	// call written inside a `:class` binding is picked up here.
	const templateVisitors = {
		CallExpression(node: CallExpression) {
			visitCall(node, getTemplateCtx());
		},
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
				getTemplateCtx(),
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

	return { moduleScope, forwarded, listener };
};