/**
 * Three-way merge of stefnurit documents.
 *
 * Two people editing the same document is normal here: somebody fixes a link on
 * GitHub while somebody else has the admin panel open. Refusing the save and
 * making them redo the work is the behaviour worth avoiding, so changes that do
 * not overlap are applied silently and only genuine disagreements are raised.
 *
 * A conflict means exactly one of:
 *   - both sides set the same field of the same node to different values,
 *   - both sides moved the same node somewhere different,
 *   - one side deleted a node the other side edited or moved.
 *
 * Everything else merges. In particular, two people editing *different* fields
 * of the same item is not a conflict.
 *
 * Pure: neither input is mutated. On conflict the merged document keeps "mine",
 * so the editor can show the document unchanged while asking which to keep.
 */

import { diff, indexNodes } from './diff.js';

/**
 * @param {object} base   last common ancestor (the commit the editor loaded)
 * @param {object} mine   the local document
 * @param {object} theirs the document now on the branch
 * @returns {{ok: boolean, merged: object, conflicts: Conflict[], applied: object}}
 */
export function merge3(base, mine, theirs) {
  const merged = structuredClone(mine);
  const conflicts = [];
  const applied = { fields: 0, added: 0, removed: 0, moved: 0 };

  const dMine = diff(base, mine);
  const dTheirs = diff(base, theirs);

  const baseIndex = indexNodes(base);
  const mineIndex = indexNodes(mine);
  const theirsIndex = indexNodes(theirs);

  const myChangedFields = fieldMap(dMine.changed);
  const theirChangedFields = fieldMap(dTheirs.changed);
  const myRemoved = new Set(dMine.removed.map((r) => r.id));
  const theirRemoved = new Set(dTheirs.removed.map((r) => r.id));
  const myMoved = new Map(dMine.moved.map((m) => [m.id, m]));
  const theirMoved = new Map(dTheirs.moved.map((m) => [m.id, m]));

  const describe = (id) => {
    const record = theirsIndex.get(id) ?? mineIndex.get(id) ?? baseIndex.get(id);
    return {
      type: record?.type ?? 'node',
      path: record?.path ?? id,
      label: record ? (record.fields.label ?? record.fields.title ?? id) : id,
    };
  };

  // ---- delete versus edit ---------------------------------------------------
  for (const id of theirRemoved) {
    const touched = myChangedFields.has(id) || myMoved.has(id);
    if (touched && !myRemoved.has(id)) {
      conflicts.push({
        kind: 'delete-vs-edit', id, ...describe(id), field: null,
        base: baseIndex.get(id)?.fields ?? null,
        mine: mineIndex.get(id)?.fields ?? null,
        theirs: null,
      });
    }
  }
  for (const id of myRemoved) {
    const touched = theirChangedFields.has(id) || theirMoved.has(id);
    if (touched && !theirRemoved.has(id)) {
      conflicts.push({
        kind: 'edit-vs-delete', id, ...describe(id), field: null,
        base: baseIndex.get(id)?.fields ?? null,
        mine: null,
        theirs: theirsIndex.get(id)?.fields ?? null,
      });
    }
  }

  // ---- field changes --------------------------------------------------------
  for (const [id, theirFields] of theirChangedFields) {
    if (theirRemoved.has(id) || myRemoved.has(id)) continue;
    const target = findNode(merged, id);
    if (!target) continue;

    const myFields = myChangedFields.get(id);
    for (const [field, change] of theirFields) {
      const myChange = myFields?.get(field);
      if (myChange && myChange.to !== change.to) {
        conflicts.push({
          kind: 'field', id, field, ...describe(id),
          base: change.from ?? null,
          mine: myChange.to ?? null,
          theirs: change.to ?? null,
        });
        continue; // merged keeps mine until the editor chooses
      }
      if (myChange) continue; // both made the same edit — nothing to do
      if (change.to === undefined) delete target.node[field];
      else target.node[field] = change.to;
      applied.fields += 1;
    }
  }

  // ---- additions ------------------------------------------------------------
  // Sorted by index so two new siblings keep their relative order.
  const additions = [...dTheirs.added].sort((a, b) =>
    (theirsIndex.get(a.id)?.index ?? 0) - (theirsIndex.get(b.id)?.index ?? 0));
  for (const addition of additions) {
    if (mineIndex.has(addition.id)) continue; // both added it; keep mine
    const record = theirsIndex.get(addition.id);
    if (!record) continue;
    const container = findContainer(merged, record.parentId);
    if (!container) {
      // The parent is gone from my document, so there is nowhere to put it.
      conflicts.push({
        kind: 'add-vs-delete-parent', id: addition.id, field: null, ...describe(addition.id),
        base: null, mine: null, theirs: record.fields,
      });
      continue;
    }
    container.splice(Math.min(record.index, container.length), 0, structuredClone(record.node));
    applied.added += 1;
  }

  // ---- moves ----------------------------------------------------------------
  for (const [id, theirMove] of theirMoved) {
    if (theirRemoved.has(id) || myRemoved.has(id)) continue;
    const myMove = myMoved.get(id);
    if (myMove) {
      const samePlace = myMove.to.parentId === theirMove.to.parentId
        && myMove.to.index === theirMove.to.index;
      if (!samePlace) {
        conflicts.push({
          kind: 'move', id, field: null, ...describe(id),
          base: theirMove.from, mine: myMove.to, theirs: theirMove.to,
        });
      }
      continue;
    }
    if (moveNode(merged, id, theirMove.to)) applied.moved += 1;
  }

  // ---- removals -------------------------------------------------------------
  // Last, so the indices the additions and moves used above still referred to
  // the document those steps saw.
  for (const id of theirRemoved) {
    if (myRemoved.has(id)) continue;
    if (myChangedFields.has(id) || myMoved.has(id)) continue; // already a conflict
    if (removeNode(merged, id)) applied.removed += 1;
  }

  return { ok: conflicts.length === 0, merged, conflicts, applied };
}

/**
 * Resolve one conflict by choosing a side. Returns a new document.
 * @param {'mine'|'theirs'} side
 */
export function resolveConflict(doc, conflict, side, theirs) {
  const next = structuredClone(doc);
  if (side === 'mine') return next;

  if (conflict.kind === 'field') {
    const target = findNode(next, conflict.id);
    if (target) {
      if (conflict.theirs === undefined || conflict.theirs === null) delete target.node[conflict.field];
      else target.node[conflict.field] = conflict.theirs;
    }
    return next;
  }

  if (conflict.kind === 'delete-vs-edit') {
    removeNode(next, conflict.id);
    return next;
  }

  if (conflict.kind === 'edit-vs-delete' || conflict.kind === 'add-vs-delete-parent') {
    const record = indexNodes(theirs).get(conflict.id);
    if (record) {
      const container = findContainer(next, record.parentId);
      if (container && !findNode(next, conflict.id)) {
        container.splice(Math.min(record.index, container.length), 0, structuredClone(record.node));
      }
    }
    return next;
  }

  if (conflict.kind === 'move') {
    moveNode(next, conflict.id, conflict.theirs);
    return next;
  }

  return next;
}

// ---- document surgery -------------------------------------------------------

/** The array holding the children of `parentId`, or the top-level sections. */
function findContainer(doc, parentId) {
  if (parentId === null) return doc.sections;
  for (const section of doc.sections ?? []) {
    if (section.id === parentId) {
      return section.kind === 'columns' ? section.columns : section.items;
    }
    for (const column of section.columns ?? []) {
      if (column.id === parentId) return column.cards;
      for (const card of column.cards ?? []) {
        if (card.id === parentId) return card.items;
      }
    }
  }
  return null;
}

/** Locate a node and the array it lives in. */
function findNode(doc, id) {
  const walk = (array) => {
    if (!Array.isArray(array)) return null;
    for (let index = 0; index < array.length; index += 1) {
      const node = array[index];
      if (!node || typeof node !== 'object') continue;
      if (node.id === id) return { array, index, node };
      const nested = walk(node.sections ?? node.columns ?? node.cards ?? node.items);
      if (nested) return nested;
    }
    return null;
  };
  return walk(doc.sections);
}

function removeNode(doc, id) {
  const found = findNode(doc, id);
  if (!found) return false;
  found.array.splice(found.index, 1);
  return true;
}

function moveNode(doc, id, to) {
  const found = findNode(doc, id);
  if (!found) return false;
  const container = findContainer(doc, to.parentId);
  if (!container) return false;
  const [node] = found.array.splice(found.index, 1);
  container.splice(Math.min(to.index, container.length), 0, node);
  return true;
}

/** id -> Map<field, {field, from, to}> */
function fieldMap(changedList) {
  const out = new Map();
  for (const entry of changedList) {
    out.set(entry.id, new Map(entry.changes.map((c) => [c.field, c])));
  }
  return out;
}
