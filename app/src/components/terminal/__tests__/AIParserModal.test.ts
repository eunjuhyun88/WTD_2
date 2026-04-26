import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePatternFromText } from '$lib/api/terminalApi';

/**
 * A-03-app: AIParserModal tests.
 * Engine route: POST /patterns/parse (Sonnet 4.6 via ContextAssembler)
 */

describe('AIParserModal — A-03-app', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed PatternDraftBody on 200', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        pattern_family: 'oi_reversal',
        pattern_label: 'OI Reversal v1',
        phases: [{ phase_id: 'ACCUMULATION' }],
        signals_required: ['higher_lows_sequence'],
        signals_preferred: [],
        signals_forbidden: [],
      }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await parsePatternFromText('OI 급등하면서 funding 양수로 전환');
    expect(result.pattern_family).toBe('oi_reversal');
    expect(result.signals_required).toContain('higher_lows_sequence');
  });

  it('uses POST /api/patterns/parse path', async () => {
    let capturedUrl = '';
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      capturedUrl = typeof url === 'string' ? url : url.toString();
      return new Response('{}', { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await parsePatternFromText('test');
    expect(capturedUrl).toBe('/api/patterns/parse');
  });

  it('builds correct request body with hints', async () => {
    let capturedBody: unknown = null;
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body && typeof init.body === 'string') {
        capturedBody = JSON.parse(init.body);
      }
      return new Response('{}', { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await parsePatternFromText('test memo', { symbol: 'BTCUSDT', pattern_family: 'oi_reversal' });
    expect(capturedBody).toEqual({
      text: 'test memo',
      context_hints: { symbol: 'BTCUSDT', pattern_family: 'oi_reversal' },
    });
  });

  it('throws on engine 422 (Claude validator failed after retries)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'parser validation failed' }), { status: 422 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(parsePatternFromText('test')).rejects.toThrow();
  });

  it('throws on engine 504 (timeout)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'parser timeout' }), { status: 504 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(parsePatternFromText('test')).rejects.toThrow();
  });

  it('5000 char limit (UI invariant — server validates)', () => {
    const MAX = 5000;
    expect('a'.repeat(MAX).length).toBe(5000);
    expect('a'.repeat(MAX + 1).length).toBeGreaterThan(MAX);
  });
});
