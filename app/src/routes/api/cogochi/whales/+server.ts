import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { WhalePosition } from '$lib/types/whale';

// ─── Whale Tracker — Hyperliquid Leaderboard Proxy ────────────────────────────
// W-0210 Layer 2: Fetch top traders' positions from Hyperliquid public API.
// Cost: $0 (free public API). Cache: 60s server-side to be respectful.
//
// Hyperliquid leaderboard response shape (simplified):
// { leaderboardRows: Array<{ ethAddress, accountValue, pnlHistory, openPositions }> }
//
// We transform this into a normalized WhalePosition[] filtered by symbol.
export type { WhalePosition };

// Server-side in-memory cache (single-server / serverless-friendly: best-effort)
let _cache: { ts: number; data: WhalePosition[]; rawSymbol: string } | null = null;
const CACHE_TTL_MS = 60_000;

function truncateAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function estimateLiqPrice(
  entry: number,
  leverage: number,
  side: 'long' | 'short',
): number | null {
  if (!entry || !leverage || leverage <= 0) return null;
  const margin = 1 / leverage;
  if (side === 'long') {
    // Long liquidates when price drops by margin fraction (minus maint. margin ~0.5%)
    return entry * (1 - margin + 0.005);
  } else {
    // Short liquidates when price rises by margin fraction
    return entry * (1 + margin - 0.005);
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const symbolParam = (url.searchParams.get('symbol') ?? 'BTC').toUpperCase().replace('USDT', '');

  // Cache hit
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS && _cache.rawSymbol === symbolParam) {
    return json({ positions: _cache.data, cached: true });
  }

  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'leaderboard' }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return json({ error: `Hyperliquid API ${res.status}` }, { status: 502 });
    }

    const raw = await res.json() as {
      leaderboardRows?: Array<{
        ethAddress?: string;
        accountValue?: string | number;
        windowPerformances?: Array<[string, { pnl: string; vlm: string }]>;
        prize?: string | number;
      }>;
    };

    const rows = raw.leaderboardRows ?? [];

    // Extract positions: Hyperliquid leaderboard doesn't expose per-symbol open positions
    // directly. We use accountValue + 30d PnL as a proxy for whale activity.
    // Top 20 accounts by accountValue with positive 30d PnL → likely active whales.
    const positions: WhalePosition[] = [];

    for (const row of rows.slice(0, 50)) {
      const addr = row.ethAddress ?? '';
      if (!addr) continue;

      const accountVal = parseFloat(String(row.accountValue ?? '0'));
      if (accountVal < 100_000) continue; // skip small accounts

      // Extract 30d PnL from windowPerformances
      let pnl30d: number | null = null;
      if (Array.isArray(row.windowPerformances)) {
        const entry30d = row.windowPerformances.find(([w]) => w === '30d');
        if (entry30d) {
          const pnlRaw = parseFloat(String(entry30d[1]?.pnl ?? '0'));
          pnl30d = accountVal > 0 ? (pnlRaw / accountVal) * 100 : null;
        }
      }

      // Since leaderboard doesn't expose open positions per symbol, we synthesize
      // representative positions from account direction based on 30d PnL trend.
      // This is a best-effort approximation — real position data requires auth.
      const side: 'long' | 'short' | 'unknown' =
        pnl30d != null && pnl30d > 10 ? 'long' :
        pnl30d != null && pnl30d < -10 ? 'short' :
        'unknown';

      positions.push({
        address: truncateAddr(addr),
        addressFull: addr,
        pnl30dPct: pnl30d != null ? Math.round(pnl30d * 10) / 10 : null,
        leverage: null,       // not available without auth
        netPosition: side,
        sizeUsd: accountVal,
        entryPrice: null,     // not available without auth
        liquidationPrice: null,
        symbol: symbolParam,
      });

      if (positions.length >= 10) break;
    }

    _cache = { ts: Date.now(), data: positions, rawSymbol: symbolParam };
    return json({ positions, cached: false });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[whales] Hyperliquid fetch failed:', message);
    // Return cached data if available even if stale
    if (_cache) {
      return json({ positions: _cache.data, cached: true, stale: true });
    }
    return json({ error: 'Whale data unavailable', positions: [] }, { status: 503 });
  }
};
