// ═══════════════════════════════════════════════════════════════
// /api/cogochi/analyze — Binance klines + fapi → 15-Layer SignalSnapshot
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchKlinesServer, fetch24hrServer } from '$lib/server/binance';
import type { MarketContext } from '$lib/engine/factorEngine';
import { computeSignalSnapshot } from '$lib/engine/cogochi/layerEngine';
import { signSnapshot } from '$lib/engine/cogochi/hmac';

const FAPI = 'https://fapi.binance.com';

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
    // Fetch all data in parallel
    const [klines, klines1h, klines1d, ticker, deriv, fearGreed] = await Promise.all([
      fetchKlinesServer(symbol, tf, 200),
      fetchKlinesServer(symbol, '1h', 100).catch(() => []),
      fetchKlinesServer(symbol, '1d', 50).catch(() => []),
      fetch24hrServer(symbol).catch(() => null),
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

    return json({
      snapshot,
      chart: chartKlines,
      price: klines[klines.length - 1].close,
      change24h: ticker ? parseFloat(ticker.priceChangePercent) || 0 : 0,
      // Extra data for UI panels
      derivatives: {
        funding: deriv.funding,
        oi: deriv.oi,
        lsRatio: deriv.lsRatio,
        fearGreed,
      },
    });
  } catch (err: any) {
    return json({ error: err?.message || 'Analysis failed' }, { status: 500 });
  }
};
