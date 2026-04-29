import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALLOWED_NEXT,
  fetchLifecycleStatus,
  patchPatternStatus,
} from './lifecycleApi';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('lifecycleApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the client transition graph one-way', () => {
    expect(ALLOWED_NEXT.draft).toEqual(['candidate', 'archived']);
    expect(ALLOWED_NEXT.candidate).toEqual(['object', 'archived']);
    expect(ALLOWED_NEXT.object).toEqual(['archived']);
    expect(ALLOWED_NEXT.archived).toEqual([]);
  });

  it('fetches lifecycle status through the app proxy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true, slug: 'tradoor-oi-reversal-v1', status: 'candidate' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLifecycleStatus('tradoor/oi reversal');

    expect(fetchMock).toHaveBeenCalledWith('/api/patterns/tradoor%2Foi%20reversal/lifecycle-status');
    expect(result.status).toBe('candidate');
  });

  it('patches lifecycle status with reason', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        slug: 'tradoor-oi-reversal-v1',
        from_status: 'candidate',
        to_status: 'object',
        updated_at: 123,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await patchPatternStatus('tradoor-oi-reversal-v1', 'object', 'ready');

    expect(fetchMock).toHaveBeenCalledWith('/api/patterns/tradoor-oi-reversal-v1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'object', reason: 'ready' }),
    });
    expect(result.to_status).toBe('object');
  });

  it('throws engine detail on invalid transition', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ detail: 'Transition archived -> object not allowed' }, 422)),
    );

    await expect(patchPatternStatus('tradoor-oi-reversal-v1', 'object')).rejects.toThrow(
      'Transition archived -> object not allowed',
    );
  });
});
