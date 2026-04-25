export type DataProvider =
  | 'engine'
  | 'binance'
  | 'bybit'
  | 'okx'
  | 'coinbase'
  | 'coingecko'
  | 'coinalyze'
  | 'deribit'
  | 'arkham'
  | 'coinmetrics'
  | 'cryptoquant'
  | 'defillama'
  | 'dexscreener'
  | 'geckoterminal'
  | 'derived';

export type StudyFamily =
  | 'price'
  | 'flow'
  | 'onchain'
  | 'dex'
  | 'volatility'
  | 'oi'
  | 'funding'
  | 'cvd'
  | 'liquidity'
  | 'options'
  | 'venue'
  | 'execution';

export type StudySurface =
  | 'chart-overlay'
  | 'chart-subpane'
  | 'right-hud'
  | 'bottom-workspace';

export type StudyCompareMode =
  | 'timeseries'
  | 'price-level'
  | 'summary'
  | 'execution';

export type StudyTrustTier = 'core' | 'verified' | 'experimental' | 'deferred';
export type StudyOwner = 'engine' | 'app-route' | 'provider-direct' | 'derived';

export interface ProviderRef {
  provider: DataProvider;
  route?: string;
  stream?: string;
  auth: 'public' | 'api_key' | 'internal' | 'deferred';
  freshnessMs: number | null;
  status?: 'live' | 'poll' | 'derived' | 'deferred';
}

export interface StudyMetric {
  label: string;
  value: string | number | null;
  tone?: 'bull' | 'bear' | 'neutral' | 'warn';
  note?: string;
}

export interface StudySeriesRef {
  chartKey?: 'klines' | 'oiBars' | 'fundingBars' | 'cvdBars' | 'liqBars';
  indicatorKey?: string;
  registryId?: string;
}

export interface StudyMethodology {
  label: string;
  formula?: string;
  referenceUrl?: string;
}

export interface StudyTrust {
  tier: StudyTrustTier;
  owner: StudyOwner;
  rationale: string;
}

export interface OnchainBackdropPayload {
  source: 'coinmetrics' | 'cryptoquant' | 'none';
  asset: 'btc' | 'eth';
  at: number;
  exchangeReserve: {
    netflow24h: number | null;
    change7dPct: number | null;
  } | null;
  metrics: {
    mvrv: number | null;
    nupl: number | null;
    sopr: number | null;
    puellMultiple: number | null;
  } | null;
  whale: {
    whaleCount: number | null;
    whaleNetflow: number | null;
    exchangeWhaleRatio: number | null;
    coverage: 'cryptoquant' | 'geckoterminal-top-pools';
  } | null;
}

export interface DexOverviewPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  label: string;
  baseSymbol: string;
  quoteSymbol: string;
  priceUsd: number | null;
  priceChange24hPct: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  txns24h: number | null;
  url: string | null;
}

export interface DexOverviewChain {
  chainId: string;
  chainLabel: string;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  txns24h: number | null;
  liquiditySharePct: number | null;
  volumeSharePct: number | null;
  chainTvlUsd: number | null;
  chainTvlChange1dPct: number | null;
}

export interface DexOverviewPayload {
  symbol: string;
  query: string;
  proxySymbol: string;
  at: number;
  pairCount: number;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  txns24h: number | null;
  volumeLiquidityRatio: number | null;
  avgTradeSizeUsd: number | null;
  topDexSharePct: number | null;
  totalDefiTvlUsd: number | null;
  totalDefiTvlChange24hPct: number | null;
  chainBreakdown: DexOverviewChain[];
  topPairs: DexOverviewPair[];
  coverage: {
    mode: 'exact' | 'proxy';
    note: string;
  };
}

export interface StudySnapshot {
  id: string;
  title: string;
  family: StudyFamily;
  defaultSurface: StudySurface;
  compareMode: StudyCompareMode;
  displayPriority: number;
  freshnessMs: number | null;
  trust: StudyTrust;
  sourceRefs: ProviderRef[];
  summary: StudyMetric[];
  methodology?: StudyMethodology;
  seriesRef?: StudySeriesRef;
  payload?: Record<string, unknown>;
}

export interface WorkspaceSection {
  id: string;
  title: string;
  kind: 'summary' | 'detail' | 'evidence' | 'execution' | 'compare';
  studyIds: string[];
  collapsible?: boolean;
}

export interface AIContextPack {
  symbol: string;
  timeframe: string;
  selectedStudyIds: string[];
  compareStudyIds: string[];
  thesis?: string;
  warnings?: string[];
}

export interface CogochiWorkspaceEnvelope {
  symbol: string;
  timeframe: string;
  generatedAt: number;
  studies: StudySnapshot[];
  sections: WorkspaceSection[];
  aiContext: AIContextPack;
}
