// ═══════════════════════════════════════════════════════════════
// L14: 볼린저밴드 스퀴즈 (±5)
// ═══════════════════════════════════════════════════════════════
// BB width < 0.02 → squeeze (변동성 수축, 큰 움직임 임박).
// squeeze 후 확장 방향으로 bias.

import type { BinanceKline } from '../../types';
import type { L14Result } from '../types';
import { calcBollingerBands } from '../../indicators';

export function computeL14BbSqueeze(klines: BinanceKline[]): L14Result {
  if (klines.length < 25) {
    return { bb_squeeze: false, bb_width: 0, score: 0 };
  }

  const closes = klines.map(k => k.close);
  const bb = calcBollingerBands(closes, 20, 2);

  const lastUpper = bb.upper[bb.upper.length - 1];
  const lastLower = bb.lower[bb.lower.length - 1];
  const lastMiddle = bb.middle[bb.middle.length - 1];

  if (!Number.isFinite(lastUpper) || !Number.isFinite(lastLower) || !Number.isFinite(lastMiddle) || lastMiddle <= 0) {
    return { bb_squeeze: false, bb_width: 0, score: 0 };
  }

  const bbWidth = (lastUpper - lastLower) / lastMiddle;
  const isSqueeze = bbWidth < 0.02;

  // 이전 5봉의 BB width와 비교해서 확장 여부
  let score = 0;
  if (isSqueeze) {
    // squeeze 중 — 방향 미정, 약간 중립
    score = 0;
  } else {
    // squeeze 해제 직후인지 확인
    const prev5Widths: number[] = [];
    for (let i = 2; i <= 6; i++) {
      const idx = bb.upper.length - i;
      if (idx < 0) break;
      const u = bb.upper[idx];
      const l = bb.lower[idx];
      const m = bb.middle[idx];
      if (Number.isFinite(u) && Number.isFinite(l) && Number.isFinite(m) && m > 0) {
        prev5Widths.push((u - l) / m);
      }
    }
    const wasSqueeze = prev5Widths.some(w => w < 0.02);
    if (wasSqueeze && bbWidth >= 0.02) {
      // squeeze 해제 → 현재 가격이 middle 위면 bull, 아래면 bear
      const lastClose = closes[closes.length - 1];
      score = lastClose > lastMiddle ? 5 : -5;
    }
  }

  return {
    bb_squeeze: isSqueeze,
    bb_width: Math.round(bbWidth * 10000) / 10000,
    score,
  };
}
