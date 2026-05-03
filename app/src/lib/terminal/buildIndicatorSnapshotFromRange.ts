/**
 * buildIndicatorSnapshotFromRange.ts — W-0392
 *
 * Computes an indicator_snapshot from a slice of OHLCV bars
 * (anchorA..anchorB). All calculations are look-ahead-free: the
 * reference bar is always bars[last] (the anchorB closing bar).
 *
 * Required output keys: rsi_14, vol_z_20, atr_pct_14, macd_hist,
 *   bb_width, ret_5b, ret_20b
 * Returns null when fewer than 3 required keys can be computed.
 * NaN values are omitted rather than inserted.
 */

import type { RangeSelectionBar } from './rangeSelectionCapture';

/** Minimum required valid indicator keys before returning non-null. */
const MIN_VALID_KEYS = 3;

// ── EMA helpers ──────────────────────────────────────────────────────────────

function emaArray(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function wilderEmaArray(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 1 / period;
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return NaN;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[], avg: number): number {
  if (arr.length < 2) return NaN;
  const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// ── Indicator calculations ───────────────────────────────────────────────────

/** RSI-14 using Wilder EMA on gains/losses. Returns NaN if insufficient data. */
function calcRSI14(closes: number[]): number {
  if (closes.length < 15) return NaN;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const gains = changes.map((d) => Math.max(d, 0));
  const losses = changes.map((d) => Math.max(-d, 0));
  const avgGains = wilderEmaArray(gains, 14);
  const avgLosses = wilderEmaArray(losses, 14);
  const lastGain = avgGains[avgGains.length - 1];
  const lastLoss = avgLosses[avgLosses.length - 1];
  if (lastLoss === 0) return 100;
  const rs = lastGain / lastLoss;
  return 100 - 100 / (1 + rs);
}

/** MACD histogram: EMA12 - EMA26, signal EMA9. Returns NaN if insufficient. */
function calcMACDHist(closes: number[]): number {
  if (closes.length < 34) return NaN; // need EMA26 + 9-bar signal
  const ema12 = emaArray(closes, 12);
  const ema26 = emaArray(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = emaArray(macdLine, 9);
  const last = macdLine.length - 1;
  return macdLine[last] - signal[last];
}

/** Bollinger Band width: (upper - lower) / middle. Returns NaN if insufficient. */
function calcBBWidth(closes: number[], period = 20): number {
  if (closes.length < period) return NaN;
  const slice = closes.slice(-period);
  const avg = mean(slice);
  const sd = stddev(slice, avg);
  if (avg === 0 || isNaN(sd)) return NaN;
  return (2 * 2 * sd) / avg; // (upper-lower)/middle where upper=avg+2sd
}

/** ATR% = ATR14 / close * 100. Returns NaN if insufficient. */
function calcATRPct14(bars: RangeSelectionBar[]): number {
  if (bars.length < 15) return NaN;
  const trValues: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const { high, low } = bars[i];
    const prevClose = bars[i - 1].close;
    trValues.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const atrArr = wilderEmaArray(trValues, 14);
  const atr = atrArr[atrArr.length - 1];
  const lastClose = bars[bars.length - 1].close;
  if (lastClose === 0) return NaN;
  return (atr / lastClose) * 100;
}

/** Volume z-score over last 20 bars. */
function calcVolZ20(bars: RangeSelectionBar[]): number {
  if (bars.length < 21) return NaN;
  const vols = bars.slice(-20).map((b) => b.volume ?? 0);
  const lastVol = bars[bars.length - 1].volume ?? 0;
  const avg = mean(vols);
  const sd = stddev(vols, avg);
  if (sd === 0 || isNaN(sd)) return NaN;
  return (lastVol - avg) / sd;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build an indicator snapshot from a bar slice.
 *
 * @param bars - OHLCV bars from anchorA to anchorB (inclusive). Must include
 *   volume for vol_z_20. The last bar is the reference (anchorB close).
 * @returns Record<string, number> with valid indicator keys, or null when
 *   fewer than MIN_VALID_KEYS keys can be computed.
 */
export function buildIndicatorSnapshotFromRange(
  bars: RangeSelectionBar[] | null | undefined,
): Record<string, number> | null {
  if (!bars || bars.length < 3) return null;

  const closes = bars.map((b) => b.close);
  const last = closes.length - 1;

  const snapshot: Record<string, number> = {};

  // ret_5b — look-ahead-free: only uses bars[last-5..last]
  if (last >= 5 && closes[last - 5] !== 0) {
    const v = (closes[last] - closes[last - 5]) / closes[last - 5];
    if (isFinite(v)) snapshot.ret_5b = v;
  }

  // ret_20b
  if (last >= 20 && closes[last - 20] !== 0) {
    const v = (closes[last] - closes[last - 20]) / closes[last - 20];
    if (isFinite(v)) snapshot.ret_20b = v;
  }

  // vol_z_20
  const volZ = calcVolZ20(bars);
  if (isFinite(volZ)) snapshot.vol_z_20 = volZ;

  // rsi_14
  const rsi = calcRSI14(closes);
  if (isFinite(rsi)) snapshot.rsi_14 = rsi;

  // macd_hist
  const macd = calcMACDHist(closes);
  if (isFinite(macd)) snapshot.macd_hist = macd;

  // bb_width
  const bbw = calcBBWidth(closes);
  if (isFinite(bbw)) snapshot.bb_width = bbw;

  // atr_pct_14
  const atr = calcATRPct14(bars);
  if (isFinite(atr)) snapshot.atr_pct_14 = atr;

  if (Object.keys(snapshot).length < MIN_VALID_KEYS) return null;
  return snapshot;
}
