import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRecentCaptures } from './terminalBackend';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('terminalBackend surface clients', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads recent captures through the runtime plane proxy', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        owner: 'engine',
        plane: 'runtime',
        status: 'fallback_local',
        generated_at: '2026-04-23T00:00:00Z',
        captures: [
          {
            capture_id: 'cap_1',
            capture_kind: 'pattern_candidate',
            symbol: 'BTCUSDT',
            pattern_slug: 'tradoor-oi-reversal-v1',
            timeframe: '4h',
            captured_at_ms: 1_776_566_400_000,
            chart_context: {},
            block_scores: {},
            status: 'pending_outcome',
          },
        ],
        count: 1,
      }),
    );

    const captures = await fetchRecentCaptures(8);

    expect(fetchMock).toHaveBeenCalledWith('/api/runtime/captures?limit=8');
    expect(captures).toHaveLength(1);
    expect(captures[0]?.capture_id).toBe('cap_1');
  });

  it('returns an empty list when runtime captures are unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 500));

    await expect(fetchRecentCaptures(8)).resolves.toEqual([]);
  });
});
