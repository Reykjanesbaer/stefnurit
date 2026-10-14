import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { diff, indexNodes, hrefsToProbe } from '../src/diff.js';

const shipped = JSON.parse(readFileSync(new URL('../src/data/stefnurit.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(shipped);
const columnsOf = (doc) => doc.sections.find((s) => s.kind === 'columns').columns;
const firstCard = (doc) => columnsOf(doc)[0].cards[0];

describe('indexNodes', () => {
  test('indexes every section, column, card and item by id', () => {
    const index = indexNodes(shipped);
    expect(index.size).toBe(38);
    expect(index.get('innkaupastefna')).toMatchObject({ type: 'item', parentId: 'stjornsysla' });
    expect(index.get('stjornsysla')).toMatchObject({ type: 'card', parentId: 'dalkur-stjornsysla' });
  });

  test('records position so moves can be detected', () => {
    expect(indexNodes(shipped).get('innkaupastefna').index).toBe(0);
  });

  test('a malformed document yields an empty index rather than throwing', () => {
    for (const input of [null, {}, { sections: 'nope' }, []]) {
      expect(() => indexNodes(input)).not.toThrow();
      expect(indexNodes(input).size).toBe(0);
    }
  });
});

describe('diff', () => {
  test('a document against itself is empty', () => {
    expect(diff(shipped, clone()).isEmpty).toBe(true);
  });

  test('key order does not count as a change', () => {
    const reordered = JSON.parse(JSON.stringify(shipped, Object.keys(shipped).sort()));
    expect(diff(shipped, reordered).changed).toEqual([]);
  });

  test('a changed label is reported with its old and new value', () => {
    const next = clone();
    firstCard(next).items[0].label = 'Innkaupastefna 2026';
    const result = diff(shipped, next);
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0]).toMatchObject({ id: 'innkaupastefna', type: 'item' });
    expect(result.changed[0].changes).toEqual([
      { field: 'label', from: 'Innkaupastefna', to: 'Innkaupastefna 2026' },
    ]);
  });

  test('a new item is reported as added, and its href queued for probing', () => {
    const next = clone();
    firstCard(next).items.push({ id: 'ny-stefna', label: 'Ný stefna', href: 'https://x.is/ny.pdf', kind: 'pdf' });
    const result = diff(shipped, next);
    expect(result.added.map((a) => a.id)).toEqual(['ny-stefna']);
    expect(result.changedHrefs).toContainEqual(
      { id: 'ny-stefna', label: 'Ný stefna', from: null, to: 'https://x.is/ny.pdf', kind: 'added' },
    );
  });

  test('a deleted item is reported as removed', () => {
    const next = clone();
    firstCard(next).items.splice(0, 1);
    const result = diff(shipped, next);
    expect(result.removed.map((r) => r.id)).toEqual(['innkaupastefna']);
    expect(result.changed).toEqual([]);
  });

  test('reordering is a move, not a change', () => {
    const next = clone();
    const items = firstCard(next).items;
    items.splice(1, 0, items.splice(0, 1)[0]);
    const result = diff(shipped, next);
    expect(result.changed).toEqual([]);
    expect(result.moved.map((m) => m.id).sort())
      .toEqual(['innkaupastefna', 'personuverndarstefna']);
    expect(result.moved.find((m) => m.id === 'innkaupastefna').to.index).toBe(1);
  });

  test('moving a card to another column reports the new parent', () => {
    const next = clone();
    const columns = columnsOf(next);
    const [card] = columns[0].cards.splice(1, 1);
    columns[1].cards.push(card);
    const moved = diff(shipped, next).moved.find((m) => m.id === 'mannaudsmal');
    expect(moved.from.parentId).toBe('dalkur-stjornsysla');
    expect(moved.to.parentId).toBe('dalkur-menningarmal');
  });

  test('only hrefs that changed are queued for probing', () => {
    const next = clone();
    firstCard(next).items[0].href = 'https://www.reykjanesbaer.is/ny.pdf';
    firstCard(next).items[1].label = 'Bara nafnabreyting';
    expect(hrefsToProbe(shipped, next)).toEqual([
      { id: 'innkaupastefna', label: 'Innkaupastefna', href: 'https://www.reykjanesbaer.is/ny.pdf' },
    ]);
  });

  test('clearing an href queues nothing to probe', () => {
    const next = clone();
    firstCard(next).items[0].href = '';
    expect(hrefsToProbe(shipped, next)).toEqual([]);
    expect(diff(shipped, next).changedHrefs[0]).toMatchObject({ kind: 'changed', to: '' });
  });

  test('neither input is mutated', () => {
    const next = clone();
    firstCard(next).items[0].label = 'X';
    const before = JSON.stringify(shipped);
    const nextBefore = JSON.stringify(next);
    diff(shipped, next);
    expect(JSON.stringify(shipped)).toBe(before);
    expect(JSON.stringify(next)).toBe(nextBefore);
  });
});
