/**
 * A deterministic stand-in for api.github.com.
 *
 * The admin panel is almost entirely GitHub calls, so testing it against the
 * real API would mean a network, a token, and a repository whose state the
 * tests mutate. This serves the handful of endpoints the panel actually uses,
 * from fixtures, with a control surface for forcing the awkward cases —
 * an expired token, an exhausted rate limit, somebody else committing between
 * your read and your write.
 *
 * Tokens select a role, so a test picks its permissions by signing in:
 *   test-token-publisher   admin      — may edit and publish
 *   test-token-editor      push       — may edit, not publish
 *   test-token-viewer      pull only  — may look
 *   test-token-expired                — always 401
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OWNER = 'Reykjanesbaer';
const REPO = 'stefnurit';
const DOCUMENT_PATH = 'src/data/stefnurit.json';

const TOKENS = {
  'test-token-publisher': { login: 'aron5109', name: 'AronG', permissions: { admin: true, maintain: true, push: true, pull: true } },
  'test-token-editor': { login: 'ritstjori', name: 'Ritstjóri Bæjarins', permissions: { admin: false, maintain: false, push: true, pull: true } },
  'test-token-viewer': { login: 'ahorfandi', name: 'Áhorfandi', permissions: { admin: false, maintain: false, push: false, pull: true } },
};

const sha = (text) => createHash('sha1').update(text).digest('hex');

export function createMockGitHub({ documentPath, port = 0 } = {}) {
  const baseDocument = readFileSync(
    documentPath ?? new URL('../../src/data/stefnurit.json', import.meta.url), 'utf8',
  );

  /** Everything the mock pretends to remember, reset between tests. */
  const state = {
    branches: new Map([['main', { content: baseDocument, commit: sha(baseDocument + 'main') }]]),
    commits: [{
      sha: sha(baseDocument + 'main'),
      message: 'Uppfæra stefnurit',
      author: 'AronG', login: 'aron5109',
      date: '2026-10-01T09:15:00Z',
    }],
    pulls: [],
    nextPullNumber: 1,
    // Forced conditions, set through /__mock/control.
    rateLimitRemaining: 4999,
    forceRateLimit: false,
    forceServerError: false,
    /** Set to a document string to simulate somebody else committing first. */
    concurrentWrite: null,
    requests: [],
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://mock');
    const path = url.pathname;
    state.requests.push({ method: req.method, path, auth: Boolean(req.headers.authorization) });

    const send = (status, body, headers = {}) => {
      const payload = body === null ? '' : JSON.stringify(body);
      res.writeHead(status, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': String(state.rateLimitRemaining),
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1800),
        ...headers,
      });
      res.end(payload);
    };

    if (req.method === 'OPTIONS') return send(204, null);

    // ---- control surface ----------------------------------------------------
    if (path === '/__mock/control') {
      const body = await readBody(req);
      Object.assign(state, body);
      return send(200, { ok: true });
    }
    if (path === '/__mock/reset') {
      state.branches = new Map([['main', { content: baseDocument, commit: sha(baseDocument + 'main') }]]);
      state.pulls = []; state.nextPullNumber = 1; state.forceRateLimit = false;
      state.forceServerError = false; state.concurrentWrite = null;
      state.rateLimitRemaining = 4999; state.requests = [];
      return send(200, { ok: true });
    }
    if (path === '/__mock/state') {
      return send(200, {
        branches: [...state.branches.keys()],
        pulls: state.pulls,
        requests: state.requests,
      });
    }

    // ---- auth ---------------------------------------------------------------
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return send(401, { message: 'Requires authentication' });
    if (token === 'test-token-expired' || !TOKENS[token]) {
      return send(401, { message: 'Bad credentials' });
    }
    const user = TOKENS[token];

    if (state.forceServerError) return send(502, { message: 'Bad gateway' });
    if (state.forceRateLimit) {
      return send(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0' });
    }
    state.rateLimitRemaining = Math.max(0, state.rateLimitRemaining - 1);

    const repoBase = `/repos/${OWNER}/${REPO}`;

    // ---- identity -----------------------------------------------------------
    if (path === '/user') {
      return etagged(send, req, {
        login: user.login, name: user.name,
        avatar_url: `https://avatars.githubusercontent.com/${user.login}`,
      });
    }

    if (path === repoBase) {
      return etagged(send, req, {
        full_name: `${OWNER}/${REPO}`,
        private: false,
        default_branch: 'main',
        permissions: user.permissions,
        html_url: `https://github.com/${OWNER}/${REPO}`,
      });
    }

    // ---- contents -----------------------------------------------------------
    if (path === `${repoBase}/contents/${DOCUMENT_PATH}`) {
      if (req.method === 'GET') {
        const ref = url.searchParams.get('ref') ?? 'main';
        const branch = state.branches.get(ref) ?? findByCommit(state, ref);
        if (!branch) return send(404, { message: 'Not Found' });
        return etagged(send, req, {
          name: 'stefnurit.json',
          path: DOCUMENT_PATH,
          sha: sha(branch.content),
          content: Buffer.from(branch.content, 'utf8').toString('base64'),
          encoding: 'base64',
      });
      }

      if (req.method === 'PUT') {
        if (!user.permissions.push) return send(403, { message: 'Resource not accessible by personal access token' });
        const body = await readBody(req);
        const branchName = body.branch ?? 'main';
        const branch = state.branches.get(branchName);
        if (!branch) return send(404, { message: 'Branch not found' });

        // Somebody else committing between the read and the write is the case
        // the whole optimistic-concurrency path exists for.
        if (state.concurrentWrite) {
          branch.content = state.concurrentWrite;
          branch.commit = sha(branch.content + Date.now());
          state.concurrentWrite = null;
        }
        if (body.sha && body.sha !== sha(branch.content)) {
          return send(409, { message: `${DOCUMENT_PATH} does not match ${body.sha}` });
        }

        branch.content = Buffer.from(body.content, 'base64').toString('utf8');
        branch.commit = sha(branch.content + Date.now());
        state.commits.unshift({
          sha: branch.commit, message: body.message, author: user.name,
          login: user.login, date: new Date().toISOString(),
        });
        return send(200, {
          content: { sha: sha(branch.content), path: DOCUMENT_PATH },
          commit: { sha: branch.commit },
        });
      }
    }

    // ---- refs ---------------------------------------------------------------
    const refMatch = /^\/repos\/[^/]+\/[^/]+\/git\/ref\/heads\/(.+)$/.exec(path);
    if (refMatch && req.method === 'GET') {
      const name = decodeURIComponent(refMatch[1]);
      const branch = state.branches.get(name);
      if (!branch) return send(404, { message: 'Not Found' });
      return send(200, { ref: `refs/heads/${name}`, object: { sha: branch.commit, type: 'commit' } });
    }

    if (path === `${repoBase}/git/refs` && req.method === 'POST') {
      if (!user.permissions.push) return send(403, { message: 'Resource not accessible by personal access token' });
      const body = await readBody(req);
      const name = body.ref.replace('refs/heads/', '');
      const from = [...state.branches.values()].find((b) => b.commit === body.sha) ?? state.branches.get('main');
      state.branches.set(name, { content: from.content, commit: body.sha });
      return send(201, { ref: body.ref, object: { sha: body.sha } });
    }

    // ---- commits ------------------------------------------------------------
    if (path === `${repoBase}/commits` && req.method === 'GET') {
      const limit = Number(url.searchParams.get('per_page') ?? 30);
      return etagged(send, req, state.commits.slice(0, limit).map((c) => ({
        sha: c.sha,
        html_url: `https://github.com/${OWNER}/${REPO}/commit/${c.sha}`,
        commit: { message: c.message, author: { name: c.author, date: c.date } },
        author: { login: c.login },
      })));
    }

    const commitMatch = /^\/repos\/[^/]+\/[^/]+\/commits\/(.+)$/.exec(path);
    if (commitMatch && req.method === 'GET' && !path.endsWith('/check-runs')) {
      const ref = decodeURIComponent(commitMatch[1]);
      const branch = state.branches.get(ref);
      const commit = branch
        ? state.commits.find((c) => c.sha === branch.commit) ?? state.commits[0]
        : state.commits.find((c) => c.sha === ref);
      if (!commit) return send(404, { message: 'Not Found' });
      return send(200, {
        sha: commit.sha,
        commit: { message: commit.message, author: { name: commit.author, date: commit.date } },
        author: { login: commit.login },
      });
    }

    // ---- collaborators ------------------------------------------------------
    if (path === `${repoBase}/collaborators` && req.method === 'GET') {
      if (!user.permissions.admin) return send(403, { message: 'Must have admin rights' });
      return send(200, [
        { login: 'aron5109', permissions: { admin: true, push: true, pull: true }, html_url: 'https://github.com/aron5109' },
        { login: 'ritstjori', permissions: { admin: false, push: true, pull: true }, html_url: 'https://github.com/ritstjori' },
      ]);
    }

    return send(404, { message: `Mock has no route for ${req.method} ${path}` });
  });

  return {
    server,
    state,
    async listen() {
      await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
      return `http://127.0.0.1:${server.address().port}`;
    },
    close() { server.close(); },
  };
}

/** Serve a 304 when the caller already has the current version. */
function etagged(send, req, body) {
  const tag = `"${sha(JSON.stringify(body))}"`;
  if (req.headers['if-none-match'] === tag) return send(304, null, { etag: tag });
  return send(200, body, { etag: tag });
}

function findByCommit(state, ref) {
  for (const branch of state.branches.values()) if (branch.commit === ref) return branch;
  return null;
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); }
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mock = createMockGitHub({ port: Number(process.env.MOCK_PORT) || 8788 });
  const origin = await mock.listen();
  console.log(`Mock GitHub API at ${origin}`);
}
