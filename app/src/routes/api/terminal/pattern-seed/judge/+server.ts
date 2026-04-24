import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';

const JudgeBodySchema = z.object({
  runId: z.string().min(1),
  candidateId: z.string().min(1),
  verdict: z.enum(['good', 'bad', 'neutral']),
  symbol: z.string().optional(),
  layerAScore: z.number().optional(),
  layerBScore: z.number().nullable().optional(),
  layerCScore: z.number().nullable().optional(),
  finalScore: z.number().optional(),
});

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ ok: false, error: 'Authentication required' }, { status: 401 });

    const body = JudgeBodySchema.parse(await request.json());

    const response = await engineFetch('/search/quality/judge', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        run_id: body.runId,
        candidate_id: body.candidateId,
        verdict: body.verdict,
        symbol: body.symbol ?? null,
        layer_a_score: body.layerAScore ?? null,
        layer_b_score: body.layerBScore ?? null,
        layer_c_score: body.layerCScore ?? null,
        final_score: body.finalScore ?? null,
        user_id: user.id,
      }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return json({ ok: false, error: `Engine judge failed: ${response.status}` }, { status: 502 });
    }

    const payload = await response.json();
    return json({ ok: true, judgementId: payload.judgement_id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ ok: false, error: 'Invalid judge payload' }, { status: 400 });
    }
    return json({ ok: false, error: String(error) }, { status: 500 });
  }
};
