import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createMockGitHub } from '../integration/mock-github-server.mjs';

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
  await page.setViewportSize({ width: 1440, height: 1000 });
});

async function openEditor(page, token = 'test-token-publisher') {
  await page.goto('/admin/');
  await page.getByLabel(/Aðgangslykill/).fill(token);
  await page.getByRole('button', { name: 'Skrá inn' }).click();
  await page.getByRole('heading', { name: 'Yfirlit' }).waitFor();
  await page.getByRole('button', { name: 'Ritstjóri', exact: true }).click();
  await page.getByRole('heading', { name: 'Ritstjóri' }).waitFor();
  await expect(page.locator('.tree-row').first()).toBeVisible();
}

const selectItem = async (page, name) => {
  await page.locator('.tree-name', { hasText: name }).first().click();
  await expect(page.locator('#f-name')).toBeVisible();
};

test.describe('the editing surface', () => {
  test('shows the whole document as a tree with a live preview', async ({ page }) => {
    await openEditor(page);
    // 3 sections' worth: 1 root + 2 branch pills + 5 columns + 6 cards + 21 items
    expect(await page.locator('.tree-row').count()).toBe(35);
    await expect(page.locator('#forskodun .card')).toHaveCount(6);
  });

  test('editing a label updates the preview as you type', async ({ page }) => {
    await openEditor(page);
    await selectItem(page, 'Innkaupastefna');
    await page.locator('#f-name').fill('Innkaupastefna 2026');

    await expect(page.locator('#forskodun #innkaupastefna')).toContainText('Innkaupastefna 2026');
    // and nothing else moved
    await expect(page.locator('#forskodun #vafrakokustefna')).toContainText('Vafrakökustefna');
  });

  test('editing a link changes only that href', async ({ page }) => {
    await openEditor(page);
    await selectItem(page, 'Vafrakökustefna');
    await page.locator('#f-href').fill('https://www.reykjanesbaer.is/ny-vafrakokustefna.pdf');

    await expect(page.locator('#forskodun #vafrakokustefna'))
      .toHaveAttribute('href', 'https://www.reykjanesbaer.is/ny-vafrakokustefna.pdf');
    await expect(page.locator('#forskodun #innkaupastefna'))
      .toHaveAttribute('href', /innkaupastefna-reykjanesbaejar\.pdf$/);
  });

  test('a bad link is called out before it can be saved', async ({ page }) => {
    await openEditor(page);
    await selectItem(page, 'Vafrakökustefna');

    await page.locator('#f-href').fill('javascript:alert(1)');
    await expect(page.locator('.inspector .hint.bad')).toBeVisible();
    await expect(page.locator('.validation')).toContainText('ekki leyft');
    await expect(page.getByRole('button', { name: 'Vista drög' })).toBeDisabled();

    await page.locator('#f-href').fill('https://www.reykjanesbaer.is/ok.pdf');
    await expect(page.locator('.inspector .hint.ok')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vista drög' })).toBeEnabled();
  });

  test('a validation error is clickable and selects the offending item', async ({ page }) => {
    await openEditor(page);
    await selectItem(page, 'Innkaupastefna');
    await page.locator('#f-name').fill('');

    const issue = page.locator('.issue--bad .issue-link').first();
    await expect(issue).toBeVisible();
    await selectItem(page, 'Vafrakökustefna');        // move the selection away
    await issue.click();
    await expect(page.locator('.tree-row.is-selected')).toHaveAttribute('id', 'tree-innkaupastefna');
  });

  test('explains that the browser cannot check links itself', async ({ page }) => {
    await openEditor(page);
    await selectItem(page, 'Innkaupastefna');
    await expect(page.locator('.inspector')).toContainText('CORS');
    await expect(page.locator('.inspector')).toContainText('Birta');
  });
});

test.describe('structure', () => {
  test('adding a column re-routes the connectors with no code change', async ({ page }) => {
    await openEditor(page);
    const ticksBefore = await page.locator('#forskodun .lines line[data-role="tick"]').count();

    await page.getByRole('button', { name: '+ dálkur' }).click();
    await expect(page.locator('#forskodun .col')).toHaveCount(6);
    await expect.poll(
      () => page.locator('#forskodun .lines line[data-role="tick"]').count(),
      { timeout: 5000 },
    ).toBe(ticksBefore + 1);

    // every tick still lands on a column centre
    const geometry = await page.locator('#forskodun').evaluate((host) => {
      const root = host.shadowRoot.querySelector('.root').getBoundingClientRect();
      const centres = [...host.shadowRoot.querySelectorAll('.col')]
        .map((c) => { const r = c.getBoundingClientRect(); return r.left - root.left + r.width / 2; });
      const ticks = [...host.shadowRoot.querySelectorAll('.lines line')]
        .filter((l) => l.dataset.role === 'tick').map((l) => +l.getAttribute('x1'));
      return { centres, ticks };
    });
    for (const centre of geometry.centres) {
      expect(geometry.ticks.some((x) => Math.abs(x - centre) < 1.5)).toBe(true);
    }
  });

  test('deleting a card removes it from the preview', async ({ page }) => {
    await openEditor(page);
    const row = page.locator('.tree-row', { hasText: 'Mannauðsmál' }).first();
    await row.hover();
    await row.getByRole('button', { name: 'Eyða' }).click();
    await expect(page.locator('#forskodun .card')).toHaveCount(5);
  });

  test('duplicating gives the copy a new id', async ({ page }) => {
    await openEditor(page);
    const row = page.locator('.tree-row', { hasText: 'Innkaupastefna' }).first();
    await row.hover();
    await row.getByRole('button', { name: 'Tvöfalda' }).click();

    const ids = await page.locator('#forskodun .item-link').evaluateAll((nodes) => nodes.map((n) => n.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith('innkaupastefna')).length).toBe(2);
  });

  test('the up and down buttons reorder without a mouse drag', async ({ page }) => {
    await openEditor(page);
    const row = page.locator('.tree-row', { hasText: 'Innkaupastefna' }).first();
    await row.hover();
    await row.getByRole('button', { name: 'Færa niður' }).click();

    const labels = await page.locator('#forskodun #stjornsysla .label').allInnerTexts();
    expect(labels[0]).toContain('Persónuverndarstefna');
    expect(labels[1]).toContain('Innkaupastefna');
  });
});

test.describe('undo and redo', () => {
  test('the buttons step backwards and forwards', async ({ page }) => {
    await openEditor(page);
    await selectItem(page, 'Innkaupastefna');
    await page.locator('#f-name').fill('Breytt');
    await expect(page.locator('#forskodun #innkaupastefna')).toContainText('Breytt');

    await page.getByRole('button', { name: 'Afturkalla' }).click();
    await expect(page.locator('#forskodun #innkaupastefna')).toContainText('Innkaupastefna');

    await page.getByRole('button', { name: 'Endurtaka' }).click();
    await expect(page.locator('#forskodun #innkaupastefna')).toContainText('Breytt');
  });

  test('Ctrl+Z and Ctrl+Shift+Z do the same', async ({ page }) => {
    await openEditor(page);
    const row = page.locator('.tree-row', { hasText: 'Innkaupastefna' }).first();
    await row.hover();
    await row.getByRole('button', { name: 'Tvöfalda' }).click();
    await expect(page.locator('#forskodun #stjornsysla .item')).toHaveCount(9);

    await page.keyboard.press('Control+z');
    await expect(page.locator('#forskodun #stjornsysla .item')).toHaveCount(8);

    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('#forskodun #stjornsysla .item')).toHaveCount(9);
  });

  test('undo is disabled until there is something to undo', async ({ page }) => {
    await openEditor(page);
    await expect(page.getByRole('button', { name: 'Afturkalla' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Endurtaka' })).toBeDisabled();
  });
});

test.describe('autosave', () => {
  test('saves to this device and says when, on a 24-hour clock', async ({ page }) => {
    await openEditor(page);
    await selectItem(page, 'Innkaupastefna');
    await page.locator('#f-name').fill('Vistað sjálfkrafa');

    await expect(page.locator('.save-status')).toContainText(/Vistað á þessu tæki \d{2}:\d{2}/, { timeout: 5000 });
  });

  test('the draft survives a reload', async ({ page }) => {
    await openEditor(page);
    await selectItem(page, 'Innkaupastefna');
    await page.locator('#f-name').fill('Lifir af endurhleðslu');
    await expect(page.locator('.save-status')).toContainText(/Vistað á þessu tæki/, { timeout: 5000 });

    await page.reload();
    await page.getByLabel(/Aðgangslykill/).fill('test-token-publisher');
    await page.getByRole('button', { name: 'Skrá inn' }).click();
    await page.getByRole('heading', { name: 'Yfirlit' }).waitFor();
    await page.getByRole('button', { name: 'Ritstjóri', exact: true }).click();

    await expect(page.locator('#forskodun #innkaupastefna')).toContainText('Lifir af endurhleðslu');
    await expect(page.locator('.save-status')).toContainText('endurheimt');
  });

  test('a draft is keyed per person, so one does not load another’s work', async ({ page }) => {
    await openEditor(page, 'test-token-publisher');
    await selectItem(page, 'Innkaupastefna');
    await page.locator('#f-name').fill('Vinna Arons');
    await expect(page.locator('.save-status')).toContainText(/Vistað á þessu tæki/, { timeout: 5000 });

    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.some((k) => k.startsWith('stefnurit-draft:aron5109@'))).toBe(true);
    expect(keys.some((k) => k.startsWith('stefnurit-draft:ritstjori@'))).toBe(false);
  });
});

test.describe('saving a draft to GitHub', () => {
  test('writes the branch and reports the time', async ({ page }) => {
    await openEditor(page);
    await selectItem(page, 'Innkaupastefna');
    await page.locator('#f-name').fill('Vistað á GitHub');
    await page.getByRole('button', { name: 'Vista drög' }).click();

    await expect(page.locator('.save-status')).toContainText(/Drög vistuð á GitHub kl\. \d{2}:\d{2}/, { timeout: 10_000 });

    const state = await (await fetch(`${mockOrigin}/__mock/state`)).json();
    expect(state.branches).toContain('stefnurit/draft-aron5109');
  });

  test('the saved draft is in the canonical format', async ({ page }) => {
    await openEditor(page);
    await selectItem(page, 'Innkaupastefna');
    await page.locator('#f-name').fill('Snið');
    await page.getByRole('button', { name: 'Vista drög' }).click();
    await expect(page.locator('.save-status')).toContainText(/Drög vistuð/, { timeout: 10_000 });

    const saved = await page.evaluate(async () => {
      const response = await fetch(
        'https://api.github.com/repos/Reykjanesbaer/stefnurit/contents/src/data/stefnurit.json?ref=stefnurit%2Fdraft-aron5109',
        { headers: { authorization: 'Bearer test-token-publisher' } },
      );
      const data = await response.json();
      return new TextDecoder().decode(Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0)));
    });
    expect(saved.endsWith('\n')).toBe(true);
    expect(saved).toBe(JSON.stringify(JSON.parse(saved), null, 2) + '\n');
  });

  // The case optimistic concurrency exists for.
  test('a concurrent edit to a different field merges without asking', async ({ page }) => {
    await openEditor(page);
    await selectItem(page, 'Innkaupastefna');
    await page.locator('#f-name').fill('Mín breyting');
    await page.getByRole('button', { name: 'Vista drög' }).click();
    await expect(page.locator('.save-status')).toContainText(/Drög vistuð/, { timeout: 10_000 });

    // Somebody else changes a different item on the same branch.
    const theirs = await page.evaluate(async () => {
      const read = await fetch(
        'https://api.github.com/repos/Reykjanesbaer/stefnurit/contents/src/data/stefnurit.json?ref=stefnurit%2Fdraft-aron5109',
        { headers: { authorization: 'Bearer test-token-publisher' } },
      );
      const data = await read.json();
      const text = new TextDecoder().decode(Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0)));
      const document_ = JSON.parse(text);
      document_.sections[2].columns[0].cards[0].items[5].label = 'Þeirra breyting';
      return JSON.stringify(document_, null, 2) + '\n';
    });
    await fetch(`${mockOrigin}/__mock/control`, {
      method: 'POST', body: JSON.stringify({ concurrentWrite: theirs }),
    });

    await selectItem(page, 'Persónuverndarstefna');
    await page.locator('#f-name').fill('Önnur breyting hjá mér');
    await page.getByRole('button', { name: 'Vista drög' }).click();

    await expect(page.locator('.save-status')).toContainText(/sameinaðar sjálfkrafa/, { timeout: 10_000 });
    await expect(page.locator('#forskodun')).toContainText('Þeirra breyting');
    await expect(page.locator('#forskodun')).toContainText('Önnur breyting hjá mér');
  });

  test('a real disagreement opens the conflict dialog with both values', async ({ page }) => {
    await openEditor(page);
    await selectItem(page, 'Innkaupastefna');
    await page.locator('#f-name').fill('Mín útgáfa');
    await page.getByRole('button', { name: 'Vista drög' }).click();
    await expect(page.locator('.save-status')).toContainText(/Drög vistuð/, { timeout: 10_000 });

    const theirs = await page.evaluate(async () => {
      const read = await fetch(
        'https://api.github.com/repos/Reykjanesbaer/stefnurit/contents/src/data/stefnurit.json?ref=stefnurit%2Fdraft-aron5109',
        { headers: { authorization: 'Bearer test-token-publisher' } },
      );
      const data = await read.json();
      const text = new TextDecoder().decode(Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0)));
      const document_ = JSON.parse(text);
      document_.sections[2].columns[0].cards[0].items[0].label = 'Þeirra útgáfa';
      return JSON.stringify(document_, null, 2) + '\n';
    });
    await fetch(`${mockOrigin}/__mock/control`, {
      method: 'POST', body: JSON.stringify({ concurrentWrite: theirs }),
    });

    await page.locator('#f-name').fill('Mín útgáfa, breytt aftur');
    await page.getByRole('button', { name: 'Vista drög' }).click();

    const dialog = page.locator('.conflict-dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText('Einhver annar breytti skjalinu á meðan');
    await expect(dialog).toContainText('Mín útgáfa, breytt aftur');
    await expect(dialog).toContainText('Þeirra útgáfa');

    await dialog.getByText('Nota þeirra breytingu').click();
    await dialog.getByRole('button', { name: /Nota valið/ }).click();
    await expect(page.locator('#forskodun #innkaupastefna')).toContainText('Þeirra útgáfa');
  });

  test('cancelling the conflict dialog keeps my work untouched', async ({ page }) => {
    await openEditor(page);
    await selectItem(page, 'Innkaupastefna');
    await page.locator('#f-name').fill('Mitt');
    await page.getByRole('button', { name: 'Vista drög' }).click();
    await expect(page.locator('.save-status')).toContainText(/Drög vistuð/, { timeout: 10_000 });

    const theirs = await page.evaluate(async () => {
      const read = await fetch(
        'https://api.github.com/repos/Reykjanesbaer/stefnurit/contents/src/data/stefnurit.json?ref=stefnurit%2Fdraft-aron5109',
        { headers: { authorization: 'Bearer test-token-publisher' } },
      );
      const data = await read.json();
      const text = new TextDecoder().decode(Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0)));
      const document_ = JSON.parse(text);
      document_.sections[2].columns[0].cards[0].items[0].label = 'Þeirra';
      return JSON.stringify(document_, null, 2) + '\n';
    });
    await fetch(`${mockOrigin}/__mock/control`, {
      method: 'POST', body: JSON.stringify({ concurrentWrite: theirs }),
    });

    await page.locator('#f-name').fill('Mitt aftur');
    await page.getByRole('button', { name: 'Vista drög' }).click();
    await expect(page.locator('.conflict-dialog')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Hætta við' }).click();
    await expect(page.locator('.conflict-dialog')).toHaveCount(0);
    await expect(page.locator('#forskodun #innkaupastefna')).toContainText('Mitt aftur');
    await expect(page.locator('.save-status')).toContainText('óskemmdar');
  });
});

test.describe('preview widths', () => {
  test('switching to Sími stacks the layout', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Sími', exact: true }).click();

    await expect.poll(async () => page.locator('#forskodun').evaluate((host) =>
      [...host.shadowRoot.querySelectorAll('.lines line')].map((l) => l.dataset.role).join(',')),
    { timeout: 5000 }).toContain('rail');

    const roles = await page.locator('#forskodun').evaluate((host) =>
      [...host.shadowRoot.querySelectorAll('.lines line')].map((l) => l.dataset.role));
    expect(roles).not.toContain('trunk');
  });

  test('switching back to Breitt restores the column tree', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Sími', exact: true }).click();
    await page.getByRole('button', { name: 'Breitt', exact: true }).click();

    await expect.poll(async () => page.locator('#forskodun').evaluate((host) =>
      [...host.shadowRoot.querySelectorAll('.lines line')].map((l) => l.dataset.role).join(',')),
    { timeout: 5000 }).toContain('trunk');
  });
});

test.describe('accessibility', () => {
  test('the editor has no serious or critical violations', async ({ page }) => {
    await openEditor(page);
    const results = await new AxeBuilder({ page }).exclude('#forskodun').analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('the conflict dialog has no serious or critical violations', async ({ page }) => {
    await openEditor(page);
    await selectItem(page, 'Innkaupastefna');
    await page.locator('#f-name').fill('A');
    await page.getByRole('button', { name: 'Vista drög' }).click();
    await expect(page.locator('.save-status')).toContainText(/Drög vistuð/, { timeout: 10_000 });

    const theirs = await page.evaluate(async () => {
      const read = await fetch(
        'https://api.github.com/repos/Reykjanesbaer/stefnurit/contents/src/data/stefnurit.json?ref=stefnurit%2Fdraft-aron5109',
        { headers: { authorization: 'Bearer test-token-publisher' } },
      );
      const data = await read.json();
      const text = new TextDecoder().decode(Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0)));
      const document_ = JSON.parse(text);
      document_.sections[2].columns[0].cards[0].items[0].label = 'B';
      return JSON.stringify(document_, null, 2) + '\n';
    });
    await fetch(`${mockOrigin}/__mock/control`, { method: 'POST', body: JSON.stringify({ concurrentWrite: theirs }) });

    await page.locator('#f-name').fill('C');
    await page.getByRole('button', { name: 'Vista drög' }).click();
    await expect(page.locator('.conflict-dialog')).toBeVisible({ timeout: 10_000 });

    const results = await new AxeBuilder({ page }).include('.conflict-dialog').analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
