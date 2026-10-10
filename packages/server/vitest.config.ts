import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@knipsa/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
      '@knipsa/pipeline': fileURLToPath(new URL('../pipeline/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
