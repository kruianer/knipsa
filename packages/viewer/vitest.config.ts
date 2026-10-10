import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    // Ohne das liefert ein Import von stil.css?raw einen leeren Text;
    // stil.test.ts prueft darin die Regeln der Bedienung.
    css: true,
    include: ['src/**/*.test.ts'],
  },
});
