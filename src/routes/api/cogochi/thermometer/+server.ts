// GET /api/cogochi/thermometer
// Returns global market data for the thermometer bar.
// All APIs are free, no keys needed.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  fetchBtcOnchain, fetchMempool, fetchUsdKrw, fetchBtcDominance,
} from '$lib/server/marketDataService';

export const GET: RequestHandler = async () => {
  const timeout = AbortSignal.timeout(8000);

  const [fearGreedVal, btcOnchain, mempool, usdKrw, btcDom] = await Promise.all([
    fetch('https://api.alternative.me/fng/?limit=1', { signal: timeout })
      .then(r => r.ok ? r.json() : null)
      .then(d => parseInt(d?.data?.[0]?.value) || null)
      .catch(() => null),
    fetchBtcOnchain().catch(() => null),
    fetchMempool().catch(() => null),
    fetchUsdKrw().catch(() => 1350),
    fetchBtcDominance().catch(() => null),
  ]);

  return json({
    fearGreed: fearGreedVal,
    btcDominance: btcDom ? Math.round(btcDom * 10) / 10 : null,
    btcTx: btcOnchain?.nTx ?? null,
    mempoolPending: mempool?.count ?? null,
    fastestFee: mempool?.fastestFee ?? null,
    usdKrw: Math.round(usdKrw),
  });
};
