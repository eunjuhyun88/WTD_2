import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { terminalReadLimiter } from '$lib/server/rateLimit';
import { pairToSymbol } from '$lib/server/providers/binance';
import { readRaw } from '$lib/server/providers/rawSources';
import { KnownRawId } from '$lib/contracts/ids';
import {
	fetchDerivatives,
	normalizePair,
	normalizeTimeframe,
	type DerivativesSnapshot,
} from '$lib/server/marketFeedService';
import { fetchCoinMarketCapQuote, hasCoinMarketCapApiKey } from '$lib/server/coinmarketcap';
import {
	fetchFactPerpContextProxy,
	type EngineFactPerpContextPayload,
} from '$lib/server/enginePlanes/facts';

type FlowDerivativesContext = {
	funding: number | null;
	lsRatio: number | null;
	oi: number | null;
	oiChange24h: number | null;
	liqLong24h: number | null;
	liqShort24h: number | null;
	updatedAt: number;
	source: 'facts/perp-context' | 'legacy-derivatives';
	crowding: string | null;
	cvdState: string | null;
};

function pickBias(
	funding: number | null,
	lsRatio: number | null,
	liqLong: number | null,
	liqShort: number | null,
): 'LONG' | 'SHORT' | 'NEUTRAL' {
	let score = 0;
	if (funding != null) score += funding > 0.0006 ? -1 : funding < -0.0006 ? 1 : 0;
	if (lsRatio != null) score += lsRatio > 1.1 ? -1 : lsRatio < 0.9 ? 1 : 0;
	const safeLiqLong = liqLong ?? 0;
	const safeLiqShort = liqShort ?? 0;
	if (safeLiqLong + safeLiqShort > 0) score += safeLiqShort > safeLiqLong ? 1 : safeLiqLong > safeLiqShort ? -1 : 0;
	if (score > 0) return 'LONG';
	if (score < 0) return 'SHORT';
	return 'NEUTRAL';
}

function adaptEnginePerpContext(
	payload: EngineFactPerpContextPayload,
): FlowDerivativesContext {
	const at = Date.parse(payload.generated_at ?? '');
	return {
		funding: payload.metrics?.funding_rate ?? null,
		lsRatio: payload.metrics?.long_short_ratio ?? null,
		oi: null,
		oiChange24h: payload.metrics?.oi_change_24h ?? null,
		liqLong24h: null,
		liqShort24h: null,
		updatedAt: Number.isFinite(at) ? at : Date.now(),
		source: 'facts/perp-context',
		crowding: payload.regime?.crowding ?? null,
		cvdState: payload.regime?.cvd_state ?? null,
	};
}

function adaptLegacyDerivatives(
	payload: DerivativesSnapshot,
): FlowDerivativesContext {
	return {
		funding: payload.funding,
		lsRatio: payload.lsRatio,
		oi: payload.oi,
		oiChange24h: null,
		liqLong24h: payload.liqLong24h,
		liqShort24h: payload.liqShort24h,
		updatedAt: payload.updatedAt,
		source: 'legacy-derivatives',
		crowding: null,
		cvdState: null,
	};
}

function buildDerivativesRecord(
	pair: string,
	token: string,
	bias: 'LONG' | 'SHORT' | 'NEUTRAL',
	deriv: FlowDerivativesContext,
	now: number,
) {
	const text =
		deriv.source === 'facts/perp-context'
			? `Funding ${deriv.funding != null ? (deriv.funding * 100).toFixed(4) + '%' : 'n/a'} · OI Δ24h ${deriv.oiChange24h != null ? (deriv.oiChange24h * 100 >= 0 ? '+' : '') + (deriv.oiChange24h * 100).toFixed(2) + '%' : 'n/a'} · L/S ${deriv.lsRatio?.toFixed(2) ?? 'n/a'} · CVD ${deriv.cvdState ?? deriv.crowding ?? 'n/a'}`
			: `Funding ${deriv.funding != null ? (deriv.funding * 100).toFixed(4) + '%' : 'n/a'} · OI ${deriv.oi != null ? '$' + (deriv.oi / 1e9).toFixed(2) + 'B' : 'n/a'} · L/S ${deriv.lsRatio?.toFixed(2) ?? 'n/a'} · Liq L $${Math.round(deriv.liqLong24h ?? 0).toLocaleString()} / S $${Math.round(deriv.liqShort24h ?? 0).toLocaleString()}`;

	return {
		id: `deriv-flow-${pair}-${now}`,
		pair,
		token,
		agentId: 'deriv',
		agent: 'DERIV',
		vote: bias,
		confidence: 70,
		text,
		source: deriv.source === 'facts/perp-context' ? 'ENGINE_FACT' : 'COINALYZE',
		createdAt: now,
	};
}

export const GET: RequestHandler = async ({ fetch, url, getClientAddress }) => {
  if (!terminalReadLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const pair = normalizePair(url.searchParams.get('pair'));
    const timeframe = normalizeTimeframe(url.searchParams.get('timeframe'));
    const token = pair.split('/')[0];

		const [tickerRes, enginePerpRes, cmcRes] = await Promise.allSettled([
			readRaw(KnownRawId.TICKER_24HR, { symbol: pairToSymbol(pair) }),
			fetchFactPerpContextProxy(fetch, { symbol: pairToSymbol(pair), timeframe, offline: true }),
			fetchCoinMarketCapQuote(token),
		]);

		const ticker = tickerRes.status === 'fulfilled' ? tickerRes.value : null;
		const enginePerp = enginePerpRes.status === 'fulfilled' ? enginePerpRes.value : null;
		const cmc = cmcRes.status === 'fulfilled' ? cmcRes.value : null;
		let deriv: FlowDerivativesContext | null = enginePerp ? adaptEnginePerpContext(enginePerp) : null;

		if (!deriv) {
			try {
				deriv = adaptLegacyDerivatives(await fetchDerivatives(fetch, pair, timeframe));
			} catch {
				deriv = null;
			}
		}

		const bias = pickBias(
			deriv?.funding ?? null,
			deriv?.lsRatio ?? null,
			deriv?.liqLong24h ?? null,
			deriv?.liqShort24h ?? null,
		);

		// records는 실제 파생/플로우 데이터에서 구성 (하드코딩 제거)
		const records: Array<{id:string;pair:string;token:string;agentId:string;agent:string;vote:string;confidence:number;text:string;source:string;createdAt:number}> = [];
		const now = Date.now();
		if (deriv) {
			records.push(buildDerivativesRecord(pair, token, bias, deriv, now));
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
            liqLong24h: deriv?.source === 'legacy-derivatives' ? deriv.liqLong24h : null,
            liqShort24h: deriv?.source === 'legacy-derivatives' ? deriv.liqShort24h : null,
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
          'X-WTD-Plane': 'fact',
          'X-WTD-Upstream':
            deriv?.source === 'facts/perp-context'
              ? 'facts/perp-context+ticker-bridge'
              : deriv?.source === 'legacy-derivatives'
                ? 'legacy-compute'
                : 'ticker-bridge',
          'X-WTD-State':
            deriv?.source === 'facts/perp-context'
              ? 'adapter'
              : deriv?.source === 'legacy-derivatives'
                ? 'fallback'
                : 'degraded',
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
