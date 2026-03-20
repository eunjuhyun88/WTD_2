// ═══════════════════════════════════════════════════════════════
// Stockclaw — GMX V2 Order Prepare API
// ═══════════════════════════════════════════════════════════════
// POST /api/gmx/prepare
// Builds multicall calldata for opening a GMX position.
// The calldata is returned to the frontend, which sends it
// as a transaction via the user's wallet.
//
// Body: { market, direction, collateralUsd, leverage, walletAddress, slPrice?, tpPrice? }
// Returns: { positionId, calldata, orderParams, estimatedFees }

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';
import {
  buildIncreaseOrderCalldata,
  isValidMarket,
  findMarket,
  buildApproveCalldata,
} from '$lib/server/gmxV2';
import { gmxOrderLimiter } from '$lib/server/rateLimit';

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const POST: RequestHandler = async ({ cookies, request, getClientAddress }) => {
  const ip = getClientAddress();
  if (!gmxOrderLimiter.check(ip)) {
    return json({ error: 'Too many requests. Please wait.' }, { status: 429 });
  }

  try {
    // Auth
    const user = await getAuthUserFromCookies(cookies);
    if (!user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    // Parse body
    const body = await request.json();
    const { market, direction, collateralUsd, leverage, walletAddress, slPrice, tpPrice } = body;

    // Validate
    if (!market || !isValidMarket(market)) {
      return json({ error: 'Invalid market address' }, { status: 400 });
    }

    const dir = String(direction).toUpperCase();
    if (dir !== 'LONG' && dir !== 'SHORT') {
      return json({ error: 'Direction must be LONG or SHORT' }, { status: 400 });
    }

    const collateral = Number(collateralUsd);
    if (!collateral || collateral < 1 || collateral > 100_000) {
      return json({ error: 'Collateral must be between $1 and $100,000' }, { status: 400 });
    }

    const lev = Number(leverage);
    if (!lev || lev < 1 || lev > 100) {
      return json({ error: 'Leverage must be between 1x and 100x' }, { status: 400 });
    }

    if (!walletAddress || !ETH_ADDRESS_RE.test(walletAddress)) {
      return json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    const marketInfo = findMarket(market);
    if (!marketInfo) {
      return json({ error: 'Market not found' }, { status: 400 });
    }

    // Build calldata
    const isLong = dir === 'LONG';
    const result = await buildIncreaseOrderCalldata({
      market,
      isLong,
      collateralUsd: collateral,
      leverage: lev,
      walletAddress,
      slPrice: slPrice ? Number(slPrice) : undefined,
      tpPrice: tpPrice ? Number(tpPrice) : undefined,
    });

    // Insert into DB (pending_tx — user hasn't sent tx yet)
    const sizeUsd = collateral * lev;
    const insertResult = await query(
      `INSERT INTO gmx_positions (
        user_id, market_address, market_label, direction, collateral_token,
        collateral_usd, size_usd, leverage, order_type, order_status,
        wallet_address, sl_price, tp_price
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id`,
      [
        user.id,
        marketInfo.address,
        marketInfo.label,
        dir,
        '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC Arbitrum
        collateral,
        sizeUsd,
        lev,
        'MarketIncrease',
        'pending_tx',
        walletAddress,
        slPrice ? Number(slPrice) : null,
        tpPrice ? Number(tpPrice) : null,
      ]
    );

    const positionId = insertResult.rows[0]?.id;

    // Also build approve calldata in case user needs it
    const approveCalldata = buildApproveCalldata();

    return json({
      ok: true,
      positionId,
      calldata: result.calldata,
      approveCalldata,
      orderParams: {
        market: result.orderParams.market,
        direction: result.orderParams.direction,
        collateralUsd: result.orderParams.collateralUsd,
        sizeUsd: result.orderParams.sizeUsd,
        leverage: result.orderParams.leverage,
        executionFee: result.orderParams.executionFee.toString(),
      },
    });
  } catch (err: any) {
    console.error('[GMX prepare] Error:', err);
    return json({ error: err?.message ?? 'Failed to prepare order' }, { status: 500 });
  }
};
