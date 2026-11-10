import { blockCodeGeneration } from './code-generation.ts';

// Imported for its side effect, ahead of the suite it blocks code generation
// for: ESM imports run in order, before the importing module's own body.
blockCodeGeneration();