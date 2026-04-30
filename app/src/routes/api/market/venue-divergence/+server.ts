/**
 * GET /api/market/venue-divergence?symbol=BTCUSDT
 *
 * Per-venue OI and funding snapshot across Binance / Bybit / OKX.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { getRequestIp } from '$lib/server/requestIp';
import {
	loadVenueDivergence,
	type VenueDivergencePayload,
	type VenueSeriesRowWire,
} from '$lib/server/marketIndicatorFeeds';

export type { VenueDivergencePayload, VenueSeriesRowWire };

const VALID_SYMBOL = /^[A-Z0-9]{3,12}USDT$/;

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
	const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
	if (!VALID_SYMBOL.test(symbol)) {
		return json({ error: 'invalid symbol' }, { status: 400 });
	}

	const ip = getRequestIp({ request, getClientAddress });
	if (!chartFeedLimiter.check(ip)) {
		return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '30' } });
	}

	const { payload, cacheStatus } = await loadVenueDivergence(symbol);
	return json(payload, {
		headers: {
			'X-Cache': cacheStatus.toUpperCase(),
			'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30',
		},
	});
};
