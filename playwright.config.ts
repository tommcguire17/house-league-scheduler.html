import { defineConfig } from '@playwright/test';

/**
 * CI installs its own browser, so nothing is pinned there. A sandbox with a
 * preinstalled Chromium sets PW_CHROMIUM to that binary instead of downloading
 * one that will not match.
 */
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'on-first-retry' },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{
    name: 'chromium',
    use: { browserName: 'chromium', launchOptions: { executablePath } },
  }],
});
