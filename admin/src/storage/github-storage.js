/**
 * The GitHub implementation of StorageAdapter.
 *
 * Drafts are branches (`stefnurit/draft-<login>`), publishing is a pull request,
 * history is `git log`, and the audit trail is the commit list. Nothing is
 * stored that GitHub does not already store.
 */

import { StorageAdapter, encodeBase64, decodeBase64 } from './storage-adapter.js';
import { GitHubClient, GitHubError, ERROR_KIND, ERROR_MESSAGE_IS, roleFromPermissions } from './github-client.js';
import { migrate } from '../../../src/migrate.js';
import { validate } from '../../../src/validate.js';
import { formatJson } from '../../../src/format.js';

export class GitHubStorage extends StorageAdapter {
  #client;
  #config;

  constructor({ token, config, fetchImpl }) {
    super();
    this.#config = config;
    this.#client = new GitHubClient({ token, apiBase: config.apiBase, fetchImpl });
  }

  get client() { return this.#client; }
  get config() { return this.#config; }

  setToken(token) { this.#client.setToken(token); }

  #repo() { return `/repos/${this.#config.owner}/${this.#config.repo}`; }
  draftBranch(login) { return `${this.#config.draftBranchPrefix}${login}`; }

  async whoAmI() {
    const [user, repo] = await Promise.all([
      this.#client.request('/user'),
      this.#client.request(this.#repo()),
    ]);
    return {
      login: user.data.login,
      name: user.data.name || user.data.login,
      avatarUrl: user.data.avatar_url,
      role: roleFromPermissions(repo.data.permissions),
      permissions: repo.data.permissions ?? {},
      repositoryIsPublic: repo.data.private === false,
      defaultBranch: repo.data.default_branch,
    };
  }

  /**
   * Read the document from a ref, migrating it on the way in.
   *
   * An invalid document is returned rather than thrown on: the editor is
   * exactly the tool for fixing it, so refusing to load it would be the one
   * thing guaranteed not to help.
   */
  async readDocument({ ref } = {}) {
    const branch = ref ?? this.#config.defaultBranch;
    const path = encodeURIComponent(this.#config.documentPath).replace(/%2F/g, '/');
    const { data } = await this.#client.request(
      `${this.#repo()}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    );

    const text = decodeBase64(data.content);
    const parsed = JSON.parse(text);
    const migrated = migrate(parsed);

    return {
      document: migrated.ok ? migrated.doc : parsed,
      migrationFailed: migrated.ok ? null : migrated.reason,
      validation: validate(migrated.ok ? migrated.doc : parsed),
      sha: data.sha,
      commit: data.sha,
      ref: branch,
      raw: text,
    };
  }

  async readDraft({ login }) {
    try {
      return await this.readDocument({ ref: this.draftBranch(login) });
    } catch (error) {
      // No branch yet is the normal state for somebody who has not edited.
      if (error instanceof GitHubError && error.kind === ERROR_KIND.NOT_FOUND) return null;
      throw error;
    }
  }

  /** The commit a branch currently points at. */
  async headCommit(ref) {
    const { data } = await this.#client.request(
      `${this.#repo()}/commits/${encodeURIComponent(ref)}`, { cache: true },
    );
    return { sha: data.sha, message: data.commit.message, author: data.commit.author, date: data.commit.author?.date };
  }

  async ensureDraftBranch({ login, fromRef }) {
    const branch = this.draftBranch(login);
    try {
      await this.#client.request(`${this.#repo()}/git/ref/heads/${encodeURIComponent(branch)}`, { cache: false });
      return { branch, created: false };
    } catch (error) {
      if (!(error instanceof GitHubError) || error.kind !== ERROR_KIND.NOT_FOUND) throw error;
    }
    const base = await this.headCommit(fromRef ?? this.#config.defaultBranch);
    await this.#client.request(`${this.#repo()}/git/refs`, {
      method: 'POST',
      body: { ref: `refs/heads/${branch}`, sha: base.sha },
    });
    return { branch, created: true };
  }

  /**
   * Write the draft branch.
   *
   * `sha` is the blob the editor loaded. GitHub rejects the write if it has
   * moved, which is the whole point: a blind retry would silently discard
   * whatever the other person wrote.
   */
  async saveDraft({ login, document, sha, message }) {
    const { branch } = await this.ensureDraftBranch({ login });
    const path = encodeURIComponent(this.#config.documentPath).replace(/%2F/g, '/');
    const { data } = await this.#client.request(`${this.#repo()}/contents/${path}`, {
      method: 'PUT',
      body: {
        message: message || 'Uppfæra drög að stefnuriti',
        content: encodeBase64(formatJson(document)),
        branch,
        ...(sha ? { sha } : {}),
      },
    });
    return { sha: data.content.sha, commit: data.commit.sha, branch };
  }

  /**
   * The weekly link report.
   *
   * Resolved relative to the page, not from site.config.json's absolute URL:
   * the panel ships with `connect-src 'self' https://api.github.com`, so an
   * absolute fetch at the Pages origin is blocked by its own policy. The panel
   * and the report are served from the same site, so a relative path is both
   * correct and allowed.
   */
  async linkStatus() {
    const candidates = [
      new URL(`../${this.#config.paths.linkStatus}`, document.baseURI).href,
      new URL(`./${this.#config.paths.linkStatus}`, document.baseURI).href,
    ];
    for (const url of candidates) {
      try {
        const response = await fetch(url, { cache: 'no-cache' });
        if (!response.ok) continue;
        return await response.json();
      } catch {
        // Not deployed yet, or blocked. The panel shows "engin skýrsla".
      }
    }
    return null;
  }

  async history({ limit = 30 } = {}) {
    const path = encodeURIComponent(this.#config.documentPath);
    const { data } = await this.#client.request(
      `${this.#repo()}/commits?path=${path}&per_page=${limit}`,
    );
    return data.map((entry) => ({
      sha: entry.sha,
      short: entry.sha.slice(0, 7),
      message: entry.commit.message.split('\n')[0],
      author: entry.commit.author?.name ?? entry.author?.login ?? 'óþekktur',
      login: entry.author?.login ?? null,
      date: entry.commit.author?.date ?? null,
      url: entry.html_url,
    }));
  }

  /**
   * Settings the panel can check and warn about.
   *
   * Branch protection needs admin rights to read, so a non-admin simply gets
   * "unknown" rather than a scary warning they cannot act on.
   */
  async repositorySettings() {
    const result = { protectionChecked: false, mainProtected: null, requiredChecks: [] };
    try {
      const { data } = await this.#client.request(
        `${this.#repo()}/branches/${encodeURIComponent(this.#config.defaultBranch)}/protection`,
        { cache: false },
      );
      result.protectionChecked = true;
      result.mainProtected = true;
      result.requiredChecks = data?.required_status_checks?.contexts ?? [];
    } catch (error) {
      if (error instanceof GitHubError && error.kind === ERROR_KIND.NOT_FOUND) {
        // 404 here means "no protection configured" when the caller may read it.
        result.protectionChecked = true;
        result.mainProtected = false;
      }
      // 403 means the token may not look; leave mainProtected null.
    }
    return result;
  }

  async collaborators() {
    try {
      const data = await this.#client.paginate(`${this.#repo()}/collaborators?per_page=100`);
      return {
        permitted: true,
        entries: data
          .filter((person) => person.permissions?.push || person.permissions?.admin)
          .map((person) => ({
            login: person.login,
            url: person.html_url,
            role: person.permissions?.admin ? 'publisher' : 'editor',
          })),
      };
    } catch (error) {
      if (error instanceof GitHubError
        && [ERROR_KIND.FORBIDDEN, ERROR_KIND.NOT_FOUND].includes(error.kind)) {
        return { permitted: false, entries: [], reason: error.message };
      }
      throw error;
    }
  }

  async revision({ sha }) {
    const loaded = await this.readDocument({ ref: sha });
    return loaded.document;
  }
}

export { GitHubError, ERROR_KIND, ERROR_MESSAGE_IS };
