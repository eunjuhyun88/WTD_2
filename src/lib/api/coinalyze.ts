// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Coinalyze API Client
// Fetches OI, Funding Rate, Liquidations, L/S Ratio via local proxy
// ═══════════════════════════════════════════════════════════════

import { toCoinalyzeInterval } from '$lib/utils/timeframe';

/** Map our pair format to Coinalyze symbol (Binance perp) */
export function pairToCoinalyze(pair: string): string {
  // BTC/USDT → BTCUSDT_PERP.A (Binance perpetual)
  return pair.replace('/', '') + '_PERP.A';
}

/** Map our timeframe to Coinalyze interval */
export function tfToCoinalyzeInterval(tf: string): string {
  return toCoinalyzeInterval(tf);
}

/** Generic proxy fetch */
async function coinalyzeFetch(endpoint: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ endpoint, ...params });
  const res = await fetch(`/api/coinalyze?${qs.toString()}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Coinalyze ${res.status}`);
  return res.json();
}

export interface OIDataPoint {
  time: number;    // unix seconds
  value: number;   // OI value
}

export interface FundingDataPoint {
  time: number;
  value: number;   // funding rate
}

export interface LiquidationDataPoint {
  time: number;
  long: number;
  short: number;
}

export interface LSRatioDataPoint {
  time: number;
  value: number;   // long/short ratio
}

/** Fetch current open interest */
export async function fetchCurrentOI(pair: string): Promise<{ value: number; update: number } | null> {
  try {
    const symbol = pairToCoinalyze(pair);
    const data = await coinalyzeFetch('open-interest', {
      symbols: symbol,
      convert_to_usd: 'true'
    });
    if (Array.isArray(data) && data.length > 0) {
      return { value: data[0].value, update: data[0].update };
    }
    return null;
  } catch (err) {
    console.error('[Coinalyze] OI fetch error:', err);
    return null;
  }
}

/** Fetch OI history */
export async function fetchOIHistory(
  pair: string,
  tf: string,
  limit: number = 300
): Promise<OIDataPoint[]> {
  try {
    const symbol = pairToCoinalyze(pair);
    const interval = tfToCoinalyzeInterval(tf);
    const now = Math.floor(Date.now() / 1000);
    // Calculate 'from' based on interval and limit
    const intervalSecs: Record<string, number> = {
      '1min': 60,
      '5min': 300,
      '15min': 900,
      '30min': 1800,
      '1hour': 3600,
      '4hour': 14400,
      'daily': 86400,
      'weekly': 604800,
    };
    const from = now - (intervalSecs[interval] || 14400) * limit;

    const data = await coinalyzeFetch('open-interest-history', {
      symbols: symbol,
      interval,
      from: String(from),
      to: String(now),
      convert_to_usd: 'true'
    });

    if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0].history)) {
      return data[0].history.map((h: { t: number; o: number; h: number; l: number; c: number }) => ({
        time: h.t,
        value: h.c // closing OI value
      }));
    }
    return [];
  } catch (err) {
    console.error('[Coinalyze] OI history error:', err);
    return [];
  }
}

/** Fetch current funding rate */
export async function fetchCurrentFunding(pair: string): Promise<{ value: number; update: number } | null> {
  try {
    const symbol = pairToCoinalyze(pair);
    const data = await coinalyzeFetch('funding-rate', { symbols: symbol });
    if (Array.isArray(data) && data.length > 0) {
      return { value: data[0].value, update: data[0].update };
    }
    return null;
  } catch (err) {
    console.error('[Coinalyze] Funding fetch error:', err);
    return null;
  }
}

/** Fetch funding rate history */
export async function fetchFundingHistory(
  pair: string,
  tf: string,
  limit: number = 300
): Promise<FundingDataPoint[]> {
  try {
    const symbol = pairToCoinalyze(pair);
    const interval = tfToCoinalyzeInterval(tf);
    const now = Math.floor(Date.now() / 1000);
    const intervalSecs: Record<string, number> = {
      '1min': 60,
      '5min': 300,
      '15min': 900,
      '30min': 1800,
      '1hour': 3600,
      '4hour': 14400,
      'daily': 86400,
      'weekly': 604800,
    };
    const from = now - (intervalSecs[interval] || 14400) * limit;

    const data = await coinalyzeFetch('funding-rate-history', {
      symbols: symbol,
      interval,
      from: String(from),
      to: String(now)
    });

    if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0].history)) {
      return data[0].history.map((h: { t: number; o: number; h: number; l: number; c: number }) => ({
        time: h.t,
        value: h.c
      }));
    }
    return [];
  } catch (err) {
    console.error('[Coinalyze] Funding history error:', err);
    return [];
  }
}

/** Fetch liquidation history */
export async function fetchLiquidationHistory(
  pair: string,
  tf: string,
  limit: number = 300
): Promise<LiquidationDataPoint[]> {
  try {
    const symbol = pairToCoinalyze(pair);
    const interval = tfToCoinalyzeInterval(tf);
    const now = Math.floor(Date.now() / 1000);
    const intervalSecs: Record<string, number> = {
      '1min': 60,
      '5min': 300,
      '15min': 900,
      '30min': 1800,
      '1hour': 3600,
      '4hour': 14400,
      'daily': 86400,
      'weekly': 604800,
    };
    const from = now - (intervalSecs[interval] || 14400) * limit;

    const data = await coinalyzeFetch('liquidation-history', {
      symbols: symbol,
      interval,
      from: String(from),
      to: String(now),
      convert_to_usd: 'true'
    });

    if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0].history)) {
      return data[0].history.map((h: { t: number; l: number; s: number }) => ({
        time: h.t,
        long: h.l || 0,
        short: h.s || 0
      }));
    }
    return [];
  } catch (err) {
    console.error('[Coinalyze] Liquidation history error:', err);
    return [];
  }
}

/** Fetch long/short ratio history */
export async function fetchLSRatioHistory(
  pair: string,
  tf: string,
  limit: number = 300
): Promise<LSRatioDataPoint[]> {
  try {
    const symbol = pairToCoinalyze(pair);
    const interval = tfToCoinalyzeInterval(tf);
    const now = Math.floor(Date.now() / 1000);
    const intervalSecs: Record<string, number> = {
      '1min': 60,
      '5min': 300,
      '15min': 900,
      '30min': 1800,
      '1hour': 3600,
      '4hour': 14400,
      'daily': 86400,
      'weekly': 604800,
    };
    const from = now - (intervalSecs[interval] || 14400) * limit;

    const data = await coinalyzeFetch('long-short-ratio-history', {
      symbols: symbol,
      interval,
      from: String(from),
      to: String(now)
    });

    if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0].history)) {
      return data[0].history.map((h: { t: number; o: number; h: number; l: number; c: number }) => ({
        time: h.t,
        value: h.c
      }));
    }
    return [];
  } catch (err) {
    console.error('[Coinalyze] LS ratio history error:', err);
    return [];
  }
}

/** Fetch predicted funding rate */
export async function fetchPredictedFunding(pair: string): Promise<{ value: number; update: number } | null> {
  try {
    const symbol = pairToCoinalyze(pair);
    const data = await coinalyzeFetch('predicted-funding-rate', { symbols: symbol });
    if (Array.isArray(data) && data.length > 0) {
      return { value: data[0].value, update: data[0].update };
    }
    return null;
  } catch (err) {
    console.error('[Coinalyze] Predicted funding error:', err);
    return null;
  }
}

/** Format large numbers */
export function formatOI(v: number): string {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + v.toFixed(0);
}

/** Format funding rate as percentage */
export function formatFunding(v: number): string {
  return (v * 100).toFixed(4) + '%';
}
