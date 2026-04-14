import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '$lib': path.resolve('src/lib'),
      '$env/dynamic/private': path.resolve('src/test/mocks/env-dynamic-private.ts'),
      '$env/dynamic/public': path.resolve('src/test/mocks/env-dynamic-public.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'build', '.svelte-kit'],
  },
});
