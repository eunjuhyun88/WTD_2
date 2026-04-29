/**
 * GET /api/market/kimchi-premium
 *
 * W-0307 F-12 — Kimchi Premium proxy.
 * Proxies engine GET /ctx/kimchi-premium (30s server-side cache on engine).
 * Returns zeros on engine failure (graceful degradation).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export interface KimchiPremiumPayload {
  premium_pct: number;
  source: string;
  binance_btc_usdt: number;
  usd_krw: number | null;
  ts: number;
}

const FALLBACK: KimchiPremiumPayload = {
  premium_pct: 0,
  source: 'fallback',
  binance_btc_usdt: 0,
  usd_krw: null,
  ts: 0,
};

export const GET: RequestHandler = async () => {
  try {
    const res = await engineFetch('/ctx/kimchi-premium', {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return json({ ok: true, data: FALLBACK, stale: true });
    const body = await res.json() as KimchiPremiumPayload;
    return json({ ok: true, data: body });
  } catch {
    return json({ ok: true, data: FALLBACK, stale: true });
  }
};
