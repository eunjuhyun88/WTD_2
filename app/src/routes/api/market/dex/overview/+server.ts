import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { DexOverviewPair, DexOverviewPayload } from '$lib/contracts/cogochiDataPlane';
import { searchDexPairs } from '$lib/server/providers/dexscreener';
import { fetchChainTvls, fetchTotalTvl } from '$lib/api/defillama';

const SYMBOL_SUFFIX_RE = /(USDT|USDC|USD|PERP)$/;
const SYMBOL_PROXY_MAP: Record<string, string> = {
  BTC: 'WBTC',
  ETH: 'WETH',
  BNB: 'WBNB',
  AVAX: 'WAVAX',
  MATIC: 'WMATIC',
};
const CHAIN_LABELS: Record<string, string> = {
  ethereum: 'Ethereum',
  eth: 'Ethereum',
  bsc: 'BSC',
  arbitrum: 'Arbitrum',
  base: 'Base',
  solana: 'Solana',
  avax: 'Avalanche',
  avalanche: 'Avalanche',
  polygon: 'Polygon',
  optimism: 'Optimism',
  sui: 'Sui',
  aptos: 'Aptos',
};

type DexSearchPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { symbol?: string };
  quoteToken?: { symbol?: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
};

function normalizeBaseSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(SYMBOL_SUFFIX_RE, '');
}

function toPair(raw: DexSearchPair): DexOverviewPair | null {
  if (!raw.chainId || !raw.dexId || !raw.pairAddress) return null;
  const baseSymbol = raw.baseToken?.symbol?.toUpperCase();
  const quoteSymbol = raw.quoteToken?.symbol?.toUpperCase();
  if (!baseSymbol || !quoteSymbol) return null;
  const buys = raw.txns?.h24?.buys ?? 0;
  const sells = raw.txns?.h24?.sells ?? 0;
  return {
    chainId: raw.chainId,
    dexId: raw.dexId,
    pairAddress: raw.pairAddress,
    label: `${baseSymbol}/${quoteSymbol}`,
    baseSymbol,
    quoteSymbol,
    priceUsd: raw.priceUsd != null ? Number(raw.priceUsd) : null,
    priceChange24hPct: raw.priceChange?.h24 ?? null,
    liquidityUsd: raw.liquidity?.usd ?? null,
    volume24hUsd: raw.volume?.h24 ?? null,
    txns24h: buys + sells,
    url: raw.url ?? null,
  };
}

function aggregatePairs(
  symbol: string,
  proxySymbol: string,
  pairs: DexOverviewPair[],
  totalDefiTvl: { tvl: number; change24h: number } | null,
  chainTvls: Array<{ chain: string; tvl: number; change1d: number }>,
): DexOverviewPayload {
  const liquidityUsd = pairs.reduce((sum, pair) => sum + (pair.liquidityUsd ?? 0), 0);
  const volume24hUsd = pairs.reduce((sum, pair) => sum + (pair.volume24hUsd ?? 0), 0);
  const txns24h = pairs.reduce((sum, pair) => sum + (pair.txns24h ?? 0), 0);
  const byDex = new Map<string, number>();
  for (const pair of pairs) {
    byDex.set(pair.dexId, (byDex.get(pair.dexId) ?? 0) + (pair.volume24hUsd ?? 0));
  }
  const topDexVolume = [...byDex.values()].sort((a, b) => b - a)[0] ?? 0;
  const byChain = new Map<string, { liquidityUsd: number; volume24hUsd: number; txns24h: number }>();
  for (const pair of pairs) {
    const current = byChain.get(pair.chainId) ?? { liquidityUsd: 0, volume24hUsd: 0, txns24h: 0 };
    current.liquidityUsd += pair.liquidityUsd ?? 0;
    current.volume24hUsd += pair.volume24hUsd ?? 0;
    current.txns24h += pair.txns24h ?? 0;
    byChain.set(pair.chainId, current);
  }
  const chainTvlMap = new Map(
    chainTvls.map((row) => [row.chain.toLowerCase(), { tvl: row.tvl, change1d: row.change1d }]),
  );
  const chainBreakdown = [...byChain.entries()]
    .map(([chainId, row]) => {
      const chainLabel = CHAIN_LABELS[chainId] ?? chainId;
      const llama = chainTvlMap.get(chainLabel.toLowerCase()) ?? null;
      return {
        chainId,
        chainLabel,
        liquidityUsd: row.liquidityUsd || null,
        volume24hUsd: row.volume24hUsd || null,
        txns24h: row.txns24h || null,
        liquiditySharePct: liquidityUsd > 0 ? (row.liquidityUsd / liquidityUsd) * 100 : null,
        volumeSharePct: volume24hUsd > 0 ? (row.volume24hUsd / volume24hUsd) * 100 : null,
        chainTvlUsd: llama?.tvl ?? null,
        chainTvlChange1dPct: llama?.change1d ?? null,
      };
    })
    .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
    .slice(0, 4);
  const volumeLiquidityRatio = liquidityUsd > 0 ? volume24hUsd / liquidityUsd : null;
  const avgTradeSizeUsd = txns24h > 0 ? volume24hUsd / txns24h : null;

  return {
    symbol,
    query: proxySymbol,
    proxySymbol,
    at: Date.now(),
    pairCount: pairs.length,
    liquidityUsd: liquidityUsd || null,
    volume24hUsd: volume24hUsd || null,
    txns24h: txns24h || null,
    volumeLiquidityRatio,
    avgTradeSizeUsd,
    topDexSharePct: volume24hUsd > 0 ? (topDexVolume / volume24hUsd) * 100 : null,
    totalDefiTvlUsd: totalDefiTvl?.tvl ?? null,
    totalDefiTvlChange24hPct: totalDefiTvl?.change24h ?? null,
    chainBreakdown,
    topPairs: pairs.slice(0, 8),
    coverage: {
      mode: proxySymbol === symbol ? 'exact' : 'proxy',
      note:
        proxySymbol === symbol
          ? 'exact base symbol matches aggregated from DexScreener'
          : `${symbol} is proxied to ${proxySymbol} for wrapped-asset DEX liquidity coverage`,
    },
  };
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const inputSymbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
    const symbol = normalizeBaseSymbol(inputSymbol);
    if (!symbol) {
      return json({ error: 'invalid symbol' }, { status: 400 });
    }

    const proxySymbol = SYMBOL_PROXY_MAP[symbol] ?? symbol;
    const [raw, totalDefiTvl, chainTvls] = await Promise.all([
      searchDexPairs(proxySymbol) as Promise<{ pairs?: DexSearchPair[] } | null>,
      fetchTotalTvl(),
      fetchChainTvls(),
    ]);
    const parsed = (raw?.pairs ?? [])
      .map((pair) => toPair(pair))
      .filter((pair): pair is DexOverviewPair => Boolean(pair))
      .filter((pair) => pair.baseSymbol === proxySymbol || pair.quoteSymbol === proxySymbol)
      .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));

    if (!parsed.length) {
      return json({ error: 'no_dex_pairs_found' }, { status: 404 });
    }

    return json(aggregatePairs(symbol, proxySymbol, parsed, totalDefiTvl, chainTvls), {
      headers: {
        'cache-control': 'public, max-age=60',
      },
    });
  } catch (error) {
    console.error('[market/dex/overview/get] unexpected error:', error);
    return json({ error: 'Failed to load dex overview' }, { status: 500 });
  }
};
