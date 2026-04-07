// ═══════════════════════════════════════════════════════════════
// COGOCHI — Alpha Score Calculator
// ═══════════════════════════════════════════════════════════════
// 15레이어 score 합산 → -100 ~ +100 범위.
// L15(ATR)는 보조 지표로 Alpha에 직접 기여하지 않음.

import type {
  L1Result, L2Result, L3Result, L4Result, L5Result,
  L6Result, L7Result, L8Result, L9Result, L10Result,
  L11Result, L12Result, L13Result, L14Result, L15Result,
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
}

/**
 * 15레이어 score를 합산하여 Alpha Score를 계산한다.
 *
 * 각 레이어의 score는 이미 해당 레이어의 최대 기여값(±30, ±20 등)으로
 * 클램핑되어 있으므로, 단순 합산 후 -100~+100으로 최종 클램핑.
 *
 * 최대 이론값: 30+20+15+10+10+8+10+5+10+20+25+5+15+5 = 188
 * → 스케일링 없이 합산 후 클램핑 (극단 시나리오는 ±100 넘기 어려움)
 */
export function computeAlphaScore(layers: AllLayers): number {
  const sum =
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
    layers.l14.score;
  // L15는 보조 → 합산에서 제외

  return Math.max(-100, Math.min(100, Math.round(sum)));
}

/** Alpha Score → 5단계 라벨 변환 */
export function toAlphaLabel(score: number): AlphaLabel {
  if (score >= 60) return 'STRONG_BULL';
  if (score >= 20) return 'BULL';
  if (score <= -60) return 'STRONG_BEAR';
  if (score <= -20) return 'BEAR';
  return 'NEUTRAL';
}
