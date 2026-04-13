// ═══════════════════════════════════════════════════════════════
// GeckoTerminal DEX Whale Tracker (server-side)
// ═══════════════════════════════════════════════════════════════
// CoinGecko 고래 추적 가이드 기반 구현
// GeckoTerminal 무료 API → DEX 대규모 거래 추적 → CQWhaleData 매핑
// API 키 불필요 — 무료 엔드포인트

import { getCached, setCache } from './providers/cache';
import type { CQWhaleData } from './cryptoquant';

const GT_BASE = 'https://api.geckoterminal.com/api/v2';
const CACHE_TTL = 300_000; // 5분 (rate limit ~30 req/min 대비 넉넉)
const WHALE_THRESHOLD_USD = 50_000; // $50K 이상 = 고래 거래
const FETCH_TIMEOUT_MS = 8_000;

// ── 모니터링 풀 설정 ─────────────────────────────────────────
// 각 토큰별 최고 유동성 Uniswap V3 풀 (Ethereum mainnet)

interface PoolConfig {
  network: string;
  address: string;
  label: string;
}

const WHALE_POOLS: Record<string, PoolConfig[]> = {
  btc: [
    {
      network: 'eth',
      address: '0x99ac8ca7087fa4a2a1fb6357269965a2014abc35',
      label: 'WBTC/USDC UniV3 0.3%',
    },
  ],
  eth: [
    {
      network: 'eth',
      address: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
      label: 'WETH/USDC UniV3 0.05%',
    },
  ],
};

// ── GeckoTerminal Response Types ─────────────────────────────

interface GTTradeAttributes {
  block_number: number;
  block_timestamp: string;
  tx_hash: string;
  tx_from_address: string;
  from_token_amount: string;
  to_token_amount: string;
  price_from_in_currency_token: string;
  price_to_in_currency_token: string;
  price_from_in_usd: string;
  price_to_in_usd: string;
  volume_in_usd: string;
  kind: 'buy' | 'sell';
}

interface GTTradesResponse {
  data: Array<{
    id: string;
    type: 'trade';
    attributes: GTTradeAttributes;
  }>;
}

// ── Generic Fetcher ──────────────────────────────────────────

async function gtFetch<T>(path: string): Promise<T | null> {
  const cacheKey = `geckowhale:${path}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${GT_BASE}${path}`, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[GeckoWhale] ${path}: ${res.status} ${res.statusText}`);
      return null;
    }

    const json = await res.json();
    setCache(cacheKey, json as T, CACHE_TTL);
    return json as T;
  } catch (err) {
    console.error('[GeckoWhale] fetch error:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Pool Trades Fetcher ──────────────────────────────────────

async function fetchPoolTrades(network: string, poolAddress: string): Promise<GTTradesResponse | null> {
  // GeckoTerminal returns up to 300 recent trades per call
  return gtFetch<GTTradesResponse>(
    `/networks/${network}/pools/${poolAddress}/trades`
  );
}

// ── Whale Analysis ───────────────────────────────────────────

interface WhaleAnalysis {
  whaleCount: number;
  whaleBuyVolumeUsd: number;
  whaleSellVolumeUsd: number;
  totalVolumeUsd: number;
}

function analyzeWhaleTrades(trades: GTTradesResponse['data']): WhaleAnalysis {
  let whaleCount = 0;
  let whaleBuyVolumeUsd = 0;
  let whaleSellVolumeUsd = 0;
  let totalVolumeUsd = 0;

  for (const trade of trades) {
    const attrs = trade.attributes;
    const volumeUsd = Number(attrs.volume_in_usd);

    if (!Number.isFinite(volumeUsd) || volumeUsd <= 0) continue;

    totalVolumeUsd += volumeUsd;

    // 고래 판별: $50K 이상
    if (volumeUsd >= WHALE_THRESHOLD_USD) {
      whaleCount++;
      if (attrs.kind === 'buy') {
        whaleBuyVolumeUsd += volumeUsd;
      } else {
        whaleSellVolumeUsd += volumeUsd;
      }
    }
  }

  return { whaleCount, whaleBuyVolumeUsd, whaleSellVolumeUsd, totalVolumeUsd };
}

// ── Public API ───────────────────────────────────────────────

/**
 * Fetch whale activity from GeckoTerminal DEX trades.
 * Monitors high-liquidity Uniswap V3 pools for large transactions.
 * Returns CQWhaleData-compatible object.
 *
 * @param token - 'btc' or 'eth'
 * @returns CQWhaleData or null if no data available
 */
export async function fetchGeckoWhaleData(token: 'btc' | 'eth'): Promise<CQWhaleData | null> {
  // Top-level cache check
  const cacheKey = `geckowhale:agg:${token}`;
  const cached = getCached<CQWhaleData>(cacheKey);
  if (cached) return cached;

  const pools = WHALE_POOLS[token];
  if (!pools || pools.length === 0) return null;

  // Fetch trades from all pools in parallel
  const poolResults = await Promise.allSettled(
    pools.map((p) => fetchPoolTrades(p.network, p.address))
  );

  // Aggregate whale stats across all pools
  let totalWhaleCount = 0;
  let totalWhaleBuyUsd = 0;
  let totalWhaleSellUsd = 0;
  let totalVolumeUsd = 0;
  let hasAnyData = false;

  for (const result of poolResults) {
    if (result.status !== 'fulfilled' || !result.value?.data) continue;

    hasAnyData = true;
    const analysis = analyzeWhaleTrades(result.value.data);
    totalWhaleCount += analysis.whaleCount;
    totalWhaleBuyUsd += analysis.whaleBuyVolumeUsd;
    totalWhaleSellUsd += analysis.whaleSellVolumeUsd;
    totalVolumeUsd += analysis.totalVolumeUsd;
  }

  if (!hasAnyData) return null;

  // Map to CQWhaleData interface
  // whaleNetflow: sell - buy (양수 = 매도 압력 = bearish, CryptoQuant 부호 규칙 동일)
  const whaleNetflow = totalWhaleSellUsd - totalWhaleBuyUsd;

  // exchangeWhaleRatio: 고래 거래량 비율 (0-1)
  const whaleVolume = totalWhaleBuyUsd + totalWhaleSellUsd;
  const exchangeWhaleRatio = totalVolumeUsd > 0
    ? Math.round((whaleVolume / totalVolumeUsd) * 10000) / 10000
    : 0;

  const whaleData: CQWhaleData = {
    whaleCount: totalWhaleCount,
    whaleNetflow: Math.round(whaleNetflow),
    exchangeWhaleRatio,
  };

  setCache(cacheKey, whaleData, CACHE_TTL);
  return whaleData;
}
