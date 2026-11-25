import { RuleTester } from 'eslint';
import * as svelteParser from 'svelte-eslint-parser';
import { parser as tsParser } from 'typescript-eslint';
import * as vueParser from 'vue-eslint-parser';
import { rules } from '../../src/eslint-plugin.ts';

export const tester = new RuleTester();

// `no-restyle` reads JSX and the two template dialects, so it needs testers of
// its own alongside the plain-script one above.
export const jsxTester = new RuleTester({
	languageOptions: {
		parserOptions: { ecmaFeatures: { jsx: true } }
	}
});

export const svelteTester = new RuleTester({
	languageOptions: {
		parser: svelteParser
	}
});

export const vueTester = new RuleTester({
	languageOptions: {
		parser: vueParser
	}
});

export const tsTester = new RuleTester({
	languageOptions: { parser: tsParser }
});

export const rule = rules['no-conflicting-classes'];

export const IMPORT = "import { sv } from 'slot-variants';\n";

export const IMPORT_CN = "import { cn } from 'slot-variants';\n";

export const IMPORT_CREATE_SV = "import { createSV } from 'slot-variants';\n";

export const IMPORT_NS = "import * as SV from 'slot-variants';\n";

// RuleTester fires one report per offending token, so the multi-token
// fixtures below expect the same messageId/data several times over. `repeat`
// clones a descriptor `count` times, and the per-rule builders below keep the
// expectations on a single line while still asserting the reported data.
const err = (messageId: string, data: Record<string, string>) => ({
	messageId,
	data
});

export const repeat = <T>(value: T, count: number): T[] =>
	Array.from({ length: count }, () => value);

export const shared = (token: string, variant: string, slot = 'base') =>
	err('shared', { token, variant, slot });

// A `shared` finding on a variant that's only covered by a default: passing
// `null` skips the default, so the lift is offered as a suggestion, not a fix.
export const sharedLift = (
	token: string,
	variant: string,
	output: string,
	slot = 'base'
) => ({
	...shared(token, variant, slot),
	suggestions: [{ messageId: 'liftShared', data: { variant, slot }, output }]
});

export const singleKeyCompound = (kind: string, key: string, value: string) =>
	err('singleKeyCompound', { kind, key, value });

export const dup = (token: string, slot = 'base') =>
	err('duplicate', { token, slot });

export const dupCn = (token: string) => err('duplicateCn', { token });

export const conflict = (tokens: string, slot = 'base') =>
	err('conflict', { tokens, slot });

export const overlap = (key: string, slot: string, other: string) =>
	err('overlappingSlotTarget', { key, slot, other });

export const duplicateGroupSlot = (group: string, slot: string) =>
	err('duplicateGroupSlot', { group, slot });

export const IMPORT_SV_CN = "import { cn, sv } from 'slot-variants';\n";

// `no-restyle` names both sides of a collision, so its `conflict` data differs
// from the one `no-conflicting-classes` reports above.
export const restyle = (token: string, internal: string, slot = 'base') =>
	err('conflict', { token, internal, slot });

export const conflictCn = (tokens: string) => err('conflictCn', { tokens });