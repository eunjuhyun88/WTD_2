/**
 * GET /api/market/rv-cone?symbol=BTCUSDT
 *
 * W-0122-F — Realized Volatility Cone.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { getRequestIp } from '$lib/server/requestIp';
import { loadRvCone, type RvConePayload } from '$lib/server/marketIndicatorFeeds';

export type { RvConePayload };

const VALID_SYMBOL = /^[A-Z0-9]{3,12}USDT$/;

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
	const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
	if (!VALID_SYMBOL.test(symbol)) {
		return json({ error: 'invalid symbol' }, { status: 400 });
	}

	const ip = getRequestIp({ request, getClientAddress });
	if (!chartFeedLimiter.check(ip)) {
		return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '60' } });
	}

	try {
		const { payload, cacheStatus } = await loadRvCone(symbol);
		return json(payload, {
			headers: { 'X-Cache': cacheStatus.toUpperCase() },
		});
	} catch {
		return json({ error: 'upstream_unavailable' }, { status: 503 });
	}
};
