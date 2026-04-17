import type { Direction } from './game';

export type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile';
export type PairQuality = 'strong' | 'medium' | 'weak' | 'boundary' | 'noise';

export interface RAGEntry {
  patternSignature: string;
  embedding: number[];
  regime: MarketRegime;
  pair: string;
  timeframe: string;
  humanDecision: {
    direction: Direction;
    confidence: number;
    reasonTags: string[];
    tp: number;
    sl: number;
  };
  aiDecision: {
    direction: Direction;
    confidence: number;
    topFactors: string[];
  };
  outcome: {
    winner: 'human' | 'ai' | 'draw';
    humanFBS: number;
    aiFBS: number;
    priceChange: number;
  };
  lesson: string;
  quality: PairQuality;
  timestamp: number;
  gameRecordId: string;
}

export interface RAGRecall {
  queriedPatterns: string[];
  similarGamesFound: number;
  historicalWinRate: number;
  suggestedDirection: Direction;
  confidenceAdjustment: number;
}

export interface AgentSignal {
  vote: string;
  confidence: number;
  note?: string;
}

export interface ChainMatureResult {
  updatedCount: number;
  chainId: string;
  outcomeType: string;
  outcomeValue: number;
}

export interface QuickTradeRAGInput {
  tradeId: string;
  pair: string;
  dir: 'LONG' | 'SHORT';
  entry: number;
  currentPrice: number;
  tp: number | null;
  sl: number | null;
  source: string;
  note?: string;
}

export interface SignalActionRAGInput {
  actionId: string;
  pair: string;
  dir: string;
  actionType: string;
  source: string;
  confidence: number | null;
}
