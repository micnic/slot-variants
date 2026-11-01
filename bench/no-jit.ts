// Runs a factory while runtime code generation is blocked, so any sv() variant
// function it creates falls back to the interpreter, as under a strict CSP.
export function withoutJit<T>(create: () => T): T {
	const NativeFunction = globalThis.Function;

	globalThis.Function = new Proxy(NativeFunction, {
		construct: () => {
			throw new EvalError('Code generation from strings disallowed');
		}
	});

	try {
		return create();
	} finally {
		globalThis.Function = NativeFunction;
	}
}