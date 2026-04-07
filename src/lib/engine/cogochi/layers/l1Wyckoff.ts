// ═══════════════════════════════════════════════════════════════
// L1: 와이코프 구조 분석 (±30)
// ═══════════════════════════════════════════════════════════════
// klines 50봉 기반 Phase 판정.
// 가격 구조(HH/HL/LH/LL) + 볼륨 패턴 → 6개 Phase 중 하나.

import type { BinanceKline } from '../../types';
import type { L1Result, WyckoffPhase } from '../types';
import { calcSMA } from '../../indicators';

/** 50봉 고점/저점 추출 (간이 pivot) */
function findSwings(closes: number[], lookback = 5): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = lookback; i < closes.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (closes[j] >= closes[i]) isHigh = false;
      if (closes[j] <= closes[i]) isLow = false;
    }
    if (isHigh) highs.push(closes[i]);
    if (isLow) lows.push(closes[i]);
  }
  return { highs, lows };
}

/** HH/HL 패턴 → 상승 구조, LH/LL → 하락 구조 */
function structureBias(values: number[]): number {
  if (values.length < 2) return 0;
  let rising = 0;
  let falling = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) rising++;
    else if (values[i] < values[i - 1]) falling++;
  }
  const total = rising + falling;
  if (total === 0) return 0;
  return (rising - falling) / total; // -1 ~ +1
}

/** 볼륨 추세: 최근 10봉 vs 이전 40봉 평균 비교 */
function volumeTrend(volumes: number[]): 'EXPANDING' | 'CONTRACTING' | 'FLAT' {
  if (volumes.length < 20) return 'FLAT';
  const oldAvg = volumes.slice(0, -10).reduce((s, v) => s + v, 0) / Math.max(volumes.length - 10, 1);
  const newAvg = volumes.slice(-10).reduce((s, v) => s + v, 0) / 10;
  if (oldAvg <= 0) return 'FLAT';
  const ratio = newAvg / oldAvg;
  if (ratio > 1.3) return 'EXPANDING';
  if (ratio < 0.7) return 'CONTRACTING';
  return 'FLAT';
}

export function computeL1Wyckoff(klines: BinanceKline[]): L1Result {
  if (klines.length < 30) {
    return { phase: 'ACCUMULATION', score: 0 };
  }

  const closes = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume);
  const recent = closes.slice(-50);

  // SMA20으로 추세 방향 파악
  const sma20 = calcSMA(closes, 20);
  const lastSma = sma20[sma20.length - 1];
  const prevSma = sma20[sma20.length - 10] ?? lastSma;
  const smaSlope = lastSma && prevSma ? (lastSma - prevSma) / prevSma : 0;

  // 구조 분석
  const swings = findSwings(recent, 3);
  const highBias = structureBias(swings.highs);
  const lowBias = structureBias(swings.lows);
  const volTrend = volumeTrend(volumes.slice(-50));

  // 가격 범위 수축/확장
  const recentRange = Math.max(...recent.slice(-10)) - Math.min(...recent.slice(-10));
  const fullRange = Math.max(...recent) - Math.min(...recent);
  const rangeRatio = fullRange > 0 ? recentRange / fullRange : 1;

  // Phase 판정 로직
  let phase: WyckoffPhase;
  let score: number;

  if (rangeRatio < 0.3 && lowBias >= 0 && smaSlope > -0.005) {
    // 좁은 범위 + 저점 유지/상승 → ACCUMULATION
    phase = 'ACCUMULATION';
    score = 15; // 약간 불리시
  } else if (smaSlope > 0.01 && highBias > 0.3 && volTrend === 'EXPANDING') {
    // 상승 추세 + HH 패턴 + 볼륨 증가 → MARKUP
    phase = 'MARKUP';
    score = 30;
  } else if (rangeRatio < 0.3 && highBias <= 0 && smaSlope < 0.005) {
    // 좁은 범위 + 고점 하락 → DISTRIBUTION
    phase = 'DISTRIBUTION';
    score = -15;
  } else if (smaSlope < -0.01 && lowBias < -0.3 && volTrend === 'EXPANDING') {
    // 하락 추세 + LL 패턴 + 볼륨 증가 → MARKDOWN
    phase = 'MARKDOWN';
    score = -30;
  } else if (smaSlope > 0 && rangeRatio < 0.4 && lowBias > 0) {
    // 상승 중 조정 → REACCUM
    phase = 'REACCUM';
    score = 10;
  } else if (smaSlope < 0 && rangeRatio < 0.4 && highBias < 0) {
    // 하락 중 반등 시도 → REDIST
    phase = 'REDIST';
    score = -10;
  } else if (smaSlope > 0.005) {
    phase = 'MARKUP';
    score = 20;
  } else if (smaSlope < -0.005) {
    phase = 'MARKDOWN';
    score = -20;
  } else {
    phase = 'ACCUMULATION';
    score = 0;
  }

  return { phase, score };
}
