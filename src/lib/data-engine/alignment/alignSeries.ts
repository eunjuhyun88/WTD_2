// ─── Series Aligner ──────────────────────────────────────────
// 여러 시계열을 공통 타임스탬프 기준으로 정렬.
// 타임스탬프가 없는 항목은 forward-fill.

import type { NormalizedPoint } from '../types';

/**
 * 두 시계열을 공통 타임스탬프에 정렬.
 * 반환: 공통 구간의 [t, a.v, b.v] 쌍 배열.
 */
export function alignTwo(
  a: NormalizedPoint[],
  b: NormalizedPoint[],
): Array<{ t: number; a: number; b: number }> {
  if (a.length === 0 || b.length === 0) return [];

  const mapB = new Map(b.map(p => [p.t, p.v]));
  const result: Array<{ t: number; a: number; b: number }> = [];

  let lastB = b[0].v;
  for (const pt of a) {
    const bv = mapB.get(pt.t);
    if (bv !== undefined) lastB = bv;
    result.push({ t: pt.t, a: pt.v, b: lastB });
  }

  return result;
}

/**
 * 복수 시계열을 공통 타임스탬프 기준으로 정렬.
 * 반환: {t, values: number[]} 배열. values[i] = series[i]의 값.
 */
export function alignMany(
  seriesList: NormalizedPoint[][],
): Array<{ t: number; values: number[] }> {
  if (seriesList.length === 0) return [];

  // 모든 타임스탬프 수집
  const allTs = new Set<number>();
  for (const s of seriesList) {
    for (const p of s) allTs.add(p.t);
  }

  const sortedTs = Array.from(allTs).sort((a, b) => a - b);
  const maps = seriesList.map(s => new Map(s.map(p => [p.t, p.v])));

  return sortedTs.map(t => {
    const values = maps.map(m => m.get(t) ?? NaN);
    return { t, values };
  });
}
