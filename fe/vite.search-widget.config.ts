/**
 * @fileoverview Vite configuration for building the search widget as an IIFE bundle.
 * Produces a single self-contained JS file that external sites can embed via <script> tag.
 *
 * Build: npx vite build --config vite.search-widget.config.ts
 * Output: dist/search-widget.iife.js
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          ['babel-plugin-react-compiler', {}],
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/features/search-widget/index.ts'),
      name: 'BKnowledgeSearch',
      formats: ['iife'],
      fileName: () => 'search-widget.iife.js',
    },
    rollupOptions: {
      // Bundle everything (React, ReactDOM) into the IIFE
      // No externals — the widget must be fully self-contained
      output: {
        // Ensure single-file output
        inlineDynamicImports: true,
      },
    },
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: false, // Don't wipe main app build output
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
})
