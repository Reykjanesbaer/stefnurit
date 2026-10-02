/**
 * The one place that decides how stefnurit.json is written out.
 *
 * Edit mode and the committed file have to agree character for character,
 * otherwise every download reformats the whole document and the git diff
 * stops showing what actually changed.
 */
export function formatJson(data) {
  return JSON.stringify(data, null, 2) + '\n';
}
