import type { ExportNamedDeclaration, Node, Program } from 'estree';
import {
	type ComponentFunction,
	isComponentFunction,
	unwrapComponentFunction
} from './components.ts';

/**
 * Where an export name leads: a binding in the same module, a function node
 * exported without a name of its own, or another module to look in.
 */
export type ExportTarget =
	| { kind: 'local'; name: string }
	| { kind: 'node'; node: ComponentFunction }
	| { kind: 'forward'; specifier: string; name: string };

export const DEFAULT_EXPORT = 'default';

// An export name is an identifier, or a string literal for the `export { x as
// "a-b" }` form.
const getExportName = (node: Node): string | null => {
	if (node.type === 'Identifier') {
		return node.name;
	}

	/* c8 ignore next 3 -- an export name is parsed as an identifier or string */
	if (node.type !== 'Literal') {
		return null;
	}

	return String(node.value);
};

const getSourceValue = (node: Program['body'][number]): string | null => {
	if (!('source' in node) || !node.source) {
		return null;
	}

	/* c8 ignore next 3 -- a module source is always a string literal */
	if (typeof node.source.value !== 'string') {
		return null;
	}

	return node.source.value;
};

const collectFromDeclaration = (
	declaration: Node | null | undefined,
	name: string,
	targets: ExportTarget[]
) => {
	if (!declaration) {
		return;
	}

	if (declaration.type === 'FunctionDeclaration') {
		if (declaration.id?.name === name) {
			targets.push({ kind: 'local', name });
		}

		return;
	}

	if (declaration.type !== 'VariableDeclaration') {
		return;
	}

	for (const declarator of declaration.declarations) {
		if (declarator.id.type === 'Identifier' && declarator.id.name === name) {
			targets.push({ kind: 'local', name });
		}
	}
};

const collectFromSpecifiers = (
	node: ExportNamedDeclaration,
	name: string,
	targets: ExportTarget[]
) => {
	const source = getSourceValue(node);

	for (const specifier of node.specifiers) {
		if (getExportName(specifier.exported) !== name) {
			continue;
		}

		const local = getExportName(specifier.local);

		/* c8 ignore next 3 -- a local export name is always readable */
		if (local === null) {
			continue;
		}

		if (source === null) {
			targets.push({ kind: 'local', name: local });
		} else {
			targets.push({ kind: 'forward', specifier: source, name: local });
		}
	}
};

const collectDefaultExport = (
	node: Program['body'][number],
	targets: ExportTarget[]
) => {
	if (node.type !== 'ExportDefaultDeclaration') {
		return;
	}

	const { declaration } = node;

	// A named function or a re-exported binding is reached through the module
	// scope; an anonymous function — bare, or inside a wrapper call like
	// `forwardRef()` — has no name to look up, so the node itself is the
	// target. Anything else a default export can be carries no component.
	if (declaration.type === 'FunctionDeclaration' && declaration.id) {
		targets.push({ kind: 'local', name: declaration.id.name });

		return;
	}

	if (declaration.type === 'Identifier') {
		targets.push({ kind: 'local', name: declaration.name });

		return;
	}

	if (isComponentFunction(declaration)) {
		targets.push({ kind: 'node', node: declaration });

		return;
	}

	if (declaration.type !== 'CallExpression') {
		return;
	}

	const wrapped = unwrapComponentFunction(declaration);

	if (wrapped !== null) {
		targets.push({ kind: 'node', node: wrapped });
	}
};

/**
 * Every place an export name may resolve to, most direct first. A barrel's
 * `export * from` entries come last, since a name declared in the module
 * itself always wins over one it re-exports.
 */
export const findExportTargets = (
	ast: Program,
	name: string
): ExportTarget[] => {
	const targets: ExportTarget[] = [];
	const starSources: string[] = [];

	for (const node of ast.body) {
		if (node.type === 'ExportAllDeclaration') {
			// `export * as ns from` exports a namespace object, not the names
			// inside it, so it never answers a plain name.
			if (node.exported === null) {
				const source = getSourceValue(node);

				if (source !== null) {
					starSources.push(source);
				}
			}

			continue;
		}

		if (name === DEFAULT_EXPORT) {
			collectDefaultExport(node, targets);
		}

		if (node.type === 'ExportNamedDeclaration') {
			collectFromDeclaration(node.declaration, name, targets);
			collectFromSpecifiers(node, name, targets);
		}
	}

	for (const specifier of starSources) {
		targets.push({ kind: 'forward', specifier, name });
	}

	return targets;
};