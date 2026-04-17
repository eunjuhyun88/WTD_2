export interface MarketKline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Binance OHLCV kline normalized for app contracts. */
export type BinanceKline = MarketKline;

/** Binance 24hr ticker response fields used by app server providers. */
export interface Binance24hr {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
}

export type MarketTrendDirection = 'RISING' | 'FALLING' | 'FLAT';

export interface MarketTrendAnalysis {
  direction: MarketTrendDirection;
  slope: number;
  acceleration: number;
  strength: number;
  duration: number;
  fromValue: number;
  toValue: number;
  changePct: number;
}

export interface MarketContext {
  pair: string;
  timeframe: string;
  klines: MarketKline[];
  klines1h?: MarketKline[];
  klines1d?: MarketKline[];

  ticker?: {
    change24h: number;
    volume24h: number;
    high24h?: number;
    low24h?: number;
  };

  derivatives?: {
    oi?: number | null;
    funding?: number | null;
    predFunding?: number | null;
    lsRatio?: number | null;
    liqLong?: number;
    liqShort?: number;
  };

  onchain?: {
    mvrv?: number | null;
    nupl?: number | null;
    sopr?: number | null;
    exchangeNetflow?: number | null;
    whaleActivity?: number | null;
    minerFlow?: number | null;
    stablecoinFlow?: number | null;
    activeAddresses?: number | null;
    etfFlow?: number | null;
    realizedCap?: number | null;
    supplyInProfit?: number | null;
  };

  sentiment?: {
    fearGreed?: number | null;
    socialVolume?: number | null;
    socialSentiment?: number | null;
    newsImpact?: number | null;
    searchTrend?: number | null;
  };

  macro?: {
    dxy?: number | null;
    dxyTrend?: MarketTrendAnalysis | null;
    equityTrend?: MarketTrendAnalysis | null;
    yieldTrend?: MarketTrendAnalysis | null;
    btcDominance?: number | null;
    btcDomTrend?: MarketTrendAnalysis | null;
    stablecoinMcap?: number | null;
    stableMcapTrend?: MarketTrendAnalysis | null;
    eventProximity?: number | null;
  };
}
