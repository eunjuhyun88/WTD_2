import { describe, expect, it } from 'vitest';
import { buildPublicCacheHeaders } from './publicCacheHeaders';

describe('buildPublicCacheHeaders', () => {
	it('builds shared cache headers with cache status', () => {
		const headers = buildPublicCacheHeaders({
			browserMaxAge: 15,
			sharedMaxAge: 60,
			staleWhileRevalidate: 30,
			cacheStatus: 'hit',
		});

		expect(headers['Cache-Control']).toBe('public, max-age=15, s-maxage=60, stale-while-revalidate=30');
		expect(headers['Vary']).toBe('Accept-Encoding');
		expect(headers['X-Cogochi-Cache']).toBe('HIT');
	});
});
