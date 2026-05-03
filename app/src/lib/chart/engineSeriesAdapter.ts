/**
 * engineSeriesAdapter — W-0400 Phase 2B
 *
 * Client-side adapter: fetches indicator series from /api/indicators/series
 * and mounts/unmounts the resulting data onto a lightweight-charts IChartApi.
 *
 * Pure TypeScript — no Svelte, no server imports.
 *
 * AC2B-1: exactly 1 fetch call per mountEngineSeries invocation.
 * AC2B-6: on fetch error, throws EngineUnavailableError without touching chart.
 */

import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { LineSeries, HistogramSeries } from 'lightweight-charts';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SeriesPoint {
  t: number; // Unix milliseconds
  v: number;
}

export type SeriesArchetype = 'line' | 'histogram';

export interface MountedEngineIndicator {
  instanceId: string;
  seriesApi: ISeriesApi<'Line'> | ISeriesApi<'Histogram'>;
  paneIndex: number;
}

export interface EngineSeriesAdapterOptions {
  symbol: string;
  timeframe: string;
  /** Engine registry key, e.g. "sma_20" */
  indicatorId: string;
  params?: Record<string, number | string>;
  limit?: number;
  /** default: 'line' */
  archetype?: SeriesArchetype;
  lineColor?: string;
  /** Which pane to add series to. 0 = main price pane, ≥1 = sub-pane. */
  paneIndex?: number;
}

// ── Error ────────────────────────────────────────────────────────────────────

export class EngineUnavailableError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'EngineUnavailableError';
  }
}

// ── Core functions ───────────────────────────────────────────────────────────

/**
 * Fetch indicator series from /api/indicators/series and mount on IChartApi.
 *
 * AC2B-1: exactly 1 fetch call per invocation.
 * AC2B-6: throws EngineUnavailableError on non-OK response without touching chart.
 */
export async function mountEngineSeries(
  chart: IChartApi,
  opts: EngineSeriesAdapterOptions,
): Promise<ISeriesApi<'Line'> | ISeriesApi<'Histogram'>> {
  const {
    symbol,
    timeframe,
    indicatorId,
    params,
    limit = 500,
    archetype = 'line',
    lineColor,
    paneIndex = 0,
  } = opts;

  // Build request URL — AC2B-1: single fetch
  // Use URLSearchParams + relative path to avoid window dependency (also works in SSR/test contexts)
  const qs = new URLSearchParams({
    symbol,
    timeframe,
    indicator: indicatorId,
    limit: String(limit),
  });
  if (params && Object.keys(params).length > 0) {
    qs.set('params', JSON.stringify(params));
  }
  const url = `/api/indicators/series?${qs.toString()}`;

  // AC2B-6: fetch first, mount chart only if OK
  const response = await fetch(url);
  if (!response.ok) {
    throw new EngineUnavailableError(
      response.status,
      `Engine indicator fetch failed: ${response.status} ${response.statusText}`,
    );
  }

  const body = await response.json() as { points: SeriesPoint[]; count: number };
  const points = body.points ?? [];

  // Map engine points → lightweight-charts format
  const chartData = points.map((p) => ({
    time: (p.t / 1000) as UTCTimestamp,
    value: p.v,
  }));

  // Mount series onto chart
  let series: ISeriesApi<'Line'> | ISeriesApi<'Histogram'>;

  if (archetype === 'histogram') {
    series = chart.addSeries(HistogramSeries, {}, paneIndex);
  } else {
    const lineOpts = lineColor ? { color: lineColor } : {};
    series = chart.addSeries(LineSeries, lineOpts, paneIndex);
  }

  series.setData(chartData);
  return series;
}

/**
 * Remove a series from the chart.
 * Safe to call even if the series has already been removed.
 */
export function unmountEngineSeries(
  chart: IChartApi,
  series: ISeriesApi<'Line'> | ISeriesApi<'Histogram'>,
): void {
  try {
    chart.removeSeries(series);
  } catch {
    // Series was already removed — treat as no-op
  }
}
