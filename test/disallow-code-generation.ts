const NativeFunction = globalThis.Function;

globalThis.Function = new Proxy(NativeFunction, {
	construct: () => {
		throw new EvalError('Code generation from strings disallowed');
	}
});