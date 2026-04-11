// ═══════════════════════════════════════════════════════════════
// /api/cogochi/analyze — Binance klines + fapi → 15-Layer SignalSnapshot
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readRaw, type KlinesRawId } from '$lib/server/providers/rawSources';
import { KnownRawId } from '$lib/contracts/ids';
import type { BinanceKline } from '$lib/engine/types';
import type { MarketContext } from '$lib/engine/factorEngine';
import { computeSignalSnapshot } from '$lib/engine/cogochi/layerEngine';
import { computeIndicatorSeries } from '$lib/engine/cogochi/layerEngine';
import { detectSupportResistance } from '$lib/engine/cogochi/supportResistance';
import { signSnapshot } from '$lib/engine/cogochi/hmac';

const FAPI = 'https://fapi.binance.com';

/**
 * Map the UI `tf` query param to the corresponding `KLINES_*` raw atom.
 * Falls back to `KLINES_4H` for unknown inputs, matching the previous
 * default from `fetchKlinesServer`'s `interval = '4h'` signature.
 */
function klinesRawIdForTimeframe(tf: string): KlinesRawId {
  switch (tf) {
    case '1m': return KnownRawId.KLINES_1M;
    case '5m': return KnownRawId.KLINES_5M;
    case '15m': return KnownRawId.KLINES_15M;
    case '30m': return KnownRawId.KLINES_30M;
    case '1h': return KnownRawId.KLINES_1H;
    case '4h': return KnownRawId.KLINES_4H;
    case '1d': return KnownRawId.KLINES_1D;
    case '1w': return KnownRawId.KLINES_1W;
    default: return KnownRawId.KLINES_4H;
  }
}

/** Fetch derivatives from Binance Futures API (no key needed) */
async function fetchDerivatives(symbol: string) {
  const timeout = AbortSignal.timeout(5000);
  try {
    const [frRes, oiRes] = await Promise.all([
      fetch(`${FAPI}/fapi/v1/premiumIndex?symbol=${symbol}`, { signal: timeout }),
      fetch(`${FAPI}/fapi/v1/openInterest?symbol=${symbol}`, { signal: timeout }),
    ]);

    const fr = frRes.ok ? await frRes.json() : null;
    const oi = oiRes.ok ? await oiRes.json() : null;

    // Long/Short ratio (top traders)
    let lsRatio: number | null = null;
    try {
      const lsRes = await fetch(
        `${FAPI}/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (lsRes.ok) {
        const lsData = await lsRes.json();
        if (Array.isArray(lsData) && lsData.length > 0) {
          lsRatio = parseFloat(lsData[0].longShortRatio) || null;
        }
      }
    } catch { /* skip */ }

    return {
      funding: fr ? parseFloat(fr.lastFundingRate) : null,
      oi: oi ? parseFloat(oi.openInterest) : null,
      lsRatio,
      predFunding: fr ? parseFloat(fr.estimatedSettlePrice) : null,
    };
  } catch {
    return { funding: null, oi: null, lsRatio: null, predFunding: null };
  }
}

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
    // Fetch all data in parallel. Klines/ticker go through `readRaw` so
    // every provider call on this endpoint funnels through the same
    // quota + cache layer. Derivatives (openInterest + topLongShort) and
    // Fear&Greed still hit their upstreams inline — OI and LS_TOP do not
    // yet have raw atoms (residual debt from the scanner slice), and the
    // Fear&Greed helper here keeps the original 3s timeout behavior.
    const [klines, klines1h, klines1d, ticker, deriv, fearGreed] = await Promise.all([
      readRaw(klinesRawIdForTimeframe(tf), { symbol, limit: 200 }),
      readRaw(KnownRawId.KLINES_1H, { symbol, limit: 100 }).catch((): BinanceKline[] => []),
      readRaw(KnownRawId.KLINES_1D, { symbol, limit: 50 }).catch((): BinanceKline[] => []),
      readRaw(KnownRawId.TICKER_24HR, { symbol }).catch(() => null),
      fetchDerivatives(symbol),
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
        oi: deriv.oi,
        funding: deriv.funding,
        lsRatio: deriv.lsRatio,
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
        funding: deriv.funding,
        oi: deriv.oi,
        lsRatio: deriv.lsRatio,
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
