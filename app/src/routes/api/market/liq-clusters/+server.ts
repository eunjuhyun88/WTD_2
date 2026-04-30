/**
 * GET /api/market/liq-clusters?symbol=BTCUSDT&window=4h
 *
 * Pillar 1 (W-0122-B1) — single-venue Binance liquidation cluster scaffold.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { getRequestIp } from '$lib/server/requestIp';
import {
	loadLiqClusters,
	type HeatmapCellWire,
	type LiqClusterPayload,
} from '$lib/server/marketIndicatorFeeds';

export type { HeatmapCellWire, LiqClusterPayload };

const VALID_SYMBOL = /^[A-Z0-9]{3,12}USDT$/;

export const GET: RequestHandler = async ({ url, fetch, request, getClientAddress }) => {
	const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
	if (!VALID_SYMBOL.test(symbol)) {
		return json({ error: 'invalid symbol' }, { status: 400 });
	}
	const windowParam = (url.searchParams.get('window') ?? '4h').toLowerCase();

	const ip = getRequestIp({ request, getClientAddress });
	if (!chartFeedLimiter.check(ip)) {
		return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '30' } });
	}

	const { payload, cacheStatus } = await loadLiqClusters({
		symbol,
		window: windowParam,
		fetchImpl: fetch,
	});

	return json(payload, {
		headers: {
			'X-Cache': cacheStatus.toUpperCase(),
			'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
		},
	});
};
