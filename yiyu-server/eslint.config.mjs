// ESLint 9 flat config(NestJS 惯例规则集;项目风格:无分号依赖 prettier)
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { project: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // DTO 边界/prisma Decimal 交互偶需 any
      '@typescript-eslint/no-floating-promises': 'off', // 未开 type-aware 规则链,审计记录等 fire-and-forget 由人工把关
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  prettier,
)
