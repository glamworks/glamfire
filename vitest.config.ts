import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.{ts,mts,mjs}', 'scripts/**/test/**/*.test.mjs'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
