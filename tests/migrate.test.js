import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { migrate, versionOf, needsMigration, CURRENT_SCHEMA_VERSION } from '../src/migrate.js';
import { validate } from '../src/validate.js';

const shipped = JSON.parse(readFileSync(new URL('../src/data/stefnurit.json', import.meta.url), 'utf8'));

describe('versionOf', () => {
  test('a document with no schemaVersion is version 1', () => {
    expect(versionOf({ title: 'T', sections: [] })).toBe(1);
  });

  test('a declared version is read back', () => {
    expect(versionOf({ schemaVersion: 1 })).toBe(1);
  });

  test.each([0, -1, 1.5, '1', null, true])('%p is not a valid version', (value) => {
    expect(versionOf({ schemaVersion: value })).toBeNull();
  });

  test('a non-object has no version', () => {
    expect(versionOf(null)).toBeNull();
    expect(versionOf([])).toBeNull();
  });
});

describe('migrate', () => {
  test('an unversioned document comes back stamped with the current version', () => {
    const { schemaVersion, ...unversioned } = structuredClone(shipped);
    expect(unversioned.schemaVersion).toBeUndefined();

    const result = migrate(unversioned);
    expect(result.ok).toBe(true);
    expect(result.from).toBe(1);
    expect(result.to).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  test('migrating an unversioned document preserves every link', () => {
    const { schemaVersion, ...unversioned } = structuredClone(shipped);
    const { doc } = migrate(unversioned);
    expect(JSON.stringify(doc.sections)).toBe(JSON.stringify(shipped.sections));
    expect(validate(doc).ok).toBe(true);
  });

  test('the input is never mutated', () => {
    const { schemaVersion, ...unversioned } = structuredClone(shipped);
    const before = JSON.stringify(unversioned);
    migrate(unversioned);
    expect(JSON.stringify(unversioned)).toBe(before);
  });

  test('an already-current document passes through unchanged', () => {
    const result = migrate(shipped);
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual([]);
    expect(JSON.stringify(result.doc)).toBe(JSON.stringify(shipped));
  });

  test('a document from a newer build is refused rather than guessed at', () => {
    const result = migrate({ ...shipped, schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(String(CURRENT_SCHEMA_VERSION + 1));
  });

  test('garbage in gives a reason, not a crash', () => {
    for (const input of [null, 42, 'text', [], undefined]) {
      expect(() => migrate(input)).not.toThrow();
      expect(migrate(input).ok).toBe(false);
    }
  });

  test('needsMigration is false for the shipped document', () => {
    expect(needsMigration(shipped)).toBe(false);
  });
});
