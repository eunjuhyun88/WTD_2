// ═══════════════════════════════════════════════════════════════
// L18: 5-Min Short-Term Momentum (±25)
// ═══════════════════════════════════════════════════════════════
// Analyzes 60 five-minute candles (5 hours).
// Computes 30-min return + volume acceleration.
// Catches real-time surges that longer timeframes miss.

import type { L18Result } from '../types';
import { Thresholds } from '../thresholds';

interface MiniCandle {
  open: number;
  close: number;
  volume: number;
}

export function computeL18Momentum(
  klines5m: MiniCandle[],
): L18Result {
  const none: L18Result = { momentum_30m: 0, vol_accel: 0, score: 0, label: 'NO DATA' };

  if (klines5m.length < 12) return none;

  const recent = klines5m.slice(-60); // up to 60 bars (5 hours)
  if (recent.length < 12) return none;

  // 30-min return (last 6 candles = 30 min)
  const last6 = recent.slice(-6);
  const priceStart = last6[0].open;
  const priceEnd = last6[last6.length - 1].close;
  const momentum30m = priceStart > 0 ? ((priceEnd - priceStart) / priceStart) * 100 : 0;

  // Volume acceleration: recent 6-bar avg vs older 24-bar avg
  const recentVol = last6.reduce((s, c) => s + c.volume, 0) / last6.length;
  const older = recent.slice(-30, -6);
  const olderVol = older.length > 0
    ? older.reduce((s, c) => s + c.volume, 0) / older.length
    : recentVol;
  const volAccel = olderVol > 0 ? recentVol / olderVol : 1;

  let score = 0;
  let label = 'FLAT';

  // Strong momentum: +5% in 30min with 3x volume
  if (momentum30m > Thresholds.momentum.momentum_extreme_pct && volAccel > Thresholds.momentum.vol_accel_extreme) {
    score = Thresholds.momentum.score_extreme;
    label = 'EXTREME SURGE UP';
  } else if (momentum30m > Thresholds.momentum.momentum_strong_pct && volAccel > Thresholds.momentum.vol_accel_strong) {
    score = Thresholds.momentum.score_strong;
    label = 'STRONG SURGE UP';
  } else if (momentum30m > Thresholds.momentum.momentum_surge_pct && volAccel > Thresholds.momentum.vol_accel_surge) {
    score = Thresholds.momentum.score_surge;
    label = 'SURGE UP';
  } else if (momentum30m > Thresholds.momentum.momentum_mild_pct && volAccel > Thresholds.momentum.vol_accel_mild) {
    score = Thresholds.momentum.score_mild;
    label = 'MILD UP';
  } else if (momentum30m < -Thresholds.momentum.momentum_extreme_pct && volAccel > Thresholds.momentum.vol_accel_extreme) {
    score = -Thresholds.momentum.score_extreme;
    label = 'EXTREME DUMP';
  } else if (momentum30m < -Thresholds.momentum.momentum_strong_pct && volAccel > Thresholds.momentum.vol_accel_strong) {
    score = -Thresholds.momentum.score_strong;
    label = 'STRONG DUMP';
  } else if (momentum30m < -Thresholds.momentum.momentum_surge_pct && volAccel > Thresholds.momentum.vol_accel_surge) {
    score = -Thresholds.momentum.score_surge;
    label = 'DUMP';
  } else if (momentum30m < -Thresholds.momentum.momentum_mild_pct && volAccel > Thresholds.momentum.vol_accel_mild) {
    score = -Thresholds.momentum.score_mild;
    label = 'MILD DOWN';
  }

  return {
    momentum_30m: Math.round(momentum30m * 100) / 100,
    vol_accel: Math.round(volAccel * 100) / 100,
    score,
    label,
  };
}
