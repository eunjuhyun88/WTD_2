// ═══════════════════════════════════════════════════════════════
// /api/cogochi/analyze — Binance data → Engine DeepResult
//
// v3 (2026-04-13): Switched primary engine call from /score → /deep.
//   /score  : feature_calc (28 features) + LightGBM → P(win), building blocks
//   /deep   : market_engine (17 layers) → verdict, ATR stops, per-layer signals
//
// Both are called in parallel; frontend receives both result sets.
//
// Full perp data now fetched and forwarded to engine:
//   - mark_price + index_price  (premiumIndex, zero extra HTTP — shared memo)
//   - oi_notional               (raw OI coins × mark_price)
//   - short_liq_usd/long_liq_usd (forceOrders BUY/SELL aggregated in USD)
//   - taker_ratio               (last bar taker buy / sell ratio)
//   - price_pct                 (1-bar price % change)
//   - vol_24h                   (ticker.quoteVolume)
//
// Data flow:
//   1. TypeScript fetches all raw Binance data in parallel
//   2. Computes derived values (oi_notional, liq aggregation, price_pct)
//   3. Forwards to Python engine POST /deep + POST /score in parallel
//   4. Returns merged result to frontend
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { randomUUID } from 'node:crypto';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { buildPublicCacheHeaders } from '$lib/server/publicCacheHeaders';
import {
	EngineError,
	type KlineBar,
	type PerpSnapshot,
	type DeepPerpData,
} from '$lib/server/engineClient';
import { collectAnalyzeInputs } from '$lib/server/analyze/collector';
import { parseAnalyzeRequest } from '$lib/server/analyze/requestParser';
import {
	aggregateLiquidations,
	buildDepthView,
	buildLiquidationClusters,
	lastPricePct,
	lastTakerRatio,
	oiChangePct,
} from '$lib/server/analyze/helpers';
import { runEngineAnalysis } from '$lib/server/analyze/orchestrator';
import type { BinanceKlineWithTaker } from '$lib/server/analyze/types';
import { mapAnalyzeResponse } from '$lib/server/analyze/responseMapper';
import { createAnalyzeTimer } from '$lib/server/analyze/timing';
import { analyzeLimiter } from '$lib/server/rateLimit';
import {
	buildAnalyzeCacheKey,
	getOrRunAnalyzeResponse,
} from '$lib/server/analyze/cache';
import {
	attachAnalyzeRequestMeta,
	buildAnalyzeTraceHeaders,
	createAnalyzeErrorEnvelope,
	createAnalyzePayloadMeta,
} from '$lib/server/analyze/responseEnvelope';
import { logAnalyzeRouteEvent } from '$lib/server/analyze/telemetry';

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
	const { symbol, tf } = parseAnalyzeRequest(url);
	const requestId = request.headers.get('x-request-id') ?? randomUUID();
	const guard = await runIpRateLimitGuard({
		request,
		fallbackIp: getClientAddress(),
		limiter: analyzeLimiter,
		scope: 'cogochi:analyze',
		max: 18,
		tooManyMessage: 'Too many analyze requests. Please retry shortly.',
	});
	if (!guard.ok) {
		const reason = await readErrorReasonFromResponse(
			guard.response,
			guard.response.status === 429
				? 'Too many analyze requests. Please retry shortly.'
				: 'Request blocked by security policy',
		);
		const error = guard.response.status === 429 ? 'rate_limited' : 'request_blocked';
		logAnalyzeRouteEvent({
			event: 'blocked',
			requestId,
			symbol,
			tf,
			status: guard.response.status,
			error,
			reason,
		});
		return json(
			createAnalyzeErrorEnvelope({
				requestId,
				error,
				reason,
				status: guard.response.status,
				upstream: 'security',
			}),
			{
				status: guard.response.status,
				headers: {
					...buildAnalyzeTraceHeaders({ requestId }),
					'cache-control': 'private, no-store',
				},
			},
		);
	}

	const cacheKey = buildAnalyzeCacheKey(symbol, tf);
	try {
		const { payload, cacheStatus } = await getOrRunAnalyzeResponse(cacheKey, async () => {
			return _buildAnalyzePayload({ symbol, tf, requestId });
		});
		const responsePayload = attachAnalyzeRequestMeta(payload, { requestId, cacheStatus });
		logAnalyzeRouteEvent({
			event: 'success',
			requestId,
			symbol,
			tf,
			status: 200,
			cacheStatus,
			payload: responsePayload,
		});
		return json(responsePayload, {
			headers: buildPublicCacheHeaders({
				browserMaxAge: 5,
				sharedMaxAge: 7,
				staleWhileRevalidate: 10,
				cacheStatus,
				headers: buildAnalyzeTraceHeaders({
					requestId,
					cacheStatus,
					payload: responsePayload,
				}),
			}),
		});
	} catch (err: unknown) {
		if (err instanceof EngineError && (err.status === 502 || err.status === 504)) {
			try {
				const fallbackPayload = await _fallbackAnalyzePayload(symbol, tf);
				const responsePayload = attachAnalyzeRequestMeta(fallbackPayload, {
					requestId,
					cacheStatus: 'bypass',
				});
				logAnalyzeRouteEvent({
					event: 'fallback',
					requestId,
					symbol,
					tf,
					status: 200,
					cacheStatus: 'bypass',
					payload: responsePayload,
				});
				return json(responsePayload, {
					headers: {
						...buildAnalyzeTraceHeaders({
							requestId,
							cacheStatus: 'bypass',
							payload: responsePayload,
						}),
						'cache-control': 'private, no-store',
					},
				});
			} catch (fallbackErr: unknown) {
				const message = fallbackErr instanceof Error ? fallbackErr.message : 'Fallback failed';
				logAnalyzeRouteEvent({
					event: 'error',
					requestId,
					symbol,
					tf,
					status: 503,
					error: 'fallback_unavailable',
					reason: message,
				});
				return json(
					createAnalyzeErrorEnvelope({
						requestId,
						error: 'fallback_unavailable',
						reason: message,
						status: 503,
						upstream: 'engine',
					}),
					{
						status: 503,
						headers: {
							...buildAnalyzeTraceHeaders({ requestId }),
							'cache-control': 'private, no-store',
						},
					},
				);
			}
		}
		if (err instanceof AnalyzeRouteError) {
			const error = err.status === 400 ? 'invalid_request' : 'analysis_failed';
			logAnalyzeRouteEvent({
				event: 'error',
				requestId,
				symbol,
				tf,
				status: err.status,
				error,
				reason: err.message,
			});
			return json(
				createAnalyzeErrorEnvelope({
					requestId,
					error,
					reason: err.message,
					status: err.status,
					upstream: 'route',
				}),
				{
					status: err.status,
					headers: {
						...buildAnalyzeTraceHeaders({ requestId }),
						'cache-control': 'private, no-store',
					},
				},
			);
		}
		if (err instanceof EngineError) {
			logAnalyzeRouteEvent({
				event: 'error',
				requestId,
				symbol,
				tf,
				status: err.status,
				error: 'upstream_error',
				reason: err.message,
			});
			return json(
				createAnalyzeErrorEnvelope({
					requestId,
					error: 'upstream_error',
					reason: err.message,
					status: err.status,
					upstream: 'engine',
				}),
				{
					status: err.status,
					headers: {
						...buildAnalyzeTraceHeaders({ requestId }),
						'cache-control': 'private, no-store',
					},
				},
			);
		}
		const message = err instanceof Error ? err.message : 'Analysis failed';
		logAnalyzeRouteEvent({
			event: 'error',
			requestId,
			symbol,
			tf,
			status: 500,
			error: 'analysis_failed',
			reason: message,
		});
		return json(
			createAnalyzeErrorEnvelope({
				requestId,
				error: 'analysis_failed',
				reason: message,
				status: 500,
				upstream: 'route',
			}),
			{
				status: 500,
				headers: {
					...buildAnalyzeTraceHeaders({ requestId }),
					'cache-control': 'private, no-store',
				},
			},
		);
	}
};

async function _buildAnalyzePayload({
	symbol,
	tf,
	requestId,
}: {
	symbol: string;
	tf: string;
	requestId: string;
}): Promise<Record<string, unknown>> {
	const timer = createAnalyzeTimer();

	try {
		// --- 1. Fetch all raw data in parallel ---------------------------------
		const {
			klines,
			klines1h, // kept for future MTF use
			ticker,
			markPrice,
			indexPrice,
			oiPoint,
			oiHistory1h,
			lsTop,
			depth,
			takerPoints,
			forceOrders,
			fundingRate,
		} = await collectAnalyzeInputs(symbol, tf);
		timer.mark('collector_ms');

		if (!klines.length) {
			throw new AnalyzeRouteError(400, 'No kline data');
		}

		// --- 2. Derive computed values ----------------------------------------
		const currentPrice      = klines[klines.length - 1].close;
		const effectiveMarkPrice = (typeof markPrice === 'number' && markPrice > 0)
			? markPrice
			: currentPrice;

		// OI notional = raw OI (base coins) × mark price (USD/coin)
		const oi_notional =
			typeof oiPoint === 'number' && oiPoint > 0
				? oiPoint * effectiveMarkPrice
				: undefined;

		// Liquidation aggregation
		const normalizedForceOrders = forceOrders ?? [];
		const { short_liq_usd, long_liq_usd } = aggregateLiquidations(normalizedForceOrders);

		// OI % change vs 1h ago (percent, not fraction)
		const oiHistArr = oiHistory1h ?? null;
		const oi_pct = oiChangePct(oiHistArr, 1);

		// Taker ratio: prefer live takerPoints over kline-derived
		const takerRatioLive =
			Array.isArray(takerPoints) && takerPoints.length > 0
				? (takerPoints[takerPoints.length - 1] as { buySellRatio: number }).buySellRatio
				: undefined;
		const taker_ratio = takerRatioLive ?? lastTakerRatio(klines);

		// Price % change (1 bar — for l2_flow OI+price quadrant signal)
		const price_pct = lastPricePct(klines);

		// 24h USD volume (for OI/volume ratio in s19_oi_squeeze)
		const vol_24h = ticker?.quoteVolume ? parseFloat(ticker.quoteVolume) : undefined;

		const depthView = buildDepthView(depth);
		const bestBid = depthView?.bids[0]?.price ?? null;
		const bestAsk = depthView?.asks[0]?.price ?? null;
		const spreadBps =
			bestBid != null && bestAsk != null && currentPrice > 0
				? ((bestAsk - bestBid) / currentPrice) * 10_000
				: null;
		const imbalancePct =
			depthView && depthView.bidVolume + depthView.askVolume > 0
				? ((depthView.bidVolume - depthView.askVolume) / (depthView.bidVolume + depthView.askVolume)) * 100
				: null;
		const liqClusters = buildLiquidationClusters(normalizedForceOrders, currentPrice);

		// --- 3. Build perp payloads -------------------------------------------

		// /deep perp (full market_engine pipeline)
		const perpDeep: DeepPerpData = {
			fr:           typeof fundingRate === 'number' ? fundingRate    : undefined,
			oi_pct,
			ls_ratio:     typeof lsTop === 'number' ? lsTop                : undefined,
			taker_ratio,
			price_pct,
			oi_notional,
			vol_24h,
			mark_price:   typeof markPrice  === 'number' ? markPrice       : undefined,
			index_price:  typeof indexPrice === 'number' ? indexPrice      : undefined,
			short_liq_usd,
			long_liq_usd,
		};

		// /score perp (old feature_calc pipeline — fraction scale for oi_change)
		const perpScore: PerpSnapshot = {
			funding_rate:     typeof fundingRate === 'number' ? fundingRate : 0,
			oi_change_1h:     oi_pct / 100,                    // fraction
			oi_change_24h:    oiChangePct(oiHistArr, 24) / 100, // fraction
			long_short_ratio: typeof lsTop === 'number' ? lsTop : 1.0,
			taker_buy_ratio:  taker_ratio,
		};

		// --- 4. Call Python engine (deep + score in parallel) -----------------
		const engineKlines: KlineBar[] = (klines as BinanceKlineWithTaker[]).map((k) => ({
			t:   k.time,
			o:   k.open,
			h:   k.high,
			l:   k.low,
			c:   k.close,
			v:   k.volume,
			tbv: k.takerBuyBaseAssetVolume ?? k.volume * 0.5,
		}));

		const { deepResult, scoreResult, deepError, scoreError } = await runEngineAnalysis(
			symbol,
			engineKlines,
			perpDeep,
			perpScore,
			{ requestId },
		);
		timer.mark('engine_ms');

		if (!deepResult && !scoreResult) {
			if (deepError instanceof EngineError && (deepError.status === 502 || deepError.status === 504)) {
				timer.flush({ request_id: requestId, symbol, tf, fallback_used: true, engine_partial: false });
				throw deepError;
			}
			timer.flush({ request_id: requestId, symbol, tf, fallback_used: false, engine_partial: false });
			throw new AnalyzeRouteError(500, 'Both /deep and /score failed');
		}

		const payload = mapAnalyzeResponse(
			{ klines, klines1h, ticker, markPrice, indexPrice, oiPoint, oiHistory1h, lsTop, depth, takerPoints, forceOrders, fundingRate },
			{
				currentPrice,
				oi_notional,
				short_liq_usd,
				long_liq_usd,
				oi_pct,
				taker_ratio,
				vol_24h,
				spreadBps,
				imbalancePct,
				depthView,
				liqClusters,
			},
			{ deepResult, scoreResult, deepError, scoreError },
		);
		timer.mark('merge_ms');
		timer.flush({
			request_id: requestId,
			symbol,
			tf,
			fallback_used: false,
			engine_partial: !(deepResult && scoreResult),
		});
		return payload;

	} catch (err: unknown) {
		if (err instanceof EngineError) {
			console.error('[analyze] Engine error:', err.status, err.message);
			timer.flush({
				request_id: requestId,
				symbol,
				tf,
				fallback_used: err.status === 502 || err.status === 504,
				engine_partial: false,
				error_code: err.status,
			});
			throw err;
		}
		if (err instanceof AnalyzeRouteError) {
			console.error('[analyze] Route error:', err.status, err.message);
			timer.flush({
				request_id: requestId,
				symbol,
				tf,
				fallback_used: false,
				engine_partial: false,
				error_code: err.status,
			});
			throw err;
		}
		const message = err instanceof Error ? err.message : 'Analysis failed';
		console.error('[analyze] Unexpected error:', message);
		timer.flush({
			request_id: requestId,
			symbol,
			tf,
			fallback_used: false,
			engine_partial: false,
			error_code: 'unexpected',
		});
		throw err instanceof Error ? err : new Error(message);
	}
}

// ---------------------------------------------------------------------------
// Fallback: explicit degraded response (no client-engine decision logic)
// ---------------------------------------------------------------------------

async function _fallbackAnalyzePayload(symbol: string, tf: string): Promise<Record<string, unknown>> {
	try {
		const { readRaw: _readRaw, klinesRawIdForTimeframe: _klinesRaw } = await import(
			'$lib/server/providers/rawSources'
		);
		const { KnownRawId: _Id } = await import('$lib/contracts/ids');

		const [klines, ticker, funding, oiPoint, lsTop] = await Promise.all([
			_readRaw(_klinesRaw(tf), { symbol, limit: 200 }).catch(() => []),
			_readRaw(_Id.TICKER_24HR, { symbol }).catch(() => null),
			_readRaw(_Id.FUNDING_RATE, { symbol }).catch(() => null),
			_readRaw(_Id.OPEN_INTEREST_POINT, { symbol }).catch(() => null),
			_readRaw(_Id.LONG_SHORT_TOP_1H, { symbol }).catch(() => null),
		]);

		const currentPrice = klines.length > 0 ? klines[klines.length - 1].close : null;

		return {
			deep: null,
			snapshot: null,
			p_win: null,
			blocks_triggered: [],
			ensemble: null,
			ensemble_triggered: false,
			_fallback: true,
			_degraded: true,
			_degraded_reason: 'engine_unreachable',
			chart: (klines ?? []).slice(-100).map((k: any) => ({
				t: k.time, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume,
			})),
			price: currentPrice,
			change24h: ticker ? parseFloat(ticker.priceChangePercent) || 0 : 0,
			derivatives: { funding, oi: oiPoint, lsRatio: lsTop },
			microstructure: null,
			annotations: [],
			indicators: { bbUpper: [], bbMiddle: [], bbLower: [], ema20: [] },
			meta: createAnalyzePayloadMeta({
				engineMode: 'fallback',
				upstreamMissing: ['deep', 'score'],
			}),
		};
	} catch (fallbackErr: unknown) {
		const msg = fallbackErr instanceof Error ? fallbackErr.message : 'Fallback also failed';
		throw new Error(`Engine offline and fallback failed: ${msg}`);
	}
}

class AnalyzeRouteError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
		this.name = 'AnalyzeRouteError';
	}
}

async function readErrorReasonFromResponse(base: Response, fallback: string): Promise<string> {
	try {
		const body = (await base.clone().json()) as { error?: unknown; reason?: unknown };
		if (typeof body.reason === 'string' && body.reason.trim().length > 0) return body.reason;
		if (typeof body.error === 'string' && body.error.trim().length > 0) return body.error;
	} catch {
		// ignore parse failures and use fallback
	}
	return fallback;
}
