// ═══════════════════════════════════════════════════════════════
// L13: 돌파 감지 (±15)
// ═══════════════════════════════════════════════════════════════
// 최근 50봉 고가/저가 돌파 여부.
// 상방 돌파 = bullish (+15), 하방 돌파 = bearish (-15).

import type { BinanceKline } from '../../types';
import type { L13Result } from '../types';

export function computeL13Breakout(klines: BinanceKline[]): L13Result {
  if (klines.length < 52) {
    return { breakout: false, score: 0 };
  }

  // 최근 50봉 (마지막 2봉 제외 = 기준 범위)
  const rangeKlines = klines.slice(-52, -2);
  const lastKline = klines[klines.length - 1];
  const prevKline = klines[klines.length - 2];

  const rangeHigh = Math.max(...rangeKlines.map(k => k.high));
  const rangeLow = Math.min(...rangeKlines.map(k => k.low));

  // 상방 돌파: 최근 2봉 중 하나라도 종가가 range high 돌파
  const bullBreak = lastKline.close > rangeHigh || prevKline.close > rangeHigh;
  // 하방 돌파: 최근 2봉 중 하나라도 종가가 range low 이탈
  const bearBreak = lastKline.close < rangeLow || prevKline.close < rangeLow;

  if (bullBreak) {
    return { breakout: true, score: 15 };
  }
  if (bearBreak) {
    return { breakout: true, score: -15 };
  }

  return { breakout: false, score: 0 };
}
