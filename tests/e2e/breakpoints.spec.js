import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The widget at the widths a page actually gives it. 923px is the one that
 * motivated this file: a 923px content column used to get the phone layout.
 */
// The demo page frames the widget with its own margins; strip them so the
// widget gets the whole viewport, as it does in an embed.
const BARE = `
  .page { max-width: none !important; padding: 0 !important; }
  .frame { border-radius: 0 !important; box-shadow: none !important; overflow: visible !important; }
  h1, .lead, .controls, .note { display: none !important; }
  body { background: #fff !important; }
`;

const open = async (page, width) => {
  await page.setViewportSize({ width, height: 1200 });
  await page.goto('/demo/index.html');
  await page.addStyleTag({ content: BARE });
  await page.waitForFunction(() => document.querySelector('stefnu-rit')?.shadowRoot?.querySelectorAll('.card').length > 0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  // A test at "923px" that measured a 880px widget would pass for the wrong
  // reason, so say so loudly instead.
  expect(await widgetWidth(page), `the widget should fill a ${width}px viewport`).toBe(width);
};

const widgetWidth = (page) => page.locator('stefnu-rit').evaluate((el) => Math.round(el.getBoundingClientRect().width));

const facts = (page) => page.locator('stefnu-rit').evaluate((host) => {
  const root = host.shadowRoot;
  const grid = root.querySelector('.grid');
  const labels = [...root.querySelectorAll('.label')];
  return {
    hostWidth: Math.round(host.getBoundingClientRect().width),
    columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    stacked: getComputedStyle(grid).display === 'block',
    padLeft: parseFloat(getComputedStyle(root.querySelector('.root')).paddingLeft),
    padRight: parseFloat(getComputedStyle(root.querySelector('.root')).paddingRight),
    minFont: Math.min(...labels.map((l) => parseFloat(getComputedStyle(l).fontSize))),
    outside: labels.filter((l) => {
      const card = l.closest('.card');
      if (!card) return false;
      const c = card.getBoundingClientRect();
      const r = l.getBoundingClientRect();
      return r.right > c.right + 1 || r.left < c.left - 1;
    }).length,
    seams: root.querySelectorAll('.seam').length,
    lines: [...root.querySelectorAll('.lines line')].map((l) => l.dataset.role),
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

test.describe('923px', () => {
  test('is the full five-column tree, not the phone layout', async ({ page }) => {
    await open(page, 923);
    const f = await facts(page);
    expect(f.stacked).toBe(false);
    expect(f.columns).toBe(5);
    expect(f.lines.filter((r) => r === 'tick')).toHaveLength(5);
    expect(f.lines).toContain('trunk');
  });

  test('keeps only 0.15px of padding left and right', async ({ page }) => {
    await open(page, 923);
    const f = await facts(page);
    expect(f.padLeft).toBeCloseTo(0.15, 2);
    expect(f.padRight).toBeCloseTo(0.15, 2);
  });

  test('one pixel narrower it stacks', async ({ page }) => {
    await open(page, 922);
    const f = await facts(page);
    expect(f.stacked).toBe(true);
    expect(f.lines).not.toContain('trunk');
  });

  test('never shrinks type below 15px or lets a label leave its card', async ({ page }) => {
    await open(page, 923);
    const f = await facts(page);
    expect(f.minFont).toBeGreaterThanOrEqual(15);
    expect(f.outside).toBe(0);
    expect(f.pageOverflow).toBe(0);
  });

  test('long words break at their seams, never mid-syllable', async ({ page }) => {
    await open(page, 923);
    const broken = await page.locator('stefnu-rit').evaluate((host) => {
      const bad = [];
      for (const label of host.shadowRoot.querySelectorAll('.label')) {
        const chars = [];
        const seams = new Set();
        const walk = (node) => {
          for (const child of node.childNodes) {
            if (child.nodeType === 3) for (let i = 0; i < child.data.length; i += 1) chars.push([child, i]);
            else if (child.classList?.contains('seam')) seams.add(chars.length);
            else if (child.nodeType === 1 && child.tagName.toLowerCase() !== 'svg') walk(child);
          }
        };
        walk(label);
        let top = null;
        chars.forEach(([node, i], index) => {
          const range = document.createRange();
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const rect = range.getClientRects()[0];
          if (!rect) return;
          const y = Math.round(rect.top);
          if (top !== null && y > top + 3 && index > 0) {
            const before = chars[index - 1][0].data[chars[index - 1][1]];
            const ok = /\s/.test(before) || /\s/.test(node.data[i]) || before === '-' || seams.has(index);
            if (!ok) bad.push(label.textContent.trim());
          }
          top = y;
        });
      }
      return bad;
    });
    expect(broken).toEqual([]);
  });

  test('the text itself is unchanged by the seams', async ({ page }) => {
    await open(page, 923);
    const texts = await page.locator('stefnu-rit').evaluate((host) =>
      [...host.shadowRoot.querySelectorAll('a.item-link .label')].map((l) => l.textContent.replace(/ /g, ' ').trim()));
    expect(texts).toContain('Upplýsingaöryggisstefna');
    expect(texts).toContain('Persónuverndarstefna');
    expect(texts.join('')).not.toContain('­');
  });

  test('the link is still announced by its full label', async ({ page }) => {
    await open(page, 923);
    await expect(page.locator('stefnu-rit').getByRole('link', { name: 'Upplýsingaöryggisstefna' })).toHaveCount(1);
  });

  test('has no serious accessibility violations', async ({ page }) => {
    await open(page, 923);
    const results = await new AxeBuilder({ page }).include('stefnu-rit')
      .disableRules(['color-contrast']).analyze();   // the teal is covered in render.spec.js
    expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
  });
});

test.describe('seams follow the width', () => {
  test('are absent from the signed-off layout, so it stays pixel-identical', async ({ page }) => {
    await open(page, 1440);
    expect((await facts(page)).seams).toBe(0);
    await open(page, 1850);
    expect((await facts(page)).seams).toBe(0);
  });

  test('appear when the window narrows and go again when it widens', async ({ page }) => {
    await open(page, 1440);
    expect((await facts(page)).seams).toBe(0);

    await page.setViewportSize({ width: 923, height: 1200 });
    await expect.poll(async () => (await facts(page)).seams).toBeGreaterThan(0);

    await page.setViewportSize({ width: 1440, height: 1200 });
    await expect.poll(async () => (await facts(page)).seams).toBe(0);
  });

  test('every width from 923 to 1399 keeps five columns, inside their cards, at 15px or more', async ({ page }) => {
    for (const width of [923, 1000, 1100, 1239, 1240, 1366, 1399]) {
      await open(page, width);
      const f = await facts(page);
      expect(f.columns, `${width}px`).toBe(5);
      expect(f.outside, `${width}px`).toBe(0);
      expect(f.minFont, `${width}px`).toBeGreaterThanOrEqual(15);
    }
  });
});
