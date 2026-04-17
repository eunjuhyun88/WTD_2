import { describe, expect, it } from 'vitest';
import { deriveWatchlistPreview } from './watchlistPreview';

describe('deriveWatchlistPreview', () => {
  it('derives bullish preview from explicit analyze fields', () => {
    const preview = deriveWatchlistPreview({
      price: 101_250,
      change24h: 3.2,
      deep: { verdict: 'BULL_CONTINUATION' },
      riskPlan: { bias: 'bullish continuation', invalidation: 'below 99k' },
      entryPlan: { confidencePct: 72 },
      ensemble: { reason: 'trend aligned' },
    } as any);

    expect(preview).toEqual({
      price: 101_250,
      change24h: 3.2,
      bias: 'bullish',
      confidence: 'high',
      action: 'trend aligned',
      invalidation: 'below 99k',
    });
  });

  it('falls back to neutral/low when analyze confidence is weak', () => {
    const preview = deriveWatchlistPreview({
      price: 92_000,
      change24h: -0.8,
      deep: { verdict: 'WAIT' },
      riskPlan: { bias: 'neutral' },
      entryPlan: { confidencePct: 40 },
      ensemble: null,
    } as any);

    expect(preview?.bias).toBe('neutral');
    expect(preview?.confidence).toBe('low');
    expect(preview?.action).toBe('neutral');
  });
});
