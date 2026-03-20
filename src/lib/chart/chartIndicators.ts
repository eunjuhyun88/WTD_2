// ═══ Chart Indicator Computation ═══
// Extracted from ChartPanel.svelte for reuse and testability

import type { IndicatorKey } from '$lib/chart/chartTypes';

export type { IndicatorKey };

export type IndicatorProfile = Record<IndicatorKey, boolean>;

export const INDICATOR_PROFILES = {
  basic: { ma20: false, ma60: false, ma120: false, ma7: true, ma25: true, ma99: true, rsi: true, vol: true } as IndicatorProfile,
  advancedFocus: { ma20: true, ma60: true, ma120: true, ma7: false, ma25: false, ma99: false, rsi: true, vol: true } as IndicatorProfile,
  advancedFull: { ma20: true, ma60: true, ma120: true, ma7: true, ma25: true, ma99: true, rsi: true, vol: true } as IndicatorProfile,
} as const;

export function getIndicatorProfile(advancedMode: boolean, chartVisualMode: 'focus' | 'full'): IndicatorProfile {
  if (!advancedMode) return INDICATOR_PROFILES.basic;
  return chartVisualMode === 'full' ? INDICATOR_PROFILES.advancedFull : INDICATOR_PROFILES.advancedFocus;
}

export function computeSMA(
  data: { time: unknown; close: number }[],
  period: number
): { time: unknown; value: number }[] {
  const result: { time: unknown; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i].close;
    if (i >= period) sum -= data[i - period].close;
    if (i >= period - 1) result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

export interface RSIState {
  avgGain: number;
  avgLoss: number;
}

export function computeRSI(
  data: { time: unknown; close: number }[],
  period = 14
): { result: { time: unknown; value: number }[]; state: RSIState } {
  if (data.length < period + 1) return { result: [], state: { avgGain: 0, avgLoss: 0 } };
  const result: { time: unknown; value: number }[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = data[i].close - data[i - 1].close;
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result.push({ time: data[period].time, value: rsi });
  for (let i = period + 1; i < data.length; i++) {
    const d = data[i].close - data[i - 1].close;
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    result.push({
      time: data[i].time,
      value: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss),
    });
  }
  return { result, state: { avgGain, avgLoss } };
}

/** Incremental RSI update for a single new candle (Wilder smoothing) */
export function updateRSIIncremental(
  state: RSIState,
  delta: number,
  period = 14
): { value: number; state: RSIState } {
  const avgGain = (state.avgGain * (period - 1) + (delta > 0 ? delta : 0)) / period;
  const avgLoss = (state.avgLoss * (period - 1) + (delta < 0 ? -delta : 0)) / period;
  const value = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  return { value, state: { avgGain, avgLoss } };
}

export const BAR_SPACING = {
  MIN: 5,
  MAX: 28,
  STEP: 1.5,
  DEFAULT: 14,
} as const;

export const MAX_KLINE_CACHE = 5000;
export const MAX_DRAWINGS = 50;
export const LINE_ENTRY_DEFAULT_RR = 2;
export const LINE_ENTRY_MIN_PIXEL_RISK = 6;
export const MIN_PATTERN_CANDLES = 30;
export const MAX_OVERLAY_PATTERNS = 1;

// ═══ Server-side helper (single-value, O(period) — no time metadata) ═══

/** Last SMA value from plain closes, or null if insufficient data */
export function smaLast(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  let sum = 0;
  for (let i = closes.length - period; i < closes.length; i++) sum += closes[i];
  return sum / period;
}
// For full SMA/RSI series from plain closes, use calcSMA/calcRSI from $lib/engine/indicators
