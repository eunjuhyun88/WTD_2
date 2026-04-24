import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/marketFeedService', () => ({
	normalizePair: vi.fn((value: string | null) => value ?? 'BTC/USDT'),
	normalizeTimeframe: vi.fn((value: string | null) => value ?? '4h'),
}));

vi.mock('$lib/server/perpContextBridge', () => ({
	loadPerpContextBridge: vi.fn(),
}));

vi.mock('$lib/server/marketFlow', () => ({
	loadMarketFlow: vi.fn(),
}));

vi.mock('$lib/server/marketEvents', () => ({
	loadMarketEvents: vi.fn(),
}));

vi.mock('$lib/server/marketNews', () => ({
	loadMarketNews: vi.fn(),
}));

vi.mock('$lib/server/marketTrending', () => ({
	loadMarketTrending: vi.fn(),
}));

vi.mock('$lib/server/marketCapPlane', () => ({
	adaptEngineMarketCapSnapshot: vi.fn(() => ({
		at: Date.now(),
		btcDominance: 63.4,
		dominanceChange24h: 0.6,
		marketCapChange24hPct: -1.3,
		stablecoinMcapUsd: null,
		stablecoinMcapChange24hPct: -0.7,
		confidence: 0.74,
		providers: {},
	})),
	fetchMarketCapOverview: vi.fn(),
}));

vi.mock('$lib/server/opportunityScan', () => ({
	getOrRunOpportunityScan: vi.fn(),
}));

import { loadPerpContextBridge } from '$lib/server/perpContextBridge';
import { loadMarketFlow } from '$lib/server/marketFlow';
import { loadMarketEvents } from '$lib/server/marketEvents';
import { loadMarketNews } from '$lib/server/marketNews';
import { loadMarketTrending } from '$lib/server/marketTrending';
import { fetchMarketCapOverview } from '$lib/server/marketCapPlane';
import { getOrRunOpportunityScan } from '$lib/server/opportunityScan';
import { GET } from './+server';

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

describe('/api/terminal/intel-policy', () => {
	it('uses direct loaders for flow/events and fact-backed macro without internal route loopbacks', async () => {
		const bridge = {
			pair: 'ETH/USDT',
			timeframe: '4h',
			symbol: 'ETHUSDT',
			enginePerp: null,
			legacyDeriv: null,
		};
		vi.mocked(loadPerpContextBridge).mockResolvedValueOnce(bridge as any);
		vi.mocked(loadMarketFlow).mockResolvedValueOnce({
			data: {
				pair: 'ETH/USDT',
				timeframe: '4h',
				token: 'ETH',
				bias: 'SHORT',
				snapshot: {
					source: {
						binance: true,
						coinalyze: true,
						coinmarketcap: false,
					},
					funding: null,
					lsRatio: null,
					liqLong24h: 0,
					liqShort24h: 0,
					priceChangePct: 0,
					quoteVolume24h: 0,
					cmcPrice: null,
					cmcMarketCap: null,
					cmcVolume24hUsd: null,
					cmcChange24hPct: null,
					cmcUpdatedAt: null,
					cmcKeyConfigured: false,
				},
				records: [],
			},
			headers: {
				upstream: 'facts/perp-context',
				state: 'adapter',
			},
		} as any);
		vi.mocked(loadMarketEvents).mockResolvedValueOnce({
			data: {
				pair: 'ETH/USDT',
				timeframe: '4h',
				records: [],
			},
			headers: {
				upstream: 'facts/perp-context',
				state: 'adapter',
			},
		} as any);
		vi.mocked(loadMarketNews).mockResolvedValueOnce({
			records: [],
			total: 0,
			offset: 0,
			limit: 40,
			hasMore: false,
			sources: { rss: 0, social: 0 },
			referenceSources: {},
		} as any);
		vi.mocked(loadMarketTrending).mockResolvedValueOnce({
			trending: [],
			gainers: [],
			losers: [],
			mostVisited: [],
			dexHot: [],
			updatedAt: Date.now(),
		} as any);
		vi.mocked(getOrRunOpportunityScan).mockResolvedValueOnce({
			payload: {
				result: {
					coins: [],
				},
				alerts: [],
				cachedAt: Date.now(),
			},
			cacheStatus: 'miss',
		} as any);

		const seenUrls: string[] = [];
		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url =
				typeof input === 'string'
					? input
					: input instanceof Request
						? input.url
						: input.toString();
			seenUrls.push(url);

			if (url.startsWith('/api/facts/market-cap')) {
				return jsonResponse({
					ok: true,
					owner: 'engine',
					plane: 'fact',
					kind: 'market_cap',
					status: 'live',
					generated_at: '2026-04-23T00:00:00Z',
					btc_dominance: 63.4,
					total_market_cap: 1000000000000,
					stablecoin_market_cap: 150000000000,
				});
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
		expect(vi.mocked(loadPerpContextBridge)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(loadMarketFlow)).toHaveBeenCalledWith(fetchMock, {
			pair: 'ETH/USDT',
			timeframe: '4h',
			perpBridge: bridge,
		});
		expect(vi.mocked(loadMarketEvents)).toHaveBeenCalledWith(fetchMock, {
			pair: 'ETH/USDT',
			timeframe: '4h',
			perpBridge: bridge,
		});
		expect(vi.mocked(loadMarketNews)).toHaveBeenCalledWith({
			limit: 40,
			offset: 0,
			token: 'ETH',
			interval: '1m',
			sortBy: 'importance',
		});
		expect(vi.mocked(loadMarketTrending)).toHaveBeenCalledWith({
			limit: 20,
			section: 'all',
		});
		expect(vi.mocked(getOrRunOpportunityScan)).toHaveBeenCalledWith(15);
		expect(vi.mocked(fetchMarketCapOverview)).not.toHaveBeenCalled();
		expect(seenUrls.some((url) => url.startsWith('/api/market/news'))).toBe(false);
		expect(seenUrls.some((url) => url.startsWith('/api/market/trending'))).toBe(false);
		expect(seenUrls.some((url) => url.startsWith('/api/terminal/opportunity-scan'))).toBe(false);
		expect(seenUrls.some((url) => url.startsWith('/api/market/events'))).toBe(false);
		expect(seenUrls.some((url) => url.startsWith('/api/market/flow'))).toBe(false);
		expect(seenUrls.some((url) => url.startsWith('/api/market/macro-overview'))).toBe(false);
		expect(seenUrls).toContain('/api/facts/market-cap?offline=true');
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
