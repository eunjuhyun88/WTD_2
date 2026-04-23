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
			sources: [{ id: 'klines', state: 'live', rows: 720, summary: '720 rows' }],
			coverage: {
				live: 41,
				partial: 27,
				blocked: 11,
				missing: 21,
				usable_now: 68,
				coverage_pct: 68,
			},
			catalogCounts: { promoted: 12 },
			notes: [],
		});

		const request = new Request('http://localhost/api/market/reference-stack?symbol=BTC');
		const response = await GET({
			fetch: vi.fn(),
			url: new URL(request.url),
			request,
			getClientAddress: () => '127.0.0.1',
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
		expect(fetchFactReferenceStackProxy).toHaveBeenCalledWith(expect.any(Function), {
			symbol: 'BTCUSDT',
			timeframe: '1h',
		});
		expect(response.headers.get('Cache-Control')).toContain('public');
		const body = await response.json();
		expect(body.entries).toEqual([]);
		expect(body.factCoverage).toEqual({
			status: 'transitional',
			generatedAt: '2026-04-23T00:00:00Z',
			symbol: 'BTCUSDT',
			timeframe: '1h',
			coverage: {
				live: 41,
				partial: 27,
				blocked: 11,
				missing: 21,
				usable_now: 68,
				coverage_pct: 68,
			},
			catalogCounts: { promoted: 12 },
			sources: [{ id: 'klines', state: 'live', rows: 720, summary: '720 rows' }],
		});
	});

	it('rejects invalid symbols before touching the service', async () => {
		const request = new Request('http://localhost/api/market/reference-stack?symbol=BTC/USDT');
		const response = await GET({
			fetch: vi.fn(),
			url: new URL(request.url),
			request,
			getClientAddress: () => '127.0.0.2',
		} as any);

		expect(response.status).toBe(400);
		expect(loadMarketReferenceStack).not.toHaveBeenCalled();
		expect(fetchFactReferenceStackProxy).not.toHaveBeenCalled();
	});
});
