// ═══════════════════════════════════════════════════════════════
// Stockclaw — Dune Analytics API Client (server-side) (B-05)
// ═══════════════════════════════════════════════════════════════
// Pre-built queries for on-chain metrics

import { env } from '$env/dynamic/private';
import { getCached, setCache } from './providers/cache';

const BASE = 'https://api.dune.com/api/v1';
const CACHE_TTL = 7_200_000; // 2hr (Dune queries are expensive & pre-computed)

function apiKey(): string {
  return env.DUNE_API_KEY ?? '';
}

interface DuneQueryResult {
  execution_id: string;
  state: string;
  result?: {
    rows: Record<string, unknown>[];
    metadata: {
      column_names: string[];
      result_set_bytes: number;
      total_row_count: number;
    };
  };
}

async function duneFetch<T>(path: string): Promise<T | null> {
  const key = apiKey();
  if (!key) return null;

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'X-Dune-API-Key': key },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`[Dune] ${res.status} ${res.statusText}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error('[Dune]', err);
    return null;
  }
}

// Execute a saved query and return results
// Accepts optional AbortSignal to cancel the polling loop early
// (e.g., when the HTTP request that triggered this is disconnected)
export async function executeQuery(
  queryId: number,
  params?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<DuneQueryResult | null> {
  const cacheKey = `dune:query:${queryId}:${JSON.stringify(params ?? {})}`;
  const cached = getCached<DuneQueryResult>(cacheKey);
  if (cached) return cached;

  const key = apiKey();
  if (!key) return null;

  try {
    const execResponse = await fetch(`${BASE}/query/${queryId}/execute`, {
      method: 'POST',
      headers: {
        'X-Dune-API-Key': key,
        'Content-Type': 'application/json',
      },
      body: params ? JSON.stringify({ query_parameters: params }) : '{}',
      signal: signal ?? AbortSignal.timeout(10000),
    });
    if (!execResponse.ok) return null;
    const exec = (await execResponse.json()) as { execution_id: string };

    // Poll for results (max 30s, abortable)
    const maxWait = 30_000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      // Check abort before each poll iteration
      if (signal?.aborted) return null;

      const statusRes = await duneFetch<DuneQueryResult>(
        `/execution/${exec.execution_id}/results`,
      );
      if (statusRes?.state === 'QUERY_STATE_COMPLETED' && statusRes.result) {
        setCache(cacheKey, statusRes, CACHE_TTL);
        return statusRes;
      }
      if (statusRes?.state === 'QUERY_STATE_FAILED') return null;

      // Abortable sleep: resolve on timeout OR abort
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2000);
        signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
    return null;
  } catch (err) {
    // Don't log abort errors — they're intentional
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    console.error('[Dune] execute error:', err);
    return null;
  }
}

// Get latest results of a query (no re-execution)
export async function getLatestResults(queryId: number): Promise<DuneQueryResult | null> {
  const cacheKey = `dune:latest:${queryId}`;
  const cached = getCached<DuneQueryResult>(cacheKey);
  if (cached) return cached;

  const result = await duneFetch<DuneQueryResult>(`/query/${queryId}/results`);
  if (result?.result) {
    setCache(cacheKey, result, CACHE_TTL);
  }
  return result;
}

// ── Pre-defined Query IDs for common on-chain metrics ────────
// These are popular community queries on Dune
export const QUERIES = {
  BTC_EXCHANGE_BALANCE: 2140357, // BTC held on exchanges
  ETH_EXCHANGE_BALANCE: 2140358, // ETH held on exchanges
  STABLECOIN_SUPPLY: 3268408, // Total stablecoin supply breakdown
  DEX_VOLUME_24H: 1847009, // 24h DEX volume
  ETH_ACTIVE_ADDRESSES: 2478396, // Daily active addresses
  WHALE_TRANSACTIONS: 3013654, // Large transactions (>$100k)
} as const;

// Convenience: fetch exchange balance for a token
export async function fetchExchangeBalance(token: 'BTC' | 'ETH'): Promise<number | null> {
  const queryId =
    token === 'BTC' ? QUERIES.BTC_EXCHANGE_BALANCE : QUERIES.ETH_EXCHANGE_BALANCE;
  const result = await getLatestResults(queryId);
  if (!result?.result?.rows?.[0]) return null;
  const row = result.result.rows[0];
  return typeof row.balance === 'number' ? row.balance : (Number(row.balance) || null);
}

// Convenience: fetch whale transaction count
export async function fetchWhaleActivity(): Promise<number | null> {
  const result = await getLatestResults(QUERIES.WHALE_TRANSACTIONS);
  if (!result?.result?.rows?.[0]) return null;
  const row = result.result.rows[0];
  return typeof row.tx_count === 'number' ? row.tx_count : (Number(row.tx_count) || null);
}

// Convenience: fetch daily active addresses
export async function fetchActiveAddresses(): Promise<number | null> {
  const result = await getLatestResults(QUERIES.ETH_ACTIVE_ADDRESSES);
  if (!result?.result?.rows?.[0]) return null;
  const row = result.result.rows[0];
  return typeof row.active_addresses === 'number'
    ? row.active_addresses
    : (Number(row.active_addresses) || null);
}
