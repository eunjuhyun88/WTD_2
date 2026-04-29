import { describe, expect, it } from 'vitest';
import { adaptEngineStats } from './patternStats';

describe('patternStats adapter', () => {
  it('maps engine stats to app display fields without flattening btc conditionals', () => {
    const stats = adaptEngineStats(
      {
        pattern_slug: 'fake_dump_breakout',
        total: 12,
        success: 7,
        failure: 3,
        pending: 2,
        success_rate: 0.7,
        btc_conditional: {
          bullish: 0.8,
          bearish: null,
          sideways: 0.5,
        },
        ml_shadow: {
          total_entries: 10,
          decided_entries: 6,
          state_counts: { shadow: 4, accepted: 2 },
          score_coverage: 0.9,
          training_usable_count: 6,
          ready_to_train: false,
          readiness_reason: 'need more data',
        },
      },
      'fallback_slug',
    );

    expect(stats.pattern_slug).toBe('fake_dump_breakout');
    expect(stats.hit_rate).toBe(0.7);
    expect(stats.btc_conditional).toEqual({
      bullish: 0.8,
      bearish: null,
      sideways: 0.5,
    });
    expect(stats.ml_shadow?.state_counts).toEqual({ shadow: 4, accepted: 2 });
    expect(stats.ml_shadow?.ready_to_train).toBe(false);
  });
});
