import { describe, expect, it } from 'vitest';
import { KnownRawId } from '$lib/contracts/ids';
import {
	buildRawReadMicroCacheKey,
	parseRawReadMicroCacheTtlMs,
	skipRawReadMicroCache,
} from './rawReadMicroCache';

describe('rawReadMicroCache', () => {
	it('buildRawReadMicroCacheKey uses id only for empty input', () => {
		expect(buildRawReadMicroCacheKey(KnownRawId.FEAR_GREED_VALUE, {})).toBe(KnownRawId.FEAR_GREED_VALUE);
		expect(buildRawReadMicroCacheKey(KnownRawId.FEAR_GREED_VALUE, null)).toBe(KnownRawId.FEAR_GREED_VALUE);
	});

	it('buildRawReadMicroCacheKey includes serialized input', () => {
		expect(buildRawReadMicroCacheKey(KnownRawId.KLINES_4H, { symbol: 'BTCUSDT', limit: 600 })).toBe(
			`${KnownRawId.KLINES_4H}:{"symbol":"BTCUSDT","limit":600}`,
		);
	});

	it('skipRawReadMicroCache skips memoized or live atoms', () => {
		expect(skipRawReadMicroCache(KnownRawId.TICKER_SYMBOL)).toBe(true);
		expect(skipRawReadMicroCache(KnownRawId.COINALYZE_OI_HIST_TF)).toBe(true);
		expect(skipRawReadMicroCache(KnownRawId.DEPTH_LIVE)).toBe(true);
		expect(skipRawReadMicroCache(KnownRawId.KLINES_1H)).toBe(false);
	});

	it('parseRawReadMicroCacheTtlMs respects env', () => {
		const prev = process.env.RAW_READ_CACHE_TTL_MS;
		try {
			delete process.env.RAW_READ_CACHE_TTL_MS;
			expect(parseRawReadMicroCacheTtlMs()).toBe(2500);

			process.env.RAW_READ_CACHE_TTL_MS = '0';
			expect(parseRawReadMicroCacheTtlMs()).toBe(null);

			process.env.RAW_READ_CACHE_TTL_MS = 'off';
			expect(parseRawReadMicroCacheTtlMs()).toBe(null);

			process.env.RAW_READ_CACHE_TTL_MS = '4000';
			expect(parseRawReadMicroCacheTtlMs()).toBe(4000);

			process.env.RAW_READ_CACHE_TTL_MS = '500';
			expect(parseRawReadMicroCacheTtlMs()).toBe(1000);
		} finally {
			if (prev === undefined) delete process.env.RAW_READ_CACHE_TTL_MS;
			else process.env.RAW_READ_CACHE_TTL_MS = prev;
		}
	});
});
