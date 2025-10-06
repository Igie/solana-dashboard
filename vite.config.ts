import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill'



// Vite config
export default defineConfig({
  server: {
    host: '0.0.0.0',
  },
  plugins: [
    nodePolyfills({}),
    react(),
    tailwindcss()
  ],
  define: {
    global: 'globalThis',
    'process.env': {},
  },
  resolve: {
    alias: {
      process: 'process',
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({
          process: true,
          buffer: true,
        }),
      ],
    },
  },
})
