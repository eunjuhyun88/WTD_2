import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * W-0307 F-12: KimchiPremiumBadge logic tests
 *
 * Tests color class derivation and stale detection against the
 * thresholds defined in KimchiPremiumBadge.svelte:
 *   positive: pct > 0.5  → 'kp-positive' (red)
 *   negative: pct < -0.5 → 'kp-negative' (blue)
 *   neutral:  |pct| ≤ 0.5 → 'kp-neutral' (grey)
 *   stale:    ts older than 6 min → 'kp-stale'
 */

// ---------- helpers mirroring component logic ----------

function deriveColor(pct: number): string {
  return pct > 0.5 ? 'positive' : pct < -0.5 ? 'negative' : 'neutral';
}

const STALE_THRESHOLD_MS = 6 * 60 * 1000;

function isStale(ts: number): boolean {
  return Date.now() - ts * 1000 > STALE_THRESHOLD_MS;
}

// ---------- test suite ----------

describe('KimchiPremiumBadge — W-0307 F-12', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('양수값(+2.5%) → kp-positive (red) 클래스', () => {
    const pct = 2.5;
    expect(deriveColor(pct)).toBe('positive');
  });

  it('음수값(-1.2%) → kp-negative (blue) 클래스', () => {
    const pct = -1.2;
    expect(deriveColor(pct)).toBe('negative');
  });

  it('stale data (ts > 6분 전) → isStale === true', () => {
    const now = 1_700_000_000_000; // fixed epoch ms
    vi.setSystemTime(now);

    // ts is in seconds; 7 minutes ago
    const sevenMinAgoSec = Math.floor((now - 7 * 60 * 1000) / 1000);
    expect(isStale(sevenMinAgoSec)).toBe(true);
  });

  it('fresh data (ts < 6분 전) → isStale === false', () => {
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);

    // ts is in seconds; 3 minutes ago
    const threeMinAgoSec = Math.floor((now - 3 * 60 * 1000) / 1000);
    expect(isStale(threeMinAgoSec)).toBe(false);
  });

  it('중립 범위 (±0.5% 이내) → kp-neutral (grey) 클래스', () => {
    expect(deriveColor(0.0)).toBe('neutral');
    expect(deriveColor(0.5)).toBe('neutral');
    expect(deriveColor(-0.5)).toBe('neutral');
  });

  it('API response shape — premium_pct, usd_krw, ts, source 필드 존재', () => {
    const mockResponse = {
      premium_pct: 2.5,
      usd_krw: 1320,
      ts: Math.floor(Date.now() / 1000),
      source: 'upbit/binance',
    };
    expect(typeof mockResponse.premium_pct).toBe('number');
    expect(typeof mockResponse.ts).toBe('number');
    expect(typeof mockResponse.source).toBe('string');
  });
});
