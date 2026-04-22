import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';
import type {
  AIContextPack,
  CogochiWorkspaceEnvelope,
  ProviderRef,
  StudyMetric,
  StudySnapshot,
  WorkspaceSection,
} from '$lib/contracts/cogochiDataPlane';
import type { ConfluenceResult } from '$lib/confluence/types';
import type {
  LiqClusterPayload,
  OptionsSnapshotPayload,
  VenueDivergencePayload,
} from '$lib/indicators/adapter';

interface BuildCogochiWorkspaceEnvelopeArgs {
  symbol: string;
  timeframe: string;
  analyze: AnalyzeEnvelope | null;
  chartPayload: ChartSeriesPayload | null;
  confluence?: ConfluenceResult | null;
  venueDivergence?: VenueDivergencePayload | null;
  liqClusters?: LiqClusterPayload | null;
  optionsSnapshot?: OptionsSnapshotPayload | null;
}

function fmtNum(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v >= 1000
    ? v.toLocaleString('en-US', { maximumFractionDigits: 1 })
    : v.toFixed(4);
}

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

function percentDiff(base: number | null | undefined, target: number | null | undefined): string {
  if (base == null || target == null || !Number.isFinite(base) || !Number.isFinite(target) || base === 0) return '—';
  return fmtPct(((target - base) / base) * 100, 2);
}

function providerRef(
  provider: ProviderRef['provider'],
  route: string,
  auth: ProviderRef['auth'],
  freshnessMs: number | null,
  status: ProviderRef['status'],
): ProviderRef {
  return { provider, route, auth, freshnessMs, status };
}

function metric(label: string, value: string | number | null, tone?: StudyMetric['tone'], note?: string): StudyMetric {
  return { label, value, tone, note };
}

export function buildStudyMap(studies: StudySnapshot[]): Record<string, StudySnapshot> {
  return Object.fromEntries(studies.map((study) => [study.id, study]));
}

export function buildCogochiWorkspaceEnvelope(args: BuildCogochiWorkspaceEnvelopeArgs): CogochiWorkspaceEnvelope {
  const {
    symbol,
    timeframe,
    analyze,
    chartPayload,
    confluence = null,
    venueDivergence = null,
    liqClusters = null,
    optionsSnapshot = null,
  } = args;

  const generatedAt = Date.now();
  const snap = analyze?.snapshot;
  const entryPlan = analyze?.entryPlan;
  const flow = analyze?.flowSummary;
  const studies: StudySnapshot[] = [];

  studies.push({
    id: 'price-structure',
    title: 'PRICE STRUCTURE',
    family: 'price',
    defaultSurface: 'chart-overlay',
    compareMode: 'price-level',
    sourceRefs: [
      providerRef('binance', '/api/chart/klines', 'public', null, 'live'),
      providerRef('engine', '/api/cogochi/analyze', 'internal', null, 'derived'),
    ],
    summary: [
      metric('Price', fmtNum(analyze?.price ?? snap?.last_close), 'neutral'),
      metric('24H', fmtPct(analyze?.change24h ?? snap?.change24h), (analyze?.change24h ?? snap?.change24h ?? 0) >= 0 ? 'bull' : 'bear'),
      metric('Entry', fmtNum(entryPlan?.entry), 'neutral', `Stop ${fmtNum(entryPlan?.stop)}`),
    ],
    seriesRef: { chartKey: 'klines' },
    payload: {
      price: analyze?.price ?? snap?.last_close ?? null,
      change24h: analyze?.change24h ?? snap?.change24h ?? null,
      entry: entryPlan?.entry ?? null,
      stop: entryPlan?.stop ?? null,
      target: entryPlan?.targets?.[0]?.price ?? null,
    },
  });

  if (confluence) {
    studies.push({
      id: 'confluence',
      title: 'CONFLUENCE',
      family: 'flow',
      defaultSurface: 'right-hud',
      compareMode: 'summary',
      sourceRefs: [providerRef('engine', '/api/confluence/current', 'internal', 60_000, 'derived')],
      summary: [
        metric('Score', `${confluence.score >= 0 ? '+' : ''}${confluence.score.toFixed(1)}`, confluence.score >= 0 ? 'bull' : 'bear'),
        metric('Conf', `${Math.round(confluence.confidence * 100)}%`, 'neutral', confluence.regime),
        metric('Top', confluence.top[0]?.label ?? '—', 'neutral', confluence.top[0]?.reason),
      ],
      payload: {
        score: confluence.score,
        confidence: confluence.confidence,
        regime: confluence.regime,
        divergence: confluence.divergence,
        top: confluence.top,
      },
    });
  }

  if (snap?.funding_rate != null || chartPayload?.fundingBars?.length) {
    const funding = snap?.funding_rate != null ? snap.funding_rate * 100 : null;
    studies.push({
      id: 'funding',
      title: 'FUNDING',
      family: 'funding',
      defaultSurface: 'chart-subpane',
      compareMode: 'timeseries',
      sourceRefs: [
        providerRef('coinalyze', '/api/market/indicator-context', 'api_key', 10 * 60_000, 'poll'),
        providerRef('binance', '/api/chart/klines', 'public', null, 'live'),
      ],
      summary: [
        metric('Rate', funding != null ? fmtPct(funding, 4) : '—', funding != null ? (funding < 0 ? 'bull' : funding > 0 ? 'bear' : 'neutral') : 'neutral', flow?.funding),
        metric('Pane', chartPayload?.fundingBars?.length ?? 0, 'neutral', 'sub-pane owner'),
      ],
      seriesRef: { chartKey: 'fundingBars', registryId: 'funding_rate' },
      payload: {
        ratePct: funding,
        narrative: flow?.funding ?? null,
      },
    });
  }

  if (snap?.oi_change_1h != null || chartPayload?.oiBars?.length) {
    const oiPct = snap?.oi_change_1h != null ? snap.oi_change_1h * 100 : null;
    studies.push({
      id: 'open-interest',
      title: 'OPEN INTEREST',
      family: 'oi',
      defaultSurface: 'chart-subpane',
      compareMode: 'timeseries',
      sourceRefs: [
        providerRef('coinalyze', '/api/market/indicator-context', 'api_key', 10 * 60_000, 'poll'),
        providerRef('binance', '/api/chart/klines', 'public', null, 'live'),
      ],
      summary: [
        metric('OI 1H', oiPct != null ? fmtPct(oiPct, 1) : '—', oiPct != null ? (oiPct > 0 ? 'bull' : 'bear') : 'neutral', flow?.oi),
        metric('Pane', chartPayload?.oiBars?.length ?? 0, 'neutral', 'sub-pane owner'),
      ],
      seriesRef: { chartKey: 'oiBars', registryId: 'oi_change_1h' },
      payload: {
        oiChangePct: oiPct,
        narrative: flow?.oi ?? null,
      },
    });
  }

  if (snap?.cvd_state || chartPayload?.cvdBars?.length) {
    studies.push({
      id: 'cvd',
      title: 'CVD',
      family: 'cvd',
      defaultSurface: 'chart-subpane',
      compareMode: 'timeseries',
      sourceRefs: [
        providerRef('engine', '/api/cogochi/analyze', 'internal', null, 'derived'),
        providerRef('binance', '/api/chart/klines', 'public', null, 'live'),
      ],
      summary: [
        metric('State', snap?.cvd_state ?? '—', /positive|bull|양/i.test(snap?.cvd_state ?? '') ? 'bull' : /negative|bear|음/i.test(snap?.cvd_state ?? '') ? 'bear' : 'neutral', flow?.cvd),
        metric('Pane', chartPayload?.cvdBars?.length ?? 0, 'neutral', 'sub-pane owner'),
      ],
      seriesRef: { chartKey: 'cvdBars' },
      payload: {
        state: snap?.cvd_state ?? null,
        narrative: flow?.cvd ?? null,
      },
    });
  }

  if (venueDivergence?.oi?.length || venueDivergence?.funding?.length) {
    const leader = venueDivergence.oi
      ?.slice()
      .sort((a, b) => Math.abs(b.current) - Math.abs(a.current))[0];
    studies.push({
      id: 'venue-divergence',
      title: 'VENUE DIVERGENCE',
      family: 'venue',
      defaultSurface: 'bottom-workspace',
      compareMode: 'summary',
      sourceRefs: [providerRef('coinalyze', '/api/market/venue-divergence', 'api_key', 60_000, 'poll')],
      summary: [
        metric(
          'Leader',
          leader?.venue ?? '—',
          'neutral',
          leader ? `${leader.current >= 0 ? '+' : ''}${leader.current.toFixed(2)}` : undefined,
        ),
        metric('Venues', venueDivergence.oi?.length ?? 0, 'neutral', 'cross-exchange spread'),
      ],
      payload: venueDivergence as unknown as Record<string, unknown>,
    });
  }

  if (liqClusters?.cells?.length) {
    const maxCell = liqClusters.cells.reduce<typeof liqClusters.cells[number] | null>((acc, cell) => {
      if (!acc || cell.intensity > acc.intensity) return cell;
      return acc;
    }, null);
    studies.push({
      id: 'liquidity',
      title: 'LIQUIDITY',
      family: 'liquidity',
      defaultSurface: 'bottom-workspace',
      compareMode: 'price-level',
      sourceRefs: [providerRef('derived', '/api/market/liq-clusters', 'internal', 60_000, 'derived')],
      summary: [
        metric('Cells', liqClusters.cells.length, 'neutral'),
        metric('Peak', maxCell ? fmtNum(maxCell.priceBucket) : '—', 'warn', maxCell ? `${Math.round(maxCell.intensity).toLocaleString()} intensity` : undefined),
      ],
      seriesRef: { chartKey: 'liqBars', registryId: 'liq_heatmap' },
      payload: {
        window: liqClusters.window,
        maxPrice: maxCell?.priceBucket ?? null,
        maxIntensity: maxCell?.intensity ?? null,
      },
    });
  }

  if (optionsSnapshot) {
    studies.push({
      id: 'options',
      title: 'OPTIONS',
      family: 'options',
      defaultSurface: 'bottom-workspace',
      compareMode: 'summary',
      sourceRefs: [providerRef('deribit', '/api/market/options-snapshot', 'public', 5 * 60_000, 'poll')],
      summary: [
        metric('PCR', optionsSnapshot.putCallRatioOi.toFixed(2), optionsSnapshot.putCallRatioOi > 1 ? 'bear' : 'bull'),
        metric('Skew', optionsSnapshot.skew25d.toFixed(1), optionsSnapshot.skew25d > 0 ? 'bear' : 'bull'),
        metric('Gamma', fmtNum(optionsSnapshot.gamma?.pinLevel ?? null), 'neutral', optionsSnapshot.gamma?.pinDirection ?? undefined),
      ],
      payload: {
        pcr: optionsSnapshot.putCallRatioOi,
        skew25d: optionsSnapshot.skew25d,
        pinLevel: optionsSnapshot.gamma?.pinLevel ?? null,
        pinDistancePct: optionsSnapshot.gamma?.pinDistancePct ?? null,
      },
    });
  }

  if (entryPlan) {
    studies.push({
      id: 'execution',
      title: 'EXECUTION',
      family: 'execution',
      defaultSurface: 'bottom-workspace',
      compareMode: 'execution',
      sourceRefs: [providerRef('engine', '/api/cogochi/analyze', 'internal', null, 'derived')],
      summary: [
        metric('Entry', fmtNum(entryPlan.entry), 'neutral'),
        metric('Stop', fmtNum(entryPlan.stop), 'bear', percentDiff(entryPlan.entry, entryPlan.stop)),
        metric('Target', fmtNum(entryPlan.targets?.[0]?.price ?? null), 'bull', percentDiff(entryPlan.entry, entryPlan.targets?.[0]?.price ?? null)),
        metric('R:R', entryPlan.riskReward != null ? `${entryPlan.riskReward.toFixed(1)}x` : '—', (entryPlan.riskReward ?? 0) >= 2 ? 'bull' : 'warn'),
      ],
      payload: {
        entry: entryPlan.entry ?? null,
        stop: entryPlan.stop ?? null,
        target: entryPlan.targets?.[0]?.price ?? null,
        rr: entryPlan.riskReward ?? null,
        confidencePct: entryPlan.confidencePct ?? null,
      },
    });
  }

  const sections: WorkspaceSection[] = [
    { id: 'summary-hud', title: 'Summary HUD', kind: 'summary', studyIds: studies.filter((study) => ['confluence', 'funding', 'venue-divergence', 'execution'].includes(study.id)).map((study) => study.id), collapsible: false },
    { id: 'detail-workspace', title: 'Detail Workspace', kind: 'detail', studyIds: studies.filter((study) => ['price-structure', 'funding', 'open-interest', 'cvd', 'options', 'venue-divergence', 'liquidity', 'execution'].includes(study.id)).map((study) => study.id), collapsible: true },
    { id: 'evidence-log', title: 'Evidence Log', kind: 'evidence', studyIds: studies.filter((study) => ['confluence', 'funding', 'open-interest', 'venue-divergence', 'liquidity'].includes(study.id)).map((study) => study.id), collapsible: true },
    { id: 'execution-board', title: 'Execution Board', kind: 'execution', studyIds: studies.filter((study) => ['execution', 'liquidity'].includes(study.id)).map((study) => study.id), collapsible: false },
  ];

  const warnings = [
    snap?.regime && snap.regime !== 'BULL' ? `레짐 경고: ${snap.regime}` : null,
    analyze?.riskPlan?.invalidation ? `무효화 조건: ${analyze.riskPlan.invalidation}` : null,
    snap?.funding_rate != null && snap.funding_rate > 0 ? `펀딩 부담: ${fmtPct(snap.funding_rate * 100, 4)}` : null,
  ].filter((item): item is string => Boolean(item));

  const aiContext: AIContextPack = {
    symbol,
    timeframe,
    selectedStudyIds: sections.find((section) => section.id === 'detail-workspace')?.studyIds ?? [],
    compareStudyIds: ['funding', 'open-interest', 'cvd', 'venue-divergence'].filter((id) => studies.some((study) => study.id === id)),
    thesis:
      analyze?.riskPlan?.bias ??
      analyze?.ensemble?.reason ??
      confluence?.top[0]?.reason ??
      undefined,
    warnings,
  };

  return {
    symbol,
    timeframe,
    generatedAt,
    studies,
    sections,
    aiContext,
  };
}
