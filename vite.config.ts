import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: {
    /* Everything goes to the panel's own server (../loplop-server): the
       content, the files and the AI providers, whose keys stay there.
       API_TARGET points it at another one (a throwaway server for tests). */
    proxy: {
      '/api': { target: process.env.API_TARGET ?? 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
})
