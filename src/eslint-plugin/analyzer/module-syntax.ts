import type { Identifier, Literal } from 'estree';

// The export name a default export and a default import go by.
export const DEFAULT_EXPORT = 'default';

// An export name is an identifier, or a string literal for the `export { x as
// "a-b" }` form.
export const getExportName = (node: Identifier | Literal): string => {
	if (node.type === 'Identifier') {
		return node.name;
	}

	return String(node.value);
};

// A module source is always a string literal; ESTree only types it as a
// general `Literal`.
export const getModuleSpecifier = (source: Literal): string =>
	String(source.value);