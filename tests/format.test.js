import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatJson } from '../src/format.js';

const path = new URL('../src/data/stefnurit.json', import.meta.url);
const raw = readFileSync(path, 'utf8');

describe('JSON round-trip', () => {
  // If this drifts, every edit-mode download rewrites the whole file and the
  // git diff stops showing what actually changed.
  test('re-formatting the committed file reproduces it byte for byte', () => {
    expect(formatJson(JSON.parse(raw))).toBe(raw);
  });

  test('an untouched document comes back unchanged', () => {
    const data = JSON.parse(raw);
    expect(formatJson(JSON.parse(formatJson(data)))).toBe(formatJson(data));
  });

  test('changing one href changes exactly one line', () => {
    const data = JSON.parse(raw);
    const section = data.sections.find((s) => s.kind === 'columns');
    section.columns[0].cards[0].items[0].href = 'https://www.reykjanesbaer.is/nytt.pdf';

    const before = raw.split('\n');
    const after = formatJson(data).split('\n');
    expect(after).toHaveLength(before.length);
    const differing = before.map((line, i) => (line === after[i] ? null : i)).filter((i) => i !== null);
    expect(differing).toHaveLength(1);
  });

  test('ends with exactly one newline', () => {
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.endsWith('\n\n')).toBe(false);
  });
});
