import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAnalyze,
  fetchConfluenceCurrent,
  fetchConfluenceHistory,
  fetchFundingFlip,
  fetchFundingHistory,
  fetchIndicatorContext,
  fetchLiqClusters,
  fetchOptionsSnapshot,
  fetchRecentCaptures,
  fetchRvCone,
  fetchSsr,
  fetchVenueDivergence,
  fetchAlphaWorldModel,
  submitTradeOutcome,
} from './terminalBackend';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('terminalBackend surface clients', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads recent captures through the runtime plane proxy', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        owner: 'engine',
        plane: 'runtime',
        status: 'fallback_local',
        generated_at: '2026-04-23T00:00:00Z',
        captures: [
          {
            capture_id: 'cap_1',
            capture_kind: 'pattern_candidate',
            symbol: 'BTCUSDT',
            pattern_slug: 'tradoor-oi-reversal-v1',
            timeframe: '4h',
            captured_at_ms: 1_776_566_400_000,
            chart_context: {},
            block_scores: {},
            status: 'pending_outcome',
          },
        ],
        count: 1,
      }),
    );

    const captures = await fetchRecentCaptures(8);

    expect(fetchMock).toHaveBeenCalledWith('/api/runtime/captures?limit=8');
    expect(captures).toHaveLength(1);
    expect(captures[0]?.capture_id).toBe('cap_1');
  });

  it('returns an empty list when runtime captures are unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 500));

    await expect(fetchRecentCaptures(8)).resolves.toEqual([]);
  });

  it('loads confluence current and history through surface client helpers', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          at: 1_776_566_400_000,
          symbol: 'BTCUSDT',
          score: 42,
          confidence: 0.7,
          regime: 'bull',
          contributions: [],
          top: [],
          divergence: false,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          entries: [
            {
              at: 1_776_566_400_000,
              score: 42,
              confidence: 0.7,
              regime: 'bull',
              divergence: false,
            },
          ],
        }),
      );

    const current = await fetchConfluenceCurrent('BTCUSDT', '4h');
    const history = await fetchConfluenceHistory('BTCUSDT', 96);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/confluence/current?symbol=BTCUSDT&tf=4h');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/confluence/history?symbol=BTCUSDT&limit=96');
    expect(current?.score).toBe(42);
    expect(history[0]?.regime).toBe('bull');
  });

  it('loads analyze through a surface client helper', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        symbol: 'BTCUSDT',
        tf: '4h',
        price: 100,
      }),
    );

    const analyze = await fetchAnalyze('BTCUSDT', '4h');

    expect(fetchMock).toHaveBeenCalledWith('/api/cogochi/analyze?symbol=BTCUSDT&tf=4h');
    expect(analyze?.price).toBe(100);
  });

  it('loads indicator side-fetch payloads through surface client helpers', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ symbol: 'BTCUSDT', at: 1, oi: [], funding: [] }))
      .mockResolvedValueOnce(jsonResponse({ symbol: 'BTCUSDT', at: 1, window: '4h', cells: [] }))
      .mockResolvedValueOnce(jsonResponse({ symbol: 'BTCUSDT', at: 1, context: {} }))
      .mockResolvedValueOnce(jsonResponse({ at: 1, current: 10, percentile: 50, sparkline: [], regime: 'neutral' }))
      .mockResolvedValueOnce(jsonResponse({ symbol: 'BTCUSDT', at: 1, windows: [], current: {}, cone: {}, percentile: {} }))
      .mockResolvedValueOnce(
        jsonResponse({
          symbol: 'BTCUSDT',
          at: 1,
          currentRate: 0.001,
          previousRate: -0.001,
          flippedAt: 1,
          persistedHours: 8,
          direction: 'neg_to_pos',
          consecutiveIntervals: 1,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ symbol: 'BTCUSDT', bars: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          currency: 'BTC',
          at: 1,
          underlyingPrice: 100,
          totalOI: { call: 1, put: 1, total: 2 },
          totalVolume24h: { call: 1, put: 1 },
          putCallRatioOi: 1,
          putCallRatioVol: 1,
          skew25d: 0,
          atmIvNearTerm: 0.5,
          counts: { callStrikes: 1, putStrikes: 1, nearTermInstruments: 1 },
          expiries: [],
        }),
      );

    await expect(fetchVenueDivergence('BTCUSDT')).resolves.toMatchObject({ symbol: 'BTCUSDT' });
    await expect(fetchLiqClusters('BTCUSDT', '4h')).resolves.toMatchObject({ window: '4h' });
    await expect(fetchIndicatorContext('BTCUSDT')).resolves.toMatchObject({ symbol: 'BTCUSDT' });
    await expect(fetchSsr()).resolves.toMatchObject({ regime: 'neutral' });
    await expect(fetchRvCone('BTCUSDT')).resolves.toMatchObject({ symbol: 'BTCUSDT' });
    await expect(fetchFundingFlip('BTCUSDT')).resolves.toMatchObject({ direction: 'neg_to_pos' });
    await expect(fetchFundingHistory('BTCUSDT', 270)).resolves.toMatchObject({ symbol: 'BTCUSDT' });
    await expect(fetchOptionsSnapshot('BTC')).resolves.toMatchObject({ currency: 'BTC' });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/market/venue-divergence?symbol=BTCUSDT',
      '/api/market/liq-clusters?symbol=BTCUSDT&window=4h',
      '/api/market/indicator-context?symbol=BTCUSDT',
      '/api/market/stablecoin-ssr',
      '/api/market/rv-cone?symbol=BTCUSDT',
      '/api/market/funding-flip?symbol=BTCUSDT',
      '/api/market/funding?symbol=BTCUSDT&limit=270',
      '/api/market/options-snapshot?currency=BTC',
    ]);
  });

  it('submits trade outcome through a surface action helper', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        saved: true,
        count: 12,
        training_triggered: false,
      }),
    );

    const result = await submitTradeOutcome({
      snapshot: { last_close: 100, user_verdict: 'agree' },
      outcome: 1,
      symbol: 'BTCUSDT',
      timeframe: '4h',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cogochi/outcome',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(result?.saved).toBe(true);
  });

  it('loads alpha world model through a surface client helper', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        phases: [{ symbol: 'BTCUSDT', grade: 'A', phase: 'HOT', entered_at: null }],
      }),
    );

    const worldModel = await fetchAlphaWorldModel();

    expect(fetchMock).toHaveBeenCalledWith('/api/cogochi/alpha/world-model');
    expect(worldModel.phases?.[0]?.phase).toBe('HOT');
  });
});
