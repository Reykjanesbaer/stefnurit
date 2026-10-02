import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../../src/data/stefnurit.json', import.meta.url), 'utf8'));

/** The 21 document links inside the cards. */
const cardItems = () => data.sections
  .filter((s) => s.kind === 'columns')
  .flatMap((s) => s.columns.flatMap((c) => c.cards.flatMap((card) => card.items)));

/** The 3 pills: the root and the two second-level policies. */
const pillItems = () => data.sections
  .filter((s) => s.kind !== 'columns')
  .flatMap((s) => s.items);

const allItems = () => [...pillItems(), ...cardItems()];

/** Wait until the component has rendered and stroked its connectors. */
async function ready(page) {
  await page.waitForFunction(
    () => (document.querySelector('stefnu-rit')?.shadowRoot?.querySelectorAll('.card').length ?? 0) > 0,
  );
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.locator('stefnu-rit').evaluate(
    (el) => el.shadowRoot.querySelectorAll('.lines line').length,
  )).toBeGreaterThan(0);
}

test.describe('rendering', () => {
  for (const width of [1440, 1024, 390]) {
    test(`renders every card and link at ${width}px`, async ({ page }) => {
      const problems = [];
      page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
      page.on('pageerror', (e) => problems.push(String(e)));

      await page.setViewportSize({ width, height: 1200 });
      await page.goto('/demo/index.html');
      await ready(page);

      const host = page.locator('stefnu-rit');
      await expect(host.locator('.card')).toHaveCount(6);
      await expect(host.locator('.item-link')).toHaveCount(cardItems().length);
      await expect(host.locator('.pill')).toHaveCount(3);
      expect(problems).toEqual([]);
    });
  }

  test('each link carries the href from the JSON and opens safely', async ({ page }) => {
    await page.goto('/demo/index.html');
    await ready(page);
    const host = page.locator('stefnu-rit');

    for (const item of allItems()) {
      const link = host.locator(`[id="${item.id}"]`);
      await expect(link).toHaveAttribute('href', item.href);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      await expect(link).toHaveText(new RegExp(item.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  test('the shipped font covers the whole Icelandic alphabet', async ({ page }) => {
    await page.goto('/demo/index.html');
    await ready(page);
    // Asking the font directly beats eyeballing: check() is false if any
    // character in the string would fall back to another family.
    const covered = await page.evaluate(() =>
      document.fonts.check('700 22px Figtree', 'áðéíóúýþæöÁÐÉÍÓÚÝÞÆÖ'));
    expect(covered).toBe(true);
  });

  test('Icelandic text is rendered exactly as written in the JSON', async ({ page }) => {
    await page.goto('/demo/index.html');
    await ready(page);
    const text = await page.locator('stefnu-rit').evaluate((el) => el.shadowRoot.textContent);
    for (const label of allItems().map((i) => i.label)) {
      expect(text, `missing "${label}"`).toContain(label);
    }
    expect(text).toContain('Þjónustu- og gæðastefna');
    expect(text).toContain('Stefna Reykjanesbæjar í skjalamálum');
  });

  test('keyboard order follows the visual order', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto('/demo/index.html');
    await ready(page);

    // For a column layout, reading order is: down a column, then the next one.
    // So the sequence of (column index, y) along the tab order must never go
    // backwards.
    const order = await page.locator('stefnu-rit').evaluate((el) => {
      const columns = [...el.shadowRoot.querySelectorAll('.col')];
      return [...el.shadowRoot.querySelectorAll('.card a[href]')].map((node) => ({
        id: node.id,
        column: columns.findIndex((c) => c.contains(node)),
        y: Math.round(node.getBoundingClientRect().y),
      }));
    });

    expect(order.length).toBe(21);
    for (let i = 1; i < order.length; i += 1) {
      const previous = order[i - 1];
      const current = order[i];
      expect(current.column, `${previous.id} -> ${current.id}`).toBeGreaterThanOrEqual(previous.column);
      if (current.column === previous.column) {
        expect(current.y, `${previous.id} -> ${current.id}`).toBeGreaterThanOrEqual(previous.y);
      }
    }
  });

  // Covers both shapes: the element has to reserve roughly the right box before
  // the JSON arrives, or everything below it jumps when the content lands.
  // Typically measures ~0.002; the bound is 0.05 because the webfont swap lands
  // at a different moment on a loaded machine, and Core Web Vitals calls
  // anything up to 0.1 good — a tighter number here only buys flakiness.
  for (const width of [1440, 1200, 390]) {
    test(`no layout shift on load at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1200 });
      await page.goto('/demo/index.html');
      const shift = await page.evaluate(() => new Promise((resolve) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) total += entry.value;
        }).observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => resolve(total), 1500);
      }));
      expect(shift).toBeLessThan(0.05);
    });
  }

  test('works inside an iframe', async ({ page }) => {
    await page.setContent(`<iframe src="http://127.0.0.1:8777/demo/index.html" width="1200" height="900" style="border:0"></iframe>`);
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('stefnu-rit .card')).toHaveCount(6, { timeout: 15_000 });
  });
});

test.describe('connector lines', () => {
  test('the rail spans the outer columns and every column has one tick', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto('/demo/index.html');
    await ready(page);

    const geometry = await page.locator('stefnu-rit').evaluate((el) => {
      const root = el.shadowRoot.querySelector('.root').getBoundingClientRect();
      const columns = [...el.shadowRoot.querySelectorAll('.col')].map((c) => {
        const r = c.getBoundingClientRect();
        return r.left - root.left + r.width / 2;
      });
      const lines = [...el.shadowRoot.querySelectorAll('.lines line')].map((l) => ({
        role: l.dataset.role,
        x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'),
        x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2'),
      }));
      return { columns, lines };
    });

    const ticks = geometry.lines.filter((l) => l.role === 'tick');
    expect(ticks).toHaveLength(geometry.columns.length);
    for (const centre of geometry.columns) {
      expect(ticks.some((t) => Math.abs(t.x1 - centre) < 1.5)).toBe(true);
    }

    const rail = geometry.lines.find((l) => l.role === 'rail');
    expect(Math.abs(rail.x1 - Math.min(...geometry.columns))).toBeLessThan(1.5);
    expect(Math.abs(rail.x2 - Math.max(...geometry.columns))).toBeLessThan(1.5);
  });

  test('ticks meet the cards exactly — no gap, no overshoot', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto('/demo/index.html');
    await ready(page);

    const deltas = await page.locator('stefnu-rit').evaluate((el) => {
      const root = el.shadowRoot.querySelector('.root').getBoundingClientRect();
      const tops = [...el.shadowRoot.querySelectorAll('.col')]
        .map((c) => c.getBoundingClientRect().top - root.top);
      return [...el.shadowRoot.querySelectorAll('.lines line')]
        .filter((l) => l.dataset.role === 'tick')
        .map((l) => Math.min(...tops.map((t) => Math.abs(+l.getAttribute('y2') - t))));
    });
    for (const delta of deltas) expect(delta).toBeLessThan(1);
  });

  test('the narrow layout swaps the elbows for a single rail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1400 });
    await page.goto('/demo/index.html');
    await ready(page);

    const roles = await page.locator('stefnu-rit').evaluate(
      (el) => [...el.shadowRoot.querySelectorAll('.lines line')].map((l) => l.dataset.role),
    );
    expect(roles).toContain('rail');
    expect(roles).toContain('tick');
    expect(roles).not.toContain('trunk');
    expect(roles).not.toContain('branch');
  });

  test('no text is smaller than 12px at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1400 });
    await page.goto('/demo/index.html');
    await ready(page);
    const sizes = await page.locator('stefnu-rit').evaluate((el) =>
      [...el.shadowRoot.querySelectorAll('.label, .card-title, .pill')]
        .map((n) => parseFloat(getComputedStyle(n).fontSize)));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });
});

test.describe('accessibility', () => {
  test('the only serious finding is the teal contrast carried over from the design', async ({ page }) => {
    await page.goto('/demo/index.html');
    await ready(page);
    const results = await new AxeBuilder({ page }).include('stefnu-rit').analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    // #009EBF with white text is 3.1:1. It is the Canva design's own colour and
    // is kept by default for fidelity; the theme below clears it.
    expect(serious.map((v) => v.id).sort()).toEqual(['color-contrast']);
  });

  test('the AA theme clears it completely', async ({ page }) => {
    await page.goto('/demo/index.html');
    await ready(page);
    await page.evaluate(() => {
      document.querySelector('stefnu-rit').style.setProperty('--sr-color-accent', '#007E99');
    });
    const results = await new AxeBuilder({ page }).include('stefnu-rit').analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(serious).toEqual([]);
  });

  test('every link announces its own label', async ({ page }) => {
    await page.goto('/demo/index.html');
    await ready(page);
    const names = await page.locator('stefnu-rit').evaluate(
      (el) => [...el.shadowRoot.querySelectorAll('a')].map((a) => a.textContent.trim()),
    );
    expect(names.every((n) => n.length > 1)).toBe(true);
    expect(new Set(names).size).toBe(names.length); // no two links read the same
  });
});
