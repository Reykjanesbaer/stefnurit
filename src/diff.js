/**
 * Structural diff of two stefnurit documents, keyed by node id.
 *
 * A textual diff of the JSON is useless to the people using the admin panel:
 * moving one card rewrites hundreds of lines, and the question they actually
 * need answered before publishing is "which links change?". Keying on `id` —
 * which the validator already guarantees is unique and stable — turns that into
 * a short, readable list.
 *
 * Pure: no mutation of either input, no dependence on key order.
 */

/** Scalar fields compared per node type. Child arrays are structure, not fields. */
const FIELDS = {
  section: ['kind'],
  column: [],
  card: ['title', 'colorToken'],
  item: ['label', 'href', 'kind', 'colorToken', 'note'],
};

/**
 * Flatten a document into a Map of id -> node record.
 *
 * @returns {Map<string, {id, type, parentId, index, path, fields, node}>}
 */
export function indexNodes(doc) {
  const index = new Map();
  if (!isObject(doc) || !Array.isArray(doc.sections)) return index;

  const put = (type, node, parentId, position, path) => {
    if (!isObject(node) || typeof node.id !== 'string') return false;
    // A duplicate id makes the document invalid; the diff keeps the first and
    // ignores the rest rather than silently reporting phantom changes.
    if (index.has(node.id)) return false;
    index.set(node.id, {
      id: node.id,
      type,
      parentId,
      index: position,
      path,
      fields: pick(node, FIELDS[type]),
      node,
    });
    return true;
  };

  doc.sections.forEach((section, si) => {
    const spath = `sections[${si}]`;
    if (!put('section', section, null, si, spath)) return;

    if (section.kind === 'columns') {
      (section.columns ?? []).forEach((column, ci) => {
        const cpath = `${spath}.columns[${ci}]`;
        if (!put('column', column, section.id, ci, cpath)) return;
        (column.cards ?? []).forEach((card, di) => {
          const dpath = `${cpath}.cards[${di}]`;
          if (!put('card', card, column.id, di, dpath)) return;
          (card.items ?? []).forEach((item, ii) => {
            put('item', item, card.id, ii, `${dpath}.items[${ii}]`);
          });
        });
      });
    } else {
      (section.items ?? []).forEach((item, ii) => {
        put('item', item, section.id, ii, `${spath}.items[${ii}]`);
      });
    }
  });

  return index;
}

/**
 * @returns {{
 *   added: Array<{id, type, path, label}>,
 *   removed: Array<{id, type, path, label}>,
 *   changed: Array<{id, type, path, label, changes: Array<{field, from, to}>}>,
 *   moved: Array<{id, type, path, label, from: {parentId, index}, to: {parentId, index}}>,
 *   changedHrefs: Array<{id, label, from, to, kind: 'added'|'changed'|'removed'}>,
 *   isEmpty: boolean,
 * }}
 */
export function diff(base, next) {
  const before = indexNodes(base);
  const after = indexNodes(next);

  const added = [];
  const removed = [];
  const changed = [];
  const moved = [];
  const changedHrefs = [];

  for (const [id, node] of after) {
    if (!before.has(id)) {
      added.push({ id, type: node.type, path: node.path, label: labelOf(node) });
      if (node.type === 'item' && hasHref(node)) {
        changedHrefs.push({ id, label: labelOf(node), from: null, to: node.fields.href, kind: 'added' });
      }
    }
  }

  for (const [id, node] of before) {
    if (!after.has(id)) {
      removed.push({ id, type: node.type, path: node.path, label: labelOf(node) });
      if (node.type === 'item' && hasHref(node)) {
        changedHrefs.push({ id, label: labelOf(node), from: node.fields.href, to: null, kind: 'removed' });
      }
    }
  }

  for (const [id, mine] of after) {
    const theirs = before.get(id);
    if (!theirs) continue;

    const changes = [];
    for (const field of FIELDS[mine.type]) {
      const from = theirs.fields[field];
      const to = mine.fields[field];
      if (!same(from, to)) changes.push({ field, from, to });
    }
    if (changes.length) {
      changed.push({ id, type: mine.type, path: mine.path, label: labelOf(mine), changes });
      const href = changes.find((c) => c.field === 'href');
      if (href) {
        changedHrefs.push({ id, label: labelOf(mine), from: href.from ?? null, to: href.to ?? null, kind: 'changed' });
      }
    }

    if (theirs.parentId !== mine.parentId || theirs.index !== mine.index) {
      moved.push({
        id, type: mine.type, path: mine.path, label: labelOf(mine),
        from: { parentId: theirs.parentId, index: theirs.index },
        to: { parentId: mine.parentId, index: mine.index },
      });
    }
  }

  const byPath = (a, b) => a.path.localeCompare(b.path);
  added.sort(byPath); removed.sort(byPath); changed.sort(byPath); moved.sort(byPath);

  return {
    added, removed, changed, moved, changedHrefs,
    isEmpty: !added.length && !removed.length && !changed.length && !moved.length,
  };
}

/** Every href that a publish would newly expose, for the PR link probe. */
export function hrefsToProbe(base, next) {
  return diff(base, next).changedHrefs
    .filter((c) => typeof c.to === 'string' && c.to !== '')
    .map((c) => ({ id: c.id, label: c.label, href: c.to }));
}

const labelOf = (node) => node.fields.label ?? node.fields.title ?? node.id;
const hasHref = (node) => typeof node.fields.href === 'string' && node.fields.href !== '';
const same = (a, b) => (a === undefined ? b === undefined : a === b);

function pick(node, fields) {
  const out = {};
  for (const field of fields) if (node[field] !== undefined) out[field] = node[field];
  return out;
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
