import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { KnownRawId } from '$lib/contracts/ids';
import type {
  FootprintBucket,
  HeatmapBand,
  MarketMicrostructurePayload,
  MarketTradePrint,
} from '$lib/contracts/marketMicrostructure';
import { buildDepthView } from '$lib/server/analyze/helpers';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { getHotCached } from '$lib/server/hotCache';
import { normalizePair, normalizeTimeframe } from '$lib/server/marketFeedService';
import { pairToSymbol } from '$lib/server/providers/binance';
import { readRaw, klinesRawIdForTimeframe } from '$lib/server/providers/rawSources';
import { marketMicrostructureLimiter } from '$lib/server/rateLimit';

const MICRO_TTL_MS = 4_000;

function clampLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '250', 10);
  if (!Number.isFinite(parsed)) return 250;
  return Math.max(50, Math.min(500, parsed));
}

function safeDiv(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

function toTradePrints(trades: Array<{
  id: number;
  time: number;
  price: number;
  qty: number;
  notional: number;
  side: 'BUY' | 'SELL';
  isBuyerMaker: boolean;
}>): MarketTradePrint[] {
  return trades
    .filter((trade) => Number.isFinite(trade.price) && Number.isFinite(trade.qty) && trade.price > 0 && trade.qty > 0)
    .sort((a, b) => b.time - a.time || b.id - a.id)
    .map((trade) => ({
      id: trade.id,
      time: trade.time,
      price: trade.price,
      qty: trade.qty,
      notional: trade.notional,
      side: trade.side,
      isBuyerMaker: trade.isBuyerMaker,
    }));
}

function buildFootprint(trades: MarketTradePrint[], currentPrice: number | null): { bucketSize: number | null; buckets: FootprintBucket[] } {
  if (trades.length === 0) return { bucketSize: null, buckets: [] };

  const prices = trades.map((trade) => trade.price);
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const base = currentPrice && currentPrice > 0 ? currentPrice : prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const span = Math.max(0, high - low);
  const bucketSize = Math.max(base * 0.0001, span / 10, 0.0001);
  const buckets = new Map<number, FootprintBucket>();

  for (const trade of trades) {
    const bucketKey = Math.floor(trade.price / bucketSize);
    const priceLow = bucketKey * bucketSize;
    const priceHigh = priceLow + bucketSize;
    const existing = buckets.get(bucketKey) ?? {
      price: priceLow + bucketSize / 2,
      priceLow,
      priceHigh,
      buyQty: 0,
      sellQty: 0,
      buyNotional: 0,
      sellNotional: 0,
      deltaQty: 0,
      deltaNotional: 0,
      totalNotional: 0,
      tradeCount: 0,
      weight: 0,
    };

    if (trade.side === 'BUY') {
      existing.buyQty += trade.qty;
      existing.buyNotional += trade.notional;
    } else {
      existing.sellQty += trade.qty;
      existing.sellNotional += trade.notional;
    }
    existing.tradeCount += 1;
    existing.totalNotional += trade.notional;
    existing.deltaQty = existing.buyQty - existing.sellQty;
    existing.deltaNotional = existing.buyNotional - existing.sellNotional;
    buckets.set(bucketKey, existing);
  }

  const rows = [...buckets.values()].sort((a, b) => b.price - a.price);
  const maxNotional = Math.max(1, ...rows.map((bucket) => bucket.totalNotional));
  return {
    bucketSize,
    buckets: rows.map((bucket) => ({
      ...bucket,
      weight: bucket.totalNotional / maxNotional,
    })),
  };
}

function buildHeatmapBands(depthView: ReturnType<typeof buildDepthView> | null): HeatmapBand[] {
  if (!depthView) return [];
  const bidBands = depthView.bids.map((level) => ({
    price: level.price,
    side: 'bid' as const,
    notional: level.notional,
    intensity: level.weight,
  }));
  const askBands = depthView.asks.map((level) => ({
    price: level.price,
    side: 'ask' as const,
    notional: level.notional,
    intensity: level.weight,
  }));
  return [...askBands, ...bidBands].sort((a, b) => b.price - a.price).slice(0, 16);
}

export const GET: RequestHandler = async ({ getClientAddress, request, url }) => {
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: marketMicrostructureLimiter,
    scope: 'market:microstructure:v2',
    max: 90,
    tooManyMessage: 'Too many microstructure requests. Please wait.',
    allowDistributedInfraFallback: true,
  });
  if (!guard.ok) return guard.response;

  try {
    const pair = normalizePair(url.searchParams.get('pair'));
    const timeframe = normalizeTimeframe(url.searchParams.get('timeframe'));
    const symbol = pairToSymbol(pair);
    const limit = clampLimit(url.searchParams.get('limit'));

    const payload = await getHotCached(`microstructure:${symbol}:${timeframe}:${limit}`, MICRO_TTL_MS, async (): Promise<MarketMicrostructurePayload> => {
      const [depth, aggTrades, klines] = await Promise.all([
        readRaw(KnownRawId.DEPTH_L2_20, { symbol }).catch(() => null),
        readRaw(KnownRawId.AGG_TRADES_RECENT, { symbol, limit }).catch(() => []),
        readRaw(klinesRawIdForTimeframe(timeframe), { symbol, limit: 2 }).catch(() => []),
      ]);

      const depthView = buildDepthView(depth, 12);
      const trades = toTradePrints(Array.isArray(aggTrades) ? aggTrades : []);
      const lastTradePrice = trades[0]?.price ?? null;
      const lastKlinePrice = Array.isArray(klines) && klines.length > 0 ? Number(klines[klines.length - 1]?.close ?? 0) : null;
      const midpoint =
        depthView?.bids[0]?.price != null && depthView?.asks[0]?.price != null
          ? (depthView.bids[0].price + depthView.asks[0].price) / 2
          : null;
      const currentPrice = lastTradePrice ?? midpoint ?? (lastKlinePrice && lastKlinePrice > 0 ? lastKlinePrice : null);
      const bestBid = depthView?.bids[0]?.price ?? null;
      const bestAsk = depthView?.asks[0]?.price ?? null;
      const spreadBps =
        bestBid != null && bestAsk != null && currentPrice != null && currentPrice > 0
          ? ((bestAsk - bestBid) / currentPrice) * 10_000
          : null;
      const bidNotional = depthView?.bidVolume ?? null;
      const askNotional = depthView?.askVolume ?? null;
      const depthTotal = (bidNotional ?? 0) + (askNotional ?? 0);
      const imbalancePct = depthTotal > 0 ? (((bidNotional ?? 0) - (askNotional ?? 0)) / depthTotal) * 100 : null;
      const buyNotional = trades.reduce((sum, trade) => sum + (trade.side === 'BUY' ? trade.notional : 0), 0);
      const sellNotional = trades.reduce((sum, trade) => sum + (trade.side === 'SELL' ? trade.notional : 0), 0);
      const tapeSpanMs = trades.length > 1 ? Math.max(1, trades[0].time - trades[trades.length - 1].time) : 0;
      const tradesPerMinute = tapeSpanMs > 0 ? (trades.length / tapeSpanMs) * 60_000 : null;
      const recentNotional = buyNotional + sellNotional;
      const topDepthNotional =
        (depthView?.bids.slice(0, 3).reduce((sum, level) => sum + level.notional, 0) ?? 0) +
        (depthView?.asks.slice(0, 3).reduce((sum, level) => sum + level.notional, 0) ?? 0);
      const absorptionRatio = safeDiv(topDepthNotional, topDepthNotional + recentNotional);
      const footprint = buildFootprint(trades, currentPrice);

      return {
        pair,
        timeframe,
        symbol,
        source: 'binance-futures-rest',
        currentPrice,
        orderbook: {
          bestBid,
          bestAsk,
          spreadBps,
          imbalanceRatio: depthView?.ratio ?? null,
          bidNotional,
          askNotional,
          bids: depthView?.bids ?? [],
          asks: depthView?.asks ?? [],
        },
        tradeTape: {
          limit,
          trades,
          buyNotional,
          sellNotional,
          tradesPerMinute,
        },
        footprint,
        heatmap: {
          bands: buildHeatmapBands(depthView),
        },
        stats: {
          spreadBps,
          imbalancePct,
          tradesPerMinute,
          absorptionPct: absorptionRatio == null ? null : absorptionRatio * 100,
        },
        updatedAt: Date.now(),
      };
    });

    return json(
      { ok: true, data: payload },
      {
        headers: {
          'Cache-Control': 'public, max-age=4',
        },
      },
    );
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('pair must be like')) {
      return json({ ok: false, error: error.message }, { status: 400 });
    }
    if (typeof error?.message === 'string' && error.message.includes('timeframe must be one of')) {
      return json({ ok: false, error: error.message }, { status: 400 });
    }
    console.error('[market/microstructure] unexpected error:', error);
    return json({ ok: false, error: 'Failed to load market microstructure' }, { status: 500 });
  }
};
