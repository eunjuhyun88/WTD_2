// ═══════════════════════════════════════════════════════════════
// Stockclaw — Polymarket Positions List API
// ═══════════════════════════════════════════════════════════════
// GET /api/positions/polymarket?settled=false&limit=50&offset=0

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';

type PolymarketPositionRow = {
  id: string;
  market_id: string;
  market_title: string;
  market_slug: string;
  token_id: string;
  direction: string;
  side: string;
  price: string | number;
  size: string | number;
  amount_usdc: string | number;
  clob_order_id: string | null;
  order_status: string | null;
  filled_size: string | number;
  avg_fill_price: string | number | null;
  current_price: string | number | null;
  pnl_usdc: string | number | null;
  settled: boolean;
  wallet_address: string | null;
  created_at: string | Date;
};

type TotalRow = { total: string | number };

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const settled = url.searchParams.get('settled');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100);
    const offset = Math.min(Math.max(Number(url.searchParams.get('offset')) || 0, 0), 1000);

    let whereClause = 'user_id = $1';
    const params: unknown[] = [user.id];

    if (settled === 'true') {
      whereClause += ' AND settled = true';
    } else if (settled === 'false') {
      whereClause += ' AND settled = false';
    }

    const result = await query<PolymarketPositionRow>(
      `SELECT * FROM polymarket_positions
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    const countResult = await query<TotalRow>(
      `SELECT COUNT(*) as total FROM polymarket_positions WHERE ${whereClause}`,
      params,
    );

    const positions = result.rows.map((row: PolymarketPositionRow) => ({
      id: row.id,
      marketId: row.market_id,
      marketTitle: row.market_title,
      marketSlug: row.market_slug,
      tokenId: row.token_id,
      direction: row.direction,
      side: row.side,
      price: Number(row.price),
      size: Number(row.size),
      amountUsdc: Number(row.amount_usdc),
      clobOrderId: row.clob_order_id,
      orderStatus: row.order_status,
      filledSize: Number(row.filled_size),
      avgFillPrice: row.avg_fill_price ? Number(row.avg_fill_price) : null,
      currentPrice: row.current_price ? Number(row.current_price) : null,
      pnlUsdc: row.pnl_usdc ? Number(row.pnl_usdc) : null,
      settled: row.settled,
      walletAddress: row.wallet_address,
      createdAt: new Date(row.created_at).getTime(),
    }));

    return json({
      ok: true,
      positions,
      total: Number(countResult.rows[0]?.total ?? 0),
    });
  } catch (error: unknown) {
    console.error('[positions/polymarket] error:', error);
    return json({ error: 'Failed to fetch positions' }, { status: 500 });
  }
};
