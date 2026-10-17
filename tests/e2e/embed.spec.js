import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createMockGitHub } from '../integration/mock-github-server.mjs';
import { buildSnippets } from '../../admin/src/embed-snippets.js';
import { STACK_BELOW } from '../../src/tokens.js';

/**
 * The iframe embed, exercised the way a host page uses it: a real page, a real
 * <iframe>, and the snippet the panel hands out pasted in verbatim.
 */
const siteConfig = JSON.parse(readFileSync(new URL('../../site.config.json', import.meta.url), 'utf8'));

// Point the snippet at the local server instead of github.io; the paths under
// the site root are the same ones the real site serves.
const LOCAL = 'http://127.0.0.1:8777';
const local = { ...siteConfig, siteUrl: LOCAL };

const hostPage = (body) => `<!doctype html><meta charset="utf-8"><title>host</title>
<body style="margin:0">${body}
<script>window.__messages = []; window.addEventListener('message', (e) => window.__messages.push({ origin: e.origin, type: e.data && e.data.type }));</script>`;

/**
 * A second, real origin that is not on the allowlist: another port on loopback.
 * A made-up hostname would be refused by Chromium's Private Network Access
 * rules before the frame ever ran, which would test the browser, not the frame.
 */
let stranger;
let strangerOrigin;
let strangerBody = '';

test.beforeAll(async () => {
  stranger = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(strangerBody);
  });
  await new Promise((resolve) => stranger.listen(0, '127.0.0.1', resolve));
  strangerOrigin = `http://127.0.0.1:${stranger.address().port}`;
});
test.afterAll(() => new Promise((resolve) => stranger.close(resolve)));

test.describe('iframe embed', () => {
  test('the frame renders every link on its own', async ({ page }) => {
    await page.goto('/embed/frame.html');
    await expect.poll(() => page.locator('stefnu-rit').evaluate((el) => (el.shadowRoot?.querySelectorAll('a.item-link, a.pill').length ?? 0))).toBe(24);
  });

  test('the pasted snippet shows the widget inside a host page', async ({ page }) => {
    await page.route(`${LOCAL}/__host`, (route) => route.fulfill({ contentType: 'text/html', body: hostPage(buildSnippets(local).iframe) }));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${LOCAL}/__host`);

    const frame = page.frameLocator('iframe');
    await expect.poll(() => frame.locator('stefnu-rit').evaluate((el) => (el.shadowRoot?.querySelectorAll('a.item-link, a.pill').length ?? 0))).toBe(24);
    // Fixed height: this is the variant that needs no script on the host.
    expect(await page.locator('iframe').evaluate((el) => el.getBoundingClientRect().height)).toBe(1000);
  });

  test('the auto-height snippet resizes the frame to its content', async ({ page }) => {
    await page.route(`${LOCAL}/__host`, (route) => route.fulfill({ contentType: 'text/html', body: hostPage(buildSnippets(local, { height: 1450 }).iframeAuto) }));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${LOCAL}/__host`);

    // At 1280px the widget keeps five columns and is far shorter than 1450.
    await expect.poll(() => page.locator('iframe').evaluate((el) => el.getBoundingClientRect().height), { timeout: 8000 })
      .toBeLessThan(1000);
    const frameHeight = await page.locator('iframe').evaluate((el) => el.getBoundingClientRect().height);
    expect(frameHeight).toBeGreaterThan(700);
  });

  test('on a narrow page the frame keeps the desktop tree and scrolls sideways', async ({ page }) => {
    await page.route(`${LOCAL}/__host`, (route) => route.fulfill({ contentType: 'text/html', body: hostPage(buildSnippets(local).iframe) }));
    await page.setViewportSize({ width: 400, height: 900 });
    await page.goto(`${LOCAL}/__host`);

    const frame = page.frameLocator('iframe');
    const stacked = () => frame.locator('stefnu-rit').evaluate((el) => getComputedStyle(el.shadowRoot.querySelector('.grid')).display === 'block');
    await expect.poll(() => frame.locator('stefnu-rit').evaluate((el) => (el.shadowRoot?.querySelectorAll('a.item-link, a.pill').length ?? 0))).toBe(24);

    expect(await page.locator('iframe').evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(STACK_BELOW);
    expect(await stacked()).toBe(false);
    // The wrapper scrolls; the page itself does not gain a sideways scrollbar.
    expect(await page.locator('div').first().evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });

  test('without keepDesktop the same narrow page gets the stacked layout', async ({ page }) => {
    await page.route(`${LOCAL}/__host`, (route) => route.fulfill({ contentType: 'text/html', body: hostPage(buildSnippets(local, { keepDesktop: false }).iframe) }));
    await page.setViewportSize({ width: 400, height: 900 });
    await page.goto(`${LOCAL}/__host`);

    const frame = page.frameLocator('iframe');
    await expect.poll(() => frame.locator('stefnu-rit').evaluate((el) => (el.shadowRoot?.querySelectorAll('a.item-link, a.pill').length ?? 0))).toBe(24);
    expect(await frame.locator('stefnu-rit').evaluate((el) => getComputedStyle(el.shadowRoot.querySelector('.grid')).display === 'block')).toBe(true);
  });

  test('a 785px frame is the desktop tree whatever height it is given', async ({ page }) => {
    for (const height of [300, 785, 2000]) {
      const body = hostPage(`<iframe src="${LOCAL}/embed/frame.html" width="785" height="${height}" style="border:0"></iframe>`);
      await page.route(`${LOCAL}/__host`, (route) => route.fulfill({ contentType: 'text/html', body }));
      await page.setViewportSize({ width: 1000, height: 900 });
      await page.goto(`${LOCAL}/__host`);
      const frame = page.frameLocator('iframe');
      await expect.poll(() => frame.locator('stefnu-rit').evaluate((el) => (el.shadowRoot?.querySelectorAll('a.item-link, a.pill').length ?? 0))).toBe(24);
      expect(await frame.locator('stefnu-rit').evaluate((el) => getComputedStyle(el.shadowRoot.querySelector('.grid')).display), `${height}px tall`).toBe('grid');
      await page.unroute(`${LOCAL}/__host`);
    }
  });

  test('a page that is not on the allowlist gets no messages at all', async ({ page }) => {
    strangerBody = hostPage(`<iframe src="${LOCAL}/embed/frame.html" width="100%" height="1000" style="border:0"></iframe>`);
    await page.goto(strangerOrigin);

    await expect.poll(() => page.frameLocator('iframe').locator('stefnu-rit').evaluate((el) => (el.shadowRoot?.querySelectorAll('a.item-link, a.pill').length ?? 0))).toBe(24);
    await page.waitForTimeout(800);
    // It still renders; it just stays silent, and never falls back to '*'.
    expect(await page.evaluate(() => window.__messages)).toEqual([]);
  });

  test('a crafted ?parent= for an unlisted origin is refused', async ({ page }) => {
    strangerBody = hostPage(`<iframe src="${LOCAL}/embed/frame.html?parent=${encodeURIComponent(strangerOrigin)}" width="100%" height="1000" style="border:0"></iframe>`);
    await page.goto(strangerOrigin);

    await expect.poll(() => page.frameLocator('iframe').locator('stefnu-rit').evaluate((el) => (el.shadowRoot?.querySelectorAll('a.item-link, a.pill').length ?? 0))).toBe(24);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__messages)).toEqual([]);
  });
});

test.describe('the panel hands out the code', () => {
  let mock;
  let mockOrigin;

  test.beforeAll(async () => {
    mock = createMockGitHub();
    mockOrigin = await mock.listen();
  });
  test.afterAll(() => mock.close());

  test.beforeEach(async ({ page }) => {
    await fetch(`${mockOrigin}/__mock/reset`, { method: 'POST' });
    await page.route('https://api.github.com/**', async (route) => {
      const url = new URL(route.request().url());
      const response = await fetch(`${mockOrigin}${url.pathname}${url.search}`, {
        method: route.request().method(),
        headers: route.request().headers(),
        body: ['GET', 'HEAD'].includes(route.request().method()) ? undefined : route.request().postData(),
      });
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text(),
      });
    });
  });

  const signIn = async (page, token = 'test-token-publisher') => {
    await page.goto('/admin/');
    await page.getByLabel(/Aðgangslykill/).fill(token);
    await page.getByRole('button', { name: 'Skrá inn' }).click();
    await page.getByRole('heading', { name: 'Yfirlit' }).waitFor();
  };

  test('the header shortcut copies the iframe code in one click', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signIn(page);

    await page.getByRole('button', { name: 'Afrita iframe' }).click();
    await expect(page.getByRole('button', { name: /Afritað/ })).toBeVisible();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(buildSnippets(siteConfig).iframe);
    expect(copied).toContain(`${siteConfig.siteUrl}/embed/frame.html`);
  });

  test('the shortcut is there for a read-only token too', async ({ page }) => {
    await signIn(page, 'test-token-viewer');
    await expect(page.getByRole('button', { name: 'Afrita iframe' })).toBeEnabled();
  });

  test('if the browser refuses the clipboard, the code is shown to copy by hand', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true,
      });
    });
    await signIn(page);
    await page.getByRole('button', { name: 'Afrita iframe' }).click();

    const area = page.getByLabel('iframe-kóði til að afrita');
    await expect(area).toBeVisible();
    await expect(area).toHaveValue(buildSnippets(siteConfig).iframe);
    await expect(area).toBeFocused();
  });

  test('Stillingar offers the same code, with an adjustable height', async ({ page }) => {
    await signIn(page);
    await page.locator('.app-nav').getByRole('button', { name: 'Stillingar' }).click();

    const code = page.locator('#innfelling .snippet-code').first();
    await expect(code).toHaveText(buildSnippets(siteConfig).iframe);

    await page.getByLabel('Hæð rammans í punktum').fill('1450');
    await expect(code).toContainText('height="1450"');
  });

  test('Stillingar lets the frame follow its container instead of holding the desktop look', async ({ page }) => {
    await signIn(page);
    await page.locator('.app-nav').getByRole('button', { name: 'Stillingar' }).click();
    const code = page.locator('#innfelling .snippet-code').first();
    await expect(code).toContainText(`min-width:${STACK_BELOW}px`);

    await page.getByLabel(/Halda skrifborðsútlitinu/).uncheck();
    await expect(code).not.toContainText('min-width');
    await expect(code).toHaveText(buildSnippets(siteConfig, { keepDesktop: false }).iframe);

    await page.getByLabel(/Halda skrifborðsútlitinu/).check();
    await expect(code).toHaveText(buildSnippets(siteConfig).iframe);
  });

  test('Stillingar never points at a path the site does not publish', async ({ page }) => {
    await signIn(page);
    await page.locator('.app-nav').getByRole('button', { name: 'Stillingar' }).click();
    const all = await page.locator('#innfelling .snippet-code').allTextContents();
    const joined = all.join('\n');
    expect(joined).toContain(`${siteConfig.siteUrl}/dist/stefnu-rit.js`);
    expect(joined).toContain(`${siteConfig.siteUrl}/src/data/stefnurit.json`);
    // The two roots that used to be wrong.
    expect(joined).not.toContain(`${siteConfig.siteUrl}/stefnu-rit.js`);
    expect(joined).not.toContain(`${siteConfig.siteUrl}/stefnurit.json`);
  });
});
