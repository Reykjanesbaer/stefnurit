import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'node:http';
import { probe, checkLinks } from '../scripts/check-links.mjs';

let origin;
let server;

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url;
    if (path === '/ok.pdf') return res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF');
    if (path === '/gone.pdf') return res.writeHead(404).end();
    if (path === '/server-error') return res.writeHead(500).end();
    if (path === '/moved.pdf') return res.writeHead(302, { location: '/ok.pdf' }).end();
    // Mimics the many servers that refuse HEAD but serve GET perfectly well.
    if (path === '/head-hostile.pdf') {
      if (req.method === 'HEAD') return res.writeHead(405).end();
      return res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF');
    }
    if (path === '/slow') return; // never answers — exercises the timeout
    res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server.close());

describe('probe', () => {
  test('a reachable file is OK', async () => {
    expect(await probe(`${origin}/ok.pdf`)).toMatchObject({ state: 'OK', status: 200 });
  });

  test('a 404 is BROKEN', async () => {
    expect(await probe(`${origin}/gone.pdf`)).toMatchObject({ state: 'BROKEN', status: 404 });
  });

  test('a 500 is BROKEN', async () => {
    expect(await probe(`${origin}/server-error`)).toMatchObject({ state: 'BROKEN', status: 500 });
  });

  test('a redirect is reported with where it lands', async () => {
    const result = await probe(`${origin}/moved.pdf`);
    expect(result.state).toBe('REDIRECT');
    expect(result.final).toBe(`${origin}/ok.pdf`);
  });

  test('a server that refuses HEAD is retried with GET, not called broken', async () => {
    expect(await probe(`${origin}/head-hostile.pdf`)).toMatchObject({ state: 'OK', status: 200 });
  });

  test('an unreachable host is BROKEN rather than a crash', async () => {
    const result = await probe('https://invalid.invalid.invalid/x.pdf');
    expect(result.state).toBe('BROKEN');
  });

  test('a hung request times out instead of hanging the run', async () => {
    const result = await probe(`${origin}/slow`, { timeout: 150 });
    expect(result).toMatchObject({ state: 'BROKEN', detail: 'timeout' });
  });
});

describe('checkLinks', () => {
  test('walks the whole document and flags empty hrefs separately', async () => {
    const document = {
      title: 'T',
      sections: [
        { id: 'rot', kind: 'root', items: [{ id: 'a', label: 'A', href: `${origin}/ok.pdf` }] },
        {
          id: 'mal',
          kind: 'columns',
          columns: [{
            id: 'd1',
            cards: [{
              id: 'k1',
              title: 'K',
              items: [
                { id: 'b', label: 'B', href: `${origin}/gone.pdf` },
                { id: 'c', label: 'C', href: '' },
              ],
            }],
          }],
        },
      ],
    };
    const results = await checkLinks(document, { timeout: 2000 });
    expect(results).toHaveLength(3);
    expect(Object.fromEntries(results.map((r) => [r.id, r.state])))
      .toEqual({ a: 'OK', b: 'BROKEN', c: 'EMPTY' });
  });
});
