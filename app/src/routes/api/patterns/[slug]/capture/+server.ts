// POST /api/patterns/[slug]/capture
// Legacy compatibility shim.
// Expands the slug URL into the canonical app capture contract and forwards to engine POST /captures.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { terminalReadLimiter } from '$lib/server/rateLimit';

export const POST: RequestHandler = async ({ request, params, getClientAddress, cookies }) => {
  if (!terminalReadLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }
    const body = await request.json();
    const payload = {
      ...body,
      pattern_slug: params.slug,
      user_id: user.id,
    };
    const res = await engineFetch('/captures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err) {
    console.error('[api/patterns/[slug]/capture] engine error:', err);
    return json({ ok: false, error: 'engine unavailable' }, { status: 503 });
  }
};
