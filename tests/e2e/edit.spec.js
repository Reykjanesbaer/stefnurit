import { test, expect } from '@playwright/test';

/** Geometry of the live connector tree, measured from the shadow DOM. */
async function geometry(page) {
  return page.locator('stefnu-rit').evaluate((el) => {
    const root = el.shadowRoot.querySelector('.root').getBoundingClientRect();
    const rel = (r) => ({ x: r.left - root.left, y: r.top - root.top, w: r.width, h: r.height });
    return {
      columns: [...el.shadowRoot.querySelectorAll('.col')].map((c) => rel(c.getBoundingClientRect())),
      cards: [...el.shadowRoot.querySelectorAll('.card')].map((c) => rel(c.getBoundingClientRect())),
      lines: [...el.shadowRoot.querySelectorAll('.lines line')].map((l) => ({
        role: l.dataset.role,
        x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'),
        x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2'),
      })),
    };
  });
}

/**
 * The invariants that must hold however many columns there are: one tick per
 * column, each on its centre and touching its card band; a rail that spans
 * exactly the outer two; and no two lines doubling up on the same run.
 */
function expectConsistent(g) {
  const ticks = g.lines.filter((l) => l.role === 'tick');
  const rails = g.lines.filter((l) => l.role === 'rail');

  expect(ticks).toHaveLength(g.columns.length);

  const centres = g.columns.map((c) => c.x + c.w / 2).sort((a, b) => a - b);
  for (const centre of centres) {
    expect(ticks.some((t) => Math.abs(t.x1 - centre) < 1.5), `no tick at ${centre}`).toBe(true);
  }
  for (const tick of ticks) {
    const nearest = Math.min(...g.columns.map((c) => Math.abs(tick.y2 - c.y)));
    expect(nearest, 'tick does not meet its card').toBeLessThan(1);
  }

  expect(rails).toHaveLength(1);
  expect(Math.abs(rails[0].x1 - centres[0])).toBeLessThan(1.5);
  expect(Math.abs(rails[0].x2 - centres.at(-1))).toBeLessThan(1.5);

  // Doubled strokes: two lines sharing a run would paint twice.
  const keys = g.lines.map((l) => `${l.role}:${l.x1.toFixed(1)},${l.y1.toFixed(1)},${l.x2.toFixed(1)},${l.y2.toFixed(1)}`);
  expect(new Set(keys).size).toBe(keys.length);
}

test.describe('edit mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.goto('/demo/edit.html');
    // Clear once, then reload — an initScript would wipe the draft on every
    // navigation, including the reload the draft test depends on.
    await page.evaluate(() => { try { localStorage.clear(); } catch { /* ignore */ } });
    await page.reload();
    await expect(page.locator('stefnu-rit .card')).toHaveCount(6);
  });

  test('starts from the committed document', async ({ page }) => {
    await expect(page.locator('stefnu-rit .col')).toHaveCount(5);
    await expect(page.locator('#status')).toContainText('Engar breytingar');
  });

  test('adding a column re-routes the lines with no code change', async ({ page }) => {
    const before = await geometry(page);
    expectConsistent(before);

    await page.getByRole('button', { name: '+ dálkur' }).click();
    await expect(page.locator('stefnu-rit .col')).toHaveCount(6);

    const after = await geometry(page);
    expectConsistent(after);
    // the rail really did grow to reach the new column
    const railBefore = before.lines.find((l) => l.role === 'rail');
    const railAfter = after.lines.find((l) => l.role === 'rail');
    expect(railAfter.x2).toBeGreaterThan(railBefore.x2 - 1);
  });

  test('adding a card to a column keeps the column consistent', async ({ page }) => {
    await page.getByRole('button', { name: '+ flokkur' }).first().click();
    await expect(page.locator('stefnu-rit .card')).toHaveCount(7);
    expectConsistent(await geometry(page));
  });

  test('deleting the middle column leaves no dangling line', async ({ page }) => {
    const rows = page.locator('.row', { hasText: 'Dálkur 3' }).first();
    await rows.hover();
    await rows.getByTitle('Eyða').click();

    await expect(page.locator('stefnu-rit .col')).toHaveCount(4);
    const after = await geometry(page);
    expectConsistent(after);
    expect(after.lines.filter((l) => l.role === 'tick')).toHaveLength(4);
  });

  test('editing a label changes only that item', async ({ page }) => {
    await page.locator('.row .name', { hasText: 'Innkaupastefna' }).first().click();
    const field = page.locator('#f-label');
    await field.fill('Innkaupastefna 2026');

    await expect(page.locator('stefnu-rit #innkaupastefna')).toContainText('Innkaupastefna 2026');
    await expect(page.locator('stefnu-rit #vafrakokustefna')).toContainText('Vafrakökustefna');
    await expect(page.locator('#status')).toContainText('Óvistaðar breytingar');
  });

  test('editing a link changes only that href', async ({ page }) => {
    await page.locator('.row .name', { hasText: 'Vafrakökustefna' }).first().click();
    await page.locator('#f-href').fill('https://www.reykjanesbaer.is/ny-vafrakokustefna.pdf');

    await expect(page.locator('stefnu-rit #vafrakokustefna'))
      .toHaveAttribute('href', 'https://www.reykjanesbaer.is/ny-vafrakokustefna.pdf');
    await expect(page.locator('stefnu-rit #innkaupastefna'))
      .toHaveAttribute('href', /innkaupastefna-reykjanesbaejar\.pdf$/);
  });

  test('a bad link is called out before it can be published', async ({ page }) => {
    await page.locator('.row .name', { hasText: 'Vafrakökustefna' }).first().click();
    await page.locator('#f-href').fill('reykjanesbaer.is/skjal.pdf');
    await expect(page.locator('#f-href ~ .hint, .field .hint').first()).toHaveClass(/bad/);

    await page.locator('#f-href').fill('http://www.reykjanesbaer.is/skjal.pdf');
    await expect(page.locator('.field .hint').first()).toHaveClass(/warn/);

    await page.locator('#f-href').fill('https://www.reykjanesbaer.is/skjal.pdf');
    await expect(page.locator('.field .hint').first()).toHaveClass(/ok/);
  });

  test('an item with no link renders as plain, unclickable text', async ({ page }) => {
    await page.locator('.row .name', { hasText: 'Vafrakökustefna' }).first().click();
    await page.locator('#f-href').fill('');
    const box = page.locator('stefnu-rit #vafrakokustefna');
    await expect(box).toHaveAttribute('aria-disabled', 'true');
    expect(await box.evaluate((el) => el.tagName)).toBe('SPAN');
  });

  test('reordering an item moves it in the widget too', async ({ page }) => {
    const first = page.locator('.row', { hasText: 'Innkaupastefna' }).first();
    await first.hover();
    await first.getByTitle('Færa niður').click();

    const labels = await page.locator('stefnu-rit #stjornsysla .label').allInnerTexts();
    expect(labels[0]).toContain('Persónuverndarstefna');
    expect(labels[1]).toContain('Innkaupastefna');
  });

  test('duplicating gives the copy its own id', async ({ page }) => {
    const row = page.locator('.row', { hasText: 'Innkaupastefna' }).first();
    await row.hover();
    await row.getByTitle('Tvöfalda').click();

    await expect(page.locator('stefnu-rit #stjornsysla .item')).toHaveCount(9);
    const ids = await page.locator('stefnu-rit #stjornsysla .item-link')
      .evaluateAll((nodes) => nodes.map((n) => n.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('reset restores the saved document', async ({ page }) => {
    await page.locator('.row .name', { hasText: 'Innkaupastefna' }).first().click();
    await page.locator('#f-label').fill('Breytt');
    await expect(page.locator('#status')).toContainText('Óvistaðar breytingar');

    await page.getByRole('button', { name: 'Núllstilla' }).click();
    await expect(page.locator('stefnu-rit #innkaupastefna')).toContainText('Innkaupastefna');
  });

  test('an untouched document downloads byte-identical to the committed file', async ({ page, request }) => {
    const committed = await (await request.get('/src/data/stefnurit.json')).text();
    const produced = await page.evaluate(async () => {
      const { formatJson } = await import('../src/format.js');
      const response = await fetch('../src/data/stefnurit.json');
      return formatJson(await response.json());
    });
    expect(produced).toBe(committed);
  });

  test('the draft survives a reload, and reset clears it', async ({ page }) => {
    await page.locator('.row .name', { hasText: 'Innkaupastefna' }).first().click();
    await page.locator('#f-label').fill('Dróg');
    await page.reload();
    await expect(page.locator('stefnu-rit #innkaupastefna')).toContainText('Dróg');

    await page.getByRole('button', { name: 'Núllstilla' }).click();
    await page.reload();
    await expect(page.locator('stefnu-rit #innkaupastefna')).toContainText('Innkaupastefna');
  });
});
