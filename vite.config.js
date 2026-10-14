import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

/** Read without importing: the config is CommonJS-adjacent and the module is ESM. */
const version = /export const VERSION = '([^']+)'/
  .exec(readFileSync(resolve(import.meta.dirname, 'src/stefnu-rit.js'), 'utf8'))?.[1] ?? '0.0.0';

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
    rollupOptions: {
      output: {
        banner: `/*! stefnu-rit ${version} — Reykjanesbær · MIT · Figtree: SIL OFL 1.1 */`,
      },
    },
  },
});
