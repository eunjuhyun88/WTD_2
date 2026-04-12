// ═══════════════════════════════════════════════════════════════
// L19: OI Acceleration — Position Surge Detection (±15)
// ═══════════════════════════════════════════════════════════════
// Uses 5-min OI snapshots (12 = 1 hour) to detect rapid
// position buildup. Distinguishes between:
// - New long entry (OI↑ + price↑)
// - Short squeeze (OI↓ + price↑)
// - Long panic (OI↓ + price↓)
// - New short entry (OI↑ + price↓)

import type { L19Result } from '../types';
import { Thresholds } from '../thresholds';

interface OIPoint {
  timestamp: number;
  oi: number;
}

export function computeL19OIAccel(
  oiHistory5m: OIPoint[],
  priceChangePct: number,
): L19Result {
  const none: L19Result = {
    oi_accel: 0, signal: 'NEUTRAL', score: 0, label: 'NO DATA',
  };

  if (oiHistory5m.length < 6) return none;

  const recent = oiHistory5m.slice(-12);
  const firstOI = recent[0].oi;
  const lastOI = recent[recent.length - 1].oi;

  if (firstOI <= 0) return none;

  const oiChangePct = ((lastOI - firstOI) / firstOI) * 100;
  const oiAccel = Math.abs(oiChangePct);

  let signal: L19Result['signal'] = 'NEUTRAL';
  let score = 0;
  let label = 'STABLE';

  const priceUp = priceChangePct > Thresholds.oiAccel.price_threshold_pct;
  const priceDown = priceChangePct < -Thresholds.oiAccel.price_threshold_pct;
  const oiUp = oiChangePct > Thresholds.oiAccel.change_pct;
  const oiDown = oiChangePct < -Thresholds.oiAccel.change_pct;
  const oiBigUp = oiChangePct > Thresholds.oiAccel.big_change_pct;
  const oiBigDown = oiChangePct < -Thresholds.oiAccel.big_change_pct;

  if (oiBigUp && priceUp) {
    signal = 'LONG_ENTRY';
    score = 15;
    label = 'AGGRESSIVE LONG ENTRY';
  } else if (oiUp && priceUp) {
    signal = 'LONG_ENTRY';
    score = 8;
    label = 'LONG ENTRY';
  } else if (oiBigDown && priceUp) {
    signal = 'SHORT_SQUEEZE';
    score = 12;
    label = 'SHORT SQUEEZE';
  } else if (oiDown && priceUp) {
    signal = 'SHORT_SQUEEZE';
    score = 5;
    label = 'MILD SHORT SQUEEZE';
  } else if (oiBigDown && priceDown) {
    signal = 'LONG_PANIC';
    score = -15;
    label = 'LONG PANIC LIQUIDATION';
  } else if (oiDown && priceDown) {
    signal = 'LONG_PANIC';
    score = -8;
    label = 'LONG UNWIND';
  } else if (oiBigUp && priceDown) {
    signal = 'SHORT_ENTRY';
    score = -12;
    label = 'AGGRESSIVE SHORT ENTRY';
  } else if (oiUp && priceDown) {
    signal = 'SHORT_ENTRY';
    score = -5;
    label = 'SHORT ENTRY';
  }

  return {
    oi_accel: Math.round(oiAccel * 100) / 100,
    signal,
    score,
    label,
  };
}
