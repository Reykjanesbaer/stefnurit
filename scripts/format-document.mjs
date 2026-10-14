#!/usr/bin/env node
/**
 * Rewrite stefnurit.json in the canonical format.
 *
 * The fix CI points at when `validate-document.mjs` reports the file is not
 * canonical — usually after somebody edited it by hand on GitHub and their
 * editor reindented it.
 *
 * Run: npm run format:data
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { formatJson } from '../src/format.js';
import { validate, issuesInIcelandic } from '../src/validate.js';

const path = process.argv[2] ?? fileURLToPath(new URL('../src/data/stefnurit.json', import.meta.url));
const raw = await readFile(path, 'utf8');

let document;
try {
  document = JSON.parse(raw);
} catch (error) {
  console.error(`❌ Skráin er ekki gilt JSON og verður ekki lagfærð sjálfkrafa:\n   ${error.message}`);
  process.exit(1);
}

// Refuse to tidy a document that is not valid: a clean reformat would make a
// broken file look settled in the diff.
const report = validate(document);
if (!report.ok) {
  console.error('❌ Skjalið er ekki gilt. Lagaðu þetta fyrst:');
  for (const line of issuesInIcelandic(report.issues.filter((i) => i.severity === 'error'))) {
    console.error('   ' + line);
  }
  process.exit(1);
}

const formatted = formatJson(document);
if (formatted === raw) {
  console.log('✅ Skráin er þegar á stöðluðu sniði — engin breyting.');
  process.exit(0);
}

await writeFile(path, formatted);
console.log('✅ Lagfærði sniðið á skránni.');
