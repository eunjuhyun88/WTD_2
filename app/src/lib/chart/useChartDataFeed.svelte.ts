/**
 * useChartDataFeed — Svelte 5 rune composable for chart data loading.
 *
 * Encapsulates loadData() + loadMoreHistory() + rate-limit countdown logic
 * so ChartBoard.svelte can delegate fetch/cache management here.
 *
 * W-0287 Phase 4a.
 */
import type { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts';
import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
import { tfMinutes } from '$lib/chart/mtfAlign';

export interface ChartDataFeedOpts {
  /** Reactive getter for current symbol. */
  getSymbol: () => string;
  /** Reactive getter for current timeframe. */
  getTf: () => string;
  /** Reactive getter for optional higher-timeframe EMA override. */
  getEmaTf: () => string;
  /** Optional pre-fetched payload — skips network fetch when emaTf is blank. */
  getInitialData: () => ChartSeriesPayload | null;
  /** Reactive getter for the live main chart instance (for history prepend). */
  getChart: () => IChartApi | null;
  /** Reactive getter for the active price series (for history prepend). */
  getPriceSeries: () => ISeriesApi<SeriesType> | null;
}

export function useChartDataFeed(opts: ChartDataFeedOpts) {
  let chartData = $state<ChartSeriesPayload | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let rateLimitRetryIn = $state<number | null>(null);
  let historyLoadingMore = $state(false);
  let earliestBarTimeMs = $state<number | null>(null);

  const _cache = new Map<string, ChartSeriesPayload>();
  let _loadToken = 0;
  let _lastDataKey = '';

  async function loadData() {
    const symbol = opts.getSymbol();
    const tf = opts.getTf();
    const emaTf = opts.getEmaTf();
    if (!symbol) return;

    const dataKey = `${symbol}:${tf}:${emaTf || 'chart'}`;
    if (dataKey === _lastDataKey && chartData) return;

    if (_cache.has(dataKey)) {
      chartData = _cache.get(dataKey) ?? null;
      error = null;
      loading = false;
      _lastDataKey = dataKey;
      return;
    }

    const initialData = opts.getInitialData();
    if (initialData && !emaTf) {
      _cache.set(dataKey, initialData);
      chartData = initialData;
      error = null;
      loading = false;
      _lastDataKey = dataKey;
      return;
    }

    const token = ++_loadToken;
    loading = true;
    error = null;
    rateLimitRetryIn = null;

    try {
      const emaQ = emaTf ? `&emaTf=${encodeURIComponent(emaTf)}` : '';
      const chartRes = await fetch(`/api/chart/klines?symbol=${symbol}&tf=${tf}&limit=500${emaQ}`);

      if (chartRes.status === 429) {
        if (token !== _loadToken) return;
        loading = false;
        rateLimitRetryIn = 10;
        const countdown = setInterval(() => {
          rateLimitRetryIn = (rateLimitRetryIn ?? 0) - 1;
          if ((rateLimitRetryIn ?? 0) <= 0) {
            clearInterval(countdown);
            rateLimitRetryIn = null;
            void loadData();
          }
        }, 1_000);
        return;
      }

      if (!chartRes.ok) throw new Error(`HTTP ${chartRes.status}`);
      const data = (await chartRes.json()) as ChartSeriesPayload & { error?: unknown };
      if (data.error) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Chart payload error');
      }
      if (token !== _loadToken) return;

      _cache.set(dataKey, data);
      chartData = data;
      loading = false;
      _lastDataKey = dataKey;

      const firstBar = (data.klines as Array<{ time: number }>)[0];
      if (firstBar) earliestBarTimeMs = firstBar.time * 1000;
    } catch (e) {
      if (token !== _loadToken) return;
      error = String(e);
      loading = false;
    }
  }

  async function loadMoreHistory() {
    const symbol = opts.getSymbol();
    const tf = opts.getTf();
    const emaTf = opts.getEmaTf();
    if (historyLoadingMore || earliestBarTimeMs == null || !symbol) return;

    const tfMs = tfMinutes(tf) * 60_000;
    const startTime = earliestBarTimeMs - 500 * tfMs;
    if (startTime < 0) return;

    historyLoadingMore = true;
    try {
      const emaQ = emaTf ? `&emaTf=${encodeURIComponent(emaTf)}` : '';
      const res = await fetch(
        `/api/chart/klines?symbol=${symbol}&tf=${tf}&limit=500&startTime=${startTime}${emaQ}`,
      );
      if (!res.ok) return;

      const older = (await res.json()) as {
        klines?: Array<{
          time: number;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        }>;
      };
      if (!older.klines?.length) return;

      earliestBarTimeMs = older.klines[0].time * 1000;

      const mainChart = opts.getChart();
      const priceSeries = opts.getPriceSeries();
      const savedRange = mainChart?.timeScale().getVisibleLogicalRange();
      const current = (chartData?.klines ?? []) as Array<{
        time: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }>;
      const cutoff = older.klines[older.klines.length - 1].time;
      const merged = [...older.klines, ...current.filter((k) => k.time > cutoff)];

      if (priceSeries) {
        priceSeries.setData(
          merged.map((k) => ({
            time: k.time as UTCTimestamp,
            open: k.open,
            high: k.high,
            low: k.low,
            close: k.close,
          })),
        );
      }

      if (savedRange) {
        const prepended = older.klines.length;
        mainChart?.timeScale().setVisibleLogicalRange({
          from: savedRange.from + prepended,
          to: savedRange.to + prepended,
        });
      }
    } catch {
      /* lazy load is best-effort */
    } finally {
      historyLoadingMore = false;
    }
  }

  function reset() {
    _loadToken++;
    loading = true;
    error = null;
    chartData = null;
    earliestBarTimeMs = null;
    rateLimitRetryIn = null;
  }

  return {
    get chartData() { return chartData; },
    get loading() { return loading; },
    get error() { return error; },
    get rateLimitRetryIn() { return rateLimitRetryIn; },
    get historyLoadingMore() { return historyLoadingMore; },
    get earliestBarTimeMs() { return earliestBarTimeMs; },
    loadData,
    loadMoreHistory,
    reset,
  };
}
