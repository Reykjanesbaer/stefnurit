/**
 * Local autosave.
 *
 * Keyed by who is editing and which commit they started from, so two people on
 * one machine never see each other's work, and a draft written against an old
 * version is never silently restored on top of a newer one.
 *
 * Every access is wrapped. A private window, blocked site data or a full quota
 * all throw here, and none is a reason to take the editor down — the document
 * is still in memory and still saveable to GitHub.
 */
const PREFIX = 'stefnurit-draft:';

export function autosaveKey(login, baseCommitSha) {
  return `${PREFIX}${login}@${baseCommitSha}`;
}

export function saveLocal(login, baseCommitSha, document) {
  try {
    const savedAt = new Date();
    localStorage.setItem(autosaveKey(login, baseCommitSha), JSON.stringify({
      savedAt: savedAt.toISOString(), baseCommitSha, document,
    }));
    return { ok: true, savedAt };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function loadLocal(login, baseCommitSha) {
  try {
    const raw = localStorage.getItem(autosaveKey(login, baseCommitSha));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.baseCommitSha !== baseCommitSha) return null;
    return { document: parsed.document, savedAt: new Date(parsed.savedAt) };
  } catch {
    return null;
  }
}

export function clearLocal(login, baseCommitSha) {
  try { localStorage.removeItem(autosaveKey(login, baseCommitSha)); } catch { /* nothing to do */ }
}

/**
 * Drop drafts from commits that are no longer current.
 *
 * Without this, every published change leaves a dead draft behind forever and
 * the browser's quota fills with documents nobody can reach.
 */
export function pruneLocal(login, keepCommitSha) {
  try {
    const stale = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(`${PREFIX}${login}@`) && key !== autosaveKey(login, keepCommitSha)) {
        stale.push(key);
      }
    }
    for (const key of stale) localStorage.removeItem(key);
    return stale.length;
  } catch {
    return 0;
  }
}

/** Debounced writer, so typing does not hit storage on every keystroke. */
export function createAutosaver({ login, baseCommitSha, delayMs = 800, onSaved }) {
  let timer = null;
  return {
    schedule(document) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const result = saveLocal(login, baseCommitSha, document);
        if (result.ok) onSaved?.(result.savedAt);
      }, delayMs);
    },
    flush(document) {
      clearTimeout(timer);
      const result = saveLocal(login, baseCommitSha, document);
      if (result.ok) onSaved?.(result.savedAt);
      return result;
    },
    cancel() { clearTimeout(timer); },
  };
}
