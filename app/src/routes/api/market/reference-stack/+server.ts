import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toBoundedInt } from '$lib/server/apiValidation';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { fetchFactReferenceStackProxy } from '$lib/server/enginePlanes/facts';
import { loadMarketReferenceStack } from '$lib/server/marketReferenceStack';
import { buildPublicCacheHeaders } from '$lib/server/publicCacheHeaders';
import { terminalReadLimiter } from '$lib/server/rateLimit';

const VALID_SYMBOL = /^[A-Za-z0-9]{2,20}$/;
const VALID_COIN_ID = /^[A-Za-z0-9-]{2,40}$/;
const VALID_CHAIN = /^[A-Za-z0-9_-]{2,32}$/;
const VALID_ENTITY = /^(token|account)$/;
const VALID_ADDRESS = /^[A-Za-z0-9]{20,120}$/;
const VALID_CHAIN_ID = /^\d{1,10}$/;
const VALID_EXCHANGE = /^[A-Za-z0-9_-]{2,24}$/;
const VALID_ROOTDATA_QUERY = /^[A-Za-z0-9 ._@+-]{1,80}$/;

export const GET: RequestHandler = async ({ url, request, getClientAddress, fetch }) => {
	const guard = await runIpRateLimitGuard({
		request,
		fallbackIp: getClientAddress(),
		limiter: terminalReadLimiter,
		scope: 'market:reference-stack',
		max: 20,
		tooManyMessage: 'Too many reference-stack requests. Please wait.',
	});
	if (!guard.ok) return guard.response;

	const symbol = url.searchParams.get('symbol')?.trim() ?? null;
	const coinId = url.searchParams.get('coinId')?.trim() ?? null;
	const exchange = url.searchParams.get('exchange')?.trim() ?? null;
	const chain = url.searchParams.get('chain')?.trim() ?? null;
	const entity = url.searchParams.get('entity')?.trim().toLowerCase() ?? null;
	const address = url.searchParams.get('address')?.trim() ?? null;
	const chainId = url.searchParams.get('chainid')?.trim() ?? null;
	const rootDataQuery = url.searchParams.get('rootDataQuery')?.trim() ?? null;
	const unlockWindowDays = toBoundedInt(url.searchParams.get('unlockWindowDays'), 30, 1, 90);

	if (symbol && !VALID_SYMBOL.test(symbol)) {
		return json({ error: 'invalid symbol' }, { status: 400 });
	}
	if (coinId && !VALID_COIN_ID.test(coinId)) {
		return json({ error: 'invalid coinId' }, { status: 400 });
	}
	if (exchange && !VALID_EXCHANGE.test(exchange)) {
		return json({ error: 'invalid exchange' }, { status: 400 });
	}
	if (chain && !VALID_CHAIN.test(chain)) {
		return json({ error: 'invalid chain' }, { status: 400 });
	}
	if (entity && !VALID_ENTITY.test(entity)) {
		return json({ error: 'invalid entity' }, { status: 400 });
	}
	if (address && !VALID_ADDRESS.test(address)) {
		return json({ error: 'invalid address' }, { status: 400 });
	}
	if (chainId && !VALID_CHAIN_ID.test(chainId)) {
		return json({ error: 'invalid chainid' }, { status: 400 });
	}
	if (rootDataQuery && !VALID_ROOTDATA_QUERY.test(rootDataQuery)) {
		return json({ error: 'invalid rootDataQuery' }, { status: 400 });
	}

	try {
		const payload = await loadMarketReferenceStack({
			symbol,
			coinId,
			exchange,
			chain,
			entity: entity as 'token' | 'account' | null,
			address,
			chainId,
			rootDataQuery,
			unlockWindowDays,
		});
		const factCoveragePayload = await fetchFactReferenceStackProxy(fetch, {
			symbol: payload.query.symbol,
			timeframe: '1h',
		});
		const responsePayload = {
			...payload,
			factCoverage: factCoveragePayload
				? {
						status: factCoveragePayload.status,
						generatedAt: factCoveragePayload.generated_at,
						symbol: factCoveragePayload.symbol,
						timeframe: factCoveragePayload.timeframe,
						coverage: factCoveragePayload.coverage,
						catalogCounts: factCoveragePayload.catalogCounts,
						sources: factCoveragePayload.sources,
				  }
				: null,
		};

		return json(responsePayload, {
			headers: buildPublicCacheHeaders({
				browserMaxAge: 30,
				sharedMaxAge: 60,
				staleWhileRevalidate: 120,
			}),
		});
	} catch (error) {
		console.error('[api/market/reference-stack] error:', error);
		return json({ error: 'failed to build market reference stack' }, { status: 500 });
	}
};
