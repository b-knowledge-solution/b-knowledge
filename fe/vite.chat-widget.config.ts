/**
 * @fileoverview Vite configuration for the chat widget IIFE bundle.
 * Builds a standalone JavaScript file that can be embedded on third-party
 * websites via a script tag. Bundles React, CSS, and all dependencies inline.
 *
 * Usage:
 *   npx vite build --config vite.chat-widget.config.ts
 *
 * Output:
 *   dist-widget/bk-chat-widget.iife.js
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
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/features/chat-widget/index.ts'),
      name: 'BKnowledgeChat',
      fileName: 'bk-chat-widget',
      formats: ['iife'],
    },
    outDir: 'dist-widget',
    cssCodeSplit: false,
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
})
