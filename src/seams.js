/**
 * Where an Icelandic compound word may break.
 *
 * Chromium has no Icelandic hyphenation patterns, so `hyphens: auto` does
 * nothing for this language and a word wider than its column is broken wherever
 * the line happens to end — "Upplýsingaöryggisstefn" over "a". Icelandic breaks
 * compounds at their joins, with a hyphen: Upplýsinga-öryggis-stefna.
 *
 * This is deliberately a small list, not a hyphenation engine. It knows the
 * second halves that recur in the municipality's policy names, and the word
 * "stefna" itself. A word it does not recognise is left alone, which is exactly
 * the old behaviour — never worse, sometimes better.
 */

/** Compound heads that may begin a new line when something longer precedes them. */
const HEADS = ['öryggis', 'tækni', 'verndar', 'réttinda', 'launa', 'köku', 'mála', 'bæjar'];

/** "stefna" and the forms it takes: stefna, stefnu, stefnan, stefnunnar … */
const STEFNA = /stefn(?:a|u|an|una|unnar|unni)$/i;

const MIN_WORD = 11;     // shorter words fit a column on their own
const MIN_PIECE = 3;     // never strand one or two letters on a line

/**
 * Character offsets inside `word` where a break may be offered.
 *
 * @param {string} word
 * @returns {number[]}  ascending; empty when the word is short or unrecognised
 */
export function seamOffsets(word) {
  if (typeof word !== 'string' || word.length < MIN_WORD) return [];
  const lower = word.toLocaleLowerCase('is');
  const found = new Set();

  for (const head of HEADS) {
    // From index 4: a head at the very start of a word is the word's own start.
    const at = lower.indexOf(head, 4);
    if (at >= 4) found.add(at);
  }

  const stefna = STEFNA.exec(word);
  if (stefna && stefna.index >= 4) found.add(stefna.index);

  const offsets = [...found].sort((a, b) => a - b);
  // Drop a seam that would leave a sliver on either side of it.
  return offsets.filter((at, i) => {
    const before = at - (offsets[i - 1] ?? 0);
    const after = (offsets[i + 1] ?? word.length) - at;
    return before >= MIN_PIECE && after >= MIN_PIECE;
  });
}

/**
 * `label` as HTML-safe markup with an empty `<span class="seam">` at every seam.
 *
 * The span is empty on purpose. It has no width and offers no break until the
 * stylesheet, inside the narrow layouts only, gives it a soft hyphen. At and
 * above 1400px the signed-off layout therefore renders exactly as before, and
 * `textContent` — what tests and assistive technology read — is unchanged.
 *
 * @param {string} label
 * @param {(text: string) => string} escape  HTML-escapes a plain string
 */
export function withSeams(label, escape) {
  return String(label)
    .split(/(\s+)/)
    .map((token) => {
      const offsets = seamOffsets(token);
      if (offsets.length === 0) return escape(token);
      const pieces = [];
      let from = 0;
      for (const at of [...offsets, token.length]) {
        pieces.push(escape(token.slice(from, at)));
        from = at;
      }
      return pieces.join('<span class="seam"></span>');
    })
    .join('');
}
