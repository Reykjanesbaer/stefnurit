import { describe, expect, test } from 'vitest';
import { routeTree, routeRail, mergeCollinear, centreX } from '../src/lines.js';

const column = (x, { y = 200, width = 300, height = 600 } = {}) => ({ x, y, width, height });
const byRole = (segments, role) => segments.filter((s) => s.role === role);

/** Five evenly pitched columns, like the 2025 design. */
const five = [column(106), column(446), column(770), column(1090), column(1413)];

describe('routeTree', () => {
  test('the rail spans exactly the first and last column centres', () => {
    const { segments } = routeTree({ root: null, branch: [], columns: five, railY: 172 });
    const [rail] = byRole(segments, 'rail');
    expect(rail.x1).toBeCloseTo(centreX(five[0]));
    expect(rail.x2).toBeCloseTo(centreX(five.at(-1)));
    expect(rail.y1).toBe(172);
    expect(rail.y2).toBe(172);
  });

  test('one tick per column, each on its centre and reaching the card top', () => {
    const { segments } = routeTree({ root: null, branch: [], columns: five, railY: 172 });
    const ticks = byRole(segments, 'tick');
    expect(ticks).toHaveLength(5);
    for (const [index, tick] of ticks.entries()) {
      expect(tick.x1).toBeCloseTo(centreX(five[index]));
      expect(tick.x1).toBeCloseTo(tick.x2);
      expect(tick.y1).toBe(172);
      expect(tick.y2).toBe(five[index].y); // no gap, no overshoot
    }
  });

  // The whole point of routing from rectangles: the drawing follows the data.
  test.each([1, 2, 3, 5, 6, 9])('re-routes for %i columns', (count) => {
    const columns = Array.from({ length: count }, (_, i) => column(106 + i * 322));
    const { segments } = routeTree({ root: null, branch: [], columns, railY: 172 });
    expect(byRole(segments, 'tick')).toHaveLength(count);
    if (count === 1) {
      // A rail between one column and itself would render as a dot.
      expect(byRole(segments, 'rail')).toHaveLength(0);
    } else {
      const [rail] = byRole(segments, 'rail');
      expect(rail.x1).toBeCloseTo(centreX(columns[0]));
      expect(rail.x2).toBeCloseTo(centreX(columns.at(-1)));
    }
  });

  test('removing the middle column leaves no dangling tick', () => {
    const without = [five[0], five[1], five[3], five[4]];
    const { segments } = routeTree({ root: null, branch: [], columns: without, railY: 172 });
    const ticks = byRole(segments, 'tick');
    expect(ticks).toHaveLength(4);
    const gone = centreX(five[2]);
    expect(ticks.some((t) => Math.abs(t.x1 - gone) < 1)).toBe(false);
    // and the rail still ends on real columns
    const [rail] = byRole(segments, 'rail');
    expect(rail.x2).toBeCloseTo(centreX(without.at(-1)));
  });

  test('the trunk runs from the root pill down to the rail', () => {
    const root = { x: 765, y: 33, width: 310, height: 46 };
    const { segments, trunkX } = routeTree({ root, branch: [], columns: five, railY: 172 });
    const [trunk] = byRole(segments, 'trunk');
    expect(trunkX).toBeCloseTo(920);
    expect(trunk.y1).toBe(79); // bottom of the pill
    expect(trunk.y2).toBe(172); // the rail
    expect(trunk.x1).toBeCloseTo(trunk.x2);
  });

  test('branch pills connect inward to the trunk and meet it exactly', () => {
    const root = { x: 765, y: 33, width: 310, height: 46 };
    const branch = [
      { x: 479, y: 109, width: 301, height: 42 },
      { x: 1064, y: 109, width: 310, height: 42 },
    ];
    const { segments } = routeTree({ root, branch, columns: five, railY: 172 });
    const [line] = byRole(segments, 'branch');
    // The two inward segments touch at the trunk, so they merge into one run
    // with no seam in the middle.
    expect(byRole(segments, 'branch')).toHaveLength(1);
    expect(line.x1).toBeCloseTo(780); // right edge of the left pill
    expect(line.x2).toBeCloseTo(1064); // left edge of the right pill
    expect(line.y1).toBe(130);
  });

  test('a pill sitting on the trunk gets no stub', () => {
    const root = { x: 765, y: 33, width: 310, height: 46 };
    const branch = [{ x: 800, y: 109, width: 240, height: 42 }]; // straddles x=920
    const { segments } = routeTree({ root, branch, columns: five, railY: 172 });
    expect(byRole(segments, 'branch')).toHaveLength(0);
  });

  test('with no root the tree still centres itself on the columns', () => {
    const { trunkX } = routeTree({ root: null, branch: [], columns: five, railY: 172 });
    expect(trunkX).toBeCloseTo((centreX(five[0]) + centreX(five.at(-1))) / 2);
  });
});

describe('routeRail (stacked layout)', () => {
  const cards = [
    { x: 40, y: 0, width: 300, height: 60 },
    { x: 40, y: 80, width: 300, height: 60 },
    { x: 40, y: 160, width: 300, height: 60 },
  ];

  test('the rail stops at the first and last tick, never overshooting', () => {
    const { segments } = routeRail({ railX: 16, cards });
    const [rail] = segments.filter((s) => s.role === 'rail');
    expect(rail.y1).toBe(30);
    expect(rail.y2).toBe(190);
  });

  test('every card gets a tick that lands on its left edge', () => {
    const { segments } = routeRail({ railX: 16, cards });
    const ticks = segments.filter((s) => s.role === 'tick');
    expect(ticks).toHaveLength(3);
    for (const tick of ticks) expect(tick.x2).toBe(40);
  });

  test('a single card needs no rail', () => {
    const { segments } = routeRail({ railX: 16, cards: [cards[0]] });
    expect(segments.filter((s) => s.role === 'rail')).toHaveLength(0);
    expect(segments.filter((s) => s.role === 'tick')).toHaveLength(1);
  });

  test('no cards, no lines', () => {
    expect(routeRail({ railX: 16, cards: [] }).segments).toEqual([]);
  });
});

describe('mergeCollinear', () => {
  test('abutting runs become one, so no seam shows at the join', () => {
    const merged = mergeCollinear([
      { x1: 0, y1: 10, x2: 50, y2: 10, role: 'rail' },
      { x1: 50, y1: 10, x2: 120, y2: 10, role: 'rail' },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ x1: 0, x2: 120 });
  });

  test('overlapping runs do not double up', () => {
    const merged = mergeCollinear([
      { x1: 0, y1: 10, x2: 80, y2: 10, role: 'rail' },
      { x1: 40, y1: 10, x2: 120, y2: 10, role: 'rail' },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ x1: 0, x2: 120 });
  });

  test('separate lines stay separate', () => {
    const merged = mergeCollinear([
      { x1: 0, y1: 10, x2: 50, y2: 10, role: 'rail' },
      { x1: 60, y1: 10, x2: 120, y2: 10, role: 'rail' },
      { x1: 0, y1: 40, x2: 50, y2: 40, role: 'rail' },
    ]);
    expect(merged).toHaveLength(3);
  });

  test('a crossing is left alone — the trunk keeps running through the branch', () => {
    const merged = mergeCollinear([
      { x1: 920, y1: 79, x2: 920, y2: 172, role: 'trunk' },
      { x1: 780, y1: 130, x2: 1064, y2: 130, role: 'branch' },
    ]);
    expect(merged).toHaveLength(2);
  });
});
