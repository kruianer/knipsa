import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'site/**', 'delivery/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // Konvention (delivery/stack.md): keine `any` ohne Begruendung im Kommentar.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
