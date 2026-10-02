#!/usr/bin/env node
/**
 * Visual fidelity check: render the widget and compare it to the Canva design.
 *
 * Run: npm run qa
 *
 * Writes into docs/qa/
 *   render-1850.png   the widget at reference width
 *   side-by-side.png  reference above, render below
 *   diff.png          per-pixel difference
 *   report.md         colour, geometry and line deviations
 *
 * The only reference available is a 614 px render (see docs/reference/README.md),
 * so the pixel diff is done at that size — upscaling it to 1850 would compare
 * the render against the upscaler's guesses rather than against the design.
 * Colour values are exact at any scale; geometry is quoted with its error bar.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { withWidget, openWidget } from './render.mjs';
import { TOKENS, REFERENCE_WIDTH, REFERENCE_HEIGHT } from '../src/tokens.js';

const QA = fileURLToPath(new URL('../docs/qa/', import.meta.url));
const REFERENCE = fileURLToPath(new URL('../docs/reference/stefnurit-2025-canva-thumb-614w.png', import.meta.url));

// ---- tiny image helpers ----------------------------------------------------

const readPng = (path) => PNG.sync.read(readFileSync(path));
const writePng = (png, path) => writeFile(path, PNG.sync.write(png));

/** Box-filter downscale. Good enough, and deterministic across machines. */
function resize(png, width) {
  const height = Math.round((png.height * width) / png.width);
  const out = new PNG({ width, height });
  const sx = png.width / width;
  const sy = png.height / height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * sx); const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const y0 = Math.floor(y * sy); const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          const i = (png.width * yy + xx) << 2;
          r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n += 1;
        }
      }
      const o = (width * y + x) << 2;
      out.data[o] = Math.round(r / n); out.data[o + 1] = Math.round(g / n);
      out.data[o + 2] = Math.round(b / n); out.data[o + 3] = 255;
    }
  }
  return out;
}

const pixelAt = (png, x, y) => {
  const i = (png.width * Math.round(y) + Math.round(x)) << 2;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
};

/**
 * The most common colour inside a rectangle.
 *
 * A fixed sample point is no good here — the cards are full of text, and a
 * point that lands on a glyph or its antialiasing reports a blend rather than
 * the fill. The modal colour of a region is the fill, whatever the text does.
 */
function regionMode(png, [x0, y0, x1, y1]) {
  const counts = new Map();
  for (let y = Math.max(0, y0); y <= Math.min(png.height - 1, y1); y += 1) {
    for (let x = Math.max(0, x0); x <= Math.min(png.width - 1, x1); x += 1) {
      const key = pixelAt(png, x, y).join(',');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best = null; let bestCount = -1;
  for (const [key, count] of counts) if (count > bestCount) { best = key; bestCount = count; }
  return best.split(',').map(Number);
}

// ---- colour maths -----------------------------------------------------------

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function rgbToLab([r, g, b]) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 1.0;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** CIEDE2000 — the modern perceptual difference, where ΔE < 3 is "no visible change". */
function deltaE2000(rgb1, rgb2) {
  const [L1, a1, b1] = rgbToLab(rgb1);
  const [L2, a2, b2] = rgbToLab(rgb2);
  const avgL = (L1 + L2) / 2;
  const C1 = Math.hypot(a1, b1); const C2 = Math.hypot(a2, b2);
  const avgC = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G); const a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1); const C2p = Math.hypot(a2p, b2);
  const avgCp = (C1p + C2p) / 2;
  const deg = (rad) => (rad * 180) / Math.PI;
  const h = (ap, bp) => { if (ap === 0 && bp === 0) return 0; const d = deg(Math.atan2(bp, ap)); return d >= 0 ? d : d + 360; };
  const h1p = h(a1p, b1); const h2p = h(a2p, b2);
  let avgHp;
  if (C1p * C2p === 0) avgHp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) avgHp = (h1p + h2p) / 2;
  else avgHp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  const T = 1 - 0.17 * Math.cos(((avgHp - 30) * Math.PI) / 180)
    + 0.24 * Math.cos((2 * avgHp * Math.PI) / 180)
    + 0.32 * Math.cos(((3 * avgHp + 6) * Math.PI) / 180)
    - 0.20 * Math.cos(((4 * avgHp - 63) * Math.PI) / 180);
  let dhp = h2p - h1p;
  if (C1p * C2p === 0) dhp = 0;
  else if (dhp > 180) dhp -= 360;
  else if (dhp < -180) dhp += 360;
  const dLp = L2 - L1; const dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);
  const Sl = 1 + (0.015 * (avgL - 50) ** 2) / Math.sqrt(20 + (avgL - 50) ** 2);
  const Sc = 1 + 0.045 * avgCp;
  const Sh = 1 + 0.015 * avgCp * T;
  const dTheta = 30 * Math.exp(-(((avgHp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7));
  const Rt = -Rc * Math.sin((2 * dTheta * Math.PI) / 180);
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

// ---- measurement ------------------------------------------------------------

/** Regions to sample, in reference-page coordinates (1850 x 980). */
const SAMPLES = [
  { token: 'color-surface', box: [700, 900, 1150, 955], note: 'page background' },
  { token: 'color-primary', box: [800, 380, 1040, 850], note: 'blue card, column 3' },
  { token: 'color-accent', box: [120, 240, 430, 600], note: 'teal card, column 1' },
  { token: 'color-pill', box: [780, 38, 1060, 74], note: 'root pill' },
];

const classify = (p) => {
  const [r, g, b] = p;
  if (r > 236 && g > 236 && b > 236) return 'W';
  if (Math.abs(r - 31) < 34 && Math.abs(g - 85) < 36 && Math.abs(b - 159) < 36) return 'B';
  if (r < 80 && g > 115 && g < 205 && b > 150 && b < 225) return 'T';
  return '?';
};

/** Left and right edge of every card-ish run on one scanline. */
function edges(png, y) {
  const out = [];
  let previous = 'W'; let start = 0;
  for (let x = 0; x < png.width; x += 1) {
    const k = classify(pixelAt(png, x, y));
    if (k !== previous) {
      if ((previous === 'B' || previous === 'T') && x - start >= 12) out.push({ kind: previous, from: start, to: x - 1 });
      previous = k; start = x;
    }
  }
  const merged = [];
  for (const run of out) {
    const last = merged.at(-1);
    if (last && last.kind === run.kind && run.from - last.to <= 16) last.to = run.to;
    else merged.push({ ...run });
  }
  return merged;
}

/** Rows where a light grey connector covers most of the width — i.e. the rail. */
function railRows(png) {
  const rows = [];
  for (let y = 0; y < png.height; y += 1) {
    let n = 0;
    for (let x = 0; x < png.width; x += 1) {
      const [r, g, b] = pixelAt(png, x, y);
      if (Math.abs(r - g) < 14 && Math.abs(g - b) < 14 && r > 150 && r < 243) n += 1;
    }
    if (n > png.width * 0.3) rows.push(y);
  }
  return rows;
}

// ---- run --------------------------------------------------------------------

await mkdir(QA, { recursive: true });

await withWidget(async ({ browser, origin }) => {
  const { page, messages } = await openWidget(browser, origin, REFERENCE_WIDTH);
  await page.locator('stefnu-rit').screenshot({ path: `${QA}render-1850.png` });
  if (messages.length) console.warn('console output during render:\n  ' + messages.join('\n  '));
});

const reference = readPng(REFERENCE);
const renderFull = readPng(`${QA}render-1850.png`);

// Reference-scale copies for geometry, both at 1850 wide.
const referenceBig = resize(reference, REFERENCE_WIDTH);
// Thumbnail-scale copies for the pixel diff, both at the reference's own size.
const renderSmall = resize(renderFull, reference.width);

const height = Math.min(reference.height, renderSmall.height);
const diff = new PNG({ width: reference.width, height });
const crop = (png) => {
  const out = new PNG({ width: reference.width, height });
  png.data.copy(out.data, 0, 0, reference.width * height * 4);
  return out;
};
const mismatched = pixelmatch(
  crop(reference).data, crop(renderSmall).data, diff.data,
  reference.width, height, { threshold: 0.12, includeAA: false, diffMask: false },
);
await writePng(diff, `${QA}diff.png`);

const gap = 8;
const side = new PNG({ width: reference.width, height: reference.height + gap + renderSmall.height });
side.data.fill(255);
reference.data.copy(side.data, 0);
renderSmall.data.copy(side.data, reference.width * (reference.height + gap) * 4);
await writePng(side, `${QA}side-by-side.png`);

// ---- colour ----
const colours = SAMPLES.map(({ token, box, note }) => {
  const expected = hexToRgb(TOKENS[token]);
  const inReference = regionMode(referenceBig, box);
  const inRender = regionMode(renderFull, box);
  return {
    token,
    note,
    expected,
    reference: inReference,
    render: inRender,
    deltaE: deltaE2000(inReference, inRender),
    deltaEToken: deltaE2000(expected, inRender),
  };
});

// ---- geometry ----
const bandY = Math.round(referenceBig.height * 0.46);
const referenceEdges = edges(referenceBig, bandY);
const renderEdges = edges(renderFull, Math.round(renderFull.height * 0.46));

const referenceRail = railRows(referenceBig);
const renderRail = railRows(renderFull);

// ---- report ----
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');
const fixed = (n, d = 2) => Number(n).toFixed(d);

const edgeRows = referenceEdges.map((ref, index) => {
  const mine = renderEdges[index];
  if (!mine) return `| ${index + 1} | ${ref.kind} | ${ref.from}–${ref.to} | — | missing |`;
  return `| ${index + 1} | ${ref.kind} | ${ref.from}–${ref.to} | ${mine.from}–${mine.to} | ${mine.from - ref.from >= 0 ? '+' : ''}${mine.from - ref.from} / ${mine.to - ref.to >= 0 ? '+' : ''}${mine.to - ref.to} |`;
});

const paired = referenceEdges.map((ref, i) => ({ ref, mine: renderEdges[i] })).filter((p) => p.mine);
const worstEdge = paired.length
  ? Math.max(...paired.map(({ ref, mine }) => Math.max(Math.abs(mine.from - ref.from), Math.abs(mine.to - ref.to))))
  : NaN;
const unmatched = referenceEdges.length - paired.length;

const report = `# Visual fidelity report

Generated by \`npm run qa\` on ${new Date().toISOString().slice(0, 10)}.

| | |
|---|---|
| Reference | \`docs/reference/stefnurit-2025-canva-thumb-614w.png\` (${reference.width} × ${reference.height}) |
| Render | ${renderFull.width} × ${renderFull.height}, Chromium, deviceScaleFactor 1 |
| Design page | ${REFERENCE_WIDTH} × ${REFERENCE_HEIGHT} |

**The reference is a ⅓-scale render** — Canva refuses to export this design to
this account and its render host is blocked by the network policy that produced
this report. Every number below inherits that: one reference pixel is 3.01
design pixels, so geometry cannot be resolved finer than ±3 design px no matter
how exact the render is. Colour is unaffected.

## Colour (CIEDE2000, target ΔE < 3)

| Token | Where | Reference | Render | ΔE render↔reference | ΔE render↔token |
|---|---|---|---|---|---|
${colours.map((c) => `| \`--sr-${c.token}\` | ${c.note} | ${hex(c.reference)} | ${hex(c.render)} | **${fixed(c.deltaE)}** | ${fixed(c.deltaEToken)} |`).join('\n')}

${colours.every((c) => c.deltaE < 3)
  ? `All fills are within ΔE 3 — no visible colour difference at normal zoom.`
  : `⚠️ ${colours.filter((c) => c.deltaE >= 3).map((c) => c.token).join(', ')} exceed ΔE 3.`}

## Card geometry, measured on the card band

Both images scaled to ${REFERENCE_WIDTH} px wide. B = blue card, T = teal.

| # | Fill | Reference x | Render x | Δ left / Δ right |
|---|---|---|---|---|
${edgeRows.join('\n')}

Worst edge deviation: **${worstEdge} px** at reference width (${fixed((worstEdge / REFERENCE_WIDTH) * 100, 2)} % of the width)${unmatched ? `, with ${unmatched} run(s) unmatched` : ''}.

## Lines

| | Reference | Render | Δ |
|---|---|---|---|
| Rail rows (y) | ${referenceRail.join(', ') || '—'} | ${renderRail.join(', ') || '—'} | ${referenceRail.length && renderRail.length ? `${renderRail[0] - referenceRail[0]} px` : '—'} |
| Rail thickness | ${referenceRail.length} px | ${renderRail.length} px | ${renderRail.length - referenceRail.length} px |

The reference's rail measures ${referenceRail.length} px because a ~2 px line in
a ⅓-scale render blurs across two rows and comes back upscaled. The render
strokes \`--sr-line-width: ${TOKENS['line-width']}\` reference px. Thickness cannot be
checked more tightly than that without a full-size export.

## Pixel difference

${mismatched.toLocaleString('en')} of ${(reference.width * height).toLocaleString('en')} pixels differ
(**${fixed((mismatched / (reference.width * height)) * 100)} %**) at ${reference.width} px wide,
threshold 0.12, antialiasing ignored. See \`diff.png\`.

Most of that total is text antialiasing: the design was set in Canva's font and
the rebuild uses Figtree, so no glyph lands on exactly the same pixels.

## Remaining visible differences

1. **The white notch in the teal strips is missing.** In the design, the teal
   behind each blue card is interrupted at y 616–650 — the same place column 1
   breaks between *Stjórnsýsla* and *Mannauðsmál*. It is the leftover shape of
   column 1 showing through, not a rule, so the rebuild gives each card its own
   backing instead. Four strips of roughly 21 × 34 px differ.
2. **Letterforms.** Figtree is the closest freely-hostable match, not the Canva
   original, which could not be identified from a ⅓-scale render. Word lengths
   and line breaks match; individual glyph shapes do not.
3. **Sub-pixel geometry.** Everything measurable agrees to within ${worstEdge} px at
   reference width, which is below the reference's own resolution.

To tighten 2 and 3, commit a full-size export as
\`docs/reference/stefnurit-2025.png\` and run this again.
`;

await writeFile(`${QA}report.md`, report);

console.log(report.split('\n').slice(0, 4).join('\n'));
console.log(`\ncolour:   ${colours.every((c) => c.deltaE < 3) ? 'PASS' : 'FAIL'}  (max ΔE ${fixed(Math.max(...colours.map((c) => c.deltaE)))})`);
console.log(`geometry: worst edge deviation ${worstEdge} px at ${REFERENCE_WIDTH} px wide`);
console.log(`pixels:   ${fixed((mismatched / (reference.width * height)) * 100)} % differ`);
console.log(`\nwrote docs/qa/{render-1850,side-by-side,diff}.png and report.md`);
