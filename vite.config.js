import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // Unit tests only — tests/e2e belongs to Playwright, which brings its own
  // runner and would otherwise be collected here and fail on import.
  test: {
    include: ['tests/*.test.js'],
    environment: 'node',
  },
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/stefnu-rit.js'),
      name: 'StefnuRit',
      formats: ['es', 'iife'],
      fileName: (format) => (format === 'es' ? 'stefnu-rit.js' : 'stefnu-rit.iife.js'),
    },
    assetsInlineLimit: 0,
    target: 'es2022',
    sourcemap: true,
  },
});
