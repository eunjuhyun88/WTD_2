// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Positions API Client (Frontend)
// ═══════════════════════════════════════════════════════════════
// All Polymarket + unified position API calls.
// Frontend → Our API → Backend (never calls Polymarket directly).

import type { EIP712TypedData } from '$lib/server/polymarketClob';

// ── Types ────────────────────────────────────────────────────

export interface UnifiedPosition {
  id: string;
  type: 'quick_trade' | 'polymarket' | 'gmx';
  asset: string;
  direction: string;
  entryPrice: number;
  currentPrice: number;
  pnlPercent: number;
  pnlUsdc: number | null;
  amountUsdc: number | null;
  status: string;
  openedAt: number;
  meta: Record<string, unknown>;
}

export interface PolymarketPosition {
  id: string;
  marketId: string;
  marketTitle: string;
  marketSlug: string;
  tokenId: string;
  direction: 'YES' | 'NO';
  side: string;
  price: number;
  size: number;
  amountUsdc: number;
  clobOrderId: string | null;
  orderStatus: string;
  filledSize: number;
  avgFillPrice: number | null;
  currentPrice: number | null;
  pnlUsdc: number | null;
  settled: boolean;
  walletAddress: string;
  createdAt: number;
}

export interface PrepareOrderResponse {
  ok: boolean;
  positionId: string;
  typedData: EIP712TypedData;
  orderParams: {
    tokenId: string;
    side: string;
    price: number;
    size: number;
    salt: string;
    nonce: string;
    expiration: string;
    feeRateBps: number;
  };
}

export interface SubmitOrderResponse {
  ok: boolean;
  clobOrderId: string;
  orderStatus: string;
}

export interface PolyAuthResponse {
  ok: boolean;
  typedData?: EIP712TypedData;
  timestamp?: number;
  nonce?: number;
  authenticated?: boolean;
  error?: string;
}

// ── Helpers ──────────────────────────────────────────────────

async function requestJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...init?.headers,
      },
      signal: init?.signal ?? AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      console.error(`[positionsApi] ${url}:`, err);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[positionsApi] ${url}:`, err);
    return null;
  }
}

// ── Polymarket Auth ──────────────────────────────────────────

/**
 * Step 1: Get ClobAuth typed data for wallet signing.
 */
export async function getPolymarketAuthData(walletAddress: string): Promise<PolyAuthResponse | null> {
  return requestJson<PolyAuthResponse>(
    `/api/positions/polymarket/auth?walletAddress=${walletAddress}`,
  );
}

/**
 * Step 2: Submit wallet signature to derive L2 API credentials.
 */
export async function submitPolymarketAuth(params: {
  walletAddress: string;
  signature: string;
  timestamp: number;
  nonce?: number;
}): Promise<PolyAuthResponse | null> {
  return requestJson<PolyAuthResponse>('/api/positions/polymarket/auth', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ── Order Lifecycle ──────────────────────────────────────────

/**
 * Prepare a new Polymarket order (Step 1 of 2).
 * Returns EIP-712 typed data for wallet signing.
 */
export async function preparePolymarketOrder(params: {
  marketId: string;
  direction: 'YES' | 'NO';
  price: number;
  amount: number;
  walletAddress: string;
}): Promise<PrepareOrderResponse | null> {
  return requestJson<PrepareOrderResponse>('/api/positions/polymarket/prepare', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Submit a signed order to CLOB (Step 2 of 2).
 */
export async function submitPolymarketOrder(params: {
  positionId: string;
  signature: string;
}): Promise<SubmitOrderResponse | null> {
  return requestJson<SubmitOrderResponse>('/api/positions/polymarket/submit', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Get position status (polls CLOB for updates).
 */
export async function getPolymarketPositionStatus(
  positionId: string,
): Promise<{ ok: boolean; position: PolymarketPosition } | null> {
  return requestJson(`/api/positions/polymarket/status/${positionId}`);
}

/**
 * Prepare a close (SELL) order for an existing position.
 */
export async function closePolymarketPosition(
  positionId: string,
): Promise<PrepareOrderResponse | null> {
  return requestJson<PrepareOrderResponse>(
    `/api/positions/polymarket/${positionId}/close`,
    { method: 'POST' },
  );
}

// ── Position Lists ───────────────────────────────────────────

/**
 * Fetch unified positions (QuickTrades + Polymarket).
 */
export async function fetchUnifiedPositions(params?: {
  type?: 'all' | 'quick_trade' | 'polymarket' | 'gmx';
  limit?: number;
}): Promise<{ ok: boolean; positions: UnifiedPosition[]; total: number } | null> {
  const qs = new URLSearchParams();
  if (params?.type) qs.set('type', params.type);
  if (params?.limit) qs.set('limit', String(params.limit));
  return requestJson(`/api/positions/unified?${qs}`);
}

/**
 * Fetch Polymarket positions only.
 */
export async function fetchPolymarketPositions(params?: {
  settled?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ ok: boolean; positions: PolymarketPosition[]; total: number } | null> {
  const qs = new URLSearchParams();
  if (params?.settled !== undefined) qs.set('settled', String(params.settled));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  return requestJson(`/api/positions/polymarket?${qs}`);
}
