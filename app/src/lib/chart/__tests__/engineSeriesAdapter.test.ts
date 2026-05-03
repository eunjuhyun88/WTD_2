/**
 * engineSeriesAdapter tests — W-0400 Phase 2B
 *
 * AC2B-1: exactly 1 fetch call per mountEngineSeries invocation
 * AC2B-6: on fetch error, throws EngineUnavailableError without touching chart
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountEngineSeries, unmountEngineSeries, EngineUnavailableError } from '../engineSeriesAdapter';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('lightweight-charts', () => ({
  LineSeries: {},
  HistogramSeries: {},
}));

const mockSeries = {
  setData: vi.fn(),
  applyOptions: vi.fn(),
};

const mockChart = {
  addSeries: vi.fn(() => mockSeries),
  removeSeries: vi.fn(),
} as unknown as IChartApi;

// Helper: build a fetch Response with JSON body
function mockFetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Base options ─────────────────────────────────────────────────────────────

const BASE_OPTS = {
  symbol: 'BTCUSDT',
  timeframe: '15m',
  indicatorId: 'sma_20',
  limit: 500,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('mountEngineSeries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('calls /api/indicators/series with correct params', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({ points: [], count: 0 }),
    );

    await mountEngineSeries(mockChart, BASE_OPTS);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const rawUrl = fetchSpy.mock.calls[0][0] as string;
    expect(rawUrl).toContain('/api/indicators/series');
    const qs = new URLSearchParams(rawUrl.split('?')[1]);
    expect(qs.get('symbol')).toBe('BTCUSDT');
    expect(qs.get('timeframe')).toBe('15m');
    expect(qs.get('indicator')).toBe('sma_20');
    expect(qs.get('limit')).toBe('500');
  });

  it('returns a LineSeries for archetype "line" (default)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({ points: [], count: 0 }),
    );

    const series = await mountEngineSeries(mockChart, { ...BASE_OPTS, archetype: 'line' });

    expect(mockChart.addSeries).toHaveBeenCalledTimes(1);
    const [SeriesClass] = (mockChart.addSeries as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown];
    const { LineSeries } = await import('lightweight-charts');
    expect(SeriesClass).toBe(LineSeries);
    expect(series).toBe(mockSeries);
  });

  it('returns a HistogramSeries for archetype "histogram"', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({ points: [], count: 0 }),
    );

    const series = await mountEngineSeries(mockChart, { ...BASE_OPTS, archetype: 'histogram' });

    expect(mockChart.addSeries).toHaveBeenCalledTimes(1);
    const [SeriesClass] = (mockChart.addSeries as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown];
    const { HistogramSeries } = await import('lightweight-charts');
    expect(SeriesClass).toBe(HistogramSeries);
    expect(series).toBe(mockSeries);
  });

  it('maps points correctly: {t: ms, v} → {time: seconds, value}', async () => {
    const inputPoints = [
      { t: 1700000000000, v: 50000 },
      { t: 1700000060000, v: 50100 },
    ];
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({ points: inputPoints, count: 2 }),
    );

    await mountEngineSeries(mockChart, BASE_OPTS);

    expect(mockSeries.setData).toHaveBeenCalledWith([
      { time: 1700000000, value: 50000 },
      { time: 1700000060, value: 50100 },
    ]);
  });

  it('throws EngineUnavailableError on fetch 503', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({ error: 'engine_unavailable' }, 503),
    );

    await expect(mountEngineSeries(mockChart, BASE_OPTS)).rejects.toThrow(EngineUnavailableError);
    // chart must NOT be touched
    expect(mockChart.addSeries).not.toHaveBeenCalled();
  });

  it('throws EngineUnavailableError on fetch 404', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({ error: 'not_found' }, 404),
    );

    const err = await mountEngineSeries(mockChart, BASE_OPTS).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EngineUnavailableError);
    expect((err as EngineUnavailableError).status).toBe(404);
    // chart must NOT be touched
    expect(mockChart.addSeries).not.toHaveBeenCalled();
  });

  it('AC2B-1: only 1 fetch call per mountEngineSeries invocation', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({ points: [{ t: 1700000000000, v: 100 }], count: 1 }),
    );

    await mountEngineSeries(mockChart, BASE_OPTS);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('mounts series with empty data without crash (empty points array)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({ points: [], count: 0 }),
    );

    const series = await mountEngineSeries(mockChart, BASE_OPTS);

    expect(series).toBe(mockSeries);
    expect(mockSeries.setData).toHaveBeenCalledWith([]);
  });

  it('includes params in query string when provided', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({ points: [], count: 0 }),
    );

    await mountEngineSeries(mockChart, {
      ...BASE_OPTS,
      params: { length: 50 },
    });

    const rawUrl = fetchSpy.mock.calls[0][0] as string;
    const qs = new URLSearchParams(rawUrl.split('?')[1]);
    expect(qs.get('params')).toBe(JSON.stringify({ length: 50 }));
  });
});

describe('unmountEngineSeries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls chart.removeSeries() with the series', () => {
    const series = mockSeries as unknown as ISeriesApi<'Line'>;
    unmountEngineSeries(mockChart, series);
    expect(mockChart.removeSeries).toHaveBeenCalledWith(series);
  });

  it('is safe when series already removed (no throw)', () => {
    const throwingChart = {
      ...mockChart,
      removeSeries: vi.fn(() => { throw new Error('Series not found'); }),
    } as unknown as IChartApi;

    const series = mockSeries as unknown as ISeriesApi<'Line'>;
    expect(() => unmountEngineSeries(throwingChart, series)).not.toThrow();
  });
});
