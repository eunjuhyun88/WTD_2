// ═══════════════════════════════��═══════════════════════════════
// COGOCHI — Alpha Score Calculator
// ═════════════════��═════════════════════════════════════════════
// L1~L15 score sum → base alpha (clamped -100~+100).
// L18/L19 added as separate bonus.
// L15(ATR) now contributes to alpha (±6).

import type {
  L1Result, L2Result, L3Result, L4Result, L5Result,
  L6Result, L7Result, L8Result, L9Result, L10Result,
  L11Result, L12Result, L13Result, L14Result, L15Result,
  L18Result, L19Result,
  AlphaLabel,
} from './types';

interface AllLayers {
  l1:  L1Result;
  l2:  L2Result;
  l3:  L3Result;
  l4:  L4Result;
  l5:  L5Result;
  l6:  L6Result;
  l7:  L7Result;
  l8:  L8Result;
  l9:  L9Result;
  l10: L10Result;
  l11: L11Result;
  l12: L12Result;
  l13: L13Result;
  l14: L14Result;
  l15: L15Result;
  l18: L18Result;
  l19: L19Result;
}

/**
 * L1~L15 simple sum + L18/L19 bonus → clamped -100~+100.
 *
 * Max theoretical: 28+55+15+12+12+10+8+10+12+20+12+10+12+10+6 = 222
 * + L18(25) + L19(15) = 262
 * In practice, extreme combinations are rare → clamp to ±100.
 */
export function computeAlphaScore(layers: AllLayers): number {
  const base =
    layers.l1.score +
    layers.l2.score +
    layers.l3.score +
    layers.l4.score +
    layers.l5.score +
    layers.l6.score +
    layers.l7.score +
    layers.l8.score +
    layers.l9.score +
    layers.l10.score +
    layers.l11.score +
    layers.l12.score +
    layers.l13.score +
    layers.l14.score +
    layers.l15.score;

  // L18/L19 are separate additions (short-term real-time signals)
  const bonus = (layers.l18?.score ?? 0) + (layers.l19?.score ?? 0);

  return Math.max(-100, Math.min(100, Math.round(base + bonus)));
}

/** Alpha Score → 5-tier label */
export function toAlphaLabel(score: number): AlphaLabel {
  if (score >= 60) return 'STRONG_BULL';
  if (score >= 25) return 'BULL';
  if (score <= -60) return 'STRONG_BEAR';
  if (score <= -25) return 'BEAR';
  return 'NEUTRAL';
}

/** Build human-readable verdict string with alerts */
export function buildVerdict(
  alpha: number,
  extremeFR: boolean,
  frAlert: string,
  mtfTriple: boolean,
  bbBigSqueeze: boolean,
): string {
  let base: string;
  if (alpha >= 60) base = 'STRONG BULL';
  else if (alpha >= 25) base = 'BULL BIAS';
  else if (alpha > -25) base = 'NEUTRAL';
  else if (alpha > -60) base = 'BEAR BIAS';
  else base = 'STRONG BEAR';

  const alerts: string[] = [];
  if (extremeFR && frAlert) alerts.push(frAlert);
  if (mtfTriple) alerts.push('MTF TRIPLE ★★★');
  if (bbBigSqueeze) alerts.push('BB BIG SQUEEZE');

  return alerts.length > 0 ? `${base} · ${alerts.join(' · ')}` : base;
}
