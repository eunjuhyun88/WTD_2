import { readRaw, klinesRawIdForTimeframe } from '$lib/server/providers/rawSources';
import { KnownRawId } from '$lib/contracts/ids';
import type { AnalyzeRawBundle, BinanceKlineWithTaker, ForceOrderLite } from './types';
import type { OIHistoryPoint } from '$lib/server/marketDataService';
import { createSharedPublicRouteCache } from '$lib/server/publicRouteCache';
import { fetchKlinesServer } from '$lib/server/providers/binance';
import type { BinanceKline } from '$lib/contracts/marketContext';
import { futuresToSpot, COINBASE_PRODUCT_MAP } from './symbolMap';

const COINBASE_CACHE_TTL_MS = 60_000;
const coinbaseCache = new Map<string, { expires: number; pct: number | null }>();

async function fetchCoinbaseCandles(symbol: string): Promise<number | null> {
  const productId = COINBASE_PRODUCT_MAP[symbol.toUpperCase()];
  if (!productId) return null;

  const cached = coinbaseCache.get(symbol);
  if (cached && cached.expires > Date.now()) return cached.pct;

  try {
    const url = `https://api.exchange.coinbase.com/products/${productId}/ticker`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = await res.json() as { price?: string };
    const coinbasePrice = parseFloat(data.price ?? '0');
    if (!coinbasePrice) return null;
    coinbaseCache.set(symbol, { expires: Date.now() + COINBASE_CACHE_TTL_MS, pct: coinbasePrice });
    return coinbasePrice;
  } catch {
    return null;
  }
}

const ANALYZE_COLLECTOR_TTL_MS = 5_000;
const analyzeCollectorCache = createSharedPublicRouteCache<AnalyzeRawBundle>({
	scope: 'analyze-collector',
	ttlMs: ANALYZE_COLLECTOR_TTL_MS,
});

export async function collectAnalyzeInputs(symbol: string, tf: string): Promise<AnalyzeRawBundle> {
  const cacheKey = `${symbol.trim().toUpperCase()}:${tf.trim().toLowerCase()}`;
  const { payload } = await analyzeCollectorCache.run(cacheKey, async () => {
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
      spotKlinesRaw,
      coinbaseCandles,
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
      fetchKlinesServer(futuresToSpot(symbol), '1h', 720).catch((): BinanceKline[] => []),
      fetchCoinbaseCandles(symbol).catch(() => null),
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
      spotKlines: (spotKlinesRaw ?? []) as BinanceKline[],
      coinbaseSpotPrice: typeof coinbaseCandles === 'number' ? coinbaseCandles : null,
    };
  });
  return payload;
}
