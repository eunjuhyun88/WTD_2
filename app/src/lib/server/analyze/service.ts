import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';
import {
  EngineError,
  type DeepPerpData,
  type KlineBar,
  type PerpSnapshot,
} from '$lib/server/engineClient';
import { getOrRunAnalyzeResponse, buildAnalyzeCacheKey } from './cache';
import { collectAnalyzeInputs } from './collector';
import {
  aggregateLiquidations,
  buildDepthView,
  buildLiquidationClusters,
  lastPricePct,
  lastTakerRatio,
  oiChangePct,
} from './helpers';
import { runEngineAnalysis } from './orchestrator';
import { createAnalyzePayloadMeta } from './responseEnvelope';
import { mapAnalyzeResponse } from './responseMapper';
import { createAnalyzeTimer } from './timing';
import type { BinanceKlineWithTaker } from './types';

export class AnalyzeRouteError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AnalyzeRouteError';
  }
}

export async function getAnalyzePayload(args: {
  symbol: string;
  tf: string;
  requestId: string;
  from?: number;
  to?: number;
}): Promise<{ payload: Record<string, unknown>; cacheStatus: 'hit' | 'miss' | 'coalesced' | 'bypass' }> {
  // Range queries bypass the shared cache — they're specific to the selected window.
  if (args.from != null || args.to != null) {
    try {
      const payload = await buildAnalyzePayload(args);
      return { payload, cacheStatus: 'bypass' };
    } catch (error) {
      if (error instanceof EngineError && (error.status === 502 || error.status === 504)) {
        const payload = await buildFallbackAnalyzePayload(args.symbol, args.tf);
        return { payload, cacheStatus: 'bypass' };
      }
      throw error;
    }
  }

  const cacheKey = buildAnalyzeCacheKey(args.symbol, args.tf);
  try {
    const { payload, cacheStatus } = await getOrRunAnalyzeResponse(cacheKey, async () =>
      buildAnalyzePayload(args),
    );
    return { payload, cacheStatus };
  } catch (error) {
    if (error instanceof EngineError && (error.status === 502 || error.status === 504)) {
      const payload = await buildFallbackAnalyzePayload(args.symbol, args.tf);
      return { payload, cacheStatus: 'bypass' };
    }
    throw error;
  }
}

export async function getAnalyzeEnvelope(args: {
  symbol: string;
  tf: string;
  requestId?: string;
}): Promise<AnalyzeEnvelope> {
  const { payload } = await getAnalyzePayload({
    symbol: args.symbol,
    tf: args.tf,
    requestId: args.requestId ?? `internal:${args.symbol}:${args.tf}`,
  });
  return payload as AnalyzeEnvelope;
}

async function buildAnalyzePayload({
  symbol,
  tf,
  requestId,
  from,
  to,
}: {
  symbol: string;
  tf: string;
  requestId: string;
  from?: number;
  to?: number;
}): Promise<Record<string, unknown>> {
  const timer = createAnalyzeTimer();

  try {
    const {
      klines,
      klines1h,
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
      spotKlines,
      coinbaseSpotPrice,
    } = await collectAnalyzeInputs(symbol, tf);
    timer.mark('collector_ms');

    if (!klines.length) {
      throw new AnalyzeRouteError(400, 'No kline data');
    }

    const currentPrice = klines[klines.length - 1].close;
    const effectiveMarkPrice =
      typeof markPrice === 'number' && markPrice > 0
        ? markPrice
        : currentPrice;
    const oi_notional =
      typeof oiPoint === 'number' && oiPoint > 0
        ? oiPoint * effectiveMarkPrice
        : undefined;

    const normalizedForceOrders = forceOrders ?? [];
    const { short_liq_usd, long_liq_usd } = aggregateLiquidations(normalizedForceOrders);
    const oiHistArr = oiHistory1h ?? null;
    const oi_pct = oiChangePct(oiHistArr, 1);
    const takerRatioLive =
      Array.isArray(takerPoints) && takerPoints.length > 0
        ? (takerPoints[takerPoints.length - 1] as { buySellRatio: number }).buySellRatio
        : undefined;
    const taker_ratio = takerRatioLive ?? lastTakerRatio(klines);
    const price_pct = lastPricePct(klines);
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

    const perpDeep: DeepPerpData = {
      fr: typeof fundingRate === 'number' ? fundingRate : undefined,
      oi_pct,
      ls_ratio: typeof lsTop === 'number' ? lsTop : undefined,
      taker_ratio,
      price_pct,
      oi_notional,
      vol_24h,
      mark_price: typeof markPrice === 'number' ? markPrice : undefined,
      index_price: typeof indexPrice === 'number' ? indexPrice : undefined,
      short_liq_usd,
      long_liq_usd,
      spot_price: spotKlines.length > 0
        ? spotKlines[spotKlines.length - 1].close
        : undefined,
    };

    const coinbasePremiumPct =
      coinbaseSpotPrice !== null && currentPrice > 0
        ? ((coinbaseSpotPrice - currentPrice) / currentPrice) * 100
        : null;
    if (coinbasePremiumPct !== null) {
      console.debug('[analyze] coinbase_premium_pct=%s symbol=%s', coinbasePremiumPct.toFixed(3), symbol);
    }

    const perpScore: PerpSnapshot = {
      funding_rate: typeof fundingRate === 'number' ? fundingRate : 0,
      oi_change_1h: oi_pct / 100,
      oi_change_24h: oiChangePct(oiHistArr, 24) / 100,
      long_short_ratio: typeof lsTop === 'number' ? lsTop : 1.0,
      taker_buy_ratio: taker_ratio,
    };

    let engineKlines: KlineBar[] = (klines as BinanceKlineWithTaker[]).map((k) => ({
      t: k.time,
      o: k.open,
      h: k.high,
      l: k.low,
      c: k.close,
      v: k.volume,
      tbv: k.takerBuyBaseAssetVolume ?? k.volume * 0.5,
    }));

    if (from != null || to != null) {
      const filtered = engineKlines.filter(
        (k) => (from == null || k.t >= from) && (to == null || k.t <= to),
      );
      if (filtered.length >= 3) engineKlines = filtered;
    }

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
      const fallbackPayload = await buildFallbackAnalyzePayload(symbol, tf);
      timer.flush({
        request_id: requestId,
        symbol,
        tf,
        fallback_used: true,
        engine_partial: false,
        error_code: 'engine_empty',
      });
      return fallbackPayload;
    }

    const payload = mapAnalyzeResponse(
      { klines, klines1h, ticker, markPrice, indexPrice, oiPoint, oiHistory1h, lsTop, depth, takerPoints, forceOrders, fundingRate, spotKlines, coinbaseSpotPrice },
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
  } catch (error: unknown) {
    if (error instanceof EngineError) {
      timer.flush({
        request_id: requestId,
        symbol,
        tf,
        fallback_used: error.status === 502 || error.status === 504,
        engine_partial: false,
        error_code: error.status,
      });
      throw error;
    }
    if (error instanceof AnalyzeRouteError) {
      timer.flush({
        request_id: requestId,
        symbol,
        tf,
        fallback_used: false,
        engine_partial: false,
        error_code: error.status,
      });
      throw error;
    }
    timer.flush({
      request_id: requestId,
      symbol,
      tf,
      fallback_used: false,
      engine_partial: false,
      error_code: 'unexpected',
    });
    throw error instanceof Error ? error : new Error('Analysis failed');
  }
}

async function buildFallbackAnalyzePayload(symbol: string, tf: string): Promise<Record<string, unknown>> {
  try {
    const { klines, ticker, fundingRate, oiPoint, lsTop } = await collectAnalyzeInputs(symbol, tf);
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
        t: k.time,
        o: k.open,
        h: k.high,
        l: k.low,
        c: k.close,
        v: k.volume,
      })),
      price: currentPrice,
      change24h: ticker ? parseFloat(ticker.priceChangePercent) || 0 : 0,
      derivatives: { funding: fundingRate, oi: oiPoint, lsRatio: lsTop },
      microstructure: null,
      annotations: [],
      indicators: { bbUpper: [], bbMiddle: [], bbLower: [], ema20: [] },
      meta: createAnalyzePayloadMeta({
        engineMode: 'fallback',
        upstreamMissing: ['deep', 'score'],
      }),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Fallback also failed';
    throw new Error(`Engine offline and fallback failed: ${message}`);
  }
}
