import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { createMockGitHub } from '../integration/mock-github-server.mjs';

const linkReport = readFileSync(new URL('../fixtures/link-status.json', import.meta.url), 'utf8');

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

  // Pages has not deployed in the test environment, so the weekly report is
  // served from a fixture with one of every outcome.
  await page.route('**/data/link-status.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: linkReport }));

  await page.setViewportSize({ width: 1440, height: 1000 });
});

async function signIn(page, token = 'test-token-publisher') {
  await page.goto('/admin/');
  await page.getByLabel(/Aðgangslykill/).fill(token);
  await page.getByRole('button', { name: 'Skrá inn' }).click();
  await page.getByRole('heading', { name: 'Yfirlit' }).waitFor();
}

async function makeDraft(page, label = 'Breytt í drögum') {
  await page.getByRole('button', { name: 'Ritstjóri', exact: true }).click();
  await page.getByRole('heading', { name: 'Ritstjóri' }).waitFor();
  await page.locator('.tree-name', { hasText: 'Innkaupastefna' }).first().click();
  await page.locator('#f-name').fill(label);
  await page.getByRole('button', { name: 'Vista drög' }).click();
  await expect(page.locator('.save-status')).toContainText(/Drög vistuð/, { timeout: 10_000 });
}

test.describe('Útgáfa', () => {
  test('says there is nothing to publish when there is nothing', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Útgáfa', exact: true }).click();
    await expect(page.getByText('Þú átt engin drög til að birta')).toBeVisible();
  });

  test('lists exactly what changes, and flags the links among them', async ({ page }) => {
    await signIn(page);
    await makeDraft(page, 'Innkaupastefna 2026');
    await page.getByRole('button', { name: 'Útgáfa', exact: true }).click();

    const changes = page.locator('.card', { hasText: 'Hvað breytist' });
    await expect(changes).toContainText('Innkaupastefna 2026');
    await expect(changes).toContainText('Innkaupastefna');     // the old value
    await expect(changes).toContainText('Engir hlekkir breytast');
  });

  test('a changed link is called out as something that will be checked', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Ritstjóri', exact: true }).click();
    await page.locator('.tree-name', { hasText: 'Vafrakökustefna' }).first().click();
    await page.locator('#f-href').fill('https://www.reykjanesbaer.is/ny-slod.pdf');
    await page.getByRole('button', { name: 'Vista drög' }).click();
    await expect(page.locator('.save-status')).toContainText(/Drög vistuð/, { timeout: 10_000 });

    await page.getByRole('button', { name: 'Útgáfa', exact: true }).click();
    await expect(page.locator('.card', { hasText: 'Hvað breytist' }))
      .toContainText('hlekkur breytist');
  });

  test('a note is required before Birta is enabled', async ({ page }) => {
    await signIn(page);
    await makeDraft(page);
    await page.getByRole('button', { name: 'Útgáfa', exact: true }).click();

    const publish = page.getByRole('button', { name: 'Birta', exact: true });
    await expect(publish).toBeDisabled();
    await page.locator('#publish-note').fill('ok');          // too short
    await expect(publish).toBeDisabled();
    await page.locator('#publish-note').fill('Uppfæra heiti á innkaupastefnu');
    await expect(publish).toBeEnabled();
  });

  test('publishes: opens the PR, waits for the check, merges and reports the time', async ({ page }) => {
    await signIn(page);
    await makeDraft(page);
    await page.getByRole('button', { name: 'Útgáfa', exact: true }).click();
    await page.locator('#publish-note').fill('Uppfæra heiti á innkaupastefnu');
    await page.getByRole('button', { name: 'Birta', exact: true }).click();

    await expect(page.locator('.publish-progress')).toContainText('Birt kl.', { timeout: 30_000 });
    await expect(page.locator('.publish-progress')).toContainText(/Birt kl\. \d{2}:\d{2}/);
    // and the honest note about the CDN
    await expect(page.locator('.publish-progress')).toContainText('10 mínútur');

    const state = await (await fetch(`${mockOrigin}/__mock/state`)).json();
    expect(state.pulls).toHaveLength(1);
    expect(state.pulls[0].merged_at).toBeTruthy();
    expect(state.pulls[0].title).toBe('Uppfæra heiti á innkaupastefnu');
    expect(state.mainContent).toContain('Breytt í drögum');
  });

  test('a failing check stops the publish and says where to look', async ({ page }) => {
    await fetch(`${mockOrigin}/__mock/control`, {
      method: 'POST', body: JSON.stringify({ checkConclusion: 'failure' }),
    });
    await signIn(page);
    await makeDraft(page);
    await page.getByRole('button', { name: 'Útgáfa', exact: true }).click();
    await page.locator('#publish-note').fill('Þetta á ekki að fara í gegn');
    await page.getByRole('button', { name: 'Birta', exact: true }).click();

    await expect(page.locator('.publish-progress'))
      .toContainText('Athugunin fór ekki í gegn', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Fara aftur í ritilinn' })).toBeVisible();

    const state = await (await fetch(`${mockOrigin}/__mock/state`)).json();
    expect(state.pulls[0].merged_at).toBeNull();     // nothing was published
  });

  test('an editor without merge rights is told so rather than shown a dead button', async ({ page }) => {
    await signIn(page, 'test-token-editor');
    await makeDraft(page);
    await page.getByRole('button', { name: 'Útgáfa', exact: true }).click();
    await expect(page.getByText('Þú getur vistað drög en ekki birt')).toBeVisible();
  });
});

test.describe('Saga', () => {
  test('lists versions with 24-hour timestamps', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Saga', exact: true }).click();
    await expect(page.locator('.history-item').first()).toBeVisible();
    await expect(page.locator('.history-meta').first()).toContainText(/kl\. \d{2}:\d{2}/);
  });

  test('links each version to its immutable copy', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Saga', exact: true }).click();
    const link = page.locator('.history-actions a', { hasText: 'JSON' }).first();
    await expect(link).toHaveAttribute('href', /\/data\/revisions\/[0-9a-f]{7}\.json$/);
  });

  test('restoring loads the version into a draft and publishes nothing', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Saga', exact: true }).click();
    await page.getByRole('button', { name: 'Endurheimta' }).first().click();

    await expect(page.locator('.history-detail .banner')).toContainText('komin í drögin þín', { timeout: 10_000 });
    await expect(page.locator('.history-detail .banner')).toContainText('Ekkert hefur verið birt');

    const state = await (await fetch(`${mockOrigin}/__mock/state`)).json();
    expect(state.branches).toContain('stefnurit/draft-aron5109');
    expect(state.pulls).toHaveLength(0);
  });

  test('a viewer gets no restore button', async ({ page }) => {
    await signIn(page, 'test-token-viewer');
    await page.getByRole('button', { name: 'Saga', exact: true }).click();
    await expect(page.locator('.history-item').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Endurheimta' })).toHaveCount(0);
  });
});

test.describe('Hlekkir', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Hlekkir', exact: true }).click();
    await expect(page.locator('.links-table tbody tr').first()).toBeVisible();
  });

  test('shows every link with its outcome', async ({ page }) => {
    await expect(page.locator('.links-table tbody tr')).toHaveCount(6);
    await expect(page.locator('.link-badge--broken')).toHaveCount(1);
    await expect(page.locator('.link-badge--unknown')).toHaveCount(1);
  });

  test('explains what "óviss" means, because the word alone does not', async ({ page }) => {
    await expect(page.locator('.banner')).toContainText('hleypir GitHub ekki inn');
  });

  test('filtering to broken shows only the broken one', async ({ page }) => {
    await page.getByRole('button', { name: 'Bilaðir' }).click();
    await expect(page.locator('.links-table tbody tr')).toHaveCount(1);
    await expect(page.locator('.links-table tbody')).toContainText('Persónuverndarstefna');
  });

  test('filtering to changed documents finds the silently replaced PDF', async ({ page }) => {
    await page.getByRole('button', { name: 'Breytt skjöl' }).click();
    await expect(page.locator('.links-table tbody tr')).toHaveCount(1);
    await expect(page.locator('.flagged')).toContainText('nýtt skjal');
  });

  test('a redirect shows where it actually lands', async ({ page }) => {
    await page.getByRole('button', { name: 'Áframsendingar' }).click();
    await expect(page.locator('.links-table tbody tr')).toHaveCount(1);
  });

  test('the CSV export is semicolon-separated UTF-8 with a BOM', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Sækja CSV' }).click(),
    ]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8');

    expect(csv.charCodeAt(0)).toBe(0xFEFF);          // Excel needs the BOM
    expect(csv.split('\r\n')[0]).toContain('Skjal;Staða');
    expect(csv).toContain('Persónuverndarstefna');    // Icelandic survived
    expect(csv).toContain('bilaður');
  });

  test('"Athuga núna" dispatches the workflow when the token allows it', async ({ page }) => {
    await page.getByRole('button', { name: 'Athuga núna' }).click();
    await expect(page.getByText('Athugun er hafin')).toBeVisible({ timeout: 10_000 });
    const state = await (await fetch(`${mockOrigin}/__mock/state`)).json();
    expect(state.dispatches).toBe(1);
  });
});

test.describe('Hlekkir without Actions permission', () => {
  test('offers the GitHub page instead of pretending the button worked', async ({ page }) => {
    await signIn(page, 'test-token-editor');
    await page.getByRole('button', { name: 'Hlekkir', exact: true }).click();
    await page.getByRole('button', { name: 'Athuga núna' }).click();

    await expect(page.getByText(/má ekki ræsa keyrslur/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: /Ræstu hana handvirkt/ })).toBeVisible();
  });
});

test.describe('Aðgerðir and Aðgangur', () => {
  test('the audit log lists merged publishes and all commits', async ({ page }) => {
    await signIn(page);
    await makeDraft(page);
    await page.getByRole('button', { name: 'Útgáfa', exact: true }).click();
    await page.locator('#publish-note').fill('Fyrsta birtingin úr stjórnborðinu');
    await page.getByRole('button', { name: 'Birta', exact: true }).click();
    await expect(page.locator('.publish-progress')).toContainText('Birt kl.', { timeout: 30_000 });

    await page.getByRole('button', { name: 'Aðgerðir', exact: true }).click();
    await expect(page.locator('.card', { hasText: 'Birtingar í gegnum stjórnborðið' }))
      .toContainText('Fyrsta birtingin úr stjórnborðinu', { timeout: 10_000 });
  });

  test('the audit view states that history cannot be edited from here', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Aðgerðir', exact: true }).click();
    await expect(page.getByText(/Sagan er varanleg/)).toBeVisible();
  });

  test('access lists who can write when the token may read it', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Aðgangur', exact: true }).click();
    await expect(page.locator('.people li')).toHaveCount(2, { timeout: 10_000 });
    await expect(page.locator('.people')).toContainText('aron5109');
  });

  test('a token that may not read the list says so instead of failing', async ({ page }) => {
    await signIn(page, 'test-token-editor');
    await page.getByRole('button', { name: 'Aðgangur', exact: true }).click();
    await expect(page.getByText('Listinn er ekki aðgengilegur')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Þetta er ekki villa/)).toBeVisible();
  });

  test('access management points at GitHub, where it actually happens', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Aðgangur', exact: true }).click();
    await expect(page.getByRole('link', { name: /Opna aðgangsstillingar/ }))
      .toHaveAttribute('href', /\/settings\/access$/);
  });
});

test.describe('accessibility', () => {
  for (const [view, heading] of [
    ['Saga', 'Saga'], ['Hlekkir', 'Hlekkir'], ['Aðgerðir', 'Aðgerðir'], ['Aðgangur', 'Aðgangur'],
  ]) {
    test(`${view} has no serious or critical violations`, async ({ page }) => {
      await signIn(page);
      await page.getByRole('button', { name: view, exact: true }).click();
      await page.getByRole('heading', { name: heading, level: 1 }).waitFor();
      await page.waitForTimeout(500);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
      expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }

  test('Útgáfa has no serious or critical violations', async ({ page }) => {
    await signIn(page);
    await makeDraft(page);
    await page.getByRole('button', { name: 'Útgáfa', exact: true }).click();
    await page.getByRole('heading', { name: 'Útgáfa', level: 1 }).waitFor();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
