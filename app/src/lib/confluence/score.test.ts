import { describe, expect, it } from 'vitest';
import { computeConfluence, type ConfluenceInput } from './score';

/** Minimal input with everything null — used as a base. */
function base(overrides: Partial<ConfluenceInput> = {}): ConfluenceInput {
  return {
    symbol: 'BTCUSDT',
    at: 1_700_000_000_000,
    pattern: null,
    venueDivergence: null,
    rvCone: null,
    ssr: null,
    fundingFlip: null,
    liqMagnet: null,
    ...overrides,
  };
}

describe('computeConfluence', () => {
  it('returns neutral when no pillars have data', () => {
    const r = computeConfluence(base());
    expect(r.score).toBe(0);
    expect(r.confidence).toBe(0);
    expect(r.regime).toBe('neutral');
    expect(r.contributions).toHaveLength(0);
    expect(r.divergence).toBe(false);
  });

  it('scales pattern score from 50 → 0 and 100 → bullish', () => {
    const neutral = computeConfluence(base({ pattern: { score: 50 } }));
    expect(neutral.score).toBe(0);

    const bullish = computeConfluence(base({ pattern: { score: 95, direction: 'long' } }));
    expect(bullish.score).toBeGreaterThan(0);
    expect(bullish.contributions[0].source).toBe('pattern');
    expect(bullish.regime).not.toBe('neutral');
  });

  it('produces strong_bull when score high and confidence high', () => {
    const r = computeConfluence(base({
      pattern: { score: 92, direction: 'long' },
      venueDivergence: {
        oi: [
          { venue: 'binance', current: 0.001 },
          { venue: 'bybit', current: -0.04 }, // isolated dump → short cascade risk = bullish
          { venue: 'okx', current: 0.002 },
        ],
        funding: [],
      },
      rvCone: { percentile30d: 10 }, // compression setup
      ssr: { percentile: 20, regime: 'dry_powder_high' },
      fundingFlip: {
        direction: 'neg_to_pos',
        persistedHours: 6,
        consecutiveIntervals: 1,
        currentRate: 0.00001,
      },
      liqMagnet: { aboveDistancePct: 0.4, belowDistancePct: 5, intensity: 1 },
    }));
    expect(r.score).toBeGreaterThan(40);
    expect(r.confidence).toBeGreaterThan(0.6);
    expect(r.regime).toBe('strong_bull');
    expect(r.top).toHaveLength(3);
    expect(r.divergence).toBe(false);
  });

  it('detects divergence when material contributions disagree', () => {
    const r = computeConfluence(base({
      pattern: { score: 90, direction: 'long' },      // +bullish
      fundingFlip: {
        direction: 'pos_to_neg',
        persistedHours: 1,                             // fresh flip → bearish unwind
        consecutiveIntervals: 1,
        currentRate: -0.0001,
      },
    }));
    expect(r.divergence).toBe(true);
  });

  it('re-normalizes weights when pillars are missing', () => {
    const r = computeConfluence(base({
      pattern: { score: 80 },
    }));
    // Only pattern present; its effective weight should be 1 after re-normalization.
    expect(r.contributions[0].weight).toBeCloseTo(1, 5);
    // Raw pattern score: (80-50)/50 = 0.6 → weighted 0.6 × 1 = 0.6 → score = 60.
    expect(r.score).toBeCloseTo(60, 0);
  });

  it('treats liq_magnet above as bullish pull and below as bearish', () => {
    const bullPull = computeConfluence(base({
      liqMagnet: { aboveDistancePct: 0.3, belowDistancePct: 10, intensity: 1 },
    }));
    expect(bullPull.score).toBeGreaterThan(0);

    const bearPull = computeConfluence(base({
      liqMagnet: { aboveDistancePct: 10, belowDistancePct: 0.3, intensity: 1 },
    }));
    expect(bearPull.score).toBeLessThan(0);
  });

  it('SSR low percentile = bullish (dry powder)', () => {
    const r = computeConfluence(base({ ssr: { percentile: 10, regime: 'dry_powder_high' } }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.contributions[0].reason).toContain('Dry powder abundant');
  });

  it('SSR high percentile = bearish (depleted)', () => {
    const r = computeConfluence(base({ ssr: { percentile: 90, regime: 'dry_powder_low' } }));
    expect(r.score).toBeLessThan(0);
  });

  it('RV compression (p10) = bullish lean', () => {
    const r = computeConfluence(base({ rvCone: { percentile30d: 8 } }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.contributions[0].reason).toContain('compression');
  });

  it('extended persisted funding → mean reversion bearish', () => {
    const r = computeConfluence(base({
      fundingFlip: {
        direction: 'persisted',
        persistedHours: 120,
        consecutiveIntervals: 15,
        currentRate: 0.0003,
      },
    }));
    expect(r.score).toBeLessThan(0);
  });

  it('sorts contributions by magnitude, top has at most 3', () => {
    const r = computeConfluence(base({
      pattern: { score: 92 },
      ssr: { percentile: 5, regime: 'dry_powder_high' },
      rvCone: { percentile30d: 8 },
      fundingFlip: {
        direction: 'neg_to_pos',
        persistedHours: 2,
        consecutiveIntervals: 1,
        currentRate: 0.00001,
      },
    }));
    expect(r.contributions.length).toBeGreaterThanOrEqual(3);
    expect(r.top).toHaveLength(3);
    for (let i = 1; i < r.top.length; i++) {
      expect(r.top[i].magnitude).toBeLessThanOrEqual(r.top[i - 1].magnitude);
    }
  });
});
