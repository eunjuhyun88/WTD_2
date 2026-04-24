/**
 * GET /api/market/stablecoin-ssr
 *
 * W-0122-F — Stablecoin Supply Ratio (SSR) = BTC market cap / total stablecoin supply.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { getRequestIp } from '$lib/server/requestIp';
import { loadStablecoinSsr, type SsrPayload } from '$lib/server/marketIndicatorFeeds';

export type { SsrPayload };

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
	const ip = getRequestIp({ request, getClientAddress });
	if (!chartFeedLimiter.check(ip)) {
		return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '60' } });
	}

	try {
		const { payload, cacheStatus } = await loadStablecoinSsr();
		return json(payload, {
			headers: { 'X-Cache': cacheStatus.toUpperCase() },
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'upstream_unavailable';
		const code = message === 'insufficient_history' ? 'insufficient_history' : 'upstream_unavailable';
		return json({ error: code }, { status: 503 });
	}
};
