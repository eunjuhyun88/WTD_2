import type { PublicRouteCacheStatus } from './publicRouteCache';

export function buildPublicCacheHeaders(args: {
	browserMaxAge: number;
	sharedMaxAge?: number;
	staleWhileRevalidate?: number;
	cacheStatus?: PublicRouteCacheStatus;
	headers?: Record<string, string>;
}): Record<string, string> {
	const browserMaxAge = Math.max(0, Math.trunc(args.browserMaxAge));
	const sharedMaxAge = Math.max(0, Math.trunc(args.sharedMaxAge ?? browserMaxAge));
	const staleWhileRevalidate = Math.max(0, Math.trunc(args.staleWhileRevalidate ?? 0));

	const cacheControlParts = ['public', `max-age=${browserMaxAge}`, `s-maxage=${sharedMaxAge}`];
	if (staleWhileRevalidate > 0) {
		cacheControlParts.push(`stale-while-revalidate=${staleWhileRevalidate}`);
	}

	return {
		'Cache-Control': cacheControlParts.join(', '),
		Vary: 'Accept-Encoding',
		...(args.cacheStatus ? { 'X-Cogochi-Cache': args.cacheStatus.toUpperCase() } : {}),
		...(args.headers ?? {}),
	};
}
