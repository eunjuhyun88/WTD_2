// ─── Provider Adapter Interface ──────────────────────────────
// data-engine이 외부 데이터를 가져오는 인터페이스.

import type { OhlcvPoint, NormalizedPoint, NormalizedSeries, NormalizedSnapshot } from '../types';

/** OHLCV 데이터 페처 */
export interface OhlcvFetcher {
  (symbol: string, tf: string, limit: number): Promise<OhlcvPoint[]>;
}

/** 단일 스냅샷 페처 (funding, OI point, …) */
export interface SnapshotFetcher {
  (symbol: string): Promise<NormalizedSnapshot | null>;
}

/** 시계열 페처 (OI history, L/S ratio history, …) */
export interface SeriesFetcher {
  (symbol: string): Promise<NormalizedPoint[]>;
}

/** 복합 외부 데이터 프로바이더 (series + snapshot 모두 제공) */
export interface DataEngineProvider {
  name: string;
  fetchSeries(symbol: string, metric: string, tf: string, limit: number): Promise<NormalizedSeries | null>;
  fetchSnapshot(symbol: string, metric: string): Promise<NormalizedSnapshot | null>;
  isAvailable(): boolean;
}
