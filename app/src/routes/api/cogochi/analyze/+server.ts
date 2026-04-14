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
import { detectSupportResistance } from '$lib/engine/cogochi/supportResistance';
import { computeIndicatorSeries } from '$lib/engine/cogochi/layerEngine';
import {
	EngineError,
	type KlineBar,
	type PerpSnapshot,
	type DeepPerpData,
} from '$lib/server/engineClient';
import { collectAnalyzeInputs } from '$lib/server/analyze/collector';
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

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export const GET: RequestHandler = async ({ url }) => {
	const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
	const tf     = url.searchParams.get('tf')     || '4h';

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

		if (!klines.length) {
			return json({ error: 'No kline data' }, { status: 400 });
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

		const { deepResult, scoreResult, deepError } = await runEngineAnalysis(symbol, engineKlines, perpDeep, perpScore);

		if (!deepResult && !scoreResult) {
			if (deepError instanceof EngineError && (deepError.status === 502 || deepError.status === 504)) {
				return _fallbackToLayerEngine(symbol, tf);
			}
			return json({ error: 'Both /deep and /score failed' }, { status: 500 });
		}

		// --- 5. Build UI extras -----------------------------------------------
		const annotations = detectSupportResistance(klines, currentPrice);
		const indicators  = computeIndicatorSeries(klines);
		const chartKlines = klines.slice(-100).map((k) => ({
			t: k.time, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume,
		}));

		return json({
			// ── Deep (primary — authoritative 17-layer verdict) ─────────────────
			deep: deepResult,

			// ── Score / ML (secondary — P(win) + building blocks) ───────────────
			snapshot:           scoreResult?.snapshot   ?? null,
			p_win:              scoreResult?.p_win       ?? null,
			blocks_triggered:   scoreResult?.blocks_triggered ?? [],
			ensemble:           scoreResult?.ensemble    ?? null,
			ensemble_triggered: scoreResult?.ensemble_triggered ?? false,

			// ── UI extras ─────────────────────────────────────────────────────────
			chart: chartKlines,
			price: currentPrice,
			change24h: ticker ? parseFloat(ticker.priceChangePercent) || 0 : 0,
			derivatives: {
				funding_rate:  fundingRate,
				mark_price:    markPrice,
				index_price:   indexPrice,
				oi_notional,
				short_liq_usd,
				long_liq_usd,
				oi:            oiPoint,
				lsRatio:       lsTop,
			},
			microstructure: {
				spreadBps,
				imbalancePct,
				takerRatio: taker_ratio ?? null,
				depth: depthView,
				liqClusters,
				liqTotals: {
					shortUsd: short_liq_usd,
					longUsd: long_liq_usd,
				},
			},
			annotations,
			indicators: {
				bbUpper:  indicators.bbUpper?.slice(-100),
				bbMiddle: indicators.bbMiddle?.slice(-100),
				bbLower:  indicators.bbLower?.slice(-100),
				ema20:    indicators.ema20?.slice(-100),
			},
		});

	} catch (err: unknown) {
		if (err instanceof EngineError) {
			console.error('[analyze] Engine error:', err.status, err.message);
			if (err.status === 502 || err.status === 504) {
				return _fallbackToLayerEngine(symbol, tf);
			}
			return json({ error: err.message }, { status: err.status });
		}
		const message = err instanceof Error ? err.message : 'Analysis failed';
		console.error('[analyze] Unexpected error:', message);
		return json({ error: message }, { status: 500 });
	}
};

// ---------------------------------------------------------------------------
// Fallback: TypeScript layerEngine (when Python engine is unreachable)
// ---------------------------------------------------------------------------

async function _fallbackToLayerEngine(symbol: string, tf: string): Promise<Response> {
	try {
		const { computeSignalSnapshot, computeIndicatorSeries } = await import(
			'$lib/engine/cogochi/layerEngine'
		);
		const { readRaw: _readRaw, klinesRawIdForTimeframe: _klinesRaw } = await import(
			'$lib/server/providers/rawSources'
		);
		const { KnownRawId: _Id } = await import('$lib/contracts/ids');
		const { detectSupportResistance } = await import(
			'$lib/engine/cogochi/supportResistance'
		);
		const { signSnapshot } = await import('$lib/engine/cogochi/hmac');
		const { MetricStore }  = await import('$lib/engine/metrics');
		const { json: _json }  = await import('@sveltejs/kit');

		const [klines, ticker, funding, oiPoint, lsTop] = await Promise.all([
			_readRaw(_klinesRaw(tf),        { symbol, limit: 200 }),
			_readRaw(_Id.TICKER_24HR,        { symbol }).catch(() => null),
			_readRaw(_Id.FUNDING_RATE,       { symbol }).catch(() => null),
			_readRaw(_Id.OPEN_INTEREST_POINT,{ symbol }).catch(() => null),
			_readRaw(_Id.LONG_SHORT_TOP_1H,  { symbol }).catch(() => null),
		]);

		const ctx = {
			pair: symbol, timeframe: tf, klines,
			derivatives: { oi: oiPoint, funding, lsRatio: lsTop },
		};

		const metricStore = new MetricStore();
		const snapshot = computeSignalSnapshot(ctx as any, symbol, tf, {}, metricStore);
		snapshot.hmac = signSnapshot(snapshot);

		const currentPrice = klines[klines.length - 1].close;
		const annotations  = detectSupportResistance(klines, currentPrice);
		const indicators   = computeIndicatorSeries(klines);

		return _json({
			deep: null,          // engine offline
			snapshot,
			p_win: null,
			blocks_triggered: [],
			ensemble_triggered: false,
			_fallback: true,
			chart: klines.slice(-100).map((k: any) => ({
				t: k.time, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume,
			})),
			price: currentPrice,
			change24h: ticker ? parseFloat(ticker.priceChangePercent) || 0 : 0,
			derivatives: { funding, oi: oiPoint, lsRatio: lsTop },
			annotations,
			indicators: {
				bbUpper:  indicators.bbUpper?.slice(-100),
				bbMiddle: indicators.bbMiddle?.slice(-100),
				bbLower:  indicators.bbLower?.slice(-100),
				ema20:    indicators.ema20?.slice(-100),
			},
		});
	} catch (fallbackErr: unknown) {
		const msg = fallbackErr instanceof Error ? fallbackErr.message : 'Fallback also failed';
		return json({ error: `Engine offline and fallback failed: ${msg}` }, { status: 503 });
	}
}
