import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_');
  const API_URL = env.VITE_API_URL || 'http://localhost:5000';
  const WS_URL = env.VITE_WS_URL || 'ws://localhost:5000/ws';

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(API_URL),
      'import.meta.env.VITE_WS_URL': JSON.stringify(WS_URL),
    },
    server: {
      host: true,
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
  };
});
