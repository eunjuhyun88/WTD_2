// ═══════════════════════════════════════════════════════════════
// /api/cogochi/analyze — Binance klines + fapi → Engine SignalSnapshot
//
// v2 (2026-04-13): Python engine is now the single source of truth
// for feature computation and ML scoring.
//
// Flow:
//   1. TypeScript fetches raw market data (Binance/Coinalyze) — fast, cached
//   2. Computes perp deltas (oi_change_1h/24h) from OI history
//   3. Forwards klines + perp to Python engine POST /score
//   4. Engine returns { snapshot (28 features), p_win, blocks_triggered }
//   5. We add chart/annotations/indicators (TS-side, UI-only)
//
// The old layerEngine.ts (TypeScript feature mirror) is no longer called here.
// It remains in-tree as a fallback for the engine-unreachable case.
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readRaw, klinesRawIdForTimeframe } from '$lib/server/providers/rawSources';
import { KnownRawId } from '$lib/contracts/ids';
import type { BinanceKline } from '$lib/engine/types';
import { detectSupportResistance } from '$lib/engine/cogochi/supportResistance';
import { computeIndicatorSeries } from '$lib/engine/cogochi/layerEngine';
import { engine, EngineError, type KlineBar, type PerpSnapshot } from '$lib/server/engineClient';

/** Compute OI % change vs N bars ago from the OI history array. */
function oiChangePct(oiHistory: Array<{ openInterest: string }> | null, barsAgo: number): number {
  if (!oiHistory || oiHistory.length < barsAgo + 1) return 0;
  const now = parseFloat(oiHistory[oiHistory.length - 1]?.openInterest ?? '0');
  const past = parseFloat(oiHistory[Math.max(0, oiHistory.length - 1 - barsAgo)]?.openInterest ?? '0');
  if (past === 0) return 0;
  return (now - past) / past;
}

export const GET: RequestHandler = async ({ url }) => {
  const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
  const tf = url.searchParams.get('tf') || '4h';

  try {
    // --- 1. Fetch all raw data in parallel (TypeScript stays as data layer) ---
    const [
      klines,
      klines1h,
      klines1d,
      ticker,
      funding,
      oiPoint,
      oiHistory1h,
      lsTop,
    ] = await Promise.all([
      readRaw(klinesRawIdForTimeframe(tf), { symbol, limit: 600 }),  // ≥500 for engine warmup
      readRaw(KnownRawId.KLINES_1H, { symbol, limit: 100 }).catch((): BinanceKline[] => []),
      readRaw(KnownRawId.KLINES_1D, { symbol, limit: 50 }).catch((): BinanceKline[] => []),
      readRaw(KnownRawId.TICKER_24HR, { symbol }).catch(() => null),
      readRaw(KnownRawId.FUNDING_RATE, { symbol }).catch(() => null),
      readRaw(KnownRawId.OPEN_INTEREST_POINT, { symbol }).catch(() => null),
      readRaw(KnownRawId.OI_HIST_1H, { symbol }).catch(() => null),
      readRaw(KnownRawId.LONG_SHORT_TOP_1H, { symbol }).catch(() => null),
    ]);

    if (!klines.length) {
      return json({ error: 'No kline data' }, { status: 400 });
    }

    // --- 2. Build engine-compatible payloads ---
    const engineKlines: KlineBar[] = klines.map((k) => ({
      t: k.time,
      o: k.open,
      h: k.high,
      l: k.low,
      c: k.close,
      v: k.volume,
      tbv: k.takerBuyBaseAssetVolume ?? k.volume * 0.5,
    }));

    // Compute OI deltas from history (TypeScript computes, engine receives)
    const oiHistArr = Array.isArray(oiHistory1h) ? oiHistory1h : null;
    const perp: PerpSnapshot = {
      funding_rate: funding?.lastFundingRate ? parseFloat(funding.lastFundingRate) : 0,
      oi_change_1h:  oiChangePct(oiHistArr, 1),
      oi_change_24h: oiChangePct(oiHistArr, 24),
      long_short_ratio: lsTop?.longShortRatio ? parseFloat(lsTop.longShortRatio) : 1.0,
    };

    // --- 3. Call Python engine ---
    const engineResult = await engine.score(symbol, engineKlines, perp);

    // --- 4. Build UI extras (chart/annotations stay TypeScript-side) ---
    const currentPrice = klines[klines.length - 1].close;
    const annotations = detectSupportResistance(klines, currentPrice);
    const indicators = computeIndicatorSeries(klines);

    const chartKlines = klines.slice(-100).map((k) => ({
      t: k.time,
      o: k.open,
      h: k.high,
      l: k.low,
      c: k.close,
      v: k.volume,
    }));

    return json({
      // Core: engine-computed (authoritative)
      snapshot: engineResult.snapshot,
      p_win: engineResult.p_win,
      blocks_triggered: engineResult.blocks_triggered,
      ensemble: engineResult.ensemble ?? null,
      ensemble_triggered: engineResult.ensemble_triggered ?? false,

      // UI extras
      chart: chartKlines,
      price: currentPrice,
      change24h: ticker ? parseFloat(ticker.priceChangePercent) || 0 : 0,
      derivatives: {
        funding,
        oi: oiPoint,
        lsRatio: lsTop,
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
      // Engine-specific errors (502 = unreachable, 400 = bad input)
      console.error('[analyze] Engine error:', err.status, err.message);

      // Fallback to TypeScript layerEngine if engine is unreachable.
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
// Fallback: TypeScript layerEngine (used when Python engine is unreachable)
// This keeps the terminal functional during engine downtime.
// Remove once engine uptime is proven stable.
// ---------------------------------------------------------------------------

async function _fallbackToLayerEngine(symbol: string, tf: string): Promise<Response> {
  try {
    const { computeSignalSnapshot, computeIndicatorSeries } = await import(
      '$lib/engine/cogochi/layerEngine'
    );
    const { readRaw, klinesRawIdForTimeframe } = await import(
      '$lib/server/providers/rawSources'
    );
    const { KnownRawId } = await import('$lib/contracts/ids');
    const { detectSupportResistance } = await import(
      '$lib/engine/cogochi/supportResistance'
    );
    const { signSnapshot } = await import('$lib/engine/cogochi/hmac');
    const { MetricStore } = await import('$lib/engine/metrics');
    const { json } = await import('@sveltejs/kit');

    const [klines, ticker, funding, oiPoint, lsTop] = await Promise.all([
      readRaw(klinesRawIdForTimeframe(tf), { symbol, limit: 200 }),
      readRaw(KnownRawId.TICKER_24HR, { symbol }).catch(() => null),
      readRaw(KnownRawId.FUNDING_RATE, { symbol }).catch(() => null),
      readRaw(KnownRawId.OPEN_INTEREST_POINT, { symbol }).catch(() => null),
      readRaw(KnownRawId.LONG_SHORT_TOP_1H, { symbol }).catch(() => null),
    ]);

    const ctx = {
      pair: symbol,
      timeframe: tf,
      klines,
      derivatives: { oi: oiPoint, funding, lsRatio: lsTop },
    };

    const metricStore = new MetricStore();
    const snapshot = computeSignalSnapshot(ctx as any, symbol, tf, {}, metricStore);
    snapshot.hmac = signSnapshot(snapshot);

    const currentPrice = klines[klines.length - 1].close;
    const annotations = detectSupportResistance(klines, currentPrice);
    const indicators = computeIndicatorSeries(klines);

    return json({
      snapshot,
      p_win: null,             // no ML scoring in fallback
      blocks_triggered: [],
      ensemble_triggered: false,
      _fallback: true,         // flag so UI can show "engine offline" badge
      chart: klines.slice(-100).map((k: any) => ({ t: k.time, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume })),
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
