import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(),
}));

vi.mock('$lib/server/engineTransport', () => ({
  engineFetch: vi.fn(),
}));

import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';

describe('/api/terminal/pattern-seed/judge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards canonical similar run id and candidate id to engine quality judge', async () => {
    vi.mocked(getAuthUserFromCookies).mockResolvedValueOnce({ id: 'user-1' } as any);
    vi.mocked(engineFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, judgement_id: 'judge-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const request = new Request('http://localhost/api/terminal/pattern-seed/judge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        runId: 'sim-run-1',
        candidateId: 'ptb-window-1',
        verdict: 'good',
        symbol: 'PTBUSDT',
        layerAScore: 0.88,
        layerBScore: 0.82,
        layerCScore: null,
        finalScore: 0.91,
      }),
    });

    const response = await POST({ request, cookies: {} } as any);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, judgementId: 'judge-1' });
    expect(engineFetch).toHaveBeenCalledWith(
      '/search/quality/judge',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          run_id: 'sim-run-1',
          candidate_id: 'ptb-window-1',
          verdict: 'good',
          symbol: 'PTBUSDT',
          layer_a_score: 0.88,
          layer_b_score: 0.82,
          layer_c_score: null,
          final_score: 0.91,
          user_id: 'user-1',
        }),
      }),
    );
  });
});
