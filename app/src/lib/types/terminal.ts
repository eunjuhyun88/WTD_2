export type FreshnessStatus = 'live' | 'recent' | 'delayed' | 'stale' | 'disconnected';
export type TerminalSortKey = 'best_aligned' | 'highest_oi' | 'highest_vol' | 'most_crowded' | 'best_rr';
export type TFAlignment = '↑' | '↓' | '→';

export interface TerminalAsset {
  symbol: string;
  venue: string;
  lastPrice: number;
  changePct15m: number;
  changePct1h: number;
  changePct4h: number;
  volumeRatio1h: number;
  oiChangePct1h: number;
  fundingRate: number;
  fundingPercentile7d: number;
  spreadBps: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
  action: string;
  invalidation: string;
  sources: TerminalSource[];
  freshnessStatus: FreshnessStatus;
  tf15m: TFAlignment;
  tf1h: TFAlignment;
  tf4h: TFAlignment;
}

export interface TerminalVerdict {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  against: string[];
  action: string;
  invalidation: string;
  updatedAt: number;
}

export interface TerminalEvidence {
  metric: string;
  value: string;
  delta: string;
  interpretation: string;
  state: 'bullish' | 'bearish' | 'warning' | 'neutral';
  sourceCount: number;
}

export interface TerminalSource {
  label: string;
  category: 'Market' | 'Derived' | 'News' | 'Model';
  freshness: FreshnessStatus;
  updatedAt: number;
  rawValue?: string;
  method?: string;
  link?: string;
}

export interface TerminalQuery {
  id: string;
  label: string;
  action: string;
}

export interface TFLadder {
  tf15m: TFAlignment;
  tf1h: TFAlignment;
  tf4h: TFAlignment;
}
