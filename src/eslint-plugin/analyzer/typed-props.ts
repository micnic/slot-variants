import type { CallExpression, Program } from 'estree';
import { getOrCreate } from '../map-utils.ts';

// TypeScript's type nodes, as far as they're read here: ESTree's own node
// types don't list them, so each is told apart by its `type` first.
type TypeNode = { type: string };

type TypeMembers = ReadonlyArray<TypeNode>;

// An `Identifier` key, or a string or number `Literal` one.
type SignatureKey = TypeNode & { name?: string; value?: string | number };

type PropertySignature = TypeNode & {
	computed: boolean;
	key: SignatureKey;
	typeAnnotation?: { typeAnnotation: TypeNode };
};

type TypeLiteral = TypeNode & { members: TypeMembers };

// A union or an intersection of types.
type CompositeType = TypeNode & { types: ReadonlyArray<TypeNode> };

// A type named by an `Identifier`; a qualified name (`A.B`) has no `name`.
type TypeReference = TypeNode & { typeName: { name?: string } };

type TypeArguments = { params: ReadonlyArray<TypeNode> };

type DeclarationId = { id: { name: string } };

// An interface an interface extends, named by an `Identifier` expression.
type InterfaceHeritage = { expression: TypeNode & { name?: string } };

type InterfaceDeclaration = TypeNode &
	DeclarationId & {
		body: { body: TypeMembers };
		extends: ReadonlyArray<InterfaceHeritage>;
	};

type TypeAliasDeclaration = TypeNode &
	DeclarationId & {
		typeAnnotation: TypeNode;
	};

type ExportDeclaration = TypeNode & { declaration: TypeNode | null };

// Whether each prop an object type declares has a type including `boolean`.
type BooleanProps = Map<string, boolean>;

// The props each `defineProps<…>()` call declares, read once per call: a
// single-file component's props are asked for from several places.
const typedPropsByCall = new WeakMap<
	CallExpression,
	ReadonlyMap<string, boolean>
>();

const isTypeLiteral = (node: TypeNode): node is TypeLiteral =>
	node.type === 'TSTypeLiteral' && 'members' in node;

const isUnionType = (node: TypeNode): node is CompositeType =>
	node.type === 'TSUnionType' && 'types' in node;

const isIntersectionType = (node: TypeNode): node is CompositeType =>
	node.type === 'TSIntersectionType' && 'types' in node;

const isTypeReference = (node: TypeNode): node is TypeReference =>
	node.type === 'TSTypeReference' && 'typeName' in node;

const isPropertySignature = (node: TypeNode): node is PropertySignature =>
	node.type === 'TSPropertySignature' && 'key' in node;

const isInterfaceDeclaration = (node: TypeNode): node is InterfaceDeclaration =>
	node.type === 'TSInterfaceDeclaration' && 'body' in node;

const isTypeAliasDeclaration = (node: TypeNode): node is TypeAliasDeclaration =>
	node.type === 'TSTypeAliasDeclaration' && 'typeAnnotation' in node;

const isExportDeclaration = (node: TypeNode): node is ExportDeclaration =>
	node.type === 'ExportNamedDeclaration' && 'declaration' in node;

const isTypeArguments = (value: unknown): value is TypeArguments =>
	typeof value === 'object' &&
	value !== null &&
	'params' in value &&
	Array.isArray(value.params);

// Whether a prop's type includes `boolean`, alone or in a union, as Vue then
// casts the prop to `false` when an element leaves it out.
const includesBoolean = (node: TypeNode): boolean => {
	if (isUnionType(node)) {
		return node.types.some(includesBoolean);
	}

	return node.type === 'TSBooleanKeyword';
};

// The name a property signature declares, null for a computed or numeric key.
const getSignatureName = ({ computed, key }: PropertySignature) => {
	if (computed) {
		return null;
	}

	if (key.name !== undefined) {
		return key.name;
	}

	if (typeof key.value === 'string') {
		return key.value;
	}

	return null;
};

// The type declarations a script holds at its top level, exported or not.
const getTopLevelTypes = (program: Program): TypeNode[] => {
	const statements: ReadonlyArray<TypeNode> = program.body;

	return statements.map((statement) => {
		if (isExportDeclaration(statement) && statement.declaration !== null) {
			return statement.declaration;
		}

		return statement;
	});
};

// Whether a property signature's type includes `boolean`, by the name it
// declares: none for any other member, or a computed or numeric key.
const readMembers = (members: TypeMembers): BooleanProps => {
	const props: BooleanProps = new Map();

	for (const member of members) {
		if (!isPropertySignature(member)) {
			continue;
		}

		const name = getSignatureName(member);

		if (name !== null) {
			props.set(
				name,
				member.typeAnnotation !== undefined &&
					includesBoolean(member.typeAnnotation.typeAnnotation)
			);
		}
	}

	return props;
};

// Adds `added` to `props`: a prop either names keeps `boolean` when either
// type includes it, as an intersection's does.
const joinProps = (props: BooleanProps, added: BooleanProps) => {
	for (const [name, isBoolean] of added) {
		props.set(name, isBoolean || props.get(name) === true);
	}
};

// Adds `added` to `props`, each prop `props` declares already keeping its own
// type, as an interface's own member does over one it extends.
const inheritProps = (props: BooleanProps, added: BooleanProps) => {
	for (const [name, isBoolean] of added) {
		if (!props.has(name)) {
			props.set(name, isBoolean);
		}
	}
};

// The props of the same-file interfaces and type alias named `name`: every
// declaration of an interface merges into one, its own members over those of
// the interfaces it extends. `seen` holds the names on the way, so a type
// naming itself reads as none.
const readNamedProps = (
	name: string,
	program: Program,
	seen: Set<string>
): BooleanProps => {
	const props: BooleanProps = new Map();

	if (seen.has(name)) {
		return props;
	}

	seen.add(name);

	const inherited: BooleanProps = new Map();

	for (const declaration of getTopLevelTypes(program)) {
		if (
			isInterfaceDeclaration(declaration) &&
			declaration.id.name === name
		) {
			joinProps(props, readMembers(declaration.body.body));

			for (const { expression } of declaration.extends) {
				if (expression.name !== undefined) {
					joinProps(
						inherited,
						readNamedProps(expression.name, program, seen)
					);
				}
			}
		} else if (
			isTypeAliasDeclaration(declaration) &&
			declaration.id.name === name
		) {
			joinProps(
				props,
				readTypeProps(declaration.typeAnnotation, program, seen)
			);
		}
	}

	seen.delete(name);
	inheritProps(props, inherited);

	return props;
};

// The props of an object type: written inline, an intersection of object
// types, or a same-file interface or type alias it names. None for anything
// else.
const readTypeProps = (
	node: TypeNode,
	program: Program,
	seen: Set<string>
): BooleanProps => {
	if (isTypeLiteral(node)) {
		return readMembers(node.members);
	}

	if (isIntersectionType(node)) {
		const props: BooleanProps = new Map();

		for (const type of node.types) {
			joinProps(props, readTypeProps(type, program, seen));
		}

		return props;
	}

	if (!isTypeReference(node) || node.typeName.name === undefined) {
		return new Map();
	}

	return readNamedProps(node.typeName.name, program, seen);
};

/**
 * The props a type-based `defineProps<…>()` declares, each with whether its
 * type includes `boolean`, which Vue casts to `false` when an element leaves
 * it out. Read from an inline object type, an intersection of them, or a
 * same-file interface, with those it extends, or type alias of one.
 */
export const readTypedProps = (
	call: CallExpression,
	program: Program
): ReadonlyMap<string, boolean> =>
	getOrCreate(typedPropsByCall, call, () => {
		const props: BooleanProps = new Map();

		if (
			!('typeArguments' in call) ||
			!isTypeArguments(call.typeArguments)
		) {
			return props;
		}

		for (const type of call.typeArguments.params) {
			joinProps(props, readTypeProps(type, program, new Set()));
		}

		return props;
	});