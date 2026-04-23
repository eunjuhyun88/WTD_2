import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/marketReferenceStack', () => ({
	loadMarketReferenceStack: vi.fn(),
}));

vi.mock('$lib/server/authSecurity', () => ({
	runIpRateLimitGuard: vi.fn(async () => ({ ok: true })),
}));

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

		const request = new Request('http://localhost/api/market/reference-stack?symbol=BTC');
		const response = await GET({
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
		expect(response.headers.get('Cache-Control')).toContain('public');
	});

	it('rejects invalid symbols before touching the service', async () => {
		const request = new Request('http://localhost/api/market/reference-stack?symbol=BTC/USDT');
		const response = await GET({
			url: new URL(request.url),
			request,
			getClientAddress: () => '127.0.0.2',
		} as any);

		expect(response.status).toBe(400);
		expect(loadMarketReferenceStack).not.toHaveBeenCalled();
	});
});
