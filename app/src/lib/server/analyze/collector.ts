import { readRaw, klinesRawIdForTimeframe } from '$lib/server/providers/rawSources';
import { KnownRawId } from '$lib/contracts/ids';
import type { AnalyzeRawBundle, BinanceKlineWithTaker, ForceOrderLite } from './types';
import type { OIHistoryPoint } from '$lib/server/marketDataService';

export async function collectAnalyzeInputs(symbol: string, tf: string): Promise<AnalyzeRawBundle> {
  const [
    klines,
    klines1h,
    ticker,
    markPrice,
    indexPrice,
    oiPoint,
    oiHistory1h,
    lsTop,
    depth,
    takerPoints,
    forceOrders,
  ] = await Promise.all([
    readRaw(klinesRawIdForTimeframe(tf), { symbol, limit: 600 }),
    readRaw(KnownRawId.KLINES_1H, { symbol, limit: 100 }).catch((): BinanceKlineWithTaker[] => []),
    readRaw(KnownRawId.TICKER_24HR, { symbol }).catch(() => null),
    readRaw(KnownRawId.MARK_PRICE, { symbol }).catch(() => null),
    readRaw(KnownRawId.INDEX_PRICE, { symbol }).catch(() => null),
    readRaw(KnownRawId.OPEN_INTEREST_POINT, { symbol }).catch(() => null),
    readRaw(KnownRawId.OI_HIST_1H, { symbol }).catch(() => null),
    readRaw(KnownRawId.LONG_SHORT_TOP_1H, { symbol }).catch(() => null),
    readRaw(KnownRawId.DEPTH_L2_20, { symbol }).catch(() => null),
    readRaw(KnownRawId.TAKER_BUY_SELL_RATIO, { symbol }).catch(() => []),
    readRaw(KnownRawId.FORCE_ORDERS_1H, { symbol }).catch(() => []),
  ]);

  const fundingRate = await readRaw(KnownRawId.FUNDING_RATE, { symbol }).catch(() => null);

  return {
    klines: (klines ?? []) as BinanceKlineWithTaker[],
    klines1h: (klines1h ?? []) as BinanceKlineWithTaker[],
    ticker,
    markPrice,
    indexPrice,
    oiPoint,
    oiHistory1h: (Array.isArray(oiHistory1h) ? oiHistory1h : null) as OIHistoryPoint[] | null,
    lsTop,
    depth,
    takerPoints: (takerPoints ?? []) as Array<{ buySellRatio: number }>,
    forceOrders: (forceOrders ?? []) as ForceOrderLite[],
    fundingRate,
  };
}
