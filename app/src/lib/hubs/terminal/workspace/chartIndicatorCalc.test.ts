import { describe, expect, it } from 'vitest';
import { calcRSI, calcMACD, calcBB, injectClientIndicators } from './chartIndicatorCalc';

// ── Synthetic data helpers ────────────────────────────────────────────────────

function makeBars(closes: number[]): Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> {
  return closes.map((c, i) => ({
    time: 1700000000 + i * 60,
    open: c,
    high: c * 1.002,
    low: c * 0.998,
    close: c,
    volume: 1000,
  }));
}

// 50 alternating up/down closes starting at 100 — enough for all three indicators
const CLOSES_FLAT = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
const BARS_FLAT = makeBars(CLOSES_FLAT);

// Monotonically rising series (RSI should approach 100)
const CLOSES_UP = Array.from({ length: 60 }, (_, i) => 100 + i);
const BARS_UP = makeBars(CLOSES_UP);

// Monotonically falling series (RSI should approach 0)
const CLOSES_DOWN = Array.from({ length: 60 }, (_, i) => 160 - i);
const BARS_DOWN = makeBars(CLOSES_DOWN);

// ── RSI ───────────────────────────────────────────────────────────────────────

describe('calcRSI', () => {
  it('returns empty array when not enough bars', () => {
    expect(calcRSI(makeBars([100, 101, 102]))).toHaveLength(0);
  });

  it('output length equals (bars.length - period)', () => {
    const result = calcRSI(BARS_FLAT, 14);
    expect(result).toHaveLength(BARS_FLAT.length - 14);
  });

  it('all RSI values are in [0, 100]', () => {
    for (const r of calcRSI(BARS_FLAT)) {
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThanOrEqual(100);
    }
  });

  it('RSI approaches 100 for monotonically rising prices', () => {
    const result = calcRSI(BARS_UP);
    const last = result[result.length - 1].value;
    expect(last).toBeGreaterThan(95);
  });

  it('RSI approaches 0 for monotonically falling prices', () => {
    const result = calcRSI(BARS_DOWN);
    const last = result[result.length - 1].value;
    expect(last).toBeLessThan(5);
  });

  it('time values are preserved from input bars', () => {
    const result = calcRSI(BARS_FLAT, 14);
    // First result corresponds to bar at index 14
    expect(result[0].time).toBe(BARS_FLAT[14].time);
  });
});

// ── MACD ──────────────────────────────────────────────────────────────────────

describe('calcMACD', () => {
  it('returns empty array when not enough bars', () => {
    expect(calcMACD(makeBars(Array.from({ length: 20 }, (_, i) => 100 + i)))).toHaveLength(0);
  });

  it('returns non-empty result for 60 bars', () => {
    const result = calcMACD(BARS_FLAT);
    expect(result.length).toBeGreaterThan(0);
  });

  it('each point has macd, signal, and hist fields', () => {
    const result = calcMACD(BARS_FLAT);
    for (const p of result) {
      expect(typeof p.macd).toBe('number');
      expect(typeof p.signal).toBe('number');
      expect(typeof p.hist).toBe('number');
      expect(Number.isFinite(p.macd)).toBe(true);
      expect(Number.isFinite(p.signal)).toBe(true);
    }
  });

  it('hist equals macd - signal', () => {
    const result = calcMACD(BARS_FLAT);
    for (const p of result) {
      expect(p.hist).toBeCloseTo(p.macd - p.signal, 8);
    }
  });

  it('time values are strictly ascending', () => {
    const result = calcMACD(BARS_FLAT);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].time).toBeGreaterThan(result[i - 1].time);
    }
  });
});

// ── Bollinger Bands ───────────────────────────────────────────────────────────

describe('calcBB', () => {
  it('returns empty arrays when not enough bars', () => {
    const bb = calcBB(makeBars([100, 101, 102]));
    expect(bb.upper).toHaveLength(0);
    expect(bb.middle).toHaveLength(0);
    expect(bb.lower).toHaveLength(0);
  });

  it('output arrays have the same length (bars - period + 1)', () => {
    const bb = calcBB(BARS_FLAT, 20);
    const expected = BARS_FLAT.length - 20 + 1;
    expect(bb.upper).toHaveLength(expected);
    expect(bb.middle).toHaveLength(expected);
    expect(bb.lower).toHaveLength(expected);
  });

  it('upper > middle > lower for every point', () => {
    const bb = calcBB(BARS_FLAT, 20);
    for (let i = 0; i < bb.upper.length; i++) {
      expect(bb.upper[i].value).toBeGreaterThan(bb.middle[i].value);
      expect(bb.middle[i].value).toBeGreaterThan(bb.lower[i].value);
    }
  });

  it('middle is the SMA (mean of window)', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i);
    const bars = makeBars(closes);
    const bb = calcBB(bars, 20);
    // Last middle = mean of last 20 closes
    const last20 = closes.slice(-20);
    const expected = last20.reduce((a, b) => a + b, 0) / 20;
    expect(bb.middle[bb.middle.length - 1].value).toBeCloseTo(expected, 6);
  });
});

// ── injectClientIndicators ────────────────────────────────────────────────────

describe('injectClientIndicators', () => {
  it('injects rsi14, macd, bbUpper, bbLower, bbMiddle when indicators are empty', () => {
    const result = injectClientIndicators(BARS_FLAT, {});
    expect(Array.isArray(result['rsi14'])).toBe(true);
    expect((result['rsi14'] as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(result['macd'])).toBe(true);
    expect((result['macd'] as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(result['bbUpper'])).toBe(true);
    expect((result['bbUpper'] as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(result['bbLower'])).toBe(true);
    expect(Array.isArray(result['bbMiddle'])).toBe(true);
  });

  it('does not overwrite existing non-empty indicators', () => {
    const existing = { rsi14: [{ time: 1, value: 50 }] };
    const result = injectClientIndicators(BARS_FLAT, existing);
    expect(result['rsi14']).toStrictEqual([{ time: 1, value: 50 }]);
  });

  it('overwrites empty array indicators', () => {
    const existing = { rsi14: [] };
    const result = injectClientIndicators(BARS_FLAT, existing);
    expect((result['rsi14'] as unknown[]).length).toBeGreaterThan(0);
  });

  it('does not mutate the original indicators object', () => {
    const original = { rsi14: [] };
    injectClientIndicators(BARS_FLAT, original);
    expect(original.rsi14).toHaveLength(0);
  });
});
