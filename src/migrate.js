/**
 * Schema versioning for stefnurit.json.
 *
 * The document is edited by hand on GitHub as well as through the admin panel,
 * so a file written months ago has to keep loading after the shape changes.
 * Every reader runs `migrate()` first; a document with no `schemaVersion` is
 * version 1, which is what every file written before versioning existed is.
 *
 * Adding a version means appending one step to MIGRATIONS. Steps must be pure
 * and must not mutate their input — the editor keeps the pre-migration document
 * around for three-way merges.
 */

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Ordered steps. MIGRATIONS[n] upgrades a version-n document to version n+1.
 * Index 0 is unused; version numbering starts at 1.
 * @type {Array<((doc: object) => object) | null>}
 */
const MIGRATIONS = [null];

/** The version a document declares, treating "missing" as 1. */
export function versionOf(doc) {
  if (!isObject(doc)) return null;
  const declared = doc.schemaVersion;
  if (declared === undefined) return 1;
  if (!Number.isInteger(declared) || declared < 1) return null;
  return declared;
}

/**
 * Bring a document up to CURRENT_SCHEMA_VERSION.
 *
 * @param {unknown} doc
 * @returns {{ok: true, doc: object, from: number, to: number, applied: string[]}
 *          | {ok: false, reason: string, from: number|null}}
 */
export function migrate(doc) {
  if (!isObject(doc)) {
    return { ok: false, reason: 'skjalið er ekki JSON-hlutur', from: null };
  }

  const from = versionOf(doc);
  if (from === null) {
    return {
      ok: false,
      reason: `ógild útgáfa skema: ${JSON.stringify(doc.schemaVersion)}`,
      from: null,
    };
  }

  // A document from a newer build cannot be understood by this one, and
  // guessing would silently drop whatever the newer version added.
  if (from > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `skjalið er af útgáfu ${from} en þessi útgáfa skilur mest ${CURRENT_SCHEMA_VERSION}`,
      from,
    };
  }

  let current = structuredClone(doc);
  const applied = [];

  for (let version = from; version < CURRENT_SCHEMA_VERSION; version += 1) {
    const step = MIGRATIONS[version];
    if (typeof step !== 'function') {
      return { ok: false, reason: `vantar þýðingu úr útgáfu ${version}`, from };
    }
    current = step(current);
    applied.push(`${version} → ${version + 1}`);
  }

  current.schemaVersion = CURRENT_SCHEMA_VERSION;
  return { ok: true, doc: current, from, to: CURRENT_SCHEMA_VERSION, applied };
}

/** True when the document would be changed by migrate(). */
export function needsMigration(doc) {
  const from = versionOf(doc);
  return from !== null && from < CURRENT_SCHEMA_VERSION;
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
