// ═══════════════════════════════════════════════════════════════
// Stockclaw — Polymarket Position Close API
// ═══════════════════════════════════════════════════════════════
// Prepares a SELL order to close an existing filled position.
// Returns EIP-712 typed data for wallet signing (same 2-step flow).
//
// POST /api/positions/polymarket/[id]/close

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';
import { prepareSellOrder, getTokenPrice } from '$lib/server/polymarketClob';
import { polymarketOrderLimiter } from '$lib/server/rateLimit';

export const POST: RequestHandler = async ({ cookies, params, getClientAddress }) => {
  const ip = getClientAddress();
  if (!polymarketOrderLimiter.check(ip)) {
    return json({ error: 'Too many requests.' }, { status: 429 });
  }

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const { id } = params;
    if (!id) return json({ error: 'Position ID required' }, { status: 400 });

    // Fetch the position
    const posResult = await query(
      `SELECT * FROM polymarket_positions
       WHERE id = $1 AND user_id = $2 AND settled = false`,
      [id, user.id],
    );
    const pos = posResult.rows[0];
    if (!pos) return json({ error: 'Position not found or already settled' }, { status: 404 });

    if (pos.order_status !== 'filled' && pos.order_status !== 'partially_filled') {
      return json({ error: 'Only filled positions can be closed' }, { status: 400 });
    }

    const filledSize = Number(pos.filled_size) || Number(pos.size);

    // Get current price for SELL order
    const currentPrice = await getTokenPrice(pos.token_id);
    if (!currentPrice || currentPrice <= 0) {
      return json({ error: 'Cannot determine current price' }, { status: 502 });
    }

    // Prepare SELL order
    const prepared = await prepareSellOrder({
      tokenId: pos.token_id,
      size: filledSize,
      price: currentPrice,
      walletAddress: pos.wallet_address,
      negRisk: false, // TODO: track from market details
    });

    if (!prepared) {
      return json({ error: 'Failed to prepare close order' }, { status: 500 });
    }

    return json({
      ok: true,
      positionId: id,
      typedData: prepared.typedData,
      orderParams: {
        tokenId: pos.token_id,
        side: 'SELL',
        price: currentPrice,
        size: filledSize,
        amountUsdc: prepared.amountUsdc,
      },
    });
  } catch (error: unknown) {
    console.error('[positions/polymarket/close] error:', error);
    return json({ error: 'Failed to prepare close order' }, { status: 500 });
  }
};
