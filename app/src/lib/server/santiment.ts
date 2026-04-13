// ═══════════════════════════════════════════════════════════════
// Santiment GraphQL API Client (server-side)
// ═══════════════════════════════════════════════════════════════
// Social sentiment via Santiment (LunarCrush 대체)
// Provides: sentiment_balance, social_volume, social_dominance
// Maps to: SENTI agent → same LunarCrushTopicData interface

import { env } from '$env/dynamic/private';
import { getCached, setCache } from './providers/cache';
import type { LunarCrushTopicData } from './lunarcrush';

const ENDPOINT = 'https://api.santiment.net/graphql';
const CACHE_TTL = 120_000; // 2 min (same as LunarCrush)

function apiKey(): string {
  return env.SANTIMENT_API_KEY?.trim() ?? '';
}

export function hasSantimentKey(): boolean {
  return apiKey().length > 0;
}

// ── Slug Mapping ─────────────────────────────────────────────

const TOKEN_TO_SLUG: Record<string, string> = {
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  eth: 'ethereum',
  ethereum: 'ethereum',
  sol: 'solana',
  solana: 'solana',
  doge: 'dogecoin',
  xrp: 'ripple',
  bnb: 'binance-coin',
  ada: 'cardano',
  avax: 'avalanche-2',
  dot: 'polkadot-new',
  link: 'chainlink',
  matic: 'matic-network',
  uni: 'uniswap',
  atom: 'cosmos',
  near: 'near-protocol',
  sui: 'sui',
  apt: 'aptos',
  arb: 'arbitrum',
  op: 'optimism',
};

function topicToSlug(topic: string): string {
  const lower = topic.toLowerCase().replace(/\/usdt?$/i, '');
  return TOKEN_TO_SLUG[lower] ?? lower;
}

// ── GraphQL Query ────────────────────────────────────────────

function buildQuery(slug: string): string {
  const from = 'utc_now-2d';
  const to = 'utc_now';
  return `{
    sentimentBalance: getMetric(metric: "sentiment_balance_total") {
      timeseriesData(
        slug: "${slug}"
        from: "${from}"
        to: "${to}"
        interval: "1d"
      ) { datetime value }
    }
    socialVolume: getMetric(metric: "social_volume_total") {
      timeseriesData(
        slug: "${slug}"
        from: "${from}"
        to: "${to}"
        interval: "1d"
      ) { datetime value }
    }
    socialDominance: getMetric(metric: "social_dominance_total") {
      timeseriesData(
        slug: "${slug}"
        from: "${from}"
        to: "${to}"
        interval: "1d"
      ) { datetime value }
    }
  }`;
}

// ── Sentiment Balance → 1-5 Scale Mapping ────────────────────
// Santiment sentiment_balance ranges roughly -∞ to +∞
// Typical range: -200 to +200 for major coins
// Map to LunarCrush 1-5 scale (1=bearish, 5=bullish)

function mapSentimentTo5Scale(balance: number): number {
  if (balance > 200) return 5;
  if (balance > 50) return 4;
  if (balance > -50) return 3;
  if (balance > -200) return 2;
  return 1;
}

// ── Main Fetch Function ──────────────────────────────────────

/**
 * Fetch social sentiment metrics from Santiment.
 * Returns LunarCrushTopicData-compatible object for drop-in replacement.
 */
export async function fetchSantimentSocial(topic: string): Promise<LunarCrushTopicData | null> {
  const key = apiKey();
  if (!key) return null;

  const slug = topicToSlug(topic);
  const cacheKey = `santiment:social:${slug}`;
  const cached = getCached<LunarCrushTopicData>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Apikey ${key}`,
      },
      body: JSON.stringify({ query: buildQuery(slug) }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error(`[Santiment] ${res.status} ${res.statusText}`);
      return null;
    }

    const json = await res.json();
    if (json.errors?.length) {
      console.error('[Santiment] GraphQL errors:', json.errors[0]?.message);
      return null;
    }

    const data = json?.data;
    if (!data) return null;

    // Extract latest values from each timeseries
    const sentimentTs = data.sentimentBalance?.timeseriesData ?? [];
    const volumeTs = data.socialVolume?.timeseriesData ?? [];
    const dominanceTs = data.socialDominance?.timeseriesData ?? [];

    const latestSentiment = sentimentTs.length > 0 ? sentimentTs[sentimentTs.length - 1]?.value : 0;
    const latestVolume = volumeTs.length > 0 ? volumeTs[volumeTs.length - 1]?.value : 0;
    const latestDominance = dominanceTs.length > 0 ? dominanceTs[dominanceTs.length - 1]?.value : 0;

    const result: LunarCrushTopicData = {
      topic: topic,
      sentiment: mapSentimentTo5Scale(latestSentiment ?? 0),
      interactions24h: Math.round(latestVolume ?? 0),
      postsActive: Math.round((latestVolume ?? 0) * 0.6), // proxy: ~60% of volume
      contributorsActive: Math.round((latestVolume ?? 0) * 0.2), // proxy: ~20% of volume
      socialDominance: latestDominance ?? 0,
      galaxyScore: 50, // No Santiment equivalent → neutral default
      altRank: 0,
      topicRank: 0,
      close: 0,           // Price not fetched via Santiment (already from Binance)
      percentChange24h: 0,
      volume24h: 0,
      marketCap: 0,
    };

    setCache(cacheKey, result, CACHE_TTL);
    return result;
  } catch (err) {
    console.error('[Santiment]', err instanceof Error ? err.message : err);
    return null;
  }
}
