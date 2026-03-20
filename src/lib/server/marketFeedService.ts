// ═══════════════════════════════════════════════════════════════
// Stockclaw — Market Feed Service (server)
// ═══════════════════════════════════════════════════════════════

import { PAIR_RE } from '$lib/server/apiValidation';
import { toCoinalyzeInterval } from '$lib/utils/timeframe';
import { getCached, setCache } from './providers/cache';

const NEWS_CACHE_TTL = 2 * 60_000; // 2분

const NEWS_FEEDS = [
  { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { source: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
];

const TIMEFRAME_SET = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']);

type CoinalyzeTick = { value?: number; update?: number };
type CoinalyzeHistory = { history?: Array<{ t: number; l?: number; s?: number; c?: number }> };

export type DerivativesSnapshot = {
  pair: string;
  timeframe: string;
  oi: number | null;
  funding: number | null;
  predFunding: number | null;
  lsRatio: number | null;
  liqLong24h: number;
  liqShort24h: number;
  updatedAt: number;
};

export type NewsRecord = {
  id: string;
  source: string;
  title: string;
  summary: string;
  link: string;
  publishedAt: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
};

function toSymbol(pair: string): string {
  return pair.replace('/', '') + '_PERP.A';
}

function stripTags(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readTag(item: string, tag: string): string {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? stripTags(match[1]) : '';
}

function classifySentiment(title: string, summary: string): NewsRecord['sentiment'] {
  const text = `${title} ${summary}`.toLowerCase();
  const bullishHits = ['rally', 'surge', 'gain', 'bull', 'record high', 'breakout', 'approval'].filter((k) =>
    text.includes(k)
  ).length;
  const bearishHits = ['drop', 'selloff', 'bear', 'liquidation', 'hack', 'lawsuit', 'delay'].filter((k) =>
    text.includes(k)
  ).length;
  if (bullishHits > bearishHits) return 'bullish';
  if (bearishHits > bullishHits) return 'bearish';
  return 'neutral';
}

async function withTimeout(url: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function normalizePair(pairRaw: unknown): string {
  const pair = typeof pairRaw === 'string' ? decodeURIComponent(pairRaw).trim().toUpperCase() : '';
  const canonical = pair.replace(/[-_]/g, '/');
  if (!canonical) return 'BTC/USDT';
  if (!PAIR_RE.test(canonical)) throw new Error('pair must be like BTC/USDT');
  return canonical;
}

export function normalizeTimeframe(timeframeRaw: unknown): string {
  const tf = typeof timeframeRaw === 'string' ? timeframeRaw.trim().toLowerCase() : '4h';
  if (!tf) return '4h';
  if (!TIMEFRAME_SET.has(tf)) throw new Error('timeframe must be one of 1m,5m,15m,30m,1h,4h,1d,1w');
  return tf;
}

export function pairToSlug(pair: string): string {
  return pair.replace('/', '-');
}

export async function fetchNews(limit = 20): Promise<NewsRecord[]> {
  const cacheKey = `news:${limit}`;
  const cached = getCached<NewsRecord[]>(cacheKey);
  if (cached) return cached;

  const jobs = NEWS_FEEDS.map(async ({ source, url }) => {
    try {
      const res = await withTimeout(url, 6000);
      if (!res.ok) return [] as NewsRecord[];

      const xml = await res.text();
      const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
      return items.slice(0, Math.max(1, Math.min(20, limit))).map((item, idx) => {
        const title = readTag(item, 'title');
        const link = readTag(item, 'link');
        const summary = readTag(item, 'description');
        const publishedRaw = readTag(item, 'pubDate');
        const publishedAt = Date.parse(publishedRaw);
        return {
          id: `${source.toLowerCase()}-${publishedRaw || idx}-${title}`.replace(/\s+/g, '-').slice(0, 96),
          source,
          title,
          summary,
          link,
          publishedAt: Number.isFinite(publishedAt) ? publishedAt : Date.now() - idx * 60_000,
          sentiment: classifySentiment(title, summary),
        };
      });
    } catch {
      return [] as NewsRecord[];
    }
  });

  const merged = (await Promise.all(jobs)).flat();
  merged.sort((a, b) => b.publishedAt - a.publishedAt);
  const result = merged.slice(0, Math.max(1, Math.min(100, limit)));
  setCache(cacheKey, result, NEWS_CACHE_TTL);
  return result;
}

async function callCoinalyze(eventFetch: typeof fetch, endpoint: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ endpoint, ...params });
  const res = await eventFetch(`/api/coinalyze?${qs.toString()}`);
  if (!res.ok) throw new Error(`coinalyze proxy ${res.status}`);
  return res.json();
}

export async function fetchDerivatives(
  eventFetch: typeof fetch,
  pair: string,
  timeframe = '4h'
): Promise<DerivativesSnapshot> {
  const symbol = toSymbol(pair);
  const interval = toCoinalyzeInterval(timeframe);
  const now = Math.floor(Date.now() / 1000);
  const intervalSeconds: Record<string, number> = {
    '1min': 60,
    '5min': 300,
    '15min': 900,
    '30min': 1800,
    '1hour': 3600,
    '4hour': 14400,
    daily: 86400,
    weekly: 604800,
  };
  const from = now - (intervalSeconds[interval] || 14400) * 24;

  const [oiRes, frRes, predRes, lsRes, liqRes] = await Promise.allSettled([
    callCoinalyze(eventFetch, 'open-interest', { symbols: symbol, convert_to_usd: 'true' }),
    callCoinalyze(eventFetch, 'funding-rate', { symbols: symbol }),
    callCoinalyze(eventFetch, 'predicted-funding-rate', { symbols: symbol }),
    callCoinalyze(eventFetch, 'long-short-ratio-history', {
      symbols: symbol,
      interval,
      from: String(from),
      to: String(now),
    }),
    callCoinalyze(eventFetch, 'liquidation-history', {
      symbols: symbol,
      interval,
      from: String(from),
      to: String(now),
      convert_to_usd: 'true',
    }),
  ]);

  const oiTick = oiRes.status === 'fulfilled' && Array.isArray(oiRes.value) ? (oiRes.value[0] as CoinalyzeTick) : null;
  const frTick = frRes.status === 'fulfilled' && Array.isArray(frRes.value) ? (frRes.value[0] as CoinalyzeTick) : null;
  const predTick =
    predRes.status === 'fulfilled' && Array.isArray(predRes.value) ? (predRes.value[0] as CoinalyzeTick) : null;
  const lsHistory =
    lsRes.status === 'fulfilled' && Array.isArray(lsRes.value) ? (lsRes.value[0] as CoinalyzeHistory) : null;
  const liqHistory =
    liqRes.status === 'fulfilled' && Array.isArray(liqRes.value) ? (liqRes.value[0] as CoinalyzeHistory) : null;

  const lsLatest = Array.isArray(lsHistory?.history) ? lsHistory!.history[lsHistory!.history.length - 1] : null;
  const liqSeries = Array.isArray(liqHistory?.history) ? liqHistory!.history : [];
  const liqLong24h = liqSeries.reduce((sum, row) => sum + (Number(row.l) || 0), 0);
  const liqShort24h = liqSeries.reduce((sum, row) => sum + (Number(row.s) || 0), 0);

  return {
    pair,
    timeframe,
    oi: oiTick && Number.isFinite(oiTick.value) ? Number(oiTick.value) : null,
    funding: frTick && Number.isFinite(frTick.value) ? Number(frTick.value) : null,
    predFunding: predTick && Number.isFinite(predTick.value) ? Number(predTick.value) : null,
    lsRatio: lsLatest && Number.isFinite(lsLatest.c) ? Number(lsLatest.c) : null,
    liqLong24h,
    liqShort24h,
    updatedAt: Date.now(),
  };
}

