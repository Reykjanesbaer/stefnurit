/**
 * WCAG 2.1 contrast maths.
 *
 * Used by the admin panel to warn about the teal the design ships with, and by
 * the theme editor to suggest a passing shade. Pure and dependency-free so it
 * runs in the widget, the panel and the tests alike.
 */

/** #RGB, #RRGGBB or #RRGGBBAA -> [r, g, b], or null if it is not a hex colour. */
export function parseHex(value) {
  const text = String(value).trim().replace(/^#/, '');
  const expand = text.length === 3 || text.length === 4
    ? text.slice(0, 3).split('').map((c) => c + c).join('')
    : text.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(expand)) return null;
  return [0, 2, 4].map((i) => parseInt(expand.slice(i, i + 2), 16));
}

/** WCAG relative luminance. */
export function luminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const v = channel / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a, b) {
  const first = Array.isArray(a) ? a : parseHex(a);
  const second = Array.isArray(b) ? b : parseHex(b);
  if (!first || !second) return null;
  const light = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (light + 0.05) / (dark + 0.05);
}

/** AA needs 4.5:1 for body text, 3:1 for large text (>=24px, or >=18.66px bold). */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;
export const AAA_NORMAL = 7;

export function assess(foreground, background, { large = false } = {}) {
  const ratio = contrastRatio(foreground, background);
  if (ratio === null) return null;
  const required = large ? AA_LARGE : AA_NORMAL;
  return {
    ratio,
    rounded: Math.round(ratio * 100) / 100,
    passesAA: ratio >= required,
    passesAAA: ratio >= (large ? AA_NORMAL : AAA_NORMAL),
    required,
  };
}

/**
 * The nearest darker shade of `background` that reaches `target` against
 * `foreground`, found by walking the colour down toward black.
 *
 * Returned as a suggestion only. Changing a municipality's colour is not a
 * decision a script gets to make, so nothing here is ever applied automatically.
 */
export function darkenToPass(background, foreground = '#FFFFFF', target = AA_NORMAL) {
  const base = parseHex(background);
  if (!base) return null;
  if (contrastRatio(base, foreground) >= target) {
    return { hex: toHex(base), ratio: contrastRatio(base, foreground), unchanged: true };
  }

  let best = null;
  // 1% steps toward black: fine enough that the suggestion stays recognisably
  // the same colour, coarse enough to be instant.
  for (let step = 1; step <= 100; step += 1) {
    const factor = 1 - step / 100;
    const candidate = base.map((channel) => Math.round(channel * factor));
    const ratio = contrastRatio(candidate, foreground);
    if (ratio >= target) { best = { hex: toHex(candidate), ratio, unchanged: false }; break; }
  }
  return best;
}

export function toHex(rgb) {
  return '#' + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0').toUpperCase()).join('');
}
