#!/usr/bin/env node
/**
 * Probe only the links a pull request actually touches.
 *
 * Checking all 24 on every push would be slow, rude to the servers, and would
 * fail pull requests over links the author never touched. The structural diff
 * already knows which hrefs are new or changed, so this probes exactly those.
 *
 * Writes one pull-request comment and keeps editing it, emits annotations, and
 * fails the check only on `broken` — never on `unknown`, which usually means
 * the runner's IP is filtered rather than that the document is gone.
 *
 * Run: node scripts/check-changed-links.mjs --base <ref>
 */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hrefsToProbe } from '../src/diff.js';
import { probeAll, OUTCOME, OUTCOME_IS } from './check-links.mjs';
import { upsertComment, pullRequestNumber } from './github-api.mjs';

const MARKER = 'stefnurit:link-check';
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};

const baseRef = option('--base', process.env.GITHUB_BASE_REF || 'main');
const documentPath = option('--document', 'src/data/stefnurit.json');
const root = fileURLToPath(new URL('..', import.meta.url));

const head = JSON.parse(await readFile(`${root}${documentPath}`, 'utf8'));
const base = readBase(baseRef, documentPath);

if (!base) {
  console.log('Fann ekki fyrri útgáfu skjalsins; sleppi hlekkjaprófun.');
  process.exit(0);
}

const targets = hrefsToProbe(base, head);
if (!targets.length) {
  console.log('✅ Engir nýir eða breyttir hlekkir í þessari beiðni.');
  await comment('### Hlekkjaprófun\n\nEngir nýir eða breyttir hlekkir í þessari beiðni. Ekkert til að athuga.');
  process.exit(0);
}

console.log(`Athuga ${targets.length} nýja eða breytta hlekki…\n`);
const results = await probeAll(targets, {
  onResult: (r) => console.log(`  ${OUTCOME_IS[r.outcome].padEnd(14)} ${String(r.status ?? '—').padEnd(4)} ${r.label}`),
});

const broken = results.filter((r) => r.outcome === OUTCOME.BROKEN);
const unknown = results.filter((r) => r.outcome === OUTCOME.UNKNOWN);

for (const result of broken) {
  console.log(`::error::Hlekkurinn „${result.label}“ virkar ekki (${describe(result)}): ${result.href}`);
}
for (const result of unknown) {
  console.log(`::warning::Ekki tókst að staðfesta hlekkinn „${result.label}“ (${describe(result)}): ${result.href}`);
}

await comment(renderComment(results));

if (broken.length) {
  console.error(`\n❌ ${broken.length} hlekkur/hlekkir virka ekki. Lagfærðu þá og ýttu aftur.`);
  process.exit(1);
}
console.log(`\n✅ ${results.length} hlekkur/hlekkir athugaðir, enginn bilaður.`);
if (unknown.length) {
  console.log(`   ${unknown.length} óviss — það stöðvar ekki birtingu.`);
}

// ---- helpers ----------------------------------------------------------------

function readBase(ref, path) {
  for (const candidate of [`origin/${ref}`, ref]) {
    try {
      return JSON.parse(execFileSync('git', ['show', `${candidate}:${path}`], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      }));
    } catch { /* try the next spelling of the ref */ }
  }
  return null;
}

function iconFor(outcome) {
  return { ok: '✅', redirect: '↪️', broken: '❌', unknown: '⚠️', empty: '—' }[outcome] ?? '•';
}

function describe(result) {
  if (result.note) return result.note;
  if (result.status) return `svar ${result.status}`;
  if (result.errorCode === 'ETIMEDOUT') return 'tímamörk runnu út';
  if (result.errorCode) return `villa: ${result.errorCode}`;
  return 'óþekkt';
}

function renderComment(list) {
  const rows = list.map((r) => {
    const target = r.outcome === OUTCOME.REDIRECT && r.finalUrl !== r.href
      ? `${link(r.href)}<br>↪️ ${link(r.finalUrl)}`
      : link(r.href);
    return `| ${iconFor(r.outcome)} ${OUTCOME_IS[r.outcome]} | ${escapeCell(r.label)} | ${target} | ${describe(r)} |`;
  });

  const broken = list.filter((r) => r.outcome === OUTCOME.BROKEN).length;
  const unknownCount = list.filter((r) => r.outcome === OUTCOME.UNKNOWN).length;

  const verdict = broken
    ? `**${broken} hlekkur/hlekkir virka ekki.** Beiðnin fer ekki í gegn fyrr en þeir eru lagfærðir.`
    : unknownCount
      ? `Allir hlekkir í lagi, en ${unknownCount} tókst ekki að staðfesta. Það stöðvar ekki birtingu — `
        + 'vefþjónninn svaraði ekki eða hafnaði beiðninni frá GitHub.'
      : 'Allir nýir og breyttir hlekkir svöruðu eðlilega.';

  return [
    '### Hlekkjaprófun',
    '',
    `Athugaði ${list.length} nýjan eða breyttan hlekk í þessari beiðni.`,
    '',
    '| Staða | Skjal | Slóð | Nánar |',
    '|---|---|---|---|',
    ...rows,
    '',
    verdict,
    '',
    '<sub>Aðeins hlekkir sem breyttust eru athugaðir. Allir hlekkir eru athugaðir vikulega.</sub>',
  ].join('\n');
}

// Declared as functions, not const arrows: everything below the top-level
// `await` above would otherwise be in the temporal dead zone when it runs.
function link(url) { return `[${escapeCell(shorten(url))}](${url})`; }
function shorten(url) { return url.length > 70 ? `${url.slice(0, 48)}…${url.slice(-18)}` : url; }
function escapeCell(text) { return String(text).replace(/\|/g, '\\|'); }

async function comment(body) {
  const number = await pullRequestNumber();
  if (!number || !process.env.GITHUB_TOKEN) {
    console.log('\n(Engin beiðni eða token — sleppi athugasemd.)');
    return;
  }
  try {
    const { action } = await upsertComment({ issueNumber: number, marker: MARKER, body });
    console.log(`\nAthugasemd ${action === 'created' ? 'sett inn' : 'uppfærð'} á beiðni #${number}.`);
  } catch (error) {
    // A comment is a nicety; failing the whole check over it would be worse.
    console.log(`::warning::Gat ekki skrifað athugasemd: ${error.message}`);
  }
}
