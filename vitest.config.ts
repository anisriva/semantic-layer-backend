import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'tsconfig-paths';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});