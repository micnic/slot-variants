import type { ExportNamedDeclaration, Node, Program } from 'estree';
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
export type ExportTable = {
	named: ReadonlyMap<string, ReadonlyArray<ExportTarget>>;
	starSources: ReadonlyArray<string>;
};

type AddTarget = (name: string, target: ExportTarget) => void;

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

	if (declaration.type !== 'VariableDeclaration') {
		return;
	}

	for (const declarator of declaration.declarations) {
		if (declarator.id.type === 'Identifier') {
			const { name } = declarator.id;

			add(name, { kind: 'local', name });
		}
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