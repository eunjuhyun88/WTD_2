// clientIndicators.ts — client-side TA calculations for W-0399 multi-instance
// All functions accept KlineLike[] and return {time, value}[] (or richer shapes).
// No external TA libraries — pure JS math to keep bundle lean (~3KB gzip).

import type { KlineLike } from './analysisPrimitives';

export interface LinePoint { time: number; value: number }
export interface BbPoint { time: number; upper: number; middle: number; lower: number }
export interface MacdPoint { time: number; macd: number; signal: number; hist: number }

// ── EMA ────────────────────────────────────────────────────────────────────

export function calcEma(klines: readonly KlineLike[], period: number): LinePoint[] {
  if (klines.length < period) return [];
  const k = 2 / (period + 1);
  const out: LinePoint[] = [];
  let ema = klines.slice(0, period).reduce((s, b) => s + b.close, 0) / period;
  out.push({ time: klines[period - 1].time, value: ema });
  for (let i = period; i < klines.length; i++) {
    ema = klines[i].close * k + ema * (1 - k);
    out.push({ time: klines[i].time, value: ema });
  }
  return out;
}

// ── Bollinger Bands ────────────────────────────────────────────────────────

export function calcBb(klines: readonly KlineLike[], period = 20, mult = 2): BbPoint[] {
  if (klines.length < period) return [];
  const out: BbPoint[] = [];
  for (let i = period - 1; i < klines.length; i++) {
    const slice = klines.slice(i - period + 1, i + 1);
    const mean = slice.reduce((s, b) => s + b.close, 0) / period;
    const variance = slice.reduce((s, b) => s + (b.close - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    out.push({ time: klines[i].time, upper: mean + mult * sd, middle: mean, lower: mean - mult * sd });
  }
  return out;
}

// ── VWAP (session reset on UTC day boundary) ───────────────────────────────

export function calcVwap(klines: readonly KlineLike[]): LinePoint[] {
  const out: LinePoint[] = [];
  let cumPV = 0;
  let cumVol = 0;
  let lastDay = -1;
  for (const b of klines) {
    const day = Math.floor(b.time / 86400);
    if (day !== lastDay) { cumPV = 0; cumVol = 0; lastDay = day; }
    const typical = (b.high + b.low + b.close) / 3;
    cumPV += typical * b.volume;
    cumVol += b.volume;
    if (cumVol > 0) out.push({ time: b.time, value: cumPV / cumVol });
  }
  return out;
}

// ── ATR Bands (overlay — price ± N*ATR) ────────────────────────────────────

export function calcAtrBands(klines: readonly KlineLike[], period = 14, mult = 2): BbPoint[] {
  if (klines.length < period + 1) return [];
  const atrs: number[] = [Math.abs(klines[1].high - klines[1].low)];
  for (let i = 2; i < klines.length; i++) {
    const tr = Math.max(
      klines[i].high - klines[i].low,
      Math.abs(klines[i].high - klines[i - 1].close),
      Math.abs(klines[i].low - klines[i - 1].close),
    );
    atrs.push(atrs[atrs.length - 1] * ((period - 1) / period) + tr / period);
  }
  const out: BbPoint[] = [];
  for (let i = period; i < klines.length; i++) {
    const mid = klines[i].close;
    const atr = atrs[i - 1];
    out.push({ time: klines[i].time, upper: mid + mult * atr, middle: mid, lower: mid - mult * atr });
  }
  return out;
}

// ── RSI (Wilder's RMA) ─────────────────────────────────────────────────────

export function calcRsi(klines: readonly KlineLike[], period = 14): LinePoint[] {
  if (klines.length < period + 1) return [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const d = klines[i].close - klines[i - 1].close;
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  // Wilder smoothing (RMA)
  let avgGain = gains.slice(0, period).reduce((s, v) => s + v, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((s, v) => s + v, 0) / period;
  const out: LinePoint[] = [];
  const rsi0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  out.push({ time: klines[period].time, value: rsi0 });
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    out.push({ time: klines[i + 1].time, value: rsi });
  }
  return out.filter((p) => isFinite(p.value));
}

// ── MACD ──────────────────────────────────────────────────────────────────

export function calcMacd(
  klines: readonly KlineLike[],
  fast = 12,
  slow = 26,
  signal = 9,
): MacdPoint[] {
  if (klines.length < slow + signal) return [];
  const fastEma = calcEmaRaw(klines, fast);
  const slowEma = calcEmaRaw(klines, slow);
  const macdLine = slowEma.map((v, i) => ({ time: v.time, value: fastEma[fastEma.length - slowEma.length + i].value - v.value }));
  const signalLine = calcEmaFromPoints(macdLine, signal);
  return signalLine.map((sig, i) => {
    const mac = macdLine[macdLine.length - signalLine.length + i].value;
    return { time: sig.time, macd: mac, signal: sig.value, hist: mac - sig.value };
  });
}

function calcEmaRaw(klines: readonly KlineLike[], period: number): LinePoint[] {
  const k = 2 / (period + 1);
  let ema = klines.slice(0, period).reduce((s, b) => s + b.close, 0) / period;
  const out: LinePoint[] = [{ time: klines[period - 1].time, value: ema }];
  for (let i = period; i < klines.length; i++) {
    ema = klines[i].close * k + ema * (1 - k);
    out.push({ time: klines[i].time, value: ema });
  }
  return out;
}

function calcEmaFromPoints(pts: LinePoint[], period: number): LinePoint[] {
  if (pts.length < period) return [];
  const k = 2 / (period + 1);
  let ema = pts.slice(0, period).reduce((s, p) => s + p.value, 0) / period;
  const out: LinePoint[] = [{ time: pts[period - 1].time, value: ema }];
  for (let i = period; i < pts.length; i++) {
    ema = pts[i].value * k + ema * (1 - k);
    out.push({ time: pts[i].time, value: ema });
  }
  return out;
}
