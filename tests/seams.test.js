import { describe, it, expect } from 'vitest';
import { seamOffsets, withSeams } from '../src/seams.js';
import {
  STACK_BELOW, COMPACT_BELOW, TIGHTEN_BELOW, TIGHTENED, COMPACT, TOKENS,
} from '../src/tokens.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const SEAM = '<span class="seam"></span>';
const marked = (word) => withSeams(word, esc).replaceAll(SEAM, '|');

describe('seams', () => {
  it('break the long policy names at their compound joins', () => {
    expect(marked('Upplýsingaöryggisstefna')).toBe('Upplýsinga|öryggis|stefna');
    expect(marked('Upplýsingatæknistefna')).toBe('Upplýsinga|tækni|stefna');
    expect(marked('Persónuverndarstefna')).toBe('Persónu|verndar|stefna');
    expect(marked('Mannréttindastefna')).toBe('Mann|réttinda|stefna');
    expect(marked('Vafrakökustefna')).toBe('Vafra|köku|stefna');
    expect(marked('Ferðamálastefna')).toBe('Ferða|mála|stefna');
    expect(marked('Mannauðsstefna')).toBe('Mannauðs|stefna');
  });

  it('leave short words and unrecognised words alone', () => {
    for (const word of ['Vefstefna', 'EKKO', 'Innkaup', 'Stjórnsýsla']) {
      expect(seamOffsets(word)).toEqual([]);
      expect(marked(word)).toBe(word);
    }
  });

  it('work word by word inside a longer label', () => {
    expect(marked('Stefna Reykjanesbæjar í skjalamálum')).toBe('Stefna Reykjanes|bæjar í skjalamálum');
    expect(marked('Umhverfis- og loftlagsstefna')).toBe('Umhverfis- og loftlags|stefna');
  });

  it('never strand a sliver of letters', () => {
    for (const word of ['Upplýsingaöryggisstefna', 'Jafnlaunastefna', 'Reykjanesbæjar']) {
      const offsets = seamOffsets(word);
      const edges = [0, ...offsets, word.length];
      for (let i = 1; i < edges.length; i += 1) expect(edges[i] - edges[i - 1]).toBeGreaterThanOrEqual(3);
    }
  });

  it('change nothing a reader or a test sees: only empty spans are added', () => {
    for (const label of ['Upplýsingaöryggisstefna', 'Stefna Reykjanesbæjar í skjalamálum', 'Vefstefna']) {
      expect(withSeams(label, esc).replaceAll(SEAM, '')).toBe(esc(label));
    }
  });

  it('escape every piece, so a label can never inject markup', () => {
    const out = withSeams('<img src=x onerror=alert(1)>Upplýsingaöryggisstefna', esc);
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('are idempotent about what they were given', () => {
    expect(withSeams('', esc)).toBe('');
    expect(seamOffsets(undefined)).toEqual([]);
    expect(seamOffsets(42)).toEqual([]);
  });
});

describe('layout thresholds', () => {
  it('are ordered, and the stack starts where the tree stops fitting', () => {
    expect(STACK_BELOW).toBe(700);
    expect(STACK_BELOW).toBeLessThan(COMPACT_BELOW);
    expect(COMPACT_BELOW).toBeLessThan(TIGHTEN_BELOW);
    expect(TIGHTEN_BELOW).toBe(1400);
  });

  it('keep only 0.15px of page padding in the compact band', () => {
    expect(COMPACT['page-padding-inline']).toBe('0.15px');
  });

  it('only override tokens that exist', () => {
    for (const name of [...Object.keys(TIGHTENED), ...Object.keys(COMPACT)]) {
      expect(TOKENS).toHaveProperty(name);
    }
  });
});
