// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Indicator Engine (pure functions)
// ═══════════════════════════════════════════════════════════════

type NumArray = number[];

function fill(length: number, value = Number.NaN): NumArray {
  return Array.from({ length }, () => value);
}

function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : Number.NaN;
}

export function calcSMA(values: NumArray, period: number): NumArray {
  const out = fill(values.length);
  if (!Number.isFinite(period) || period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = safeNumber(values[i]);
    if (!Number.isFinite(v)) continue;
    sum += v;
    if (i >= period) sum -= safeNumber(values[i - period]) || 0;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function calcEMA(values: NumArray, period: number): NumArray {
  const out = fill(values.length);
  if (!Number.isFinite(period) || period <= 0 || values.length === 0) return out;
  const k = 2 / (period + 1);
  let ema = Number.NaN;
  for (let i = 0; i < values.length; i += 1) {
    const v = safeNumber(values[i]);
    if (!Number.isFinite(v)) continue;
    if (!Number.isFinite(ema)) {
      ema = v;
    } else {
      ema = v * k + ema * (1 - k);
    }
    out[i] = ema;
  }
  return out;
}

export function calcRSI(values: NumArray, period = 14): NumArray {
  const out = fill(values.length);
  if (!Number.isFinite(period) || period <= 0 || values.length < period + 1) return out;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = safeNumber(values[i]) - safeNumber(values[i - 1]);
    if (delta > 0) gains += delta;
    else losses -= delta;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i += 1) {
    const delta = safeNumber(values[i]) - safeNumber(values[i - 1]);
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return out;
}

export function calcATR(
  highs: NumArray,
  lows: NumArray,
  closes: NumArray,
  period = 14
): NumArray {
  const len = Math.min(highs.length, lows.length, closes.length);
  const out = fill(len);
  if (len < period + 1 || period <= 0) return out;

  const tr = fill(len, 0);
  for (let i = 1; i < len; i += 1) {
    const h = safeNumber(highs[i]);
    const l = safeNumber(lows[i]);
    const prevClose = safeNumber(closes[i - 1]);
    tr[i] = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
  }

  let first = 0;
  for (let i = 1; i <= period; i += 1) first += tr[i];
  let atr = first / period;
  out[period] = atr;

  for (let i = period + 1; i < len; i += 1) {
    atr = (atr * (period - 1) + tr[i]) / period;
    out[i] = atr;
  }

  return out;
}

export function calcOBV(closes: NumArray, volumes: NumArray): NumArray {
  const len = Math.min(closes.length, volumes.length);
  const out = fill(len, 0);
  if (len === 0) return out;

  let obv = 0;
  out[0] = 0;
  for (let i = 1; i < len; i += 1) {
    const close = safeNumber(closes[i]);
    const prev = safeNumber(closes[i - 1]);
    const vol = safeNumber(volumes[i]);
    if (close > prev) obv += vol;
    else if (close < prev) obv -= vol;
    out[i] = obv;
  }
  return out;
}

export function calcMACD(
  values: NumArray,
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { macd: NumArray; signal: NumArray; histogram: NumArray } {
  const fast = calcEMA(values, fastPeriod);
  const slow = calcEMA(values, slowPeriod);
  const macd = fill(values.length);
  for (let i = 0; i < values.length; i += 1) {
    const a = fast[i];
    const b = slow[i];
    macd[i] = Number.isFinite(a) && Number.isFinite(b) ? a - b : Number.NaN;
  }

  const signal = calcEMA(macd.map((v) => (Number.isFinite(v) ? v : 0)), signalPeriod);
  const histogram = fill(values.length);
  for (let i = 0; i < values.length; i += 1) {
    const m = macd[i];
    const s = signal[i];
    histogram[i] = Number.isFinite(m) && Number.isFinite(s) ? m - s : Number.NaN;
  }
  return { macd, signal, histogram };
}

export function calcCVD(closes: NumArray, volumes: NumArray): NumArray {
  const len = Math.min(closes.length, volumes.length);
  const out = fill(len, 0);
  if (len === 0) return out;

  let cvd = 0;
  for (let i = 1; i < len; i += 1) {
    const delta = safeNumber(closes[i]) - safeNumber(closes[i - 1]);
    const vol = safeNumber(volumes[i]);
    if (delta > 0) cvd += vol;
    else if (delta < 0) cvd -= vol;
    out[i] = cvd;
  }
  return out;
}

export function calcBollingerBands(
  values: NumArray,
  period = 20,
  stdMult = 2
): { middle: NumArray; upper: NumArray; lower: NumArray } {
  const len = values.length;
  const middle = calcSMA(values, period);
  const upper = fill(len);
  const lower = fill(len);

  if (period <= 0 || len < period) return { middle, upper, lower };

  for (let i = period - 1; i < len; i += 1) {
    const slice = values.slice(i - period + 1, i + 1).map(safeNumber);
    const mean = middle[i];
    const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period;
    const std = Math.sqrt(Math.max(variance, 0));
    upper[i] = mean + std * stdMult;
    lower[i] = mean - std * stdMult;
  }

  return { middle, upper, lower };
}
