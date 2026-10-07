import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Utility and service tests run in Node; the render smoke test opts into jsdom
    // with a `@vitest-environment` docblock.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    reporters: ['default'],
    env: {
      VITE_API_BASE_URL: '',
    },
  },
});
