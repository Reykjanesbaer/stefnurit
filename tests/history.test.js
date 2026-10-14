import { describe, expect, test, vi } from 'vitest';
import { History } from '../admin/src/editor/history.js';

const doc = (label) => ({ sections: [{ id: 'a', items: [{ id: 'i', label }] }] });
const labelOf = (d) => d.sections[0].items[0].label;

describe('History', () => {
  test('starts with nothing to undo or redo', () => {
    const history = new History(doc('A'));
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(labelOf(history.current)).toBe('A');
  });

  test('undo steps back and redo steps forward again', () => {
    const history = new History(doc('A'));
    history.push(doc('B'), 'label:i');
    history.push(doc('C'), 'title:x');

    expect(labelOf(history.undo())).toBe('B');
    expect(labelOf(history.undo())).toBe('A');
    expect(history.canUndo).toBe(false);

    expect(labelOf(history.redo())).toBe('B');
    expect(labelOf(history.redo())).toBe('C');
    expect(history.canRedo).toBe(false);
  });

  test('undo at the beginning and redo at the end return null', () => {
    const history = new History(doc('A'));
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });

  test('a new edit abandons the redo branch', () => {
    const history = new History(doc('A'));
    history.push(doc('B'), 'x');
    history.undo();
    expect(history.canRedo).toBe(true);

    history.push(doc('C'), 'y');
    expect(history.canRedo).toBe(false);
    expect(labelOf(history.current)).toBe('C');
  });

  // Holding a key down must not fill the stack with one entry per character.
  test('consecutive edits to the same field coalesce into one step', () => {
    const history = new History(doc(''));
    history.push(doc('I'), 'label:i', { coalesce: true });
    history.push(doc('In'), 'label:i', { coalesce: true });
    history.push(doc('Inn'), 'label:i', { coalesce: true });

    expect(history.depth).toBe(1);
    expect(labelOf(history.undo())).toBe('');
  });

  test('edits to different fields never coalesce', () => {
    const history = new History(doc('A'));
    history.push(doc('B'), 'label:one', { coalesce: true });
    history.push(doc('C'), 'label:two', { coalesce: true });
    expect(history.depth).toBe(2);
  });

  test('coalescing stops once the pause is long enough', () => {
    vi.useFakeTimers();
    try {
      const history = new History(doc('A'), { coalesceMs: 500 });
      history.push(doc('B'), 'label:i', { coalesce: true });
      vi.advanceTimersByTime(600);
      history.push(doc('C'), 'label:i', { coalesce: true });
      expect(history.depth).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test('structural changes are never coalesced', () => {
    const history = new History(doc('A'));
    history.push(doc('B'), 'move:i');
    history.push(doc('C'), 'move:i');
    expect(history.depth).toBe(2);
  });

  test('the stack is bounded, dropping the oldest entries', () => {
    const history = new History(doc('0'), { limit: 5 });
    for (let i = 1; i <= 20; i += 1) history.push(doc(String(i)), `step:${i}`);
    expect(history.depth).toBe(5);

    for (let i = 0; i < 5; i += 1) history.undo();
    expect(history.canUndo).toBe(false);
  });

  test('snapshots are isolated — mutating the input later does not rewrite history', () => {
    const history = new History(doc('A'));
    const next = doc('B');
    history.push(next, 'x');
    next.sections[0].items[0].label = 'MUTATED';
    expect(labelOf(history.current)).toBe('B');
    expect(labelOf(history.undo())).toBe('A');
  });

  test('reset clears both directions and sets a new base', () => {
    const history = new History(doc('A'));
    history.push(doc('B'), 'x');
    history.undo();

    history.reset(doc('Z'));
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(labelOf(history.current)).toBe('Z');
  });
});
