import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    nodePolyfills({
      globals: {
        Buffer: 'dev',
        global: 'dev',
        process: 'dev'
      }
    }),
    react(), tailwindcss()],
  server: {
    watch: {
      usePolling: true,
    },
    hmr: true,
  },
})
