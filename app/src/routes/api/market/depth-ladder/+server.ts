import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizePair, normalizeTimeframe } from '$lib/server/marketFeedService';
import { pairToSymbol } from '$lib/server/providers/binance';
import { readRaw, klinesRawIdForTimeframe } from '$lib/server/providers/rawSources';
import { KnownRawId } from '$lib/contracts/ids';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { marketMicroLimiter } from '$lib/server/rateLimit';
import { buildDepthView } from '$lib/server/analyze/helpers';
import { getHotCached } from '$lib/server/hotCache';

const DEPTH_TTL_MS = 15_000;

export const GET: RequestHandler = async ({ getClientAddress, request, url }) => {
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: marketMicroLimiter,
    scope: 'market:depth-ladder',
    max: 20,
    tooManyMessage: 'Too many depth requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const pair = normalizePair(url.searchParams.get('pair'));
    const timeframe = normalizeTimeframe(url.searchParams.get('timeframe'));
    const symbol = pairToSymbol(pair);
    const payload = await getHotCached(`depth-ladder:${symbol}:${timeframe}`, DEPTH_TTL_MS, async () => {
      const [depth, klines] = await Promise.all([
        readRaw(KnownRawId.DEPTH_L2_20, { symbol }).catch(() => null),
        readRaw(klinesRawIdForTimeframe(timeframe), { symbol, limit: 2 }).catch(() => []),
      ]);

      const depthView = buildDepthView(depth);
      const currentPrice = Array.isArray(klines) && klines.length > 0 ? Number(klines[klines.length - 1]?.close ?? 0) : 0;
      const bestBid = depthView?.bids[0]?.price ?? null;
      const bestAsk = depthView?.asks[0]?.price ?? null;
      const spreadBps =
        bestBid != null && bestAsk != null && currentPrice > 0
          ? ((bestAsk - bestBid) / currentPrice) * 10_000
          : null;
      const imbalanceRatio =
        depthView && depthView.askVolume > 0
          ? depthView.bidVolume / depthView.askVolume
          : null;

      return {
        pair,
        timeframe,
        symbol,
        currentPrice: currentPrice || null,
        bestBid,
        bestAsk,
        spreadBps,
        imbalanceRatio,
        bidVolume: depthView?.bidVolume ?? null,
        askVolume: depthView?.askVolume ?? null,
        bids: depthView?.bids ?? [],
        asks: depthView?.asks ?? [],
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
    console.error('[market/depth-ladder] unexpected error:', error);
    return json({ error: 'Failed to load depth ladder' }, { status: 500 });
  }
};
