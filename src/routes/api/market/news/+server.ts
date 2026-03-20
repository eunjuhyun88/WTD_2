// ═══════════════════════════════════════════════════════════════
// Stockclaw — Unified News API (RSS + LunarCrush Social)
// ═══════════════════════════════════════════════════════════════
// Merges CoinDesk/Cointelegraph RSS with LunarCrush popular posts
// Supports pagination, importance scoring, and token filtering

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toBoundedInt } from '$lib/server/apiValidation';
import { fetchNews, type NewsRecord } from '$lib/server/marketFeedService';
import { fetchTopicPosts, hasLunarCrushKey, type LunarCrushPost } from '$lib/server/lunarcrush';

// Token → LunarCrush topic mapping
const TOPIC_MAP: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana',
  DOGE: 'dogecoin', XRP: 'ripple', BNB: 'bnb',
  ADA: 'cardano', AVAX: 'avalanche', DOT: 'polkadot',
  MATIC: 'polygon', LINK: 'chainlink', UNI: 'uniswap',
};

interface UnifiedNewsItem {
  id: string;
  source: string;
  title: string;
  summary: string;
  link: string;
  publishedAt: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  interactions: number;    // engagement count for ranking
  importance: number;      // computed importance score 0-100
  network: string;         // 'rss', 'twitter', 'reddit', 'news', etc.
  creator: string;
}

function lcSentimentToTag(s: number): 'bullish' | 'bearish' | 'neutral' {
  if (s >= 4) return 'bullish';
  if (s <= 2) return 'bearish';
  return 'neutral';
}

function computeImportance(item: { interactions: number; publishedAt: number; creatorFollowers?: number }): number {
  // Engagement weight (0-50)
  const engScore = Math.min(50, Math.log10(Math.max(item.interactions, 1) + 1) * 12);
  // Recency weight (0-30): newer = higher
  const ageHours = Math.max(0, (Date.now() - item.publishedAt) / 3_600_000);
  const recencyScore = Math.max(0, 30 - ageHours * 0.3);
  // Creator influence (0-20)
  const followers = item.creatorFollowers ?? 0;
  const influenceScore = Math.min(20, Math.log10(Math.max(followers, 1) + 1) * 4);
  return Math.round(engScore + recencyScore + influenceScore);
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const limit = toBoundedInt(url.searchParams.get('limit'), 30, 1, 100);
    const offset = toBoundedInt(url.searchParams.get('offset'), 0, 0, 500);
    const token = (url.searchParams.get('token') || 'BTC').toUpperCase();
    const interval = url.searchParams.get('interval') || '1m'; // 1d, 1w, 1m, 3m, 6m
    const sortBy = url.searchParams.get('sort') || 'importance'; // importance | time

    // Parallel fetch: RSS + LunarCrush posts
    const topic = TOPIC_MAP[token] ?? token.toLowerCase();
    const [rssRecords, lcPosts] = await Promise.allSettled([
      fetchNews(50), // get more RSS for merging
      hasLunarCrushKey() ? fetchTopicPosts(topic, interval, 50) : Promise.resolve([])
    ]);

    const rss = rssRecords.status === 'fulfilled' ? rssRecords.value : [];
    const social = lcPosts.status === 'fulfilled' ? lcPosts.value : [];

    // Convert RSS to unified format
    const rssItems: UnifiedNewsItem[] = rss.map((r: NewsRecord) => ({
      id: r.id,
      source: r.source,
      title: r.title,
      summary: r.summary,
      link: r.link,
      publishedAt: r.publishedAt,
      sentiment: r.sentiment,
      interactions: 0, // RSS has no engagement data
      importance: computeImportance({ interactions: 0, publishedAt: r.publishedAt }),
      network: 'rss',
      creator: r.source,
    }));

    // Convert LunarCrush posts to unified format
    const socialItems: UnifiedNewsItem[] = social.map((p: LunarCrushPost) => ({
      id: `lc-${p.id}`,
      source: `LunarCrush:${p.network}`,
      title: p.title || p.body.slice(0, 120),
      summary: p.body,
      link: p.link,
      publishedAt: p.publishedAt,
      sentiment: lcSentimentToTag(p.sentiment),
      interactions: p.interactions,
      importance: computeImportance({
        interactions: p.interactions,
        publishedAt: p.publishedAt,
        creatorFollowers: p.creatorFollowers
      }),
      network: p.network,
      creator: p.creator,
    }));

    // Merge + deduplicate by title similarity
    const allItems = [...rssItems, ...socialItems];
    const seen = new Set<string>();
    const deduplicated = allItems.filter(item => {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort
    if (sortBy === 'importance') {
      deduplicated.sort((a, b) => b.importance - a.importance);
    } else {
      deduplicated.sort((a, b) => b.publishedAt - a.publishedAt);
    }

    // Paginate
    const paginated = deduplicated.slice(offset, offset + limit);
    const hasMore = offset + limit < deduplicated.length;

    return json(
      {
        ok: true,
        data: {
          records: paginated,
          total: deduplicated.length,
          offset,
          limit,
          hasMore,
          sources: {
            rss: rss.length,
            social: social.length,
          },
        },
      },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  } catch (error) {
    console.error('[market/news/get] unexpected error:', error);
    return json({ error: 'Failed to load market news' }, { status: 500 });
  }
};
