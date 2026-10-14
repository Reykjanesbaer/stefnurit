import { describe, expect, test } from 'vitest';
import { parseHex, contrastRatio, assess, darkenToPass, toHex, AA_NORMAL } from '../src/contrast.js';

describe('parseHex', () => {
  test.each([
    ['#FFFFFF', [255, 255, 255]],
    ['ffffff', [255, 255, 255]],
    ['#000', [0, 0, 0]],
    ['#1F559F', [31, 85, 159]],
    ['#009EBF', [0, 158, 191]],
  ])('%s -> %o', (input, expected) => expect(parseHex(input)).toEqual(expected));

  test.each(['', 'red', '#12345', 'rgb(0,0,0)', null, undefined])('%p is not a hex colour', (input) => {
    expect(parseHex(input)).toBeNull();
  });
});

describe('contrastRatio', () => {
  // The two anchors every implementation must agree on.
  test('black on white is 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });
  test('a colour against itself is 1:1', () => {
    expect(contrastRatio('#1F559F', '#1F559F')).toBeCloseTo(1, 5);
  });
  test('order does not matter', () => {
    expect(contrastRatio('#009EBF', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#009EBF'), 10);
  });
  test('an invalid colour gives null, not NaN', () => {
    expect(contrastRatio('nope', '#FFF')).toBeNull();
  });
});

describe('the colours this project actually ships', () => {
  // These numbers are the reason the admin panel shows a contrast warning.
  test('white on the navy primary passes AA', () => {
    const result = assess('#FFFFFF', '#1F559F');
    expect(result.rounded).toBeCloseTo(7.35, 2);
    expect(result.passesAA).toBe(true);
  });

  test('white on the pill blue passes AA', () => {
    const result = assess('#FFFFFF', '#2562AE');
    expect(result.rounded).toBeCloseTo(6.11, 2);
    expect(result.passesAA).toBe(true);
  });

  test('white on the teal accent fails AA for body text', () => {
    const result = assess('#FFFFFF', '#009EBF');
    expect(result.rounded).toBeCloseTo(3.16, 2);
    expect(result.passesAA).toBe(false);
  });

  test('the teal passes the lower bar for large text', () => {
    expect(assess('#FFFFFF', '#009EBF', { large: true }).passesAA).toBe(true);
  });
});

describe('darkenToPass', () => {
  test('suggests a darker teal that clears AA', () => {
    const suggestion = darkenToPass('#009EBF');
    expect(suggestion.unchanged).toBe(false);
    expect(suggestion.ratio).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(suggestion.hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  test('the suggestion is darker than the original, not some other colour', () => {
    const original = parseHex('#009EBF');
    const suggested = parseHex(darkenToPass('#009EBF').hex);
    for (const channel of [0, 1, 2]) {
      expect(suggested[channel]).toBeLessThanOrEqual(original[channel]);
    }
  });

  test('a colour that already passes is returned unchanged', () => {
    const suggestion = darkenToPass('#1F559F');
    expect(suggestion.unchanged).toBe(true);
    expect(suggestion.hex).toBe('#1F559F');
  });

  test('an invalid colour gives null', () => {
    expect(darkenToPass('not-a-colour')).toBeNull();
  });
});

describe('toHex', () => {
  test('round-trips and clamps out-of-range channels', () => {
    expect(toHex([31, 85, 159])).toBe('#1F559F');
    expect(toHex([-5, 300, 0])).toBe('#00FF00');
  });
});
