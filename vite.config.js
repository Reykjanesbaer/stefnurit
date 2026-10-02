import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
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
