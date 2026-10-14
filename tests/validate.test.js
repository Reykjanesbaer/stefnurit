import { describe, expect, test } from 'vitest';
import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { validate, collectItems, issuesInIcelandic, LIMITS } from '../src/validate.js';

const data = JSON.parse(readFileSync(new URL('../src/data/stefnurit.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../src/data/stefnurit.schema.json', import.meta.url), 'utf8'));

const minimal = () => ({
  schemaVersion: 1,
  title: 'T',
  sections: [{ id: 'rot', kind: 'root', items: [{ id: 'a', label: 'A', href: 'https://x.is/a.pdf' }] }],
});

describe('the shipped document', () => {
  test('passes the runtime validator with no errors or warnings', () => {
    // toMatchObject rather than toEqual: validate() also returns the structured
    // `issues` the admin panel renders in Icelandic, and asserting the exact
    // shape of the result would fail every time a field is added to it.
    expect(validate(data)).toMatchObject({ ok: true, errors: [], warnings: [] });
    expect(validate(data).issues).toEqual([]);
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

describe('link scheme rules', () => {
  const withHref = (href) => {
    const doc = minimal();
    doc.sections[0].items[0].href = href;
    return validate(doc);
  };

  test('https is accepted silently', () => {
    const result = withHref('https://www.reykjanesbaer.is/a.pdf');
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test('an empty href is a deliberate, valid state', () => {
    expect(withHref('').ok).toBe(true);
  });

  test('http is a warning, not a blocker', () => {
    const result = withHref('http://www.reykjanesbaer.is/a.pdf');
    expect(result.ok).toBe(true);
    expect(result.warnings[0]).toContain('prefer https');
  });

  // A link the browser would execute or read from disk has no business in a
  // document that non-developers edit and that renders as clickable links.
  test.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ])('%s is a blocking error', (href) => {
    const result = withHref(href);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'href-scheme')).toBe(true);
  });

  test.each(['reykjanesbaer.is/a.pdf', '/static/a.pdf', '../a.pdf', 'www.reykjanesbaer.is'])(
    '%s is rejected as not absolute', (href) => {
      const result = withHref(href);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === 'href-relative')).toBe(true);
    },
  );
});

describe('length limits', () => {
  test('an over-long label is rejected', () => {
    const doc = minimal();
    doc.sections[0].items[0].label = 'x'.repeat(LIMITS.label + 1);
    const result = validate(doc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'label-length')).toBe(true);
  });

  test('a label exactly at the limit is fine', () => {
    const doc = minimal();
    doc.sections[0].items[0].label = 'x'.repeat(LIMITS.label);
    expect(validate(doc).ok).toBe(true);
  });

  test('an over-long href is rejected', () => {
    const doc = minimal();
    doc.sections[0].items[0].href = `https://x.is/${'a'.repeat(LIMITS.href)}`;
    expect(validate(doc).ok).toBe(false);
  });

  test('an over-long card title is rejected', () => {
    const doc = minimal();
    doc.sections.push({
      id: 'mal', kind: 'columns',
      columns: [{ id: 'd1', cards: [{ id: 'k1', title: 'x'.repeat(LIMITS.cardTitle + 1), items: [] }] }],
    });
    expect(validate(doc).ok).toBe(false);
  });
});

describe('unknown fields', () => {
  test('an unknown field on an item is rejected and names the allowed set', () => {
    const doc = minimal();
    doc.sections[0].items[0].colour = 'red';
    const result = validate(doc);
    expect(result.ok).toBe(false);
    const issue = result.issues.find((i) => i.code === 'unknown-field');
    expect(issue.path).toBe('sections[0].items[0].colour');
    expect(issue.en).toContain('label');
  });

  test('an unknown field at the top level is rejected', () => {
    const doc = { ...minimal(), published: true };
    expect(validate(doc).ok).toBe(false);
  });

  test.each(['section', 'column', 'card'])('an unknown field on a %s is rejected', (level) => {
    const doc = minimal();
    const section = { id: 'mal', kind: 'columns', columns: [{ id: 'd1', cards: [{ id: 'k1', title: 'K', items: [] }] }] };
    const target = { section, column: section.columns[0], card: section.columns[0].cards[0] }[level];
    target.extra = 1;
    doc.sections.push(section);
    expect(validate(doc).ok).toBe(false);
  });
});

describe('schema version', () => {
  test('a future version is refused', () => {
    expect(validate({ ...minimal(), schemaVersion: 99 }).ok).toBe(false);
  });

  test('an invalid version is refused', () => {
    expect(validate({ ...minimal(), schemaVersion: 'one' }).ok).toBe(false);
  });

  test('a missing version is fine — it means 1', () => {
    const { schemaVersion, ...doc } = minimal();
    expect(validate(doc).ok).toBe(true);
  });
});

describe('bilingual issues', () => {
  test('every issue carries both an Icelandic and an English message', () => {
    const doc = minimal();
    doc.sections[0].items[0].label = '';
    doc.sections[0].items[0].href = 'javascript:alert(1)';
    const { issues } = validate(doc);
    expect(issues.length).toBeGreaterThan(1);
    for (const issue of issues) {
      expect(issue.message, issue.code).toBeTruthy();
      expect(issue.en, issue.code).toBeTruthy();
      expect(issue.message).not.toBe(issue.en);
      expect(issue.code).toMatch(/^[a-z-]+$/);
    }
  });

  test('the Icelandic rendering keeps the path prefix', () => {
    const doc = minimal();
    doc.sections[0].items[0].label = '';
    const lines = issuesInIcelandic(validate(doc).issues);
    expect(lines.some((l) => l.startsWith('sections[0].items[0].label:'))).toBe(true);
    expect(lines.some((l) => l.includes('nauðsynleg'))).toBe(true);
  });

  test('the shipped document produces no issues at all', () => {
    expect(validate(data).issues).toEqual([]);
  });
});
