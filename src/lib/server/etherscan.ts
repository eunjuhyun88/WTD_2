// ═══════════════════════════════════════════════════════════════
// Stockclaw — Etherscan API Client (server-side) (B-05)
// ═══════════════════════════════════════════════════════════════
// On-chain data: ETH supply, gas, token transfers, contract interactions

import { env } from '$env/dynamic/private';
import { getCached, setCache } from './providers/cache';

const BASE = 'https://api.etherscan.io/api';
const CACHE_TTL = 120_000; // 2 min

function apiKey(): string {
  return env.ETHERSCAN_API_KEY ?? '';
}

async function etherscanFetch<T>(
  module: string,
  action: string,
  params: Record<string, string> = {},
): Promise<T | null> {
  const key = apiKey();
  if (!key) return null;

  const cacheKey = `etherscan:${module}:${action}:${JSON.stringify(params)}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  const qs = new URLSearchParams({ module, action, apikey: key, ...params });
  try {
    const res = await fetch(`${BASE}?${qs}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== '1' && json.message !== 'OK') return null;
    setCache(cacheKey, json.result as T, CACHE_TTL);
    return json.result as T;
  } catch (err) {
    console.error('[Etherscan]', err);
    return null;
  }
}

// ─── Types ────────────────────────────────────────────────────

export interface EthGasOracle {
  SafeGasPrice: string;
  ProposeGasPrice: string;
  FastGasPrice: string;
  suggestBaseFee: string;
}

// ─── Public API ───────────────────────────────────────────────

export async function fetchGasOracle(): Promise<EthGasOracle | null> {
  return etherscanFetch<EthGasOracle>('gastracker', 'gasoracle');
}

export async function fetchEthSupply(): Promise<number | null> {
  const result = await etherscanFetch<string>('stats', 'ethsupply');
  return result ? Number(result) / 1e18 : null;
}

export async function fetchEthPrice(): Promise<{ ethbtc: number; ethusd: number } | null> {
  const result = await etherscanFetch<{ ethbtc: string; ethusd: string }>('stats', 'ethprice');
  if (!result) return null;
  return { ethbtc: Number(result.ethbtc), ethusd: Number(result.ethusd) };
}

export async function fetchTokenBalance(
  contractAddress: string,
  address: string,
): Promise<string | null> {
  return etherscanFetch<string>('account', 'tokenbalance', {
    contractaddress: contractAddress,
    address,
    tag: 'latest',
  });
}

export async function fetchNormalTxList(
  address: string,
  startblock = '0',
  endblock = '99999999',
  sort = 'desc',
): Promise<Array<Record<string, string>> | null> {
  return etherscanFetch<Array<Record<string, string>>>('account', 'txlist', {
    address,
    startblock,
    endblock,
    page: '1',
    offset: '50',
    sort,
  });
}

// ─── Exchange netflow estimation via top exchange addresses ───

const EXCHANGE_ADDRESSES = [
  '0x28C6c06298d514Db089934071355E5743bf21d60', // Binance 14
  '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549', // Binance 36
  '0xDFd5293D8e347dFe59E90eFd55b2956a1343963d', // Binance 16
];

export async function estimateExchangeNetflow(): Promise<number | null> {
  try {
    const balances = await Promise.all(
      EXCHANGE_ADDRESSES.map((addr) =>
        etherscanFetch<string>('account', 'balance', { address: addr, tag: 'latest' }),
      ),
    );
    const total = balances.reduce((sum, b) => sum + (b ? Number(b) / 1e18 : 0), 0);
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}
