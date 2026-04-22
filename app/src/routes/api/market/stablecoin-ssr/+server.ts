/**
 * GET /api/market/stablecoin-ssr
 *
 * W-0122-F — Stablecoin Supply Ratio (SSR) = BTC market cap / total stablecoin supply.
 *
 * A low SSR means lots of dry powder sitting in stablecoins relative to BTC mcap
 * (bullish setup). A high SSR means stablecoin reserves are depleted relative to BTC
 * mcap (late-cycle / less dry powder).
 *
 * Sources (all free):
 *   - DefiLlama: `https://stablecoins.llama.fi/stablecoinchart/all?stablecoin=all`
 *     → historical total stablecoin mcap (180+ days)
 *   - CoinGecko: `/coins/bitcoin/market_chart?vs_currency=usd&days=180&interval=daily`
 *     → historical BTC mcap daily
 *
 * Cache: 30 min (mcap moves slowly).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { getRequestIp } from '$lib/server/requestIp';

export interface SsrPayload {
  at: number;
  /** Current SSR = BTC_mcap / stablecoin_total_mcap. */
  current: number;
  /** 30d percentile of current reading (0-100). */
  percentile: number;
  /** Last 60 daily readings for sparkline. */
  sparkline: number[];
  /** Direction hint for the UI. */
  regime: 'dry_powder_high' | 'dry_powder_low' | 'neutral';
}

const CACHE_TTL_MS = 30 * 60_000;
const TIMEOUT_MS = 10_000;
let cache: { at: number; payload: SsrPayload } | null = null;

async function safeFetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'cogochi-terminal/ssr' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface LlamaPoint { date: number | string; totalCirculatingUSD?: { peggedUSD?: number } }
interface CoinGeckoChart { market_caps?: Array<[number, number]> }

function percentileOf(value: number, series: number[]): number {
  const sorted = [...series].filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return 50;
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, Math.min(100, (lo / sorted.length) * 100));
}

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
  const ip = getRequestIp({ request, getClientAddress });
  if (!chartFeedLimiter.check(ip)) {
    return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return json(cache.payload, { headers: { 'X-Cache': 'HIT' } });
  }

  const [llamaHist, btcChart] = await Promise.all([
    // DefiLlama stablecoins API — note plural `stablecoincharts`.
    safeFetchJson<LlamaPoint[]>('https://stablecoins.llama.fi/stablecoincharts/all'),
    safeFetchJson<CoinGeckoChart>(
      'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=180&interval=daily'
    ),
  ]);

  if (!Array.isArray(llamaHist) || !btcChart?.market_caps?.length) {
    return json({ error: 'upstream_unavailable' }, { status: 503 });
  }

  // Normalize — Llama returns day-keyed points, CoinGecko returns ms-timestamped [ts, mcap]
  // We align by day and compute SSR series.
  const stablecoinByDay = new Map<string, number>();
  for (const p of llamaHist) {
    const ts = typeof p.date === 'string' ? Number(p.date) : p.date;
    if (!Number.isFinite(ts)) continue;
    const mcap = p.totalCirculatingUSD?.peggedUSD;
    if (!Number.isFinite(mcap ?? NaN) || (mcap ?? 0) <= 0) continue;
    const dayKey = new Date((ts as number) * 1000).toISOString().slice(0, 10);
    stablecoinByDay.set(dayKey, mcap!);
  }

  const btcByDay = new Map<string, number>();
  for (const [ts, mcap] of btcChart.market_caps) {
    if (!Number.isFinite(mcap) || mcap <= 0) continue;
    const dayKey = new Date(ts).toISOString().slice(0, 10);
    btcByDay.set(dayKey, mcap);
  }

  // Compute SSR series — walk BTC days (they're the constraint); join stablecoin same-day.
  const ssrSeries: Array<{ day: string; ssr: number }> = [];
  const sortedDays = [...btcByDay.keys()].sort();
  for (const day of sortedDays) {
    const btcMcap = btcByDay.get(day);
    const scMcap = stablecoinByDay.get(day);
    if (btcMcap && scMcap && scMcap > 0) {
      ssrSeries.push({ day, ssr: btcMcap / scMcap });
    }
  }

  if (ssrSeries.length < 30) {
    return json({ error: 'insufficient_history' }, { status: 503 });
  }

  const current = ssrSeries[ssrSeries.length - 1].ssr;
  const last30 = ssrSeries.slice(-30).map(p => p.ssr);
  const pct = percentileOf(current, last30);
  const sparkline = ssrSeries.slice(-60).map(p => p.ssr);

  let regime: SsrPayload['regime'];
  if (pct <= 25) regime = 'dry_powder_high';    // low SSR → lots of stablecoin ammo
  else if (pct >= 75) regime = 'dry_powder_low'; // high SSR → depleted stablecoin reserves
  else regime = 'neutral';

  const payload: SsrPayload = {
    at: Date.now(),
    current,
    percentile: pct,
    sparkline,
    regime,
  };

  cache = { at: Date.now(), payload };
  return json(payload, { headers: { 'X-Cache': 'MISS' } });
};
