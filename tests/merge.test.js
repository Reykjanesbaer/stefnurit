import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { merge3, resolveConflict } from '../src/merge.js';
import { validate } from '../src/validate.js';

const shipped = JSON.parse(readFileSync(new URL('../src/data/stefnurit.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(shipped);
const columnsOf = (doc) => doc.sections.find((s) => s.kind === 'columns').columns;
const card = (doc, c = 0, d = 0) => columnsOf(doc)[c].cards[d];
const item = (doc, i = 0) => card(doc).items[i];
const byId = (doc, id) => {
  let found = null;
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      if (node.id === id) found = node;
      Object.values(node).forEach(walk);
    }
  };
  walk(doc.sections);
  return found;
};

describe('clean merges', () => {
  test('nobody changed anything', () => {
    const result = merge3(shipped, clone(), clone());
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.merged)).toBe(JSON.stringify(shipped));
  });

  test('only I changed something', () => {
    const mine = clone();
    item(mine).label = 'Mitt';
    const result = merge3(shipped, mine, clone());
    expect(result.ok).toBe(true);
    expect(item(result.merged).label).toBe('Mitt');
  });

  test('only they changed something, and it is applied', () => {
    const theirs = clone();
    item(theirs).href = 'https://x.is/theirs.pdf';
    const result = merge3(shipped, clone(), theirs);
    expect(result.ok).toBe(true);
    expect(item(result.merged).href).toBe('https://x.is/theirs.pdf');
    expect(result.applied.fields).toBe(1);
  });

  test('different fields of the same item is not a conflict', () => {
    const mine = clone();
    const theirs = clone();
    item(mine).label = 'Nýtt nafn';
    item(theirs).href = 'https://x.is/nytt.pdf';
    const result = merge3(shipped, mine, theirs);
    expect(result.ok).toBe(true);
    expect(item(result.merged).label).toBe('Nýtt nafn');
    expect(item(result.merged).href).toBe('https://x.is/nytt.pdf');
  });

  test('different items entirely', () => {
    const mine = clone();
    const theirs = clone();
    item(mine, 0).label = 'A';
    item(theirs, 1).label = 'B';
    const result = merge3(shipped, mine, theirs);
    expect(result.ok).toBe(true);
    expect(item(result.merged, 0).label).toBe('A');
    expect(item(result.merged, 1).label).toBe('B');
  });

  test('both made the identical edit', () => {
    const mine = clone();
    const theirs = clone();
    item(mine).label = 'Sama';
    item(theirs).label = 'Sama';
    const result = merge3(shipped, mine, theirs);
    expect(result.ok).toBe(true);
    expect(item(result.merged).label).toBe('Sama');
  });

  test('their new item is pulled in alongside mine', () => {
    const mine = clone();
    const theirs = clone();
    card(mine).items.push({ id: 'mitt-skjal', label: 'Mitt', href: '', kind: 'pdf' });
    card(theirs).items.push({ id: 'theirra-skjal', label: 'Þeirra', href: '', kind: 'pdf' });
    const result = merge3(shipped, mine, theirs);
    expect(result.ok).toBe(true);
    expect(byId(result.merged, 'mitt-skjal')).toBeTruthy();
    expect(byId(result.merged, 'theirra-skjal')).toBeTruthy();
    expect(result.applied.added).toBe(1);
  });

  test('their deletion of an item I did not touch is applied', () => {
    const theirs = clone();
    theirs.sections[2].columns[0].cards[0].items.splice(0, 1);
    const result = merge3(shipped, clone(), theirs);
    expect(result.ok).toBe(true);
    expect(byId(result.merged, 'innkaupastefna')).toBeNull();
    expect(result.applied.removed).toBe(1);
  });

  test('their move of an item I did not move is applied', () => {
    const theirs = clone();
    const items = card(theirs).items;
    items.splice(2, 0, items.splice(0, 1)[0]);
    const result = merge3(shipped, clone(), theirs);
    expect(result.ok).toBe(true);
    expect(card(result.merged).items.map((i) => i.id).indexOf('innkaupastefna')).toBe(2);
  });

  test('the merged document is still valid', () => {
    const mine = clone();
    const theirs = clone();
    item(mine).label = 'A';
    card(theirs).items.push({ id: 'their-new', label: 'Nýtt', href: 'https://x.is/n.pdf', kind: 'pdf' });
    expect(validate(merge3(shipped, mine, theirs).merged).ok).toBe(true);
  });

  test('neither input is mutated', () => {
    const mine = clone();
    const theirs = clone();
    item(mine).label = 'A';
    item(theirs).href = 'https://x.is/b.pdf';
    const snapshots = [JSON.stringify(shipped), JSON.stringify(mine), JSON.stringify(theirs)];
    merge3(shipped, mine, theirs);
    expect([JSON.stringify(shipped), JSON.stringify(mine), JSON.stringify(theirs)]).toEqual(snapshots);
  });
});

describe('conflicts', () => {
  test('the same field set to different values', () => {
    const mine = clone();
    const theirs = clone();
    item(mine).label = 'Mitt nafn';
    item(theirs).label = 'Þeirra nafn';
    const result = merge3(shipped, mine, theirs);

    expect(result.ok).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      kind: 'field',
      id: 'innkaupastefna',
      field: 'label',
      base: 'Innkaupastefna',
      mine: 'Mitt nafn',
      theirs: 'Þeirra nafn',
    });
    // until the editor chooses, the document still reads as mine
    expect(item(result.merged).label).toBe('Mitt nafn');
  });

  test('they deleted a node I edited', () => {
    const mine = clone();
    const theirs = clone();
    item(mine).label = 'Breytt hjá mér';
    theirs.sections[2].columns[0].cards[0].items.splice(0, 1);
    const result = merge3(shipped, mine, theirs);

    expect(result.ok).toBe(false);
    expect(result.conflicts[0]).toMatchObject({ kind: 'delete-vs-edit', id: 'innkaupastefna' });
    expect(byId(result.merged, 'innkaupastefna')).toBeTruthy(); // kept until decided
  });

  test('I deleted a node they edited', () => {
    const mine = clone();
    const theirs = clone();
    mine.sections[2].columns[0].cards[0].items.splice(0, 1);
    item(theirs).href = 'https://x.is/theirs.pdf';
    const result = merge3(shipped, mine, theirs);

    expect(result.ok).toBe(false);
    expect(result.conflicts[0]).toMatchObject({ kind: 'edit-vs-delete', id: 'innkaupastefna' });
  });

  test('both deleted the same node is not a conflict', () => {
    const mine = clone();
    const theirs = clone();
    mine.sections[2].columns[0].cards[0].items.splice(0, 1);
    theirs.sections[2].columns[0].cards[0].items.splice(0, 1);
    const result = merge3(shipped, mine, theirs);
    expect(result.ok).toBe(true);
    expect(byId(result.merged, 'innkaupastefna')).toBeNull();
  });

  test('both moved the same node somewhere different', () => {
    const mine = clone();
    const theirs = clone();
    const mineItems = card(mine).items;
    mineItems.splice(3, 0, mineItems.splice(0, 1)[0]);
    const theirItems = card(theirs).items;
    theirItems.splice(5, 0, theirItems.splice(0, 1)[0]);

    const result = merge3(shipped, mine, theirs);
    expect(result.ok).toBe(false);
    expect(result.conflicts.some((c) => c.kind === 'move' && c.id === 'innkaupastefna')).toBe(true);
  });

  test('both moved the same node to the same place is not a conflict', () => {
    const mine = clone();
    const theirs = clone();
    for (const doc of [mine, theirs]) {
      const items = card(doc).items;
      items.splice(3, 0, items.splice(0, 1)[0]);
    }
    expect(merge3(shipped, mine, theirs).ok).toBe(true);
  });

  test('they added into a card I deleted', () => {
    const mine = clone();
    const theirs = clone();
    columnsOf(mine)[0].cards.splice(0, 1);
    card(theirs).items.push({ id: 'their-new', label: 'Nýtt', href: '', kind: 'pdf' });
    const result = merge3(shipped, mine, theirs);
    expect(result.ok).toBe(false);
    expect(result.conflicts.some((c) => c.kind === 'add-vs-delete-parent')).toBe(true);
  });

  test('one conflict does not block the other, independent changes', () => {
    const mine = clone();
    const theirs = clone();
    item(mine, 0).label = 'Mitt';
    item(theirs, 0).label = 'Þeirra';          // conflict
    item(theirs, 1).href = 'https://x.is/ok.pdf'; // clean, should still apply
    const result = merge3(shipped, mine, theirs);
    expect(result.conflicts).toHaveLength(1);
    expect(item(result.merged, 1).href).toBe('https://x.is/ok.pdf');
  });
});

describe('resolveConflict', () => {
  const setup = () => {
    const mine = clone();
    const theirs = clone();
    item(mine).label = 'Mitt nafn';
    item(theirs).label = 'Þeirra nafn';
    return { mine, theirs, result: merge3(shipped, mine, theirs) };
  };

  test('"Nota mína" leaves the document alone', () => {
    const { result, theirs } = setup();
    const resolved = resolveConflict(result.merged, result.conflicts[0], 'mine', theirs);
    expect(item(resolved).label).toBe('Mitt nafn');
  });

  test('"Nota þeirra" takes their value', () => {
    const { result, theirs } = setup();
    const resolved = resolveConflict(result.merged, result.conflicts[0], 'theirs', theirs);
    expect(item(resolved).label).toBe('Þeirra nafn');
  });

  test('taking their side of a delete-vs-edit removes the node', () => {
    const mine = clone();
    const theirs = clone();
    item(mine).label = 'Breytt';
    theirs.sections[2].columns[0].cards[0].items.splice(0, 1);
    const result = merge3(shipped, mine, theirs);
    const resolved = resolveConflict(result.merged, result.conflicts[0], 'theirs', theirs);
    expect(byId(resolved, 'innkaupastefna')).toBeNull();
  });

  test('taking their side of an edit-vs-delete puts the node back', () => {
    const mine = clone();
    const theirs = clone();
    mine.sections[2].columns[0].cards[0].items.splice(0, 1);
    item(theirs).href = 'https://x.is/theirs.pdf';
    const result = merge3(shipped, mine, theirs);
    const resolved = resolveConflict(result.merged, result.conflicts[0], 'theirs', theirs);
    expect(byId(resolved, 'innkaupastefna')?.href).toBe('https://x.is/theirs.pdf');
  });

  test('resolving leaves the document valid', () => {
    const { result, theirs } = setup();
    expect(validate(resolveConflict(result.merged, result.conflicts[0], 'theirs', theirs)).ok).toBe(true);
  });
});
