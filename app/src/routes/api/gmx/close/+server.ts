// ═══════════════════════════════════════════════════════════════
// Stockclaw — GMX V2 Close Position API
// ═══════════════════════════════════════════════════════════════
// POST /api/gmx/close
// Builds MarketDecrease calldata for closing a GMX position.
//
// Body: { positionId, sizePercent? }
// Returns: { calldata, estimatedFees }

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';
import { buildDecreaseOrderCalldata } from '$lib/server/gmxV2';
import { gmxOrderLimiter } from '$lib/server/rateLimit';

export const POST: RequestHandler = async ({ cookies, request, getClientAddress }) => {
  const ip = getClientAddress();
  if (!gmxOrderLimiter.check(ip)) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { positionId, sizePercent = 100 } = body;

    if (!positionId) {
      return json({ error: 'Missing positionId' }, { status: 400 });
    }

    const pct = Math.min(Math.max(Number(sizePercent) || 100, 1), 100);

    // Fetch position
    const result = await query(
      `SELECT id, market_address, market_label, direction, size_usd,
              collateral_usd, wallet_address, status, order_status
       FROM gmx_positions
       WHERE id = $1 AND user_id = $2`,
      [positionId, user.id]
    );

    if (!result.rows.length) {
      return json({ error: 'Position not found' }, { status: 404 });
    }

    const pos = result.rows[0];

    if (pos.status !== 'open') {
      return json({ error: 'Position is not open' }, { status: 400 });
    }

    if (pos.order_status !== 'executed') {
      return json({ error: 'Position order not yet executed' }, { status: 400 });
    }

    const isLong = pos.direction === 'LONG';
    const closeSizeUsd = Number(pos.size_usd) * (pct / 100);
    const closeCollateralUsd = Number(pos.collateral_usd) * (pct / 100);

    const calldata = await buildDecreaseOrderCalldata({
      market: pos.market_address,
      isLong,
      sizeUsd: closeSizeUsd,
      collateralUsd: closeCollateralUsd,
      walletAddress: pos.wallet_address,
    });

    return json({
      ok: true,
      calldata,
      positionId,
      closeSizeUsd,
      closePercent: pct,
    });
  } catch (err: any) {
    console.error('[GMX close] Error:', err);
    return json({ error: err?.message ?? 'Failed to prepare close order' }, { status: 500 });
  }
};
