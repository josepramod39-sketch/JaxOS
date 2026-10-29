import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'release/**'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    maxWorkers: 2,
  },
});
