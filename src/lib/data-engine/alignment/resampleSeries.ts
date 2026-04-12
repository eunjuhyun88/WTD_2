// ─── Series Resampler ────────────────────────────────────────
// 고주파 → 저주파 리샘플링. (e.g. 5m → 1h)
// 각 타겟 bar에서 소스 포인트의 last값을 취한다.

import type { NormalizedPoint } from '../types';

/**
 * sourceSeries를 targetTfSec 간격으로 리샘플링.
 * 각 버킷의 마지막 포인트값이 해당 bar의 값이 된다.
 */
export function resampleSeries(
  source: NormalizedPoint[],
  targetTfSec: number,
): NormalizedPoint[] {
  if (source.length === 0 || targetTfSec <= 0) return [];

  const buckets = new Map<number, number>();

  for (const pt of source) {
    const bucketT = Math.floor(pt.t / targetTfSec) * targetTfSec;
    buckets.set(bucketT, pt.v); // last-value-wins
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ t, v }));
}
