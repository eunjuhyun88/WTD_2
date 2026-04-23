import { env } from '$env/dynamic/private';
import { getCached, setCache } from './providers/cache';

const BASE_URL = 'https://api.etherscan.io/v2/api';
const CACHE_TTL = 120_000;
const PLACEHOLDER_HINTS = ['your_', 'your-', 'placeholder', 'changeme', 'example', 'dummy', '<'];

interface EtherscanEnvelope<T> {
  status?: string;
  message?: string;
  result?: T;
}

export interface EtherscanRequestOptions {
  chainId?: string;
}

export interface EthGasOracle {
  SafeGasPrice: string;
  ProposeGasPrice: string;
  FastGasPrice: string;
  suggestBaseFee: string;
}

export interface EtherscanNormalTx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  transactionIndex: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  isError: string;
  txreceipt_status?: string;
  input: string;
  contractAddress?: string;
  cumulativeGasUsed?: string;
  gasUsed?: string;
  confirmations?: string;
  methodId?: string;
  functionName?: string;
}

export interface EtherscanTokenTx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  from: string;
  contractAddress: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  transactionIndex?: string;
  gas?: string;
  gasPrice?: string;
  gasUsed?: string;
  cumulativeGasUsed?: string;
  input?: string;
  confirmations?: string;
  methodId?: string;
  functionName?: string;
}

export interface EtherscanAddressTokenBalance {
  TokenAddress: string;
  TokenName: string;
  TokenSymbol: string;
  TokenQuantity: string;
  TokenDivisor: string;
  TokenPriceUSD: string;
}

export interface EtherscanAddressTag {
  address: string;
  nametag?: string;
  internal_nametag?: string;
  url?: string;
  labels?: string[];
  labels_slug?: string[];
  reputation?: number | string;
  lastupdatedtimestamp?: number | string;
}

export interface EtherscanTokenInfo {
  contractAddress: string;
  tokenName?: string;
  symbol?: string;
  divisor?: string;
  tokenType?: string;
  totalSupply?: string;
  blueCheckmark?: string | boolean;
  description?: string;
  website?: string;
  tokenPriceUSD?: string;
  image?: string;
}

export interface EtherscanTokenHolder {
  TokenHolderAddress: string;
  TokenHolderQuantity: string;
  TokenHolderAddressType?: string;
}

function apiKey(): string {
  return env.ETHERSCAN_API_KEY ?? '';
}

function isUsableApiKey(value: string, minLength = 20): boolean {
  const trimmed = value.trim();
  if (trimmed.length < minLength) return false;
  const lower = trimmed.toLowerCase();
  return !PLACEHOLDER_HINTS.some((hint) => lower.includes(hint));
}

function normalizeChainId(chainId?: string): string {
  const trimmed = chainId?.trim();
  return trimmed && /^\d+$/.test(trimmed) ? trimmed : '1';
}

export function hasEtherscanApiKey(): boolean {
  return isUsableApiKey(apiKey());
}

async function etherscanFetch<T>(
  module: string,
  action: string,
  params: Record<string, string> = {},
  options: EtherscanRequestOptions = {},
): Promise<T | null> {
  const key = apiKey();
  if (!isUsableApiKey(key)) return null;

  const chainId = normalizeChainId(options.chainId);
  const cacheKey = `etherscan:v2:${chainId}:${module}:${action}:${JSON.stringify(params)}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  const qs = new URLSearchParams({
    chainid: chainId,
    module,
    action,
    apikey: key,
    ...params,
  });

  try {
    const res = await fetch(`${BASE_URL}?${qs}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.error(`[Etherscan] ${module}/${action}: ${res.status} ${res.statusText}`);
      return null;
    }

    const json = (await res.json()) as EtherscanEnvelope<T>;
    const result = json.result;

    if (json.status === '1' || json.message === 'OK' || json.message === 'Ok') {
      if (result == null) return null;
      setCache(cacheKey, result, CACHE_TTL);
      return result;
    }

    if (Array.isArray(result)) {
      setCache(cacheKey, result as T, CACHE_TTL);
      return result as T;
    }

    return null;
  } catch (err) {
    console.error('[Etherscan]', err);
    return null;
  }
}

export async function fetchGasOracle(options: EtherscanRequestOptions = {}): Promise<EthGasOracle | null> {
  return etherscanFetch<EthGasOracle>('gastracker', 'gasoracle', {}, options);
}

export async function fetchEthSupply(options: EtherscanRequestOptions = {}): Promise<number | null> {
  const result = await etherscanFetch<string>('stats', 'ethsupply', {}, options);
  return result ? Number(result) / 1e18 : null;
}

export async function fetchEthPrice(options: EtherscanRequestOptions = {}): Promise<{ ethbtc: number; ethusd: number } | null> {
  const result = await etherscanFetch<{ ethbtc: string; ethusd: string }>('stats', 'ethprice', {}, options);
  if (!result) return null;
  return { ethbtc: Number(result.ethbtc), ethusd: Number(result.ethusd) };
}

export async function fetchNativeBalance(
  address: string,
  options: EtherscanRequestOptions = {},
): Promise<string | null> {
  return etherscanFetch<string>('account', 'balance', { address, tag: 'latest' }, options);
}

export async function fetchTokenBalance(
  contractAddress: string,
  address: string,
  options: EtherscanRequestOptions = {},
): Promise<string | null> {
  return etherscanFetch<string>('account', 'tokenbalance', {
    contractaddress: contractAddress,
    address,
    tag: 'latest',
  }, options);
}

export async function fetchNormalTxList(
  address: string,
  startblock = '0',
  endblock = '99999999',
  sort = 'desc',
  options: EtherscanRequestOptions = {},
): Promise<EtherscanNormalTx[] | null> {
  return etherscanFetch<EtherscanNormalTx[]>('account', 'txlist', {
    address,
    startblock,
    endblock,
    page: '1',
    offset: '50',
    sort,
  }, options);
}

export async function fetchTokenTxList(
  address: string,
  startblock = '0',
  endblock = '99999999',
  sort = 'desc',
  options: EtherscanRequestOptions & { contractAddress?: string } = {},
): Promise<EtherscanTokenTx[] | null> {
  const params: Record<string, string> = {
    address,
    startblock,
    endblock,
    page: '1',
    offset: '80',
    sort,
  };
  if (options.contractAddress) {
    params.contractaddress = options.contractAddress;
  }
  return etherscanFetch<EtherscanTokenTx[]>('account', 'tokentx', params, options);
}

export async function fetchAddressTokenBalance(
  address: string,
  page = '1',
  offset = '20',
  options: EtherscanRequestOptions = {},
): Promise<EtherscanAddressTokenBalance[] | null> {
  return etherscanFetch<EtherscanAddressTokenBalance[]>('account', 'addresstokenbalance', {
    address,
    page,
    offset,
  }, options);
}

export async function fetchAddressTag(
  address: string,
  options: EtherscanRequestOptions = {},
): Promise<EtherscanAddressTag[] | null> {
  return etherscanFetch<EtherscanAddressTag[]>('nametag', 'getaddresstag', { address }, options);
}

export async function fetchTokenInfo(
  contractAddress: string,
  options: EtherscanRequestOptions = {},
): Promise<EtherscanTokenInfo[] | null> {
  return etherscanFetch<EtherscanTokenInfo[]>('token', 'tokeninfo', { contractaddress: contractAddress }, options);
}

export async function fetchTokenHolderCount(
  contractAddress: string,
  options: EtherscanRequestOptions = {},
): Promise<number | null> {
  const result = await etherscanFetch<string>('token', 'tokenholdercount', { contractaddress: contractAddress }, options);
  return result == null ? null : Number(result);
}

export async function fetchTopTokenHolders(
  contractAddress: string,
  offset = '20',
  options: EtherscanRequestOptions = {},
): Promise<EtherscanTokenHolder[] | null> {
  return etherscanFetch<EtherscanTokenHolder[]>('token', 'topholders', {
    contractaddress: contractAddress,
    offset,
  }, options);
}

export async function fetchTokenSupply(
  contractAddress: string,
  options: EtherscanRequestOptions = {},
): Promise<string | null> {
  return etherscanFetch<string>('stats', 'tokensupply', { contractaddress: contractAddress }, options);
}

const EXCHANGE_ADDRESSES = [
  '0x28C6c06298d514Db089934071355E5743bf21d60',
  '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549',
  '0xDFd5293D8e347dFe59E90eFd55b2956a1343963d',
];

export async function estimateExchangeNetflow(options: EtherscanRequestOptions = {}): Promise<number | null> {
  try {
    const balances = await Promise.all(
      EXCHANGE_ADDRESSES.map((addr) => fetchNativeBalance(addr, options)),
    );
    const total = balances.reduce((sum, balance) => sum + (balance ? Number(balance) / 1e18 : 0), 0);
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}
