// ─── Gap Filler ──────────────────────────────────────────────
// 누락된 타임스탬프를 채운다. (forward fill / zero fill)

import type { NormalizedPoint } from '../types';

export type FillMode = 'forward' | 'zero' | 'interpolate';

/**
 * 주어진 시계열에서 갭을 채운다.
 * @param series  오름차순 정렬된 시계열
 * @param tfSec   타임프레임 초 (bar 간격)
 * @param mode    채우기 방식
 */
export function fillGaps(
  series: NormalizedPoint[],
  tfSec: number,
  mode: FillMode = 'forward',
): NormalizedPoint[] {
  if (series.length < 2 || tfSec <= 0) return series;

  const result: NormalizedPoint[] = [];
  for (let i = 0; i < series.length; i++) {
    result.push(series[i]);
    if (i + 1 >= series.length) break;

    const curr = series[i];
    const next = series[i + 1];
    const gap = next.t - curr.t;

    if (gap <= tfSec) continue; // 갭 없음

    const steps = Math.round(gap / tfSec) - 1;
    for (let s = 1; s <= steps; s++) {
      const t = curr.t + s * tfSec;
      let v: number;
      if (mode === 'zero') {
        v = 0;
      } else if (mode === 'interpolate') {
        v = curr.v + (next.v - curr.v) * (s / (steps + 1));
      } else {
        // forward fill
        v = curr.v;
      }
      result.push({ t, v });
    }
  }

  return result;
}
