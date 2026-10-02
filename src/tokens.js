/**
 * Design tokens, measured from the Canva reference (see docs/design-inventory.md).
 *
 * Lengths are expressed in *reference pixels* — the units of the 1850 × 980
 * Canva page — and converted to CSS by multiplying with `--sr-u`, which is one
 * reference pixel's worth of the widget's current width. That is why the
 * widget keeps the design's proportions at any size without a single
 * breakpoint-specific number: change the container width and every rectangle,
 * gap, radius, line and type size moves together.
 */
export const REFERENCE_WIDTH = 1850;
export const REFERENCE_HEIGHT = 980;

/** Width below which the tree layout is abandoned for a stacked rail. */
export const STACK_BELOW = 720;

export const TOKENS = {
  // ---- colour (exact, colour-picked from the reference render) -------------
  'color-surface': '#FFFFFF',
  'color-primary': '#1F559F',
  'color-accent': '#009EBF',
  'color-pill': '#2562AE',
  'color-on-dark': '#FFFFFF',
  'color-focus': '#FFFFFF',
  'line-color': '#CACACA',

  // ---- geometry, in reference px ------------------------------------------
  'line-width': '2',
  'radius-card': '9',
  'radius-pill': '8',

  'page-margin': '106',
  'page-bottom': '101',
  'root-top': '33',
  'pill-height': '46',
  'pill-width': '310',
  'pill-padding-x': '26',
  'branch-gap': '284',
  'branch-top': '31',
  'rail-offset': '21',
  'grid-top': '48',

  'column-gap': '0',
  'card-gap': '33',
  'card-padding-x': '40',
  'card-padding-top': '18',
  'card-padding-bottom': '9',
  'backing-offset': '21',
  'backing-inset': '9',

  'heading-size': '22',
  'heading-gap': '15',
  'item-size': '18',
  'item-pitch': '41.05',
  'bullet-size': '4',
  'bullet-gap': '14',
  'icon-size': '14',
  'icon-gap': '7',

  // ---- type ----------------------------------------------------------------
  'font-family': "'Figtree', 'Figtree Fallback', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  'font-weight-heading': '700',
  'font-weight-item': '400',
  'line-height': '1.32',

  // ---- minimum legible text, overriding pure scaling ----------------------
  'min-font-size': '12px',
};

/** Token names a `theme` block in the JSON (or a page) may override. */
export const THEMEABLE = Object.keys(TOKENS);
