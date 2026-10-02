/**
 * Connector geometry for <stefnu-rit>.
 *
 * The 2025 design has no cell borders — every line is part of one connector
 * tree whose shape follows the *positions of the boxes*, not a fixed drawing:
 *
 *      ┌──────────┐                 root pill
 *      └────┬─────┘
 *   ┌─────┐ │ ┌─────┐               branch pills, connected inward to the trunk
 *   └─────┤ │ ├─────┘
 *   ──────┴─┴─┴──────────           rail, spanning first→last column centre
 *     │     │     │                 one tick per column, on its centre
 *   ┌───┐ ┌───┐ ┌───┐
 *
 * Everything here is pure: rectangles in, segments out. That is what makes
 * "add a column and the lines re-route themselves" true — the caller measures
 * the live DOM and hands the rectangles over, so there is no drawing to keep
 * in sync with the data.
 *
 * Coordinates are in the SVG's own user space (CSS px relative to the host).
 */

/** @typedef {{x:number, y:number, width:number, height:number}} Rect */
/** @typedef {{x1:number, y1:number, x2:number, y2:number, role:string}} Segment */

const EPS = 0.01;

export const centreX = (r) => r.x + r.width / 2;
export const centreY = (r) => r.y + r.height / 2;
export const right = (r) => r.x + r.width;
export const bottom = (r) => r.y + r.height;

/**
 * Lay out the wide ("tree") connector set.
 *
 * @param {object}   input
 * @param {Rect?}    input.root     the single root pill, or null
 * @param {Rect[]}   input.branch   second-level pills, any number, any order
 * @param {Rect[]}   input.columns  one rect per column (its full bounding box)
 * @param {number}   input.railY    y of the horizontal rail
 * @param {number=}  input.branchY  y of the branch line; defaults to the
 *                                  vertical centre of the branch pills
 * @returns {{segments: Segment[], trunkX: number|null, railY: number}}
 */
export function routeTree({ root, branch = [], columns = [], railY, branchY }) {
  const segments = [];

  // The trunk hangs off the root pill. With no root there is no trunk, and the
  // branch pills then connect to the centre of the rail instead, so the tree
  // never ends up with floating stubs.
  const trunkX = root ? centreX(root) : columns.length ? midpointOfColumns(columns) : null;

  const pills = branch.filter(Boolean);
  const lineY = branchY ?? (pills.length ? average(pills.map(centreY)) : null);

  if (root) {
    segments.push({ x1: trunkX, y1: bottom(root), x2: trunkX, y2: railY, role: 'trunk' });
  }

  // Each branch pill reaches *inward* to the trunk: a pill to the left of the
  // trunk connects from its right edge, one to the right from its left edge.
  // A pill sitting on the trunk needs no connector at all.
  if (trunkX !== null && lineY !== null) {
    for (const pill of pills) {
      if (right(pill) < trunkX - EPS) {
        segments.push({ x1: right(pill), y1: lineY, x2: trunkX, y2: lineY, role: 'branch' });
      } else if (pill.x > trunkX + EPS) {
        segments.push({ x1: trunkX, y1: lineY, x2: pill.x, y2: lineY, role: 'branch' });
      }
    }
  }

  if (columns.length) {
    const centres = columns.map(centreX).sort((a, b) => a - b);
    const first = centres[0];
    const last = centres[centres.length - 1];

    // A single column has nothing to span, so the rail is dropped and the tick
    // alone carries the eye down. Drawing a zero-length rail would leave a dot.
    if (last - first > EPS) {
      segments.push({ x1: first, y1: railY, x2: last, y2: railY, role: 'rail' });
    }

    for (const col of columns) {
      segments.push({ x1: centreX(col), y1: railY, x2: centreX(col), y2: col.y, role: 'tick' });
    }
  }

  return { segments: mergeCollinear(segments), trunkX, railY };
}

/**
 * Lay out the narrow ("stacked") connector set: one vertical rail down the
 * left with a tick into each card, replacing the elbows of the wide layout.
 *
 * @param {object} input
 * @param {number} input.railX   x of the vertical rail
 * @param {Rect[]} input.cards   every card, in document order
 * @returns {{segments: Segment[]}}
 */
export function routeRail({ railX, cards = [] }) {
  if (!cards.length) return { segments: [] };

  const segments = [];
  const first = cards[0];
  const last = cards[cards.length - 1];

  // The rail stops at the first and last tick rather than running the full
  // height, so it never overshoots into white space.
  const top = centreY(first);
  const foot = centreY(last);
  if (foot - top > EPS) {
    segments.push({ x1: railX, y1: top, x2: railX, y2: foot, role: 'rail' });
  }

  for (const card of cards) {
    segments.push({ x1: railX, y1: centreY(card), x2: card.x, y2: centreY(card), role: 'tick' });
  }

  return { segments: mergeCollinear(segments) };
}

/**
 * Merge segments that lie on the same axis-aligned line and touch or overlap.
 *
 * Two strokes of the same colour drawn on top of each other are invisible to
 * the eye but not to a visual diff, and a seam between two abutting strokes
 * shows as a notch at some zoom levels. Merging removes both.
 */
export function mergeCollinear(segments) {
  /** @type {Map<string, Segment[]>} */
  const lanes = new Map();
  const out = [];

  for (const seg of segments) {
    const vertical = Math.abs(seg.x1 - seg.x2) < EPS;
    const horizontal = Math.abs(seg.y1 - seg.y2) < EPS;
    if (!vertical && !horizontal) {
      out.push(seg); // diagonal: nothing to merge it with
      continue;
    }
    const key = vertical
      ? `v:${round(seg.x1)}:${seg.role}`
      : `h:${round(seg.y1)}:${seg.role}`;
    if (!lanes.has(key)) lanes.set(key, []);
    lanes.get(key).push(seg);
  }

  for (const [key, group] of lanes) {
    const vertical = key.startsWith('v:');
    const spans = group
      .map((s) => (vertical
        ? { lo: Math.min(s.y1, s.y2), hi: Math.max(s.y1, s.y2), fixed: s.x1, role: s.role }
        : { lo: Math.min(s.x1, s.x2), hi: Math.max(s.x1, s.x2), fixed: s.y1, role: s.role }))
      .sort((a, b) => a.lo - b.lo);

    let current = null;
    for (const span of spans) {
      if (current && span.lo <= current.hi + EPS) {
        current.hi = Math.max(current.hi, span.hi);
      } else {
        if (current) out.push(toSegment(current, vertical));
        current = { ...span };
      }
    }
    if (current) out.push(toSegment(current, vertical));
  }

  return out;
}

function toSegment(span, vertical) {
  return vertical
    ? { x1: span.fixed, y1: span.lo, x2: span.fixed, y2: span.hi, role: span.role }
    : { x1: span.lo, y1: span.fixed, x2: span.hi, y2: span.fixed, role: span.role };
}

function midpointOfColumns(columns) {
  const centres = columns.map(centreX);
  return (Math.min(...centres) + Math.max(...centres)) / 2;
}

const average = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round = (n) => Math.round(n * 100) / 100;
