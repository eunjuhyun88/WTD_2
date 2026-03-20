import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetch24hrServer, pairToSymbol } from '$lib/server/binance';
import { fetchDerivatives, normalizePair, normalizeTimeframe } from '$lib/server/marketFeedService';
import { fetchCoinMarketCapQuote, hasCoinMarketCapApiKey } from '$lib/server/coinmarketcap';

function pickBias(funding: number | null, lsRatio: number | null, liqLong: number, liqShort: number): 'LONG' | 'SHORT' | 'NEUTRAL' {
  let score = 0;
  if (funding != null) score += funding > 0.0006 ? -1 : funding < -0.0006 ? 1 : 0;
  if (lsRatio != null) score += lsRatio > 1.1 ? -1 : lsRatio < 0.9 ? 1 : 0;
  if (liqLong + liqShort > 0) score += liqShort > liqLong ? 1 : liqLong > liqShort ? -1 : 0;
  if (score > 0) return 'LONG';
  if (score < 0) return 'SHORT';
  return 'NEUTRAL';
}

export const GET: RequestHandler = async ({ fetch, url }) => {
  try {
    const pair = normalizePair(url.searchParams.get('pair'));
    const timeframe = normalizeTimeframe(url.searchParams.get('timeframe'));
    const token = pair.split('/')[0];

    const [tickerRes, derivRes, cmcRes] = await Promise.allSettled([
      fetch24hrServer(pairToSymbol(pair)),
      fetchDerivatives(fetch, pair, timeframe),
      fetchCoinMarketCapQuote(token),
    ]);

    const ticker = tickerRes.status === 'fulfilled' ? tickerRes.value : null;
    const deriv = derivRes.status === 'fulfilled' ? derivRes.value : null;
    const cmc = cmcRes.status === 'fulfilled' ? cmcRes.value : null;

    const bias = pickBias(
      deriv?.funding ?? null,
      deriv?.lsRatio ?? null,
      deriv?.liqLong24h ?? 0,
      deriv?.liqShort24h ?? 0
    );

    // records는 실제 파생/플로우 데이터에서 구성 (하드코딩 제거)
    const records: Array<{id:string;pair:string;token:string;agentId:string;agent:string;vote:string;confidence:number;text:string;source:string;createdAt:number}> = [];
    const now = Date.now();
    if (deriv) {
      records.push({
        id: `deriv-flow-${pair}-${now}`, pair, token, agentId: 'deriv', agent: 'DERIV',
        vote: bias, confidence: 70,
        text: `Funding ${deriv.funding != null ? (deriv.funding * 100).toFixed(4) + '%' : 'n/a'} · OI ${deriv.oi != null ? '$' + (deriv.oi / 1e9).toFixed(2) + 'B' : 'n/a'} · L/S ${deriv.lsRatio?.toFixed(2) ?? 'n/a'} · Liq L $${Math.round(deriv.liqLong24h).toLocaleString()} / S $${Math.round(deriv.liqShort24h).toLocaleString()}`,
        source: 'COINALYZE', createdAt: now,
      });
    }
    if (ticker) {
      const pctChg = Number(ticker.priceChangePercent || 0);
      const vol = Number(ticker.quoteVolume || 0);
      records.push({
        id: `flow-ticker-${pair}-${now}`, pair, token, agentId: 'flow', agent: 'FLOW',
        vote: pctChg >= 0 ? 'LONG' : 'SHORT', confidence: 60,
        text: `24h ${pctChg >= 0 ? '+' : ''}${pctChg.toFixed(2)}% · Vol $${(vol / 1e9).toFixed(2)}B`,
        source: 'BINANCE', createdAt: now,
      });
    }

    return json(
      {
        ok: true,
        data: {
          pair,
          timeframe,
          token,
          bias,
          snapshot: {
            source: {
              binance: Boolean(ticker),
              coinalyze: Boolean(deriv),
              coinmarketcap: Boolean(cmc),
            },
            priceChangePct: ticker ? Number(ticker.priceChangePercent) : null,
            quoteVolume24h: ticker ? Number(ticker.quoteVolume) : null,
            funding: deriv?.funding ?? null,
            lsRatio: deriv?.lsRatio ?? null,
            liqLong24h: deriv?.liqLong24h ?? null,
            liqShort24h: deriv?.liqShort24h ?? null,
            cmcPrice: cmc?.price ?? null,
            cmcMarketCap: cmc?.marketCap ?? null,
            cmcVolume24hUsd: cmc?.volume24h ?? null,
            cmcChange24hPct: cmc?.change24hPct ?? null,
            cmcUpdatedAt: cmc?.updatedAt ?? null,
            cmcKeyConfigured: hasCoinMarketCapApiKey(),
          },
          records,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=15',
        },
      }
    );
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('pair must be like')) {
      return json({ error: error.message }, { status: 400 });
    }
    if (typeof error?.message === 'string' && error.message.includes('timeframe must be one of')) {
      return json({ error: error.message }, { status: 400 });
    }
    console.error('[market/flow/get] unexpected error:', error);
    return json({ error: 'Failed to load flow data' }, { status: 500 });
  }
};
