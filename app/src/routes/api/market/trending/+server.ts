// ═══════════════════════════════════════════════════════════════
// Unified Trending API
// ═══════════════════════════════════════════════════════════════
// Combines: CoinMarketCap (trending/gainers/most-visited)
//           + LunarCrush (social volume/sentiment)
//           + DexScreener (DEX hot tokens/boosts)

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { terminalReadLimiter } from '$lib/server/rateLimit';
import { loadMarketTrending } from '$lib/server/marketTrending';

// ─── Handler ──────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  if (!terminalReadLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  const limitParam = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);
  const rawSection = url.searchParams.get('section') ?? 'all'; // all, trending, gainers, dex

  try {
    const section =
      rawSection === 'trending' || rawSection === 'gainers' || rawSection === 'dex'
        ? rawSection
        : 'all';
    const data = await loadMarketTrending({ limit: limitParam, section });

    return json(
      {
        ok: true,
        data,
      },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  } catch (error: unknown) {
    console.error('[api/market/trending] error:', error);
    return json({ error: 'Failed to fetch trending data' }, { status: 500 });
  }
};
