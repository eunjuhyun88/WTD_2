// ═══════════════════════════════════════════════════════════════
// COGOCHI — Support/Resistance Detection
// ═══════════════════════════════════════════════════════════════
// Swing-point + round-number method.
// Returns up to 8 S/R levels sorted by strength descending.

import type { BinanceKline } from '$lib/engine/types';
import type { ChartAnnotation } from './types';

// ─── Config ─────────────────────────────────────────────────

const SWING_LOOKBACK = 10;          // candles each side for swing detection
const CLUSTER_TOLERANCE = 0.003;    // 0.3% price distance for clustering
const ROUND_NUMBER_STEP = 5_000;    // $5K intervals for BTC-class assets
const MAX_RESULTS = 8;

// ─── Helpers ────────────────────────────────────────────────

interface RawLevel {
  price: number;
  type: 'support' | 'resistance';
  touches: number;
  lastTouchTime: number;
  method: 'swing' | 'round';
}

function computeATR(klines: BinanceKline[], period = 14): number {
  if (klines.length < period + 1) return 0;
  let atrSum = 0;
  for (let i = klines.length - period; i < klines.length; i++) {
    const prev = klines[i - 1];
    const curr = klines[i];
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close),
    );
    atrSum += tr;
  }
  return atrSum / period;
}

// ─── Swing Point Method ──────────────────────────────────────

function detectSwingLevels(klines: BinanceKline[]): RawLevel[] {
  const levels: RawLevel[] = [];
  if (klines.length < SWING_LOOKBACK * 2 + 1) return levels;

  // Find swing highs and swing lows
  const swingPrices: Array<{ price: number; time: number; kind: 'high' | 'low' }> = [];

  for (let i = SWING_LOOKBACK; i < klines.length - SWING_LOOKBACK; i++) {
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = 1; j <= SWING_LOOKBACK; j++) {
      if (klines[i].high <= klines[i - j].high || klines[i].high <= klines[i + j].high) {
        isSwingHigh = false;
      }
      if (klines[i].low >= klines[i - j].low || klines[i].low >= klines[i + j].low) {
        isSwingLow = false;
      }
    }

    if (isSwingHigh) {
      swingPrices.push({ price: klines[i].high, time: klines[i].time, kind: 'high' });
    }
    if (isSwingLow) {
      swingPrices.push({ price: klines[i].low, time: klines[i].time, kind: 'low' });
    }
  }

  // Cluster nearby swing points within tolerance
  const clusters: Array<{
    prices: number[];
    times: number[];
    kinds: Set<'high' | 'low'>;
  }> = [];

  for (const sp of swingPrices) {
    let merged = false;
    for (const cluster of clusters) {
      const avgPrice = cluster.prices.reduce((a, b) => a + b, 0) / cluster.prices.length;
      if (Math.abs(sp.price - avgPrice) / avgPrice <= CLUSTER_TOLERANCE) {
        cluster.prices.push(sp.price);
        cluster.times.push(sp.time);
        cluster.kinds.add(sp.kind);
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({
        prices: [sp.price],
        times: [sp.time],
        kinds: new Set([sp.kind]),
      });
    }
  }

  // Only keep clusters with 2+ touches
  for (const cluster of clusters) {
    if (cluster.prices.length < 2) continue;

    const avgPrice = cluster.prices.reduce((a, b) => a + b, 0) / cluster.prices.length;
    const lastTime = Math.max(...cluster.times);

    // Determine type based on relationship to current price (set later)
    // For now, use dominant kind
    const hasHigh = cluster.kinds.has('high');
    const hasLow = cluster.kinds.has('low');

    levels.push({
      price: Math.round(avgPrice * 100) / 100,
      type: hasHigh && !hasLow ? 'resistance' : hasLow && !hasHigh ? 'support' : 'support',
      touches: cluster.prices.length,
      lastTouchTime: lastTime,
      method: 'swing',
    });
  }

  return levels;
}

// ─── Round Number Method ─────────────────────────────────────

function detectRoundLevels(currentPrice: number, atr: number): RawLevel[] {
  const levels: RawLevel[] = [];
  if (currentPrice <= 0) return levels;

  // Determine step based on price magnitude and ATR
  // For BTC (~$60K-$100K), $5K steps. Scale for smaller assets.
  let step = ROUND_NUMBER_STEP;
  if (currentPrice < 1000) step = 50;
  else if (currentPrice < 10_000) step = 500;
  else if (currentPrice < 50_000) step = 2_500;

  // Find round numbers within a range of +/- 10% of current price
  const rangePct = 0.10;
  const low = currentPrice * (1 - rangePct);
  const high = currentPrice * (1 + rangePct);

  const firstRound = Math.ceil(low / step) * step;
  for (let price = firstRound; price <= high; price += step) {
    // Skip if too close to current price (within 0.1%)
    if (Math.abs(price - currentPrice) / currentPrice < 0.001) continue;

    // $10K multiples get higher strength
    const is10kMultiple = price % (step * 2) === 0;
    const strength = is10kMultiple ? 3 : 2;

    levels.push({
      price,
      type: price < currentPrice ? 'support' : 'resistance',
      touches: strength, // use strength as pseudo-touch count
      lastTouchTime: Math.floor(Date.now() / 1000),
      method: 'round',
    });
  }

  return levels;
}

// ─── Merge & Classify ────────────────────────────────────────

function mergeAndClassify(
  swingLevels: RawLevel[],
  roundLevels: RawLevel[],
  currentPrice: number,
): ChartAnnotation[] {
  // Combine all levels
  const allLevels = [...swingLevels, ...roundLevels];

  // Reclassify type based on current price
  for (const level of allLevels) {
    level.type = level.price < currentPrice ? 'support' : 'resistance';
  }

  // Merge swing and round levels that are close together
  const merged: RawLevel[] = [];
  const used = new Set<number>();

  for (let i = 0; i < allLevels.length; i++) {
    if (used.has(i)) continue;
    const level = { ...allLevels[i] };

    for (let j = i + 1; j < allLevels.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(allLevels[j].price - level.price) / level.price <= CLUSTER_TOLERANCE) {
        // Merge: take average price, sum touches, keep latest time
        level.price = (level.price + allLevels[j].price) / 2;
        level.touches += allLevels[j].touches;
        level.lastTouchTime = Math.max(level.lastTouchTime, allLevels[j].lastTouchTime);
        used.add(j);
      }
    }

    merged.push(level);
    used.add(i);
  }

  // Compute strength (1-5) from touches
  const maxTouches = Math.max(1, ...merged.map(l => l.touches));
  for (const level of merged) {
    (level as any)._strength = Math.max(1, Math.min(5, Math.ceil((level.touches / maxTouches) * 5)));
  }

  // Sort by strength descending, take top MAX_RESULTS
  merged.sort((a, b) => b.touches - a.touches);
  const top = merged.slice(0, MAX_RESULTS);

  // Convert to ChartAnnotation
  return top.map(l => ({
    type: l.type,
    price: Math.round(l.price * 100) / 100,
    time: l.lastTouchTime,
    strength: (l as any)._strength as number,
    label: `${l.type === 'support' ? 'S' : 'R'} (${l.method}${l.touches > 1 ? 'x' + l.touches : ''})`,
  }));
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Detect support and resistance levels from klines.
 * Uses swing-point clustering + round-number methods.
 * Returns up to 8 levels sorted by strength descending.
 */
export function detectSupportResistance(
  klines: BinanceKline[],
  currentPrice: number,
): ChartAnnotation[] {
  if (klines.length < 30 || currentPrice <= 0) return [];

  const atr = computeATR(klines);
  const swingLevels = detectSwingLevels(klines);
  const roundLevels = detectRoundLevels(currentPrice, atr);

  return mergeAndClassify(swingLevels, roundLevels, currentPrice);
}
