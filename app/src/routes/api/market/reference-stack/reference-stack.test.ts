import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/marketReferenceStack', () => ({
	loadMarketReferenceStack: vi.fn(),
}));

vi.mock('$lib/server/enginePlanes/facts', () => ({
	fetchFactReferenceStackProxy: vi.fn(),
}));

vi.mock('$lib/server/authSecurity', () => ({
	runIpRateLimitGuard: vi.fn(async () => ({ ok: true })),
}));

import { fetchFactReferenceStackProxy } from '$lib/server/enginePlanes/facts';
import { loadMarketReferenceStack } from '$lib/server/marketReferenceStack';
import { GET } from './+server';

describe('/api/market/reference-stack', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns the unified reference-stack payload with public cache headers', async () => {
		vi.mocked(loadMarketReferenceStack).mockResolvedValue({
			ok: true,
			at: 1_710_000_000_000,
			query: {
				symbol: 'BTCUSDT',
				baseAsset: 'BTC',
				coinId: 'bitcoin',
				exchange: 'Binance',
				chain: 'ethereum',
				entity: 'account',
				address: null,
				chainId: null,
				rootDataQuery: 'Bitcoin',
				unlockWindowDays: 30,
			},
			coverage: { total: 10, live: 7, blocked: 2, referenceOnly: 1 },
			entries: [],
		} as any);
		vi.mocked(fetchFactReferenceStackProxy).mockResolvedValue({
			ok: true,
			owner: 'engine',
			plane: 'fact',
			kind: 'reference_stack',
			status: 'transitional',
			generated_at: '2026-04-23T00:00:00Z',
			symbol: 'BTCUSDT',
			timeframe: '1h',
			sources: [{ id: 'klines', state: 'live', rows: 600, summary: '600 rows' }],
			coverage: { usable_now: 68, coverage_pct: 68 },
		});

		const request = new Request('http://localhost/api/market/reference-stack?symbol=BTC');
		const response = await GET({
			url: new URL(request.url),
			request,
			getClientAddress: () => '127.0.0.1',
			fetch: globalThis.fetch,
		} as any);

		expect(response.status).toBe(200);
		expect(loadMarketReferenceStack).toHaveBeenCalledWith({
			symbol: 'BTC',
			coinId: null,
			exchange: null,
			chain: null,
			entity: null,
			address: null,
			chainId: null,
			rootDataQuery: null,
			unlockWindowDays: 30,
		});
		expect(fetchFactReferenceStackProxy).toHaveBeenCalledWith(globalThis.fetch, {
			symbol: 'BTCUSDT',
			timeframe: '1h',
			offline: true,
		});
		expect(response.headers.get('Cache-Control')).toContain('public');
		expect(response.headers.get('x-wtd-upstream')).toBe('facts/reference-stack+curated-reference');
		const body = await response.json();
		expect(body.entries).toEqual([]);
		expect(body.factCoverage.kind).toBe('reference_stack');
		expect(body.factCoverage.sources[0].id).toBe('klines');
	});

	it('keeps the curated payload stable when engine reference-stack facts are unavailable', async () => {
		vi.mocked(fetchFactReferenceStackProxy).mockResolvedValue(null);
		vi.mocked(loadMarketReferenceStack).mockResolvedValue({
			ok: true,
			at: 1_710_000_000_000,
			query: {
				symbol: 'ETHUSDT',
				baseAsset: 'ETH',
				coinId: 'ethereum',
				exchange: 'Binance',
				chain: 'ethereum',
				entity: 'account',
				address: null,
				chainId: null,
				rootDataQuery: 'Ethereum',
				unlockWindowDays: 30,
			},
			coverage: { total: 10, live: 4, blocked: 4, referenceOnly: 2 },
			entries: [{ id: 'coingecko', status: 'live' }],
		} as any);

		const request = new Request('http://localhost/api/market/reference-stack?symbol=ETH');
		const response = await GET({
			url: new URL(request.url),
			request,
			getClientAddress: () => '127.0.0.1',
			fetch: globalThis.fetch,
		} as any);

		expect(response.status).toBe(200);
		expect(response.headers.get('x-wtd-upstream')).toBe('curated-reference');
		expect(response.headers.get('x-wtd-state')).toBe('fallback');
		const body = await response.json();
		expect(body.factCoverage).toBeUndefined();
		expect(body.entries).toEqual([{ id: 'coingecko', status: 'live' }]);
	});

	it('rejects invalid symbols before touching the service', async () => {
		const request = new Request('http://localhost/api/market/reference-stack?symbol=BTC/USDT');
		const response = await GET({
			url: new URL(request.url),
			request,
			getClientAddress: () => '127.0.0.2',
			fetch: globalThis.fetch,
		} as any);

		expect(response.status).toBe(400);
		expect(loadMarketReferenceStack).not.toHaveBeenCalled();
		expect(fetchFactReferenceStackProxy).not.toHaveBeenCalled();
	});
});
