import tseslint from 'typescript-eslint';
import plugin from '../../src/eslint-plugin.ts';

export default [
	plugin.configs.recommended,
	{
		files: ['**/*.tsx'],
		languageOptions: {
			parser: tseslint.parser,
			ecmaVersion: 'latest',
			sourceType: 'module',
			parserOptions: { ecmaFeatures: { jsx: true } }
		}
	}
];