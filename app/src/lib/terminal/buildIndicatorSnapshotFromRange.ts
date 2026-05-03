/**
 * buildIndicatorSnapshotFromRange.ts — W-0392
 *
 * Slices a ChartSeriesPayload to [anchorA, anchorB] and extracts a
 * Record<string, number> snapshot suitable for /agent/judge.
 *
 * Required keys (7): rsi_14, vol_z_20, atr_pct_14, macd_hist,
 *                     bb_width, ret_5b, ret_20b
 * Rule: all values reference the anchorB *closed* bar (look-ahead free).
 *       NaN / Infinity → key omitted.
 *       < 3 required keys present → returns null.
 */

import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
import type { MacdPoint, TimePoint } from '$lib/server/chart/indicatorUtils';

export interface JudgeVerdict {
  verdict: string;
  entry: number | null;
  stop: number | null;
  target: number | null;
  rr: number | null;
  rationale: string | null;
}

export const REQUIRED_SNAPSHOT_KEYS = [
  'rsi_14',
  'vol_z_20',
  'atr_pct_14',
  'macd_hist',
  'bb_width',
  'ret_5b',
  'ret_20b',
] as const;

export const MIN_SNAPSHOT_KEYS = 3;
export const MIN_RANGE_BARS = 3;

export interface RangeSnapshotResult {
  snapshot: Record<string, number>;
  nBars: number;
  fromTs: number;
  toTs: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  totalVolume: number;
  retPct: number;
}

function safeValue(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}

function closestBefore(series: TimePoint[], ts: number): number | null {
  let best: TimePoint | null = null;
  for (const pt of series) {
    if (pt.time <= ts) {
      if (!best || pt.time > best.time) best = pt;
    }
  }
  return best ? safeValue(best.value) : null;
}

function closestMacdBefore(series: MacdPoint[], ts: number): MacdPoint | null {
  let best: MacdPoint | null = null;
  for (const pt of series) {
    if (pt.time <= ts) {
      if (!best || pt.time > best.time) best = pt;
    }
  }
  return best ?? null;
}

export function buildIndicatorSnapshotFromRange(
  payload: ChartSeriesPayload,
  anchorA: number,
  anchorB: number,
): RangeSnapshotResult | null {
  const timeFrom = Math.min(anchorA, anchorB);
  const timeTo = Math.max(anchorA, anchorB);

  const bars = payload.klines.filter((k) => k.time >= timeFrom && k.time <= timeTo);
  if (bars.length < MIN_RANGE_BARS) return null;

  const anchorBBar = payload.klines
    .filter((k) => k.time <= timeTo)
    .sort((a, b) => b.time - a.time)[0];
  if (!anchorBBar) return null;

  const anchorBTs = anchorBBar.time;

  const openPrice = bars[0].open;
  const closePrice = anchorBBar.close;
  const highPrice = Math.max(...bars.map((b) => b.high));
  const lowPrice = Math.min(...bars.map((b) => b.low));
  const totalVolume = bars.reduce((s, b) => s + b.volume, 0);
  const retPct = openPrice > 0 ? ((closePrice - openPrice) / openPrice) * 100 : 0;

  // All indicator bars up to anchorB (inclusive) in time order
  const allBarsToB = payload.klines
    .filter((k) => k.time <= anchorBTs)
    .sort((a, b) => a.time - b.time);

  const indicators = payload.indicators as Record<string, unknown>;
  const snapshot: Record<string, number> = {};

  // rsi_14
  const rsi14Series = indicators['rsi14'] as TimePoint[] | undefined;
  if (rsi14Series) {
    const v = closestBefore(rsi14Series, anchorBTs);
    if (v !== null) snapshot['rsi_14'] = v;
  }

  // macd_hist
  const macdSeries = indicators['macd'] as MacdPoint[] | undefined;
  if (macdSeries) {
    const pt = closestMacdBefore(macdSeries, anchorBTs);
    const v = pt ? safeValue(pt.hist) : null;
    if (v !== null) snapshot['macd_hist'] = v;
  }

  // atr_pct_14 = atr14 / close * 100
  const atr14Series = indicators['atr14'] as TimePoint[] | undefined;
  if (atr14Series && closePrice > 0) {
    const atrVal = closestBefore(atr14Series, anchorBTs);
    if (atrVal !== null) snapshot['atr_pct_14'] = (atrVal / closePrice) * 100;
  }

  // bb_width = (bbUpper - bbLower) / sma20
  const bbUpper = indicators['bbUpper'] as TimePoint[] | undefined;
  const bbLower = indicators['bbLower'] as TimePoint[] | undefined;
  const sma20 = indicators['sma20'] as TimePoint[] | undefined;
  if (bbUpper && bbLower && sma20) {
    const u = closestBefore(bbUpper, anchorBTs);
    const l = closestBefore(bbLower, anchorBTs);
    const mid = closestBefore(sma20, anchorBTs);
    if (u !== null && l !== null && mid !== null && mid > 0) {
      snapshot['bb_width'] = (u - l) / mid;
    }
  }

  // vol_z_20: z-score of anchorB volume vs prior 20 bars
  if (allBarsToB.length >= 20) {
    const window = allBarsToB.slice(-20);
    const vols = window.map((b) => b.volume);
    const mean = vols.reduce((s, v) => s + v, 0) / vols.length;
    const variance = vols.reduce((s, v) => s + (v - mean) ** 2, 0) / vols.length;
    const std = Math.sqrt(variance);
    if (std > 0) {
      snapshot['vol_z_20'] = (anchorBBar.volume - mean) / std;
    }
  }

  // ret_5b: % return over last 5 bars ending at anchorB
  if (allBarsToB.length >= 6) {
    const refBar = allBarsToB[allBarsToB.length - 6];
    if (refBar.close > 0) {
      snapshot['ret_5b'] = ((anchorBBar.close - refBar.close) / refBar.close) * 100;
    }
  }

  // ret_20b: % return over last 20 bars ending at anchorB
  if (allBarsToB.length >= 21) {
    const refBar = allBarsToB[allBarsToB.length - 21];
    if (refBar.close > 0) {
      snapshot['ret_20b'] = ((anchorBBar.close - refBar.close) / refBar.close) * 100;
    }
  }

  const presentRequired = REQUIRED_SNAPSHOT_KEYS.filter((k) => k in snapshot).length;
  if (presentRequired < MIN_SNAPSHOT_KEYS) return null;

  return {
    snapshot,
    nBars: bars.length,
    fromTs: timeFrom,
    toTs: timeTo,
    openPrice,
    highPrice,
    lowPrice,
    closePrice,
    totalVolume,
    retPct,
  };
}
