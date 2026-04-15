import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizePair, normalizeTimeframe } from '$lib/server/marketFeedService';
import { pairToSymbol } from '$lib/server/providers/binance';
import { readRaw, klinesRawIdForTimeframe } from '$lib/server/providers/rawSources';
import { KnownRawId } from '$lib/contracts/ids';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { marketMicroLimiter } from '$lib/server/rateLimit';
import { buildLiquidationClusters } from '$lib/server/analyze/helpers';
import { getHotCached } from '$lib/server/hotCache';

const LIQ_TTL_MS = 15_000;

type ClusterShape = {
  liquidatedSide: 'long' | 'short';
  price: number;
  usd: number;
  distancePct: number;
};

function toCluster(item: { side: 'BUY' | 'SELL'; price: number; usd: number; distancePct: number }): ClusterShape {
  return {
    liquidatedSide: item.side === 'SELL' ? 'long' : 'short',
    price: item.price,
    usd: item.usd,
    distancePct: item.distancePct,
  };
}

export const GET: RequestHandler = async ({ getClientAddress, request, url }) => {
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: marketMicroLimiter,
    scope: 'market:liquidation-clusters',
    max: 20,
    tooManyMessage: 'Too many liquidation requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const pair = normalizePair(url.searchParams.get('pair'));
    const timeframe = normalizeTimeframe(url.searchParams.get('timeframe'));
    const symbol = pairToSymbol(pair);
    const payload = await getHotCached(`liquidation-clusters:${symbol}:${timeframe}`, LIQ_TTL_MS, async () => {
      const [forceOrders, klines] = await Promise.all([
        readRaw(KnownRawId.FORCE_ORDERS_1H, { symbol }).catch(() => []),
        readRaw(klinesRawIdForTimeframe(timeframe), { symbol, limit: 2 }).catch(() => []),
      ]);

      const currentPrice = Array.isArray(klines) && klines.length > 0 ? Number(klines[klines.length - 1]?.close ?? 0) : 0;
      const clusters = buildLiquidationClusters(Array.isArray(forceOrders) ? forceOrders : [], currentPrice, 8).map(toCluster);
      const longClusters = clusters.filter((cluster) => cluster.liquidatedSide === 'long');
      const shortClusters = clusters.filter((cluster) => cluster.liquidatedSide === 'short');

      return {
        pair,
        timeframe,
        symbol,
        currentPrice: currentPrice || null,
        range: {
          min: clusters.length > 0 ? Math.min(...clusters.map((cluster) => cluster.price)) : null,
          max: clusters.length > 0 ? Math.max(...clusters.map((cluster) => cluster.price)) : null,
        },
        nearestLong: longClusters[0] ?? null,
        nearestShort: shortClusters[0] ?? null,
        clusters,
        updatedAt: Date.now(),
      };
    });

    return json(
      {
        ok: true,
        data: payload,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=15',
        },
      },
    );
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('pair must be like')) {
      return json({ error: error.message }, { status: 400 });
    }
    if (typeof error?.message === 'string' && error.message.includes('timeframe must be one of')) {
      return json({ error: error.message }, { status: 400 });
    }
    console.error('[market/liquidation-clusters] unexpected error:', error);
    return json({ error: 'Failed to load liquidation clusters' }, { status: 500 });
  }
};
