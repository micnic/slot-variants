import type { Rule, Scope } from 'eslint';
import type { CallExpression, ImportDeclaration, Node } from 'estree';
import {
	type ComponentFunction,
	type ForwardedStyles,
	getForwardedPropName,
	isComponentFunction
} from './components.ts';
import { resolveStaticValue } from './const-bindings.ts';
import {
	getOverrideValue,
	type Invocation,
	resolveInvocation,
	type StyledContext
} from './styled-values.ts';
import { createTrackedCallResolver } from './tracked-calls.ts';

/**
 * The shared half of `no-restyle`: which components forward a `class` prop
 * into an `sv()` call, and what that call applies. The rule layers reporting
 * on top of it for the file being linted; the cross-file loader runs it bare
 * over an imported module.
 */
export type ForwardingScan = {
	ctx: StyledContext;
	matchCall: StyledContext['matchCall'];
	importsTracker: (node: ImportDeclaration) => void;
	// Components of this file, by the function that declares them.
	forwarded: Map<ComponentFunction, ForwardedStyles>;
	// The function bodies currently being walked, outermost first.
	functionStack: ComponentFunction[];
	moduleScope: () => Scope.Scope;
	currentScope: () => Scope.Scope;
	// Takes the structural minimum so a framework node union narrows through it.
	enterFunction: (node: { type: string }) => void;
	exitFunction: () => void;
	// Records a call's forwarding and hands it back, or null when the call
	// isn't a variant-function call with a readable override.
	visitCall: (node: CallExpression) => {
		invocation: Invocation;
		value: Node;
	} | null;
};

export const createForwardingScan = (
	context: Rule.RuleContext
): ForwardingScan => {
	const { sourceCode } = context;
	const { importsTracker, matchCall } = createTrackedCallResolver(context);
	const ctx: StyledContext = {
		sourceCode,
		matchCall,
		resolve: (node) => resolveStaticValue(node, sourceCode)
	};
	const functionStack: ComponentFunction[] = [];
	const forwarded = new Map<ComponentFunction, ForwardedStyles>();

	// The innermost scope the program node owns — the module scope holding the
	// file's own bindings, rather than the global one `getScope()` hands back
	// for a Program.
	/* c8 ignore next 4 -- a Program node always owns a scope */
	const moduleScope = (): Scope.Scope =>
		sourceCode.scopeManager.acquire(sourceCode.ast, true) ??
		sourceCode.getScope(sourceCode.ast);

	const currentScope = (): Scope.Scope => {
		const fn = functionStack[functionStack.length - 1];

		if (fn === undefined) {
			return moduleScope();
		}

		return sourceCode.getScope(fn);
	};

	// The innermost enclosing function whose `class` prop this call forwards —
	// a wrapper like Solid's `createMemo` sits between the component and the
	// call, so the whole stack is tried.
	const trackForwarding = (value: Node, invocation: Invocation) => {
		for (const fn of [...functionStack].reverse()) {
			const prop = getForwardedPropName(value, fn, sourceCode);

			if (prop === null) {
				continue;
			}

			if (!forwarded.has(fn)) {
				forwarded.set(fn, { prop, invocation });
			}

			return;
		}
	};

	return {
		ctx,
		matchCall,
		importsTracker,
		forwarded,
		functionStack,
		moduleScope,
		currentScope,
		enterFunction(node) {
			if (isComponentFunction(node)) {
				functionStack.push(node);
			}
		},
		exitFunction() {
			functionStack.pop();
		},
		visitCall(node) {
			const invocation = resolveInvocation(node, ctx);

			if (invocation === null) {
				return null;
			}

			const value = getOverrideValue(node.arguments[0], ctx);

			if (value === null) {
				return null;
			}

			trackForwarding(value, invocation);

			return { invocation, value };
		}
	};
};