// ═══════════════════════════════════════════════════════════════
// L3: V-Surge 거래량 이상 감지 (0 or +15)
// ═══════════════════════════════════════════════════════════════
// SMA20 대비 3x 이상 거래량 스파이크 → 시장 관심 급증 신호.
// 방향 판단 없이 "이벤트 발생" 플래그만 제공.

import type { BinanceKline } from '../../types';
import type { L3Result } from '../types';
import { calcSMA } from '../../indicators';

export function computeL3VSurge(klines: BinanceKline[]): L3Result {
  if (klines.length < 25) {
    return { v_surge: false, score: 0 };
  }

  const volumes = klines.map(k => k.volume);
  const sma20 = calcSMA(volumes, 20);
  const lastSma = sma20[sma20.length - 1];

  if (!Number.isFinite(lastSma) || lastSma <= 0) {
    return { v_surge: false, score: 0 };
  }

  // 최근 3봉 중 하나라도 SMA20 대비 3배 이상이면 V-Surge
  const recent3 = volumes.slice(-3);
  const hasSurge = recent3.some(v => v >= lastSma * 3);

  return {
    v_surge: hasSurge,
    score: hasSurge ? 15 : 0,
  };
}
