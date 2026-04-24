import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadPreferredMarketCapOverview } from '$lib/server/marketCapOverviewBridge';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { getRequestIp } from '$lib/server/requestIp';

const BTC_DOM_RISK_ON_THRESHOLD = 58;
const BTC_DOM_RISK_OFF_THRESHOLD = 62;

export const GET: RequestHandler = async ({ request, getClientAddress, fetch }) => {
  const ip = getRequestIp({ request, getClientAddress });
  if (!chartFeedLimiter.check(ip)) {
    return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const selection = await loadPreferredMarketCapOverview(fetch, 'macro');
  const overview = selection.overview;
  if (
    !overview ||
    (overview.btcDominance === null &&
      overview.totalMarketCapUsd === null &&
      overview.stablecoinMcapUsd === null)
  ) {
    return json({ error: 'macro_overview_unavailable' }, { status: 503 });
  }

  const nextMacroItems: string[] = [];
  if (overview.btcDominance !== null) {
    if (overview.btcDominance >= BTC_DOM_RISK_OFF_THRESHOLD) {
      nextMacroItems.push('BTC dominance is elevated; watch alt beta compression.');
    } else if (overview.btcDominance <= BTC_DOM_RISK_ON_THRESHOLD) {
      nextMacroItems.push('BTC dominance is easing; monitor relative-strength rotation.');
    } else {
      nextMacroItems.push('BTC dominance is mid-range; wait for directional break.');
    }
  }
  if (overview.stablecoinMcapChange24hPct !== null) {
    if (overview.stablecoinMcapChange24hPct > 0) {
      nextMacroItems.push('Stablecoin supply is expanding; dry powder is rebuilding.');
    } else if (overview.stablecoinMcapChange24hPct < 0) {
      nextMacroItems.push('Stablecoin supply is contracting; dry powder is being deployed.');
    }
  }

  return json(
    {
      success: true,
      ok: true,
      at: overview.at,
      btcDominance: overview.btcDominance,
      dominanceChange24h: overview.dominanceChange24h,
      totalMarketCapUsd: overview.totalMarketCapUsd,
      marketCapChange24hPct: overview.marketCapChange24hPct,
      stablecoinMcapUsd: overview.stablecoinMcapUsd,
      stablecoinMcapChange24hPct: overview.stablecoinMcapChange24hPct,
      sourceSpreadPct: overview.sourceSpreadPct,
      confidence: overview.confidence,
      keyThresholds: {
        btcDominanceRiskOn: BTC_DOM_RISK_ON_THRESHOLD,
        btcDominanceRiskOff: BTC_DOM_RISK_OFF_THRESHOLD,
      },
      nextMacroItems,
      providers: overview.providers,
      data: overview,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'X-WTD-Plane': 'fact',
        'X-WTD-Upstream': selection.upstream,
        'X-WTD-State': selection.state,
      },
    },
  );
};
