import { describe, expect, it, vi } from 'vitest';
import { loadAgentContextPack } from './agentContextPack';

function jsonResponse(body: unknown): Response {
	return Response.json(body);
}

describe('loadAgentContextPack', () => {
	it('loads bounded fact, search, and runtime context through plane proxies', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/facts/ctx/fact')) {
				return jsonResponse({
					ok: true,
					owner: 'engine',
					plane: 'fact',
					status: 'live',
					generated_at: '2026-04-23T00:00:00Z',
					fact_id: 'fact_1',
					symbol: 'BTCUSDT',
					timeframe: '1h',
					confluence: {
						score: 72,
						verdict: 'constructive',
						confidence: 0.68,
						regime: 'trend',
					},
				});
			}
			if (url === '/api/search/scan/scan_1') {
				return jsonResponse({
					ok: true,
					owner: 'engine',
					plane: 'search',
					status: 'fact_only',
					generated_at: '2026-04-23T00:00:00Z',
					scan_id: 'scan_1',
					request: { symbol: 'BTCUSDT', timeframe: '1h' },
					candidates: [
						{
							candidate_id: 'candidate_1',
							symbol: 'ETHUSDT',
							timeframe: '1h',
							score: 0.82,
							payload: { summary: 'compact candidate' },
						},
					],
				});
			}
			if (url === '/api/search/seed/run_1') {
				return jsonResponse({
					ok: true,
					owner: 'engine',
					plane: 'search',
					status: 'corpus_only',
					generated_at: '2026-04-23T00:00:00Z',
					run_id: 'run_1',
					request: { symbol: 'BTCUSDT', timeframe: '1h' },
					candidates: [],
				});
			}
			if (url.startsWith('/api/runtime/captures')) {
				return jsonResponse({
					ok: true,
					owner: 'engine',
					plane: 'runtime',
					status: 'fallback_local',
					generated_at: '2026-04-23T00:00:00Z',
					captures: [
						{
							capture_id: 'cap_1',
							capture_kind: 'manual_hypothesis',
							user_id: 'user-1',
							symbol: 'BTCUSDT',
							pattern_slug: 'tradoor',
							phase: 'BREAKOUT',
							timeframe: '1h',
							captured_at_ms: 1_776_566_400_000,
							candidate_id: 'candidate_1',
							scan_id: 'scan_1',
							user_note: 'watch reclaim',
							chart_context: {
								klines: [{ open_time: 1, open: 100, high: 110, low: 90, close: 108 }],
							},
							feature_snapshot: {
								ohlcv: [{ close: 108 }],
							},
							block_scores: { breakout: 0.8 },
							verdict_id: 'verdict_1',
							outcome_id: null,
							status: 'pending_outcome',
						},
					],
					count: 1,
				});
			}
			return new Response('not found', { status: 404 });
		});

		const pack = await loadAgentContextPack({
			fetchFn: fetchMock as typeof fetch,
			symbol: 'BTCUSDT',
			timeframe: '1h',
			userId: 'user-1',
			scanId: 'scan_1',
			seedRunId: 'run_1',
			captureLimit: 3,
		});

		const urls = fetchMock.mock.calls.map((call) => String(call[0]));
		expect(urls).toContain('/api/facts/ctx/fact?symbol=BTCUSDT&timeframe=1h&offline=true');
		expect(urls).toContain('/api/search/scan/scan_1');
		expect(urls).toContain('/api/search/seed/run_1');
		expect(urls).toContain('/api/runtime/captures?user_id=user-1&symbol=BTCUSDT&limit=3');
		expect(pack.facts?.fact_id).toBe('fact_1');
		expect(pack.scan?.scan_id).toBe('scan_1');
		expect(pack.seed_search?.run_id).toBe('run_1');
		expect(pack.runtime?.captures).toEqual([
			expect.objectContaining({
				id: 'cap_1',
				kind: 'manual_hypothesis',
				pattern_slug: 'tradoor',
				phase: 'BREAKOUT',
				user_note: 'watch reclaim',
			}),
		]);
		expect(pack.evidence?.map((item) => item.metric)).toEqual([
			'fact_state',
			'confluence',
			'scan_candidates',
			'seed_search_candidates',
			'runtime_captures',
		]);
		const serialized = JSON.stringify(pack);
		expect(serialized).not.toContain('klines');
		expect(serialized).not.toContain('open_time');
		expect(serialized).not.toContain('ohlcv');
	});

	it('does not call search routes when scan and seed ids are absent', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/facts/ctx/fact')) {
				return jsonResponse({
					ok: true,
					owner: 'engine',
					plane: 'fact',
					status: 'reference_only',
					generated_at: '2026-04-23T00:00:00Z',
					symbol: 'SOLUSDT',
					timeframe: '4h',
				});
			}
			if (url.startsWith('/api/runtime/captures')) {
				return jsonResponse({
					ok: true,
					owner: 'engine',
					plane: 'runtime',
					status: 'durable',
					generated_at: '2026-04-23T00:00:00Z',
					captures: [],
					count: 0,
				});
			}
			return new Response('not found', { status: 404 });
		});

		const pack = await loadAgentContextPack({
			fetchFn: fetchMock as typeof fetch,
			symbol: 'SOLUSDT',
			timeframe: '4h',
		});

		const urls = fetchMock.mock.calls.map((call) => String(call[0]));
		expect(urls.some((url) => url.startsWith('/api/search/'))).toBe(false);
		expect(pack.scan).toBeNull();
		expect(pack.seed_search).toBeNull();
		expect(pack.runtime?.captures).toEqual([]);
	});
});
