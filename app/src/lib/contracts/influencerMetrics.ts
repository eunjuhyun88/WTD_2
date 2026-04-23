export type InfluencerProviderStatus = 'live' | 'partial' | 'blocked' | 'planned';
export type InfluencerProviderKey = 'onchain' | 'defi' | 'sentiment';
export type InfluencerMetricFamily = 'OnChain' | 'DeFi' | 'DerivativesMacro';
export type InfluencerPipelineStatus = InfluencerProviderStatus | 'reference_only';

export interface InfluencerProviderState {
  provider: string;
  status: InfluencerProviderStatus;
  detail?: string;
}

export interface InfluencerMetricBinding {
  label: string;
  status: InfluencerPipelineStatus;
  indicatorId?: string;
  payloadPath?: string;
  providerKey?: InfluencerProviderKey;
  referenceSite?: string;
  note: string;
}

export interface InfluencerExampleMention {
  account: string;
  observedOn: string;
  summary: string;
}

export interface InfluencerMetricReportItem {
  id: string;
  rank: number;
  family: InfluencerMetricFamily;
  label: string;
  whyItMatters: string;
  influencerUsage: string;
  trackedBy: string[];
  exampleMentions: InfluencerExampleMention[];
  bindings: InfluencerMetricBinding[];
}

export interface InfluencerToolPackage {
  id: string;
  label: string;
  tools: string[];
  metrics: string[];
  description: string;
}

export interface InfluencerDailyStack {
  label: string;
  metrics: string[];
  note: string;
}

export interface InfluencerMetricsReport {
  asOfDate: string;
  scope: {
    platform: 'X';
    sampleWindow: string;
    accountSet: string[];
    filters: string[];
  };
  methodology: string[];
  keyTakeaways: string[];
  primaryDailyStack: InfluencerDailyStack;
  toolPackages: InfluencerToolPackage[];
  metricLeaderboard: InfluencerMetricReportItem[];
  trendSummary: string[];
  conclusions: string[];
}

export interface InfluencerMetricsPayload {
  symbol: string;
  baseAsset: string;
  at: number;
  providers: {
    onchain: InfluencerProviderState;
    defi: InfluencerProviderState;
    sentiment: InfluencerProviderState;
  };
  onchain: {
    mvrv: number | null;
    nupl: number | null;
    exchangeNetflowUsd: number | null;
    exchangeNetflowChange7dPct: number | null;
    activeAddresses: number | null;
    whaleActivity: number | null;
    whaleNetflowUsd: number | null;
  };
  defi: {
    totalTvlUsd: number | null;
    totalTvlChange24hPct: number | null;
    dexVolume24hUsd: number | null;
    dexVolumeTvlRatio: number | null;
  };
  sentiment: {
    fearGreed: number | null;
    fearGreedClassification: string | null;
    fearGreedHistory: number[];
    socialPostsActive: number | null;
    socialInteractions24h: number | null;
    socialContributorsActive: number | null;
    socialDominancePct: number | null;
  };
  report: InfluencerMetricsReport;
}
