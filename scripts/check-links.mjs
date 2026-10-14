#!/usr/bin/env node
/**
 * Link monitor for stefnurit.json.
 *
 * Two jobs share this file. The weekly deploy runs the full monitor and writes
 * data/link-status.json; the pull-request check (scripts/check-changed-links.mjs)
 * imports `probe` and runs it over only the hrefs a PR touches.
 *
 * Politeness is deliberate. These are a municipality's own servers plus a
 * handful of others, and a burst of 24 parallel requests every week is rude and
 * looks like a scrape. One request per host at a time, a pause between them, a
 * real User-Agent that says who is calling and why, and backoff when a server
 * says to slow down.
 *
 * Classification is deliberately conservative about blame: only evidence that
 * the *document* is gone counts as broken. A 403 or a timeout much more often
 * means the CI runner's IP is being filtered than that a resident cannot open
 * the PDF, so those warn and never fail a build.
 *
 * Run: node scripts/check-links.mjs [--json <path>] [--document <path>]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { collectItems, validate } from '../src/validate.js';

export const OUTCOME = {
  OK: 'ok',
  REDIRECT: 'redirect',
  BROKEN: 'broken',
  UNKNOWN: 'unknown',
  EMPTY: 'empty',
};

/** Icelandic labels, used in the PR comment, the admin panel and the issue. */
export const OUTCOME_IS = {
  ok: 'í lagi',
  redirect: 'áframsending',
  broken: 'bilaður',
  unknown: 'óviss',
  empty: 'enginn hlekkur',
};

export const DEFAULTS = {
  concurrency: 4,
  perHostDelayMs: 750,
  timeoutMs: 20_000,
  maxRedirects: 5,
  maxAttempts: 3,
  // Production always requires https. Tests flip this to drive a local http
  // server through exactly the same redirect, fallback and retry code.
  requireHttps: true,
  userAgent:
    'stefnurit-link-check/1.0 (+https://github.com/Reykjanesbaer/stefnurit; '
    + 'Reykjanesbaer vefstjorn; weekly availability check)',
};

/** Statuses that mean "we could not tell", never "the document is gone". */
const UNKNOWN_STATUSES = new Set([401, 403, 408, 429]);
/** Transport failures that prove the host or certificate is wrong. */
const BROKEN_ERROR_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN', 'ERR_SSL_WRONG_VERSION_NUMBER',
]);

/**
 * Decide an outcome from the facts of one probe. Pure, so the whole matrix of
 * statuses and transport failures is unit-testable without a network.
 *
 * @param {{status?: number|null, errorCode?: string|null, redirected?: boolean,
 *          finalUrl?: string|null, redirectLoop?: boolean, tooManyRedirects?: boolean,
 *          insecureRedirect?: boolean, timedOut?: boolean}} facts
 */
export function classify(facts) {
  const {
    status = null, errorCode = null, redirected = false, redirectLoop = false,
    tooManyRedirects = false, insecureRedirect = false, timedOut = false,
  } = facts;

  // A redirect that leaves HTTPS, or spins, is a real defect in the link.
  if (insecureRedirect || redirectLoop || tooManyRedirects) return OUTCOME.BROKEN;
  if (timedOut) return OUTCOME.UNKNOWN;

  if (errorCode) {
    return BROKEN_ERROR_CODES.has(errorCode) ? OUTCOME.BROKEN : OUTCOME.UNKNOWN;
  }
  if (status === null) return OUTCOME.UNKNOWN;

  if (status >= 200 && status < 300) return redirected ? OUTCOME.REDIRECT : OUTCOME.OK;
  if (status === 404 || status === 410) return OUTCOME.BROKEN;
  if (UNKNOWN_STATUSES.has(status)) return OUTCOME.UNKNOWN;
  if (status >= 500) return OUTCOME.UNKNOWN;        // their outage, not our link
  if (status >= 400) return OUTCOME.BROKEN;         // 400, 405 after fallback, 451…
  return OUTCOME.UNKNOWN;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errorCodeOf = (error) => error?.cause?.code ?? error?.code ?? null;

/**
 * Probe one URL, following redirects by hand so each hop can be inspected.
 *
 * HEAD first because these are mostly PDFs and there is no reason to pull
 * megabytes to learn a status code; servers that refuse HEAD get a one-byte
 * ranged GET instead.
 */
export async function probe(href, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const started = Date.now();

  if (typeof href !== 'string' || href === '') {
    return { outcome: OUTCOME.EMPTY, status: null, finalUrl: null, checkedAt: new Date().toISOString() };
  }
  // HTTPS only. The validator already rejects other schemes; this is the second
  // gate, so a hand-edited file cannot make CI fetch http:// or file://.
  if (config.requireHttps && !/^https:\/\//i.test(href)) {
    return {
      outcome: OUTCOME.BROKEN, status: null, finalUrl: null, note: 'ekki https',
      checkedAt: new Date().toISOString(), durationMs: 0,
    };
  }

  let url = href;
  const seen = new Set([href]);
  let redirects = 0;
  let lastStatus = null;
  let response = null;
  let errorCode = null;
  let timedOut = false;

  for (;;) {
    const attempt = await request(url, 'HEAD', config);

    // Many servers answer HEAD with 403/405/501 and serve GET perfectly well.
    let current = attempt;
    if (!current.error && [403, 405, 501].includes(current.response?.status)) {
      current = await request(url, 'GET', config);
    }

    if (current.error) {
      errorCode = current.errorCode;
      timedOut = current.timedOut;
      break;
    }

    response = current.response;
    lastStatus = response.status;

    if (lastStatus >= 300 && lastStatus < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      let next;
      try {
        next = new URL(location, url).toString();
      } catch {
        return finish(OUTCOME.BROKEN, { note: 'ógild áframsending' });
      }
      if (config.requireHttps && !/^https:/i.test(next)) {
        return finish(OUTCOME.BROKEN, { finalUrl: next, note: 'áframsending út af https' });
      }
      if (seen.has(next)) return finish(OUTCOME.BROKEN, { finalUrl: next, note: 'áframsendingarlykkja' });
      if (++redirects > config.maxRedirects) return finish(OUTCOME.BROKEN, { finalUrl: next, note: 'of margar áframsendingar' });
      seen.add(next);
      url = next;
      await sleep(config.perHostDelayMs / 3);
      continue;
    }
    break;
  }

  const outcome = classify({
    status: lastStatus, errorCode, redirected: redirects > 0, timedOut,
  });
  return finish(outcome);

  function finish(result, extra = {}) {
    return {
      outcome: result,
      status: lastStatus,
      finalUrl: extra.finalUrl ?? (redirects > 0 ? url : href),
      redirects,
      contentType: response?.headers.get('content-type') ?? null,
      size: toNumber(response?.headers.get('content-length')),
      lastModified: response?.headers.get('last-modified') ?? null,
      errorCode,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      ...extra,
    };
  }
}

/** One HTTP call with timeout, retries and backoff when told to slow down. */
async function request(url, method, config) {
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': config.userAgent,
          accept: '*/*',
          ...(method === 'GET' ? { range: 'bytes=0-0' } : {}),
        },
      });

      // 429/503 with Retry-After is an explicit request to back off.
      if ((response.status === 429 || response.status === 503) && attempt < config.maxAttempts) {
        const after = Number(response.headers.get('retry-after'));
        const wait = Number.isFinite(after) && after > 0
          ? Math.min(after * 1000, 30_000)
          : config.perHostDelayMs * 2 ** attempt;
        await sleep(wait);
        continue;
      }
      return { response, error: false };
    } catch (error) {
      const aborted = error.name === 'AbortError';
      if (attempt < config.maxAttempts && !aborted) {
        await sleep(config.perHostDelayMs * attempt);
        continue;
      }
      return { error: true, errorCode: aborted ? 'ETIMEDOUT' : errorCodeOf(error), timedOut: aborted };
    } finally {
      clearTimeout(timer);
    }
  }
  return { error: true, errorCode: 'ERETRY', timedOut: false };
}

/**
 * Probe a list of {id, label, href}, one request per host at a time.
 *
 * @returns {Promise<Array<object>>}
 */
export async function probeAll(entries, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const results = new Array(entries.length);
  const byHost = new Map();

  entries.forEach((entry, index) => {
    const host = hostOf(entry.href);
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push({ entry, index });
  });

  // Each host is a serial queue; at most `concurrency` hosts run at once.
  const queues = [...byHost.values()];
  let nextQueue = 0;
  const workers = Array.from({ length: Math.min(config.concurrency, queues.length) }, async () => {
    for (;;) {
      const queue = queues[nextQueue++];
      if (!queue) return;
      for (const [position, { entry, index }] of queue.entries()) {
        if (position > 0) await sleep(config.perHostDelayMs);
        results[index] = { ...entry, ...(await probe(entry.href, config)) };
        options.onResult?.(results[index]);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

const hostOf = (href) => {
  try { return new URL(href).host; } catch { return '(ógilt)'; }
};
const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Merge this run's results with the previous file so a link has to fail three
 * runs in a row before anyone is told, and so a PDF being silently swapped out
 * (same URL, new Last-Modified) is visible.
 */
export function mergeHistory(previous, results) {
  const before = new Map((previous?.links ?? []).map((l) => [l.id, l]));
  const links = results.map((result) => {
    const old = before.get(result.id);
    const failing = result.outcome === OUTCOME.BROKEN || result.outcome === OUTCOME.UNKNOWN;
    const lastModifiedChanged = Boolean(
      old?.lastModified && result.lastModified && old.lastModified !== result.lastModified,
    );
    return {
      ...result,
      consecutiveFailures: failing ? (old?.consecutiveFailures ?? 0) + 1 : 0,
      lastModifiedChanged,
      previousLastModified: lastModifiedChanged ? old.lastModified : null,
    };
  });

  const count = (outcome) => links.filter((l) => l.outcome === outcome).length;
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: links.length,
      ok: count(OUTCOME.OK),
      redirect: count(OUTCOME.REDIRECT),
      broken: count(OUTCOME.BROKEN),
      unknown: count(OUTCOME.UNKNOWN),
      empty: count(OUTCOME.EMPTY),
      changedDocuments: links.filter((l) => l.lastModifiedChanged).length,
    },
    links,
  };
}

/** Links that have failed often enough to be worth telling somebody about. */
export const needsAttention = (report, threshold = 3) => report.links.filter(
  (l) => l.outcome === OUTCOME.BROKEN || (l.outcome === OUTCOME.UNKNOWN && l.consecutiveFailures >= threshold),
);

// ---- CLI --------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const at = args.indexOf(name);
    return at === -1 ? fallback : args[at + 1];
  };
  const root = fileURLToPath(new URL('..', import.meta.url));
  const documentPath = option('--document', `${root}src/data/stefnurit.json`);
  const outPath = option('--json', `${root}data/link-status.json`);

  const document = JSON.parse(await readFile(documentPath, 'utf8'));
  const report = validate(document);
  if (!report.ok) {
    console.error('stefnurit.json is not valid, fix that first:');
    for (const error of report.errors) console.error('  ' + error);
    process.exit(2);
  }

  const entries = collectItems(document).map(({ item }) => ({
    id: item.id, label: item.label, href: item.href ?? '',
  }));

  console.log(`Athuga ${entries.length} hlekki (${DEFAULTS.concurrency} samhliða, `
    + `${DEFAULTS.perHostDelayMs} ms á milli beiðna á sama hýsil)…\n`);

  const results = await probeAll(entries, {
    onResult: (r) => console.log(
      `  ${OUTCOME_IS[r.outcome].padEnd(14)} ${String(r.status ?? '—').padEnd(4)} ${r.label}`,
    ),
  });

  const previous = existsSync(outPath) ? JSON.parse(await readFile(outPath, 'utf8')) : null;
  const merged = mergeHistory(previous, results);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(merged, null, 2) + '\n');

  const s = merged.summary;
  console.log(`\n${s.ok} í lagi · ${s.redirect} áframsendingar · ${s.broken} bilaðir · `
    + `${s.unknown} óvissir · ${s.empty} án hlekks`);
  if (s.changedDocuments) console.log(`${s.changedDocuments} skjöl hafa breyst á vefþjóni (Last-Modified)`);
  console.log(`\nSkrifaði ${outPath}`);

  // The monitor reports; it must never fail the deploy. Exit code stays 0.
}
