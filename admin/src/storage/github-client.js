/**
 * The only thing in the admin panel that knows HTTP exists.
 *
 * Everything above this file deals in outcomes — `unauthorized`, `conflict`,
 * `rateLimited` — never in status codes, so no view ever grows a `if (status
 * === 409)` branch that somebody later has to find.
 *
 * The token lives in a closure here and is never stored on `window`, never put
 * in a URL, never logged and never sent anywhere but the configured API origin.
 */

/** Thrown for every non-success response, carrying a kind the UI can switch on. */
export class GitHubError extends Error {
  constructor(kind, message, { status = null, detail = null, resetAt = null } = {}) {
    super(message);
    this.name = 'GitHubError';
    this.kind = kind;
    this.status = status;
    this.detail = detail;
    this.resetAt = resetAt;
  }
}

export const ERROR_KIND = {
  UNAUTHORIZED: 'unauthorized',   // 401 — token expired, revoked or mistyped
  FORBIDDEN: 'forbidden',         // 403 that is not a rate limit
  RATE_LIMITED: 'rateLimited',    // 403/429 with the quota exhausted
  NOT_FOUND: 'notFound',          // 404 — or no access, which GitHub also calls 404
  CONFLICT: 'conflict',           // 409/422 — somebody else wrote first
  VALIDATION: 'validation',       // 422 that is not a conflict
  NETWORK: 'network',             // no response at all
  SERVER: 'server',               // 5xx
  UNKNOWN: 'unknown',
};

/** Icelandic text for each failure, written for a person, not a developer. */
export const ERROR_MESSAGE_IS = {
  unauthorized: 'Aðgangslykillinn er útrunninn eða hefur verið afturkallaður. Búðu til nýjan og skráðu þig inn aftur.',
  forbidden: 'Aðgangslykillinn hefur ekki réttindi til þessarar aðgerðar.',
  rateLimited: 'Of margar fyrirspurnir til GitHub í bili.',
  notFound: 'Fannst ekki. Annaðhvort er þetta ekki til eða lykillinn hefur ekki aðgang að geymslunni.',
  conflict: 'Einhver annar breytti skjalinu á meðan. Breytingarnar þínar eru óskemmdar.',
  validation: 'GitHub hafnaði beiðninni.',
  network: 'Náði ekki sambandi við GitHub. Athugaðu nettenginguna — það sem þú hefur skrifað er óskemmt.',
  server: 'GitHub svarar ekki sem stendur. Reyndu aftur eftir smá stund.',
  unknown: 'Óvænt villa í samskiptum við GitHub.',
};

export class GitHubClient {
  #token;
  #apiBase;
  #fetch;
  /** ETag cache: a 304 costs no rate-limit quota, which matters on a 5000/hour budget. */
  #etags = new Map();
  #rateLimit = { remaining: null, limit: null, resetAt: null };

  constructor({ token, apiBase = 'https://api.github.com', fetchImpl } = {}) {
    this.#token = token ?? null;
    this.#apiBase = apiBase.replace(/\/$/, '');
    this.#fetch = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  /** Replace the token without rebuilding the client (used after re-login). */
  setToken(token) {
    this.#token = token ?? null;
    this.#etags.clear();
  }

  get hasToken() { return Boolean(this.#token); }
  get rateLimit() { return { ...this.#rateLimit }; }

  /**
   * One request.
   *
   * @param {string} path  e.g. "/repos/o/r/contents/x.json"
   * @param {{method?, body?, cache?: boolean, accept?: string}} options
   * @returns {Promise<{data: any, status: number, notModified: boolean, headers: Headers}>}
   */
  async request(path, { method = 'GET', body, cache = method === 'GET', accept } = {}) {
    if (!this.#token) {
      throw new GitHubError(ERROR_KIND.UNAUTHORIZED, ERROR_MESSAGE_IS.unauthorized);
    }

    const url = path.startsWith('http') ? path : `${this.#apiBase}${path}`;
    const headers = {
      authorization: `Bearer ${this.#token}`,
      accept: accept ?? 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    };
    if (body) headers['content-type'] = 'application/json';

    const cacheKey = `${method} ${url}`;
    if (cache && this.#etags.has(cacheKey)) {
      headers['if-none-match'] = this.#etags.get(cacheKey).etag;
    }

    let response;
    try {
      response = await this.#fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      // A thrown fetch is a dropped connection, DNS, or the browser refusing
      // the request. Never a reason to lose the editor's work.
      throw new GitHubError(ERROR_KIND.NETWORK, ERROR_MESSAGE_IS.network, { detail: error.message });
    }

    this.#readRateLimit(response.headers);

    if (response.status === 304) {
      return { data: this.#etags.get(cacheKey).data, status: 304, notModified: true, headers: response.headers };
    }

    if (response.ok) {
      const data = response.status === 204 ? null : await this.#parse(response);
      const etag = response.headers.get('etag');
      if (cache && etag) this.#etags.set(cacheKey, { etag, data });
      return { data, status: response.status, notModified: false, headers: response.headers };
    }

    throw await this.#toError(response);
  }

  async #parse(response) {
    const type = response.headers.get('content-type') ?? '';
    if (type.includes('json')) return response.json();
    return response.text();
  }

  #readRateLimit(headers) {
    const remaining = Number(headers.get('x-ratelimit-remaining'));
    const limit = Number(headers.get('x-ratelimit-limit'));
    const reset = Number(headers.get('x-ratelimit-reset'));
    if (Number.isFinite(remaining)) this.#rateLimit.remaining = remaining;
    if (Number.isFinite(limit)) this.#rateLimit.limit = limit;
    if (Number.isFinite(reset)) this.#rateLimit.resetAt = new Date(reset * 1000).toISOString();
  }

  async #toError(response) {
    let detail = null;
    let payload = null;
    try {
      payload = await response.json();
      detail = payload?.message ?? null;
    } catch { /* an error body is a nicety, not a requirement */ }

    // Read the header rather than coercing it: Number(null) is 0, so a header
    // the browser cannot see — CORS hides anything not in
    // Access-Control-Expose-Headers — would make every 403 look like an
    // exhausted quota and tell somebody to wait half an hour over what is
    // actually a missing permission.
    const remainingHeader = response.headers.get('x-ratelimit-remaining');
    const remaining = remainingHeader === null ? null : Number(remainingHeader);
    const resetAt = this.#rateLimit.resetAt;

    // GitHub returns 403 both for "you may not" and for "you have asked too
    // often". The remaining-quota header is what tells them apart.
    if ((response.status === 403 && remaining === 0) || response.status === 429) {
      return new GitHubError(ERROR_KIND.RATE_LIMITED, ERROR_MESSAGE_IS.rateLimited, {
        status: response.status, detail, resetAt,
      });
    }

    const kind = {
      401: ERROR_KIND.UNAUTHORIZED,
      403: ERROR_KIND.FORBIDDEN,
      404: ERROR_KIND.NOT_FOUND,
      409: ERROR_KIND.CONFLICT,
    }[response.status]
      ?? (response.status === 422
        ? (/sha|does not match|stale/i.test(detail ?? '') ? ERROR_KIND.CONFLICT : ERROR_KIND.VALIDATION)
        : response.status >= 500 ? ERROR_KIND.SERVER : ERROR_KIND.UNKNOWN);

    return new GitHubError(kind, ERROR_MESSAGE_IS[kind] ?? ERROR_MESSAGE_IS.unknown, {
      status: response.status, detail, resetAt,
    });
  }

  /**
   * Follow `Link: rel="next"` to the end.
   * Capped, because an unbounded loop against a paginated endpoint is a good
   * way to burn an hour's rate limit by accident.
   */
  async paginate(path, { maxPages = 10, ...options } = {}) {
    const items = [];
    let next = path;
    for (let page = 0; page < maxPages && next; page += 1) {
      const response = await this.request(next, options);
      items.push(...(Array.isArray(response.data) ? response.data : []));
      next = parseNextLink(response.headers.get('link'));
    }
    return items;
  }
}

export function parseNextLink(header) {
  if (!header) return null;
  for (const part of header.split(',')) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part.trim());
    if (match) return match[1];
  }
  return null;
}

/**
 * Role from the repository permissions GitHub reports.
 *
 * The UI hides what a role may not do, but GitHub is the thing that actually
 * enforces it: a token without push simply cannot write, whatever this returns.
 */
export function roleFromPermissions(permissions) {
  if (!permissions) return 'viewer';
  if (permissions.admin || permissions.maintain) return 'publisher';
  if (permissions.push) return 'editor';
  return 'viewer';
}

export const ROLE_LABEL_IS = {
  viewer: 'Áhorfandi',
  editor: 'Ritstjóri',
  publisher: 'Útgefandi',
};

export const ROLE_DESCRIPTION_IS = {
  viewer: 'Þú getur skoðað allt en ekki vistað breytingar.',
  editor: 'Þú getur breytt og vistað drög, og sent þau til birtingar.',
  publisher: 'Þú getur breytt, vistað drög og birt þau.',
};
