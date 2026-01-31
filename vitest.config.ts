import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // Setup file for jest-dom matchers (dashboard tests)
    setupFiles: ['./packages/dashboard/src/test/setup.ts'],
    // Use per-file environment based on file extension/path
    environmentMatchGlobs: [
      // Dashboard tests use happy-dom
      ['packages/dashboard/**', 'happy-dom'],
      // Default to node for server tests
      ['packages/server/**', 'node'],
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'packages/dashboard/src'),
    },
  },
});
