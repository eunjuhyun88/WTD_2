// ═══════════════════════════════════════════════════════════════
// Stockclaw — GMX V2 Positions API
// ═══════════════════════════════════════════════════════════════
// GET /api/gmx/positions
// Returns user's GMX positions from DB.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';
import { gmxReadLimiter } from '$lib/server/rateLimit';

type GmxPositionRow = {
  id: string;
  market_address: string;
  market_label: string;
  direction: string;
  collateral_token: string;
  collateral_usd: string | number;
  size_usd: string | number;
  leverage: string | number;
  entry_price: string | number | null;
  mark_price: string | number | null;
  liquidation_price: string | number | null;
  pnl_usd: string | number | null;
  pnl_percent: string | number | null;
  order_key: string | null;
  order_type: string | null;
  order_status: string | null;
  tx_hash: string | null;
  position_key: string | null;
  wallet_address: string | null;
  sl_order_key: string | null;
  tp_order_key: string | null;
  sl_price: string | number | null;
  tp_price: string | number | null;
  created_at: string | Date;
  updated_at: string | Date;
  executed_at: string | Date | null;
  closed_at: string | Date | null;
  status: string;
};

export const GET: RequestHandler = async ({ cookies, url, getClientAddress }) => {
  const ip = getClientAddress();
  if (!gmxReadLimiter.check(ip)) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    const status = url.searchParams.get('status') || 'open';
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100);

    const result = await query<GmxPositionRow>(
      `SELECT
        id, market_address, market_label, direction,
        collateral_token, collateral_usd, size_usd, leverage,
        entry_price, mark_price, liquidation_price,
        pnl_usd, pnl_percent,
        order_key, order_type, order_status,
        tx_hash, position_key, wallet_address,
        sl_order_key, tp_order_key, sl_price, tp_price,
        created_at, updated_at, executed_at, closed_at, status
      FROM gmx_positions
      WHERE user_id = $1
        AND ($2::text = 'all' OR status = $2)
      ORDER BY created_at DESC
      LIMIT $3`,
      [user.id, status, limit]
    );

    const positions = result.rows.map((row: GmxPositionRow) => ({
      id: row.id,
      marketAddress: row.market_address,
      marketLabel: row.market_label,
      direction: row.direction,
      collateralToken: row.collateral_token,
      collateralUsd: Number(row.collateral_usd),
      sizeUsd: Number(row.size_usd),
      leverage: Number(row.leverage),
      entryPrice: row.entry_price ? Number(row.entry_price) : null,
      markPrice: row.mark_price ? Number(row.mark_price) : null,
      liquidationPrice: row.liquidation_price ? Number(row.liquidation_price) : null,
      pnlUsd: row.pnl_usd ? Number(row.pnl_usd) : null,
      pnlPercent: row.pnl_percent ? Number(row.pnl_percent) : null,
      orderKey: row.order_key,
      orderType: row.order_type,
      orderStatus: row.order_status,
      txHash: row.tx_hash,
      positionKey: row.position_key,
      walletAddress: row.wallet_address,
      slPrice: row.sl_price ? Number(row.sl_price) : null,
      tpPrice: row.tp_price ? Number(row.tp_price) : null,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      executedAt: row.executed_at ? new Date(row.executed_at).getTime() : null,
      closedAt: row.closed_at ? new Date(row.closed_at).getTime() : null,
      status: row.status,
    }));

    return json({ ok: true, positions, total: positions.length });
  } catch (err: any) {
    console.error('[GMX positions] Error:', err);
    return json({ error: err?.message ?? 'Failed to fetch positions' }, { status: 500 });
  }
};
