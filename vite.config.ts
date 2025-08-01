import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill'



// Vite config
export default defineConfig({
  server: {
    host: '0.0.0.0',
    https:{
      
    }
  },
  plugins: [react(), tailwindcss()],
  define: {
    global: 'globalThis', // make sure global is defined
    'process.env': {}, // Needed for many packages that access process.env.*
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
