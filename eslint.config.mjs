import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['legacy/**', 'dist/**', 'node_modules/**', 'src/database/migrations/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Nest 의 핸들러는 async 라 await 없이 Promise 를 돌려주는 일이 잦다.
      '@typescript-eslint/require-await': 'off',
    },
  },
  prettier,
)
