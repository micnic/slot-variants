import * as svelteParser from 'svelte-eslint-parser';
import plugin from '../../src/eslint-plugin.ts';

export default [
	plugin.configs.recommended,
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parser: svelteParser,
			ecmaVersion: 'latest',
			sourceType: 'module'
		}
	}
];