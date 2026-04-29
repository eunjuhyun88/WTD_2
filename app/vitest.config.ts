import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    conditions: ['browser'],
    alias: {
      '$lib': path.resolve('src/lib'),
      '$env/dynamic/private': path.resolve('src/test/mocks/env-dynamic-private.ts'),
      '$env/dynamic/public': path.resolve('src/test/mocks/env-dynamic-public.ts'),
    },
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['**/components/**/*.test.ts', 'jsdom'],
      ['**/*.svelte.test.ts', 'jsdom'],
    ],
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'build', '.svelte-kit'],
  },
});
