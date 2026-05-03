// clientIndicators.ts — client-side TA calculations (W-0399-P2)
//
// Pure functions: klines → {time, value}[] (or multi-field arrays).
// No external deps — keeps bundle delta minimal (~3KB gzip).
// Algorithm choices match engine/indicators/*.py to keep ±0.1 parity (AC4).

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Point { time: number; value: number; }

// ── EMA (Exponential Moving Average) ────────────────────────────────────────
// Uses the standard α = 2/(period+1) smoothing.

function emaArray(values: number[], period: number): number[] {
  if (period < 1 || values.length === 0) return [];
  const k = 2 / (period + 1);
  const out = new Array<number>(values.length).fill(NaN);
  // Seed with SMA of first `period` values
  let sum = 0;
  let i = 0;
  for (; i < period && i < values.length; i++) sum += values[i];
  if (i < period) return out; // not enough data
  out[period - 1] = sum / period;
  for (; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

export function calcEMA(candles: Candle[], period = 20): Point[] {
  const ema = emaArray(candles.map((c) => c.close), period);
  return candles
    .map((c, i) => ({ time: c.time, value: ema[i] }))
    .filter((p) => Number.isFinite(p.value));
}

// ── RMA (Running/Wilder Moving Average) — used by RSI ─────────────────────
// α = 1/period. TV and most engines use RMA for RSI, not EMA.

function rmaArray(values: number[], period: number): number[] {
  if (period < 1 || values.length === 0) return [];
  const k = 1 / period;
  const out = new Array<number>(values.length).fill(NaN);
  // Seed: SMA of first `period`
  let sum = 0;
  let i = 0;
  for (; i < period && i < values.length; i++) sum += values[i];
  if (i < period) return out;
  out[period - 1] = sum / period;
  for (; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

// ── RSI ──────────────────────────────────────────────────────────────────────

export function calcRSI(candles: Candle[], period = 14): Point[] {
  const closes = candles.map((c) => c.close);
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  const avgGain = rmaArray(gains, period);
  const avgLoss = rmaArray(losses, period);
  const rsi: Point[] = [];
  // RSI array is offset by 1 because gains/losses start at index 1
  for (let i = period - 1; i < avgGain.length; i++) {
    if (!Number.isFinite(avgGain[i]) || !Number.isFinite(avgLoss[i])) continue;
    const rs = avgLoss[i] === 0 ? Infinity : avgGain[i] / avgLoss[i];
    const val = avgLoss[i] === 0 ? 100 : 100 - 100 / (1 + rs);
    rsi.push({ time: candles[i + 1].time, value: val });
  }
  return rsi;
}

// ── MACD ─────────────────────────────────────────────────────────────────────

export interface MacdPoint { time: number; macd: number; signal: number; hist: number; }

export function calcMACD(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signal = 9,
): MacdPoint[] {
  const closes = candles.map((c) => c.close);
  const emaFast = emaArray(closes, fast);
  const emaSlow = emaArray(closes, slow);
  // MACD line only valid where both EMAs are valid (slow is the limiting factor)
  const macdLine: number[] = closes.map((_, i) =>
    Number.isFinite(emaFast[i]) && Number.isFinite(emaSlow[i])
      ? emaFast[i] - emaSlow[i]
      : NaN,
  );
  const validMacd = macdLine.filter((v) => Number.isFinite(v));
  const signalArr = emaArray(validMacd, signal);
  // Map back to candle times
  const out: MacdPoint[] = [];
  let sigIdx = 0;
  for (let i = 0; i < candles.length; i++) {
    if (!Number.isFinite(macdLine[i])) continue;
    const mac = macdLine[i];
    const sig = signalArr[sigIdx] ?? NaN;
    if (Number.isFinite(sig)) {
      out.push({ time: candles[i].time, macd: mac, signal: sig, hist: mac - sig });
    }
    sigIdx++;
  }
  return out;
}

// ── Bollinger Bands ───────────────────────────────────────────────────────────

export interface BBPoint { time: number; upper: number; middle: number; lower: number; }

export function calcBB(candles: Candle[], period = 20, mult = 2): BBPoint[] {
  const closes = candles.map((c) => c.close);
  const out: BBPoint[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    out.push({
      time: candles[i].time,
      upper: mean + mult * std,
      middle: mean,
      lower: mean - mult * std,
    });
  }
  return out;
}

// ── VWAP (session-anchored, resets each day) ─────────────────────────────────
// Anchor granularity: daily (86400s boundary). Matches TV default VWAP.

export function calcVWAP(candles: Candle[]): Point[] {
  const out: Point[] = [];
  let cumTP = 0;
  let cumVol = 0;
  let dayStart = 0;
  for (const c of candles) {
    const day = Math.floor(c.time / 86400);
    if (day !== dayStart) {
      cumTP = 0;
      cumVol = 0;
      dayStart = day;
    }
    const tp = (c.high + c.low + c.close) / 3;
    cumTP += tp * c.volume;
    cumVol += c.volume;
    if (cumVol > 0) out.push({ time: c.time, value: cumTP / cumVol });
  }
  return out;
}

// ── ATR Bands (SMA ± multiplier × ATR) ───────────────────────────────────────
// True Range = max(high-low, |high-prevClose|, |low-prevClose|)

export interface ATRBandsPoint { time: number; upper: number; lower: number; middle: number; }

export function calcATRBands(candles: Candle[], period = 14, mult = 1): ATRBandsPoint[] {
  if (candles.length < 2) return [];
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const atr = rmaArray(tr, period);
  const closes = candles.map((c) => c.close);
  const out: ATRBandsPoint[] = [];
  // SMA of close for middle band
  for (let i = period; i < candles.length; i++) {
    const atrVal = atr[i - 1]; // tr is offset by 1
    if (!Number.isFinite(atrVal)) continue;
    const slice = closes.slice(i - period + 1, i + 1);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    out.push({
      time: candles[i].time,
      upper: sma + mult * atrVal,
      middle: sma,
      lower: sma - mult * atrVal,
    });
  }
  return out;
}
