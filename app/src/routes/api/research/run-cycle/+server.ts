import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const POST: RequestHandler = async () => {
  try {
    const res = await engineFetch('/research/autoresearch/trigger', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
    });

    if (res.status === 503) {
      return json({ ok: false, error: 'AutoResearch disabled on engine (AUTORESEARCH_ENABLED=false)' }, { status: 503 });
    }
    if (res.status === 403) {
      return json({ ok: false, error: 'Engine API key not configured' }, { status: 403 });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return json({ ok: false, error: text || `Engine error ${res.status}` }, { status: res.status });
    }

    const body = await res.json() as Record<string, unknown>;
    return json({
      ok: true,
      status:    body.status,
      runId:     body.run_id ?? null,
      nSymbols:  body.n_symbols ?? null,
      nPromoted: body.n_promoted ?? null,
      elapsedS:  body.elapsed_s ?? null,
    });
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
