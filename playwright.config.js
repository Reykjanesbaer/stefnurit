import { defineConfig, devices } from '@playwright/test';
import { resolveChromium } from './scripts/chromium-path.mjs';

/**
 * Which Chromium to launch.
 *
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE wins when it is set. Without it the resolver
 * prefers Playwright's own build and falls back to whatever Chromium the image
 * ships, so `npm run test:e2e` works on a developer machine that ran
 * `npx playwright install` and on a CI image that pre-installs a different
 * revision, without either needing to know about the other.
 */
const chromium = resolveChromium();
const launchOptions = chromium.executablePath ? { executablePath: chromium.executablePath } : {};

// The config is re-evaluated in every worker; only the main process reports.
if (chromium.executablePath && process.env.TEST_WORKER_INDEX === undefined) {
  console.log(`[playwright] Chromium: ${chromium.executablePath} (${chromium.source})`);
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8777',
    trace: 'retain-on-failure',
    launchOptions,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions } }],
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://127.0.0.1:8777/demo/index.html',
    reuseExistingServer: !process.env.CI,
    env: { PORT: '8777' },
  },
});
