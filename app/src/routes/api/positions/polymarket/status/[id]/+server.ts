// ═══════════════════════════════════════════════════════════════
// Stockclaw — Polymarket Position Status API
// ═══════════════════════════════════════════════════════════════
// Poll order status from CLOB and sync to DB.
//
// GET /api/positions/polymarket/status/[id]

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';
import { getOrderStatus, getTokenPrice, type L2Credentials } from '$lib/server/polymarketClob';
import { polymarketStatusLimiter } from '$lib/server/rateLimit';
import { decryptSecret } from '$lib/server/secretCrypto';

export const GET: RequestHandler = async ({ cookies, params, getClientAddress }) => {
  const ip = getClientAddress();
  if (!polymarketStatusLimiter.check(ip)) {
    return json({ error: 'Too many requests.' }, { status: 429 });
  }

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const { id } = params;
    if (!id) return json({ error: 'Position ID required' }, { status: 400 });

    // Fetch position
    const posResult = await query(
      `SELECT * FROM polymarket_positions WHERE id = $1 AND user_id = $2`,
      [id, user.id],
    );
    const pos = posResult.rows[0];
    if (!pos) return json({ error: 'Position not found' }, { status: 404 });

    // If not settled and has CLOB order, check status from CLOB
    if (!pos.settled && pos.clob_order_id) {
      // Get L2 creds
      const credResult = await query(
        `SELECT poly_api_key, poly_secret, poly_passphrase FROM users WHERE id = $1`,
        [user.id],
      );
      const creds = credResult.rows[0];
      let apiKey: string | null = null;
      let secret: string | null = null;
      let passphrase: string | null = null;
      try {
        apiKey = decryptSecret(creds?.poly_api_key ?? null);
        secret = decryptSecret(creds?.poly_secret ?? null);
        passphrase = decryptSecret(creds?.poly_passphrase ?? null);
      } catch {
        return json({ error: 'Server secret encryption key mismatch' }, { status: 503 });
      }

      if (apiKey && secret && passphrase) {
        const l2: L2Credentials = {
          apiKey,
          secret,
          passphrase,
        };

        const status = await getOrderStatus(pos.clob_order_id, l2, pos.wallet_address);
        if (status) {
          // Map CLOB status to our status
          let newStatus = pos.order_status;
          const filledSize = parseFloat(status.size_matched ?? '0');
          const originalSize = parseFloat(status.original_size ?? '0');

          if (status.status === 'matched') {
            newStatus = filledSize >= originalSize ? 'filled' : 'partially_filled';
          } else if (status.status === 'cancelled') {
            newStatus = 'cancelled';
          } else if (status.status === 'live') {
            newStatus = 'submitted';
          }

          // Update DB if status changed
          if (newStatus !== pos.order_status || filledSize !== Number(pos.filled_size)) {
            await query(
              `UPDATE polymarket_positions
               SET order_status = $1, filled_size = $2,
                   avg_fill_price = CASE WHEN $2 > 0 THEN $3 ELSE avg_fill_price END,
                   updated_at = now()
               WHERE id = $4`,
              [newStatus, filledSize, parseFloat(status.price ?? '0'), id],
            );
            pos.order_status = newStatus;
            pos.filled_size = filledSize;
          }
        }
      }

      // Update current price
      const currentPrice = await getTokenPrice(pos.token_id);
      if (currentPrice != null) {
        const entryPrice = Number(pos.price);
        const size = Number(pos.size);
        const pnlUsdc = (currentPrice - entryPrice) * size;

        await query(
          `UPDATE polymarket_positions
           SET current_price = $1, pnl_usdc = $2, updated_at = now()
           WHERE id = $3`,
          [currentPrice, pnlUsdc, id],
        );
        pos.current_price = currentPrice;
        pos.pnl_usdc = pnlUsdc;
      }
    }

    return json({
      ok: true,
      position: {
        id: pos.id,
        marketId: pos.market_id,
        marketTitle: pos.market_title,
        tokenId: pos.token_id,
        direction: pos.direction,
        side: pos.side,
        price: Number(pos.price),
        size: Number(pos.size),
        amountUsdc: Number(pos.amount_usdc),
        clobOrderId: pos.clob_order_id,
        orderStatus: pos.order_status,
        filledSize: Number(pos.filled_size),
        avgFillPrice: pos.avg_fill_price ? Number(pos.avg_fill_price) : null,
        currentPrice: pos.current_price ? Number(pos.current_price) : null,
        pnlUsdc: pos.pnl_usdc ? Number(pos.pnl_usdc) : null,
        settled: pos.settled,
        walletAddress: pos.wallet_address,
        createdAt: new Date(pos.created_at).getTime(),
        updatedAt: new Date(pos.updated_at).getTime(),
      },
    });
  } catch (error: unknown) {
    console.error('[positions/polymarket/status] error:', error);
    return json({ error: 'Failed to check status' }, { status: 500 });
  }
};
