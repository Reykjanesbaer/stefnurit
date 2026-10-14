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
 * Set by the content, not by a device. The binding measurement is
 * "Upplýsingaöryggisstefna" with its external-link icon: at the body size it
 * wants roughly 205 px of label, and five columns of that plus gaps and page
 * padding is more than a 1366 px laptop has. Chromium ships no Icelandic
 * hyphenation patterns, so a column narrower than the word has to break the
 * compound mid-syllable.
 *
 * The threshold used to be 1400, which stacked every laptop made in the last
 * decade. It is 1240 now because between 1240 and 1400 the columns survive on
 * the design's own minimum spacing — see TIGHTEN_BELOW. Below 1240 they do not:
 * labels start overflowing their cards rather than merely wrapping, which is
 * the point where stacking is the better answer. Measured, not guessed:
 * docs/qa/breakpoints/README.md has the numbers and the screenshots.
 */
export const STACK_BELOW = 1240;

/**
 * Between STACK_BELOW and this width, spacing drops to the design's own floors.
 *
 * Every token the band overrides is set to the low end of a clamp this file
 * already declares, so nothing new is invented — a 1280 px laptop simply gets
 * the padding a phone gets, which is what buys the fifth column.
 *
 * At and above this width not one pixel changes. That is a hard constraint, not
 * a preference: the layout at 1400 px and up is the design that was signed off,
 * and `npm run qa` diffs against it.
 */
export const TIGHTEN_BELOW = 1400;

/**
 * The token overrides that apply in the tightened band.
 *
 * Values, not a stylesheet, so the test suite can assert that each one is the
 * floor of the clamp it replaces rather than an arbitrary smaller number.
 */
export const TIGHTENED = {
  'page-padding-inline': '1rem',
  'column-gap': '0.4rem',
  'card-padding-inline': '0.9rem',
  'card-padding-block': '0.85rem',
  'backing-offset': '8px',
  'backing-inset': '5px',
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
