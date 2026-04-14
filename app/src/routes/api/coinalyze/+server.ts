// ═══════════════════════════════════════════════════════════════
// Coinalyze API Proxy
// Proxies to api.coinalyze.net for OI, Funding, Liquidations, L/S
// GET /api/coinalyze?endpoint=open-interest-history&symbols=BTCUSDT_PERP.A&interval=4hour&from=...&to=...
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env as privateEnv } from '$env/dynamic/private';

const BASE = 'https://api.coinalyze.net/v1';

const ALLOWED_ENDPOINTS = [
  'open-interest',
  'open-interest-history',
  'funding-rate',
  'funding-rate-history',
  'predicted-funding-rate',
  'liquidation-history',
  'long-short-ratio-history',
  'ohlcv-history',
  'future-markets',
  'exchanges'
];

export const GET: RequestHandler = async ({ url }) => {
  const endpoint = url.searchParams.get('endpoint');
  const apiKey = privateEnv.COINALYZE_API_KEY?.trim() ?? '';

  if (!endpoint || !ALLOWED_ENDPOINTS.includes(endpoint)) {
    return json({ error: 'Invalid endpoint' }, { status: 400 });
  }

  if (!apiKey) {
    return json({ error: 'Missing API key' }, { status: 500 });
  }

  try {
    // Forward all query params except 'endpoint'
    const params = new URLSearchParams();
    for (const [key, value] of url.searchParams.entries()) {
      if (key !== 'endpoint') params.set(key, value);
    }
    params.set('api_key', apiKey);

    const res = await fetch(`${BASE}/${endpoint}?${params.toString()}`, {
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return json(
        { error: `Coinalyze ${res.status}`, detail: errText },
        { status: res.status === 429 ? 429 : 502 }
      );
    }

    const data = await res.json();
    return json(data, {
      headers: { 'Cache-Control': 'public, max-age=30' }
    });
  } catch (err) {
    console.error('[Coinalyze proxy]', err);
    return json({ error: 'Failed to fetch from Coinalyze' }, { status: 502 });
  }
};
