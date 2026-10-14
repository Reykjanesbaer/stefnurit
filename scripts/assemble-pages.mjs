#!/usr/bin/env node
/**
 * Lay out the directory GitHub Pages publishes.
 *
 * Run after `npm run build`. Produces _site/ containing the widget bundles, the
 * live document, the link report, the admin panel, the demo and the iframe
 * embed, plus an immutable copy of every version the document has ever had.
 *
 * Those revisions are reconstructed from git history rather than kept as
 * committed duplicates. Git already stores every version permanently and
 * deterministically, so reading them back costs nothing, cannot drift from the
 * real history, and means a Pages deploy never has to preserve state from the
 * previous deploy to avoid pruning anything.
 *
 * Run: node scripts/assemble-pages.mjs [--out _site]
 */
import { cp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const outDir = `${root}${args[args.indexOf('--out') + 1] || '_site'}`;
const config = JSON.parse(await readFile(`${root}site.config.json`, 'utf8'));

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const copied = [];
const skipped = [];

/** Copy a directory if the build produced it; record it either way. */
async function copyDir(from, to, { required = false } = {}) {
  const source = `${root}${from}`;
  if (!existsSync(source)) {
    if (required) {
      console.error(`❌ Vantar ${from} — keyrðu „npm run build“ fyrst.`);
      process.exit(1);
    }
    skipped.push(from);
    return;
  }
  await cp(source, `${outDir}/${to}`, { recursive: true });
  copied.push(`${from} -> ${to}`);
}

await copyDir('dist', 'dist', { required: true });
await copyDir('src', 'src');          // the demo pages load the modules directly
await copyDir('demo', 'demo');
await copyDir('admin/dist', 'admin'); // built by Vite in M2
await copyDir('embed', 'embed');      // added in M5
await copyDir('docs/qa', 'docs/qa');

// ---- the live document ------------------------------------------------------
await mkdir(`${outDir}/data`, { recursive: true });
const documentPath = `${root}${config.documentPath}`;
await cp(documentPath, `${outDir}/${config.documentPath}`);

// ---- link report ------------------------------------------------------------
const linkStatus = `${root}${config.paths.linkStatus}`;
if (existsSync(linkStatus)) {
  await cp(linkStatus, `${outDir}/${config.paths.linkStatus}`);
  copied.push(config.paths.linkStatus);
} else {
  // The admin panel fetches this unconditionally; an empty report is a much
  // better answer than a 404 it has to special-case.
  await writeFile(`${outDir}/${config.paths.linkStatus}`, JSON.stringify({
    generatedAt: null,
    summary: { total: 0, ok: 0, redirect: 0, broken: 0, unknown: 0, empty: 0, changedDocuments: 0 },
    links: [],
    note: 'Engin hlekkjaskýrsla hefur verið keyrð enn.',
  }, null, 2) + '\n');
  skipped.push(config.paths.linkStatus);
}

// ---- immutable revisions ----------------------------------------------------
const revisionsDir = `${outDir}/${config.paths.revisions}`;
await mkdir(revisionsDir, { recursive: true });

const revisions = [];
let history = [];
try {
  history = execFileSync(
    'git',
    ['log', '--format=%H%x09%aI%x09%an%x09%s', '--', config.documentPath],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  ).trim().split('\n').filter(Boolean);
} catch (error) {
  console.warn(`⚠️  Náði ekki í sögu skjalsins: ${error.message}`);
}

for (const line of history) {
  const [sha, date, author, subject] = line.split('\t');
  const short = sha.slice(0, 7);
  try {
    const content = execFileSync('git', ['show', `${sha}:${config.documentPath}`], {
      cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    await writeFile(`${revisionsDir}/${short}.json`, content);
    revisions.push({ sha, short, date, author, subject, path: `${config.paths.revisions}/${short}.json` });
  } catch {
    // The document did not exist at that commit (it was renamed or added later).
  }
}

await writeFile(`${revisionsDir}/index.json`, JSON.stringify({
  generatedAt: new Date().toISOString(),
  count: revisions.length,
  revisions,
}, null, 2) + '\n');

// ---- entry point ------------------------------------------------------------
await writeFile(`${outDir}/index.html`, `<!doctype html>
<html lang="is">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stefnurit — Reykjanesbær</title>
<style>
  body { margin: 0; padding: 2.5rem 1.25rem; background: #F4F6F8; color: #1B1B1F;
         font: 400 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 42rem; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 .5rem; }
  p { color: #4A4F57; margin: 0 0 1.5rem; }
  ul { list-style: none; padding: 0; margin: 0; display: grid; gap: .75rem; }
  a { display: block; padding: 1rem 1.25rem; background: #fff; border-radius: .625rem;
      box-shadow: 0 1px 3px rgba(0,0,0,.12); color: #1F559F; text-decoration: none; font-weight: 600; }
  a:hover { background: #F0F3F7; }
  a span { display: block; font-weight: 400; color: #4A4F57; font-size: .9rem; margin-top: .15rem; }
</style>
</head>
<body>
<main>
  <h1>Stefnurit</h1>
  <p>Stefnur og samþykktir Reykjanesbæjar.</p>
  <ul>
    <li><a href="demo/">Stefnuritið<span>Eins og það birtist á vef bæjarins</span></a></li>
    <li><a href="admin/">Stjórnborð<span>Breyta hlekkjum og birta — krefst GitHub-aðgangs</span></a></li>
    <li><a href="${config.paths.linkStatus}">Hlekkjaskýrsla<span>Staða allra hlekkja (JSON)</span></a></li>
    <li><a href="${config.documentPath}">Gögnin<span>Skjalið sjálft (JSON)</span></a></li>
  </ul>
</main>
</body>
</html>
`);

console.log(`Setti saman ${outDir.replace(root, '')}`);
for (const entry of copied) console.log(`  ✓ ${entry}`);
for (const entry of skipped) console.log(`  – ${entry} (ekki til enn)`);
console.log(`  ✓ ${revisions.length} útgáfur skjalsins úr Git-sögunni`);
