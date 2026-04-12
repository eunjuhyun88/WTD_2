// ─── Series Cache ────────────────────────────────────────────
// 시계열 데이터 캐시.  append-only, TTL, max-size trim.
// 싱글턴 모듈 수준 Map. (서버 프로세스 생애 동안 유지)

import type { NormalizedPoint, NormalizedSeries, OhlcvPoint } from '../types';

// ── Config ───────────────────────────────────────────────────

const MAX_POINTS = 500;    // 키당 최대 포인트 수
const DEFAULT_TTL = 10 * 60_000;  // 10분 기본 TTL

// ── Internal Stores ──────────────────────────────────────────

interface Entry {
  series: NormalizedSeries;
  expiresAt: number;
}

interface OhlcvEntry {
  points: OhlcvPoint[];
  expiresAt: number;
  updatedAt: number;
}

const seriesStore = new Map<string, Entry>();
const ohlcvStore = new Map<string, OhlcvEntry>();

// ── Series API ───────────────────────────────────────────────

/** 캐시에 시계열 전체 설정 (replace) */
export function setSeries(
  key: string,
  series: NormalizedSeries,
  ttlMs: number = DEFAULT_TTL,
): void {
  seriesStore.set(key, {
    series: { ...series, points: series.points.slice(-MAX_POINTS) },
    expiresAt: Date.now() + ttlMs,
  });
}

/** 시계열 뒤에 새 포인트 추가 (중복 t 제거, 정렬 유지) */
export function appendSeries(
  key: string,
  newPoints: NormalizedPoint[],
  ttlMs: number = DEFAULT_TTL,
): void {
  const existing = seriesStore.get(key);
  const now = Date.now();

  if (!existing || now > existing.expiresAt) {
    // 새 엔트리
    const base = existing?.series;
    seriesStore.set(key, {
      series: {
        symbol: base?.symbol ?? '',
        rawId: base?.rawId ?? '',
        tf: base?.tf,
        points: newPoints.slice(-MAX_POINTS),
        updatedAt: now,
      },
      expiresAt: now + ttlMs,
    });
    return;
  }

  // 기존 포인트 맵
  const pointMap = new Map(existing.series.points.map(p => [p.t, p]));
  for (const p of newPoints) pointMap.set(p.t, p);

  const merged = Array.from(pointMap.values())
    .sort((a, b) => a.t - b.t)
    .slice(-MAX_POINTS);

  seriesStore.set(key, {
    series: { ...existing.series, points: merged, updatedAt: now },
    expiresAt: now + ttlMs,
  });
}

/** 캐시에서 시계열 읽기 */
export function getSeries(key: string): NormalizedSeries | null {
  const entry = seriesStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    seriesStore.delete(key);
    return null;
  }
  return entry.series;
}

// ── OHLCV API ────────────────────────────────────────────────

/** OHLCV 캐시 설정 (replace) */
export function setOhlcv(
  key: string,
  points: OhlcvPoint[],
  ttlMs: number = DEFAULT_TTL,
): void {
  ohlcvStore.set(key, {
    points: points.slice(-MAX_POINTS),
    expiresAt: Date.now() + ttlMs,
    updatedAt: Date.now(),
  });
}

/** OHLCV 캐시 읽기 */
export function getOhlcv(key: string): OhlcvPoint[] | null {
  const entry = ohlcvStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    ohlcvStore.delete(key);
    return null;
  }
  return entry.points;
}

/** OHLCV 마지막 bar만 업데이트 */
export function updateLastOhlcv(key: string, point: OhlcvPoint): void {
  const entry = ohlcvStore.get(key);
  if (!entry) return;
  const points = entry.points;
  if (points.length > 0 && points[points.length - 1].t === point.t) {
    points[points.length - 1] = point;
  } else {
    points.push(point);
    if (points.length > MAX_POINTS) points.shift();
  }
  entry.updatedAt = Date.now();
}

// ── Maintenance ──────────────────────────────────────────────

export function purgeExpired(): void {
  const now = Date.now();
  for (const [k, v] of seriesStore) {
    if (now > v.expiresAt) seriesStore.delete(k);
  }
  for (const [k, v] of ohlcvStore) {
    if (now > v.expiresAt) ohlcvStore.delete(k);
  }
}

export function seriesCacheStats() {
  return { series: seriesStore.size, ohlcv: ohlcvStore.size };
}
