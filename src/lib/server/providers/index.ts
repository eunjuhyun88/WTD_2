// ═══════════════════════════════════════════════════════════════
// Stockclaw — Data Provider Barrel Export (B-05)
// ═══════════════════════════════════════════════════════════════

export { getCached, setCache, invalidate, invalidatePrefix, cacheStats } from './cache';
export { getProviderHealth, assembleMarketContext } from './registry';
export type {
  DataProvider,
  CacheEntry,
  ProviderHealth,
  OnchainMetrics,
  SentimentMetrics,
} from './types';
