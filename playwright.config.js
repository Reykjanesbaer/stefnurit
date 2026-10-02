import { defineConfig, devices } from '@playwright/test';

/**
 * Some CI images ship a Chromium that does not match the build Playwright
 * would download; PLAYWRIGHT_CHROMIUM_EXECUTABLE points at the installed one.
 */
const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
  : {};

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
