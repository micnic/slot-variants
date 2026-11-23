import type { Rule } from 'eslint';
import type { CallExpression } from 'estree';
import type { CallMatch } from './call-matching.ts';
import { createForwardingScan } from './forwarding.ts';
import type { StyledContext } from './styled-values.ts';
import { createTrackedCallResolver } from './tracked-calls.ts';

// What a rule does with each tracked call, given the context it was read in.
type TrackedCallHandler = (
	node: CallExpression,
	call: CallMatch,
	ctx: StyledContext
) => void;

// What a rule does with any other call.
type OtherCallHandler = (node: CallExpression, ctx: StyledContext) => void;

// Calls in a Vue `<template>` are only walked by a template visitor, so one
// is registered alongside the script's wherever the parser offers it.
export const createTrackedCallListeners = (
	context: Rule.RuleContext,
	onCall: TrackedCallHandler,
	onOtherCall?: OtherCallHandler
): Rule.RuleListener => {
	const ctx = createTrackedCallResolver(context, createForwardingScan);
	const visitors = {
		CallExpression(node: CallExpression) {
			const call = ctx.matchCall(node);

			if (call) {
				onCall(node, call, ctx);
				return;
			}

			onOtherCall?.(node, ctx);
		}
	};
	const { defineTemplateBodyVisitor } = context.sourceCode.parserServices;

	if (typeof defineTemplateBodyVisitor === 'function') {
		return defineTemplateBodyVisitor(visitors, visitors);
	}

	return visitors;
};