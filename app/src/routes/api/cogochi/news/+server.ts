import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// ─── News Event Feed — CryptoPanic RSS proxy ───────────────────────────────
// W-0210 Layer 4: Fetch crypto news events with timestamps for chart markers.
// Cost: $0 (CryptoPanic free public API, no auth required for public posts).
// Cache: 5 minutes server-side.
//
// Response shape:
// {
//   results: Array<{
//     title: string,
//     published_at: string (ISO 8601),
//     currencies: Array<{ code: string }>,
//     votes: { positive, negative },
//   }>
// }

export interface NewsEvent {
  id: string;
  title: string;
  publishedAt: number;    // unix seconds
  url: string;
  symbols: string[];      // ['BTC', 'ETH', ...]
  sentiment: 'positive' | 'negative' | 'neutral';
  source: string;
}

// Server-side cache (best-effort, single instance)
let _cache: { ts: number; data: NewsEvent[]; symbol: string } | null = null;
const CACHE_TTL_MS = 300_000; // 5 minutes

export const GET: RequestHandler = async ({ url }) => {
  const symbolParam = (url.searchParams.get('symbol') ?? 'BTC').toUpperCase().replace('USDT', '');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 50);

  // Cache hit
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS && _cache.symbol === symbolParam) {
    return json({ events: _cache.data.slice(0, limit), cached: true });
  }

  try {
    // CryptoPanic public API — no auth needed for public posts
    // Filter by currency if not BTC (BTC is available on general feed)
    const currencyParam = symbolParam !== 'BTC' ? `&currencies=${symbolParam}` : '';
    const apiUrl = `https://cryptopanic.com/api/free/v1/posts/?auth_token=free${currencyParam}&public=true&kind=news`;

    const res = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      throw new Error(`CryptoPanic API ${res.status}`);
    }

    const raw = await res.json() as {
      results?: Array<{
        id?: number;
        title?: string;
        published_at?: string;
        url?: string;
        source?: { title?: string };
        currencies?: Array<{ code?: string }>;
        votes?: { positive?: number; negative?: number; important?: number };
      }>;
    };

    const results = raw.results ?? [];
    const events: NewsEvent[] = [];

    for (const item of results) {
      if (!item.title || !item.published_at) continue;

      const publishedAt = Math.floor(new Date(item.published_at).getTime() / 1000);
      if (isNaN(publishedAt)) continue;

      const pos = item.votes?.positive ?? 0;
      const neg = item.votes?.negative ?? 0;
      const sentiment: NewsEvent['sentiment'] =
        pos > neg + 2 ? 'positive' :
        neg > pos + 2 ? 'negative' :
        'neutral';

      const symbols = (item.currencies ?? [])
        .map(c => c.code ?? '')
        .filter(Boolean)
        .map(c => c.toUpperCase());

      events.push({
        id: String(item.id ?? publishedAt),
        title: item.title,
        publishedAt,
        url: item.url ?? '',
        symbols: symbols.length ? symbols : [symbolParam],
        sentiment,
        source: item.source?.title ?? 'News',
      });
    }

    // Sort newest first
    events.sort((a, b) => b.publishedAt - a.publishedAt);
    const filtered = events.filter(e =>
      symbolParam === 'BTC' || e.symbols.includes(symbolParam)
    );

    _cache = { ts: Date.now(), data: filtered, symbol: symbolParam };
    return json({ events: filtered.slice(0, limit), cached: false });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[news] Feed fetch failed:', message);

    // Stale cache fallback
    if (_cache) {
      return json({ events: _cache.data.slice(0, limit), cached: true, stale: true });
    }

    return json({ events: [], error: 'News feed unavailable' });
  }
};
