type NumArray = number[];
type Pivot = { index: number; value: number };

export type TrendDirection = 'RISING' | 'FALLING' | 'FLAT';

export interface TrendAnalysis {
  direction: TrendDirection;
  slope: number;
  acceleration: number;
  strength: number;
  duration: number;
  fromValue: number;
  toValue: number;
  changePct: number;
}

export type DivergenceType =
  | 'BULLISH_DIV'
  | 'BEARISH_DIV'
  | 'HIDDEN_BULL'
  | 'HIDDEN_BEAR'
  | 'NONE';

export interface DivergenceSignal {
  type: DivergenceType;
  indicator: string;
  priceAction: 'HH' | 'HL' | 'LH' | 'LL';
  indicatorAction: 'HH' | 'HL' | 'LH' | 'LL';
  confidence: number;
  detail: string;
}

function fill(length: number, value = Number.NaN): NumArray {
  return Array.from({ length }, () => value);
}

function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : Number.NaN;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNum(value: number): boolean {
  return Number.isFinite(value);
}

function safeSeries(values: number[]): number[] {
  return values.filter(isFiniteNum);
}

function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i += 1) {
    const x = i;
    const y = values[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function toDirection(slope: number): TrendDirection {
  if (slope > 0.005) return 'RISING';
  if (slope < -0.005) return 'FALLING';
  return 'FLAT';
}

function toHighAction(prev: number, next: number): 'HH' | 'LH' {
  return next >= prev ? 'HH' : 'LH';
}

function toLowAction(prev: number, next: number): 'HL' | 'LL' {
  return next >= prev ? 'HL' : 'LL';
}

function findPivots(values: number[], mode: 'high' | 'low', need = 2): Pivot[] {
  const out: Pivot[] = [];
  for (let i = values.length - 2; i >= 1; i -= 1) {
    const prev = values[i - 1];
    const curr = values[i];
    const next = values[i + 1];
    const hit = mode === 'high' ? curr >= prev && curr >= next : curr <= prev && curr <= next;
    if (!hit) continue;
    out.push({ index: i, value: curr });
    if (out.length >= need) break;
  }
  return out.reverse();
}

function buildNoneDivergence(): DivergenceSignal {
  return {
    type: 'NONE',
    indicator: 'GENERIC',
    priceAction: 'HH',
    indicatorAction: 'HH',
    confidence: 0,
    detail: 'No divergence detected.',
  };
}

export function calcSMA(values: NumArray, period: number): NumArray {
  const out = fill(values.length);
  if (!Number.isFinite(period) || period <= 0) return out;

  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = safeNumber(values[i]);
    if (!Number.isFinite(value)) continue;
    sum += value;
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
    const value = safeNumber(values[i]);
    if (!Number.isFinite(value)) continue;
    ema = Number.isFinite(ema) ? value * k + ema * (1 - k) : value;
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
  period = 14,
): NumArray {
  const len = Math.min(highs.length, lows.length, closes.length);
  const out = fill(len);
  if (len < period + 1 || period <= 0) return out;

  const tr = fill(len, 0);
  for (let i = 1; i < len; i += 1) {
    const high = safeNumber(highs[i]);
    const low = safeNumber(lows[i]);
    const prevClose = safeNumber(closes[i - 1]);
    tr[i] = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
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

export function calcMACD(
  values: NumArray,
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): { macd: NumArray; signal: NumArray; histogram: NumArray } {
  const fast = calcEMA(values, fastPeriod);
  const slow = calcEMA(values, slowPeriod);
  const macd = fill(values.length);
  for (let i = 0; i < values.length; i += 1) {
    const a = fast[i];
    const b = slow[i];
    macd[i] = Number.isFinite(a) && Number.isFinite(b) ? a - b : Number.NaN;
  }

  const signal = calcEMA(macd.map((value) => (Number.isFinite(value) ? value : 0)), signalPeriod);
  const histogram = fill(values.length);
  for (let i = 0; i < values.length; i += 1) {
    const macdValue = macd[i];
    const signalValue = signal[i];
    histogram[i] = Number.isFinite(macdValue) && Number.isFinite(signalValue)
      ? macdValue - signalValue
      : Number.NaN;
  }
  return { macd, signal, histogram };
}

export function analyzeTrend(values: number[]): TrendAnalysis {
  const series = safeSeries(values);
  if (series.length < 3) {
    const first = series[0] ?? 0;
    const last = series[series.length - 1] ?? first;
    return {
      direction: 'FLAT',
      slope: 0,
      acceleration: 0,
      strength: 0,
      duration: series.length,
      fromValue: first,
      toValue: last,
      changePct: 0,
    };
  }

  const window = series.slice(-Math.min(series.length, 64));
  const first = window[0];
  const last = window[window.length - 1];
  const avgAbs = window.reduce((sum, value) => sum + Math.abs(value), 0) / window.length || 1;
  const slopeRaw = linearSlope(window);
  const slope = clamp((slopeRaw / avgAbs) * 100, -1, 1);
  const half = Math.max(2, Math.floor(window.length / 2));
  const firstSlope = linearSlope(window.slice(0, half));
  const secondSlope = linearSlope(window.slice(-half));
  const acceleration = clamp(((secondSlope - firstSlope) / avgAbs) * 100, -1, 1);
  const changePct = first === 0 ? 0 : ((last - first) / Math.abs(first)) * 100;
  const direction = toDirection(slope);
  const strength = clamp(Math.abs(slope) * 180 + Math.abs(changePct) * 0.7, 0, 100);

  let duration = 1;
  if (direction !== 'FLAT') {
    for (let i = window.length - 1; i >= 1; i -= 1) {
      const delta = window[i] - window[i - 1];
      if ((direction === 'RISING' && delta >= 0) || (direction === 'FALLING' && delta <= 0)) {
        duration += 1;
      } else {
        break;
      }
    }
  }

  return {
    direction,
    slope,
    acceleration,
    strength,
    duration,
    fromValue: first,
    toValue: last,
    changePct,
  };
}

export function detectDivergence(prices: number[], indicator: number[]): DivergenceSignal {
  const len = Math.min(prices.length, indicator.length);
  if (len < 8) return buildNoneDivergence();

  const p = prices.slice(-Math.min(len, 96));
  const i = indicator.slice(-Math.min(len, 96));
  const priceHighs = findPivots(p, 'high', 2);
  const indHighs = findPivots(i, 'high', 2);
  const priceLows = findPivots(p, 'low', 2);
  const indLows = findPivots(i, 'low', 2);

  if (priceHighs.length >= 2 && indHighs.length >= 2) {
    const priceAction = toHighAction(priceHighs[0].value, priceHighs[1].value);
    const indicatorAction = toHighAction(indHighs[0].value, indHighs[1].value);
    if (priceAction === 'HH' && indicatorAction === 'LH') {
      const priceDeltaPct = priceHighs[0].value !== 0
        ? Math.abs((priceHighs[1].value - priceHighs[0].value) / priceHighs[0].value) * 100
        : 0;
      const indDeltaPct = indHighs[0].value !== 0
        ? Math.abs((indHighs[1].value - indHighs[0].value) / indHighs[0].value) * 100
        : 0;
      return {
        type: 'BEARISH_DIV',
        indicator: 'GENERIC',
        priceAction: 'HH',
        indicatorAction: 'LL',
        confidence: clamp(priceDeltaPct * 4 + indDeltaPct * 6, 15, 90),
        detail: 'Price made a higher-high while indicator failed to confirm.',
      };
    }
    if (priceAction === 'LH' && indicatorAction === 'HH') {
      const priceDeltaPct = priceHighs[0].value !== 0
        ? Math.abs((priceHighs[1].value - priceHighs[0].value) / priceHighs[0].value) * 100
        : 0;
      const indDeltaPct = indHighs[0].value !== 0
        ? Math.abs((indHighs[1].value - indHighs[0].value) / indHighs[0].value) * 100
        : 0;
      return {
        type: 'HIDDEN_BEAR',
        indicator: 'GENERIC',
        priceAction: 'LH',
        indicatorAction: 'HH',
        confidence: clamp(priceDeltaPct * 4 + indDeltaPct * 6, 15, 90),
        detail: 'Hidden bearish divergence detected.',
      };
    }
  }

  if (priceLows.length >= 2 && indLows.length >= 2) {
    const priceAction = toLowAction(priceLows[0].value, priceLows[1].value);
    const indicatorAction = toLowAction(indLows[0].value, indLows[1].value);
    if (priceAction === 'LL' && indicatorAction === 'HL') {
      const priceDeltaPct = priceLows[0].value !== 0
        ? Math.abs((priceLows[1].value - priceLows[0].value) / priceLows[0].value) * 100
        : 0;
      const indDeltaPct = indLows[0].value !== 0
        ? Math.abs((indLows[1].value - indLows[0].value) / indLows[0].value) * 100
        : 0;
      return {
        type: 'BULLISH_DIV',
        indicator: 'GENERIC',
        priceAction: 'LL',
        indicatorAction: 'HL',
        confidence: clamp(priceDeltaPct * 4 + indDeltaPct * 6, 15, 90),
        detail: 'Price made a lower-low while indicator formed a higher-low.',
      };
    }
    if (priceAction === 'HL' && indicatorAction === 'LL') {
      const priceDeltaPct = priceLows[0].value !== 0
        ? Math.abs((priceLows[1].value - priceLows[0].value) / priceLows[0].value) * 100
        : 0;
      const indDeltaPct = indLows[0].value !== 0
        ? Math.abs((indLows[1].value - indLows[0].value) / indLows[0].value) * 100
        : 0;
      return {
        type: 'HIDDEN_BULL',
        indicator: 'GENERIC',
        priceAction: 'HL',
        indicatorAction: 'LL',
        confidence: clamp(priceDeltaPct * 4 + indDeltaPct * 6, 15, 90),
        detail: 'Hidden bullish divergence detected.',
      };
    }
  }

  return buildNoneDivergence();
}
