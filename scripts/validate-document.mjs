#!/usr/bin/env node
/**
 * The gate every change to stefnurit.json passes through in CI.
 *
 * Checks, in order: the file parses, it is at a schema version this build
 * understands, it validates, and it is written in the canonical format. The
 * last one matters more than it looks — if the committed file and the admin
 * panel's output disagree by so much as a space, every publish rewrites the
 * whole file and the git history stops showing what actually changed.
 *
 * Run: node scripts/validate-document.mjs [path]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validate, issuesInIcelandic } from '../src/validate.js';
import { migrate, versionOf, CURRENT_SCHEMA_VERSION } from '../src/migrate.js';
import { formatJson } from '../src/format.js';

const path = process.argv[2]
  ?? fileURLToPath(new URL('../src/data/stefnurit.json', import.meta.url));

/** GitHub renders these as annotations on the pull request's Files tab. */
const annotate = (level, message) => console.log(`::${level} file=${rel(path)}::${message}`);
const rel = (p) => p.replace(`${process.cwd()}/`, '');

let raw;
try {
  raw = await readFile(path, 'utf8');
} catch (error) {
  annotate('error', `Gat ekki lesið ${rel(path)}: ${error.message}`);
  process.exit(2);
}

let document;
try {
  document = JSON.parse(raw);
} catch (error) {
  annotate('error', `Skráin er ekki gilt JSON: ${error.message}`);
  console.error(`\n❌ ${rel(path)} er ekki gilt JSON.\n   ${error.message}`);
  process.exit(1);
}

let failed = false;

// ---- schema version ---------------------------------------------------------
const version = versionOf(document);
if (version === null || version > CURRENT_SCHEMA_VERSION) {
  const result = migrate(document);
  annotate('error', `Útgáfa skema: ${result.reason}`);
  console.error(`\n❌ ${result.reason}`);
  failed = true;
} else if (version < CURRENT_SCHEMA_VERSION) {
  annotate('warning', `Skjalið er af útgáfu ${version}; keyrðu þýðingu upp í ${CURRENT_SCHEMA_VERSION}.`);
}

// ---- validity ---------------------------------------------------------------
const result = validate(document);
for (const line of issuesInIcelandic(result.issues.filter((i) => i.severity === 'error'))) {
  annotate('error', line);
}
for (const line of issuesInIcelandic(result.issues.filter((i) => i.severity === 'warning'))) {
  annotate('warning', line);
}

if (!result.ok) {
  console.error(`\n❌ ${result.errors.length} villa/villur í ${rel(path)}:`);
  for (const line of issuesInIcelandic(result.issues.filter((i) => i.severity === 'error'))) {
    console.error('   ' + line);
  }
  failed = true;
}
if (result.warnings.length) {
  console.warn(`\n⚠️  ${result.warnings.length} aðvörun/aðvaranir:`);
  for (const line of issuesInIcelandic(result.issues.filter((i) => i.severity === 'warning'))) {
    console.warn('   ' + line);
  }
}

// ---- canonical format -------------------------------------------------------
const canonical = formatJson(document);
if (canonical !== raw) {
  const where = firstDifference(raw, canonical);
  annotate('error', `Skráin er ekki á stöðluðu sniði (fyrsti munur í línu ${where.line}). `
    + 'Keyrðu „npm run format:data“ eða sæktu JSON úr stjórnborðinu.');
  console.error(`\n❌ ${rel(path)} er ekki á stöðluðu sniði.`);
  console.error(`   Fyrsti munur í línu ${where.line}:`);
  console.error(`   á skrá:  ${JSON.stringify(where.actual)}`);
  console.error(`   ætti að vera: ${JSON.stringify(where.expected)}`);
  console.error('\n   Lagfærðu með: npm run format:data');
  failed = true;
}

if (failed) process.exit(1);

console.log(`✅ ${rel(path)} er gilt`);
console.log(`   ${countItems(document)} hlekkir · skema útgáfa ${version} · staðlað snið í lagi`);

function firstDifference(actual, expected) {
  const a = actual.split('\n');
  const b = expected.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) return { line: i + 1, actual: a[i] ?? '(skrá endar)', expected: b[i] ?? '(skrá endar)' };
  }
  return { line: a.length, actual: '', expected: '' };
}

function countItems(doc) {
  let total = 0;
  for (const section of doc.sections ?? []) {
    if (section.kind === 'columns') {
      for (const column of section.columns ?? []) {
        for (const card of column.cards ?? []) total += (card.items ?? []).length;
      }
    } else {
      total += (section.items ?? []).length;
    }
  }
  return total;
}
