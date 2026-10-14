import { describe, expect, test } from 'vitest';
import { TOKENS, THEMEABLE, STACK_BELOW, TIGHTEN_BELOW, TIGHTENED } from '../src/tokens.js';

/** The low end of `clamp(min, preferred, max)`, or the value itself if fixed. */
function floorOf(value) {
  const m = /^clamp\(\s*([^,]+?)\s*,/.exec(value);
  return (m ? m[1] : value).trim();
}

describe('the tightened band', () => {
  test('sits between the stack threshold and the signed-off layout', () => {
    expect(STACK_BELOW).toBeLessThan(TIGHTEN_BELOW);
  });

  test('overrides only tokens that exist', () => {
    for (const name of Object.keys(TIGHTENED)) {
      expect(THEMEABLE, `${name} is not a token`).toContain(name);
    }
  });

  /**
   * The band's whole claim is that it invents no new spacing: a laptop gets the
   * values a phone already gets. A number that is merely smaller than the clamp
   * it replaces would break that claim silently, so it is asserted here.
   */
  test.each(Object.entries(TIGHTENED))('%s is the floor of its own clamp', (name, value) => {
    expect(value).toBe(floorOf(TOKENS[name]));
  });
});
