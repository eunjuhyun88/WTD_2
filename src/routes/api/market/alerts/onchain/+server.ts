import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchOnchainAlerts } from '$lib/server/alertRules';

/**
 * GET /api/market/alerts/onchain
 *
 * 온체인 알림 통합 엔드포인트 — 텔레그램 봇 스타일:
 *  - MVRV zone (@bitcoin_mvrv)
 *  - Whale alerts (@BinanceWhaleVolumeAlerts)
 *  - Liquidation alerts (@REKTbinance)
 *  - Exchange flow alerts
 *
 * 모든 데이터는 무료 API (CoinMetrics + GeckoTerminal + Coinalyze)
 */
export const GET: RequestHandler = async () => {
  try {
    const snapshot = await fetchOnchainAlerts('btc');

    return json(
      { ok: true, data: snapshot },
      { headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  } catch (err: any) {
    console.error('[api/market/alerts/onchain]', err);
    return json({ ok: false, error: err?.message ?? 'Internal error' }, { status: 500 });
  }
};
