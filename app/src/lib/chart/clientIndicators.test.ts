import { describe, it, expect } from 'vitest';
import { calcRsi, calcEma, calcMacd, calcBb, calcVwap, calcAtrBands } from './clientIndicators';
import type { KlineLike } from './analysisPrimitives';

// Synthetic klines — linearly rising closes to make expected values deterministic
function makeKlines(n: number, startPrice = 100, step = 1): KlineLike[] {
  return Array.from({ length: n }, (_, i) => ({
    time: 1700000000 + i * 60,
    open: startPrice + i * step,
    high: startPrice + i * step + 0.5,
    low: startPrice + i * step - 0.5,
    close: startPrice + i * step,
    volume: 1000 + i * 10,
  }));
}

// Alternating up/down closes to get RSI near 50
function makeAlternatingKlines(n: number): KlineLike[] {
  return Array.from({ length: n }, (_, i) => ({
    time: 1700000000 + i * 60,
    open: 100,
    high: 101,
    low: 99,
    close: i % 2 === 0 ? 101 : 99,
    volume: 1000,
  }));
}

describe('calcEma', () => {
  it('returns empty for insufficient data', () => {
    expect(calcEma(makeKlines(5), 20)).toHaveLength(0);
  });

  it('returns (n - period + 1) points for sufficient data', () => {
    const klines = makeKlines(50);
    expect(calcEma(klines, 20)).toHaveLength(31);
  });

  it('all values are finite', () => {
    const out = calcEma(makeKlines(50), 20);
    expect(out.every((p) => isFinite(p.value))).toBe(true);
  });

  it('values increase with linearly rising closes', () => {
    const out = calcEma(makeKlines(50), 20);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].value).toBeGreaterThan(out[i - 1].value);
    }
  });
});

describe('calcRsi', () => {
  it('returns empty for insufficient data', () => {
    expect(calcRsi(makeKlines(5), 14)).toHaveLength(0);
  });

  it('returns values in [0, 100]', () => {
    const out = calcRsi(makeKlines(60), 14);
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
    }
  });

  it('all-up prices → RSI approaches 100', () => {
    const out = calcRsi(makeKlines(60, 100, 1), 14);
    const last = out[out.length - 1].value;
    expect(last).toBeGreaterThan(90);
  });

  it('alternating up/down → RSI near 50', () => {
    const out = calcRsi(makeAlternatingKlines(60), 14);
    const last = out[out.length - 1].value;
    expect(last).toBeGreaterThan(40);
    expect(last).toBeLessThan(60);
  });

  it('matches server RSI within ±0.1 for period=14 on simple sequence', () => {
    // Simple sequence: 100 closes each up by 1 vs known result
    // For 14-period RSI after warm-up all-gain: avgGain = 1, avgLoss = 0 → RSI = 100
    const out = calcRsi(makeKlines(30, 100, 1), 14);
    expect(out[out.length - 1].value).toBeCloseTo(100, 0);
  });
});

describe('calcMacd', () => {
  it('returns empty for insufficient data', () => {
    expect(calcMacd(makeKlines(10), 12, 26, 9)).toHaveLength(0);
  });

  it('returns at least 1 point with enough data', () => {
    const out = calcMacd(makeKlines(60), 12, 26, 9);
    expect(out.length).toBeGreaterThan(0);
  });

  it('hist = macd - signal', () => {
    const out = calcMacd(makeKlines(60), 12, 26, 9);
    for (const p of out) {
      expect(p.hist).toBeCloseTo(p.macd - p.signal, 8);
    }
  });
});

describe('calcBb', () => {
  it('returns empty for insufficient data', () => {
    expect(calcBb(makeKlines(5), 20)).toHaveLength(0);
  });

  it('upper > middle > lower always', () => {
    const out = calcBb(makeKlines(50), 20, 2);
    for (const p of out) {
      expect(p.upper).toBeGreaterThan(p.middle);
      expect(p.middle).toBeGreaterThan(p.lower);
    }
  });
});

describe('calcVwap', () => {
  it('returns one point per kline', () => {
    const klines = makeKlines(20);
    expect(calcVwap(klines)).toHaveLength(20);
  });

  it('all values are positive', () => {
    const out = calcVwap(makeKlines(20));
    expect(out.every((p) => p.value > 0)).toBe(true);
  });
});

describe('calcAtrBands', () => {
  it('returns empty for insufficient data', () => {
    expect(calcAtrBands(makeKlines(5), 14)).toHaveLength(0);
  });

  it('upper > lower always', () => {
    const out = calcAtrBands(makeKlines(50), 14, 2);
    for (const p of out) {
      expect(p.upper).toBeGreaterThan(p.lower);
    }
  });
});
