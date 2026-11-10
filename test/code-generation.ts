type Restore = () => void;

/**
 * Blocks runtime code generation from strings, as a strict CSP does, so every
 * sv() variant function created meanwhile falls back to the interpreter. The
 * returned function restores the native `Function`.
 */
export const blockCodeGeneration = (): Restore => {
	const NativeFunction = globalThis.Function;

	globalThis.Function = new Proxy(NativeFunction, {
		construct: () => {
			throw new EvalError('Code generation from strings disallowed');
		}
	});

	return () => {
		globalThis.Function = NativeFunction;
	};
};