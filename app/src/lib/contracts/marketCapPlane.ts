export type MarketCapProviderStatus = 'live' | 'partial' | 'blocked';

export interface MarketCapProviderState {
  provider: string;
  status: MarketCapProviderStatus;
  detail?: string;
  updatedAt?: number | null;
}

export interface MarketCapOverview {
  at: number;
  totalMarketCapUsd: number | null;
  marketCapChange24hPct: number | null;
  btcMarketCapUsd: number | null;
  ethMarketCapUsd: number | null;
  btcDominance: number | null;
  ethDominance: number | null;
  dominanceChange24h: number | null;
  stablecoinMcapUsd: number | null;
  stablecoinMcapChange24hPct: number | null;
  stablecoinMcapChange7dPct: number | null;
  sourceSpreadPct: number | null;
  confidence: number;
  providers: {
    global: MarketCapProviderState;
    assets: MarketCapProviderState;
    stablecoins: MarketCapProviderState;
  };
}

export interface MarketCapHistoryPoint {
  timestampMs: number;
  marketCapUsd: number;
}
