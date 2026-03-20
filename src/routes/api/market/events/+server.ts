import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchDerivatives, normalizePair, normalizeTimeframe } from '$lib/server/marketFeedService';
import {
  fetchDexAdsLatest,
  fetchDexCommunityTakeoversLatest,
  fetchDexTokenBoostsLatest,
  fetchDexTokens,
} from '$lib/server/dexscreener';

type DexLikeRow = {
  chainId: string;
  tokenAddress: string;
};

type DexPairLike = {
  baseToken?: {
    address?: string;
    name?: string;
    symbol?: string;
  };
};

type DexTokenMeta = {
  symbol: string | null;
  name: string | null;
};

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function splitChunks<T>(input: T[], size: number): T[][] {
  if (size <= 0 || input.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < input.length; i += size) out.push(input.slice(i, i + size));
  return out;
}

async function buildDexMetaMap(rows: DexLikeRow[]): Promise<Map<string, DexTokenMeta>> {
  const out = new Map<string, DexTokenMeta>();
  if (rows.length === 0) return out;

  const byChain = new Map<string, string[]>();
  for (const row of rows) {
    const chain = row.chainId.trim();
    if (!chain) continue;
    const bucket = byChain.get(chain) ?? [];
    if (!bucket.includes(row.tokenAddress)) bucket.push(row.tokenAddress);
    byChain.set(chain, bucket);
  }

  for (const [chainId, addresses] of byChain.entries()) {
    for (const chunk of splitChunks(addresses, 30)) {
      try {
        const payload = await fetchDexTokens(chainId, chunk.join(','));
        if (!Array.isArray(payload)) continue;
        for (const rec of payload as DexPairLike[]) {
          const tokenAddress = rec?.baseToken?.address;
          if (typeof tokenAddress !== 'string' || !tokenAddress.trim()) continue;
          const key = `${chainId}:${normalizeAddress(tokenAddress)}`;
          if (out.has(key)) continue;
          out.set(key, {
            symbol: rec?.baseToken?.symbol?.trim() || null,
            name: rec?.baseToken?.name?.trim() || null,
          });
        }
      } catch {
        // best-effort enrichment only
      }
    }
  }

  return out;
}

function compactAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;
}

function tokenLabel(chainId: string, tokenAddress: string, metaMap: Map<string, DexTokenMeta>): string {
  const meta = metaMap.get(`${chainId}:${normalizeAddress(tokenAddress)}`);
  const sym = meta?.symbol?.trim() || '';
  const name = meta?.name?.trim() || '';
  const addr = compactAddress(tokenAddress);
  const chain = chainId.toUpperCase();
  if (sym) return `${chain} ${sym} (${addr})`;
  if (name) return `${chain} ${name} (${addr})`;
  return `${chain} ${addr}`;
}

export const GET: RequestHandler = async ({ fetch, url }) => {
  try {
    const pair = normalizePair(url.searchParams.get('pair'));
    const timeframe = normalizeTimeframe(url.searchParams.get('timeframe'));
    const [deriv, takeovers, boosts, ads] = await Promise.all([
      fetchDerivatives(fetch, pair, timeframe).catch(() => null),
      fetchDexCommunityTakeoversLatest(4).catch(() => []),
      fetchDexTokenBoostsLatest(4).catch(() => []),
      fetchDexAdsLatest(4).catch(() => []),
    ]);

    const dynamic = deriv
      ? [
          {
            id: `deriv-${pair}-${timeframe}`,
            tag: 'DERIV',
            level: 'warning',
            text:
              `Funding ${deriv.funding == null ? 'n/a' : (deriv.funding * 100).toFixed(4) + '%'} · ` +
              `L/S ${deriv.lsRatio == null ? 'n/a' : deriv.lsRatio.toFixed(2)} · ` +
              `Liq L/S ${Math.round(deriv.liqLong24h).toLocaleString()}/${Math.round(deriv.liqShort24h).toLocaleString()}`,
            source: 'COINALYZE',
            createdAt: deriv.updatedAt,
          },
        ]
      : [];

    const dexRows: DexLikeRow[] = [...takeovers, ...boosts, ...ads].map((row) => ({
      chainId: row.chainId,
      tokenAddress: row.tokenAddress,
    }));
    const metaMap = await buildDexMetaMap(dexRows);

    const mappedTakeovers = takeovers.map((row, idx) => ({
      id: `dex-takeover-${row.chainId}-${row.tokenAddress}-${idx}`.slice(0, 80),
      tag: 'TAKEOVER',
      level: 'warning',
      text: `${tokenLabel(row.chainId, row.tokenAddress, metaMap)} 커뮤니티 takeover 감지`,
      source: 'DEXSCREENER',
      createdAt: Date.parse(row.claimDate ?? '') || Date.now() - idx * 60_000,
    }));

    const mappedBoosts = boosts.map((row, idx) => ({
      id: `dex-boost-${row.chainId}-${row.tokenAddress}-${idx}`.slice(0, 80),
      tag: 'BOOST',
      level: 'info',
      text: `${tokenLabel(row.chainId, row.tokenAddress, metaMap)} 토큰 부스트 활동`,
      source: 'DEXSCREENER',
      createdAt: Date.now() - idx * 45_000,
    }));

    const mappedAds = ads.map((row, idx) => ({
      id: `dex-ad-${row.chainId}-${row.tokenAddress}-${idx}`.slice(0, 80),
      tag: 'ADS',
      level: 'info',
      text:
        `${tokenLabel(row.chainId, row.tokenAddress, metaMap)} ` +
        `광고 캠페인 ${row.type ?? 'unknown'}${row.impressions ? ` · imp ${Math.round(row.impressions).toLocaleString()}` : ''}`,
      source: 'DEXSCREENER',
      createdAt: Date.parse(row.date ?? '') || Date.now() - idx * 30_000,
    }));

    return json(
      {
        ok: true,
        data: {
          pair,
          timeframe,
          records: [...dynamic, ...mappedTakeovers, ...mappedBoosts, ...mappedAds].slice(0, 24),
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=30',
        },
      }
    );
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('pair must be like')) {
      return json({ error: error.message }, { status: 400 });
    }
    if (typeof error?.message === 'string' && error.message.includes('timeframe must be one of')) {
      return json({ error: error.message }, { status: 400 });
    }
    console.error('[market/events/get] unexpected error:', error);
    return json({ error: 'Failed to load market events' }, { status: 500 });
  }
};
