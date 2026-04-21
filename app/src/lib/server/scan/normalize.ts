import type { Binance24hr, MarketKline } from '$lib/contracts/marketContext';
import type {
  ServerExtendedMarketData,
  ServerMarketContext,
} from '$lib/server/cogochi/signalSnapshot';
import type {
  BtcOnchain,
  ForceOrder,
  MempoolData,
  OIHistoryPoint,
  OrderBookSnapshot,
  TakerRatioPoint,
} from '$lib/server/marketDataService';

type ExtendedKlineSeries = NonNullable<ServerExtendedMarketData['klines5m']>;
type ExtendedKlinePoint = ExtendedKlineSeries[number];
type SnapshotForceOrders = NonNullable<ServerExtendedMarketData['forceOrders']>;
type SnapshotOiHistory = NonNullable<ServerExtendedMarketData['oiHistory5m']>;

type ForceOrderLike = {
  side: string;
  price: number | string;
  origQty: number | string;
  time: number;
};

type BtcOnchainLike = Pick<BtcOnchain, 'nTx' | 'avgTxValue'>;
type MempoolLike = Pick<MempoolData, 'count' | 'fastestFee'>;

export interface BaseSignalSnapshotBundle {
  marketContext: ServerMarketContext;
  currentPrice: number;
  change24h: number;
  volume24h: number;
  oiChangePct: number;
  takerRatio: number | undefined;
  klines1dExt: ExtendedKlineSeries | undefined;
}

export interface BuildBaseSignalSnapshotBundleInput {
  symbol: string;
  timeframe: string;
  klines: MarketKline[];
  klines1h?: MarketKline[];
  klines1d?: MarketKline[];
  ticker?: Binance24hr | null;
  funding?: number | null;
  oiPoint?: number | null;
  lsTop?: number | null;
  fearGreed?: number | null;
  oiHistory?: OIHistoryPoint[];
  takerData?: TakerRatioPoint[];
}

function parseTickerNumber(value: string | undefined): number {
  return Number.parseFloat(value ?? '') || 0;
}

function toFiniteNumber(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function computeOiChangePct(oiHistory: OIHistoryPoint[] | undefined): number {
  if (!oiHistory || oiHistory.length < 2) return 0;
  const first = oiHistory[0]?.sumOpenInterestValue ?? 0;
  const last = oiHistory[oiHistory.length - 1]?.sumOpenInterestValue ?? 0;
  return first > 0 ? ((last - first) / first) * 100 : 0;
}

export function getLatestTakerRatio(
  takerData: TakerRatioPoint[] | undefined,
): number | undefined {
  if (!takerData || takerData.length === 0) return undefined;
  return takerData[takerData.length - 1]?.buySellRatio;
}

export function mapExtendedKlines<T extends MarketKline>(
  klines: T[] | undefined,
  getBuyVolume?: (kline: T) => number | undefined,
): ExtendedKlineSeries | undefined {
  if (!klines || klines.length === 0) return undefined;
  return klines.map((kline) => {
    const point: ExtendedKlinePoint = {
      time: kline.time,
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
      volume: kline.volume,
    };
    const buyVolume = getBuyVolume?.(kline);
    if (buyVolume != null) {
      point.buyVolume = buyVolume;
    }
    return point;
  });
}

export function mapForceOrders(
  forceOrders: ForceOrderLike[] | undefined,
): SnapshotForceOrders | undefined {
  if (!forceOrders || forceOrders.length === 0) return undefined;
  return forceOrders.map((order) => ({
    side: order.side.toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
    price: toFiniteNumber(order.price),
    qty: toFiniteNumber(order.origQty),
    time: order.time,
  }));
}

export function mapOiHistory(oiHistory: OIHistoryPoint[] | undefined): SnapshotOiHistory | undefined {
  if (!oiHistory || oiHistory.length === 0) return undefined;
  return oiHistory.map((point) => ({
    timestamp: point.timestamp,
    oi: point.sumOpenInterestValue,
  }));
}

export function toDepthSnapshot(
  depth: OrderBookSnapshot | null | undefined,
): ServerExtendedMarketData['depth'] {
  if (!depth) return undefined;
  return {
    bidVolume: depth.bidVolume,
    askVolume: depth.askVolume,
    ratio: depth.ratio,
  };
}

export function toBtcOnchainSnapshot(
  btcOnchain: BtcOnchainLike | null | undefined,
): ServerExtendedMarketData['btcOnchain'] {
  if (!btcOnchain) return undefined;
  return {
    nTx: btcOnchain.nTx,
    avgTxValue: btcOnchain.avgTxValue,
  };
}

export function toMempoolSnapshot(
  mempool: MempoolLike | null | undefined,
): ServerExtendedMarketData['mempool'] {
  if (!mempool) return undefined;
  return {
    pending: mempool.count,
    fastestFee: mempool.fastestFee,
  };
}

export function buildBaseSignalSnapshotBundle(
  input: BuildBaseSignalSnapshotBundleInput,
): BaseSignalSnapshotBundle {
  const change24h = input.ticker ? parseTickerNumber(input.ticker.priceChangePercent) : 0;
  const volume24h = input.ticker ? parseTickerNumber(input.ticker.quoteVolume) : 0;
  const currentPrice = input.klines[input.klines.length - 1]?.close ?? 0;

  return {
    marketContext: {
      pair: input.symbol,
      timeframe: input.timeframe,
      klines: input.klines,
      klines1h: input.klines1h && input.klines1h.length > 0 ? input.klines1h : undefined,
      klines1d: input.klines1d && input.klines1d.length > 0 ? input.klines1d : undefined,
      ticker: input.ticker
        ? {
            change24h,
            volume24h,
            high24h: parseTickerNumber(input.ticker.highPrice),
            low24h: parseTickerNumber(input.ticker.lowPrice),
          }
        : undefined,
      derivatives: {
        oi: input.oiPoint,
        funding: input.funding,
        lsRatio: input.lsTop,
      },
      sentiment: {
        fearGreed: input.fearGreed,
      },
    },
    currentPrice,
    change24h,
    volume24h,
    oiChangePct: computeOiChangePct(input.oiHistory),
    takerRatio: getLatestTakerRatio(input.takerData),
    klines1dExt: mapExtendedKlines(input.klines1d),
  };
}
