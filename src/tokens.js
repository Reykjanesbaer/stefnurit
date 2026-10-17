/**
 * Design tokens.
 *
 * These started life as measurements taken off the Canva export, scaled from a
 * fixed 1850 × 980 page. That bought a pixel match and cost legibility: every
 * length, including type, shrank in proportion to the widget, so body text hit
 * its 12 px floor well before a tablet.
 *
 * Now that the design is ours rather than a reproduction, the proportions are
 * kept but the units are real. Type is fluid between a readable minimum and the
 * size the original used at full width, and everything else is on a plain rem
 * scale. `cqw` rather than `vw` throughout, so a widget in a narrow CMS column
 * sizes itself to that column and not to the window behind it.
 */

/**
 * Below this width the column tree gives way to a stacked rail.
 *
 * It was 1400, then 1240, then 923; it is 700 because that is where the tree
 * stops fitting, not where a device class starts. Measured with the COMPACT
 * spacing below, type at its 15px floor and long words breaking at their seams:
 * from 700px up every label stays inside its card, no word breaks mid-syllable
 * and every card title fits. At 650px "Menningarmál" and "Umhverfismál" already
 * run out of their cards, and at 600px four of the six titles do. Docs and the
 * per-width table are in docs/qa/README.md.
 *
 * So 785px, a tablet at 768px and a narrow browser window all get the tree. A
 * page that wants the tree below 700px cannot have it at a readable size; the
 * iframe snippet keeps it at 700px and lets the frame scroll sideways instead
 * (admin/src/embed-snippets.js).
 *
 * What makes the narrow widths possible is economy: the layout drops its padding
 * in two steps (TIGHTENED, then COMPACT) and long compound words may break at
 * their seams (src/seams.js) instead of in the middle of a syllable. Chromium
 * ships no Icelandic hyphenation patterns, so without the seams a column
 * narrower than "Upplýsingaöryggisstefna" would break it anywhere at all.
 *
 * Type stays at its 15px floor throughout; nothing here shrinks text to make
 * the columns fit.
 */
export const STACK_BELOW = 700;

/**
 * Between STACK_BELOW and this width, spacing is COMPACT; between this and
 * TIGHTEN_BELOW it is TIGHTENED; at and above TIGHTEN_BELOW it is the design.
 */
export const COMPACT_BELOW = 1240;

/**
 * Between COMPACT_BELOW and this width, spacing drops to the design's own floors.
 *
 * Every token the band overrides is set to the low end of a clamp this file
 * already declares, so nothing new is invented — a 1280 px laptop simply gets
 * the spacing a phone gets, which is what buys the fifth column.
 *
 * At and above this width not one pixel changes. That is a hard constraint, not
 * a preference: the layout at 1400 px and up is the design that was signed off,
 * and `npm run qa:diff` compares against it.
 */
export const TIGHTEN_BELOW = 1400;

/** Token overrides for COMPACT_BELOW..TIGHTEN_BELOW: the clamps' own floors. */
export const TIGHTENED = {
  'page-padding-inline': '1rem',
  'column-gap': '0.4rem',
  'card-padding-inline': '0.9rem',
  'card-padding-block': '0.85rem',
  'backing-offset': '8px',
  'backing-inset': '5px',
};

/**
 * Token overrides for STACK_BELOW..COMPACT_BELOW.
 *
 * Deliberately *below* the floors the clamps declare — this is the one band
 * where that is allowed, because it exists to fit five columns into 700px. The
 * page keeps only 0.15px either side, so the tree runs edge to edge in the
 * column the host page gives it; the host supplies its own margins.
 */
export const COMPACT = {
  'page-padding-inline': '0.15px',
  'column-gap': '0.25rem',
  'card-padding-inline': '0.5rem',
  'card-padding-block': '0.7rem',
  'backing-offset': '6px',
  'backing-inset': '4px',
  'bullet-gap': '0.5em',
};

export const TOKENS = {
  // ---- colour (from the original, colour-picked; see docs/design-inventory.md)
  'color-surface': '#FFFFFF',
  'color-primary': '#1F559F',
  'color-accent': '#009EBF',
  'color-pill': '#2562AE',
  'color-on-dark': '#FFFFFF',
  'color-focus': '#FFFFFF',
  'line-color': '#C6CDD6',

  // ---- type ----------------------------------------------------------------
  'font-family': "'Figtree', 'Figtree Fallback', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  // 15px at phone width, 18px at the original's full width — never below 15.
  'font-size-item': 'clamp(0.9375rem, 0.84rem + 0.26cqw, 1.125rem)',
  'font-size-title': 'clamp(1.0625rem, 0.95rem + 0.30cqw, 1.375rem)',
  'font-size-pill': 'clamp(1rem, 0.90rem + 0.28cqw, 1.25rem)',
  'font-weight-heading': '700',
  'font-weight-item': '400',
  'line-height': '1.4',

  // ---- geometry ------------------------------------------------------------
  'line-width': '2px',
  'radius': '10px',

  'page-padding-inline': 'clamp(1rem, 3cqw, 3.5rem)',
  'page-padding-top': 'clamp(1rem, 2cqw, 2rem)',
  'page-padding-bottom': 'clamp(1.5rem, 3cqw, 3.25rem)',

  'branch-top': 'clamp(0.75rem, 1.6cqw, 1.75rem)',
  'branch-gap': 'clamp(1.5rem, 15cqw, 17.5rem)',
  'grid-top': 'clamp(1.75rem, 2.8cqw, 3rem)',

  'pill-min-width': 'clamp(12rem, 17cqw, 19.5rem)',
  'pill-padding-block': '0.55rem',
  'pill-padding-inline': '1.25rem',

  'column-gap': 'clamp(0.4rem, 0.9cqw, 1rem)',
  'card-gap': 'clamp(1rem, 1.9cqw, 2.25rem)',
  'card-padding-inline': 'clamp(0.9rem, 1.5cqw, 1.75rem)',
  'card-padding-block': 'clamp(0.85rem, 1.2cqw, 1.35rem)',
  'title-gap': '0.7rem',

  // The accent rectangle that shows down a card's right-hand edge.
  'backing-offset': 'clamp(8px, 1.1cqw, 20px)',
  'backing-inset': 'clamp(5px, 0.5cqw, 9px)',

  'item-gap': '0.55rem',
  'item-padding': '0.14rem',
  'bullet-size': '0.28em',
  'bullet-gap': '0.75em',
  'icon-size': '0.92em',
  'icon-gap': '0.38em',

  // ---- stacked layout ------------------------------------------------------
  'stack-rail': '2.1rem',
  // Keeps the stacked list to a comfortable measure instead of one wide sprawl.
  'stack-max-width': '46rem',
  'stack-gap': '0.75rem',
};

/** Token names a `theme` block in the JSON, or the page, may override. */
export const THEMEABLE = Object.keys(TOKENS);
