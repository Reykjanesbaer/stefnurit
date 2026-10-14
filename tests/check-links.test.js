import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'node:http';
import { classify, probe, probeAll, mergeHistory, needsAttention, OUTCOME } from '../scripts/check-links.mjs';

/**
 * The classification matrix is pure, so every status and transport failure is
 * covered here without a network. The live server below then proves the probe
 * actually produces those facts.
 */
describe('classify', () => {
  test.each([
    ['a plain 200', { status: 200 }, OUTCOME.OK],
    ['a 204', { status: 204 }, OUTCOME.OK],
    ['a 200 reached through redirects', { status: 200, redirected: true }, OUTCOME.REDIRECT],
    ['a 404', { status: 404 }, OUTCOME.BROKEN],
    ['a 410 Gone', { status: 410 }, OUTCOME.BROKEN],
    ['a 400', { status: 400 }, OUTCOME.BROKEN],
    ['a 451', { status: 451 }, OUTCOME.BROKEN],
  ])('%s is %s', (_name, facts, expected) => {
    expect(classify(facts)).toBe(expected);
  });

  // These mean "the runner could not tell", which is not the same as "the
  // document is gone". A CI IP getting filtered must never fail a build.
  test.each([
    ['a 401', { status: 401 }],
    ['a 403', { status: 403 }],
    ['a 408', { status: 408 }],
    ['a 429', { status: 429 }],
    ['a 500', { status: 500 }],
    ['a 503', { status: 503 }],
    ['a timeout', { timedOut: true }],
    ['a connection reset', { errorCode: 'ECONNRESET' }],
  ])('%s is unknown, not broken', (_name, facts) => {
    expect(classify(facts)).toBe(OUTCOME.UNKNOWN);
  });

  test.each([
    ['DNS failure', { errorCode: 'ENOTFOUND' }],
    ['DNS temporary failure', { errorCode: 'EAI_AGAIN' }],
    ['an expired certificate', { errorCode: 'CERT_HAS_EXPIRED' }],
    ['a certificate for the wrong host', { errorCode: 'ERR_TLS_CERT_ALTNAME_INVALID' }],
    ['a self-signed certificate', { errorCode: 'DEPTH_ZERO_SELF_SIGNED_CERT' }],
    ['a redirect off https', { insecureRedirect: true }],
    ['a redirect loop', { redirectLoop: true }],
    ['too many redirects', { tooManyRedirects: true }],
  ])('%s is broken', (_name, facts) => {
    expect(classify(facts)).toBe(OUTCOME.BROKEN);
  });

  test('a bare 3xx with nowhere to go is unknown', () => {
    expect(classify({ status: 301 })).toBe(OUTCOME.UNKNOWN);
  });
});

describe('probe against a live server', () => {
  let origin;
  let server;
  let headCount = 0;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const path = req.url;
      if (req.method === 'HEAD') headCount += 1;
      if (path === '/ok.pdf') return res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': '1024', 'last-modified': 'Wed, 01 Jan 2025 10:00:00 GMT' }).end();
      if (path === '/gone.pdf') return res.writeHead(404).end();
      if (path === '/retired.pdf') return res.writeHead(410).end();
      if (path === '/forbidden.pdf') return res.writeHead(403).end();
      if (path === '/outage') return res.writeHead(503).end();
      if (path === '/moved.pdf') return res.writeHead(301, { location: '/ok.pdf' }).end();
      if (path === '/loop-a') return res.writeHead(302, { location: '/loop-b' }).end();
      if (path === '/loop-b') return res.writeHead(302, { location: '/loop-a' }).end();
      if (path === '/head-hostile.pdf') {
        if (req.method === 'HEAD') return res.writeHead(405).end();
        return res.writeHead(200, { 'content-type': 'application/pdf' }).end();
      }
      if (path === '/slow') return; // never answers
      res.writeHead(404).end();
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => server.close());

  // requireHttps:false drives the local http server through exactly the same
  // redirect, fallback, retry and parsing code production uses.
  const local = { requireHttps: false, perHostDelayMs: 0, maxAttempts: 1 };

  test('a plain http link is refused without a request when https is required', async () => {
    const before = headCount;
    const result = await probe(`${origin}/ok.pdf`);
    expect(result.outcome).toBe(OUTCOME.BROKEN);
    expect(result.note).toBe('ekki https');
    expect(headCount).toBe(before);
  });

  test('a reachable file is ok, with its metadata captured', async () => {
    const result = await probe(`${origin}/ok.pdf`, local);
    expect(result.outcome).toBe(OUTCOME.OK);
    expect(result).toMatchObject({
      status: 200,
      contentType: 'application/pdf',
      size: 1024,
      lastModified: 'Wed, 01 Jan 2025 10:00:00 GMT',
      redirects: 0,
    });
    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test.each([
    ['/gone.pdf', OUTCOME.BROKEN, 404],
    ['/retired.pdf', OUTCOME.BROKEN, 410],
    ['/forbidden.pdf', OUTCOME.UNKNOWN, 403],
    ['/outage', OUTCOME.UNKNOWN, 503],
  ])('%s is %s', async (path, outcome, status) => {
    const result = await probe(`${origin}${path}`, local);
    expect(result.outcome).toBe(outcome);
    expect(result.status).toBe(status);
  });

  test('a redirect is followed and the final URL recorded', async () => {
    const result = await probe(`${origin}/moved.pdf`, local);
    expect(result.outcome).toBe(OUTCOME.REDIRECT);
    expect(result.finalUrl).toBe(`${origin}/ok.pdf`);
    expect(result.redirects).toBe(1);
  });

  test('a redirect loop is caught rather than followed forever', async () => {
    const result = await probe(`${origin}/loop-a`, local);
    expect(result.outcome).toBe(OUTCOME.BROKEN);
    expect(result.note).toBe('áframsendingarlykkja');
  });

  // A 403 on HEAD is extremely common and says nothing about the document.
  test('a server that refuses HEAD is retried with GET, not called broken', async () => {
    const result = await probe(`${origin}/head-hostile.pdf`, local);
    expect(result.outcome).toBe(OUTCOME.OK);
    expect(result.status).toBe(200);
  });

  test('a hung request times out as unknown instead of hanging the run', async () => {
    const result = await probe(`${origin}/slow`, { ...local, timeoutMs: 150 });
    expect(result.outcome).toBe(OUTCOME.UNKNOWN);
    expect(result.errorCode).toBe('ETIMEDOUT');
  });

  test('probeAll keeps results aligned with their entries', async () => {
    const entries = [
      { id: 'a', label: 'A', href: `${origin}/ok.pdf` },
      { id: 'b', label: 'B', href: `${origin}/gone.pdf` },
      { id: 'c', label: 'C', href: '' },
    ];
    const results = await probeAll(entries, local);
    expect(results.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(results.map((r) => r.outcome)).toEqual([OUTCOME.OK, OUTCOME.BROKEN, OUTCOME.EMPTY]);
  });

  // One request per host at a time: these servers belong to a municipality, not
  // to us, and a burst of parallel requests every week is rude.
  test('requests to one host are serialised, not fired in parallel', async () => {
    let inFlight = 0;
    let peak = 0;
    const counting = createServer((req, res) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      setTimeout(() => { inFlight -= 1; res.writeHead(200).end(); }, 40);
    });
    await new Promise((resolve) => counting.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${counting.address().port}`;
    const entries = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, label: `N${i}`, href: `${base}/${i}.pdf` }));

    await probeAll(entries, { requireHttps: false, perHostDelayMs: 1, maxAttempts: 1 });
    counting.close();
    expect(peak).toBe(1);
  });

  test('an empty href is reported as empty, not probed', async () => {
    expect((await probe('')).outcome).toBe(OUTCOME.EMPTY);
  });

  test('an unreachable host is broken (DNS)', async () => {
    const result = await probe('https://invalid.invalid.invalid/x.pdf', { maxAttempts: 1, timeoutMs: 4000 });
    expect(result.outcome).toBe(OUTCOME.BROKEN);
  });
});

describe('mergeHistory', () => {
  const result = (id, outcome, extra = {}) => ({ id, label: id, href: `https://x.is/${id}`, outcome, status: 200, ...extra });

  test('a first run starts every counter at zero or one', () => {
    const report = mergeHistory(null, [result('a', OUTCOME.OK), result('b', OUTCOME.BROKEN)]);
    expect(report.links.find((l) => l.id === 'a').consecutiveFailures).toBe(0);
    expect(report.links.find((l) => l.id === 'b').consecutiveFailures).toBe(1);
  });

  test('consecutive failures accumulate and reset on recovery', () => {
    let report = mergeHistory(null, [result('a', OUTCOME.BROKEN)]);
    report = mergeHistory(report, [result('a', OUTCOME.BROKEN)]);
    report = mergeHistory(report, [result('a', OUTCOME.BROKEN)]);
    expect(report.links[0].consecutiveFailures).toBe(3);

    report = mergeHistory(report, [result('a', OUTCOME.OK)]);
    expect(report.links[0].consecutiveFailures).toBe(0);
  });

  test('an unknown outcome also counts as a failure for the threshold', () => {
    let report = mergeHistory(null, [result('a', OUTCOME.UNKNOWN)]);
    report = mergeHistory(report, [result('a', OUTCOME.UNKNOWN)]);
    expect(report.links[0].consecutiveFailures).toBe(2);
  });

  // A PDF replaced at the same URL is invisible in the document but matters:
  // the policy people linked to may no longer be the one residents open.
  test('a changed Last-Modified is flagged with the previous value', () => {
    const first = mergeHistory(null, [result('a', OUTCOME.OK, { lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT' })]);
    const second = mergeHistory(first, [result('a', OUTCOME.OK, { lastModified: 'Tue, 02 Jan 2025 00:00:00 GMT' })]);
    expect(second.links[0].lastModifiedChanged).toBe(true);
    expect(second.links[0].previousLastModified).toBe('Mon, 01 Jan 2024 00:00:00 GMT');
    expect(second.summary.changedDocuments).toBe(1);
  });

  test('an unchanged Last-Modified is not flagged', () => {
    const stamp = 'Mon, 01 Jan 2024 00:00:00 GMT';
    const first = mergeHistory(null, [result('a', OUTCOME.OK, { lastModified: stamp })]);
    const second = mergeHistory(first, [result('a', OUTCOME.OK, { lastModified: stamp })]);
    expect(second.links[0].lastModifiedChanged).toBe(false);
  });

  test('the summary counts every outcome', () => {
    const report = mergeHistory(null, [
      result('a', OUTCOME.OK), result('b', OUTCOME.OK), result('c', OUTCOME.REDIRECT),
      result('d', OUTCOME.BROKEN), result('e', OUTCOME.UNKNOWN), result('f', OUTCOME.EMPTY),
    ]);
    expect(report.summary).toMatchObject({ total: 6, ok: 2, redirect: 1, broken: 1, unknown: 1, empty: 1 });
  });
});

describe('needsAttention', () => {
  const report = (links) => ({ links });

  test('a broken link is raised immediately', () => {
    const flagged = needsAttention(report([{ id: 'a', outcome: OUTCOME.BROKEN, consecutiveFailures: 1 }]));
    expect(flagged.map((l) => l.id)).toEqual(['a']);
  });

  // "unknown" is usually the runner being filtered, so it has to persist before
  // anyone is woken up about it.
  test('an unknown link waits for three runs', () => {
    expect(needsAttention(report([{ id: 'a', outcome: OUTCOME.UNKNOWN, consecutiveFailures: 2 }]))).toEqual([]);
    expect(needsAttention(report([{ id: 'a', outcome: OUTCOME.UNKNOWN, consecutiveFailures: 3 }]))).toHaveLength(1);
  });

  test('healthy links are never raised', () => {
    expect(needsAttention(report([
      { id: 'a', outcome: OUTCOME.OK, consecutiveFailures: 0 },
      { id: 'b', outcome: OUTCOME.REDIRECT, consecutiveFailures: 0 },
    ]))).toEqual([]);
  });
});
