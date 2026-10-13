import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const PUBLIC_HOST = '20.120.212.78';
const FRONTEND_PORT = 8043;
const BACKEND = 'http://127.0.0.1:8044';

const apiProxy = {
  '/api': {
    target: BACKEND,
    changeOrigin: true,
    timeout: 300_000,
    proxyTimeout: 300_000,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: FRONTEND_PORT,
    strictPort: true,
    allowedHosts: true,
    hmr: {
      host: PUBLIC_HOST,
      protocol: 'ws',
      clientPort: FRONTEND_PORT,
    },
    proxy: apiProxy,
  },
  preview: {
    host: '0.0.0.0',
    port: FRONTEND_PORT,
    strictPort: true,
    allowedHosts: true,
    proxy: apiProxy,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Charting is the heaviest dependency and is only needed on a couple of screens,
        // so it is kept out of the main entry chunk.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules[\\/](recharts|d3-|victory-|react-smooth|decimal\.js|eventemitter3)/.test(id)) {
            return 'charts';
          }
          if (/node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'react';
          }
          return 'vendor';
        },
      },
    },
  },
});
