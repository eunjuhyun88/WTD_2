/**
 * chartIndicatorCalc.ts
 *
 * Client-side OHLCV indicator calculations for ChartBoard.
 * Used when the API returns an empty `indicators` object.
 *
 * All functions accept an array of time-stamped closes (plus open/high/low/volume
 * where needed) and return arrays aligned to the same index.
 */

export interface TimePoint {
  time: number;
  value: number;
}

export interface MACDPoint {
  time: number;
  macd: number;
  signal: number;
  hist: number;
}

export interface BBResult {
  upper: TimePoint[];
  middle: TimePoint[];
  lower: TimePoint[];
}

// ── RSI (Wilder smoothing) ────────────────────────────────────────────────────

/**
 * Compute RSI with Wilder's smoothing method.
 * @param bars  Array of { time, close } (ascending by time)
 * @param period Default 14
 */
export function calcRSI(
  bars: ReadonlyArray<{ time: number; close: number }>,
  period = 14,
): TimePoint[] {
  if (bars.length < period + 1) return [];

  const result: TimePoint[] = [];

  // Seed: simple average of first `period` gains/losses
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = bars[i].close - bars[i - 1].close;
    if (delta >= 0) avgGain += delta;
    else avgLoss += -delta;
  }
  avgGain /= period;
  avgLoss /= period;

  const firstRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result.push({ time: bars[period].time, value: firstRsi });

  // Subsequent: Wilder exponential smoothing
  for (let i = period + 1; i < bars.length; i++) {
    const delta = bars[i].close - bars[i - 1].close;
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: bars[i].time, value: rsi });
  }

  return result;
}

// ── EMA helper ────────────────────────────────────────────────────────────────

function ema(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length).fill(NaN);

  // Seed with SMA of first `period` values
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  seed /= period;
  out[period - 1] = seed;

  for (let i = period; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

// ── MACD (12, 26, 9) ──────────────────────────────────────────────────────────

/**
 * Compute MACD(12, 26, 9).
 * @param bars  Array of { time, close } (ascending by time)
 */
export function calcMACD(
  bars: ReadonlyArray<{ time: number; close: number }>,
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDPoint[] {
  if (bars.length < slowPeriod + signalPeriod) return [];

  const closes = bars.map((b) => b.close);
  const fastEma = ema(closes, fastPeriod);
  const slowEma = ema(closes, slowPeriod);

  // MACD line starts where slowEma becomes valid (index = slowPeriod - 1)
  const macdLine: { idx: number; val: number }[] = [];
  for (let i = slowPeriod - 1; i < bars.length; i++) {
    if (!Number.isNaN(fastEma[i]) && !Number.isNaN(slowEma[i])) {
      macdLine.push({ idx: i, val: fastEma[i] - slowEma[i] });
    }
  }

  if (macdLine.length < signalPeriod) return [];

  const macdValues = macdLine.map((m) => m.val);
  const signalEma = ema(macdValues, signalPeriod);

  const result: MACDPoint[] = [];
  for (let i = signalPeriod - 1; i < macdLine.length; i++) {
    if (!Number.isNaN(signalEma[i])) {
      const macdVal = macdLine[i].val;
      const signalVal = signalEma[i];
      result.push({
        time: bars[macdLine[i].idx].time,
        macd: macdVal,
        signal: signalVal,
        hist: macdVal - signalVal,
      });
    }
  }

  return result;
}

// ── Bollinger Bands (20, 2σ) ──────────────────────────────────────────────────

/**
 * Compute Bollinger Bands.
 * @param bars    Array of { time, close } (ascending by time)
 * @param period  Default 20
 * @param mult    Standard deviation multiplier, default 2
 */
export function calcBB(
  bars: ReadonlyArray<{ time: number; close: number }>,
  period = 20,
  mult = 2,
): BBResult {
  if (bars.length < period) return { upper: [], middle: [], lower: [] };

  const upper: TimePoint[] = [];
  const middle: TimePoint[] = [];
  const lower: TimePoint[] = [];

  for (let i = period - 1; i < bars.length; i++) {
    const window = bars.slice(i - period + 1, i + 1);
    const sum = window.reduce((acc, b) => acc + b.close, 0);
    const mean = sum / period;
    const variance = window.reduce((acc, b) => acc + (b.close - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    const t = bars[i].time;
    middle.push({ time: t, value: mean });
    upper.push({ time: t, value: mean + mult * stdDev });
    lower.push({ time: t, value: mean - mult * stdDev });
  }

  return { upper, middle, lower };
}

// ── Convenience: augment an indicators record from klines ────────────────────

/**
 * Given a klines array and an existing indicators record (which may be empty),
 * compute and inject RSI14, MACD, and BB if the corresponding keys are missing.
 *
 * Returns a new object (does not mutate the original).
 */
export function injectClientIndicators(
  klines: ReadonlyArray<{ time: number; open: number; high: number; low: number; close: number; volume: number }>,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...existing };

  if (!out['rsi14'] || (Array.isArray(out['rsi14']) && (out['rsi14'] as unknown[]).length === 0)) {
    out['rsi14'] = calcRSI(klines);
  }

  if (!out['macd'] || (Array.isArray(out['macd']) && (out['macd'] as unknown[]).length === 0)) {
    out['macd'] = calcMACD(klines);
  }

  if (
    !out['bbUpper'] ||
    (Array.isArray(out['bbUpper']) && (out['bbUpper'] as unknown[]).length === 0)
  ) {
    const bb = calcBB(klines);
    out['bbUpper'] = bb.upper;
    out['bbLower'] = bb.lower;
    out['bbMiddle'] = bb.middle;
  }

  return out;
}
