import type { ExportNamedDeclaration, Node, Pattern, Program } from 'estree';
import { getOrCreate } from '../map-utils.ts';
import { type ComponentFunction, findWrappedComponent } from './components.ts';
import {
	DEFAULT_EXPORT,
	getExportName,
	getModuleSpecifier
} from './module-syntax.ts';

/**
 * Where an export name leads: a binding in the same module, a function node
 * exported without a name of its own, or another module to look in.
 */
export type ExportTarget =
	| { kind: 'local'; name: string }
	| { kind: 'node'; node: ComponentFunction }
	| { kind: 'forward'; specifier: string; name: string };

/** A module's export names with their targets, and its `export *` sources. */
type ExportTable = {
	named: ReadonlyMap<string, ReadonlyArray<ExportTarget>>;
	starSources: ReadonlyArray<string>;
};

type AddTarget = (name: string, target: ExportTarget) => void;

// TypeScript declarations that name only a type, which leave a value of the
// same name to an `export *`.
const TYPE_ONLY_DECLARATIONS: ReadonlySet<string> = new Set([
	'TSInterfaceDeclaration',
	'TSTypeAliasDeclaration'
]);

// Every name a binding pattern declares (`{ a, b: [c] }` declares a and c).
const forEachPatternName = (
	pattern: Pattern,
	visit: (name: string) => void
): void => {
	if (pattern.type === 'Identifier') {
		visit(pattern.name);

		return;
	}

	if (pattern.type === 'ObjectPattern') {
		for (const prop of pattern.properties) {
			if (prop.type === 'RestElement') {
				forEachPatternName(prop.argument, visit);
				continue;
			}

			forEachPatternName(prop.value, visit);
		}

		return;
	}

	if (pattern.type === 'ArrayPattern') {
		for (const element of pattern.elements) {
			if (element) {
				forEachPatternName(element, visit);
			}
		}

		return;
	}

	if (pattern.type === 'RestElement') {
		forEachPatternName(pattern.argument, visit);

		return;
	}

	if (pattern.type === 'AssignmentPattern') {
		forEachPatternName(pattern.left, visit);
	}
};

const collectFromDeclaration = (
	declaration: Node | null | undefined,
	add: AddTarget
) => {
	if (!declaration) {
		return;
	}

	if (declaration.type === 'FunctionDeclaration') {
		if (declaration.id) {
			add(declaration.id.name, {
				kind: 'local',
				name: declaration.id.name
			});
		}

		return;
	}

	// No component, but a name of the module's own, which shadows any
	// `export *` of it.
	if (declaration.type === 'ClassDeclaration') {
		add(declaration.id.name, { kind: 'local', name: declaration.id.name });

		return;
	}

	const addLocal = (name: string) => {
		add(name, { kind: 'local', name });
	};

	if (declaration.type === 'VariableDeclaration') {
		for (const declarator of declaration.declarations) {
			forEachPatternName(declarator.id, addLocal);
		}

		return;
	}

	// A TypeScript `enum`, `namespace` or `declare function`: no component,
	// but a value name of the module's own.
	const type: string = declaration.type;

	if (
		!TYPE_ONLY_DECLARATIONS.has(type) &&
		'id' in declaration &&
		declaration.id?.type === 'Identifier'
	) {
		addLocal(declaration.id.name);
	}
};

const collectFromSpecifiers = (
	node: ExportNamedDeclaration,
	add: AddTarget
) => {
	let source: string | null = null;

	if (node.source) {
		source = getModuleSpecifier(node.source);
	}

	for (const specifier of node.specifiers) {
		const exported = getExportName(specifier.exported);
		const local = getExportName(specifier.local);

		if (source === null) {
			add(exported, { kind: 'local', name: local });
		} else {
			add(exported, { kind: 'forward', specifier: source, name: local });
		}
	}
};

const collectDefaultExport = (
	node: Program['body'][number],
	add: AddTarget
) => {
	if (node.type !== 'ExportDefaultDeclaration') {
		return;
	}

	const { declaration } = node;

	// A named function or a re-exported binding is reached through the module
	// scope, as is a named component handed to a wrapper (`memo(Impl)`); an
	// anonymous function — bare, or inside a wrapper call like `forwardRef()`
	// — has no name to look up, so the node itself is the target. Anything
	// else a default export can be carries no component.
	if (declaration.type === 'FunctionDeclaration' && declaration.id) {
		add(DEFAULT_EXPORT, { kind: 'local', name: declaration.id.name });

		return;
	}

	const wrapped = findWrappedComponent(declaration);

	if (wrapped === null) {
		return;
	}

	if (wrapped.type === 'Identifier') {
		add(DEFAULT_EXPORT, { kind: 'local', name: wrapped.name });

		return;
	}

	add(DEFAULT_EXPORT, { kind: 'node', node: wrapped });
};

/**
 * Every name a module exports, each with the places it may resolve to in
 * source order, and the sources of its `export * from` entries. Those come
 * after a module's own targets for a name, since a name declared in the module
 * itself always wins over one it re-exports.
 */
export const collectExportTable = (ast: Program): ExportTable => {
	const named = new Map<string, ExportTarget[]>();
	const starSources: string[] = [];
	const add: AddTarget = (name, target) => {
		getOrCreate(named, name, () => []).push(target);
	};

	for (const node of ast.body) {
		if (node.type === 'ExportAllDeclaration') {
			// `export * as ns from` exports a namespace object, not the names
			// inside it, so it never answers a plain name.
			if (node.exported === null) {
				starSources.push(getModuleSpecifier(node.source));
			}

			continue;
		}

		collectDefaultExport(node, add);

		if (node.type === 'ExportNamedDeclaration') {
			collectFromDeclaration(node.declaration, add);
			collectFromSpecifiers(node, add);
		}
	}

	return { named, starSources };
};