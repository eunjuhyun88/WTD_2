export interface KlineLike {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartAnnotation {
  type: 'support' | 'resistance';
  price: number;
  price2?: number;
  time: number;
  time2?: number;
  strength?: number;
  label?: string;
}

export interface IndicatorSeries {
  bbUpper?: number[];
  bbMiddle?: number[];
  bbLower?: number[];
  ema20?: number[];
}

const SWING_LOOKBACK = 10;
const CLUSTER_TOLERANCE = 0.003;
const ROUND_NUMBER_STEP = 5_000;
const MAX_RESULTS = 8;

type RawLevel = {
  price: number;
  type: 'support' | 'resistance';
  touches: number;
  lastTouchTime: number;
  method: 'swing' | 'round';
};

function calcSMA(values: readonly number[], period: number): number[] {
  const out = Array.from({ length: values.length }, () => Number.NaN);
  if (!Number.isFinite(period) || period <= 0) return out;

  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function calcEMA(values: readonly number[], period: number): number[] {
  const out = Array.from({ length: values.length }, () => Number.NaN);
  if (!Number.isFinite(period) || period <= 0 || values.length === 0) return out;

  const k = 2 / (period + 1);
  let ema = Number.NaN;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!Number.isFinite(value)) continue;
    ema = Number.isFinite(ema) ? value * k + ema * (1 - k) : value;
    out[i] = ema;
  }
  return out;
}

function calcBollingerBands(
  values: readonly number[],
  period = 20,
  stdMult = 2,
): { middle: number[]; upper: number[]; lower: number[] } {
  const middle = calcSMA(values, period);
  const upper = Array.from({ length: values.length }, () => Number.NaN);
  const lower = Array.from({ length: values.length }, () => Number.NaN);

  if (period <= 0 || values.length < period) return { middle, upper, lower };

  for (let i = period - 1; i < values.length; i += 1) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const variance = slice.reduce((acc, value) => acc + (value - mean) ** 2, 0) / period;
    const std = Math.sqrt(Math.max(variance, 0));
    upper[i] = mean + std * stdMult;
    lower[i] = mean - std * stdMult;
  }

  return { middle, upper, lower };
}

function detectSwingLevels(klines: readonly KlineLike[]): RawLevel[] {
  const levels: RawLevel[] = [];
  if (klines.length < SWING_LOOKBACK * 2 + 1) return levels;

  const swingPrices: Array<{ price: number; time: number; kind: 'high' | 'low' }> = [];

  for (let i = SWING_LOOKBACK; i < klines.length - SWING_LOOKBACK; i += 1) {
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = 1; j <= SWING_LOOKBACK; j += 1) {
      if (klines[i].high <= klines[i - j].high || klines[i].high <= klines[i + j].high) {
        isSwingHigh = false;
      }
      if (klines[i].low >= klines[i - j].low || klines[i].low >= klines[i + j].low) {
        isSwingLow = false;
      }
    }

    if (isSwingHigh) swingPrices.push({ price: klines[i].high, time: klines[i].time, kind: 'high' });
    if (isSwingLow) swingPrices.push({ price: klines[i].low, time: klines[i].time, kind: 'low' });
  }

  const clusters: Array<{
    prices: number[];
    times: number[];
    kinds: Set<'high' | 'low'>;
  }> = [];

  for (const swingPrice of swingPrices) {
    let merged = false;
    for (const cluster of clusters) {
      const avgPrice = cluster.prices.reduce((sum, price) => sum + price, 0) / cluster.prices.length;
      if (Math.abs(swingPrice.price - avgPrice) / avgPrice <= CLUSTER_TOLERANCE) {
        cluster.prices.push(swingPrice.price);
        cluster.times.push(swingPrice.time);
        cluster.kinds.add(swingPrice.kind);
        merged = true;
        break;
      }
    }

    if (!merged) {
      clusters.push({
        prices: [swingPrice.price],
        times: [swingPrice.time],
        kinds: new Set([swingPrice.kind]),
      });
    }
  }

  for (const cluster of clusters) {
    if (cluster.prices.length < 2) continue;

    const avgPrice = cluster.prices.reduce((sum, price) => sum + price, 0) / cluster.prices.length;
    const lastTime = Math.max(...cluster.times);
    const hasHigh = cluster.kinds.has('high');
    const hasLow = cluster.kinds.has('low');

    levels.push({
      price: Math.round(avgPrice * 100) / 100,
      type: hasHigh && !hasLow ? 'resistance' : 'support',
      touches: cluster.prices.length,
      lastTouchTime: lastTime,
      method: 'swing',
    });
  }

  return levels;
}

function detectRoundLevels(currentPrice: number): RawLevel[] {
  const levels: RawLevel[] = [];
  if (currentPrice <= 0) return levels;

  let step = ROUND_NUMBER_STEP;
  if (currentPrice < 1_000) step = 50;
  else if (currentPrice < 10_000) step = 500;
  else if (currentPrice < 50_000) step = 2_500;

  const low = currentPrice * 0.9;
  const high = currentPrice * 1.1;
  const firstRound = Math.ceil(low / step) * step;

  for (let price = firstRound; price <= high; price += step) {
    if (Math.abs(price - currentPrice) / currentPrice < 0.001) continue;
    const isLargeRound = price % (step * 2) === 0;
    levels.push({
      price,
      type: price < currentPrice ? 'support' : 'resistance',
      touches: isLargeRound ? 3 : 2,
      lastTouchTime: Math.floor(Date.now() / 1000),
      method: 'round',
    });
  }

  return levels;
}

function mergeAndClassify(
  swingLevels: readonly RawLevel[],
  roundLevels: readonly RawLevel[],
  currentPrice: number,
): ChartAnnotation[] {
  const allLevels = [...swingLevels, ...roundLevels].map((level) => ({
    ...level,
    type: level.price < currentPrice ? 'support' as const : 'resistance' as const,
  }));

  const merged: Array<RawLevel & { _strength?: number }> = [];
  const used = new Set<number>();

  for (let i = 0; i < allLevels.length; i += 1) {
    if (used.has(i)) continue;

    const level: RawLevel & { _strength?: number } = { ...allLevels[i] };
    for (let j = i + 1; j < allLevels.length; j += 1) {
      if (used.has(j)) continue;
      if (Math.abs(allLevels[j].price - level.price) / level.price <= CLUSTER_TOLERANCE) {
        level.price = (level.price + allLevels[j].price) / 2;
        level.touches += allLevels[j].touches;
        level.lastTouchTime = Math.max(level.lastTouchTime, allLevels[j].lastTouchTime);
        used.add(j);
      }
    }

    merged.push(level);
    used.add(i);
  }

  const maxTouches = Math.max(1, ...merged.map((level) => level.touches));
  for (const level of merged) {
    level._strength = Math.max(1, Math.min(5, Math.ceil((level.touches / maxTouches) * 5)));
  }

  merged.sort((left, right) => right.touches - left.touches);
  return merged.slice(0, MAX_RESULTS).map((level) => ({
    type: level.type,
    price: Math.round(level.price * 100) / 100,
    time: level.lastTouchTime,
    strength: level._strength,
    label: `${level.type === 'support' ? 'S' : 'R'} (${level.method}${level.touches > 1 ? `x${level.touches}` : ''})`,
  }));
}

export function computeIndicatorSeries(klines: readonly KlineLike[]): IndicatorSeries {
  if (klines.length < 20) return {};

  const closes = klines.map((kline) => kline.close);
  const bb = calcBollingerBands(closes, 20, 2);
  const ema20 = calcEMA(closes, 20);

  return {
    bbUpper: bb.upper,
    bbMiddle: bb.middle,
    bbLower: bb.lower,
    ema20,
  };
}

export function detectSupportResistance(
  klines: readonly KlineLike[],
  currentPrice: number,
): ChartAnnotation[] {
  if (klines.length < 30 || currentPrice <= 0) return [];

  const swingLevels = detectSwingLevels(klines);
  const roundLevels = detectRoundLevels(currentPrice);
  return mergeAndClassify(swingLevels, roundLevels, currentPrice);
}
