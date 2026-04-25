import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/rateLimit', () => ({
	terminalReadLimiter: { check: vi.fn(() => true) },
}));

vi.mock('$lib/server/marketFeedService', () => ({
	fetchDerivatives: vi.fn(),
	normalizePair: vi.fn((value: string | null) => value ?? 'BTC/USDT'),
	normalizeTimeframe: vi.fn((value: string | null) => value ?? '4h'),
}));

vi.mock('$lib/server/providers/dexscreener', () => ({
	fetchDexAdsLatest: vi.fn(),
	fetchDexCommunityTakeoversLatest: vi.fn(),
	fetchDexTokenBoostsLatest: vi.fn(),
	fetchDexTokens: vi.fn(),
}));

vi.mock('$lib/server/enginePlanes/facts', () => ({
	fetchFactPerpContextProxy: vi.fn(),
}));

import { fetchDerivatives } from '$lib/server/marketFeedService';
import {
	fetchDexAdsLatest,
	fetchDexCommunityTakeoversLatest,
	fetchDexTokenBoostsLatest,
	fetchDexTokens,
} from '$lib/server/providers/dexscreener';
import { fetchFactPerpContextProxy } from '$lib/server/enginePlanes/facts';
import { GET } from './+server';

describe('/api/market/events', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(fetchDexCommunityTakeoversLatest).mockResolvedValue([]);
		vi.mocked(fetchDexTokenBoostsLatest).mockResolvedValue([]);
		vi.mocked(fetchDexAdsLatest).mockResolvedValue([]);
		vi.mocked(fetchDexTokens).mockResolvedValue([]);
	});

	it('prefers engine perp context for the dynamic derivatives event', async () => {
		vi.mocked(fetchFactPerpContextProxy).mockResolvedValue({
			ok: true,
			generated_at: '2026-04-23T00:00:00Z',
			metrics: {
				funding_rate: -0.0012,
				oi_change_24h: 0.054,
				long_short_ratio: 0.91,
			},
			regime: {
				crowding: 'crowded_shorts',
				cvd_state: 'buying',
			},
		});

		const req = new Request('http://localhost/api/market/events?pair=BTC/USDT&timeframe=4h');
		const res = await GET({
			fetch: globalThis.fetch,
			url: new URL(req.url),
			getClientAddress: () => '127.0.0.1',
		} as any);

		expect(res.status).toBe(200);
		expect(res.headers.get('x-wtd-plane')).toBe('fact');
		expect(res.headers.get('x-wtd-upstream')).toBe('facts/perp-context+dexscreener');
		expect(res.headers.get('x-wtd-state')).toBe('adapter');
		expect(vi.mocked(fetchDerivatives)).not.toHaveBeenCalled();

		const body = await res.json();
		expect(body.data.records).toHaveLength(1);
		expect(body.data.records[0].source).toBe('ENGINE_FACT');
		expect(body.data.records[0].text).toContain('OI Δ24h +5.40%');
	});

	it('falls back to legacy derivatives when engine perp context is unavailable', async () => {
		vi.mocked(fetchFactPerpContextProxy).mockResolvedValue(null);
		vi.mocked(fetchDerivatives).mockResolvedValue({
			pair: 'ETH/USDT',
			timeframe: '4h',
			oi: 3100000000,
			funding: 0.0008,
			predFunding: 0.0007,
			lsRatio: 1.15,
			liqLong24h: 21000000,
			liqShort24h: 9000000,
			updatedAt: Date.now(),
		});

		const req = new Request('http://localhost/api/market/events?pair=ETH/USDT&timeframe=4h');
		const res = await GET({
			fetch: globalThis.fetch,
			url: new URL(req.url),
			getClientAddress: () => '127.0.0.1',
		} as any);

		expect(res.status).toBe(200);
		expect(res.headers.get('x-wtd-upstream')).toBe('legacy-compute+dexscreener');
		expect(res.headers.get('x-wtd-state')).toBe('fallback');

		const body = await res.json();
		expect(body.data.records).toHaveLength(1);
		expect(body.data.records[0].source).toBe('COINALYZE');
		expect(body.data.records[0].text).toContain('Liq L/S 21,000,000/9,000,000');
	});

	it('stays degraded and serves Dex events when derivatives are unavailable', async () => {
		vi.mocked(fetchFactPerpContextProxy).mockResolvedValue(null);
		vi.mocked(fetchDerivatives).mockRejectedValue(new Error('coinalyze down'));
		vi.mocked(fetchDexCommunityTakeoversLatest).mockResolvedValue([
			{
				url: 'https://dexscreener.com/solana/abc',
				chainId: 'solana',
				tokenAddress: 'abc123',
				icon: null,
				header: null,
				description: null,
				links: null,
				claimDate: '2026-04-23T00:00:00Z',
			},
		]);
		vi.mocked(fetchDexTokens).mockResolvedValue([
			{
				baseToken: {
					address: 'abc123',
					symbol: 'ABC',
					name: 'Abc',
				},
			},
		] as any);

		const req = new Request('http://localhost/api/market/events?pair=BTC/USDT&timeframe=4h');
		const res = await GET({
			fetch: globalThis.fetch,
			url: new URL(req.url),
			getClientAddress: () => '127.0.0.1',
		} as any);

		expect(res.status).toBe(200);
		expect(res.headers.get('x-wtd-upstream')).toBe('dexscreener-only');
		expect(res.headers.get('x-wtd-state')).toBe('degraded');

		const body = await res.json();
		expect(body.data.records).toHaveLength(1);
		expect(body.data.records[0].source).toBe('DEXSCREENER');
		expect(body.data.records[0].text).toContain('커뮤니티 takeover 감지');
	});
});
