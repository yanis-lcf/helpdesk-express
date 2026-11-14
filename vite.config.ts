import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const API_PORT = Number(process.env.API_PORT ?? 3001);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Le client React appelle /trpc/... ; Vite relaie tel quel vers le serveur, qui expose l'API sous /trpc/
      // (comme en production, où ce même serveur sert aussi l'interface compilée).
      '/trpc': { target: `http://localhost:${API_PORT}` },
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
