// ═══════════════════════════════════════════════════════════════
// Stockclaw — FRED Macro Data API
// ═══════════════════════════════════════════════════════════════
// Exposes Fed Funds, Treasuries, Yield Curve, CPI, M2 to client

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchFredMacroData, hasFredKey } from '$lib/server/fred';

export const GET: RequestHandler = async () => {
  if (!hasFredKey()) {
    return json({ error: 'FRED API key not configured' }, { status: 503 });
  }

  try {
    const data = await fetchFredMacroData();
    return json(
      { ok: true, data },
      { headers: { 'Cache-Control': 'public, max-age=300' } }
    );
  } catch (error: unknown) {
    console.error('[api/macro/fred] error:', error);
    return json({ error: 'Failed to fetch FRED data' }, { status: 500 });
  }
};
