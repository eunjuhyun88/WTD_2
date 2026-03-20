// ═══════════════════════════════════════════════════════════════
// Stockclaw — On-chain Data API (Coin Metrics → CryptoQuant fallback)
// ═══════════════════════════════════════════════════════════════
// Exchange reserves, MVRV, NUPL, whale + miner data

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchCryptoQuantData, hasCryptoQuantKey } from '$lib/server/cryptoquant';
import { fetchCoinMetricsData } from '$lib/server/coinmetrics';

export const GET: RequestHandler = async ({ url }) => {
  const token = (url.searchParams.get('token') ?? 'btc').toLowerCase() as 'btc' | 'eth';
  if (token !== 'btc' && token !== 'eth') {
    return json({ error: 'Invalid token. Use btc or eth.' }, { status: 400 });
  }

  try {
    // Try Coin Metrics first (free, no API key) → CryptoQuant fallback
    let data = null;
    let source: string | null = null;

    const cmData = await fetchCoinMetricsData(token);
    if (cmData?.onchainMetrics?.mvrv != null) {
      data = cmData;
      source = 'coinmetrics';
    }

    if (!data && hasCryptoQuantKey()) {
      data = await fetchCryptoQuantData(token);
      if (data) source = 'cryptoquant';
    }

    // Even if CoinMetrics didn't have MVRV, return what it has
    if (!data && cmData) {
      data = cmData;
      source = 'coinmetrics';
    }

    if (!data) {
      return json({ ok: false, error: 'No on-chain data source available' }, { status: 503 });
    }

    return json(
      { ok: true, source, data },
      { headers: { 'Cache-Control': 'public, max-age=120' } }
    );
  } catch (error: unknown) {
    console.error('[api/onchain/cryptoquant] error:', error);
    return json({ error: 'Failed to fetch on-chain data' }, { status: 500 });
  }
};
