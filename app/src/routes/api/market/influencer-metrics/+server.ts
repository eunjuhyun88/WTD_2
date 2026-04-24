import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { IndicatorCatalogEntry, IndicatorCatalogResponse } from '$lib/contracts/facts/indicatorCatalog';
import type {
  InfluencerMetricBinding,
  InfluencerMetricFactCoverage,
  InfluencerMetricsPayload,
} from '$lib/contracts/influencerMetrics';
import { fetchIndicatorCatalogProxy } from '$lib/server/enginePlanes/facts';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { getRequestIp } from '$lib/server/requestIp';
import { fetchInfluencerMetrics } from '$lib/server/influencerMetrics';

const VALID_SYMBOL = /^[A-Z0-9]{3,12}USDT$/;

const INDICATOR_ID_ALIASES: Record<string, string> = {
  whale_activity: 'whale_tx_count',
  total_value_locked: 'total_tvl',
  dex_volume_tvl_ratio: 'volume_tvl_ratio',
  social_mention_velocity: 'trending_mentions_velocity',
};

function normalizeCatalogIndicatorId(indicatorId: string): string {
  return INDICATOR_ID_ALIASES[indicatorId] ?? indicatorId;
}

function collectReportBindings(payload: InfluencerMetricsPayload): Array<{
  reportMetricId: string;
  binding: InfluencerMetricBinding & { indicatorId: string };
}> {
  return payload.report.metricLeaderboard.flatMap((item) =>
    item.bindings
      .filter((binding): binding is InfluencerMetricBinding & { indicatorId: string } => Boolean(binding.indicatorId))
      .map((binding) => ({
        reportMetricId: item.id,
        binding,
      })),
  );
}

function adaptFactCoverage(
  payload: InfluencerMetricsPayload,
  catalog: IndicatorCatalogResponse | null,
): InfluencerMetricFactCoverage | null {
  if (!catalog?.ok) return null;

  const catalogById = new Map<string, IndicatorCatalogEntry>(
    catalog.metrics.map((entry) => [entry.id, entry]),
  );
  const items = collectReportBindings(payload).map(({ reportMetricId, binding }) => {
    const catalogIndicatorId = normalizeCatalogIndicatorId(binding.indicatorId);
    const match = catalogById.get(catalogIndicatorId) ?? null;

    return {
      reportMetricId,
      bindingLabel: binding.label,
      requestedIndicatorId: binding.indicatorId,
      catalogIndicatorId,
      payloadPath: binding.payloadPath,
      providerKey: binding.providerKey,
      family: match?.family ?? null,
      status: match?.status ?? 'missing',
      currentOwner: match?.current_owner ?? null,
      promotionStage: match?.promotion_stage ?? null,
      primarySources: match?.primary_sources ?? [],
      nextGate: match?.next_gate ?? null,
    };
  });

  return {
    owner: catalog.owner,
    plane: catalog.plane,
    kind: catalog.kind,
    status: catalog.status,
    generatedAt: catalog.generated_at,
    coverage: {
      totalBindings: items.length,
      matched: items.filter((item) => item.family !== null).length,
      missing: items.filter((item) => item.status === 'missing').length,
      live: items.filter((item) => item.status === 'live').length,
      partial: items.filter((item) => item.status === 'partial').length,
      blocked: items.filter((item) => item.status === 'blocked').length,
    },
    items,
  };
}

export const GET: RequestHandler = async ({ url, request, getClientAddress, fetch }) => {
  const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  if (!VALID_SYMBOL.test(symbol)) {
    return json({ error: 'invalid symbol' }, { status: 400 });
  }

  const ip = getRequestIp({ request, getClientAddress });
  if (!chartFeedLimiter.check(ip)) {
    return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  try {
    const [payload, indicatorCatalog] = await Promise.all([
      fetchInfluencerMetrics(symbol),
      fetchIndicatorCatalogProxy(fetch),
    ]);
    const factCoverage = adaptFactCoverage(payload, indicatorCatalog);

    return json(factCoverage ? { ...payload, factCoverage } : payload, {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'X-WTD-Plane': 'fact',
        'X-WTD-Upstream': factCoverage ? 'facts/indicator-catalog+live-influencer-metrics' : 'live-influencer-metrics',
        'X-WTD-State': factCoverage ? 'adapter' : 'fallback',
      },
    });
  } catch (error) {
    console.error('[api/market/influencer-metrics] error:', error);
    return json({ error: 'failed to build influencer metrics pack' }, { status: 500 });
  }
};
