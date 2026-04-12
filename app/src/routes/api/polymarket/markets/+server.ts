// ═══════════════════════════════════════════════════════════════
// Stockclaw — Polymarket Markets Proxy
// Proxies to gamma-api.polymarket.com to bypass CORS
// GET /api/polymarket/markets?limit=20&category=crypto
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const GAMMA_API = 'https://gamma-api.polymarket.com';

export const GET: RequestHandler = async ({ url }) => {
  const limit = url.searchParams.get('limit') || '20';
  const category = url.searchParams.get('category') || '';

  try {
    // Build query params
    const params = new URLSearchParams({
      limit,
      active: 'true',
      closed: 'false',
      order: 'volume',
      ascending: 'false'
    });

    // Filter by crypto-related categories if specified
    if (category) {
      params.set('tag', category);
    }

    const res = await fetch(`${GAMMA_API}/markets?${params.toString()}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Stockclaw/1.0'
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return json({ error: `Polymarket API returned ${res.status}`, markets: [] }, { status: 502 });
    }

    const data = await res.json();

    // Transform to our format
    const markets = (Array.isArray(data) ? data : []).map((m: Record<string, unknown>) => ({
      id: m.id || m.conditionId,
      question: m.question || '',
      slug: m.slug || '',
      category: m.category || m.groupSlug || '',
      endDate: m.endDate || m.end_date_iso || '',
      volume: parseFloat(String(m.volume || m.volumeNum || 0)),
      liquidity: parseFloat(String(m.liquidity || m.liquidityNum || 0)),
      active: m.active !== false,
      closed: m.closed === true,
      outcomes: m.outcomes || ['Yes', 'No'],
      outcomePrices: m.outcomePrices || ['0.5', '0.5'],
      image: m.image || '',
      icon: m.icon || ''
    }));

    return json({ markets }, { headers: { 'Cache-Control': 'public, max-age=120' } });
  } catch (err) {
    console.error('[Polymarket proxy] Error:', err);
    return json({ error: 'Failed to fetch from Polymarket', markets: [] }, { status: 502 });
  }
};
