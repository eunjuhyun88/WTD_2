// ═══════════════════════════════════════════════════════════════
// Stockclaw — Unified Trending API
// ═══════════════════════════════════════════════════════════════
// Combines: CoinMarketCap (trending/gainers/most-visited)
//           + LunarCrush (social volume/sentiment)
//           + DexScreener (DEX hot tokens/boosts)

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  fetchCMCTrending,
  fetchCMCGainersLosers,
  fetchCMCMostVisited,
  type CMCTrendingCoin,
  type CMCGainerLoser,
} from '$lib/server/coinmarketcap';
import { fetchDexTokenBoostsTop, fetchDexTokenProfilesLatest, fetchDexTokens } from '$lib/server/dexscreener';
import { fetchTopicSocial, hasLunarCrushKey } from '$lib/server/lunarcrush';

// ─── Types ────────────────────────────────────────────────────

interface TrendingCoin {
  rank: number;
  symbol: string;
  name: string;
  slug: string;
  price: number;
  change1h: number;
  change24h: number;
  change7d: number;
  marketCap: number;
  volume24h: number;
  // LunarCrush social overlay
  sentiment?: number | null;
  socialVolume?: number | null;
  galaxyScore?: number | null;
}

interface DexTrendingToken {
  chainId: string;
  tokenAddress: string;
  url: string;
  description: string | null;
  icon: string | null;
  source: 'boost' | 'profile';
  symbol: string | null;
  name: string | null;
  priceUsd: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidityUsd: number | null;
}

interface TrendingResponse {
  trending: TrendingCoin[];
  gainers: CMCGainerLoser[];
  losers: CMCGainerLoser[];
  mostVisited: TrendingCoin[];
  dexHot: DexTrendingToken[];
  updatedAt: number;
}

// ─── Social Enrichment ────────────────────────────────────────

const SYMBOL_TO_TOPIC: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple',
  DOGE: 'dogecoin', ADA: 'cardano', AVAX: 'avalanche', DOT: 'polkadot',
  LINK: 'chainlink', MATIC: 'polygon', SHIB: 'shiba-inu', UNI: 'uniswap',
  NEAR: 'near-protocol', APT: 'aptos', SUI: 'sui', OP: 'optimism',
  ARB: 'arbitrum', PEPE: 'pepe', WIF: 'dogwifhat', BONK: 'bonk',
};

async function enrichWithSocial(coins: CMCTrendingCoin[]): Promise<TrendingCoin[]> {
  if (!hasLunarCrushKey()) {
    return coins.map(c => ({ ...c, sentiment: null, socialVolume: null, galaxyScore: null }));
  }

  // Only enrich top 10 to avoid rate limits
  const top10 = coins.slice(0, 10);
  const socialPromises = top10.map(c => {
    const topic = SYMBOL_TO_TOPIC[c.symbol] ?? c.slug ?? c.name.toLowerCase();
    return fetchTopicSocial(topic).catch(() => null);
  });

  const socialResults = await Promise.allSettled(socialPromises);

  return coins.map((c, i) => {
    const social = i < socialResults.length && socialResults[i].status === 'fulfilled'
      ? socialResults[i].value
      : null;

    return {
      ...c,
      sentiment: social?.sentiment ?? null,
      socialVolume: social?.interactions24h ?? null,
      galaxyScore: social?.galaxyScore ?? null,
    };
  });
}

type DexPairLike = {
  baseToken?: {
    address?: string;
    symbol?: string;
    name?: string;
  };
  priceUsd?: string | number;
  volume?: {
    h24?: number;
  };
  liquidity?: {
    usd?: number;
  };
  priceChange?: {
    h24?: number;
  };
};

type DexTokenEnriched = {
  symbol: string | null;
  name: string | null;
  priceUsd: number | null;
  volume24h: number | null;
  liquidityUsd: number | null;
  change24h: number | null;
  score: number;
};

function toNum(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

function splitChunks<T>(input: T[], size: number): T[][] {
  if (size <= 0 || input.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < input.length; i += size) out.push(input.slice(i, i + size));
  return out;
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

async function enrichDexHotTokens(tokens: DexTrendingToken[]): Promise<DexTrendingToken[]> {
  if (tokens.length === 0) return tokens;

  const byChain = new Map<string, string[]>();
  for (const row of tokens) {
    const chain = row.chainId.trim();
    if (!chain) continue;
    const bucket = byChain.get(chain) ?? [];
    if (!bucket.includes(row.tokenAddress)) bucket.push(row.tokenAddress);
    byChain.set(chain, bucket);
  }

  const tokenMeta = new Map<string, DexTokenEnriched>();

  for (const [chainId, addresses] of byChain.entries()) {
    const chunks = splitChunks(addresses, 30);
    for (const chunk of chunks) {
      try {
        const payload = await fetchDexTokens(chainId, chunk.join(','));
        if (!Array.isArray(payload)) continue;

        for (const row of payload as DexPairLike[]) {
          const addrRaw = row?.baseToken?.address;
          if (typeof addrRaw !== 'string' || !addrRaw.trim()) continue;
          const key = `${chainId}:${normalizeAddress(addrRaw)}`;

          const volume24h = toNum(row?.volume?.h24);
          const liquidityUsd = toNum(row?.liquidity?.usd);
          const score = (volume24h ?? 0) + (liquidityUsd ?? 0) * 0.25;
          const prev = tokenMeta.get(key);
          if (prev && prev.score >= score) continue;

          tokenMeta.set(key, {
            symbol: row?.baseToken?.symbol?.trim() || null,
            name: row?.baseToken?.name?.trim() || null,
            priceUsd: toNum(row?.priceUsd),
            volume24h,
            liquidityUsd,
            change24h: toNum(row?.priceChange?.h24),
            score,
          });
        }
      } catch {
        // DEX enrichment is best-effort
      }
    }
  }

  return tokens.map((row) => {
    const meta = tokenMeta.get(`${row.chainId}:${normalizeAddress(row.tokenAddress)}`);
    if (!meta) return row;
    return {
      ...row,
      symbol: meta.symbol,
      name: meta.name,
      priceUsd: meta.priceUsd,
      change24h: meta.change24h,
      volume24h: meta.volume24h,
      liquidityUsd: meta.liquidityUsd,
    };
  });
}

// ─── Handler ──────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url }) => {
  const limitParam = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);
  const section = url.searchParams.get('section') ?? 'all'; // all, trending, gainers, dex

  try {
    const results: Partial<TrendingResponse> = {};

    // Launch ALL sections in parallel when section=all
    const wantTrending = section === 'all' || section === 'trending';
    const wantGainers = section === 'all' || section === 'gainers';
    const wantDex = section === 'all' || section === 'dex';

    const [trendingBatch, gainersBatch, dexBatch] = await Promise.allSettled([
      wantTrending
        ? Promise.allSettled([fetchCMCTrending(limitParam), fetchCMCMostVisited(limitParam)])
        : Promise.resolve(null),
      wantGainers
        ? fetchCMCGainersLosers(Math.min(limitParam, 15))
        : Promise.resolve(null),
      wantDex
        ? Promise.allSettled([fetchDexTokenBoostsTop(10), fetchDexTokenProfilesLatest(10)])
        : Promise.resolve(null),
    ]);

    // Process trending results
    if (wantTrending && trendingBatch.status === 'fulfilled' && trendingBatch.value) {
      const [trendingRaw, mostVisitedRaw] = trendingBatch.value as PromiseSettledResult<CMCTrendingCoin[]>[];
      const trending = trendingRaw.status === 'fulfilled' ? trendingRaw.value : [];
      const mostVisited = mostVisitedRaw.status === 'fulfilled' ? mostVisitedRaw.value : [];

      results.trending = await enrichWithSocial(trending);
      results.mostVisited = mostVisited.map(c => ({
        ...c, sentiment: null, socialVolume: null, galaxyScore: null,
      }));
    }

    // Process gainers/losers results
    if (wantGainers && gainersBatch.status === 'fulfilled' && gainersBatch.value) {
      const glRes = gainersBatch.value as { gainers: CMCGainerLoser[]; losers: CMCGainerLoser[] };
      results.gainers = glRes.gainers;
      results.losers = glRes.losers;
    }

    // Process DEX results
    if (wantDex && dexBatch.status === 'fulfilled' && dexBatch.value) {
      const [boostsRaw, profilesRaw] = dexBatch.value as PromiseSettledResult<any[]>[];

      const boosts = boostsRaw.status === 'fulfilled' ? (boostsRaw.value ?? []) : [];
      const profiles = profilesRaw.status === 'fulfilled' ? (profilesRaw.value ?? []) : [];

      // Merge and deduplicate DEX trending
      const dexMap = new Map<string, DexTrendingToken>();
      for (const t of boosts) {
        const key = `${t.chainId}:${t.tokenAddress}`;
        dexMap.set(key, {
          chainId: t.chainId,
          tokenAddress: t.tokenAddress,
          url: t.url,
          description: t.description ?? null,
          icon: t.icon ?? null,
          source: 'boost',
          symbol: null,
          name: null,
          priceUsd: null,
          change24h: null,
          volume24h: null,
          liquidityUsd: null,
        });
      }
      for (const t of profiles) {
        const key = `${t.chainId}:${t.tokenAddress}`;
        if (dexMap.has(key)) continue;
        dexMap.set(key, {
          chainId: t.chainId,
          tokenAddress: t.tokenAddress,
          url: t.url,
          description: t.description ?? null,
          icon: t.icon ?? null,
          source: 'profile',
          symbol: null,
          name: null,
          priceUsd: null,
          change24h: null,
          volume24h: null,
          liquidityUsd: null,
        });
      }
      const dexSeed = Array.from(dexMap.values()).slice(0, 15);
      results.dexHot = await enrichDexHotTokens(dexSeed);
    }

    return json(
      {
        ok: true,
        data: {
          trending: results.trending ?? [],
          gainers: results.gainers ?? [],
          losers: results.losers ?? [],
          mostVisited: results.mostVisited ?? [],
          dexHot: results.dexHot ?? [],
          updatedAt: Date.now(),
        } satisfies TrendingResponse,
      },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  } catch (error: unknown) {
    console.error('[api/market/trending] error:', error);
    return json({ error: 'Failed to fetch trending data' }, { status: 500 });
  }
};
