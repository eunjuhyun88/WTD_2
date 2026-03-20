// ═══════════════════════════════════════════════════════════════
// Stockclaw — Data Provider Types (B-05)
// ═══════════════════════════════════════════════════════════════

// Provider abstraction for all data sources
export interface DataProvider<T = unknown> {
  readonly name: string;
  readonly source: string;
  fetch(...args: unknown[]): Promise<T>;
  isAvailable(): boolean;
}

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export interface ProviderHealth {
  name: string;
  available: boolean;
  lastFetchMs: number | null;
  errorCount: number;
  lastError: string | null;
}

// Specific provider result types
export interface OnchainMetrics {
  mvrv: number | null;
  nupl: number | null;
  sopr: number | null;
  exchangeNetflow: number | null;
  whaleActivity: number | null;
  minerFlow: number | null;
  stablecoinFlow: number | null;
  activeAddresses: number | null;
  etfFlow: number | null;
  realizedCap: number | null;
  supplyInProfit: number | null;
}

export interface SentimentMetrics {
  fearGreed: number | null;
  socialVolume: number | null;
  socialSentiment: number | null;
  newsImpact: number | null;
  searchTrend: number | null;
}
