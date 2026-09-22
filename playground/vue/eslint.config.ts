import * as vueParser from 'vue-eslint-parser';
import plugin from '../../src/eslint-plugin.ts';

export default [
	plugin.configs.recommended,
	{
		files: ['**/*.vue'],
		languageOptions: {
			parser: vueParser,
			ecmaVersion: 'latest',
			sourceType: 'module'
		}
	}
];