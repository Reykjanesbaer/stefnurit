#!/usr/bin/env node
/**
 * Prove the signed-off layout did not move.
 *
 * Run: npm run qa:diff [git-ref]   (default: HEAD)
 *
 * The widget's layout at and above TIGHTEN_BELOW is the design that was agreed;
 * everything below it is ours to adjust. This compares each screenshot in
 * docs/qa/ against the copy committed at `ref`, pixel for pixel, and fails only
 * when one at or above that width has changed. A width below it may legitimately
 * differ — the count is printed so the change is visible rather than silent.
 *
 * Run `npm run qa` first; this reads what that wrote.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { TIGHTEN_BELOW } from '../src/tokens.js';

const ref = process.argv[2] ?? 'HEAD';
const root = fileURLToPath(new URL('..', import.meta.url));
const qaDir = join(root, 'docs/qa');
const diffDir = join(qaDir, 'diff');

const shots = readdirSync(qaDir).filter((name) => name.endsWith('.png')).sort();
if (shots.length === 0) {
  console.error('No screenshots in docs/qa/ — run `npm run qa` first.');
  process.exit(1);
}

let failed = false;
const rows = [];

for (const name of shots) {
  const width = Number(name.match(/-(\d+)\.png$/)?.[1] ?? 0);
  const guarded = width >= TIGHTEN_BELOW;

  let committed;
  try {
    committed = execFileSync('git', ['show', `${ref}:docs/qa/${name}`], {
      cwd: root, maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    rows.push({ name, width, guarded, verdict: 'new — nothing to compare' });
    continue;
  }

  const before = PNG.sync.read(committed);
  const after = PNG.sync.read(readFileSync(join(qaDir, name)));

  if (before.width !== after.width || before.height !== after.height) {
    rows.push({
      name, width, guarded,
      verdict: `size changed ${before.width}×${before.height} → ${after.width}×${after.height}`,
      differs: true,
    });
    if (guarded) failed = true;
    continue;
  }

  const out = new PNG({ width: before.width, height: before.height });
  // threshold 0: anything at all counts. "Pixel-identical" is not a range.
  const differing = pixelmatch(before.data, after.data, out.data, before.width, before.height, { threshold: 0 });

  if (differing > 0) {
    mkdirSync(diffDir, { recursive: true });
    writeFileSync(join(diffDir, name), PNG.sync.write(out));
    if (guarded) failed = true;
  }

  const total = before.width * before.height;
  rows.push({
    name, width, guarded, differs: differing > 0,
    verdict: differing === 0
      ? 'identical'
      : `${differing} of ${total} pixels (${(differing / total * 100).toFixed(2)}%) — diff written to docs/qa/diff/${name}`,
  });
}

for (const row of rows) {
  const mark = row.differs ? (row.guarded ? '✗' : '·') : '✓';
  console.log(`${mark} ${row.name.padEnd(20)} ${row.guarded ? `(>= ${TIGHTEN_BELOW}px, frozen)` : '(below the freeze, may move)'}  ${row.verdict}`);
}

if (failed) {
  console.error(`\nA layout at or above ${TIGHTEN_BELOW}px changed. That width is frozen; if the change is intended, say so explicitly and update the baseline in its own commit.`);
  process.exitCode = 1;
} else {
  console.log(`\nEvery layout at or above ${TIGHTEN_BELOW}px is unchanged against ${ref}.`);
}
