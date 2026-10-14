#!/usr/bin/env node
/**
 * Screenshots of the admin panel for the documentation.
 *
 * Driven against the mock GitHub, so the images are deterministic and contain
 * no real token, no real name and no real repository state.
 *
 * Run: node scripts/shot-admin.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { createMockGitHub } from '../tests/integration/mock-github-server.mjs';

const OUT = fileURLToPath(new URL('../docs/qa/admin/', import.meta.url));
await mkdir(OUT, { recursive: true });

const mock = createMockGitHub();
const mockOrigin = await mock.listen();
const { server, origin } = await serve(0);
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});

const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

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

// The avatar is the one thing that would reach the real internet.
await page.route('https://avatars.githubusercontent.com/**', (route) => route.fulfill({
  status: 200,
  contentType: 'image/svg+xml',
  body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="#C9D6E6"/></svg>',
}));

const shots = [];
const shoot = async (name, note) => {
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
  shots.push({ name, note });
  console.log(`  ✓ ${name}.png — ${note}`);
};

await page.goto(`${origin}/admin/`);
await page.getByRole('heading', { name: 'Stjórnborð stefnurits' }).waitFor();
await shoot('01-innskraning', 'Innskráningarskjár með leiðbeiningum um aðgangslykil');

await page.getByLabel(/Aðgangslykill/).fill('test-token-publisher');
await page.getByRole('button', { name: 'Skrá inn' }).click();
await page.getByRole('heading', { name: 'Yfirlit' }).waitFor();
await page.waitForTimeout(400);
await shoot('02-yfirlit', 'Yfirlit: staða birtingar, drög, hlekkir og viðvaranir');

await page.goto(`${origin}/admin/`);
await page.getByLabel(/Aðgangslykill/).fill('test-token-viewer');
await page.getByRole('button', { name: 'Skrá inn' }).click();
await page.getByRole('heading', { name: 'Yfirlit' }).waitFor();
await page.waitForTimeout(300);
await shoot('03-ahorfandi', 'Áhorfandi: ritstjórn og útgáfa óvirk');

// Editor, with something selected so the inspector is not empty.
await page.goto(`${origin}/admin/`);
await page.getByLabel(/Aðgangslykill/).fill('test-token-publisher');
await page.getByRole('button', { name: 'Skrá inn' }).click();
await page.getByRole('heading', { name: 'Yfirlit' }).waitFor();
await page.getByRole('button', { name: 'Ritstjóri', exact: true }).click();
await page.getByRole('heading', { name: 'Ritstjóri' }).waitFor();
await page.locator('.tree-name', { hasText: 'Innkaupastefna' }).first().click();
await page.waitForTimeout(700);
await shoot('04-ritstjori', 'Ritstjóri: efnistré, forskoðun og yfirferð');

// A conflict, which is the screen people will need explained to them.
await page.locator('#f-name').fill('Mín útgáfa');
await page.getByRole('button', { name: 'Vista drög' }).click();
await page.locator('.save-status').getByText(/Drög vistuð/).waitFor({ timeout: 10_000 });
const theirs = await page.evaluate(async () => {
  const read = await fetch(
    'https://api.github.com/repos/Reykjanesbaer/stefnurit/contents/src/data/stefnurit.json?ref=stefnurit%2Fdraft-aron5109',
    { headers: { authorization: 'Bearer test-token-publisher' } });
  const data = await read.json();
  const text = new TextDecoder().decode(Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0)));
  const document_ = JSON.parse(text);
  document_.sections[2].columns[0].cards[0].items[0].label = 'Þeirra útgáfa';
  return JSON.stringify(document_, null, 2) + '\n';
});
await fetch(`${mockOrigin}/__mock/control`, { method: 'POST', body: JSON.stringify({ concurrentWrite: theirs }) });
await page.locator('#f-name').fill('Mín útgáfa, breytt aftur');
await page.getByRole('button', { name: 'Vista drög' }).click();
await page.locator('.conflict-dialog').waitFor({ timeout: 10_000 });
await page.waitForTimeout(300);
await shoot('05-arekstur', 'Árekstrargluggi: hvor breytingin á að gilda');

// The remaining views, with the link report served from the fixture.
const { readFileSync } = await import('node:fs');
const report = readFileSync(new URL('../tests/fixtures/link-status.json', import.meta.url), 'utf8');
await page.route('**/data/link-status.json', (route) => route.fulfill({
  status: 200, contentType: 'application/json', body: report,
}));

await page.goto(`${origin}/admin/`);
await page.getByLabel(/Aðgangslykill/).fill('test-token-publisher');
await page.getByRole('button', { name: 'Skrá inn' }).click();
await page.getByRole('heading', { name: 'Yfirlit' }).waitFor();

for (const [view, name, note] of [
  ['Hlekkir', '06-hlekkir', 'Hlekkir: staða hvers skjals, síur og CSV'],
  ['Saga', '07-saga', 'Saga: allar útgáfur, samanburður og endurheimt'],
  ['Aðgerðir', '08-adgerdir', 'Aðgerðir: hver birti hvað og hvenær'],
  ['Aðgangur', '09-adgangur', 'Aðgangur: hverjir mega breyta'],
]) {
  await page.getByRole('button', { name: view, exact: true }).click();
  await page.getByRole('heading', { name: view, level: 1 }).waitFor();
  await page.waitForTimeout(600);
  await shoot(name, note);
}

await browser.close();
server.close();
mock.close();

console.log(`\n${shots.length} myndir í docs/qa/admin/`);
