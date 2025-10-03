import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,         // або '0.0.0.0' — щоб було видно ззовні
    port: 35173,        // твій публічний порт
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''), // /api/foo -> /foo
      },
      '/ws': {
        target: 'ws://127.0.0.1:5000',
        ws: true,
        changeOrigin: true,
        // якщо твій WS НЕ на /ws, зніми rewrite/підкоригуй path
        // rewrite: (p) => p.replace(/^\/ws/, '/ws'),
      },
    },
  },
})
