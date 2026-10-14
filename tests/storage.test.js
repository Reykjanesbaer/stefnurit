import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { createMockGitHub } from './integration/mock-github-server.mjs';
import { GitHubStorage } from '../admin/src/storage/github-storage.js';
import { GitHubClient, GitHubError, ERROR_KIND, roleFromPermissions, parseNextLink } from '../admin/src/storage/github-client.js';
import { encodeBase64, decodeBase64 } from '../admin/src/storage/storage-adapter.js';

let mock;
let origin;

const config = (apiBase) => ({
  owner: 'Reykjanesbaer', repo: 'stefnurit', defaultBranch: 'main',
  apiBase, siteUrl: 'http://127.0.0.1:1', documentPath: 'src/data/stefnurit.json',
  draftBranchPrefix: 'stefnurit/draft-', paths: { linkStatus: 'data/link-status.json' },
});

const storageFor = (token) => new GitHubStorage({ token, config: config(origin) });

beforeAll(async () => {
  mock = createMockGitHub();
  origin = await mock.listen();
});
afterAll(() => mock.close());
afterEach(async () => { await fetch(`${origin}/__mock/reset`, { method: 'POST' }); });

describe('base64 round-trip', () => {
  // btoa alone mangles every non-ASCII byte, which is most of this document.
  test('survives the Icelandic alphabet', () => {
    const text = 'Þjónustu- og gæðastefna — ð þ æ ö á é í ó ú ý Ð Þ Æ Ö';
    expect(decodeBase64(encodeBase64(text))).toBe(text);
  });

  test('survives the whole shipped document', async () => {
    const { readFileSync } = await import('node:fs');
    const raw = readFileSync(new URL('../src/data/stefnurit.json', import.meta.url), 'utf8');
    expect(decodeBase64(encodeBase64(raw))).toBe(raw);
  });
});

describe('roleFromPermissions', () => {
  test.each([
    [{ admin: true, push: true, pull: true }, 'publisher'],
    [{ maintain: true, push: true, pull: true }, 'publisher'],
    [{ push: true, pull: true }, 'editor'],
    [{ pull: true }, 'viewer'],
    [{}, 'viewer'],
    [null, 'viewer'],
    [undefined, 'viewer'],
  ])('%o -> %s', (permissions, expected) => {
    expect(roleFromPermissions(permissions)).toBe(expected);
  });
});

describe('parseNextLink', () => {
  test('finds the next page', () => {
    const header = '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=9>; rel="last"';
    expect(parseNextLink(header)).toBe('https://api.github.com/x?page=2');
  });
  test('returns null on the last page', () => {
    expect(parseNextLink('<https://api.github.com/x?page=1>; rel="prev"')).toBeNull();
    expect(parseNextLink(null)).toBeNull();
  });
});

describe('whoAmI', () => {
  test.each([
    ['test-token-publisher', 'aron5109', 'publisher'],
    ['test-token-editor', 'ritstjori', 'editor'],
    ['test-token-viewer', 'ahorfandi', 'viewer'],
  ])('%s signs in as %s with role %s', async (token, login, role) => {
    const identity = await storageFor(token).whoAmI();
    expect(identity).toMatchObject({ login, role, repositoryIsPublic: true });
  });

  test('an expired token is reported as unauthorized, not as a crash', async () => {
    await expect(storageFor('test-token-expired').whoAmI())
      .rejects.toMatchObject({ kind: ERROR_KIND.UNAUTHORIZED });
  });

  test('the Icelandic message tells the person what to do', async () => {
    const error = await storageFor('test-token-expired').whoAmI().catch((e) => e);
    expect(error.message).toContain('útrunninn');
    expect(error.message).toContain('nýjan');
  });
});

describe('readDocument', () => {
  test('reads, migrates and validates in one go', async () => {
    const loaded = await storageFor('test-token-editor').readDocument();
    expect(loaded.document.schemaVersion).toBe(1);
    expect(loaded.validation.ok).toBe(true);
    expect(loaded.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  test('Icelandic characters survive the round trip from the API', async () => {
    const loaded = await storageFor('test-token-editor').readDocument();
    const text = JSON.stringify(loaded.document);
    expect(text).toContain('Þjónustu- og gæðastefna');
    expect(text).toContain('Stefna Reykjanesbæjar í skjalamálum');
  });

  test('a missing branch is notFound, not a crash', async () => {
    await expect(storageFor('test-token-editor').readDocument({ ref: 'engin-grein' }))
      .rejects.toMatchObject({ kind: ERROR_KIND.NOT_FOUND });
  });
});

describe('drafts', () => {
  test('somebody with no draft gets null, not an error', async () => {
    expect(await storageFor('test-token-editor').readDraft({ login: 'ritstjori' })).toBeNull();
  });

  test('saving creates the branch and the draft reads back', async () => {
    const storage = storageFor('test-token-editor');
    const loaded = await storage.readDocument();
    loaded.document.sections[0].items[0].label = 'Breytt í drögum';

    const saved = await storage.saveDraft({
      login: 'ritstjori', document: loaded.document, sha: loaded.sha, message: 'Prófun',
    });
    expect(saved.branch).toBe('stefnurit/draft-ritstjori');

    const draft = await storage.readDraft({ login: 'ritstjori' });
    expect(draft.document.sections[0].items[0].label).toBe('Breytt í drögum');
  });

  test('the draft is written in the canonical format', async () => {
    const storage = storageFor('test-token-editor');
    const loaded = await storage.readDocument();
    await storage.saveDraft({ login: 'ritstjori', document: loaded.document, sha: loaded.sha, message: 'x' });
    const draft = await storage.readDraft({ login: 'ritstjori' });
    const { formatJson } = await import('../src/format.js');
    expect(draft.raw).toBe(formatJson(draft.document));
  });

  // The case the whole optimistic-concurrency path exists for.
  test('a stale sha is reported as a conflict, never silently overwritten', async () => {
    const storage = storageFor('test-token-editor');
    const loaded = await storage.readDocument();
    await storage.ensureDraftBranch({ login: 'ritstjori' });

    const theirs = structuredClone(loaded.document);
    theirs.sections[0].items[0].label = 'Þeirra breyting';
    const { formatJson } = await import('../src/format.js');
    await fetch(`${origin}/__mock/control`, {
      method: 'POST',
      body: JSON.stringify({ concurrentWrite: formatJson(theirs) }),
    });

    await expect(storage.saveDraft({
      login: 'ritstjori', document: loaded.document, sha: loaded.sha, message: 'Mitt',
    })).rejects.toMatchObject({ kind: ERROR_KIND.CONFLICT });
  });

  test('a viewer cannot write, and is told so', async () => {
    const storage = storageFor('test-token-viewer');
    const loaded = await storage.readDocument();
    await expect(storage.saveDraft({
      login: 'ahorfandi', document: loaded.document, sha: loaded.sha, message: 'x',
    })).rejects.toMatchObject({ kind: ERROR_KIND.FORBIDDEN });
  });
});

describe('history', () => {
  test('lists commits that touched the document', async () => {
    const entries = await storageFor('test-token-editor').history({ limit: 10 });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toMatchObject({ author: expect.any(String), short: expect.stringMatching(/^[0-9a-f]{7}$/) });
  });
});

describe('client behaviour', () => {
  test('a second identical read is served from the ETag cache as a 304', async () => {
    const client = new GitHubClient({ token: 'test-token-editor', apiBase: origin });
    const first = await client.request('/user');
    const second = await client.request('/user');
    expect(first.notModified).toBe(false);
    expect(second.notModified).toBe(true);
    expect(second.data.login).toBe(first.data.login);
  });

  test('rate-limit exhaustion is distinguished from plain forbidden', async () => {
    await fetch(`${origin}/__mock/control`, { method: 'POST', body: JSON.stringify({ forceRateLimit: true }) });
    const error = await storageFor('test-token-editor').whoAmI().catch((e) => e);
    expect(error.kind).toBe(ERROR_KIND.RATE_LIMITED);
    expect(error.resetAt).toMatch(/^\d{4}-/);
  });

  test('a 5xx is a server error, so the UI can offer a retry', async () => {
    await fetch(`${origin}/__mock/control`, { method: 'POST', body: JSON.stringify({ forceServerError: true }) });
    await expect(storageFor('test-token-editor').whoAmI())
      .rejects.toMatchObject({ kind: ERROR_KIND.SERVER });
  });

  test('a dropped connection is a network error, never a lost draft', async () => {
    const client = new GitHubClient({
      token: 't', apiBase: origin,
      fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')),
    });
    const error = await client.request('/user').catch((e) => e);
    expect(error.kind).toBe(ERROR_KIND.NETWORK);
    expect(error.message).toContain('óskemmt');
  });

  test('no token at all is unauthorized before any request is made', async () => {
    const client = new GitHubClient({ apiBase: origin, fetchImpl: () => { throw new Error('should not be called'); } });
    await expect(client.request('/user')).rejects.toMatchObject({ kind: ERROR_KIND.UNAUTHORIZED });
  });

  test('the token is sent to the API and nowhere else', async () => {
    const seen = [];
    const client = new GitHubClient({
      token: 'secret-token', apiBase: origin,
      fetchImpl: async (url, init) => {
        seen.push({ url: String(url), auth: init.headers.authorization });
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    await client.request('/user');
    expect(seen).toHaveLength(1);
    expect(seen[0].url.startsWith(origin)).toBe(true);
    expect(seen[0].auth).toBe('Bearer secret-token');
  });

  test('the token never appears in a URL', async () => {
    const urls = [];
    const client = new GitHubClient({
      token: 'secret-token', apiBase: origin,
      fetchImpl: async (url) => {
        urls.push(String(url));
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    await client.request('/user');
    await client.request('/repos/a/b');
    expect(urls.every((u) => !u.includes('secret-token'))).toBe(true);
  });
});
