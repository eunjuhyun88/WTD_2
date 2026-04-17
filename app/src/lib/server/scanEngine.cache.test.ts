import { afterEach, describe, expect, it } from 'vitest';
import {
	buildScanEngineCacheKey,
	getScanEngineCacheTtlMs,
	getScanEngineMaxConcurrent,
	getScanEngineMaxWaiters,
} from './scanEngine';

describe('scanEngine cache config', () => {
	const prevTtl = process.env.SCAN_ENGINE_CACHE_TTL_MS;
	const prevMax = process.env.SCAN_ENGINE_MAX_CONCURRENT;
	const prevWait = process.env.SCAN_ENGINE_MAX_WAITERS;

	afterEach(() => {
		if (prevTtl === undefined) delete process.env.SCAN_ENGINE_CACHE_TTL_MS;
		else process.env.SCAN_ENGINE_CACHE_TTL_MS = prevTtl;
		if (prevMax === undefined) delete process.env.SCAN_ENGINE_MAX_CONCURRENT;
		else process.env.SCAN_ENGINE_MAX_CONCURRENT = prevMax;
		if (prevWait === undefined) delete process.env.SCAN_ENGINE_MAX_WAITERS;
		else process.env.SCAN_ENGINE_MAX_WAITERS = prevWait;
	});

	it('buildScanEngineCacheKey normalizes pair and tf', () => {
		expect(buildScanEngineCacheKey('btc/usdt', '4H')).toBe('BTC/USDT:4h');
		expect(buildScanEngineCacheKey('', '1h')).toBe('BTC/USDT:1h');
	});

	it('getScanEngineCacheTtlMs clamps and defaults', () => {
		delete process.env.SCAN_ENGINE_CACHE_TTL_MS;
		expect(getScanEngineCacheTtlMs()).toBe(30_000);

		process.env.SCAN_ENGINE_CACHE_TTL_MS = '2000';
		expect(getScanEngineCacheTtlMs()).toBe(5_000);

		process.env.SCAN_ENGINE_CACHE_TTL_MS = '999999';
		expect(getScanEngineCacheTtlMs()).toBe(120_000);
	});

	it('getScanEngineMaxConcurrent clamps and defaults', () => {
		delete process.env.SCAN_ENGINE_MAX_CONCURRENT;
		expect(getScanEngineMaxConcurrent()).toBe(24);

		process.env.SCAN_ENGINE_MAX_CONCURRENT = '0';
		expect(getScanEngineMaxConcurrent()).toBe(1);

		process.env.SCAN_ENGINE_MAX_CONCURRENT = '200';
		expect(getScanEngineMaxConcurrent()).toBe(128);
	});

	it('getScanEngineMaxWaiters clamps and defaults', () => {
		delete process.env.SCAN_ENGINE_MAX_WAITERS;
		expect(getScanEngineMaxWaiters()).toBe(256);

		process.env.SCAN_ENGINE_MAX_WAITERS = '3';
		expect(getScanEngineMaxWaiters()).toBe(8);

		process.env.SCAN_ENGINE_MAX_WAITERS = '99999';
		expect(getScanEngineMaxWaiters()).toBe(10_000);
	});
});
