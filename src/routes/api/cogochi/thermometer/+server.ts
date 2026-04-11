// GET /api/cogochi/thermometer
// Returns global market data for the thermometer bar.
// All APIs are free, no keys needed.
//
// Migrated to the typed `readRaw()` adapter (Phase 1 A-P0 slice 2).
// Inline upstream fetches are forbidden — every raw must come through
// `src/lib/server/providers/rawSources.ts` so the contract namespace
// remains the single source of truth.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readRaw } from '$lib/server/providers';
import { KnownRawId } from '$lib/contracts/ids';

export const GET: RequestHandler = async () => {
  const [fearGreed, btcTx, mempoolPending, fastestFee, usdKrw, btcDom] = await Promise.all([
    readRaw(KnownRawId.FEAR_GREED_VALUE, {}).catch(() => null),
    readRaw(KnownRawId.BTC_N_TX_24H, {}).catch(() => null),
    readRaw(KnownRawId.MEMPOOL_PENDING_TX, {}).catch(() => null),
    readRaw(KnownRawId.MEMPOOL_FASTEST_FEE, {}).catch(() => null),
    readRaw(KnownRawId.USD_KRW_RATE, {}).catch(() => 1350),
    readRaw(KnownRawId.BTC_DOMINANCE, {}).catch(() => null),
  ]);

  return json({
    fearGreed,
    btcDominance: btcDom != null ? Math.round(btcDom * 10) / 10 : null,
    btcTx,
    mempoolPending,
    fastestFee,
    usdKrw: Math.round(usdKrw ?? 1350),
  });
};
