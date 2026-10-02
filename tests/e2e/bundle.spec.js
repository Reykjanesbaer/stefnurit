import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

const dist = new URL('../../dist/stefnu-rit.js', import.meta.url);

// The other specs exercise src/. This one covers what a CMS actually loads, so
// a packaging mistake (a missing font, a broken import, an IIFE that never
// defines the element) cannot ship unnoticed.
test.describe('built bundles', () => {
  test.skip(!existsSync(dist), 'run `npm run build` first');

  for (const build of ['esm', 'iife']) {
    test(`${build} build renders the whole document`, async ({ page }) => {
      const problems = [];
      page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
      page.on('pageerror', (e) => problems.push(String(e)));

      await page.setViewportSize({ width: 1400, height: 1000 });
      await page.goto('/demo/bundle.html');

      const host = page.locator(`#${build}`);
      await expect(host.locator('.card')).toHaveCount(6);
      await expect(host.locator('a[href]')).toHaveCount(24);
      await expect(host).toHaveAttribute('data-ready', '');
      await expect.poll(() => host.locator('.lines line').count()).toBeGreaterThan(0);
      expect(problems).toEqual([]);
    });
  }

  test('the font travels inside the bundle — no external request', async ({ page }) => {
    const external = [];
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (!url.startsWith('http://127.0.0.1')) external.push(url);
      return route.continue();
    });

    await page.goto('/demo/bundle.html');
    await expect(page.locator('#esm .card')).toHaveCount(6);
    expect(await page.evaluate(() => document.fonts.check('700 22px Figtree', 'áðéíóúýþæöÞ'))).toBe(true);
    expect(external).toEqual([]);
  });
});
