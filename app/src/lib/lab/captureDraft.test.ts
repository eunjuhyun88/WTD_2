import { describe, expect, it } from 'vitest';
import { buildLabDraftFromCapture } from './captureDraft';

describe('buildLabDraftFromCapture', () => {
  it('maps bullish accumulation capture into a long draft with accumulation conditions', () => {
    const draft = buildLabDraftFromCapture({
      id: 'cap-1',
      symbol: 'BTCUSDT',
      timeframe: '4h',
      contextKind: 'symbol',
      triggerOrigin: 'manual',
      reason: 'ACCUMULATION',
      note: 'higher lows after real dump',
      snapshot: {},
      decision: { verdict: 'bullish' },
      sourceFreshness: {},
      createdAt: '2026-04-17T00:00:00+00:00',
      updatedAt: '2026-04-17T00:00:00+00:00',
    });

    expect(draft.direction).toBe('long');
    expect(draft.interval).toBe('4h');
    expect(draft.conditions[0]?.factorId).toBe('HIGHER_HIGH');
  });

  it('falls back to generic draft conditions for unknown reasons', () => {
    const draft = buildLabDraftFromCapture({
      id: 'cap-2',
      symbol: 'ETHUSDT',
      timeframe: '15m',
      contextKind: 'symbol',
      triggerOrigin: 'pattern_transition',
      reason: undefined,
      note: undefined,
      snapshot: {},
      decision: { verdict: 'neutral' },
      sourceFreshness: {},
      createdAt: '2026-04-17T00:00:00+00:00',
      updatedAt: '2026-04-17T00:00:00+00:00',
    });

    expect(draft.direction).toBe('both');
    expect(draft.interval).toBe('4h');
    expect(draft.conditions).toHaveLength(2);
  });
});
