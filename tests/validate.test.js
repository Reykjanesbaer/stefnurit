import { describe, expect, test } from 'vitest';
import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { validate, collectItems } from '../src/validate.js';

const data = JSON.parse(readFileSync(new URL('../src/data/stefnurit.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../src/data/stefnurit.schema.json', import.meta.url), 'utf8'));

const minimal = () => ({
  title: 'T',
  sections: [{ id: 'rot', kind: 'root', items: [{ id: 'a', label: 'A', href: 'https://x.is/a.pdf' }] }],
});

describe('the shipped document', () => {
  test('passes the runtime validator with no errors or warnings', () => {
    expect(validate(data)).toEqual({ ok: true, errors: [], warnings: [] });
  });

  test('passes the JSON Schema', () => {
    const check = new Ajv({ allErrors: true, strict: false }).compile(schema);
    expect(check(data) || check.errors).toBe(true);
  });

  test('every link is https', () => {
    for (const { item } of collectItems(data)) {
      expect(item.href, item.label).toMatch(/^https:\/\//);
    }
  });

  test('holds all 24 links from the design', () => {
    expect(collectItems(data)).toHaveLength(24);
  });
});

describe('the validator and the schema agree', () => {
  const check = new Ajv({ allErrors: true, strict: false }).compile(schema);
  const cases = [
    ['a root section holding two items', (d) => d.sections[0].items.push({ id: 'b', label: 'B' })],
    ['an id with spaces', (d) => { d.sections[0].id = 'not an id'; }],
    ['an unknown colorToken', (d) => { d.sections[0].items[0].colorToken = 'teal'; }],
    ['an unknown link kind', (d) => { d.sections[0].items[0].kind = 'word'; }],
    ['an empty label', (d) => { d.sections[0].items[0].label = ''; }],
    ['a missing title', (d) => { delete d.title; }],
    ['a columns section carrying items', (d) => d.sections.push({ id: 'c', kind: 'columns', items: [] })],
    ['a column with no cards', (d) => d.sections.push({ id: 'c', kind: 'columns', columns: [{ id: 'k', cards: [] }] })],
  ];

  test.each(cases)('both reject %s', (_name, mutate) => {
    const document = minimal();
    mutate(document);
    expect(validate(document).ok).toBe(false);
    expect(check(document)).toBe(false);
  });

  // Draft-07 has no way to say "unique across the whole document", so id
  // collisions are the one rule only the runtime validator can enforce. They
  // matter: ids become DOM ids and anchors, and a duplicate silently breaks
  // both.
  test('only the runtime validator can catch a duplicate id', () => {
    const document = minimal();
    document.sections.push({ id: 'rot', kind: 'root', items: [{ id: 'c', label: 'C' }] });
    expect(validate(document).ok).toBe(false);
    expect(check(document)).toBe(true);
  });
});

describe('error messages name the thing that is wrong', () => {
  test('the path points at the offending item', () => {
    const document = minimal();
    document.sections[0].items[0].label = '';
    expect(validate(document).errors[0]).toContain('sections[0].items[0].label');
  });

  test('a duplicate id says where the first one was', () => {
    const document = minimal();
    document.sections.push({ id: 'rot', kind: 'root', items: [{ id: 'z', label: 'Z' }] });
    expect(validate(document).errors.join(' ')).toContain('already used at sections[0].id');
  });

  test('a malformed href is reported, an empty one is allowed', () => {
    const document = minimal();
    document.sections[0].items[0].href = 'reykjanesbaer.is/x.pdf';
    expect(validate(document).ok).toBe(false);

    const blank = minimal();
    blank.sections[0].items[0].href = '';
    expect(validate(blank).ok).toBe(true);
  });

  test('http is a warning, not an error — the widget still renders', () => {
    const document = minimal();
    document.sections[0].items[0].href = 'http://reykjanesbaer.is/x.pdf';
    const result = validate(document);
    expect(result.ok).toBe(true);
    expect(result.warnings[0]).toContain('prefer https');
  });

  test('garbage in gives a message rather than a crash', () => {
    for (const input of [null, 42, 'text', [], undefined]) {
      expect(() => validate(input)).not.toThrow();
      expect(validate(input).ok).toBe(false);
    }
  });
});
