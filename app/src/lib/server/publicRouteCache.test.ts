import { describe, expect, it } from 'vitest';
import { createSharedPublicRouteCache, type PublicRouteCacheEntry } from './publicRouteCache';

describe('createSharedPublicRouteCache', () => {
	it('returns hit after initial miss fills the cache', async () => {
		let nowMs = 1_000;
		const shared = new Map<string, PublicRouteCacheEntry<string>>();
		let builds = 0;

		const cache = createSharedPublicRouteCache<string>({
			scope: 'test:scope',
			ttlMs: 10_000,
			now: () => nowMs,
			getShared: async (_scope, key) => shared.get(key) ?? null,
			setShared: async (_scope, key, value) => {
				shared.set(key, value);
			},
		});

		const first = await cache.run('alpha', async () => {
			builds += 1;
			return 'fresh-value';
		});
		const second = await cache.run('alpha', async () => {
			builds += 1;
			return 'should-not-run';
		});

		expect(first.cacheStatus).toBe('miss');
		expect(second.cacheStatus).toBe('hit');
		expect(first.payload).toBe('fresh-value');
		expect(second.payload).toBe('fresh-value');
		expect(builds).toBe(1);
	});

	it('coalesces concurrent builders for the same key', async () => {
		let nowMs = 1_000;
		const shared = new Map<string, PublicRouteCacheEntry<string>>();
		let builds = 0;

		const cache = createSharedPublicRouteCache<string>({
			scope: 'test:scope',
			ttlMs: 10_000,
			now: () => nowMs,
			getShared: async (_scope, key) => shared.get(key) ?? null,
			setShared: async (_scope, key, value) => {
				shared.set(key, value);
			},
		});

		const slowBuilder = async () => {
			builds += 1;
			await new Promise((resolve) => setTimeout(resolve, 5));
			return 'shared-result';
		};

		const [first, second] = await Promise.all([
			cache.run('alpha', slowBuilder, { bypassCache: true }),
			cache.run('alpha', slowBuilder, { bypassCache: true }),
		]);

		expect(builds).toBe(1);
		expect(first.payload).toBe('shared-result');
		expect(second.payload).toBe('shared-result');
		expect([first.cacheStatus, second.cacheStatus].sort()).toEqual(['coalesced', 'miss']);
	});

	it('expires stale entries and rebuilds after ttl', async () => {
		let nowMs = 1_000;
		const shared = new Map<string, PublicRouteCacheEntry<string>>();
		let builds = 0;

		const cache = createSharedPublicRouteCache<string>({
			scope: 'test:scope',
			ttlMs: 1_000,
			now: () => nowMs,
			getShared: async (_scope, key) => shared.get(key) ?? null,
			setShared: async (_scope, key, value) => {
				shared.set(key, value);
			},
		});

		await cache.run('alpha', async () => {
			builds += 1;
			return 'v1';
		});

		nowMs += 1_500;

		const refreshed = await cache.run('alpha', async () => {
			builds += 1;
			return 'v2';
		});

		expect(refreshed.cacheStatus).toBe('miss');
		expect(refreshed.payload).toBe('v2');
		expect(builds).toBe(2);
	});
});
