/**
 * GET /api/market/funding-flip?symbol=BTCUSDT
 *
 * W-0122-F — Funding Flip Clock.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { getRequestIp } from '$lib/server/requestIp';
import { loadFundingFlip, type FundingFlipPayload } from '$lib/server/marketIndicatorFeeds';

export type { FundingFlipPayload };

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
		const { payload, cacheStatus } = await loadFundingFlip(symbol);
		return json(payload, {
			headers: { 'X-Cache': cacheStatus.toUpperCase() },
		});
	} catch {
		return json({ error: 'upstream_unavailable' }, { status: 503 });
	}
};
