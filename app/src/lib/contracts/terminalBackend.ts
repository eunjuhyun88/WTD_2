export interface AnalyzeEnvelope {
  symbol?: string;
  tf?: string;
  mode?: string;
  price?: number;
  change24h?: number;
  entryPlan?: {
    entry?: number;
    stop?: number;
    targets?: Array<{ label: string; price: number }>;
    riskReward?: number;
    validUntil?: string | null;
    confidencePct?: number | null;
  };
  riskPlan?: {
    bias?: string;
    avoid?: string;
    riskTrigger?: string;
    invalidation?: string;
    crowding?: string;
  };
  flowSummary?: {
    cvd?: string;
    oi?: string;
    funding?: string;
    takerBuyRatio?: number | null;
  };
  sources?: Array<{
    id: string;
    name: string;
    kind: 'market' | 'derived' | 'model' | 'news';
    timestamp: string;
    detail?: string;
  }>;
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

export interface TerminalPreset {
  id: string;
  label: string;
  count: number;
  tone: 'normal' | 'warn' | 'danger';
  sampleSymbols: string[];
  freshness: string;
}

export interface TerminalAnomaly {
  id: string;
  symbol: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  summary: string;
  supportingMetrics: Record<string, number | string | null | undefined>;
  source: 'scanner_alert' | 'opportunity_scan';
  timestamp: number;
}

export interface TerminalStatusEnvelope {
  ok: boolean;
  data: {
    regime: {
      label: string;
      score: number;
    };
    btcDominance: {
      value: number;
    };
    scanner: {
      running: boolean;
      nextScan: string | null;
      intervalSeconds: number | null;
      universe: string | null;
    };
    presets: TerminalPreset[];
    alertCount: number;
    anomalyCount: number;
    scannedAt: number;
  };
}

export interface TerminalQueryPresetsEnvelope {
  ok: boolean;
  presets: TerminalPreset[];
  updatedAt: number;
}

export interface TerminalAnomaliesEnvelope {
  ok: boolean;
  anomalies: TerminalAnomaly[];
  updatedAt: number;
}

export interface DepthLadderEnvelope {
  ok: boolean;
  data: {
    pair: string;
    timeframe: string;
    symbol: string;
    currentPrice: number | null;
    bestBid: number | null;
    bestAsk: number | null;
    spreadBps: number | null;
    imbalanceRatio: number | null;
    bidVolume: number | null;
    askVolume: number | null;
    bids: Array<{ price: number; qty: number; notional: number; weight: number }>;
    asks: Array<{ price: number; qty: number; notional: number; weight: number }>;
    updatedAt: number;
  };
}

export interface LiquidationClustersEnvelope {
  ok: boolean;
  data: {
    pair: string;
    timeframe: string;
    symbol: string;
    currentPrice: number | null;
    range: {
      min: number | null;
      max: number | null;
    };
    nearestLong: {
      liquidatedSide: 'long' | 'short';
      price: number;
      usd: number;
      distancePct: number;
    } | null;
    nearestShort: {
      liquidatedSide: 'long' | 'short';
      price: number;
      usd: number;
      distancePct: number;
    } | null;
    clusters: Array<{
      liquidatedSide: 'long' | 'short';
      price: number;
      usd: number;
      distancePct: number;
    }>;
    updatedAt: number;
  };
}
