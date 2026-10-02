#!/usr/bin/env node
/**
 * Check every href in stefnurit.json before publishing.
 *
 * Run: npm run check-links [-- path/to/stefnurit.json]
 *
 * HEAD first, because these are mostly PDFs and there is no reason to pull
 * megabytes to learn a status code; servers that reject HEAD get a ranged GET
 * instead. Exits non-zero if anything is broken, so it can gate a deploy.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { collectItems, validate } from '../src/validate.js';

const TIMEOUT_MS = 20_000;
const CONCURRENCY = 6;

/** Resolve one href to OK / REDIRECT / BROKEN. */
export async function probe(href, { timeout = TIMEOUT_MS } = {}) {
  const attempt = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(href, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: method === 'GET' ? { range: 'bytes=0-0' } : undefined,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let response = await attempt('HEAD');
    // Plenty of servers answer HEAD with 403/405 and are perfectly fine on GET.
    if (response.status === 403 || response.status === 405 || response.status === 501) {
      response = await attempt('GET');
    }
    const redirected = response.redirected && stripTrailingSlash(response.url) !== stripTrailingSlash(href);
    if (response.ok) return { state: redirected ? 'REDIRECT' : 'OK', status: response.status, final: response.url };
    return { state: 'BROKEN', status: response.status, final: response.url };
  } catch (error) {
    return { state: 'BROKEN', status: 0, detail: error.name === 'AbortError' ? 'timeout' : String(error.cause?.code ?? error.message) };
  }
}

const stripTrailingSlash = (u) => String(u).replace(/\/$/, '');

/** Run `worker` over `items`, at most `limit` at a time. */
async function pooled(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

/** Probe every item in a parsed stefnurit document. */
export async function checkLinks(data, { concurrency = CONCURRENCY, timeout = TIMEOUT_MS } = {}) {
  const entries = collectItems(data).map(({ item, path }) => ({
    id: item.id,
    label: item.label,
    href: typeof item.href === 'string' ? item.href : '',
    path,
  }));
  return pooled(entries, concurrency, async (entry) => {
    if (!entry.href) return { ...entry, state: 'EMPTY', status: '-' };
    return { ...entry, ...(await probe(entry.href, { timeout })) };
  });
}

if (import.meta.url !== `file://${process.argv[1]}`) {
  // imported as a module — stop before the CLI
} else {
  await main();
}

async function main() {
const file = process.argv[2] ?? fileURLToPath(new URL('../src/data/stefnurit.json', import.meta.url));
const data = JSON.parse(await readFile(file, 'utf8'));
const report = validate(data);
if (!report.ok) {
  console.error('stefnurit.json is not valid, fix this first:');
  for (const error of report.errors) console.error('  ' + error);
  process.exit(2);
}
const results = await checkLinks(data);

const ORDER = { BROKEN: 0, EMPTY: 1, REDIRECT: 2, OK: 3 };
results.sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.label.localeCompare(b.label, 'is'));

const pad = (s, n) => String(s).padEnd(n);
const widest = Math.max(...results.map((r) => r.label.length), 5);

console.log(`${pad('STATE', 9)} ${pad('CODE', 5)} ${pad('LABEL', widest)}  URL`);
console.log('-'.repeat(9 + 6 + widest + 6));
for (const r of results) {
  const url = r.state === 'REDIRECT' ? `${r.href}\n${' '.repeat(17 + widest)}→ ${r.final}` : r.href || '(empty)';
  console.log(`${pad(r.state, 9)} ${pad(r.status, 5)} ${pad(r.label, widest)}  ${url}${r.detail ? `  (${r.detail})` : ''}`);
}

const tally = results.reduce((acc, r) => ({ ...acc, [r.state]: (acc[r.state] ?? 0) + 1 }), {});
console.log('\n' + Object.entries(tally).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ') + `  (${results.length} links)`);

if (tally.BROKEN) process.exitCode = 1;
}
