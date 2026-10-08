import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'formula-assessment-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = (req as { url?: string }).url?.split('?')[0] ?? '';
          if (!url.startsWith('/api/')) {
            next();
            return;
          }
          // @ts-expect-error Plain JavaScript server module has no declaration file.
          const serverApi = await import('../server/http.js');
          const { handleApi } = serverApi as {
            handleApi: (request: typeof req, response: typeof res) => Promise<void>;
          };
          await handleApi(req, res);
        });
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: false,
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
