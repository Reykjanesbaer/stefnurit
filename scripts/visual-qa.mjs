#!/usr/bin/env node
/**
 * Render the widget at the widths that matter and write them out for review.
 *
 * Run: npm run qa
 *
 * This used to diff the render against the Canva export. That made sense while
 * the job was reproducing it; the design is ours now, so a pixel diff against
 * the old file would only measure how far we have deliberately moved. What is
 * worth checking automatically is what the *rules* promise: that type never
 * drops below the readable floor, that nothing overflows its card, and that the
 * connector tree still lands on the boxes. Those are asserted here and in
 * tests/e2e; the screenshots are for the eye.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withWidget, openWidget } from './render.mjs';
import { STACK_BELOW, COMPACT_BELOW, TIGHTEN_BELOW } from '../src/tokens.js';

const QA = fileURLToPath(new URL('../docs/qa/', import.meta.url));

/** Which of the four spacing regimes a width falls in. */
const layoutAt = (width) => {
  if (width >= TIGHTEN_BELOW) return 'signed-off layout';
  if (width >= COMPACT_BELOW) return 'five columns, tightened';
  if (width >= STACK_BELOW) return 'five columns, compact';
  return 'stacked';
};

// STACK_BELOW and one pixel under it are the pair that matter most: that is where
// the tree stops fitting, and 785 and 768 are the tablet widths that sit just above.
const WIDTHS = [
  { width: 1850, name: 'wide', note: 'full-width embed' },
  { width: 1440, name: 'desktop', note: 'typical desktop page' },
  { width: 1400, name: 'signed-off', note: `${TIGHTEN_BELOW}px — full spacing, the design as signed off` },
  { width: 1366, name: 'laptop', note: 'common laptop' },
  { width: 1280, name: 'small-laptop', note: 'common laptop' },
  { width: COMPACT_BELOW, name: 'band-floor', note: `${COMPACT_BELOW}px — the narrowest tightened row` },
  { width: 1200, name: 'narrow', note: 'compact band' },
  { width: 1100, name: 'compact', note: 'compact band' },
  { width: 923, name: 'narrow-tree', note: 'a common page column' },
  { width: 785, name: 'tablet-wide', note: 'a narrow browser window' },
  { width: 768, name: 'tablet', note: 'a tablet' },
  { width: STACK_BELOW, name: 'narrowest-tree', note: `${STACK_BELOW}px — the narrowest five-column width` },
  { width: STACK_BELOW - 1, name: 'narrow-stack', note: 'one pixel narrower: stacked' },
  { width: 390, name: 'phone', note: 'stacked' },
].map((entry) => ({ ...entry, note: `${entry.note} — ${layoutAt(entry.width)}` }));

/**
 * The longest label in the document. It is what sets STACK_BELOW, so the
 * numbers behind that threshold are measured here rather than asserted in a
 * comment: how wide the word wants to be on one line, and how much room the
 * column actually gives it.
 */
const LONGEST = 'Upplýsingaöryggisstefna';

/** Minimum font size anywhere in the widget, and anything wider than its card. */
const audit = (page) => page.locator('stefnu-rit').evaluate((el, longest) => {
  const root = el.shadowRoot;
  const sizes = [...root.querySelectorAll('.label, .card-title, .pill')]
    .map((n) => parseFloat(getComputedStyle(n).fontSize));

  const overflowing = [];
  for (const card of root.querySelectorAll('.card')) {
    const box = card.getBoundingClientRect();
    for (const label of card.querySelectorAll('.label')) {
      const r = label.getBoundingClientRect();
      // 1px of slack for sub-pixel rounding.
      if (r.right > box.right + 1 || r.left < box.left - 1) {
        overflowing.push(label.textContent.trim().slice(0, 40));
      }
    }
  }

  // The word's own width on one line, against the box it has to fit in.
  let label = null;
  const node = [...root.querySelectorAll('.label')].find((l) => l.textContent.includes(longest));
  if (node) {
    const cs = getComputedStyle(node);
    const probe = document.createElement('span');
    probe.textContent = longest;
    probe.style.cssText = 'position:absolute;white-space:nowrap;visibility:hidden';
    probe.style.font = `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`;
    node.parentNode.append(probe);
    const wants = Math.round(probe.getBoundingClientRect().width);
    probe.remove();
    const box = Math.round(node.closest('.item-link').getBoundingClientRect().width);
    label = { wants, box };
  }

  // A word may only break at a space, a hyphen or one of its marked seams. A
  // break anywhere else — "Upplýsingaöryggisstefn" over "a" — is the failure the
  // seams exist to prevent, and it is invisible to a width or overflow check.
  const midWord = [];
  for (const label of root.querySelectorAll('.label')) {
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

    let previousTop = null;
    chars.forEach(([node, i], index) => {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getClientRects()[0];
      if (!rect) return;
      const top = Math.round(rect.top);
      if (previousTop !== null && top > previousTop + 3 && index > 0) {
        const [beforeNode, beforeAt] = chars[index - 1];
        const before = beforeNode.data[beforeAt];
        const ok = /\s/.test(before) || /\s/.test(node.data[i]) || before === '-' || seams.has(index);
        if (!ok) midWord.push(label.textContent.trim().slice(0, 30));
      }
      previousTop = top;
    });
  }

  const lines = [...root.querySelectorAll('.lines line')].map((l) => l.dataset.role);
  return {
    label,
    minFontSize: sizes.length ? Math.min(...sizes) : null,
    midWord: [...new Set(midWord)],
    overflowing,
    lines: lines.reduce((acc, role) => ({ ...acc, [role]: (acc[role] ?? 0) + 1 }), {}),
    height: Math.round(el.getBoundingClientRect().height),
  };
}, LONGEST);

await mkdir(QA, { recursive: true });

const rows = [];
let failed = false;

await withWidget(async ({ browser, origin }) => {
  for (const { width, name, note } of WIDTHS) {
    const { page, messages } = await openWidget(browser, origin, width);
    await page.locator('stefnu-rit').screenshot({ path: `${QA}${name}-${width}.png` });
    const result = await audit(page);
    await page.close();

    const problems = [];
    if (result.minFontSize !== null && result.minFontSize < 15) {
      problems.push(`text down to ${result.minFontSize}px`);
    }
    if (result.overflowing.length) {
      problems.push(`${result.overflowing.length} label(s) outside their card: ${result.overflowing.join('; ')}`);
    }
    if (result.midWord.length) {
      problems.push(`${result.midWord.length} word(s) broken mid-syllable: ${result.midWord.join('; ')}`);
    }
    if (messages.length) problems.push(`console: ${messages.join(' / ')}`);
    if (problems.length) failed = true;

    rows.push({ width, name, note, ...result, problems });
    console.log(
      `${String(width).padStart(5)}px  ${name.padEnd(8)} ${String(result.height).padStart(5)}px tall  ` +
      `min ${result.minFontSize}px  lines ${JSON.stringify(result.lines)}  ` +
      (problems.length ? `⚠️  ${problems.join('; ')}` : 'ok'),
    );
  }
});

const report = `# Rendered widths

Generated by \`npm run qa\` on ${new Date().toISOString().slice(0, 10)}.

The design is the project's own; it is no longer compared against the Canva
export it started from. What is checked here is what the layout rules promise.

| Width | Layout | Height | Smallest text | Longest label | Connectors | |
|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.width}px | ${r.note} | ${r.height}px | ${r.minFontSize}px | ${r.label ? `${r.label.wants}px in ${r.label.box}px` : '—'} | ${Object.entries(r.lines).map(([k, v]) => `${v}×${k}`).join(', ') || '—'} | ${r.problems.length ? '⚠️ ' + r.problems.join('; ') : 'ok'} |`).join('\n')}

Body text never drops below 15px: the type scale is fluid between a readable
floor and the size the original used at full width, rather than shrinking in
proportion to the widget.

The column tree is used from ${STACK_BELOW}px up. Spacing steps down in three
regimes so the five columns fit:

| Width | Spacing |
|---|---|
| ${TIGHTEN_BELOW}px and up | the signed-off design, frozen (\`npm run qa:diff\`) |
| ${COMPACT_BELOW}–${TIGHTEN_BELOW - 1}px | the clamps' own floors (\`TIGHTENED\`) |
| ${STACK_BELOW}–${COMPACT_BELOW - 1}px | edge to edge, 0.15px page padding (\`COMPACT\`) |
| below ${STACK_BELOW}px | stacked, with the rail in its own gutter |

Chromium has no Icelandic hyphenation patterns, so a long compound in a narrow
column would be broken mid-syllable. Words may instead break at their seams
(Upplýsinga-öryggis-stefna), and every width above is checked for any break that
is not at a space, a hyphen or a seam.

The *longest label* column is the measurement behind these limits:
"Upplýsingaöryggisstefna" wants the first number on one line and has the second
to fit in. At the compact widths the box is narrower than the word, which is
why it breaks at its seams there instead of anywhere at all.


## Screenshots

${rows.map((r) => `- \`${r.name}-${r.width}.png\` — ${r.note}`).join('\n')}
`;

await writeFile(`${QA}README.md`, report);
console.log(`\nwrote docs/qa/README.md and ${rows.length} screenshots`);
if (failed) process.exitCode = 1;
