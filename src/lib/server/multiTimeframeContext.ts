import { calcATR, calcEMA, calcMACD, calcRSI, calcSMA } from '$lib/engine/indicators';
import type { BinanceKline } from '$lib/engine/types';
import { fetchKlinesServer, pairToSymbol } from '$lib/server/binance';
import { getCached, setCache } from '$lib/server/providers/cache';

export type TradingBias = 'long' | 'short' | 'neutral';

interface TimeframeConfig {
  interval: '1h' | '4h' | '1d' | '1w' | '1M';
  label: '1H' | '4H' | '1D' | '1W' | '1M';
  weight: number;
  limit: number;
}

const TIMEFRAMES: readonly TimeframeConfig[] = [
  { interval: '1h', label: '1H', weight: 0.15, limit: 160 },
  { interval: '4h', label: '4H', weight: 0.25, limit: 160 },
  { interval: '1d', label: '1D', weight: 0.30, limit: 160 },
  { interval: '1w', label: '1W', weight: 0.20, limit: 160 },
  { interval: '1M', label: '1M', weight: 0.10, limit: 160 },
] as const;

const MIN_BARS = 80;
const CONTEXT_CACHE_TTL_MS = 20_000;

export interface TimeframeIndicatorSnapshot {
  timeframe: TimeframeConfig['label'];
  close: number;
  changePct: number;
  ema20: number;
  ema60: number;
  emaTrend: 'bullish' | 'bearish' | 'flat';
  rsi14: number;
  rsiState: 'overbought' | 'oversold' | 'neutral';
  macdHistogram: number;
  macdState: 'bullish' | 'bearish' | 'flat';
  atrPct: number;
  volumeRatio20: number;
  bias: TradingBias;
  confidence: number;
  score: number;
}

export interface MultiTimeframeIndicatorContext {
  pair: string;
  symbol: string;
  generatedAtIso: string;
  consensusBias: TradingBias;
  consensusConfidence: number;
  alignmentPct: number;
  weightedScore: number;
  snapshots: TimeframeIndicatorSnapshot[];
  summaryLine: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lastFinite(values: number[]): number {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(values[i])) return values[i];
  }
  return Number.NaN;
}

function previousFinite(values: number[]): number {
  let seen = 0;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (!Number.isFinite(value)) continue;
    seen += 1;
    if (seen === 2) return value;
  }
  return Number.NaN;
}

function toBias(score: number): TradingBias {
  if (score >= 12) return 'long';
  if (score <= -12) return 'short';
  return 'neutral';
}

function normalizePair(pair: string): string {
  const trimmed = String(pair || '').trim().toUpperCase();
  return trimmed || 'BTC/USDT';
}

function toSymbol(pair: string): string | null {
  const raw = pairToSymbol(pair).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{5,20}$/.test(raw)) return null;
  return raw;
}

function computeSnapshot(label: TimeframeConfig['label'], klines: BinanceKline[]): TimeframeIndicatorSnapshot | null {
  if (klines.length < MIN_BARS) return null;

  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const volumes = klines.map((k) => k.volume);

  const close = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2] ?? close;

  if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(prevClose) || prevClose <= 0) {
    return null;
  }

  const changePct = ((close - prevClose) / prevClose) * 100;

  const ema20 = lastFinite(calcEMA(closes, 20));
  const ema60 = lastFinite(calcEMA(closes, 60));
  if (!Number.isFinite(ema20) || !Number.isFinite(ema60)) return null;

  let emaTrend: TimeframeIndicatorSnapshot['emaTrend'] = 'flat';
  if (close > ema20 && ema20 >= ema60) emaTrend = 'bullish';
  else if (close < ema20 && ema20 <= ema60) emaTrend = 'bearish';

  const rsi14 = lastFinite(calcRSI(closes, 14));
  if (!Number.isFinite(rsi14)) return null;
  const rsiState: TimeframeIndicatorSnapshot['rsiState'] =
    rsi14 >= 70 ? 'overbought' : rsi14 <= 30 ? 'oversold' : 'neutral';

  const { histogram } = calcMACD(closes, 12, 26, 9);
  const macdHistogram = lastFinite(histogram);
  if (!Number.isFinite(macdHistogram)) return null;
  const prevHistogram = previousFinite(histogram);
  const macdSlope = Number.isFinite(prevHistogram) ? macdHistogram - prevHistogram : 0;

  let macdState: TimeframeIndicatorSnapshot['macdState'] = 'flat';
  if (macdHistogram > 0) macdState = 'bullish';
  else if (macdHistogram < 0) macdState = 'bearish';

  const atr14 = lastFinite(calcATR(highs, lows, closes, 14));
  const atrPct = Number.isFinite(atr14) && close > 0 ? (atr14 / close) * 100 : 0;

  const volume = volumes[volumes.length - 1] ?? 0;
  const volSma20 = lastFinite(calcSMA(volumes, 20));
  const volumeRatio20 = Number.isFinite(volSma20) && volSma20 > 0 ? volume / volSma20 : 1;

  let score = 0;

  if (emaTrend === 'bullish') score += 32;
  else if (emaTrend === 'bearish') score -= 32;

  score += clamp(changePct * 2.4, -14, 14);

  if (rsi14 <= 30) score += 15;
  else if (rsi14 >= 70) score -= 15;
  else score += clamp((rsi14 - 50) * 0.5, -10, 10);

  if (macdHistogram > 0) score += 16;
  else if (macdHistogram < 0) score -= 16;

  if (macdSlope > 0) score += 4;
  else if (macdSlope < 0) score -= 4;

  if (volumeRatio20 >= 1.35) {
    score += Math.sign(changePct) * 8;
  } else if (volumeRatio20 < 0.8) {
    score *= 0.9;
  }

  if (atrPct > 6) {
    score *= 0.92;
  }

  score = clamp(score, -100, 100);
  const bias = toBias(score);
  const confidence = Math.round(clamp(42 + Math.abs(score) * 0.55 + (volumeRatio20 >= 1 ? 6 : 0), 35, 95));

  return {
    timeframe: label,
    close,
    changePct,
    ema20,
    ema60,
    emaTrend,
    rsi14,
    rsiState,
    macdHistogram,
    macdState,
    atrPct,
    volumeRatio20,
    bias,
    confidence,
    score,
  };
}

interface WeightedSnapshot {
  weight: number;
  snapshot: TimeframeIndicatorSnapshot;
}

function buildContext(pair: string, symbol: string, rows: WeightedSnapshot[]): MultiTimeframeIndicatorContext | null {
  if (rows.length === 0) return null;

  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return null;

  const weightedScore = rows.reduce((sum, row) => sum + row.snapshot.score * row.weight, 0) / totalWeight;
  const consensusBias = toBias(weightedScore);

  const longWeight = rows.reduce((sum, row) => sum + (row.snapshot.bias === 'long' ? row.weight : 0), 0);
  const shortWeight = rows.reduce((sum, row) => sum + (row.snapshot.bias === 'short' ? row.weight : 0), 0);
  const neutralWeight = rows.reduce((sum, row) => sum + (row.snapshot.bias === 'neutral' ? row.weight : 0), 0);

  let alignmentPct = 0;
  if (consensusBias === 'neutral') {
    alignmentPct = Math.round(clamp((neutralWeight / totalWeight) * 100, 0, 100));
  } else {
    const alignedWeight = consensusBias === 'long' ? longWeight : shortWeight;
    alignmentPct = Math.round(clamp((alignedWeight / totalWeight) * 100, 0, 100));
  }

  const oppositionWeight = consensusBias === 'long' ? shortWeight : consensusBias === 'short' ? longWeight : 0;
  const consensusConfidence = Math.round(
    clamp(
      48 + Math.abs(weightedScore) * 0.6 + alignmentPct * 0.15 - oppositionWeight * 35,
      30,
      95
    )
  );

  const summaryLine = `MTF ${consensusBias.toUpperCase()} ${consensusConfidence}% | align ${alignmentPct}% | score ${weightedScore.toFixed(1)}`;

  return {
    pair,
    symbol,
    generatedAtIso: new Date().toISOString(),
    consensusBias,
    consensusConfidence,
    alignmentPct,
    weightedScore,
    snapshots: rows.map((row) => row.snapshot),
    summaryLine,
  };
}

export async function getMultiTimeframeIndicatorContext(inputPair: string): Promise<MultiTimeframeIndicatorContext | null> {
  const pair = normalizePair(inputPair);
  const symbol = toSymbol(pair);
  if (!symbol) return null;

  const cacheKey = `llm:mtf:${symbol}`;
  const cached = getCached<MultiTimeframeIndicatorContext>(cacheKey);
  if (cached) return cached;

  const settled = await Promise.all(
    TIMEFRAMES.map(async (tf) => {
      try {
        const klines = await fetchKlinesServer(symbol, tf.interval, tf.limit);
        const snapshot = computeSnapshot(tf.label, klines);
        if (!snapshot) return null;
        return { weight: tf.weight, snapshot } satisfies WeightedSnapshot;
      } catch {
        return null;
      }
    })
  );

  const rows = settled.filter((item): item is WeightedSnapshot => item !== null);
  const context = buildContext(pair, symbol, rows);
  if (!context) return null;

  setCache(cacheKey, context, CONTEXT_CACHE_TTL_MS);
  return context;
}
