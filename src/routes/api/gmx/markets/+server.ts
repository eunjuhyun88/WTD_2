// ═══════════════════════════════════════════════════════════════
// Stockclaw — GMX V2 Markets API
// ═══════════════════════════════════════════════════════════════
// GET /api/gmx/markets
// Returns available GMX V2 markets on Arbitrum.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMarkets } from '$lib/server/gmxV2';
import { gmxReadLimiter } from '$lib/server/rateLimit';

export const GET: RequestHandler = async ({ getClientAddress }) => {
  const ip = getClientAddress();
  if (!gmxReadLimiter.check(ip)) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const markets = getMarkets();
    return json({ ok: true, markets });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Failed to fetch markets' }, { status: 500 });
  }
};
