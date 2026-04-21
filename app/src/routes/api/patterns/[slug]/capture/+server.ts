// POST /api/patterns/[slug]/capture
// Body: { symbol, user_id?, phase?, timeframe?, capture_kind?, candidate_transition_id?, scan_id?, user_note?, chart_context?, feature_snapshot?, block_scores?, outcome_id?, verdict_id? }
// Returns: { ok, capture_id, pattern_slug, symbol, status }
// Proxies to engine POST /patterns/{slug}/capture

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { terminalReadLimiter } from '$lib/server/rateLimit';

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export const POST: RequestHandler = async ({ request, params, getClientAddress }) => {
  if (!terminalReadLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const res = await fetch(`${ENGINE_URL}/patterns/${params.slug}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      return json({ ok: false, error: err }, { status: res.status });
    }

    return json(await res.json());
  } catch (err) {
    console.error('[api/patterns/[slug]/capture] engine error:', err);
    return json({ ok: false, error: 'engine unavailable' }, { status: 503 });
  }
};
