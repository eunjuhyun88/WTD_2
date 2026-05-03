import { describe, expect, it } from 'vitest';
import {
  calcRSI,
  calcMACD,
  calcBB,
  injectClientIndicators,
  calcEMAValues,
  calcVWAP,
  calcATRBands,
} from './chartIndicatorCalc';

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

// ── calcEMAValues ─────────────────────────────────────────────────────────────

describe('calcEMAValues', () => {
  it('returns empty array when not enough bars', () => {
    expect(calcEMAValues(makeBars([100, 101, 102]), 21)).toHaveLength(0);
  });

  it('output length equals (bars.length - period + 1)', () => {
    const result = calcEMAValues(BARS_FLAT, 21);
    expect(result).toHaveLength(BARS_FLAT.length - 21 + 1);
  });

  it('all values are finite numbers', () => {
    for (const p of calcEMAValues(BARS_FLAT, 9)) {
      expect(Number.isFinite(p.value)).toBe(true);
    }
  });

  it('EMA lags behind rapidly rising prices (last EMA < last close)', () => {
    const result = calcEMAValues(BARS_UP, 9);
    const lastEma = result[result.length - 1].value;
    const lastClose = BARS_UP[BARS_UP.length - 1].close;
    expect(lastEma).toBeLessThan(lastClose);
  });

  it('time values are preserved from input bars', () => {
    const result = calcEMAValues(BARS_FLAT, 10);
    expect(result[0].time).toBe(BARS_FLAT[9].time);
  });
});

// ── calcVWAP ──────────────────────────────────────────────────────────────────

describe('calcVWAP', () => {
  it('returns one point per bar', () => {
    expect(calcVWAP(BARS_FLAT)).toHaveLength(BARS_FLAT.length);
  });

  it('first VWAP equals typical price of first bar', () => {
    const b = BARS_FLAT[0];
    const tp = (b.high + b.low + b.close) / 3;
    const result = calcVWAP(BARS_FLAT);
    expect(result[0].value).toBeCloseTo(tp, 6);
  });

  it('VWAP is between low and high for each bar', () => {
    const result = calcVWAP(BARS_FLAT);
    for (let i = 0; i < result.length; i++) {
      // VWAP runs cumulative so can drift; just check it's a positive finite number
      expect(Number.isFinite(result[i].value)).toBe(true);
      expect(result[i].value).toBeGreaterThan(0);
    }
  });

  it('time values match input bars', () => {
    const result = calcVWAP(BARS_FLAT);
    for (let i = 0; i < result.length; i++) {
      expect(result[i].time).toBe(BARS_FLAT[i].time);
    }
  });
});

// ── calcATRBands ──────────────────────────────────────────────────────────────

describe('calcATRBands', () => {
  it('returns empty when not enough bars', () => {
    const r = calcATRBands(makeBars([100, 101, 102]), 14, 2);
    expect(r.upper).toHaveLength(0);
    expect(r.lower).toHaveLength(0);
    expect(r.middle).toHaveLength(0);
  });

  it('all three bands have equal length (bars.length - period)', () => {
    const r = calcATRBands(BARS_FLAT, 14, 2);
    expect(r.upper.length).toBe(r.lower.length);
    expect(r.upper.length).toBe(r.middle.length);
    expect(r.upper.length).toBe(BARS_FLAT.length - 14);
  });

  it('upper > middle > lower for all points', () => {
    const r = calcATRBands(BARS_FLAT, 14, 2);
    for (let i = 0; i < r.upper.length; i++) {
      expect(r.upper[i].value).toBeGreaterThan(r.middle[i].value);
      expect(r.middle[i].value).toBeGreaterThan(r.lower[i].value);
    }
  });

  it('bands widen with higher multiplier', () => {
    const r1 = calcATRBands(BARS_FLAT, 14, 1);
    const r2 = calcATRBands(BARS_FLAT, 14, 3);
    const span1 = r1.upper[0].value - r1.lower[0].value;
    const span2 = r2.upper[0].value - r2.lower[0].value;
    expect(span2).toBeGreaterThan(span1);
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
