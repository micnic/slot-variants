// Reruns the sv() suite with code generation from strings blocked, as under a
// strict CSP, so every variant function falls back to the interpreter
import './disallow-code-generation.ts';
import './sv.test.ts';