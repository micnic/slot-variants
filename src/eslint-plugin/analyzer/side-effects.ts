import type {
	ArrayExpression,
	MemberExpression,
	Node,
	ObjectExpression
} from 'estree';

const isMemberReadFree = (node: MemberExpression): boolean =>
	isSideEffectFree(node.object) &&
	(!node.computed || isSideEffectFree(node.property));

const isArrayFree = (node: ArrayExpression): boolean =>
	node.elements.every((element) => {
		if (element === null) {
			return true;
		}

		if (element.type === 'SpreadElement') {
			return isSideEffectFree(element.argument);
		}

		return isSideEffectFree(element);
	});

const isObjectFree = (node: ObjectExpression): boolean =>
	node.properties.every((prop) => {
		if (prop.type === 'SpreadElement') {
			return isSideEffectFree(prop.argument);
		}

		return (
			(!prop.computed || isSideEffectFree(prop.key)) &&
			isSideEffectFree(prop.value)
		);
	});

// Whether evaluating the expression can have no effect besides its value:
// reads, literals, functions and operators over them. A call, assignment,
// update, `await`, `yield` or `new` may, so a fix must neither drop nor
// reorder it.
export const isSideEffectFree = (node: Node): boolean => {
	switch (node.type) {
		case 'Identifier':
		case 'Literal':
		case 'ThisExpression':
		case 'Super':
		case 'PrivateIdentifier':
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
			return true;
		case 'TemplateLiteral':
			return node.expressions.every(isSideEffectFree);
		case 'ChainExpression':
			return isSideEffectFree(node.expression);
		case 'MemberExpression':
			return isMemberReadFree(node);
		case 'UnaryExpression':
			return (
				node.operator !== 'delete' && isSideEffectFree(node.argument)
			);
		case 'BinaryExpression':
		case 'LogicalExpression':
			return isSideEffectFree(node.left) && isSideEffectFree(node.right);
		case 'ConditionalExpression':
			return [node.test, node.consequent, node.alternate].every(
				isSideEffectFree
			);
		case 'ArrayExpression':
			return isArrayFree(node);
		case 'ObjectExpression':
			return isObjectFree(node);
		default:
			return false;
	}
};