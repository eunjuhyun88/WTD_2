/**
 * Pure indicator math — no I/O, no caching, no types imported from elsewhere.
 * All functions take number arrays and return number arrays or typed point arrays.
 */

export interface TimePoint { time: number; value: number }
export interface MacdPoint { time: number; macd: number; signal: number; hist: number }

export function sma(values: number[], times: number[], period: number): TimePoint[] {
  const out: TimePoint[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out.push({ time: times[i], value: sum / period });
  }
  return out;
}

export function emaValues(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(NaN); continue; }
    if (i === period - 1) { out.push(prev); continue; }
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function emaPoints(
  bars: { time: number; close: number }[],
  period: number,
): TimePoint[] {
  const k = 2 / (period + 1);
  const out: TimePoint[] = [];
  let prev: number | null = null;
  for (const bar of bars) {
    if (!Number.isFinite(bar.close)) continue;
    prev = prev == null ? bar.close : bar.close * k + prev * (1 - k);
    out.push({ time: bar.time, value: prev });
  }
  return out;
}

export function bollingerBands(
  values: number[],
  times: number[],
  period: number,
  mult: number,
): { upper: TimePoint[]; lower: TimePoint[] } {
  const upper: TimePoint[] = [];
  const lower: TimePoint[] = [];
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    sumSq += values[i] * values[i];
    if (i >= period) {
      sum -= values[i - period];
      sumSq -= values[i - period] * values[i - period];
    }
    if (i >= period - 1) {
      const mean = sum / period;
      const std = Math.sqrt(Math.max(0, sumSq / period - mean * mean));
      upper.push({ time: times[i], value: mean + std * mult });
      lower.push({ time: times[i], value: mean - std * mult });
    }
  }
  return { upper, lower };
}

export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  times: number[],
  period: number,
): TimePoint[] {
  const out: TimePoint[] = [];
  let sum = 0;
  const trs: number[] = highs.map((h, i) => {
    const prevC = i > 0 ? closes[i - 1] : closes[i];
    return Math.max(h - lows[i], Math.abs(h - prevC), Math.abs(lows[i] - prevC));
  });
  for (let i = 0; i < trs.length; i++) {
    sum += trs[i];
    if (i >= period) sum -= trs[i - period];
    if (i >= period - 1) out.push({ time: times[i], value: sum / period });
  }
  return out;
}

export function vwap(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  times: number[],
): TimePoint[] {
  const out: TimePoint[] = [];
  let cumTPV = 0;
  let cumVol = 0;
  for (let i = 0; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumTPV += tp * volumes[i];
    cumVol += volumes[i];
    if (cumVol > 0) out.push({ time: times[i], value: cumTPV / cumVol });
  }
  return out;
}

export function rsi(closes: number[], times: number[], period: number): TimePoint[] {
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const diff = i === 0 ? 0 : closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  const out: TimePoint[] = [];
  let gSum = 0;
  let lSum = 0;
  for (let i = 0; i < closes.length; i++) {
    gSum += gains[i];
    lSum += losses[i];
    if (i >= period) { gSum -= gains[i - period]; lSum -= losses[i - period]; }
    if (i >= period - 1) {
      const rs = lSum === 0 ? 100 : gSum / lSum;
      out.push({ time: times[i], value: 100 - 100 / (1 + rs) });
    }
  }
  return out;
}

export function macd(closes: number[], times: number[]): MacdPoint[] {
  const e12 = emaValues(closes, 12);
  const e26 = emaValues(closes, 26);
  const line = e12.map((v, i) => (isNaN(v) || isNaN(e26[i]) ? NaN : v - e26[i]));
  const valid = line.filter((v) => !isNaN(v));
  const signal = emaValues(valid, 9);
  const out: MacdPoint[] = [];
  let sIdx = 0;
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(line[i])) continue;
    const sig = signal[sIdx++] ?? NaN;
    if (!isNaN(sig)) out.push({ time: times[i], macd: line[i], signal: sig, hist: line[i] - sig });
  }
  return out;
}
