import eslint from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import tseslint from 'typescript-eslint'

export default [
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		ignores: ['dist'],
	},
	{
		plugins: {
			'@stylistic': stylistic,
		},
		rules: {
			'@stylistic/eol-last': ['error', 'never'],
		}
	}
]