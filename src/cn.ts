/**
 * Represents valid class name input types
 */
export type ClassValue =
	| string
	| ClassArray
	| ClassRecord
	| boolean
	| number
	| bigint
	| null
	| undefined;

type ClassArray = ClassValue[];
type ClassRecord = Record<string, unknown>;

const { isArray } = Array;
const { keys } = Object;

/**
 * Constructs a class name string from various input types
 */
export function cn(...args: ClassValue[]): string {

	const stack = [...args];

	let index = 0;
	let result = '';

	// Process the stack iteratively to avoid deep recursion
	while (index < stack.length) {

		const item = stack[index];

		// Move to the next item
		index++;

		// Skip falsy values
		if (!item) {
			continue;
		}

		// Handle different types of class values
		if (typeof item === 'string') {
			result += ` ${item}`;
		} else if (isArray(item)) {
			stack.push(...item);
		} else if (typeof item === 'object') {

			// Handle object records
			for (const key of keys(item)) {

				// Include key if value is truthy
				if (item[key]) {
					result += ` ${key}`;
				}
			}
		}
	}

	return result.slice(1);
}