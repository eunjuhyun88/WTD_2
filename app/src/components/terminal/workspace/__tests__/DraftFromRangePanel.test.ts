import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A-04-app: DraftFromRangePanel tests.
 * Tests draftPatternFromRange API integration matching A-04-eng (PR #372).
 */

import { draftPatternFromRange } from '$lib/api/terminalApi';

describe('DraftFromRangePanel — A-04-app', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POST /api/patterns/draft-from-range returns parsed draft', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        pattern_family: 'oi_reversal',
        pattern_label: 'OI Reversal v2',
        phases: [],
        signals_required: [],
        signals_preferred: [],
        signals_forbidden: [],
        extracted_features: {
          oi_change: 0.45,
          funding: -0.02,
          cvd: 0.78,
          liq_volume: null,
        },
      }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await draftPatternFromRange('BTCUSDT', 1700000000, 1700003600, '15m');
    expect(result.pattern_family).toBe('oi_reversal');
    expect(result.extracted_features?.oi_change).toBe(0.45);
    expect(result.extracted_features?.liq_volume).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on engine 422 (4+ features null)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ detail: '범위가 너무 작거나 데이터 부족' }), { status: 422 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      draftPatternFromRange('BTCUSDT', 1700000000, 1700003600, '15m'),
    ).rejects.toThrow();
  });

  it('throws on engine 404 (symbol not found)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'symbol not found' }), { status: 404 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      draftPatternFromRange('UNKNOWN', 1700000000, 1700003600, '15m'),
    ).rejects.toThrow();
  });

  it('uses correct URL path', async () => {
    let capturedUrl = '';
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      capturedUrl = typeof url === 'string' ? url : url.toString();
      return new Response('{}', { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await draftPatternFromRange('BTCUSDT', 1700000000, 1700003600, '15m');
    expect(capturedUrl).toBe('/api/patterns/draft-from-range');
  });

  it('builds correct request body', async () => {
    let capturedBody: unknown = null;
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body && typeof init.body === 'string') {
        capturedBody = JSON.parse(init.body);
      }
      return new Response('{}', { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await draftPatternFromRange('BTCUSDT', 1700000000, 1700003600, '1h');
    expect(capturedBody).toEqual({
      symbol: 'BTCUSDT',
      start_ts: 1700000000,
      end_ts: 1700003600,
      timeframe: '1h',
    });
  });

  it('p50 무색 룰 — feature classification', () => {
    function featureClass(v: number | null): string {
      if (v === null) return 'feat-null';
      const abs = Math.abs(v);
      if (abs < 0.3) return 'feat-neutral';
      if (abs < 0.7) return 'feat-warn';
      return 'feat-extreme';
    }

    expect(featureClass(null)).toBe('feat-null');
    expect(featureClass(0.1)).toBe('feat-neutral');
    expect(featureClass(0.5)).toBe('feat-warn');
    expect(featureClass(0.9)).toBe('feat-extreme');
    expect(featureClass(-0.85)).toBe('feat-extreme');
  });
});
