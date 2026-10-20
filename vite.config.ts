import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // Relative so the build works from any GitHub Pages path.
  base: './',
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react-dom/client': 'preact/compat/client',
      'react/jsx-runtime': 'preact/jsx-runtime',
      '@league/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@league/engine': fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url)),
      '@league/io': fileURLToPath(new URL('../../packages/io/src/index.ts', import.meta.url)),
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
