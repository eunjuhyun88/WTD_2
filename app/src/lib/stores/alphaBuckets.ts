/**
 * Alpha Buckets Store
 *
 * Terminal scan 결과가 완료되면 여기에 bucket counter를 집계해서 push.
 * Header.svelte의 AlphaMarketBar가 구독해서 실시간으로 Strong Bull / Bull /
 * Neutral / Bear / Strong Bear / Extreme FR 카운트를 표시한다.
 *
 * 분류 임계치는 Alpha Flow HTML 기준:
 *  Strong Bull   : alphaScore >= 55
 *  Bull          : 25 <= alphaScore < 55
 *  Neutral       : -24 <= alphaScore <= 24
 *  Bear          : -54 <= alphaScore <= -25
 *  Strong Bear   : alphaScore <= -55
 *  Extreme FR    : |funding rate| > 0.07%
 */

import { writable } from 'svelte/store';

export interface AlphaBuckets {
  strongBull: number;
  bull: number;
  neutral: number;
  bear: number;
  strongBear: number;
  extremeFR: number;
  /** 마지막으로 집계된 전체 스캔 종목 수 */
  total: number;
}

export const alphaBuckets = writable<AlphaBuckets | null>(null);

/**
 * Scan 결과 배열을 받아 bucket 집계 후 store 에 push.
 * Expected shape per row: { alphaScore: number, extremeFR?: boolean, fr?: number }
 */
export function pushBucketsFromResults(
  results: Array<{ alphaScore?: number; extremeFR?: boolean; fr?: number }>
): void {
  if (!Array.isArray(results) || results.length === 0) {
    alphaBuckets.set(null);
    return;
  }
  const b: AlphaBuckets = {
    strongBull: 0,
    bull: 0,
    neutral: 0,
    bear: 0,
    strongBear: 0,
    extremeFR: 0,
    total: results.length,
  };
  for (const r of results) {
    const a = r.alphaScore ?? 0;
    if (a >= 55) b.strongBull++;
    else if (a >= 25) b.bull++;
    else if (a >= -24) b.neutral++;
    else if (a >= -54) b.bear++;
    else b.strongBear++;

    const isExtreme = r.extremeFR === true ||
      (typeof r.fr === 'number' && Math.abs(r.fr) > 0.07);
    if (isExtreme) b.extremeFR++;
  }
  alphaBuckets.set(b);
}
