import type { CallExpression, Program } from 'estree';

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

type UnionType = TypeNode & { types: ReadonlyArray<TypeNode> };

// A type named by an `Identifier`; a qualified name (`A.B`) has no `name`.
type TypeReference = TypeNode & { typeName: { name?: string } };

type TypeArguments = { params: ReadonlyArray<TypeNode> };

type DeclarationId = { id: { name: string } };

type InterfaceDeclaration = TypeNode &
	DeclarationId & {
		body: { body: TypeMembers };
	};

type TypeAliasDeclaration = TypeNode &
	DeclarationId & {
		typeAnnotation: TypeNode;
	};

type ExportDeclaration = TypeNode & { declaration: TypeNode | null };

const isTypeLiteral = (node: TypeNode): node is TypeLiteral =>
	node.type === 'TSTypeLiteral' && 'members' in node;

const isUnionType = (node: TypeNode): node is UnionType =>
	node.type === 'TSUnionType' && 'types' in node;

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

// The members of an object type: written inline, or a same-file interface or
// type alias of an inline one that it names. None for anything else.
const getTypeMembers = (node: TypeNode, program: Program): TypeMembers => {
	if (isTypeLiteral(node)) {
		return node.members;
	}

	if (!isTypeReference(node)) {
		return [];
	}

	const { name } = node.typeName;

	for (const declaration of getTopLevelTypes(program)) {
		if (
			isInterfaceDeclaration(declaration) &&
			declaration.id.name === name
		) {
			return declaration.body.body;
		}

		if (
			isTypeAliasDeclaration(declaration) &&
			declaration.id.name === name &&
			isTypeLiteral(declaration.typeAnnotation)
		) {
			return declaration.typeAnnotation.members;
		}
	}

	return [];
};

// A property signature's name when its type includes `boolean`.
const getBooleanSignatureName = (member: TypeNode): string | null => {
	if (!isPropertySignature(member) || member.typeAnnotation === undefined) {
		return null;
	}

	if (!includesBoolean(member.typeAnnotation.typeAnnotation)) {
		return null;
	}

	return getSignatureName(member);
};

/**
 * The props a type-based `defineProps<…>()` declares with a type including
 * `boolean`, which Vue casts to `false` when an element leaves them out. Read
 * from an inline object type, or a same-file interface or type alias of one.
 */
export const readTypedBooleanProps = (
	call: CallExpression,
	program: Program
): string[] => {
	if (!('typeArguments' in call) || !isTypeArguments(call.typeArguments)) {
		return [];
	}

	const names: string[] = [];

	for (const props of call.typeArguments.params) {
		for (const member of getTypeMembers(props, program)) {
			const name = getBooleanSignatureName(member);

			if (name !== null) {
				names.push(name);
			}
		}
	}

	return names;
};