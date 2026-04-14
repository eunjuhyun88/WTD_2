// ═══════════════════════════════════════════════════════════════
// Social Sentiment Proxy (Santiment → LunarCrush fallback)
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchTopicSocial, hasLunarCrushKey } from '$lib/server/lunarcrush';
import { fetchSantimentSocial, hasSantimentKey } from '$lib/server/santiment';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const token = (url.searchParams.get('token') || 'bitcoin').toLowerCase();

    // Map common symbols to topic names
    const topicMap: Record<string, string> = {
      btc: 'bitcoin', eth: 'ethereum', sol: 'solana',
      doge: 'dogecoin', xrp: 'ripple', bnb: 'bnb',
      ada: 'cardano', avax: 'avalanche', dot: 'polkadot',
      matic: 'polygon', link: 'chainlink', uni: 'uniswap',
    };
    const topic = topicMap[token] ?? token;

    // Try Santiment first (primary), then LunarCrush (fallback)
    let data = null;
    let source: string | null = null;

    if (hasSantimentKey()) {
      data = await fetchSantimentSocial(topic);
      if (data) source = 'santiment';
    }

    if (!data && hasLunarCrushKey()) {
      data = await fetchTopicSocial(topic);
      if (data) source = 'lunarcrush';
    }

    if (!data) {
      return json({ ok: false, error: 'No social sentiment API available' }, { status: 503 });
    }

    return json(
      { ok: true, source, data },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  } catch (error: unknown) {
    console.error('[senti/social] error:', error);
    return json({ error: 'Failed to fetch social sentiment' }, { status: 500 });
  }
};
