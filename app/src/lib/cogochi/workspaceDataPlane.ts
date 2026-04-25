import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';
import type {
  AIContextPack,
  CogochiWorkspaceEnvelope,
  DexOverviewPayload,
  OnchainBackdropPayload,
  ProviderRef,
  StudyMetric,
  StudySnapshot,
  StudyTrust,
  WorkspaceSection,
} from '$lib/contracts/cogochiDataPlane';
import type { ConfluenceResult } from '$lib/confluence/types';
import type {
  FundingFlipPayload,
  IndicatorContextPayload,
  LiqClusterPayload,
  OptionsSnapshotPayload,
  RvConePayload,
  SsrPayload,
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
  indicatorContext?: IndicatorContextPayload | null;
  ssr?: SsrPayload | null;
  rvCone?: RvConePayload | null;
  fundingFlip?: FundingFlipPayload | null;
  onchainBackdrop?: OnchainBackdropPayload | null;
  dexOverview?: DexOverviewPayload | null;
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

function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
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

function trust(
  tier: StudyTrust['tier'],
  owner: StudyTrust['owner'],
  rationale: string,
): StudyTrust {
  return { tier, owner, rationale };
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
    indicatorContext = null,
    ssr = null,
    rvCone = null,
    fundingFlip = null,
    onchainBackdrop = null,
    dexOverview = null,
  } = args;

  const generatedAt = Date.now();
  const snap = analyze?.snapshot;
  const entryPlan = analyze?.entryPlan;
  const flow = analyze?.flowSummary;
  const studies: StudySnapshot[] = [];
  const sortStudyIds = (ids: string[]) =>
    ids
      .map((id) => studies.find((study) => study.id === id))
      .filter((study): study is StudySnapshot => Boolean(study))
      .sort((a, b) => a.displayPriority - b.displayPriority)
      .map((study) => study.id);

  studies.push({
    id: 'price-structure',
    title: 'PRICE STRUCTURE',
    family: 'price',
    defaultSurface: 'chart-overlay',
    compareMode: 'price-level',
    displayPriority: 0,
    freshnessMs: null,
    trust: trust('core', 'provider-direct', 'Price candles are the primary market truth for chart navigation.'),
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
      displayPriority: 10,
      freshnessMs: 60_000,
      trust: trust('verified', 'engine', 'Confluence is engine-derived and aggregates multiple upstream studies.'),
      sourceRefs: [providerRef('engine', '/api/confluence/current', 'internal', 60_000, 'derived')],
      summary: [
        metric('Score', `${confluence.score >= 0 ? '+' : ''}${confluence.score.toFixed(1)}`, confluence.score >= 0 ? 'bull' : 'bear'),
        metric('Conf', `${Math.round(confluence.confidence * 100)}%`, 'neutral', confluence.regime),
        metric('Top', confluence.top[0]?.label ?? '—', 'neutral', confluence.top[0]?.reason),
      ],
      methodology: {
        label: 'Internal confluence score',
        formula: 'weighted pillar aggregation across pattern, venue divergence, options, liquidity and regime',
      },
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
      displayPriority: 20,
      freshnessMs: 10 * 60_000,
      trust: trust('verified', 'app-route', 'Funding is sourced from provider history and normalized into a chart sub-pane.'),
      sourceRefs: [
        providerRef('coinalyze', '/api/market/indicator-context', 'api_key', 10 * 60_000, 'poll'),
        providerRef('binance', '/api/chart/klines', 'public', null, 'live'),
      ],
      summary: [
        metric(
          'Rate',
          funding != null ? fmtPct(funding, 4) : '—',
          funding != null ? (funding < 0 ? 'bull' : funding > 0 ? 'bear' : 'neutral') : 'neutral',
          indicatorContext?.context?.funding_rate?.percentile != null
            ? `p${Math.round(indicatorContext.context.funding_rate.percentile)} · ${flow?.funding ?? 'normalized'}`
            : flow?.funding,
        ),
        metric('Pane', chartPayload?.fundingBars?.length ?? 0, 'neutral', 'sub-pane owner'),
      ],
      methodology: {
        label: 'Funding percentile',
        formula: 'current funding rate vs rolling distribution from Binance/Coinalyze history',
      },
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
      displayPriority: 22,
      freshnessMs: 10 * 60_000,
      trust: trust('verified', 'app-route', 'Open interest is sourced from exchange history and rendered as the canonical OI sub-pane.'),
      sourceRefs: [
        providerRef('coinalyze', '/api/market/indicator-context', 'api_key', 10 * 60_000, 'poll'),
        providerRef('binance', '/api/chart/klines', 'public', null, 'live'),
      ],
      summary: [
        metric(
          'OI 1H',
          oiPct != null ? fmtPct(oiPct, 1) : '—',
          oiPct != null ? (oiPct > 0 ? 'bull' : 'bear') : 'neutral',
          indicatorContext?.context?.oi_change_1h?.percentile != null
            ? `p${Math.round(indicatorContext.context.oi_change_1h.percentile)} · ${flow?.oi ?? 'normalized'}`
            : flow?.oi,
        ),
        metric('Pane', chartPayload?.oiBars?.length ?? 0, 'neutral', 'sub-pane owner'),
      ],
      methodology: {
        label: 'Open interest delta percentile',
        formula: 'current 1h OI delta vs rolling 30d distribution from exchange history',
      },
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
      displayPriority: 24,
      freshnessMs: null,
      trust: trust('verified', 'engine', 'CVD state is derived from the canonical chart feed and engine-side flow interpretation.'),
      sourceRefs: [
        providerRef('engine', '/api/cogochi/analyze', 'internal', null, 'derived'),
        providerRef('binance', '/api/chart/klines', 'public', null, 'live'),
      ],
      summary: [
        metric('State', snap?.cvd_state ?? '—', /positive|bull|양/i.test(snap?.cvd_state ?? '') ? 'bull' : /negative|bear|음/i.test(snap?.cvd_state ?? '') ? 'bear' : 'neutral', flow?.cvd),
        metric('Pane', chartPayload?.cvdBars?.length ?? 0, 'neutral', 'sub-pane owner'),
      ],
      methodology: {
        label: 'Cumulative volume delta state',
        formula: 'signed cumulative aggressive buying vs selling pressure over the active chart window',
      },
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
      displayPriority: 42,
      freshnessMs: 60_000,
      trust: trust('verified', 'app-route', 'Venue divergence compares normalized venue readings from the same polling window.'),
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
      methodology: {
        label: 'Cross-venue spread',
        formula: 'normalized OI and funding differences across venues over the same snapshot time',
      },
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
      displayPriority: 50,
      freshnessMs: 60_000,
      trust: trust('verified', 'derived', 'Liquidity cells are derived from the same canonical liquidation bars shown on chart.'),
      sourceRefs: [providerRef('derived', '/api/market/liq-clusters', 'internal', 60_000, 'derived')],
      summary: [
        metric('Cells', liqClusters.cells.length, 'neutral'),
        metric('Peak', maxCell ? fmtNum(maxCell.priceBucket) : '—', 'warn', maxCell ? `${Math.round(maxCell.intensity).toLocaleString()} intensity` : undefined),
      ],
      methodology: {
        label: 'Liquidity cluster heatmap',
        formula: 'price buckets ranked by aggregated long/short liquidation intensity over the selected window',
      },
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
      displayPriority: 40,
      freshnessMs: 5 * 60_000,
      trust: trust('verified', 'app-route', 'Options snapshot is read from Deribit and normalized into a compact context study.'),
      sourceRefs: [providerRef('deribit', '/api/market/options-snapshot', 'public', 5 * 60_000, 'poll')],
      summary: [
        metric('PCR', optionsSnapshot.putCallRatioOi.toFixed(2), optionsSnapshot.putCallRatioOi > 1 ? 'bear' : 'bull'),
        metric('Skew', optionsSnapshot.skew25d.toFixed(1), optionsSnapshot.skew25d > 0 ? 'bear' : 'bull'),
        metric('Gamma', fmtNum(optionsSnapshot.gamma?.pinLevel ?? null), 'neutral', optionsSnapshot.gamma?.pinDirection ?? undefined),
      ],
      methodology: {
        label: 'Deribit options snapshot',
        formula: 'put/call OI, 25d skew and gamma pin derived from active listed options',
      },
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
      displayPriority: 60,
      freshnessMs: null,
      trust: trust('verified', 'engine', 'Execution plan is generated by the engine from the active thesis and risk plan.'),
      sourceRefs: [providerRef('engine', '/api/cogochi/analyze', 'internal', null, 'derived')],
      summary: [
        metric('Entry', fmtNum(entryPlan.entry), 'neutral'),
        metric('Stop', fmtNum(entryPlan.stop), 'bear', percentDiff(entryPlan.entry, entryPlan.stop)),
        metric('Target', fmtNum(entryPlan.targets?.[0]?.price ?? null), 'bull', percentDiff(entryPlan.entry, entryPlan.targets?.[0]?.price ?? null)),
        metric('R:R', entryPlan.riskReward != null ? `${entryPlan.riskReward.toFixed(1)}x` : '—', (entryPlan.riskReward ?? 0) >= 2 ? 'bull' : 'warn'),
      ],
      methodology: {
        label: 'Engine execution plan',
        formula: 'entry/stop/target/risk-reward computed from active thesis and invalidation rules',
      },
      payload: {
        entry: entryPlan.entry ?? null,
        stop: entryPlan.stop ?? null,
        target: entryPlan.targets?.[0]?.price ?? null,
        rr: entryPlan.riskReward ?? null,
        confidencePct: entryPlan.confidencePct ?? null,
      },
    });
  }

  if (ssr) {
    studies.push({
      id: 'stablecoin-liquidity',
      title: 'STABLECOIN LIQUIDITY',
      family: 'onchain',
      defaultSurface: 'bottom-workspace',
      compareMode: 'summary',
      displayPriority: 30,
      freshnessMs: 30 * 60_000,
      trust: trust('verified', 'app-route', 'SSR is computed from free stablecoin supply and BTC market cap history using the standard CryptoQuant definition.'),
      sourceRefs: [
        providerRef('defillama', '/api/market/stablecoin-ssr', 'public', 30 * 60_000, 'poll'),
        providerRef('coingecko', '/api/market/stablecoin-ssr', 'public', 30 * 60_000, 'poll'),
      ],
      summary: [
        metric('SSR', ssr.current.toFixed(2), ssr.percentile <= 25 ? 'bull' : ssr.percentile >= 75 ? 'bear' : 'neutral'),
        metric('Percentile', `p${Math.round(ssr.percentile)}`, 'neutral', ssr.regime.replaceAll('_', ' ')),
      ],
      methodology: {
        label: 'CryptoQuant SSR baseline',
        formula: 'BTC market cap / total stablecoin market cap',
        referenceUrl: 'https://userguide.cryptoquant.com/cryptoquant-metrics/stablecoin/stablecoin-supply-ratio',
      },
      payload: {
        current: ssr.current,
        percentile: ssr.percentile,
        regime: ssr.regime,
      },
    });
  }

  if (rvCone && rvCone.current['30'] != null) {
    studies.push({
      id: 'realized-volatility',
      title: 'REALIZED VOLATILITY',
      family: 'volatility',
      defaultSurface: 'bottom-workspace',
      compareMode: 'summary',
      displayPriority: 34,
      freshnessMs: 60 * 60_000,
      trust: trust('verified', 'app-route', 'RV cone is calculated from Binance daily closes using rolling annualized log-return volatility.'),
      sourceRefs: [providerRef('binance', '/api/market/rv-cone', 'public', 60 * 60_000, 'poll')],
      summary: [
        metric('30D RV', fmtPct((rvCone.current['30'] ?? 0) * 100, 1), 'neutral'),
        metric('Percentile', `p${Math.round(rvCone.percentile['30'] ?? 50)}`, 'neutral'),
        metric('7D RV', fmtPct((rvCone.current['7'] ?? 0) * 100, 1), 'neutral'),
      ],
      methodology: {
        label: 'Annualized realized volatility cone',
        formula: 'stdev(log returns) × sqrt(365), evaluated across rolling 7/14/30/60/90 day windows',
      },
      payload: {
        current: rvCone.current,
        percentile: rvCone.percentile,
        cone: rvCone.cone,
      },
    });
  }

  if (fundingFlip) {
    studies.push({
      id: 'funding-regime',
      title: 'FUNDING REGIME',
      family: 'funding',
      defaultSurface: 'bottom-workspace',
      compareMode: 'summary',
      displayPriority: 26,
      freshnessMs: 10 * 60_000,
      trust: trust('verified', 'app-route', 'Funding flip clock is read from Binance funding history and tracks sign persistence after the last flip.'),
      sourceRefs: [providerRef('binance', '/api/market/funding-flip', 'public', 10 * 60_000, 'poll')],
      summary: [
        metric('State', fundingFlip.direction.replaceAll('_', ' '), fundingFlip.currentRate < 0 ? 'bull' : fundingFlip.currentRate > 0 ? 'bear' : 'neutral'),
        metric('Persist', `${Math.round(fundingFlip.persistedHours)}h`, 'neutral', `${fundingFlip.consecutiveIntervals} intervals`),
        metric('Rate', fmtPct(fundingFlip.currentRate * 100, 4), 'neutral'),
      ],
      methodology: {
        label: 'Funding flip clock',
        formula: 'time elapsed and intervals persisted since the sign of funding last changed',
      },
      payload: {
        currentRate: fundingFlip.currentRate,
        previousRate: fundingFlip.previousRate,
        persistedHours: fundingFlip.persistedHours,
        direction: fundingFlip.direction,
        consecutiveIntervals: fundingFlip.consecutiveIntervals,
      },
    });
  }

  if (onchainBackdrop?.metrics || onchainBackdrop?.exchangeReserve || onchainBackdrop?.whale) {
    studies.push({
      id: 'onchain-cycle',
      title: 'ON-CHAIN CYCLE',
      family: 'onchain',
      defaultSurface: 'bottom-workspace',
      compareMode: 'summary',
      displayPriority: 36,
      freshnessMs: 5 * 60_000,
      trust: trust(
        onchainBackdrop.source === 'coinmetrics' ? 'verified' : onchainBackdrop.source === 'cryptoquant' ? 'verified' : 'deferred',
        'app-route',
        onchainBackdrop.source === 'coinmetrics'
          ? 'CoinMetrics community metrics provide a free on-chain cycle proxy; NUPL may be approximated from MVRV when realized cap is unavailable.'
          : 'Paid or unavailable provider data is routed through the on-chain proxy when configured.',
      ),
      sourceRefs: [
        providerRef(onchainBackdrop.source === 'cryptoquant' ? 'cryptoquant' : 'coinmetrics', '/api/onchain/cryptoquant', onchainBackdrop.source === 'cryptoquant' ? 'api_key' : 'public', 5 * 60_000, 'poll'),
      ],
      summary: [
        metric('MVRV', onchainBackdrop.metrics?.mvrv != null ? onchainBackdrop.metrics.mvrv.toFixed(2) : '—', (onchainBackdrop.metrics?.mvrv ?? 0) < 1 ? 'bull' : (onchainBackdrop.metrics?.mvrv ?? 0) > 3.5 ? 'bear' : 'neutral'),
        metric('NUPL', onchainBackdrop.metrics?.nupl != null ? onchainBackdrop.metrics.nupl.toFixed(3) : '—', (onchainBackdrop.metrics?.nupl ?? 0) < 0 ? 'bull' : (onchainBackdrop.metrics?.nupl ?? 0) > 0.75 ? 'bear' : 'neutral'),
        metric('Netflow', fmtUsd(onchainBackdrop.exchangeReserve?.netflow24h), (onchainBackdrop.exchangeReserve?.netflow24h ?? 0) < 0 ? 'bull' : (onchainBackdrop.exchangeReserve?.netflow24h ?? 0) > 0 ? 'bear' : 'neutral'),
      ],
      methodology: {
        label: onchainBackdrop.source === 'coinmetrics' ? 'CoinMetrics proxy baseline' : 'On-chain provider baseline',
        formula: onchainBackdrop.source === 'coinmetrics'
          ? 'MVRV direct from CoinMetrics community API, NUPL approximated as 1 - (1 / MVRV) when realized cap is unavailable'
          : 'Provider-supplied market value vs realized value / profit-loss metrics',
        referenceUrl: 'https://docs.glassnode.com/guides-and-tutorials/metric-guides/mvrv/mvrv-ratio',
      },
      payload: onchainBackdrop as unknown as Record<string, unknown>,
    });
  }

  if (dexOverview?.topPairs?.length) {
    const topPair = dexOverview.topPairs[0];
    const topChain = dexOverview.chainBreakdown[0];
    studies.push({
      id: 'dex-liquidity',
      title: 'DEX LIQUIDITY',
      family: 'dex',
      defaultSurface: 'bottom-workspace',
      compareMode: 'summary',
      displayPriority: 38,
      freshnessMs: 60_000,
      trust: trust(
        dexOverview.coverage.mode === 'exact' ? 'verified' : 'experimental',
        'app-route',
        dexOverview.coverage.mode === 'exact'
          ? 'DEX liquidity is aggregated from exact symbol matches returned by DexScreener.'
          : 'DEX liquidity uses a wrapped/proxy symbol mapping and should be read as a market backdrop, not a perfect token identity match.',
      ),
      sourceRefs: [
        providerRef('dexscreener', '/api/market/dex/overview', 'public', 60_000, 'poll'),
        providerRef('defillama', '/api/market/dex/overview', 'public', 60_000, 'poll'),
      ],
      summary: [
        metric('24H Vol', fmtUsd(dexOverview.volume24hUsd), 'neutral'),
        metric('Liquidity', fmtUsd(dexOverview.liquidityUsd), 'neutral'),
        metric(
          'Vol/Liq',
          dexOverview.volumeLiquidityRatio != null ? `${dexOverview.volumeLiquidityRatio.toFixed(2)}x` : '—',
          dexOverview.volumeLiquidityRatio != null
            ? dexOverview.volumeLiquidityRatio > 1 ? 'bull' : dexOverview.volumeLiquidityRatio < 0.35 ? 'warn' : 'neutral'
            : 'neutral',
          dexOverview.avgTradeSizeUsd != null ? `avg ${fmtUsd(dexOverview.avgTradeSizeUsd)}` : undefined,
        ),
        metric(
          'Top Pair',
          topPair?.label ?? '—',
          'neutral',
          topPair ? `${topPair.dexId} · ${fmtUsd(topPair.volume24hUsd)}` : dexOverview.coverage.note,
        ),
        metric(
          'Chain TVL',
          fmtUsd(topChain?.chainTvlUsd),
          'neutral',
          topChain ? `${topChain.chainLabel} · ${fmtPct(topChain.chainTvlChange1dPct)} · liq ${fmtPct(topChain.liquiditySharePct)}` : undefined,
        ),
      ],
      methodology: {
        label: 'DexScreener + DefiLlama backdrop',
        formula: 'aggregate volume/liquidity/tx count across the top exact or proxy-mapped DEX pairs for the active symbol, then contextualize by chain TVL from DefiLlama',
      },
      payload: dexOverview as unknown as Record<string, unknown>,
    });
  }

  if (onchainBackdrop?.whale) {
    studies.push({
      id: 'dex-whale-flow',
      title: 'DEX WHALE FLOW',
      family: 'dex',
      defaultSurface: 'bottom-workspace',
      compareMode: 'summary',
      displayPriority: 44,
      freshnessMs: 5 * 60_000,
      trust: trust(
        onchainBackdrop.whale.coverage === 'cryptoquant' ? 'verified' : 'experimental',
        'app-route',
        onchainBackdrop.whale.coverage === 'cryptoquant'
          ? 'Whale flow is sourced from the provider whale dataset.'
          : 'Whale flow is inferred from large GeckoTerminal DEX trades in top liquidity pools and is therefore partial coverage.',
      ),
      sourceRefs: [
        providerRef(
          onchainBackdrop.whale.coverage === 'cryptoquant' ? 'cryptoquant' : 'geckoterminal',
          '/api/onchain/cryptoquant',
          onchainBackdrop.whale.coverage === 'cryptoquant' ? 'api_key' : 'public',
          5 * 60_000,
          'poll',
        ),
      ],
      summary: [
        metric('Whales', onchainBackdrop.whale.whaleCount ?? '—', 'neutral'),
        metric('Netflow', fmtUsd(onchainBackdrop.whale.whaleNetflow), (onchainBackdrop.whale.whaleNetflow ?? 0) < 0 ? 'bull' : (onchainBackdrop.whale.whaleNetflow ?? 0) > 0 ? 'bear' : 'neutral'),
        metric('Ratio', onchainBackdrop.whale.exchangeWhaleRatio != null ? fmtPct(onchainBackdrop.whale.exchangeWhaleRatio * 100, 1) : '—', 'neutral'),
      ],
      methodology: {
        label: onchainBackdrop.whale.coverage === 'cryptoquant' ? 'Provider whale dataset' : 'GeckoTerminal top-pool whale proxy',
        formula: onchainBackdrop.whale.coverage === 'cryptoquant'
          ? 'provider whale count / netflow / exchange whale ratio'
          : 'large DEX trades (>= threshold) aggregated across monitored high-liquidity pools',
      },
      payload: onchainBackdrop.whale as unknown as Record<string, unknown>,
    });
  }

  const sections: WorkspaceSection[] = [
    { id: 'summary-hud', title: 'Summary HUD', kind: 'summary', studyIds: sortStudyIds(['confluence', 'funding', 'onchain-cycle', 'dex-liquidity', 'execution']), collapsible: false },
    { id: 'detail-workspace', title: 'Detail Workspace', kind: 'detail', studyIds: sortStudyIds(['price-structure', 'funding', 'funding-regime', 'open-interest', 'cvd', 'stablecoin-liquidity', 'realized-volatility', 'onchain-cycle', 'dex-liquidity', 'dex-whale-flow', 'options', 'venue-divergence', 'liquidity', 'execution']), collapsible: true },
    { id: 'evidence-log', title: 'Evidence Log', kind: 'evidence', studyIds: sortStudyIds(['confluence', 'funding', 'open-interest', 'stablecoin-liquidity', 'onchain-cycle', 'dex-liquidity', 'venue-divergence', 'liquidity']), collapsible: true },
    { id: 'execution-board', title: 'Execution Board', kind: 'execution', studyIds: sortStudyIds(['execution', 'liquidity']), collapsible: false },
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
    compareStudyIds: ['funding', 'open-interest', 'cvd', 'onchain-cycle', 'dex-liquidity', 'venue-divergence'].filter((id) => studies.some((study) => study.id === id)),
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
