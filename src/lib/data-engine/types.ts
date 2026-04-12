// ═══════════════════════════════════════════════════════════════
// Data Engine — Core Types
// ═══════════════════════════════════════════════════════════════
// 외부 API 원천 데이터를 정규화한 공통 포맷.
// metric-engine / layer-engine 은 이 타입만 소비한다.

// ─── 단일 시계열 포인트 ────────────────────────────────────────

/** 정규화된 시계열 포인트. t = unix seconds (정수). */
export interface NormalizedPoint {
  t: number;                        // unix seconds
  v: number;                        // primary value
  meta?: Record<string, number>;    // secondary fields (buyVol, sellVol, …)
}

// ─── 시계열 ──────────────────────────────────────────────────

export interface NormalizedSeries {
  symbol: string;     // e.g. "BTCUSDT"
  rawId: string;      // e.g. "raw.symbol.klines.4h"
  tf?: string;        // e.g. "4h"  (klines 전용)
  points: NormalizedPoint[];
  updatedAt: number;  // unix ms (Date.now())
}

// ─── 스냅샷 (최신 단일값) ────────────────────────────────────

export interface NormalizedSnapshot {
  symbol: string;
  rawId: string;
  value: number;
  meta?: Record<string, number>;
  updatedAt: number;  // unix ms
}

// ─── OHLCV (klines 특수 케이스) ──────────────────────────────

/** 정규화된 OHLCV 포인트. meta에 buyVol 포함. */
export interface OhlcvPoint {
  t: number;       // unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;       // total volume
  bv?: number;     // taker buy volume
}

// ─── 캐시 키 팩토리 ──────────────────────────────────────────

export function seriesCacheKey(symbol: string, rawId: string): string {
  return `${symbol}:${rawId}`;
}

export function ohlcvCacheKey(symbol: string, tf: string): string {
  return `${symbol}:ohlcv:${tf}`;
}

// ─── 폴링 주기 ───────────────────────────────────────────────

export const DataCadence = {
  TICK:   5_000,     // 5s   — ticker, funding point
  FAST:   15_000,    // 15s  — order book depth
  MEDIUM: 60_000,    // 1m   — klines 5m / OI point / taker ratio
  SLOW:   5 * 60_000, // 5m  — klines 1h / OI hist / L/S ratio
  SLOW2:  15 * 60_000, // 15m — klines 4h / klines 1d
} as const;

export type DataCadence = (typeof DataCadence)[keyof typeof DataCadence];
