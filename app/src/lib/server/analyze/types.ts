import type { BinanceKline } from '$lib/engine/types';
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
