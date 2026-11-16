// Reruns the sv() suite with code generation from strings blocked, as under a
// strict CSP, so every variant function falls back to the interpreter
import './disallow-code-generation.ts';
import './sv/base-field.test.ts';
import './sv/base-only.test.ts';
import './sv/boolean-variants.test.ts';
import './sv/cache.test.ts';
import './sv/class-override.test.ts';
import './sv/compiled.test.ts';
import './sv/compound-slots.test.ts';
import './sv/compound-variants.test.ts';
import './sv/config-only.test.ts';
import './sv/create-sv.test.ts';
import './sv/default-variants.test.ts';
import './sv/explain.test.ts';
import './sv/extend.test.ts';
import './sv/function-defaults.test.ts';
import './sv/groups.test.ts';
import './sv/introspection.test.ts';
import './sv/multi-slots.test.ts';
import './sv/numeric-variant-keys.test.ts';
import './sv/post-process.test.ts';
import './sv/presets.test.ts';
import './sv/required-variants.test.ts';
import './sv/slots.test.ts';
import './sv/variants.test.ts';