// ═══════════════════════════════════════════════════════════════
// Stockclaw — LunarCrush API Client (server-side)
// ═══════════════════════════════════════════════════════════════
// Social metrics: sentiment, social volume, interactions, dominance
// Maps to: SENTI agent → SOCIAL_VOLUME, SOCIAL_SENTIMENT

import { env } from '$env/dynamic/private';
import { getCached, setCache } from './providers/cache';

const BASE = 'https://lunarcrush.com/api4/public';
const CACHE_TTL = 120_000; // 2 min

function apiKey(): string {
  return env.LUNARCRUSH_API_KEY ?? '';
}

export interface LunarCrushTopicData {
  topic: string;
  sentiment: number;          // 1-5 (1=bearish, 5=bullish)
  interactions24h: number;    // total engagements 24h
  postsActive: number;        // active mentions
  contributorsActive: number; // unique creators posting
  socialDominance: number;    // % of total crypto social volume
  galaxyScore: number;        // 0-100 overall health
  altRank: number;            // rank vs other cryptos
  topicRank: number;
  close: number;              // price
  percentChange24h: number;
  volume24h: number;
  marketCap: number;
}

async function lcFetch<T>(path: string): Promise<T | null> {
  const key = apiKey();
  if (!key) return null;

  const cacheKey = `lunarcrush:${path}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[LunarCrush] ${res.status} ${res.statusText}`);
      return null;
    }
    const json = await res.json();
    setCache(cacheKey, json?.data ?? json, CACHE_TTL);
    return (json?.data ?? json) as T;
  } catch (err) {
    console.error('[LunarCrush]', err);
    return null;
  }
}

/** Fetch topic social metrics (BTC, ETH, SOL, etc.) */
export async function fetchTopicSocial(topic: string): Promise<LunarCrushTopicData | null> {
  const raw = await lcFetch<any>(`/topic/${topic.toLowerCase()}/v1`);
  if (!raw) return null;

  return {
    topic: raw.topic ?? topic,
    sentiment: raw.sentiment ?? 3,
    interactions24h: raw.interactions_24h ?? raw.interactions ?? 0,
    postsActive: raw.posts_active ?? raw.num_posts ?? 0,
    contributorsActive: raw.contributors_active ?? raw.num_contributors ?? 0,
    socialDominance: raw.social_dominance ?? 0,
    galaxyScore: raw.galaxy_score ?? 0,
    altRank: raw.alt_rank ?? 0,
    topicRank: raw.topic_rank ?? 0,
    close: raw.close ?? raw.price ?? 0,
    percentChange24h: raw.percent_change_24h ?? 0,
    volume24h: raw.volume_24h ?? raw.volume ?? 0,
    marketCap: raw.market_cap ?? 0,
  };
}

// ── Topic Posts (popular social posts / news about a topic) ──

export interface LunarCrushPost {
  id: string;
  title: string;
  body: string;
  link: string;
  creator: string;
  creatorFollowers: number;
  network: string;      // 'twitter', 'reddit', 'youtube', 'news'
  interactions: number;  // total engagements
  sentiment: number;     // 1-5
  publishedAt: number;   // unix ms
}

/** Fetch popular posts about a topic.
 * interval: '1d' | '1w' | '1m' | '3m' | '6m' | '1y'
 * Returns up to ~50 posts sorted by engagement */
export async function fetchTopicPosts(
  topic: string,
  interval: string = '1m',
  limit: number = 50
): Promise<LunarCrushPost[]> {
  const cacheTTL = 300_000; // 5min for posts
  const path = `/topic/${topic.toLowerCase()}/posts/${interval}`;
  const cacheKey = `lunarcrush:posts:${path}:${limit}`;
  const cached = getCached<LunarCrushPost[]>(cacheKey);
  if (cached) return cached;

  const key = apiKey();
  if (!key) return [];

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`[LunarCrush Posts] ${res.status} ${res.statusText}`);
      return [];
    }
    const json = await res.json();
    const rawPosts = json?.data ?? json ?? [];
    if (!Array.isArray(rawPosts)) return [];

    const posts: LunarCrushPost[] = rawPosts
      .slice(0, limit)
      .map((p: any) => ({
        id: String(p.id ?? p.post_id ?? `lc-${Date.now()}-${Math.random()}`),
        title: p.post_title ?? p.title ?? '',
        body: (p.body ?? p.post_body ?? '').slice(0, 300),
        link: p.post_link ?? p.link ?? p.url ?? '',
        creator: p.creator_display_name ?? p.creator_name ?? p.creator ?? 'Unknown',
        creatorFollowers: p.creator_followers ?? 0,
        network: p.network ?? 'unknown',
        interactions: p.interactions_total ?? p.interactions ?? p.interactions_24h ?? 0,
        sentiment: p.sentiment ?? 3,
        publishedAt: p.post_created ? p.post_created * 1000 :
                     p.time_created ? p.time_created * 1000 :
                     Date.now(),
      }))
      .sort((a: LunarCrushPost, b: LunarCrushPost) => b.interactions - a.interactions);

    setCache(cacheKey, posts, cacheTTL);
    return posts;
  } catch (err) {
    console.error('[LunarCrush Posts]', err);
    return [];
  }
}

/** Check if LunarCrush API key is configured */
export function hasLunarCrushKey(): boolean {
  return Boolean(apiKey());
}
