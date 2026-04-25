import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/rateLimit', () => ({
	terminalReadLimiter: { check: vi.fn(() => true) },
}));

vi.mock('$lib/server/providers/binance', () => ({
	pairToSymbol: vi.fn(() => 'BTCUSDT'),
}));

vi.mock('$lib/server/providers/rawSources', () => ({
	readRaw: vi.fn(),
}));

vi.mock('$lib/server/marketFeedService', () => ({
	fetchDerivatives: vi.fn(),
	normalizePair: vi.fn((value: string | null) => value ?? 'BTC/USDT'),
	normalizeTimeframe: vi.fn((value: string | null) => value ?? '4h'),
}));

vi.mock('$lib/server/coinmarketcap', () => ({
	fetchCoinMarketCapQuote: vi.fn(),
	hasCoinMarketCapApiKey: vi.fn(() => true),
}));

vi.mock('$lib/server/enginePlanes/facts', () => ({
	fetchFactPerpContextProxy: vi.fn(),
}));

import { readRaw } from '$lib/server/providers/rawSources';
import { fetchDerivatives } from '$lib/server/marketFeedService';
import { fetchCoinMarketCapQuote } from '$lib/server/coinmarketcap';
import { fetchFactPerpContextProxy } from '$lib/server/enginePlanes/facts';
import { GET } from './+server';

describe('/api/market/flow', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('prefers engine perp context and keeps the public payload stable', async () => {
		vi.mocked(readRaw).mockResolvedValue({
			priceChangePercent: '4.25',
			quoteVolume: '5600000000',
		} as any);
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
		vi.mocked(fetchCoinMarketCapQuote).mockResolvedValue({
			price: 72000,
			marketCap: 1400000000000,
			volume24h: 78000000000,
			change24hPct: 4.2,
			updatedAt: '2026-04-23T00:00:00Z',
		} as any);

		const req = new Request('http://localhost/api/market/flow?pair=BTC/USDT&timeframe=4h');
		const res = await GET({
			fetch: globalThis.fetch,
			url: new URL(req.url),
			getClientAddress: () => '127.0.0.1',
		} as any);

		expect(res.status).toBe(200);
		expect(res.headers.get('x-wtd-plane')).toBe('fact');
		expect(res.headers.get('x-wtd-upstream')).toBe('facts/perp-context+ticker-bridge');
		expect(res.headers.get('x-wtd-state')).toBe('adapter');
		expect(vi.mocked(fetchDerivatives)).not.toHaveBeenCalled();

		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.data.bias).toBe('LONG');
		expect(body.data.snapshot.funding).toBe(-0.0012);
		expect(body.data.snapshot.lsRatio).toBe(0.91);
		expect(body.data.snapshot.liqLong24h).toBeNull();
		expect(body.data.snapshot.liqShort24h).toBeNull();
		expect(body.data.snapshot.quoteVolume24h).toBe(5600000000);
		expect(body.data.records).toHaveLength(2);
		expect(body.data.records[0].source).toBe('ENGINE_FACT');
		expect(body.data.records[0].text).toContain('OI Δ24h +5.40%');
	});

	it('falls back to legacy derivatives when engine perp context is unavailable', async () => {
		vi.mocked(readRaw).mockResolvedValue({
			priceChangePercent: '-1.2',
			quoteVolume: '2200000000',
		} as any);
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
		vi.mocked(fetchCoinMarketCapQuote).mockResolvedValue(null as any);

		const req = new Request('http://localhost/api/market/flow?pair=ETH/USDT&timeframe=4h');
		const res = await GET({
			fetch: globalThis.fetch,
			url: new URL(req.url),
			getClientAddress: () => '127.0.0.1',
		} as any);

		expect(res.status).toBe(200);
		expect(res.headers.get('x-wtd-upstream')).toBe('legacy-compute');
		expect(res.headers.get('x-wtd-state')).toBe('fallback');
		expect(vi.mocked(fetchDerivatives)).toHaveBeenCalledTimes(1);

		const body = await res.json();
		expect(body.data.bias).toBe('SHORT');
		expect(body.data.snapshot.funding).toBe(0.0008);
		expect(body.data.snapshot.liqLong24h).toBe(21000000);
		expect(body.data.snapshot.liqShort24h).toBe(9000000);
		expect(body.data.records[0].source).toBe('COINALYZE');
	});

	it('stays degraded instead of failing when both engine and legacy derivatives are unavailable', async () => {
		vi.mocked(readRaw).mockResolvedValue({
			priceChangePercent: '0.8',
			quoteVolume: '1500000000',
		} as any);
		vi.mocked(fetchFactPerpContextProxy).mockResolvedValue(null);
		vi.mocked(fetchDerivatives).mockRejectedValue(new Error('coinalyze down'));
		vi.mocked(fetchCoinMarketCapQuote).mockResolvedValue(null as any);

		const req = new Request('http://localhost/api/market/flow?pair=BTC/USDT&timeframe=4h');
		const res = await GET({
			fetch: globalThis.fetch,
			url: new URL(req.url),
			getClientAddress: () => '127.0.0.1',
		} as any);

		expect(res.status).toBe(200);
		expect(res.headers.get('x-wtd-upstream')).toBe('ticker-bridge');
		expect(res.headers.get('x-wtd-state')).toBe('degraded');

		const body = await res.json();
		expect(body.data.bias).toBe('NEUTRAL');
		expect(body.data.snapshot.funding).toBeNull();
		expect(body.data.snapshot.lsRatio).toBeNull();
		expect(body.data.records).toHaveLength(1);
		expect(body.data.records[0].source).toBe('BINANCE');
	});
});
