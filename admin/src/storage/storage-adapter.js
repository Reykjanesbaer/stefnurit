/**
 * The seam between the admin panel and wherever the document actually lives.
 *
 * Every view talks only to this interface. If the municipality later moves to
 * Entra ID and a database, `github-storage.js` is replaced and nothing else
 * changes — the editor, the merge logic and the nine views never learn that
 * GitHub existed.
 *
 * Methods return plain data or throw `GitHubError`-shaped errors with a `kind`.
 * No method returns an HTTP response.
 */

/**
 * @typedef {object} LoadedDocument
 * @property {object} document  the parsed, migrated document
 * @property {string} sha       blob sha, sent back on write for optimistic concurrency
 * @property {string} commit    the commit the content came from
 * @property {string} ref       the branch it was read from
 */

/**
 * @typedef {object} Identity
 * @property {string} login
 * @property {string} name
 * @property {string} avatarUrl
 * @property {'viewer'|'editor'|'publisher'} role
 * @property {boolean} repositoryIsPublic
 */

export class StorageAdapter {
  /** @returns {Promise<Identity>} */
  async whoAmI() { throw new Error('not implemented'); }

  /** @returns {Promise<LoadedDocument>} */
  async readDocument(_options) { throw new Error('not implemented'); }

  /** @returns {Promise<LoadedDocument|null>} null when this person has no draft */
  async readDraft(_options) { throw new Error('not implemented'); }

  /** @returns {Promise<{sha: string, commit: string}>} */
  async saveDraft(_options) { throw new Error('not implemented'); }

  /** @returns {Promise<{number: number, url: string, created: boolean}>} */
  async publish(_options) { throw new Error('not implemented'); }

  /** @returns {Promise<{state: string, conclusion: string|null, url: string|null}>} */
  async checkStatus(_options) { throw new Error('not implemented'); }

  /** @returns {Promise<{sha: string, mergedAt: string}>} */
  async merge(_options) { throw new Error('not implemented'); }

  /** @returns {Promise<Array<{sha, short, author, date, message}>>} */
  async history(_options) { throw new Error('not implemented'); }

  /** @returns {Promise<object>} the document as it was at that commit */
  async revision(_options) { throw new Error('not implemented'); }

  /** @returns {Promise<object>} the weekly link report */
  async linkStatus() { throw new Error('not implemented'); }

  /** @returns {Promise<{entries: Array, permitted: boolean}>} */
  async collaborators() { throw new Error('not implemented'); }

  /** @returns {Promise<Array>} merged pull requests, for the audit view */
  async activity(_options) { throw new Error('not implemented'); }

  /** @returns {Promise<{dispatched: boolean, reason?: string}>} */
  async requestLinkCheck() { throw new Error('not implemented'); }
}

/** UTF-8 safe base64 — `btoa` alone mangles ð, þ, æ and every other non-ASCII byte. */
export function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64(base64) {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
