import { describe, it, expect } from 'vitest';

/**
 * UnverifiedDot visibility logic.
 * AC1: dot visible when count >= 10, hidden otherwise.
 */

const isDotVisible = (count: number): boolean => count >= 10;

describe('UnverifiedDot — pending verdict badge visibility', () => {
  it('count=10: dot is visible', () => {
    expect(isDotVisible(10)).toBe(true);
  });

  it('count=9: dot is hidden', () => {
    expect(isDotVisible(9)).toBe(false);
  });

  it('count=0: dot is hidden', () => {
    expect(isDotVisible(0)).toBe(false);
  });

  it('count=15: dot is visible', () => {
    expect(isDotVisible(15)).toBe(true);
  });
});
