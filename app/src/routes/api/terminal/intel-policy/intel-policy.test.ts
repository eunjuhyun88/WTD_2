import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/marketFeedService', () => ({
	normalizePair: vi.fn((value: string | null) => value ?? 'BTC/USDT'),
	normalizeTimeframe: vi.fn((value: string | null) => value ?? '4h'),
}));

import { GET } from './+server';

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

describe('/api/terminal/intel-policy', () => {
	it('pulls macro overview into the flow panel so terminal intel uses the fact-backed macro lane', async () => {
		const seenUrls: string[] = [];
		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url =
				typeof input === 'string'
					? input
					: input instanceof Request
						? input.url
						: input.toString();
			seenUrls.push(url);

			if (url.startsWith('/api/market/news')) {
				return jsonResponse({ data: { records: [] } });
			}
			if (url.startsWith('/api/market/events')) {
				return jsonResponse({ data: { records: [] } });
			}
			if (url.startsWith('/api/market/flow')) {
				return jsonResponse({
					data: {
						snapshot: {
							funding: null,
							lsRatio: null,
							liqLong24h: 0,
							liqShort24h: 0,
							priceChangePct: 0,
							cmcChange24hPct: null,
						},
						records: [],
					},
				});
			}
			if (url.startsWith('/api/market/macro-overview')) {
				return jsonResponse({
					ok: true,
					success: true,
					btcDominance: 63.4,
					dominanceChange24h: 0.6,
					marketCapChange24hPct: -1.3,
					stablecoinMcapChange24hPct: -0.7,
					confidence: 0.74,
				});
			}
			if (url.startsWith('/api/market/trending')) {
				return jsonResponse({ data: { trending: [] } });
			}
			if (url.startsWith('/api/terminal/opportunity-scan')) {
				return jsonResponse({ data: { coins: [] } });
			}
			if (url.startsWith('/api/facts/ctx/fact')) {
				return jsonResponse({
					ok: true,
					owner: 'engine',
					plane: 'fact',
					status: 'live',
					generated_at: '2026-04-23T00:00:00Z',
					symbol: 'ETHUSDT',
					timeframe: '4h',
				});
			}
			if (url.startsWith('/api/runtime/captures')) {
				return jsonResponse({
					ok: true,
					owner: 'engine',
					plane: 'runtime',
					status: 'fallback_local',
					generated_at: '2026-04-23T00:00:00Z',
					captures: [],
					count: 0,
				});
			}
			return jsonResponse({ error: 'unexpected upstream' }, 404);
		});

		const req = new Request('http://localhost/api/terminal/intel-policy?pair=ETH/USDT&timeframe=4h');
		const res = await GET({
			fetch: fetchMock as typeof fetch,
			url: new URL(req.url),
			request: req,
		} as any);

		expect(res.status).toBe(200);
		expect(seenUrls.some((url) => url.startsWith('/api/market/macro-overview'))).toBe(true);
		expect(seenUrls).toContain('/api/facts/ctx/fact?symbol=ETHUSDT&timeframe=4h&offline=true');
		expect(seenUrls).toContain('/api/runtime/captures?symbol=ETHUSDT&limit=3');

		const body = await res.json();
		expect(body.ok).toBe(true);

		const macroCard = body.data.panels.flow.find((card: any) => card.id === 'flow:macro_regime');
		expect(macroCard).toBeTruthy();
		expect(macroCard.source).toBe('MACRO_OVERVIEW');
		expect(macroCard.bias).toBe('short');
		expect(macroCard.what).toContain('BTC.D 63.4%');
		expect(body.data.summary.domainsUsed).toContain('flow');
		expect(body.data.summary.agentContext).toEqual({
			factStatus: 'live',
			runtimeStatus: 'fallback_local',
			evidenceCount: 2,
			captures: 0,
			scanCandidates: 0,
			seedSearchCandidates: 0,
		});
	});
});
