// ═══════════════════════════════════════════════════════════════
// L13: Breakout Detection — 7D/30D Range (±12)
// ═══════════════════════════════════════════════════════════════
// Always uses 1D candles to ensure correct 7D/30D calculation.
// Detects new highs, new lows, and proximity to range edges.

import type { L13Result } from '../types';
import { Thresholds } from '../thresholds';

interface DayCandle {
  high: number;
  low: number;
  close: number;
}

export function computeL13Breakout(
  dailyCandles: DayCandle[],
  currentPrice: number,
): L13Result {
  const none: L13Result = {
    breakout: false, pos_7d: 50, pos_30d: 50, score: 0, label: 'NO DATA',
  };

  if (dailyCandles.length < 7 || currentPrice <= 0) return none;

  const c7 = dailyCandles.slice(-7);
  const c30 = dailyCandles.length >= 30 ? dailyCandles.slice(-30) : dailyCandles;

  const h7 = Math.max(...c7.map(c => c.high));
  const l7 = Math.min(...c7.map(c => c.low));
  const h30 = Math.max(...c30.map(c => c.high));
  const l30 = Math.min(...c30.map(c => c.low));

  const range7 = h7 - l7 || 1;
  const range30 = h30 - l30 || 1;

  const pos7 = ((currentPrice - l7) / range7) * 100;
  const pos30 = ((currentPrice - l30) / range30) * 100;

  const cp = currentPrice;
  const break30High = cp > h30;
  const break7High = cp > h7;
  const near30High = cp > h30 * Thresholds.breakout.near_high_pct;
  const near7High = cp > h7 * Thresholds.breakout.near_high_pct;
  const near30Low = cp < l30 * Thresholds.breakout.near_low_pct;
  const near7Low = cp < l7 * Thresholds.breakout.near_low_pct;

  let score = 0;
  let label = 'RANGE';
  let breakout = false;

  if (break30High) {
    score = 12;
    label = '30D NEW HIGH';
    breakout = true;
  } else if (break7High) {
    score = 8;
    label = '7D NEW HIGH';
    breakout = true;
  } else if (near30High) {
    score = 6;
    label = '30D HIGH APPROACH';
  } else if (near7High) {
    score = 4;
    label = '7D HIGH APPROACH';
  } else if (cp < l30) {
    score = -12;
    label = '30D NEW LOW';
    breakout = true;
  } else if (cp < l7) {
    score = -8;
    label = '7D NEW LOW';
    breakout = true;
  } else if (near30Low) {
    score = -8;
    label = '30D LOW APPROACH';
  } else if (near7Low) {
    score = -4;
    label = '7D LOW APPROACH';
  }

  return {
    breakout,
    pos_7d: Math.round(pos7 * 10) / 10,
    pos_30d: Math.round(pos30 * 10) / 10,
    score,
    label,
  };
}
