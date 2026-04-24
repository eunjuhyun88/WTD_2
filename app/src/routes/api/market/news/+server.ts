// ═══════════════════════════════════════════════════════════════
// Unified News API (RSS + LunarCrush Social)
// ═══════════════════════════════════════════════════════════════
// Merges CoinDesk/Cointelegraph RSS with LunarCrush popular posts
// Supports pagination, importance scoring, and token filtering

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toBoundedInt } from '$lib/server/apiValidation';
import { terminalReadLimiter } from '$lib/server/rateLimit';
import { loadMarketNews } from '$lib/server/marketNews';

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  if (!terminalReadLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const limit = toBoundedInt(url.searchParams.get('limit'), 30, 1, 100);
    const offset = toBoundedInt(url.searchParams.get('offset'), 0, 0, 500);
    const token = (url.searchParams.get('token') || 'BTC').toUpperCase();
    const interval = url.searchParams.get('interval') || '1m'; // 1d, 1w, 1m, 3m, 6m
    const sortBy = url.searchParams.get('sort') || 'importance'; // importance | time
    const data = await loadMarketNews({
      limit,
      offset,
      token,
      interval,
      sortBy: sortBy === 'time' ? 'time' : 'importance',
    });

    return json(
      {
        ok: true,
        data,
      },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  } catch (error) {
    console.error('[market/news/get] unexpected error:', error);
    return json({ error: 'Failed to load market news' }, { status: 500 });
  }
};
