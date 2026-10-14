import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * The admin panel is built separately from the widget: the widget is a library
 * build (one ES module plus an IIFE), this is a page. One Vite config cannot be
 * both, and splitting them keeps the widget's "zero dependencies, zero build
 * assumptions" promise intact.
 */
export default defineConfig({
  root: resolve(import.meta.dirname),
  base: './',
  publicDir: resolve(import.meta.dirname, 'public'),
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: { admin: resolve(import.meta.dirname, 'index.html') },
    },
  },
  server: { port: 5174 },
});
