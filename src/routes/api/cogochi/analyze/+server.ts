// ═══════════════════════════════════════════════════════════════
// /api/cogochi/analyze — Binance klines + fapi → 15-Layer SignalSnapshot
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readRaw, klinesRawIdForTimeframe } from '$lib/server/providers/rawSources';
import { KnownRawId } from '$lib/contracts/ids';
import type { BinanceKline } from '$lib/engine/types';
import type { MarketContext } from '$lib/engine/factorEngine';
import { computeSignalSnapshot } from '$lib/engine/cogochi/layerEngine';
import { computeIndicatorSeries } from '$lib/engine/cogochi/layerEngine';
import { detectSupportResistance } from '$lib/engine/cogochi/supportResistance';
import { signSnapshot } from '$lib/engine/cogochi/hmac';

/** Fetch Fear & Greed index */
async function fetchFearGreed(): Promise<number | null> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return parseInt(data?.data?.[0]?.value) || null;
  } catch { return null; }
}

export const GET: RequestHandler = async ({ url }) => {
  const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
  const tf = url.searchParams.get('tf') || '4h';

  try {
    // Every provider call on this endpoint funnels through `readRaw` so
    // the quota + cache layer is consistent. `fetchFearGreed` is still a
    // local helper because it keeps the original 3s timeout behavior
    // distinct from the cached 60-sample variant used by other endpoints.
    const [
      klines, klines1h, klines1d, ticker,
      funding, oiPoint, lsTop,
      fearGreed,
    ] = await Promise.all([
      readRaw(klinesRawIdForTimeframe(tf), { symbol, limit: 200 }),
      readRaw(KnownRawId.KLINES_1H, { symbol, limit: 100 }).catch((): BinanceKline[] => []),
      readRaw(KnownRawId.KLINES_1D, { symbol, limit: 50 }).catch((): BinanceKline[] => []),
      readRaw(KnownRawId.TICKER_24HR, { symbol }).catch(() => null),
      readRaw(KnownRawId.FUNDING_RATE, { symbol }).catch(() => null),
      readRaw(KnownRawId.OPEN_INTEREST_POINT, { symbol }).catch(() => null),
      readRaw(KnownRawId.LONG_SHORT_TOP_1H, { symbol }).catch(() => null),
      fetchFearGreed(),
    ]);

    if (!klines.length) {
      return json({ error: 'No kline data' }, { status: 400 });
    }

    // Build MarketContext with derivatives
    const ctx: MarketContext = {
      pair: symbol,
      timeframe: tf,
      klines,
      klines1h: klines1h.length > 0 ? klines1h : undefined,
      klines1d: klines1d.length > 0 ? klines1d : undefined,
      ticker: ticker ? {
        change24h: parseFloat(ticker.priceChangePercent) || 0,
        volume24h: parseFloat(ticker.quoteVolume) || 0,
        high24h: parseFloat(ticker.highPrice) || 0,
        low24h: parseFloat(ticker.lowPrice) || 0,
      } : undefined,
      derivatives: {
        oi: oiPoint,
        funding,
        lsRatio: lsTop,
      },
      sentiment: {
        fearGreed,
      },
    };

    // Compute 15-layer snapshot + HMAC
    const snapshot = computeSignalSnapshot(ctx, symbol, tf);
    snapshot.hmac = signSnapshot(snapshot);

    // Chart klines
    const chartKlines = klines.slice(-100).map(k => ({
      t: k.time, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume,
    }));

    const currentPrice = klines[klines.length - 1].close;
    const annotations = detectSupportResistance(klines, currentPrice);
    const indicators = computeIndicatorSeries(klines);

    return json({
      snapshot,
      chart: chartKlines,
      price: currentPrice,
      change24h: ticker ? parseFloat(ticker.priceChangePercent) || 0 : 0,
      // Extra data for UI panels
      derivatives: {
        funding,
        oi: oiPoint,
        lsRatio: lsTop,
        fearGreed,
      },
      annotations,
      indicators: {
        bbUpper: indicators.bbUpper?.slice(-100),
        bbMiddle: indicators.bbMiddle?.slice(-100),
        bbLower: indicators.bbLower?.slice(-100),
        ema20: indicators.ema20?.slice(-100),
      },
    });
  } catch (err: any) {
    return json({ error: err?.message || 'Analysis failed' }, { status: 500 });
  }
};
