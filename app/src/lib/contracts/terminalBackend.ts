export interface AnalyzeEnvelope {
  symbol?: string;
  tf?: string;
  mode?: string;
  price?: number;
  change24h?: number;
  snapshot?: {
    symbol?: string;
    timeframe?: string;
    last_close?: number;
    change24h?: number;
    price_change_pct_24h?: number;
    vol_ratio_3?: number;
    oi_change_1h?: number;
    funding_rate?: number;
    cvd_state?: string;
    regime?: string;
  };
  deep?: {
    verdict?: string;
    total_score?: number;
    atr_levels?: Record<string, number>;
    layers?: Record<string, { score: number; sigs: Array<{ t: string; type: string }> }>;
  };
  ensemble?: {
    direction?: string;
    ensemble_score?: number;
    reason?: string;
    block_analysis?: { disqualifiers?: string[] };
  };
}

export interface SeriesBar {
  t: number;
  o?: number;
  h?: number;
  l?: number;
  c: number;
  v: number;
  delta: number;
  cvd: number;
}

export interface SnapshotEnvelope {
  pair?: string;
  timeframe?: string;
  at?: number;
  sources?: Record<string, boolean>;
}

export interface DerivativesEnvelope {
  funding?: number;
  oi?: number;
  lsRatio?: number;
  liqLong24h?: number;
  liqShort24h?: number;
}

export interface FlowEnvelope {
  bias?: 'LONG' | 'SHORT' | 'NEUTRAL';
}

export interface EventsEnvelope {
  data?: { records?: Array<{ tag?: string; level?: string; text?: string }> };
}
