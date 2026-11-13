import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout : vrai serveur tRPC + vrai front Vite + vrai navigateur.
 * Ports dédiés et journal d'événements jetable (un fichier neuf à chaque exécution).
 */
const API_PORT = '3101';
const WEB_PORT = 5174;
const STORE = `data/e2e/events-${Date.now()}.jsonl`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'npx tsx src/infrastructure/server.ts',
      port: Number(API_PORT),
      env: { API_PORT, EVENT_STORE_FILE: STORE },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_PORT },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
