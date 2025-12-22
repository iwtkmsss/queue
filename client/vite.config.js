import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Public endpoints used by the built app (production).
const API_URL = 'https://line.tec4.kiev.ua/api';
const WS_URL = 'wss://line.tec4.kiev.ua/ws';

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(API_URL),
    'import.meta.env.VITE_WS_URL': JSON.stringify(WS_URL),
  },
  server: {
    host: true,  // listen on all interfaces for dev
    port: 35173,
    proxy: {
      '/api': {
        target: API_URL,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''), // /api/foo -> /foo
      },
      '/ws': {
        target: WS_URL,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});

