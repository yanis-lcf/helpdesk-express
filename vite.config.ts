import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const API_PORT = Number(process.env.API_PORT ?? 3001);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Le client React appelle /trpc/... ; Vite relaie vers le serveur tRPC.
      '/trpc': {
        target: `http://localhost:${API_PORT}`,
        rewrite: (path) => path.replace(/^\/trpc/, ''),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
