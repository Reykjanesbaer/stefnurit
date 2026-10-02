/** Shared browser-rendering helper for the QA and screenshot scripts. */
import { chromium } from '@playwright/test';
import { serve } from './serve.mjs';

/** Strip the demo page chrome so only the widget itself is in frame. */
const BARE = `
  .page { max-width: none !important; padding: 0 !important; }
  .frame { border-radius: 0 !important; box-shadow: none !important; overflow: visible !important; }
  h1, .lead, .controls, .note { display: none !important; }
  body { background: #fff !important; }
`;

/**
 * Some CI images ship a Chromium that does not match the version Playwright
 * would download. PLAYWRIGHT_CHROMIUM_EXECUTABLE points at the one that is
 * actually installed; without it, Playwright resolves its own as usual.
 */
export const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
  : {};

export async function withWidget(fn, { page: pagePath = '/demo/index.html' } = {}) {
  const { server, origin } = await serve(0);
  const browser = await chromium.launch(launchOptions);
  try {
    return await fn({ browser, origin, pagePath });
  } finally {
    await browser.close();
    server.close();
  }
}

export async function openWidget(browser, origin, width, { bare = true, pagePath = '/demo/index.html' } = {}) {
  const page = await browser.newPage({
    viewport: { width, height: 1400 },
    deviceScaleFactor: 1,
  });
  const messages = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') messages.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));

  await page.goto(origin + pagePath, { waitUntil: 'load' });
  if (bare) await page.addStyleTag({ content: BARE });
  await page.waitForFunction(
    () => (document.querySelector('stefnu-rit')?.shadowRoot?.querySelectorAll('.card').length ?? 0) > 0,
    null,
    { timeout: 10_000 },
  );
  await page.evaluate(() => document.fonts.ready);
  // One frame for the ResizeObserver pass that strokes the connectors.
  await page.waitForTimeout(250);
  return { page, messages };
}
