/**
 * The few GitHub REST calls the CI scripts make.
 *
 * Kept tiny and dependency-free on purpose: this runs with GITHUB_TOKEN inside
 * Actions, and the fewer moving parts between a token and api.github.com the
 * easier the supply chain is to reason about.
 */
const API = process.env.GITHUB_API_URL || 'https://api.github.com';

export function repoCoordinates() {
  const slug = process.env.GITHUB_REPOSITORY;
  if (!slug) throw new Error('GITHUB_REPOSITORY is not set');
  const [owner, repo] = slug.split('/');
  return { owner, repo };
}

export async function api(path, { method = 'GET', body, token = process.env.GITHUB_TOKEN } = {}) {
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'stefnurit-ci',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GitHub ${method} ${path} -> ${response.status} ${response.statusText} ${text.slice(0, 400)}`);
  }
  return response.status === 204 ? null : response.json();
}

/**
 * Create or update one comment identified by a hidden marker.
 *
 * Posting a fresh comment on every push buries the conversation under a wall of
 * bot noise, so each script owns exactly one comment and edits it in place.
 */
export async function upsertComment({ issueNumber, marker, body, token }) {
  const { owner, repo } = repoCoordinates();
  const full = `${body}\n\n<!-- ${marker} -->`;

  const existing = await api(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`, { token },
  );
  const mine = existing.find((comment) => comment.body?.includes(`<!-- ${marker} -->`));

  if (mine) {
    await api(`/repos/${owner}/${repo}/issues/comments/${mine.id}`, {
      method: 'PATCH', body: { body: full }, token,
    });
    return { action: 'updated', id: mine.id };
  }
  const created = await api(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST', body: { body: full }, token,
  });
  return { action: 'created', id: created.id };
}

/** The pull request number from the Actions event payload. */
export async function pullRequestNumber() {
  const direct = Number(process.env.PR_NUMBER);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) return null;
  const { readFile } = await import('node:fs/promises');
  try {
    const event = JSON.parse(await readFile(path, 'utf8'));
    return event.pull_request?.number ?? event.number ?? null;
  } catch {
    return null;
  }
}
