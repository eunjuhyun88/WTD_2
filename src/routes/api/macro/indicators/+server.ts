// ═══════════════════════════════════════════════════════════════
// Stockclaw — Macro Indicators Proxy (DXY, SPX, US10Y)
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchYahooSeries } from '$lib/server/yahooFinance';

export const GET: RequestHandler = async () => {
  try {
    const [dxyRes, spxRes, us10yRes] = await Promise.allSettled([
      fetchYahooSeries('DX-Y.NYB', '1mo', '1d'),
      fetchYahooSeries('^GSPC', '1mo', '1d'),
      fetchYahooSeries('^TNX', '1mo', '1d')
    ]);

    const dxy = dxyRes.status === 'fulfilled' ? dxyRes.value : null;
    const spx = spxRes.status === 'fulfilled' ? spxRes.value : null;
    const us10y = us10yRes.status === 'fulfilled' ? us10yRes.value : null;

    // Extract latest values + trend
    function extractLatest(series: typeof dxy) {
      if (!series?.points?.length) return null;
      const pts = series.points;
      const latest = pts[pts.length - 1];
      const prev = pts.length >= 2 ? pts[pts.length - 2] : null;
      const first = pts[0];
      return {
        price: latest.close,
        prevClose: series.previousClose ?? prev?.close ?? null,
        changePct: series.regularMarketChangePercent ?? null,
        trend1m: first ? ((latest.close - first.close) / first.close) * 100 : null,
        updatedAt: series.updatedAt,
      };
    }

    return json(
      {
        ok: true,
        data: {
          dxy: extractLatest(dxy),
          spx: extractLatest(spx),
          us10y: extractLatest(us10y),
        }
      },
      { headers: { 'Cache-Control': 'public, max-age=300' } }
    );
  } catch (error: unknown) {
    console.error('[macro/indicators] error:', error);
    return json({ error: 'Failed to fetch macro indicators' }, { status: 500 });
  }
};
