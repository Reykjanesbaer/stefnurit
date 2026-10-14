/**
 * Icelandic names for link outcomes.
 *
 * Duplicated from scripts/check-links.mjs rather than imported: that module
 * reaches for node:fs at load time, which a browser bundle has no business
 * pulling in for five words.
 */
export const OUTCOME_IS = {
  ok: 'í lagi',
  redirect: 'áframsending',
  broken: 'bilaður',
  unknown: 'óviss',
  empty: 'enginn hlekkur',
};
