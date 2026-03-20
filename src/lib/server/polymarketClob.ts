// ═══════════════════════════════════════════════════════════════
// Stockclaw — Polymarket CLOB API Client (server-side)
// ═══════════════════════════════════════════════════════════════
// Handles all communication with Polymarket's CLOB + Gamma APIs.
// Architecture: Frontend → Our API → This module → Polymarket
//
// Auth flow:
//   1. User wallet signs ClobAuthDomain EIP-712 message (browser)
//   2. We derive L2 API credentials via /auth/derive-api-key
//   3. Subsequent requests use L2 HMAC-SHA256 auth
//   4. Orders are separately EIP-712 signed by user's wallet
//
// References:
//   - CTF Exchange: https://polygonscan.com/address/0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E
//   - Order struct: https://github.com/Polymarket/ctf-exchange/blob/main/src/exchange/libraries/OrderStructs.sol

import { getCached, setCache } from './providers/cache';
import { createHmac, randomBytes } from 'node:crypto';

// ── Constants ────────────────────────────────────────────────

const CLOB_API = 'https://clob.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

/** Polymarket CTF Exchange on Polygon */
export const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
/** Neg Risk CTF Exchange (multi-outcome markets) */
export const NEG_RISK_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
/** USDC.e on Polygon */
export const USDC_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
/** Conditional Tokens Framework */
export const CONDITIONAL_TOKENS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
/** Polygon chain ID */
export const POLYGON_CHAIN_ID = 137;

/** Default fee rate: 2% taker fee */
const DEFAULT_FEE_RATE_BPS = 200;
/** Order expiration: 5 minutes */
const ORDER_EXPIRY_SECS = 300;

// ── Types ────────────────────────────────────────────────────

export interface MarketDetails {
  conditionId: string;
  questionId: string;
  question: string;
  slug: string;
  tokens: Array<{
    token_id: string;
    outcome: string; // "Yes" | "No"
    price: number;
  }>;
  active: boolean;
  closed: boolean;
  endDate: string;
  volume: number;
  liquidity: number;
  negRisk: boolean; // true = uses NegRisk exchange
}

export interface OrderbookData {
  market: string;
  asset_id: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  bestBid: number;
  bestAsk: number;
  midPrice: number;
}

export interface ClobOrder {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: number;          // 0 = BUY, 1 = SELL
  signatureType: number; // 0 = EOA
}

export interface EIP712TypedData {
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  message: Record<string, unknown>;
}

export interface L2Credentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export interface OrderSubmitResult {
  success: boolean;
  orderID?: string;
  error?: string;
}

export interface OrderStatus {
  id: string;
  status: 'live' | 'matched' | 'delayed' | 'cancelled';
  associate_trades?: Array<{
    id: string;
    price: string;
    size: string;
    side: string;
    matchTime: string;
  }>;
  price: string;
  size_matched: string;
  original_size: string;
}

// ── Helpers ──────────────────────────────────────────────────

async function clobFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
  try {
    const res = await fetch(`${CLOB_API}${path}`, {
      ...options,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Stockclaw/1.0',
        ...options.headers,
      },
      signal: options.signal ?? AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[PolymarketCLOB] ${res.status} ${res.statusText} on ${path}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    console.error('[PolymarketCLOB]', err);
    return null;
  }
}

async function gammaFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
  try {
    const res = await fetch(`${GAMMA_API}${path}`, {
      ...options,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Stockclaw/1.0',
        ...options.headers,
      },
      signal: options.signal ?? AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    console.error('[PolymarketGamma]', err);
    return null;
  }
}

// ── Market Data (no auth needed) ─────────────────────────────

/**
 * Fetch market details including token IDs from Gamma API.
 * Cached for 2 minutes.
 */
export async function getMarketDetails(conditionId: string): Promise<MarketDetails | null> {
  const cacheKey = `poly:market:${conditionId}`;
  const cached = getCached<MarketDetails>(cacheKey);
  if (cached) return cached;

  // Gamma API returns array of markets matching the condition
  const markets = await gammaFetch<any[]>(`/markets?condition_id=${conditionId}&active=true`);
  if (!markets || markets.length === 0) {
    // Try by slug
    const bySlug = await gammaFetch<any[]>(`/markets?slug=${conditionId}&active=true`);
    if (!bySlug || bySlug.length === 0) return null;
    return parseMarketResponse(bySlug[0], cacheKey);
  }
  return parseMarketResponse(markets[0], cacheKey);
}

/**
 * Fetch market by Polymarket question ID or slug.
 */
export async function getMarketBySlug(slug: string): Promise<MarketDetails | null> {
  const cacheKey = `poly:slug:${slug}`;
  const cached = getCached<MarketDetails>(cacheKey);
  if (cached) return cached;

  const markets = await gammaFetch<any[]>(`/markets?slug=${slug}&active=true`);
  if (!markets || markets.length === 0) return null;
  return parseMarketResponse(markets[0], cacheKey);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMarketResponse(raw: any, cacheKey: string): MarketDetails | null {
  if (!raw) return null;
  try {
    const tokens: MarketDetails['tokens'] = [];
    if (raw.tokens && Array.isArray(raw.tokens)) {
      for (const t of raw.tokens) {
        tokens.push({
          token_id: t.token_id,
          outcome: t.outcome ?? 'Unknown',
          price: typeof t.price === 'number' ? t.price : parseFloat(t.price) || 0,
        });
      }
    }

    const details: MarketDetails = {
      conditionId: raw.condition_id ?? raw.conditionId ?? '',
      questionId: raw.question_id ?? '',
      question: raw.question ?? '',
      slug: raw.slug ?? '',
      tokens,
      active: raw.active ?? false,
      closed: raw.closed ?? false,
      endDate: raw.end_date_iso ?? raw.endDate ?? '',
      volume: typeof raw.volume === 'number' ? raw.volume : parseFloat(raw.volume) || 0,
      liquidity: typeof raw.liquidity === 'number' ? raw.liquidity : parseFloat(raw.liquidity) || 0,
      negRisk: raw.neg_risk ?? false,
    };

    setCache(cacheKey, details, 120_000); // 2min
    return details;
  } catch {
    return null;
  }
}

/**
 * Fetch orderbook for a token. Cached for 30 seconds.
 */
export async function getOrderbook(tokenId: string): Promise<OrderbookData | null> {
  const cacheKey = `poly:ob:${tokenId}`;
  const cached = getCached<OrderbookData>(cacheKey);
  if (cached) return cached;

  const raw = await clobFetch<any>(`/book?token_id=${tokenId}`);
  if (!raw) return null;

  const bids: OrderbookData['bids'] = (raw.bids ?? []).map((b: any) => ({
    price: String(b.price),
    size: String(b.size),
  }));
  const asks: OrderbookData['asks'] = (raw.asks ?? []).map((a: any) => ({
    price: String(a.price),
    size: String(a.size),
  }));

  const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0;
  const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : 0;
  const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;

  const data: OrderbookData = { market: raw.market ?? '', asset_id: tokenId, bids, asks, bestBid, bestAsk, midPrice };
  setCache(cacheKey, data, 30_000); // 30s
  return data;
}

/**
 * Get the current mid-market price for a token.
 */
export async function getTokenPrice(tokenId: string): Promise<number | null> {
  const ob = await getOrderbook(tokenId);
  if (!ob) return null;
  return ob.midPrice > 0 ? ob.midPrice : null;
}

// ── EIP-712 Typed Data Builders ──────────────────────────────

/**
 * Build EIP-712 typed data for ClobAuth (L1 authentication).
 * User signs this once to derive L2 API credentials.
 */
export function buildAuthTypedData(address: string, timestamp: number, nonce: number = 0): EIP712TypedData {
  return {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
      ],
      ClobAuth: [
        { name: 'address', type: 'address' },
        { name: 'timestamp', type: 'string' },
        { name: 'nonce', type: 'uint256' },
        { name: 'message', type: 'string' },
      ],
    },
    primaryType: 'ClobAuth',
    domain: {
      name: 'ClobAuthDomain',
      version: '1',
      chainId: POLYGON_CHAIN_ID,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    message: {
      address,
      timestamp: String(timestamp),
      nonce,
      message: 'This message attests that I control the given wallet',
    },
  };
}

/**
 * Build EIP-712 typed data for a Polymarket Order.
 * This is what the user's wallet signs to authorize a specific trade.
 *
 * @param params Order parameters
 * @param exchangeAddress CTF Exchange or NegRisk Exchange address
 */
export function buildOrderTypedData(params: {
  salt: string;
  maker: string;        // user's wallet address
  signer: string;       // same as maker for EOA
  taker: string;        // 0x0 for public order
  tokenId: string;
  makerAmount: string;  // in wei (6 decimals for USDC)
  takerAmount: string;  // conditional tokens amount
  expiration: string;
  nonce: string;
  feeRateBps: number;
  side: 'BUY' | 'SELL';
  negRisk?: boolean;
}): EIP712TypedData {
  const exchangeAddr = params.negRisk ? NEG_RISK_EXCHANGE : CTF_EXCHANGE;
  const sideNum = params.side === 'BUY' ? 0 : 1;

  return {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Order: [
        { name: 'salt', type: 'uint256' },
        { name: 'maker', type: 'address' },
        { name: 'signer', type: 'address' },
        { name: 'taker', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'makerAmount', type: 'uint256' },
        { name: 'takerAmount', type: 'uint256' },
        { name: 'expiration', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'feeRateBps', type: 'uint256' },
        { name: 'side', type: 'uint8' },
        { name: 'signatureType', type: 'uint8' },
      ],
    },
    primaryType: 'Order',
    domain: {
      name: 'CTFExchange',
      version: '1',
      chainId: POLYGON_CHAIN_ID,
      verifyingContract: exchangeAddr,
    },
    message: {
      salt: params.salt,
      maker: params.maker,
      signer: params.signer,
      taker: params.taker,
      tokenId: params.tokenId,
      makerAmount: params.makerAmount,
      takerAmount: params.takerAmount,
      expiration: params.expiration,
      nonce: params.nonce,
      feeRateBps: params.feeRateBps,
      side: sideNum,
      signatureType: 0, // EOA
    },
  };
}

// ── Order Parameter Helpers ──────────────────────────────────

/**
 * Generate a random salt for order uniqueness.
 */
export function generateSalt(): string {
  return BigInt('0x' + randomBytes(32).toString('hex')).toString();
}

/**
 * Generate nonce for order (0 = default, allows on-chain cancellation by incrementing).
 */
export function generateNonce(): string {
  return '0';
}

/**
 * Calculate order expiration timestamp.
 */
export function getExpiration(secs: number = ORDER_EXPIRY_SECS): string {
  return String(Math.floor(Date.now() / 1000) + secs);
}

/**
 * Calculate makerAmount and takerAmount from price and USDC amount.
 *
 * For BUY orders:
 *   - makerAmount = USDC amount (what you pay)
 *   - takerAmount = number of conditional tokens you receive = USDC / price
 *
 * For SELL orders:
 *   - makerAmount = number of conditional tokens you sell
 *   - takerAmount = USDC you receive = tokens * price
 *
 * Amounts are in their smallest unit (6 decimals for USDC, 6 for CT).
 */
export function calculateOrderAmounts(
  side: 'BUY' | 'SELL',
  price: number,
  amountUsdc: number,
): { makerAmount: string; takerAmount: string; size: number } {
  // USDC has 6 decimals
  const USDC_DECIMALS = 6;
  const CT_DECIMALS = 6;

  if (side === 'BUY') {
    // Pay USDC, receive conditional tokens
    const makerAmountRaw = amountUsdc; // USDC
    const size = amountUsdc / price;   // number of tokens
    const takerAmountRaw = size;       // conditional tokens

    return {
      makerAmount: toBigIntStr(makerAmountRaw, USDC_DECIMALS),
      takerAmount: toBigIntStr(takerAmountRaw, CT_DECIMALS),
      size,
    };
  } else {
    // Sell conditional tokens, receive USDC
    const size = amountUsdc / price;     // tokens to sell
    const makerAmountRaw = size;         // conditional tokens
    const takerAmountRaw = amountUsdc;   // USDC received

    return {
      makerAmount: toBigIntStr(makerAmountRaw, CT_DECIMALS),
      takerAmount: toBigIntStr(takerAmountRaw, USDC_DECIMALS),
      size,
    };
  }
}

function toBigIntStr(value: number, decimals: number): string {
  // Avoid floating point issues
  const factor = 10 ** decimals;
  return String(Math.round(value * factor));
}

// ── L2 Authentication ────────────────────────────────────────

/**
 * Derive L2 API credentials from L1 wallet signature.
 * Called once per user during Polymarket onboarding.
 */
export async function deriveApiCredentials(
  address: string,
  signature: string,
  timestamp: number,
  nonce: number = 0,
): Promise<L2Credentials | null> {
  const res = await clobFetch<any>('/auth/derive-api-key', {
    method: 'GET',
    headers: {
      'POLY_ADDRESS': address,
      'POLY_SIGNATURE': signature,
      'POLY_TIMESTAMP': String(timestamp),
      'POLY_NONCE': String(nonce),
    },
  });

  if (!res?.apiKey) return null;
  return {
    apiKey: res.apiKey,
    secret: res.secret,
    passphrase: res.passphrase,
  };
}

/**
 * Build L2 HMAC-SHA256 authentication headers.
 */
export function buildL2Headers(
  credentials: L2Credentials,
  method: string,
  path: string,
  body?: string,
): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const preSign = `${timestamp}${method.toUpperCase()}${path}${body ?? ''}`;
  const signature = createHmac('sha256', Buffer.from(credentials.secret, 'base64'))
    .update(preSign)
    .digest('base64');

  return {
    'POLY_ADDRESS': '', // filled by caller
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': timestamp,
    'POLY_NONCE': '0',
    'POLY_API_KEY': credentials.apiKey,
    'POLY_PASSPHRASE': credentials.passphrase,
  };
}

// ── Order Submission ─────────────────────────────────────────

/**
 * Submit a signed order to the Polymarket CLOB.
 *
 * @param order The order parameters
 * @param orderSignature EIP-712 signature from user's wallet
 * @param credentials L2 API credentials for HTTP auth
 * @param walletAddress User's wallet address
 */
export async function submitSignedOrder(
  order: ClobOrder,
  orderSignature: string,
  credentials: L2Credentials,
  walletAddress: string,
): Promise<OrderSubmitResult> {
  const path = '/order';
  const payload = {
    order: {
      ...order,
      signature: orderSignature,
    },
    orderType: 'GTC', // Good Till Cancel
  };

  const body = JSON.stringify(payload);
  const authHeaders = buildL2Headers(credentials, 'POST', path, body);
  authHeaders['POLY_ADDRESS'] = walletAddress;

  try {
    const res = await fetch(`${CLOB_API}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Stockclaw/1.0',
        ...authHeaders,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();

    if (!res.ok) {
      return { success: false, error: data?.error ?? `CLOB returned ${res.status}` };
    }

    return {
      success: true,
      orderID: data?.orderID ?? data?.order_id ?? data?.id,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get order status from CLOB.
 */
export async function getOrderStatus(
  orderId: string,
  credentials: L2Credentials,
  walletAddress: string,
): Promise<OrderStatus | null> {
  const path = `/order/${orderId}`;
  const authHeaders = buildL2Headers(credentials, 'GET', path);
  authHeaders['POLY_ADDRESS'] = walletAddress;

  return clobFetch<OrderStatus>(path, { headers: authHeaders });
}

/**
 * Cancel an order on the CLOB.
 */
export async function cancelOrder(
  orderId: string,
  credentials: L2Credentials,
  walletAddress: string,
): Promise<boolean> {
  const path = `/order/${orderId}`;
  const authHeaders = buildL2Headers(credentials, 'DELETE', path);
  authHeaders['POLY_ADDRESS'] = walletAddress;

  try {
    const res = await fetch(`${CLOB_API}${path}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Stockclaw/1.0',
        ...authHeaders,
      },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Convenience ──────────────────────────────────────────────

/**
 * Prepare all order parameters for a new bet.
 * Returns order params + EIP-712 typed data for wallet signing.
 */
export async function prepareOrder(params: {
  marketId: string;
  direction: 'YES' | 'NO';
  price: number;
  amountUsdc: number;
  walletAddress: string;
}): Promise<{
  order: ClobOrder;
  typedData: EIP712TypedData;
  size: number;
} | null> {
  // 1. Resolve market details to get token ID
  const market = await getMarketDetails(params.marketId);
  if (!market || !market.active || market.closed) return null;

  const targetOutcome = params.direction === 'YES' ? 'Yes' : 'No';
  const token = market.tokens.find(t => t.outcome === targetOutcome);
  if (!token) return null;

  // 2. Calculate amounts
  const { makerAmount, takerAmount, size } = calculateOrderAmounts('BUY', params.price, params.amountUsdc);

  // 3. Generate order params
  const salt = generateSalt();
  const nonce = generateNonce();
  const expiration = getExpiration();

  const order: ClobOrder = {
    salt,
    maker: params.walletAddress,
    signer: params.walletAddress,
    taker: '0x0000000000000000000000000000000000000000',
    tokenId: token.token_id,
    makerAmount,
    takerAmount,
    expiration,
    nonce,
    feeRateBps: String(DEFAULT_FEE_RATE_BPS),
    side: 0, // BUY
    signatureType: 0, // EOA
  };

  // 4. Build EIP-712 typed data
  const typedData = buildOrderTypedData({
    salt,
    maker: params.walletAddress,
    signer: params.walletAddress,
    taker: '0x0000000000000000000000000000000000000000',
    tokenId: token.token_id,
    makerAmount,
    takerAmount,
    expiration,
    nonce,
    feeRateBps: DEFAULT_FEE_RATE_BPS,
    side: 'BUY',
    negRisk: market.negRisk,
  });

  return { order, typedData, size };
}

/**
 * Prepare a SELL order to close an existing position.
 */
export async function prepareSellOrder(params: {
  tokenId: string;
  size: number;
  price: number;
  walletAddress: string;
  negRisk?: boolean;
}): Promise<{
  order: ClobOrder;
  typedData: EIP712TypedData;
  amountUsdc: number;
} | null> {
  const amountUsdc = params.size * params.price;
  const { makerAmount, takerAmount } = calculateOrderAmounts('SELL', params.price, amountUsdc);

  const salt = generateSalt();
  const nonce = generateNonce();
  const expiration = getExpiration();

  const order: ClobOrder = {
    salt,
    maker: params.walletAddress,
    signer: params.walletAddress,
    taker: '0x0000000000000000000000000000000000000000',
    tokenId: params.tokenId,
    makerAmount,
    takerAmount,
    expiration,
    nonce,
    feeRateBps: String(DEFAULT_FEE_RATE_BPS),
    side: 1, // SELL
    signatureType: 0, // EOA
  };

  const typedData = buildOrderTypedData({
    salt,
    maker: params.walletAddress,
    signer: params.walletAddress,
    taker: '0x0000000000000000000000000000000000000000',
    tokenId: params.tokenId,
    makerAmount,
    takerAmount,
    expiration,
    nonce,
    feeRateBps: DEFAULT_FEE_RATE_BPS,
    side: 'SELL',
    negRisk: params.negRisk,
  });

  return { order, typedData, amountUsdc };
}
