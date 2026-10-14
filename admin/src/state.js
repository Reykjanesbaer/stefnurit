/**
 * Everything the panel knows, in one place, with subscribers notified on change.
 *
 * Deliberately not a framework. The panel has nine views and one document; a
 * plain object plus a notify list is enough, and it keeps the dependency count
 * at zero.
 */
export const state = {
  identity: null,       // { login, name, avatarUrl, role, … }
  storage: null,        // the StorageAdapter
  config: null,
  live: null,           // LoadedDocument from the default branch
  draft: null,          // LoadedDocument from this person's draft branch, or null
  linkReport: null,
  view: 'yfirlit',
  error: null,
  busy: false,
};

const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function update(patch) {
  Object.assign(state, patch);
  for (const listener of listeners) listener(state);
}

/**
 * Token handling.
 *
 * In memory by default. "Muna á þessu tæki" opts in to sessionStorage, which a
 * browser clears when the tab closes — localStorage would survive a shared
 * machine being handed to the next person, which is exactly what must not
 * happen. Every access is wrapped: private windows and blocked site data both
 * throw here, and neither is a reason to lose the panel.
 */
const SESSION_KEY = 'stefnurit-token';
let memoryToken = null;

export const tokenStore = {
  get() {
    if (memoryToken) return memoryToken;
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  set(token, { remember = false } = {}) {
    memoryToken = token;
    if (!remember) return;
    try {
      sessionStorage.setItem(SESSION_KEY, token);
    } catch {
      // Not being able to remember it is survivable; losing the session is not.
    }
  },
  clear() {
    memoryToken = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* nothing to do */ }
  },
  get isRemembered() {
    try { return Boolean(sessionStorage.getItem(SESSION_KEY)); } catch { return false; }
  },
};
