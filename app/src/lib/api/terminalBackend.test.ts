import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchConfluenceCurrent, fetchConfluenceHistory, fetchRecentCaptures } from './terminalBackend';

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

  it('loads confluence current and history through surface client helpers', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          at: 1_776_566_400_000,
          symbol: 'BTCUSDT',
          score: 42,
          confidence: 0.7,
          regime: 'bull',
          contributions: [],
          top: [],
          divergence: false,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          entries: [
            {
              at: 1_776_566_400_000,
              score: 42,
              confidence: 0.7,
              regime: 'bull',
              divergence: false,
            },
          ],
        }),
      );

    const current = await fetchConfluenceCurrent('BTCUSDT', '4h');
    const history = await fetchConfluenceHistory('BTCUSDT', 96);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/confluence/current?symbol=BTCUSDT&tf=4h');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/confluence/history?symbol=BTCUSDT&limit=96');
    expect(current?.score).toBe(42);
    expect(history[0]?.regime).toBe('bull');
  });
});
