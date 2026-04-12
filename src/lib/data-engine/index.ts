// ═══════════════════════════════════════════════════════════════
// Data Engine — Public API
// ═══════════════════════════════════════════════════════════════
// 외부에서는 buildContext() 만 호출하면 된다.

export { buildContext } from './context/contextBuilder';
export type { BuiltContext } from './context/contextBuilder';

// 타입
export type { NormalizedPoint, NormalizedSeries, NormalizedSnapshot, OhlcvPoint, DataCadence } from './types';
export { DataCadence as DataCadenceValues } from './types';

// 캐시 (디버그/admin 용)
export { seriesCacheStats, purgeExpired } from './cache/seriesCache';
export { snapshotCacheStats, purgeExpiredSnapshots } from './cache/snapshotCache';

// 스케줄러 (admin 용)
export { listPollers, registerPoller, unregisterPoller, runNow } from './scheduler/pollingScheduler';
export { listSubscriptions, subscribe, unsubscribe } from './scheduler/subscriptionManager';

// 정규화 유틸 (metric-engine 내부에서 직접 사용)
export { normalizeSymbol } from './normalization/normalizeSymbol';
export { normalizeTimeframe, tfToSeconds } from './normalization/normalizeTimeframe';
export { normalizeTimestamp, alignToGrid } from './normalization/normalizeTimestamp';
export { fundingToBps, normalizeTakerRatio } from './normalization/normalizeUnit';

// 정렬 유틸
export { fillGaps } from './alignment/fillGaps';
export { resampleSeries } from './alignment/resampleSeries';
export { alignTwo, alignMany } from './alignment/alignSeries';
