export type MicrostructureSide = 'BUY' | 'SELL';

export interface MarketDepthLevel {
  price: number;
  qty: number;
  notional: number;
  weight: number;
}

export interface MarketTradePrint {
  id: number;
  time: number;
  price: number;
  qty: number;
  notional: number;
  side: MicrostructureSide;
  isBuyerMaker: boolean;
}

export interface FootprintBucket {
  price: number;
  priceLow: number;
  priceHigh: number;
  buyQty: number;
  sellQty: number;
  buyNotional: number;
  sellNotional: number;
  deltaQty: number;
  deltaNotional: number;
  totalNotional: number;
  tradeCount: number;
  weight: number;
}

export interface HeatmapBand {
  price: number;
  side: 'bid' | 'ask';
  notional: number;
  intensity: number;
}

export interface MarketMicrostructurePayload {
  pair: string;
  timeframe: string;
  symbol: string;
  source: 'binance-futures-rest';
  currentPrice: number | null;
  orderbook: {
    bestBid: number | null;
    bestAsk: number | null;
    spreadBps: number | null;
    imbalanceRatio: number | null;
    bidNotional: number | null;
    askNotional: number | null;
    bids: MarketDepthLevel[];
    asks: MarketDepthLevel[];
  };
  tradeTape: {
    limit: number;
    trades: MarketTradePrint[];
    buyNotional: number;
    sellNotional: number;
    tradesPerMinute: number | null;
  };
  footprint: {
    bucketSize: number | null;
    buckets: FootprintBucket[];
  };
  heatmap: {
    bands: HeatmapBand[];
  };
  stats: {
    spreadBps: number | null;
    imbalancePct: number | null;
    tradesPerMinute: number | null;
    absorptionPct: number | null;
  };
  updatedAt: number;
}

export interface MarketMicrostructureResponse {
  ok: boolean;
  data?: MarketMicrostructurePayload;
  error?: string;
}
