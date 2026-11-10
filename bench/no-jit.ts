import { blockCodeGeneration } from '../test/code-generation.ts';

// Runs a factory while runtime code generation is blocked, so any sv() variant
// function it creates falls back to the interpreter, as under a strict CSP.
export function withoutJit<T>(create: () => T): T {
	const restore = blockCodeGeneration();

	try {
		return create();
	} finally {
		restore();
	}
}