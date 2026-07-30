import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['lmu.qlng.fr'],
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL ?? 'http://backend:3001',
        changeOrigin: true,
      },
    },
  },
});
