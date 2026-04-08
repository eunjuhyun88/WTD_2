// ═══════════════════════════════════════════════════════════════
// L3: V-Surge — Volume Anomaly Detection (±15)
// ═══════════════════════════════════════════════════════════════
// Always uses 5-min candles regardless of selected timeframe.
// Compares recent 5-bar volume against 30-day average.
// Directional — surge up or down matters.

import type { L3Result } from '../types';

interface MiniCandle {
  open: number;
  close: number;
  volume: number;
}

export function computeL3VSurge(
  candles: MiniCandle[],
): L3Result {
  const none: L3Result = { v_surge: false, surge_factor: 0, direction: 0, score: 0, label: 'NO DATA' };

  if (candles.length < 35) return none;

  // Recent 5 candles vs older average
  const recent = candles.slice(-5);
  const older = candles.slice(-35, -5);

  const recVol = recent.reduce((s, c) => s + c.volume, 0) / recent.length;
  const avgVol = older.reduce((s, c) => s + c.volume, 0) / older.length;

  if (avgVol <= 0) return none;

  const sf = recVol / avgVol;

  // Direction from price movement of recent 5 candles
  const dir = recent[recent.length - 1].close - recent[0].open;
  const dirSign = dir > 0 ? 1 : dir < 0 ? -1 : 0;

  let score = 0;
  let label = 'NORMAL';

  if (sf > 5) {
    score = dirSign > 0 ? 15 : dirSign < 0 ? -15 : 10;
    label = 'EXTREME SURGE';
  } else if (sf > 3) {
    score = dirSign > 0 ? 10 : dirSign < 0 ? -10 : 6;
    label = 'STRONG SURGE';
  } else if (sf > 1.8) {
    score = dirSign > 0 ? 6 : dirSign < 0 ? -6 : 3;
    label = 'SURGE';
  } else if (sf > 1.3) {
    score = dirSign > 0 ? 3 : dirSign < 0 ? -3 : 1;
    label = 'MODERATE';
  } else if (sf < 0.35) {
    score = 3; // ultra low vol = energy building
    label = 'ULTRA LOW VOL';
  } else if (sf < 0.6) {
    score = 2;
    label = 'LOW VOL';
  } else {
    score = 0;
    label = 'NORMAL';
  }

  return {
    v_surge: sf > 1.8,
    surge_factor: Math.round(sf * 100) / 100,
    direction: dirSign,
    score,
    label,
  };
}
