/**
 * Shared types for whale tracking (W-0210 Layer 2).
 * Used by both the API route and the client store.
 */

export interface WhalePosition {
  address: string;       // truncated: 0x1234…5678
  addressFull: string;   // full address for Hyperliquid explorer link
  pnl30dPct: number | null;
  leverage: number | null;
  netPosition: 'long' | 'short' | 'unknown';
  sizeUsd: number;
  entryPrice: number | null;
  liquidationPrice: number | null;
  symbol: string;        // e.g. 'BTC'
}
