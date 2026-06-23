/**
 * Valid input type accepted to generate class names
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
 * Appends a value to the result string with a space if the result is not empty
 */
const append = (result: string, value: string): string => {

	// If the current result is empty, return the value directly
	if (result === '') {
		return value;
	}

	return `${result} ${value}`;
};

/**
 * Appends record keys to the result string when their values are truthy
 */
const appendRecord = (result: string, record: ClassRecord): string => {

	let current = result;

	// Iterate over the keys of the record and append those with truthy values
	for (const key of keys(record)) {
		if (record[key]) {
			current = append(current, key);
		}
	}

	return current;
};

/**
 * Constructs a class name string from various input types
 *
 * Strings are included directly, arrays are flattened, object keys are included
 * if their values are truthy, other value types are ignored.
 */
export function cn(...args: ClassValue[]): string {

	let result = '';

	// Process args iteratively to avoid deep recursion
	for (const item of args) {

		// Skip falsy values
		if (!item) {
			continue;
		}

		// Handle string values directly
		if (typeof item === 'string') {
			result = append(result, item);
			continue;
		}

		// Handle array values by flattening them into the main args list
		if (isArray(item)) {
			result = append(result, cn(...item));
			continue;
		}

		// Handle object values by including keys with truthy values
		if (typeof item === 'object') {
			result = appendRecord(result, item);
		}
	}

	return result;
}