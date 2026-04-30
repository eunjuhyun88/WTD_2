import type { BinanceKline } from '$lib/contracts/marketContext';
import type { OIHistoryPoint } from '$lib/server/marketDataService';

export type BinanceKlineWithTaker = BinanceKline & { takerBuyBaseAssetVolume?: number };

export type ForceOrderLite = { side: 'BUY' | 'SELL'; price: number; origQty: number };

export type AnalyzeRawBundle = {
  klines: BinanceKlineWithTaker[];
  klines1h: BinanceKlineWithTaker[];
  ticker: any;
  markPrice: number | null;
  indexPrice: number | null;
  oiPoint: number | null;
  oiHistory1h: OIHistoryPoint[] | null;
  lsTop: number | null;
  depth: {
    bids: Array<[number, number]>;
    asks: Array<[number, number]>;
    bidVolume: number;
    askVolume: number;
    ratio: number;
  } | null;
  takerPoints: Array<{ buySellRatio: number }>;
  forceOrders: ForceOrderLite[];
  fundingRate: number | null;
};

export type EngineSettled = {
  deepResult: any | null;
  scoreResult: any | null;
  deepError: unknown | null;
  scoreError: unknown | null;
};

export type AnalyzeRequestInput = {
  symbol: string;
  tf: string;
  from?: number;
  to?: number;
};

export type AnalyzeDerived = {
  currentPrice: number;
  oi_notional: number | undefined;
  short_liq_usd: number;
  long_liq_usd: number;
  oi_pct: number;
  taker_ratio: number | undefined;
  vol_24h: number | undefined;
  spreadBps: number | null;
  imbalancePct: number | null;
  depthView: any;
  liqClusters: Array<{ side: 'BUY' | 'SELL'; price: number; usd: number; distancePct: number }>;
};
