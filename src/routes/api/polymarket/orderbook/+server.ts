// ═══════════════════════════════════════════════════════════════
// Stockclaw — Polymarket Orderbook Proxy
// Proxies to clob.polymarket.com for orderbook data
// GET /api/polymarket/orderbook?token_id=xxx
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CLOB_API = 'https://clob.polymarket.com';

export const GET: RequestHandler = async ({ url }) => {
  const tokenId = url.searchParams.get('token_id');

  if (!tokenId) {
    return json({ error: 'token_id parameter required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${CLOB_API}/book?token_id=${tokenId}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Stockclaw/1.0'
      }
    });

    if (!res.ok) {
      return json({ error: `CLOB API returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    return json(data);
  } catch (err) {
    console.error('[Polymarket orderbook proxy] Error:', err);
    return json({ error: 'Failed to fetch orderbook' }, { status: 502 });
  }
};
