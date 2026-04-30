/**
 * GET /api/market/options-snapshot?currency=BTC
 *
 * W-0122-C1 — Deribit Options Snapshot (Phase 1: REST, no WS).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { getRequestIp } from '$lib/server/requestIp';
import {
	loadOptionsSnapshot,
	type OptionsSnapshotPayload,
} from '$lib/server/marketIndicatorFeeds';

export type { OptionsSnapshotPayload };

const VALID_CURRENCY = /^(BTC|ETH)$/;

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
	const currency = (url.searchParams.get('currency') ?? 'BTC').toUpperCase();
	if (!VALID_CURRENCY.test(currency)) {
		return json({ error: 'invalid currency' }, { status: 400 });
	}

	const ip = getRequestIp({ request, getClientAddress });
	if (!chartFeedLimiter.check(ip)) {
		return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '60' } });
	}

	try {
		const { payload, cacheStatus } = await loadOptionsSnapshot(currency);
		return json(payload, {
			headers: { 'X-Cache': cacheStatus.toUpperCase() },
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'upstream_unavailable';
		const code = message === 'no_underlying' ? 'no_underlying' : 'upstream_unavailable';
		return json({ error: code }, { status: 503 });
	}
};
