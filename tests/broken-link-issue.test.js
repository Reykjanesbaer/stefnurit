import { describe, expect, test } from 'vitest';
import { issueBody, closingComment } from '../scripts/sync-broken-link-issue.mjs';
import { OUTCOME } from '../scripts/check-links.mjs';

/**
 * These render the issue the weekly monitor keeps. They exist because the body
 * builder once reached a helper declared further down the file as a `const`,
 * which threw ReferenceError on every run that had something to report — and
 * the workflow step is `continue-on-error`, so the run still went green and
 * nobody was told the links were broken.
 */
const link = (over = {}) => ({
  id: 'n1',
  label: 'Fræðslustefna',
  href: 'https://example.is/fraedslustefna.pdf',
  outcome: OUTCOME.BROKEN,
  status: 404,
  consecutiveFailures: 1,
  lastModifiedChanged: false,
  ...over,
});

const report = (links) => ({
  generatedAt: '2026-10-12T06:00:00.000Z',
  summary: { total: links.length, ok: 0, redirect: 0, broken: 0, unknown: 0, empty: 0, changedDocuments: 0 },
  links,
});

describe('issueBody', () => {
  test('renders a broken link without throwing', () => {
    const links = [link()];
    const body = issueBody(report(links), links);

    expect(body).toContain('Fræðslustefna');
    expect(body).toContain('404');
    expect(body).toContain('bilaður');
  });

  test('escapes a pipe in a label so the table survives', () => {
    const links = [link({ label: 'Stefna | uppfærð' })];

    expect(issueBody(report(links), links)).toContain('Stefna \\| uppfærð');
  });

  test('reports an unverifiable link as uncertain rather than broken', () => {
    const links = [link({ outcome: OUTCOME.UNKNOWN, status: null, errorCode: 'ETIMEDOUT', consecutiveFailures: 3 })];
    const body = issueBody(report(links), links);

    expect(body).toContain('óviss');
    expect(body).toContain('ETIMEDOUT');
  });

  test('names the documents whose content changed behind an unchanged URL', () => {
    const problem = link();
    const changed = link({
      id: 'n2',
      label: 'Vefstefna',
      outcome: OUTCOME.OK,
      status: 200,
      consecutiveFailures: 0,
      lastModifiedChanged: true,
      previousLastModified: '2025-01-01',
      lastModified: '2026-02-02',
    });

    const body = issueBody(report([problem, changed]), [problem]);

    expect(body).toContain('Vefstefna');
    expect(body).toContain('2025-01-01 → 2026-02-02');
  });
});

describe('closingComment', () => {
  test('says everything recovered, with the counts', () => {
    const comment = closingComment({
      generatedAt: '2026-10-12T06:00:00.000Z',
      summary: { total: 24, ok: 22, redirect: 1, broken: 0, unknown: 0, empty: 1, changedDocuments: 0 },
      links: [],
    });

    expect(comment).toContain('Allir hlekkir svara eðlilega aftur');
    expect(comment).toContain('22');
  });
});
