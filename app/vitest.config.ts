import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '$env/dynamic/public': path.resolve('src/test/mocks/env-dynamic-public.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'build', '.svelte-kit'],
  },
});
