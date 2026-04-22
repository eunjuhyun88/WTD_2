<script lang="ts">
  import ChartBoard from '../../../components/terminal/workspace/ChartBoard.svelte';
  import { fetchCogochiWorkspaceBundle } from '$lib/api/terminalBackend';
  import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';
  import type {
    CogochiWorkspaceEnvelope,
    DexOverviewPayload,
    OnchainBackdropPayload,
  } from '$lib/contracts/cogochiDataPlane';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import type { TabState } from '$lib/cogochi/shell.store';
  import { shellStore } from '$lib/cogochi/shell.store';
  import IndicatorPane from '$lib/components/indicators/IndicatorPane.svelte';
  import WorkspacePresetPicker from '$lib/cogochi/WorkspacePresetPicker.svelte';
  import IndicatorRenderer from '$lib/components/indicators/IndicatorRenderer.svelte';
  import ConfluenceBanner from '$lib/components/confluence/ConfluenceBanner.svelte';
  import ConfluencePeekChip from '$lib/components/confluence/ConfluencePeekChip.svelte';
  import DivergenceAlertToast from '$lib/components/confluence/DivergenceAlertToast.svelte';
  import type { ConfluenceResult } from '$lib/confluence/types';
  import type { GammaPinData } from '../../../components/terminal/chart/primitives/GammaPinPrimitive';
  import { INDICATOR_REGISTRY } from '$lib/indicators/registry';
  import {
    buildIndicatorValues,
    type VenueDivergencePayload,
    type LiqClusterPayload,
    type IndicatorContextPayload,
    type SsrPayload,
    type RvConePayload,
    type FundingFlipPayload,
    type OptionsSnapshotPayload,
    type FundingHistoryPayload,
  } from '$lib/indicators/adapter';
  import { chartIndicators, toggleIndicator } from '$lib/stores/chartIndicators';
  import { buildCogochiWorkspaceEnvelope, buildStudyMap } from '$lib/cogochi/workspaceDataPlane';

  interface Props {
    mode: 'trade' | 'train' | 'flywheel';
    tabState: TabState;
    updateTabState: (updater: (ts: TabState) => TabState) => void;
    symbol?: string;
    timeframe?: string;
    mobileView?: 'chart' | 'analyze' | 'scan' | 'judge';
    setMobileView?: (v: 'chart' | 'analyze' | 'scan' | 'judge') => void;
    setMobileSymbol?: (sym: string) => void;
  }

  let { mode, tabState, updateTabState, symbol = 'BTCUSDT', timeframe = '4h', mobileView, setMobileView, setMobileSymbol }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let dragging = $state(false);
  // Chart indicator toggles — backed by chartIndicators store (persisted, also LLM-controllable)
  const showOI      = $derived($chartIndicators.oi);
  const showFunding = $derived($chartIndicators.derivatives);
  const showCVD     = $derived($chartIndicators.cvd);

  // ── Live chart data ────────────────────────────────────────────────────────
  // chartPayload is only for ChartBoard's initialData; ChartBoard owns live updates via DataFeed.
  // analyzeData is refreshed on candle close via ChartBoard's onCandleClose callback.
  let chartPayload = $state<ChartSeriesPayload | null>(null);
  let analyzeData = $state<AnalyzeEnvelope | null>(null);
  let workspaceEnvelopeState = $state<CogochiWorkspaceEnvelope | null>(null);
  let chartLoading = $state(false);
  let lastCandleTime: number | null = null; // plain ref — guards against duplicate onCandleClose fires

  async function refreshWorkspaceBundleFor(sym: string, tf: string, includeChart = false) {
    const bundle = await fetchCogochiWorkspaceBundle({ symbol: sym, tf, includeChart });
    if (symbol !== sym || timeframe !== tf) return;
    analyzeData = bundle.analyze ?? null;
    confluence = bundle.confluence ?? null;
    venueDivergence = bundle.venueDivergence ?? null;
    liqClusters = bundle.liqClusters ?? null;
    optionsSnapshot = bundle.optionsSnapshot ?? null;
    if (bundle.indicatorContext) indicatorContext = bundle.indicatorContext;
    if (bundle.ssr) ssr = bundle.ssr;
    if (bundle.rvCone) rvCone = bundle.rvCone;
    if (bundle.fundingFlip) fundingFlip = bundle.fundingFlip;
    onchainBackdrop = bundle.onchainBackdrop ?? null;
    dexOverview = bundle.dexOverview ?? null;
    workspaceEnvelopeState = bundle.workspaceEnvelope ?? null;
    if (includeChart) {
      chartPayload = bundle.chartPayload ?? null;
      if (bundle.chartPayload?.klines?.length) {
        lastCandleTime = bundle.chartPayload.klines[bundle.chartPayload.klines.length - 1].time;
      }
    }
  }

  // Fetch initial workspace bundle (single route for analyze/chart/summary studies)
  $effect(() => {
    const sym = symbol;
    const tf = timeframe;
    chartLoading = true;
    lastCandleTime = null;
    void refreshWorkspaceBundleFor(sym, tf, true).finally(() => {
      if (symbol === sym && timeframe === tf) chartLoading = false;
    });
  });

  // ChartBoard owns the resilient WS (DataFeed: reconnect+backoff+gap-fill+heartbeat).
  // On candle close, refresh analyze only — chart live updates are handled inside ChartBoard.
  async function handleCandleClose(bar: { time: number }) {
    if (lastCandleTime === bar.time) return; // dedup duplicate fires
    lastCandleTime = bar.time;
    await refreshWorkspaceBundleFor(symbol, timeframe, false);
  }

  // ── Pillar 3: Venue Divergence (W-0122-A) ────────────────────────────
  let venueDivergence = $state<VenueDivergencePayload | null>(null);

  // ── Pillar 1: Liquidation Clusters (W-0122-B1) ───────────────────────
  let liqClusters = $state<LiqClusterPayload | null>(null);

  // ── Rolling Percentile Context (W-0122 rolling percentile) ───────────
  // 30d distribution data: OI deltas + funding history → real percentiles.
  // 10-min cache on the server so polling is cheap.
  let indicatorContext = $state<IndicatorContextPayload | null>(null);

  async function refreshIndicatorContext() {
    try {
      const res = await fetch(`/api/market/indicator-context?symbol=${symbol}`);
      if (!res.ok) return;
      indicatorContext = (await res.json()) as IndicatorContextPayload;
    } catch { /* tolerate */ }
  }

  // ── W-0122-F Free Wins — SSR, RV Cone, Funding Flip ─────────────────
  let ssr = $state<SsrPayload | null>(null);
  let rvCone = $state<RvConePayload | null>(null);
  let fundingFlip = $state<FundingFlipPayload | null>(null);
  let onchainBackdrop = $state<OnchainBackdropPayload | null>(null);
  let dexOverview = $state<DexOverviewPayload | null>(null);

  async function refreshSsr() {
    try {
      const res = await fetch(`/api/market/stablecoin-ssr`);
      if (!res.ok) return;
      ssr = (await res.json()) as SsrPayload;
    } catch { /* tolerate */ }
  }

  async function refreshRvCone() {
    try {
      const res = await fetch(`/api/market/rv-cone?symbol=${symbol}`);
      if (!res.ok) return;
      rvCone = (await res.json()) as RvConePayload;
    } catch { /* tolerate */ }
  }

  async function refreshFundingFlip() {
    try {
      const res = await fetch(`/api/market/funding-flip?symbol=${symbol}`);
      if (!res.ok) return;
      fundingFlip = (await res.json()) as FundingFlipPayload;
    } catch { /* tolerate */ }
  }

  // ── Funding history (270 bars = ~90d of 8h intervals) → real G curve ──
  let fundingHistory = $state<FundingHistoryPayload | null>(null);

  async function refreshFundingHistory() {
    try {
      const res = await fetch(`/api/market/funding?symbol=${symbol}&limit=270`);
      if (!res.ok) return;
      const data = (await res.json()) as { symbol: string; bars: { t: number; delta: number }[] };
      fundingHistory = data;
    } catch { /* tolerate */ }
  }

  // ── Past captures (real historical setups for PAST strip) ─────────────
  interface PastCapture {
    capture_id: string;
    symbol: string;
    pattern_slug: string;
    timeframe: string;
    captured_at_ms: number;
    status: string;
  }
  let pastCaptures = $state<PastCapture[]>([]);

  async function refreshPastCaptures() {
    try {
      const res = await fetch(`/api/captures?limit=8`);
      if (!res.ok) return;
      const data = (await res.json()) as { ok: boolean; captures?: PastCapture[]; count?: number };
      if (data.ok && data.captures) pastCaptures = data.captures;
    } catch { /* tolerate */ }
  }

  // ── Pillar 2: Options snapshot (W-0122-C1) ───────────────────────────
  let optionsSnapshot = $state<OptionsSnapshotPayload | null>(null);

  // ── Confluence Engine (W-0122 master score) ──────────────────────────
  interface ConfluenceHistoryEntry { at: number; score: number; confidence: number; regime: string; divergence: boolean }

  let confluence = $state<ConfluenceResult | null>(null);
  let confluenceHistory = $state<ConfluenceHistoryEntry[]>([]);

  async function refreshConfluenceHistory() {
    try {
      const res = await fetch(`/api/confluence/history?symbol=${symbol}&limit=96`);
      if (!res.ok) return;
      const body = (await res.json()) as { entries?: ConfluenceHistoryEntry[] };
      confluenceHistory = body.entries ?? [];
    } catch { /* tolerate */ }
  }

  // Trigger on symbol change + initial mount. Polling every 60s as a safety net
  // (candle close also triggers refresh above). Indicator context polls only
  // every 5m since its server cache TTL is 10m. SSR/RV/flip are slower still.
  $effect(() => {
    void symbol;
    void timeframe;
    venueDivergence = null;
    liqClusters = null;
    indicatorContext = null;
    ssr = null;
    rvCone = null;
    fundingFlip = null;
    onchainBackdrop = null;
    dexOverview = null;
    fundingHistory = null;
    optionsSnapshot = null;
    confluence = null;
    confluenceHistory = [];
    workspaceEnvelopeState = null;
    void refreshIndicatorContext();
    void refreshSsr();
    void refreshRvCone();
    void refreshFundingFlip();
    void refreshFundingHistory();
    void refreshConfluenceHistory();
    void refreshPastCaptures();
    const fastIv = setInterval(() => {
      void refreshWorkspaceBundleFor(symbol, timeframe, false);
      void refreshConfluenceHistory(); // pull updated sparkline entries
    }, 60_000);
    const slowIv = setInterval(() => void refreshIndicatorContext(), 5 * 60_000);
    // SSR server cache is 30min, RV cone is 1h, funding-flip is 10min.
    const flipIv = setInterval(() => void refreshFundingFlip(), 5 * 60_000);
    const ssrIv = setInterval(() => void refreshSsr(), 10 * 60_000);
    const rvIv = setInterval(() => void refreshRvCone(), 30 * 60_000);
    return () => {
      clearInterval(fastIv);
      clearInterval(slowIv);
      clearInterval(flipIv);
      clearInterval(ssrIv);
      clearInterval(rvIv);
    };
  });

  // ── Indicator pipeline: analyze + side fetches → registry-keyed values ─
  const indicatorValues = $derived(buildIndicatorValues({
    analyze: analyzeData,
    venueDivergence,
    liqClusters,
    indicatorContext,
    ssr,
    rvCone,
    fundingFlip,
    fundingHistory,
    optionsSnapshot,
  }));

  const workspaceEnvelope = $derived(
    workspaceEnvelopeState ?? buildCogochiWorkspaceEnvelope({
      symbol,
      timeframe,
      analyze: analyzeData,
      chartPayload,
      confluence,
      venueDivergence,
      liqClusters,
      optionsSnapshot,
      indicatorContext,
      ssr,
      rvCone,
      fundingFlip,
      onchainBackdrop,
      dexOverview,
    })
  );

  const workspaceStudyMap = $derived.by(() => buildStudyMap(workspaceEnvelope.studies));
  const workspaceSummaryCards = $derived.by(() => {
    const summaryIds = workspaceEnvelope.sections.find((section) => section.id === 'summary-hud')?.studyIds ?? [];
    return summaryIds
      .map((id) => workspaceStudyMap[id])
      .filter((study): study is NonNullable<typeof study> => Boolean(study))
      .sort((a, b) => a.displayPriority - b.displayPriority)
      .slice(0, 4)
      .map((study) => {
        const primary = study.summary[0];
        const secondary = study.summary[1];
        return {
          label: primary?.label ?? study.title,
          value: primary?.value ?? '—',
          note:
            primary?.note ??
            (secondary
              ? `${secondary.label}${secondary.value != null ? ` ${secondary.value}` : ''}`
              : ''),
          tone: primary?.tone === 'bull' ? 'pos' : primary?.tone === 'bear' ? 'neg' : '',
        };
      });
  });

  const workspaceBackdropStudies = $derived.by(() => {
    const detailIds = workspaceEnvelope.sections.find((section) => section.id === 'detail-workspace')?.studyIds ?? [];
    const target = new Set([
      'stablecoin-liquidity',
      'realized-volatility',
      'funding-regime',
      'onchain-cycle',
      'dex-liquidity',
      'dex-whale-flow',
    ]);
    return detailIds
      .map((id) => workspaceStudyMap[id])
      .filter((study): study is NonNullable<typeof study> => Boolean(study) && target.has(study.id))
      .sort((a, b) => a.displayPriority - b.displayPriority);
  });

  function formatFreshness(ms: number | null | undefined): string {
    if (ms == null || !Number.isFinite(ms)) return 'live';
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
    return `${Math.round(ms / 3_600_000)}h`;
  }

  function formatSourceRefs(refs: Array<{ provider: string }>): string {
    return refs.map((ref) => ref.provider.toUpperCase()).join(' · ');
  }

  function formatUsdCompact(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  }

  function formatPctCompact(v: number | null | undefined, digits = 1): string {
    if (v == null || !Number.isFinite(v)) return '—';
    return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
  }

  function formatCountCompact(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return '—';
    return v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : String(Math.round(v));
  }

  function isDexOverviewPayload(payload: unknown): payload is DexOverviewPayload {
    return Boolean(
      payload &&
      typeof payload === 'object' &&
      'pairCount' in payload &&
      'topPairs' in payload &&
      Array.isArray((payload as DexOverviewPayload).topPairs)
    );
  }

  function isOnchainBackdropPayload(payload: unknown): payload is OnchainBackdropPayload {
    return Boolean(
      payload &&
      typeof payload === 'object' &&
      'asset' in payload &&
      'source' in payload &&
      'metrics' in payload
    );
  }

  const dexDetailPayload = $derived.by(() => {
    const payload = workspaceStudyMap['dex-liquidity']?.payload;
    return isDexOverviewPayload(payload) ? payload : null;
  });

  const onchainDetailPayload = $derived.by(() => {
    const payload = workspaceStudyMap['onchain-cycle']?.payload;
    return isOnchainBackdropPayload(payload) ? payload : null;
  });

  function buildStudyAIDetailLines(study: NonNullable<(typeof workspaceBackdropStudies)[number]>): string[] {
    const summary = study.summary
      .filter((row) => row.value != null && row.value !== '')
      .map((row) => `${row.label} ${row.value}${row.note ? ` · ${row.note}` : ''}`);
    const lines = [`- ${study.title}: ${summary.join(' / ') || '—'}`];

    if (study.id === 'dex-liquidity' && isDexOverviewPayload(study.payload)) {
      const dex = study.payload;
      if (dex.chainBreakdown.length) {
        lines.push(`  - Chains: ${dex.chainBreakdown.slice(0, 3).map((chain) => `${chain.chainLabel} liq ${formatUsdCompact(chain.liquidityUsd)} / TVL ${formatUsdCompact(chain.chainTvlUsd)} / vol share ${formatPctCompact(chain.volumeSharePct)}`).join(' | ')}`);
      }
      if (dex.topPairs.length) {
        lines.push(`  - Top pairs: ${dex.topPairs.slice(0, 3).map((pair) => `${pair.label} on ${pair.dexId} (${pair.chainId}) vol ${formatUsdCompact(pair.volume24hUsd)} liq ${formatUsdCompact(pair.liquidityUsd)}`).join(' | ')}`);
      }
    }

    if (study.id === 'onchain-cycle' && isOnchainBackdropPayload(study.payload)) {
      const onchain = study.payload;
      lines.push(
        `  - Cycle detail: MVRV ${onchain.metrics?.mvrv?.toFixed(2) ?? '—'} / NUPL ${onchain.metrics?.nupl?.toFixed(3) ?? '—'} / SOPR ${onchain.metrics?.sopr?.toFixed(3) ?? '—'} / netflow ${formatUsdCompact(onchain.exchangeReserve?.netflow24h)}`,
      );
    }

    lines.push(`  - Trust: ${study.trust.tier} · Sources: ${formatSourceRefs(study.sourceRefs)}${study.methodology ? ` · ${study.methodology.label}` : ''}`);
    return lines;
  }

  // Ordered list of indicators to render — driven by ShellState.visibleIndicators.
  // Gauge row: archetypes A, D, E (scalar / divergence / regime cards).
  // Venue stack: archetype F (multi-venue strips).
  const gaugePaneIds = $derived(
    $shellStore.visibleIndicators.filter(id => {
      const def = INDICATOR_REGISTRY[id];
      return def && (def.archetype === 'A' || def.archetype === 'D' || def.archetype === 'E');
    })
  );
  const venuePaneIds = $derived(
    $shellStore.visibleIndicators.filter(id => {
      const def = INDICATOR_REGISTRY[id];
      return def && def.archetype === 'F';
    })
  );
  const optionsPaneIds = ['put_call_ratio', 'options_skew_25d'] as const;

  // ── Gamma pin derived from optionsSnapshot, passed to ChartBoard ─────
  const gammaPin = $derived<GammaPinData | null>(
    optionsSnapshot?.gamma?.pinLevel != null
      ? {
          pinLevel: optionsSnapshot.gamma.pinLevel,
          direction: optionsSnapshot.gamma.pinDirection ?? null,
          distancePctLabel: optionsSnapshot.gamma.pinDistancePct != null
            ? `${optionsSnapshot.gamma.pinDistancePct >= 0 ? '+' : ''}${optionsSnapshot.gamma.pinDistancePct.toFixed(1)}%`
            : null,
        }
      : null
  );

  // Helper: open analyze view (mobile or desktop drawer) when the user clicks the peek chip.
  function openAnalyze() {
    if (mobileView !== undefined && setMobileView) {
      setMobileView('analyze');
      return;
    }
    // Desktop: open peek + switch drawer tab to analyze.
    updateTabState(s => ({ ...s, peekOpen: true, drawerTab: 'analyze' }));
  }

  function openAnalyzeAIDetail() {
    const selectedStudies = workspaceEnvelope.aiContext.selectedStudyIds
      .map((id) => workspaceStudyMap[id])
      .filter((study): study is NonNullable<typeof study> => Boolean(study));

    const userText = `${symbol} ${timeframe} analyze detail 설명해줘`;
    const assistantText = [
      `**${symbol} · ${timeframe} ANALYZE DETAIL**`,
      workspaceEnvelope.aiContext.thesis ? `- Thesis: ${workspaceEnvelope.aiContext.thesis}` : null,
      `- Selected studies: ${selectedStudies.map((study) => study.title).join(', ') || '—'}`,
      ...(workspaceEnvelope.aiContext.warnings ?? []).map((warning) => `- Warning: ${warning}`),
      '',
      '**Study Summary**',
      ...selectedStudies.flatMap((study) => buildStudyAIDetailLines(study)),
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n');

    window.dispatchEvent(new CustomEvent('cogochi:cmd', {
      detail: { id: 'open_ai_detail', userText, assistantText },
    }));
  }

  const verdictLevels = $derived(analyzeData?.entryPlan ? {
    entry: analyzeData.entryPlan.entry,
    stop: analyzeData.entryPlan.stop,
    target: analyzeData.entryPlan.targets?.[0]?.price,
  } : undefined);

  const peekOpen = $derived(tabState.peekOpen);
  const drawerTab = $derived(tabState.drawerTab);
  const peekHeight = $derived(tabState.peekHeight);
  const analyzeDetailOpen = $derived(peekOpen && drawerTab === 'analyze');
  let sidebarAnalyzeDockCollapsed = $state(false);

  // ── Scan core loop state ────────────────────────────────────────────────
  let scanState = $state<'idle' | 'scanning' | 'done'>('idle');
  let scanProgress = $state(0);
  let _scanTimer: ReturnType<typeof setInterval> | null = null;

  let _prevRange = false;
  $effect(() => {
    const active = !!tabState.rangeSelection;
    const prev = _prevRange;
    _prevRange = active;
    const scanningNow = scanState;
    Promise.resolve().then(() => {
      if (active && !prev) triggerScan();
      else if (!active && prev && scanningNow === 'scanning') cancelScan();
    });
  });

  function triggerScan() {
    if (_scanTimer) clearInterval(_scanTimer);
    scanState = 'scanning';
    scanProgress = 0;
    setDrawerTab('scan');
    setPeekOpen(true);
    _scanTimer = setInterval(() => {
      scanProgress = Math.min(scanProgress + 3 + Math.random() * 9, 94);
    }, 180);
    setTimeout(() => {
      if (_scanTimer) { clearInterval(_scanTimer); _scanTimer = null; }
      scanProgress = 100;
      scanState = 'done';
    }, 3400);
  }

  function cancelScan() {
    if (_scanTimer) { clearInterval(_scanTimer); _scanTimer = null; }
    scanState = 'idle';
    scanProgress = 0;
  }

  // ── Compact header metrics ───────────────────────────────────────────────
  const currentPrice = $derived(analyzeData?.price ?? 0);
  const fmtPrice = $derived(
    currentPrice > 0
      ? currentPrice >= 1000
        ? currentPrice.toLocaleString('en-US', { maximumFractionDigits: 1 })
        : currentPrice.toFixed(4)
      : '—'
  );
  const fmtFunding = $derived(
    analyzeData?.snapshot?.funding_rate != null
      ? `${analyzeData.snapshot.funding_rate >= 0 ? '+' : ''}${(analyzeData.snapshot.funding_rate * 100).toFixed(4)}%`
      : '—'
  );
  const fmtLS = $derived('—');

  function setPeekOpen(v: boolean) {
    updateTabState(s => ({ ...s, peekOpen: v }));
  }

  function setDrawerTab(tab: 'analyze' | 'scan' | 'judge') {
    updateTabState(s => ({ ...s, drawerTab: tab }));
  }

  function setPeekHeight(v: number) {
    const clamped = Math.max(20, Math.min(82, v));
    updateTabState(s => ({ ...s, peekHeight: clamped }));
  }

  function onResizerDown(e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    const startY = e.clientY;
    const startPct = peekHeight;
    const containerH = containerEl?.getBoundingClientRect().height || 600;

    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY;
      const dPct = (dy / containerH) * 100;
      setPeekHeight(startPct + dPct);
    };

    const onUp = () => {
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }

  // ── JUDGE state (trade_act.jsx ActPanel) ────────────────────────────────
  let judgeVerdict = $state<'agree' | 'disagree' | null>(null);
  let judgeOutcome = $state<'win' | 'loss' | 'flat' | null>(null);
  let judgeRejudged = $state<'right' | 'wrong' | null>(null);
  let judgeSubmitting = $state(false);
  let judgeSubmitResult = $state<{ saved: boolean; count: number; training_triggered: boolean } | null>(null);

  // Auto-save outcome to flywheel when user selects WIN/LOSS/FLAT
  $effect(() => {
    const outcome = judgeOutcome;
    if (!outcome) return;
    const snap = analyzeData?.snapshot;
    if (!snap) return;
    // Move state mutation out of sync effect body to avoid Svelte 5 unsafe-mutation warning
    Promise.resolve().then(() => {
      judgeSubmitting = true;
      fetch('/api/cogochi/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot: { ...snap, user_verdict: judgeVerdict },
          outcome: outcome === 'win' ? 1 : outcome === 'loss' ? 0 : -1,
          symbol,
          timeframe,
        }),
      })
        .then(r => r.json())
        .then(d => { judgeSubmitResult = d; })
        .catch(() => {})
        .finally(() => { judgeSubmitting = false; });
    });
  });

  // Keyboard shortcuts for judge verdict (Y/N)
  function handleJudgeKeydown(e: KeyboardEvent) {
    if (e.key === 'y' || e.key === 'Y') {
      judgeVerdict = 'agree';
      e.preventDefault();
    } else if (e.key === 'n' || e.key === 'N') {
      judgeVerdict = 'disagree';
      e.preventDefault();
    }
  }

  $effect(() => {
    if (typeof window === 'undefined' || mobileView !== 'judge') return;
    window.addEventListener('keydown', handleJudgeKeydown);
    return () => window.removeEventListener('keydown', handleJudgeKeydown);
  });

  // ── Slice α: focus_indicator command from AIPanel ──────────────────────────
  $effect(() => {
    if (typeof window === 'undefined') return;
    function onCmd(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.id !== 'focus_indicator') return;
      const indicatorId = detail.indicatorId as string | undefined;
      if (!indicatorId) return;
      const el = containerEl?.querySelector<HTMLElement>(`[data-indicator-id="${CSS.escape(indicatorId)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        el.classList.add('highlight');
        setTimeout(() => el.classList.remove('highlight'), 2200);
      }
    }
    window.addEventListener('cogochi:cmd', onCmd);
    return () => window.removeEventListener('cogochi:cmd', onCmd);
  });

  // ── SCAN state — live from /api/cogochi/alpha/world-model ─────────────────
  type ScanCandidate = { id: string; symbol: string; tf: string; pattern: string; phase: number; alpha: number; age: string; sim: number; dir: string };
  let scanSelected = $state('');
  let scanLoading = $state(false);
  let scanCandidates = $state<ScanCandidate[]>([]);

  const _PHASE_ORDER: Record<string, number> = { HOT: 0, COMPLETE: 1, WARM: 2, COLD: 3 };
  const _PHASE_NUM:   Record<string, number> = { COLD: 2, WARM: 3, HOT: 4, COMPLETE: 5 };
  const _PHASE_ALPHA: Record<string, number> = { HOT: 85, WARM: 65, COMPLETE: 90, COLD: 45 };
  const _PHASE_SIM:   Record<string, number> = { HOT: 0.88, WARM: 0.70, COMPLETE: 0.95, COLD: 0.50 };

  function _fmtAge(enteredAt: string | null): string {
    if (!enteredAt) return '—';
    const ms = Date.now() - new Date(enteredAt).getTime();
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function _loadAlphaWorldModel() {
    scanLoading = true;
    fetch('/api/cogochi/alpha/world-model')
      .then(r => r.json())
      .then((data: { phases?: { symbol: string; grade: string; phase: string; entered_at: string | null }[] }) => {
        const items = (data.phases ?? [])
          .filter(p => p.phase !== 'IDLE')
          .sort((a, b) => (_PHASE_ORDER[a.phase] ?? 9) - (_PHASE_ORDER[b.phase] ?? 9))
          .map(p => ({
            id: p.symbol,
            symbol: p.symbol,
            tf: '1H',
            pattern: `Alpha presurge · ${p.phase}`,
            phase: _PHASE_NUM[p.phase] ?? 2,
            alpha: Math.min(99, (_PHASE_ALPHA[p.phase] ?? 50) + (p.grade === 'A' ? 5 : 0)),
            age: _fmtAge(p.entered_at),
            sim: _PHASE_SIM[p.phase] ?? 0.50,
            dir: 'long',
          }));
        scanCandidates = items;
        if (items.length > 0 && !scanSelected) scanSelected = items[0].id;
      })
      .catch(() => {})
      .finally(() => { scanLoading = false; });
  }

  $effect(() => {
    if (typeof window === 'undefined') return;
    Promise.resolve().then(_loadAlphaWorldModel);
    const iv = setInterval(_loadAlphaWorldModel, 5 * 60 * 1000);
    return () => clearInterval(iv);
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  function _fmtNum(v: number | null | undefined): string {
    if (v == null || v === 0) return '—';
    return v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : v.toFixed(4);
  }
  function _pctDiff(a: number | undefined, b: number | undefined): string {
    if (a == null || b == null || a === 0) return '';
    const d = ((b - a) / a) * 100;
    return `${d >= 0 ? '+' : ''}${d.toFixed(2)}%`;
  }

  // ── Confidence ───────────────────────────────────────────────────────────
  const confidence = $derived(
    analyzeData?.entryPlan?.confidencePct ??
    (analyzeData?.deep?.total_score != null ? Math.abs(analyzeData.deep.total_score) * 100 : null)
  );
  const confidencePct  = $derived(confidence != null ? `${Math.round(confidence)}%` : '0%');
  const fmtConf        = $derived(confidence != null ? `${Math.round(confidence)}` : '—');
  const confidenceAlpha = $derived(confidence != null ? `α${Math.round(confidence)}` : 'α—');

  // ── Evidence items — derived from live analyze data ───────────────────
  const evidenceItems = $derived((() => {
    const snap = analyzeData?.snapshot;
    const flow = analyzeData?.flowSummary;
    if (!snap && !flow) return [
      { k: 'OI 4H',       v: '+18.2%',         note: 'real_dump 확증', pos: true  },
      { k: 'Funding',     v: '+0.018 → −0.004', note: '플립 완료',     pos: true  },
      { k: 'CVD 15m',     v: '양전환',           note: '기관 매집',     pos: true  },
      { k: '번지대',       v: '3h 12m',          note: '기준 만족',     pos: true  },
      { k: 'Higher-lows', v: '5/5 bars',         note: 'accum 무결',   pos: true  },
      { k: 'BTC regime',  v: 'RANGE',            note: 'ADX 낮음',     pos: false },
    ];
    const items: { k: string; v: string; note: string; pos: boolean }[] = [];
    if (snap?.oi_change_1h != null) {
      const oi = snap.oi_change_1h;
      items.push({ k: 'OI 1h', v: `${oi >= 0 ? '+' : ''}${(oi * 100).toFixed(1)}%`, note: flow?.oi ?? '', pos: oi > 0.02 });
    }
    if (snap?.funding_rate != null) {
      const fr = snap.funding_rate;
      items.push({ k: 'Funding', v: `${fr >= 0 ? '+' : ''}${(fr * 100).toFixed(4)}%`, note: flow?.funding ?? '', pos: fr < 0 });
    }
    if (snap?.cvd_state) {
      items.push({ k: 'CVD', v: snap.cvd_state, note: flow?.cvd ?? '', pos: /positive|양|bull/i.test(snap.cvd_state) });
    }
    if (snap?.regime) {
      items.push({ k: 'BTC 레짐', v: snap.regime, note: '', pos: snap.regime === 'BULL' });
    }
    if (snap?.vol_ratio_3 != null) {
      items.push({ k: 'Vol 3x', v: `${snap.vol_ratio_3.toFixed(2)}x`, note: '', pos: snap.vol_ratio_3 > 1.5 });
    }
    return items.length > 0 ? items : [{ k: '분석 중', v: '...', note: '', pos: true }];
  })());

  // ── Proposal — derived from entryPlan ────────────────────────────────
  const proposal = $derived((() => {
    const ep = analyzeData?.entryPlan;
    if (!ep) return [
      { label: 'ENTRY',  val: '—', hint: '', tone: '' as '' | 'neg' | 'pos' },
      { label: 'STOP',   val: '—', hint: '', tone: 'neg' as '' | 'neg' | 'pos' },
      { label: 'TARGET', val: '—', hint: '', tone: 'pos' as '' | 'neg' | 'pos' },
      { label: 'R:R',    val: '—', hint: '', tone: '' as '' | 'neg' | 'pos' },
    ];
    return [
      { label: 'ENTRY',  val: _fmtNum(ep.entry),                               hint: 'ATR level',                              tone: '' as '' | 'neg' | 'pos' },
      { label: 'STOP',   val: _fmtNum(ep.stop),                                hint: _pctDiff(ep.entry, ep.stop),              tone: 'neg' as '' | 'neg' | 'pos' },
      { label: 'TARGET', val: _fmtNum(ep.targets?.[0]?.price),                 hint: _pctDiff(ep.entry, ep.targets?.[0]?.price), tone: 'pos' as '' | 'neg' | 'pos' },
      { label: 'R:R',    val: ep.riskReward != null ? `${ep.riskReward.toFixed(1)}x` : '—', hint: '', tone: '' as '' | 'neg' | 'pos' },
    ];
  })());

  // ── Judge plan (for inline judge sections across all layouts) ─────────
  const judgePlan = $derived((() => {
    const ep = analyzeData?.entryPlan;
    return [
      { label: 'entry',  val: _fmtNum(ep?.entry),                               color: 'var(--g9)' },
      { label: 'stop',   val: _fmtNum(ep?.stop),                                color: 'var(--neg)' },
      { label: 'target', val: _fmtNum(ep?.targets?.[0]?.price),                 color: 'var(--pos)' },
      { label: 'R:R',    val: ep?.riskReward != null ? `${ep.riskReward.toFixed(1)}x` : '—', color: 'var(--g9)' },
    ];
  })());

  // ── Narrative ─────────────────────────────────────────────────────────
  const narrativeDir = $derived(
    analyzeData?.ensemble?.direction?.toLowerCase().includes('short') ||
    analyzeData?.riskPlan?.bias?.includes('bear') ? '숏' : '롱'
  );
  const narrativeBias = $derived(
    analyzeData?.riskPlan?.bias ??
    analyzeData?.ensemble?.reason ??
    analyzeData?.deep?.verdict ??
    null
  );
  const evidencePos = $derived(evidenceItems.filter(e => e.pos).length);
  const evidenceNeg = $derived(evidenceItems.filter(e => !e.pos).length);

  // ── RR bar widths ─────────────────────────────────────────────────────
  const rrLossPct = $derived((() => {
    const rr = analyzeData?.entryPlan?.riskReward ?? 4.2;
    return `${Math.round(100 / (rr + 1))}%`;
  })());
  const rrGainPct = $derived((() => {
    const rr = analyzeData?.entryPlan?.riskReward ?? 4.2;
    return `${Math.round(100 - 100 / (rr + 1))}%`;
  })());
</script>

<!-- Side-effect: push toast on divergenceStreak rising edge (≥3). No visual output. -->
<DivergenceAlertToast value={confluence} />

<div bind:this={containerEl} class="trade-mode">
  {#if mobileView !== undefined}
    <!-- ── MOBILE: chart on top, tab strip, scrollable panel ── -->
    <div class="mobile-chart-section" class:mobile-chart-fullscreen={mobileView === 'chart'} role="region" aria-label="Chart display">
      <ChartBoard
        {symbol}
        tf={timeframe}
        initialData={chartPayload ?? undefined}
        verdictLevels={verdictLevels}
        change24hPct={analyzeData?.change24h ?? null}
        contextMode="chart"
        onCandleClose={handleCandleClose}
        {gammaPin}
      />
      {#if mobileView !== 'chart'}
        <button class="chart-expand-btn" onclick={() => setMobileView?.('chart')} aria-label="차트 전체 보기">
          ⤢
        </button>
      {/if}
    </div>
    <div class="mobile-tab-strip" role="tablist" aria-label="Analysis tabs">
      {#each (['chart', 'analyze', 'scan', 'judge'] as const) as t}
        <button
          class="mts-tab"
          class:active={mobileView === t}
          onclick={() => setMobileView?.(t)}
          role="tab"
          aria-selected={mobileView === t}
          tabindex={mobileView === t ? 0 : -1}
        >
          {t === 'chart' ? '01 CHART' : t === 'analyze' ? '02 ANL' : t === 'scan' ? '03 SCAN' : '04 JUDGE'}
        </button>
      {/each}
    </div>
    {#if mobileView !== 'chart'}
    <div class="mobile-panel">
      {#if mobileView === 'analyze'}
        {#if chartLoading}
          <div class="mobile-loading">
            <div class="ml-spinner"></div>
            <span>{symbol} {timeframe} 로딩 중…</span>
          </div>
        {:else}
          <div class="narrative" role="region" aria-label="Trade bias and direction">
            <span class="bull" aria-label="Recommendation">{narrativeDir} 진입 권장 ·</span> {narrativeBias ?? '실시간 분석 대기 중'}
          </div>
          {#if confluence}
            <ConfluenceBanner value={confluence} history={confluenceHistory} compact />
          {/if}
          <IndicatorPane ids={gaugePaneIds} values={indicatorValues} title="LIVE INDICATORS" layout="row" />
          {#if indicatorValues.put_call_ratio || indicatorValues.options_skew_25d}
            <IndicatorPane ids={optionsPaneIds} values={indicatorValues} title="OPTIONS (DERIBIT)" layout="row" />
          {/if}
          <IndicatorPane ids={venuePaneIds} values={indicatorValues} title="VENUE DIVERGENCE" layout="stack" />
          {#if indicatorValues.liq_heatmap && INDICATOR_REGISTRY.liq_heatmap}
            <div class="liq-pane-wrap">
              <IndicatorRenderer def={INDICATOR_REGISTRY.liq_heatmap} value={indicatorValues.liq_heatmap} />
            </div>
          {/if}
          <div class="evidence-grid" role="list" aria-label="Evidence items">
            {#each evidenceItems as item}
              <div class="ev-chip" class:pos={item.pos} class:neg={!item.pos} role="listitem">
                <span class="ev-mark" aria-hidden="true">{item.pos ? '✓' : '✗'}</span>
                <span class="ev-key">{item.k}</span>
                <span class="ev-val">{item.v}</span>
                <span class="sr-only">{item.k}: {item.v}, {item.note}, {item.pos ? 'positive' : 'negative'}</span>
              </div>
            {/each}
          </div>
          <div class="proposal-label" style="margin-top:8px" role="heading" aria-level="2">PROPOSAL</div>
          {#if !analyzeData?.entryPlan}
            <button class="proposal-ai-cta" onclick={() => shellStore.update(s => ({...s, aiVisible: true}))}>
              <span class="pcta-icon">◆</span>
              <span class="pcta-text">AI 진입 플랜 실행 →</span>
            </button>
          {:else}
            {#each proposal as p}
              <div class="prop-cell" class:tone-pos={p.tone === 'pos'} class:tone-neg={p.tone === 'neg'}>
                <span class="prop-l">{p.label}</span><span class="prop-v">{p.val}</span><span class="prop-h">{p.hint}</span>
              </div>
            {/each}
          {/if}
        {/if}
      {:else if mobileView === 'scan'}
        {#if confluence}
          <div style="padding: 4px 0;">
            <ConfluencePeekChip value={confluence} onOpen={openAnalyze} />
          </div>
        {/if}
        {#if scanLoading && scanCandidates.length === 0}
          <div class="scan-empty">스캔 중…</div>
        {:else if scanCandidates.length === 0}
          <div class="scan-empty">활성 신호 없음</div>
        {/if}
        {#each scanCandidates as x}
          {@const sc = x.alpha >= 75 ? 'var(--pos)' : x.alpha >= 60 ? 'var(--amb)' : 'var(--g7)'}
          <button class="scan-row" class:active={scanSelected === x.id} onclick={() => {
            scanSelected = x.id;
            setMobileSymbol?.(x.symbol);
            setMobileView?.('chart');
          }}>
            <span class="sr-sym">{x.symbol.replace('USDT', '')}</span>
            <span class="sr-tf">{x.tf}</span>
            <div class="sr-bar"><div class="sr-fill" style:width="{x.sim * 100}%" style:background={sc}></div></div>
            <span class="sr-alpha" style:color={sc}>α{x.alpha}</span>
          </button>
        {/each}
      {:else if mobileView === 'judge'}
        {#if confluence}
          <ConfluenceBanner value={confluence} history={confluenceHistory} compact />
        {/if}
        <div class="judge-ctx">
          <span class="jc-sym">{symbol.replace('USDT', '')}</span>
          <span class="jc-sep">/</span>
          <span class="jc-tf">{timeframe.toUpperCase()}</span>
          <span class="jc-spacer"></span>
          {#if narrativeBias}
            <span class="jc-bias">{narrativeDir} 편향</span>
          {/if}
        </div>
        <div class="mp-section">
          <div class="mp-header" role="heading" aria-level="2">A · TRADE PLAN</div>
          <div class="lvl-row" role="region" aria-label="Trade plan levels">
            {#each judgePlan as lvl}
              <div class="lvl-cell">
                <div class="lvl-label">{lvl.label}</div>
                <div class="lvl-val" style:color={lvl.color} aria-label="{lvl.label}: {lvl.val}">{lvl.val}</div>
              </div>
            {/each}
          </div>
        </div>
        <div class="mp-section">
          <div class="mp-header" role="heading" aria-level="2">B · JUDGE NOW</div>
          <div class="judge-btns" role="group" aria-label="Verdict options">
            <button
              class="judge-btn agree"
              class:active={judgeVerdict === 'agree'}
              onclick={() => judgeVerdict = 'agree'}
              aria-pressed={judgeVerdict === 'agree'}
              title="Press Y or click to agree with the analysis"
            >
              <span class="jb-key" aria-label="Keyboard shortcut Y">Y</span>
              <div class="jb-text"><span class="jb-label">AGREE</span></div>
            </button>
            <button
              class="judge-btn disagree"
              class:active={judgeVerdict === 'disagree'}
              onclick={() => judgeVerdict = 'disagree'}
              aria-pressed={judgeVerdict === 'disagree'}
              title="Press N or click to disagree with the analysis"
            >
              <span class="jb-key" aria-label="Keyboard shortcut N">N</span>
              <div class="jb-text"><span class="jb-label">DISAGREE</span></div>
            </button>
          </div>
        </div>
        <div class="mp-section">
          <div class="mp-header" role="heading" aria-level="2">C · AFTER RESULT</div>
          <div class="outcome-row" role="group" aria-label="Trade outcome options">
            {#each [{ k: 'win', l: 'WIN', c: 'var(--pos)', bg: 'var(--pos-dd)' }, { k: 'loss', l: 'LOSS', c: 'var(--neg)', bg: 'var(--neg-dd)' }, { k: 'flat', l: 'FLAT', c: 'var(--g7)', bg: 'var(--g2)' }] as o}
              <button
                class="outcome-btn"
                class:active={judgeOutcome === o.k}
                style:--oc={o.c}
                style:--obg={o.bg}
                onclick={() => { judgeOutcome = o.k as any; }}
                aria-pressed={judgeOutcome === o.k}
                title="Mark the trade outcome as {o.l}"
              >
                {o.l}
              </button>
            {/each}
          </div>
          {#if judgeOutcome}
            <div class="outcome-save-hint">
              {#if judgeSubmitting}
                <span>저장 중…</span>
              {:else if judgeSubmitResult?.saved}
                <span style:color="var(--pos)">{judgeSubmitResult.training_triggered ? '학습 시작됨' : `저장됨 · ${judgeSubmitResult.count}건`}</span>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
    {/if}
  {:else}
  <nav class="layout-strip" aria-label="Workspace controls">
    <span class="ls-label" id="layout-group-label">WORKSPACE</span>
    <div class="ls-static" aria-live="polite">
      <span class="ls-id">C</span>
      <span class="ls-name">SIDEBAR</span>
      <span class="ls-desc">· 단일 레이아웃</span>
    </div>
    <span class="spacer"></span>
    <WorkspacePresetPicker />
    <span class="ls-hint" role="status" aria-live="polite">ANALYZE 접기 가능</span>
  </nav>

  <!-- ═══ LAYOUT C · Chart + peek bar + sidebar (merged C+D) ═══════════════ -->
  <div class="layout-c">
    <div class="chart-section lc-main">
    <div class="chart-header">
      <span class="symbol">{symbol}</span>
      <span class="timeframe">{timeframe.toUpperCase()}</span>
      <span class="pattern">Tradoor v2</span>
      <span class="hd-sep"></span>
      <!-- Live price + derivatives -->
      <span class="hd-price">{fmtPrice}</span>
      {#if analyzeData?.snapshot?.funding_rate != null}
        <span class="hd-chip" class:neg={analyzeData.snapshot.funding_rate < 0} class:pos={analyzeData.snapshot.funding_rate > 0}>
          FUND {fmtFunding}
        </span>
      {/if}
      {#if false}
        <span class="hd-chip">L/S {fmtLS}</span>
      {/if}
      <div class="ind-toggles">
          <span class="ind-label-hdr">INDICATORS</span>
        {#each [
          { id: 'oi',      label: 'OI',      get: () => showOI,      set: () => toggleIndicator('oi') },
          { id: 'funding', label: 'Fund',    get: () => showFunding, set: () => toggleIndicator('derivatives') },
          { id: 'cvd',     label: 'CVD',     get: () => showCVD,     set: () => toggleIndicator('cvd') },
        ] as tog}
          <button
            class="ind-tog"
            class:active={tog.get()}
            onclick={() => tog.set()}
          >{tog.label}</button>
        {/each}
      </div>
      <span class="spacer"></span>
      <div class="evidence-badge">
        <span class="ev-pos">{evidencePos}</span><span class="ev-sep">/</span><span class="ev-neg">{evidenceNeg}</span>
      </div>
      <div class="conf-inline">
        <div class="conf-bar"><div class="conf-fill" style:width={confidencePct}></div></div>
        <span class="conf-val">{confidenceAlpha}</span>
      </div>
    </div>
    <div class="chart-body">
      <div class="chart-live">
        <ChartBoard
          {symbol}
          tf={timeframe}
          initialData={chartPayload ?? undefined}
          verdictLevels={verdictLevels}
          change24hPct={analyzeData?.change24h ?? null}
          contextMode="chart"
          onCandleClose={handleCandleClose}
          {gammaPin}
        />
      </div>
    </div>

    <!-- PEEK bar — at bottom of chart column -->
    <div class="peek-bar" role="tablist" aria-label="Analysis tabs">
      {#each [
        { id: 'analyze', n: '02', label: 'ANALYZE', color: 'var(--brand)',  badge: 'α82', badgeColor: 'var(--amb)' },
        { id: 'scan',    n: '03', label: 'SCAN',    color: '#7aa2e0',       badge: '5',   badgeColor: '#7aa2e0' },
        { id: 'judge',   n: '04', label: 'JUDGE',   color: 'var(--amb)',    badge: 'R:R 4.2×', badgeColor: 'var(--amb)' },
      ] as tab}
        <button
          class="pb-tab"
          class:active={drawerTab === tab.id && peekOpen}
          style:--tc={tab.color}
          onclick={() => {
            if (drawerTab === tab.id) setPeekOpen(!peekOpen);
            else { setDrawerTab(tab.id as any); setPeekOpen(true); }
          }}
          role="tab"
          aria-selected={drawerTab === tab.id && peekOpen}
          aria-controls="{tab.id}-drawer"
          tabindex={drawerTab === tab.id && peekOpen ? 0 : -1}
          aria-expanded={drawerTab === tab.id && peekOpen}
        >
          <span class="pb-n">{tab.n}</span>
          <span class="pb-label">{tab.label}</span>
          <span class="pb-sep" aria-hidden="true">·</span>
          {#if tab.id === 'analyze'}
            <span class="pb-val pos">{confidenceAlpha}</span>
            <span class="pb-sep" aria-hidden="true">·</span>
            <span class="pb-txt">{narrativeDir} 진입 권장</span>
            {#if analyzeData?.flowSummary?.oi && analyzeData.flowSummary.oi !== 'n/a'}
              <span class="pb-sep" aria-hidden="true">·</span>
              <span class="pb-dim">OI {analyzeData.flowSummary.oi}</span>
            {/if}
            {#if analyzeData?.snapshot?.regime && analyzeData.snapshot.regime !== 'BULL'}
              <span class="pb-sep" aria-hidden="true">·</span>
              <span class="pb-warn">{analyzeData.snapshot.regime}⚠</span>
            {/if}
          {:else if tab.id === 'scan'}
            <span class="pb-val" style:color="#7aa2e0">{scanCandidates.length} candidates</span>
            <span class="pb-sep" aria-hidden="true">·</span>
            <span class="pb-dim">{scanCandidates.slice(0,3).map(x => `${x.symbol.replace('USDT','')} α${x.alpha}`).join(' · ')}</span>
          {:else if tab.id === 'judge'}
            <span class="pb-txt">entry <span class="pb-val">{judgePlan[0].val}</span></span>
            <span class="pb-sep" aria-hidden="true">·</span>
            <span class="pb-txt">stop <span class="pb-val neg">{judgePlan[1].val}</span></span>
            <span class="pb-sep" aria-hidden="true">·</span>
            <span class="pb-txt">R:R <span class="pb-val pos">{judgePlan[3].val}</span></span>
            <span class="pb-sep" aria-hidden="true">·</span>
            <span class="pb-txt">size <span class="pb-val">1.2%</span></span>
          {/if}
          <span class="spacer"></span>
          <span class="pb-chevron" aria-hidden="true">{(drawerTab === tab.id && peekOpen) ? '▾' : '▸'}</span>
        </button>
      {/each}
      {#if confluence}
        <div class="pb-confluence-slot" aria-hidden="false">
          <ConfluencePeekChip value={confluence} onOpen={openAnalyze} />
        </div>
      {/if}
    </div>

    <!-- PEEK overlay (scoped to chart area, sidebar stays visible) -->
    {#if peekOpen}
      <div class="peek-overlay" style:height="{peekHeight}%">
        <!-- Resize handle -->
        <div
          class="resizer"
          role="slider"
          tabindex="0"
          aria-label="Resize peek drawer"
          aria-valuemin="20"
          aria-valuemax="80"
          aria-valuenow={peekHeight}
          aria-orientation="vertical"
          onmousedown={onResizerDown}
          onkeydown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              updateTabState(s => ({ ...s, peekHeight: Math.min(80, s.peekHeight + 5) }));
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              updateTabState(s => ({ ...s, peekHeight: Math.max(20, s.peekHeight - 5) }));
            }
          }}
        >
          <div class="resizer-pill"></div>
        </div>

        <!-- Drawer header (tabs) -->
        <div class="drawer-header">
          {#each [
            { id: 'analyze', n: '02', label: 'ANALYZE', color: 'var(--brand)', desc: '가설·근거' },
            { id: 'scan', n: '03', label: 'SCAN', color: '#7aa2e0', desc: '유사 셋업' },
            { id: 'judge', n: '04', label: 'JUDGE', color: 'var(--amb)', desc: '매매·판정' },
          ] as tab}
            <button
              class="dh-tab"
              class:active={drawerTab === tab.id}
              style:--tc={tab.color}
              onclick={() => setDrawerTab(tab.id as any)}
            >
              <span class="dh-n">{tab.n}</span>
              <span class="dh-label">{tab.label}</span>
              <span class="dh-desc">· {tab.desc}</span>
            </button>
          {/each}
          <span class="spacer"></span>
          <div class="conf-inline small">
            <span class="conf-label">CONFIDENCE</span>
            <div class="conf-bar"><div class="conf-fill" style:width={confidencePct}></div></div>
            <span class="conf-val">{fmtConf}</span>
          </div>
        </div>

        <!-- Drawer content -->
        <div class="drawer-content">
          {#if drawerTab === 'analyze'}
            <div class="analyze-body">
              <div class="analyze-overview">
                {#each workspaceSummaryCards as item}
                  <div class="analyze-overview-card" class:tone-pos={item.tone === 'pos'} class:tone-neg={item.tone === 'neg'}>
                    <span class="analyze-overview-label">{item.label}</span>
                    <span class="analyze-overview-value">{item.value}</span>
                    <span class="analyze-overview-note">{item.note}</span>
                  </div>
                {/each}
              </div>
              <div class="analyze-columns">
                <!-- Left: detailed reading workspace -->
                <div class="analyze-left">
                  {#if confluence}
                    <ConfluenceBanner value={confluence} history={confluenceHistory} />
                  {/if}
                  <div class="analyze-section">
                    <div class="analyze-section-head">
                      <span class="analyze-kicker">THESIS</span>
                      <span class="analyze-section-copy">오른쪽 HUD가 아니라 실제 해석 근거를 읽는 상세 패널</span>
                    </div>
                    <div class="narrative">
                      <span class="bull">{narrativeDir} 진입 권장 ·</span>
                      {' '}{narrativeBias ?? '분석 완료'}
                      {#if analyzeData?.snapshot?.regime && analyzeData.snapshot.regime !== 'BULL'}
                        {' '}<span class="warn">{analyzeData.snapshot.regime}⚠</span>
                      {/if}
                    </div>
                  </div>
                  <div class="analyze-section">
                    <div class="analyze-section-head">
                      <span class="analyze-kicker">LIVE STACK</span>
                      <span class="analyze-section-copy">펀딩·OI·볼륨의 현재값과 스택 해석</span>
                    </div>
                    <IndicatorPane ids={gaugePaneIds} values={indicatorValues} title="LIVE" layout="row" compact />
                  </div>
                  {#if indicatorValues.put_call_ratio || indicatorValues.options_skew_25d}
                    <div class="analyze-section">
                      <div class="analyze-section-head">
                        <span class="analyze-kicker">OPTIONS</span>
                        <span class="analyze-section-copy">Deribit 스냅샷 기반 감마/스큐 컨텍스트</span>
                      </div>
                      <IndicatorPane ids={optionsPaneIds} values={indicatorValues} title="OPTIONS" layout="row" compact />
                    </div>
                  {/if}
                  <div class="analyze-section">
                    <div class="analyze-section-head">
                      <span class="analyze-kicker">VENUE DIVERGENCE</span>
                      <span class="analyze-section-copy">거래소 간 흐름 차이와 포지션 비대칭</span>
                    </div>
                    <IndicatorPane ids={venuePaneIds} values={indicatorValues} title="VENUE" layout="stack" compact />
                  </div>
                  {#if workspaceBackdropStudies.length}
                    <div class="analyze-section">
                      <div class="analyze-section-head">
                        <span class="analyze-kicker">ON-CHAIN / DEX / VOL</span>
                        <span class="analyze-section-copy">실데이터 기반 backdrop 지표와 source/trust/methodology</span>
                      </div>
                      <div class="study-grid">
                        {#each workspaceBackdropStudies as study}
                          <div class="study-card">
                            <div class="study-card-head">
                              <div>
                                <div class="study-card-title">{study.title}</div>
                                <div class="study-card-sub">{formatSourceRefs(study.sourceRefs)} · {formatFreshness(study.freshnessMs)}</div>
                              </div>
                              <span class="study-card-trust" data-tier={study.trust.tier}>{study.trust.tier}</span>
                            </div>
                            <div class="study-card-metrics">
                              {#each study.summary as row}
                                <div class="study-metric">
                                  <span class="study-metric-label">{row.label}</span>
                                  <span class="study-metric-value" class:tone-bull={row.tone === 'bull'} class:tone-bear={row.tone === 'bear'} class:tone-warn={row.tone === 'warn'}>
                                    {row.value ?? '—'}
                                  </span>
                                  {#if row.note}
                                    <span class="study-metric-note">{row.note}</span>
                                  {/if}
                                </div>
                              {/each}
                            </div>
                            {#if study.methodology}
                              <div class="study-card-method">{study.methodology.label}</div>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if dexDetailPayload}
                    <div class="analyze-section">
                      <div class="analyze-section-head">
                        <span class="analyze-kicker">DEX MARKET STRUCTURE</span>
                        <span class="analyze-section-copy">실제 top pairs, 체인 집중도, TVL backdrop 을 같은 payload로 본다</span>
                      </div>
                      <div class="dex-strip">
                        <div class="dex-strip-item">
                          <span class="dex-strip-label">TOTAL DEFI TVL</span>
                          <span class="dex-strip-value">{formatUsdCompact(dexDetailPayload.totalDefiTvlUsd)}</span>
                          <span class="dex-strip-note">{formatPctCompact(dexDetailPayload.totalDefiTvlChange24hPct)}</span>
                        </div>
                        <div class="dex-strip-item">
                          <span class="dex-strip-label">DEX SHARE</span>
                          <span class="dex-strip-value">{formatPctCompact(dexDetailPayload.topDexSharePct)}</span>
                          <span class="dex-strip-note">{dexDetailPayload.coverage.mode} coverage</span>
                        </div>
                        <div class="dex-strip-item">
                          <span class="dex-strip-label">AVG TRADE</span>
                          <span class="dex-strip-value">{formatUsdCompact(dexDetailPayload.avgTradeSizeUsd)}</span>
                          <span class="dex-strip-note">{formatCountCompact(dexDetailPayload.txns24h)} txns / 24h</span>
                        </div>
                      </div>
                      {#if dexDetailPayload.chainBreakdown.length}
                        <div class="dex-chain-grid">
                          {#each dexDetailPayload.chainBreakdown as chain}
                            <div class="dex-chain-card">
                              <div class="dex-chain-head">
                                <span class="dex-chain-name">{chain.chainLabel}</span>
                                <span class="dex-chain-share">{formatPctCompact(chain.liquiditySharePct)}</span>
                              </div>
                              <div class="dex-chain-meta">
                                <span>TVL {formatUsdCompact(chain.chainTvlUsd)}</span>
                                <span>{formatPctCompact(chain.chainTvlChange1dPct)}</span>
                              </div>
                              <div class="dex-chain-meta">
                                <span>Vol {formatUsdCompact(chain.volume24hUsd)}</span>
                                <span>Liq {formatUsdCompact(chain.liquidityUsd)}</span>
                              </div>
                            </div>
                          {/each}
                        </div>
                      {/if}
                      <div class="dex-table-wrap">
                        <table class="dex-table">
                          <thead>
                            <tr>
                              <th>Pair</th>
                              <th>DEX</th>
                              <th>Chain</th>
                              <th>24H Vol</th>
                              <th>Liq</th>
                              <th>Txns</th>
                              <th>Δ24H</th>
                            </tr>
                          </thead>
                          <tbody>
                            {#each dexDetailPayload.topPairs.slice(0, 6) as pair}
                              <tr>
                                <td>{pair.label}</td>
                                <td>{pair.dexId}</td>
                                <td>{pair.chainId}</td>
                                <td>{formatUsdCompact(pair.volume24hUsd)}</td>
                                <td>{formatUsdCompact(pair.liquidityUsd)}</td>
                                <td>{formatCountCompact(pair.txns24h)}</td>
                                <td class:tone-bull={(pair.priceChange24hPct ?? 0) >= 0} class:tone-bear={(pair.priceChange24hPct ?? 0) < 0}>
                                  {formatPctCompact(pair.priceChange24hPct)}
                                </td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  {/if}
                  {#if onchainDetailPayload}
                    <div class="analyze-section">
                      <div class="analyze-section-head">
                        <span class="analyze-kicker">ON-CHAIN CYCLE DETAIL</span>
                        <span class="analyze-section-copy">cycle proxy 의 raw metrics 를 직접 확인한다</span>
                      </div>
                      <div class="dex-chain-grid onchain-metric-grid">
                        <div class="dex-chain-card">
                          <div class="dex-chain-head">
                            <span class="dex-chain-name">NETFLOW 24H</span>
                            <span class:tone-bull={(onchainDetailPayload.exchangeReserve?.netflow24h ?? 0) < 0} class:tone-bear={(onchainDetailPayload.exchangeReserve?.netflow24h ?? 0) > 0}>
                              {formatUsdCompact(onchainDetailPayload.exchangeReserve?.netflow24h)}
                            </span>
                          </div>
                          <div class="dex-chain-meta"><span>7D change</span><span>{formatPctCompact(onchainDetailPayload.exchangeReserve?.change7dPct)}</span></div>
                        </div>
                        <div class="dex-chain-card">
                          <div class="dex-chain-head">
                            <span class="dex-chain-name">MVRV</span>
                            <span>{onchainDetailPayload.metrics?.mvrv != null ? onchainDetailPayload.metrics.mvrv.toFixed(2) : '—'}</span>
                          </div>
                          <div class="dex-chain-meta"><span>NUPL</span><span>{onchainDetailPayload.metrics?.nupl != null ? onchainDetailPayload.metrics.nupl.toFixed(3) : '—'}</span></div>
                        </div>
                        <div class="dex-chain-card">
                          <div class="dex-chain-head">
                            <span class="dex-chain-name">SOPR</span>
                            <span>{onchainDetailPayload.metrics?.sopr != null ? onchainDetailPayload.metrics.sopr.toFixed(3) : '—'}</span>
                          </div>
                          <div class="dex-chain-meta"><span>Puell</span><span>{onchainDetailPayload.metrics?.puellMultiple != null ? onchainDetailPayload.metrics.puellMultiple.toFixed(2) : '—'}</span></div>
                        </div>
                        <div class="dex-chain-card">
                          <div class="dex-chain-head">
                            <span class="dex-chain-name">WHALE</span>
                            <span>{formatCountCompact(onchainDetailPayload.whale?.whaleCount)}</span>
                          </div>
                          <div class="dex-chain-meta"><span>ratio</span><span>{onchainDetailPayload.whale?.exchangeWhaleRatio != null ? formatPctCompact(onchainDetailPayload.whale.exchangeWhaleRatio * 100) : '—'}</span></div>
                        </div>
                      </div>
                    </div>
                  {/if}
                  <div class="analyze-section">
                    <div class="analyze-section-head">
                      <span class="analyze-kicker">EVIDENCE LOG</span>
                      <span class="analyze-section-copy">판단에 사용한 근거 항목을 빠르게 확인</span>
                    </div>
                    <div class="evidence-grid">
                      {#each evidenceItems as item}
                        <div class="ev-chip" class:pos={item.pos} class:neg={!item.pos}>
                          <span class="ev-mark">{item.pos ? '✓' : '✗'}</span>
                          <span class="ev-key">{item.k}</span>
                          <span class="ev-val">{item.v}</span>
                          <span class="ev-note">{item.note}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>
                <!-- Right: execution board -->
                <div class="analyze-right">
                  <div class="analyze-sidebox">
                    <div class="analyze-section-head compact">
                      <span class="analyze-kicker">EXECUTION BOARD</span>
                      <span class="analyze-section-copy">청산 밀도와 주문 계획을 같이 본다</span>
                    </div>
                    {#if indicatorValues.liq_heatmap && INDICATOR_REGISTRY.liq_heatmap}
                      <div style="margin-bottom: 8px;">
                        <IndicatorRenderer def={INDICATOR_REGISTRY.liq_heatmap} value={indicatorValues.liq_heatmap} />
                      </div>
                    {/if}
                    <div class="proposal-label">PROPOSAL</div>
                    {#each proposal as p}
                      <div class="prop-cell" class:tone-pos={p.tone === 'pos'} class:tone-neg={p.tone === 'neg'}>
                        <span class="prop-l">{p.label}</span>
                        <span class="prop-v">{p.val}</span>
                        <span class="prop-h">{p.hint}</span>
                      </div>
                    {/each}
                  </div>
                  <div class="analyze-actions">
                    <button class="analyze-action-btn ai" type="button" onclick={openAnalyzeAIDetail}>
                      <span class="analyze-action-k">AI</span>
                      <span class="analyze-action-t">AI로 상세 해설 보기</span>
                    </button>
                    <button class="analyze-action-btn" type="button" onclick={() => setDrawerTab('judge')}>
                      <span class="analyze-action-k">04</span>
                      <span class="analyze-action-t">JUDGE로 이동</span>
                    </button>
                    <button class="analyze-action-btn" type="button" onclick={() => setDrawerTab('scan')}>
                      <span class="analyze-action-k">03</span>
                      <span class="analyze-action-t">SCAN 비교 보기</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          {:else if drawerTab === 'scan'}
            <div class="scan-panel">
              <!-- Scan header: idle / scanning / done -->
              <div class="scan-header">
                <span class="scan-step">03</span>
                {#if confluence}
                  <div style="margin-left: 8px;">
                    <ConfluencePeekChip value={confluence} onOpen={openAnalyze} />
                  </div>
                {/if}
                {#if scanState === 'scanning'}
                  <span class="scan-label scanning">SCANNING</span>
                  <span class="scan-title">{Math.round(scanProgress * 3)} / 300</span>
                  <div class="scan-prog-track">
                    <div class="scan-prog-fill" style:width="{scanProgress}%"></div>
                  </div>
                  <span class="scan-meta anim">유사 패턴 탐색 중...</span>
                {:else}
                  <span class="scan-label">SIMILAR NOW</span>
                  <span class="scan-title">{scanCandidates.length} candidates</span>
                  <span class="spacer"></span>
                  <span class="scan-meta">300 sym · 14s</span>
                  <span class="scan-sort-btn">sim ▾</span>
                {/if}
              </div>
              <!-- Scan grid: show skeleton while scanning, results when done/idle -->
              <div class="scan-grid" class:scanning={scanState === 'scanning'}>
                {#if scanState === 'scanning'}
                  {#each Array(5) as _}
                    <div class="scan-card skeleton"></div>
                  {/each}
                {:else}
                {#each scanCandidates as x}
                  {@const sc = x.alpha >= 75 ? 'var(--pos)' : x.alpha >= 60 ? 'var(--amb)' : 'var(--g7)'}
                  <div
                    class="scan-card"
                    class:active={scanSelected === x.id}
                    style:--sc={sc}
                    role="button"
                    tabindex="0"
                    onclick={() => scanSelected = x.id}
                    onkeydown={(e) => e.key === 'Enter' && (scanSelected = x.id)}
                  >
                    <div class="sc-top">
                      <span class="sc-sym">{x.symbol.replace('USDT', '')}</span>
                      <span class="sc-tf">{x.tf}</span>
                      <span class="spacer"></span>
                      <span class="sc-alpha" style:color={sc}>α{x.alpha}</span>
                      <!-- Open in new tab -->
                      <button
                        class="sc-open"
                        title="새 탭에서 열기"
                        onclick={(e) => {
                          e.stopPropagation();
                          shellStore.openTab({ kind: 'trade', title: `${x.symbol.replace('USDT','')} · ${x.tf}` });
                        }}
                      >↗</button>
                    </div>
                    <svg viewBox="0 0 180 48" preserveAspectRatio="none" class="sc-minichart">
                      {@html (() => {
                        const pts: [number,number][] = [[0,14],[8,22],[16,30],[24,38],[32,32],[40,36],[48,40],[56,44],[64,52],[72,48],[80,44],[88,42],[96,40],[104,38],[112,36],[120,34],[128,30],[136,28],[144,26],[152,22],[160,18],[168,14],[176,10],[180,8]];
                        const str = pts.map(([px,py],i) => `${i===0?'M':'L'}${px},${py+4}`).join(' ');
                        const nowX = x.phase===3?72 : x.phase===4?128 : x.phase===5?170 : 40;
                        const nowY = (pts.find(p=>p[0]>=nowX)?.[1]??30)+4;
                        return `<rect x="${nowX-8}" y="0" width="16" height="48" fill="${x.alpha>=75?'var(--pos)':x.alpha>=60?'var(--amb)':'var(--g7)'}" opacity="0.08"/><path d="${str} L180,52 L0,52 Z" fill="${x.alpha>=75?'var(--pos)':x.alpha>=60?'var(--amb)':'var(--g7)'}" opacity="0.05"/><path d="${str}" fill="none" stroke="var(--g6)" stroke-width="1"/><line x1="${nowX}" y1="0" x2="${nowX}" y2="48" stroke="${x.alpha>=75?'var(--pos)':x.alpha>=60?'var(--amb)':'var(--g7)'}" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.7"/><circle cx="${nowX}" cy="${nowY}" r="2.5" fill="${x.alpha>=75?'var(--pos)':x.alpha>=60?'var(--amb)':'var(--g7)'}"/>`;
                      })()}
                    </svg>
                    <div class="sc-sim-row">
                      <div class="sc-sim-bar"><div class="sc-sim-fill" style:width="{x.sim * 100}%" style:background={sc}></div></div>
                      <span class="sc-sim-pct">{Math.round(x.sim * 100)}%</span>
                    </div>
                    <div class="sc-pattern">{x.pattern}</div>
                    <div class="sc-age">{x.age}</div>
                  </div>
                {/each}
                {/if}
              </div>
              <div class="past-strip">
                <div class="past-header">
                  <span class="past-title">★ SAVED · {pastCaptures.length}</span>
                  <span class="spacer"></span>
                  <span class="past-hint">저장된 셋업</span>
                </div>
                <div class="past-cards">
                  {#if pastCaptures.length === 0}
                    <span class="past-empty">저장된 셋업 없음 — 차트에서 Save Setup으로 추가</span>
                  {:else}
                    {#each pastCaptures as s (s.capture_id)}
                      {@const sym = s.symbol.replace('USDT','').replace('PERP','')}
                      {@const dateStr = new Date(s.captured_at_ms).toISOString().slice(0,10)}
                      {@const slug = s.pattern_slug.replace(/-v\d+$/, '').replace(/-/g, ' ')}
                      <button class="past-card" title="{s.pattern_slug} · {s.timeframe}">
                        <span class="past-sym">{sym}</span>
                        <span class="past-pnl" style:color="var(--g6)">{dateStr}</span>
                        <span class="past-sim">{s.status === 'outcome_ready' ? '⚡' : s.status === 'verdict_ready' ? '✓' : '…'}</span>
                      </button>
                    {/each}
                  {/if}
                </div>
              </div>
            </div>
          {:else if drawerTab === 'judge'}
            <!-- trade_act.jsx ActPanel: A(Plan) + B(Judge Now) + C(After Result) -->
            <div class="act-panel">
              {#if confluence}
                <div style="padding: 6px 10px 0;">
                  <ConfluenceBanner value={confluence} history={confluenceHistory} compact />
                </div>
              {/if}
              <!-- Header -->
              <div class="act-header">
                <span class="act-step">STEP 04 · ACT & JUDGE</span>
                <span class="act-div"></span>
                <span class="act-sym">{symbol}</span>
                <span class="act-tf">{timeframe.toUpperCase()}</span>
                <span class="act-dir">LONG</span>
                <span class="act-pat">OI reversal · accumulation</span>
                <span class="spacer"></span>
                <span class="act-alpha">{confidenceAlpha}</span>
              </div>
              <div class="act-cols">
                <!-- A: Trade Plan -->
                <div class="act-col plan-col">
                  <div class="col-label">A · TRADE PLAN</div>
                  <div class="lvl-row">
                    {#each judgePlan as lvl}
                      <div class="lvl-cell">
                        <div class="lvl-label">{lvl.label}</div>
                        <div class="lvl-val" style:color={lvl.color}>{lvl.val}</div>
                      </div>
                    {/each}
                  </div>
                  <div class="rr-size-row">
                    <div class="rr-box">
                      <div class="rr-box-label">RISK:REWARD</div>
                      <div class="rr-bar">
                        <div class="rr-loss" style:width={rrLossPct}></div>
                        <div class="rr-gain" style:width={rrGainPct}></div>
                      </div>
                      <div class="rr-labels"><span class="rr-r">1R</span><span class="rr-g">{judgePlan[3].val}</span></div>
                    </div>
                    <div class="size-box">
                      <div class="size-label">SIZE · 3x lev</div>
                      <div class="size-val">1.2% <span class="size-usd">$1,200</span></div>
                    </div>
                  </div>
                  <button class="exchange-btn">OPEN IN EXCHANGE ↗</button>
                </div>

                <div class="act-divider"></div>

                <!-- B: Judge Now -->
                <div class="act-col judge-col">
                  <div class="judge-head">
                    <span class="col-label">B · JUDGE NOW</span>
                    <span class="judge-q">이 셋업, <strong>내 돈을 걸만한가?</strong></span>
                  </div>
                  <div class="judge-btns">
                    <button
                      class="judge-btn agree"
                      class:active={judgeVerdict === 'agree'}
                      onclick={() => judgeVerdict = 'agree'}
                    >
                      <span class="jb-key">Y</span>
                      <div class="jb-text"><span class="jb-label">AGREE</span><span class="jb-sub">진입</span></div>
                    </button>
                    <button
                      class="judge-btn disagree"
                      class:active={judgeVerdict === 'disagree'}
                      onclick={() => judgeVerdict = 'disagree'}
                    >
                      <span class="jb-key">N</span>
                      <div class="jb-text"><span class="jb-label">DISAGREE</span><span class="jb-sub">패스</span></div>
                    </button>
                  </div>
                  <div class="judge-tags">
                    {#each ['확증부족', 'R:R낮음', 'regime안맞음', 'FOMO', '크기초과'] as tag}
                      <span class="judge-tag">{tag}</span>
                    {/each}
                  </div>
                </div>

                <div class="act-divider"></div>

                <!-- C: After Result -->
                <div class="act-col after-col">
                  <div class="col-label">C · AFTER RESULT</div>
                  <div class="outcome-row">
                    {#each [
                      { k: 'win',  l: 'WIN',  c: 'var(--pos)', bg: 'var(--pos-dd)' },
                      { k: 'loss', l: 'LOSS', c: 'var(--neg)', bg: 'var(--neg-dd)' },
                      { k: 'flat', l: 'FLAT', c: 'var(--g7)',  bg: 'var(--g2)' },
                    ] as o}
                      <button
                        class="outcome-btn"
                        class:active={judgeOutcome === o.k}
                        style:--oc={o.c}
                        style:--obg={o.bg}
                        onclick={() => { judgeOutcome = o.k as any; judgeRejudged = null; }}
                      >{o.l}</button>
                    {/each}
                  </div>
                  {#if judgeOutcome}
                    <div class="result-row">
                      <span class="result-label">RESULT</span>
                      <span class="result-val" style:color={judgeOutcome === 'win' ? 'var(--pos)' : judgeOutcome === 'loss' ? 'var(--neg)' : 'var(--g7)'}>
                        {judgeOutcome.toUpperCase()}
                      </span>
                      <span class="spacer"></span>
                      {#if judgeSubmitting}
                        <span class="result-hint">저장 중…</span>
                      {:else if judgeSubmitResult?.saved}
                        <span class="result-hint" style:color="var(--pos)">
                          저장됨 {judgeSubmitResult.training_triggered ? '· 학습 시작' : `· ${judgeSubmitResult.count}건`}
                        </span>
                      {:else}
                        <span class="result-hint">flywheel 연결 중</span>
                      {/if}
                    </div>
                    <div class="rejudge-label">REJUDGE</div>
                    <div class="rejudge-btns">
                      <button class="rj-btn rj-pos" class:active={judgeRejudged === 'right'} onclick={() => judgeRejudged = 'right'}>
                        옳았다 <span class="rj-sub">+보강</span>
                      </button>
                      <button class="rj-btn rj-neg" class:active={judgeRejudged === 'wrong'} onclick={() => judgeRejudged = 'wrong'}>
                        틀렸다 <span class="rj-sub">뒤집기</span>
                      </button>
                    </div>
                    {#if judgeVerdict && judgeRejudged}
                      {@const consistent = (judgeVerdict === 'agree' && judgeRejudged === 'right') || (judgeVerdict === 'disagree' && judgeRejudged === 'wrong')}
                      <div class="bias-box" class:bias-good={consistent} class:bias-warn={!consistent}>
                        {#if consistent}
                          <strong>✓ 일관 판정</strong> <span>· 가중치 +0.04</span>
                        {:else}
                          <strong>⚑ 편향 감지</strong> <span>· Train 권장</span>
                        {/if}
                      </div>
                    {/if}
                  {:else}
                    <div class="after-empty">매매 결과 선택시<br>재판정 가능</div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
    </div>
    <div
      class="lc-sidebar"
      class:collapsed={sidebarAnalyzeDockCollapsed}
      role="complementary"
      aria-label={sidebarAnalyzeDockCollapsed ? 'Collapsed analyze sidebar' : 'Sidebar analysis'}
    >
      {#if sidebarAnalyzeDockCollapsed}
        <div class="lc-sidebar-rail" role="region" aria-label="Analyze dock rail">
          <button
            class="lc-rail-chip"
            type="button"
            onclick={() => (sidebarAnalyzeDockCollapsed = false)}
            aria-label="Expand analyze sidebar"
            title="ANALYZE 펼치기"
          >
            <span class="lc-rail-accent" aria-hidden="true"></span>
            <span class="lc-rail-step">02</span>
          </button>
          <button
            class="lc-rail-handle"
            type="button"
            onclick={() => (sidebarAnalyzeDockCollapsed = false)}
            aria-label="Expand analyze sidebar"
            title="ANALYZE 펼치기"
          >
            <span aria-hidden="true">◂</span>
          </button>
        </div>
      {:else}
      <div class="lcs-section">
        <div class="lcs-header">
          <div class="lcs-headline" role="heading" aria-level="2">
            <span class="lcs-step">02</span>
            <span class="lcs-title">ANALYZE</span>
            <span class="lcs-meta">{confidenceAlpha}</span>
          </div>
          <button
            class="lcs-toggle"
            type="button"
            onclick={() => (sidebarAnalyzeDockCollapsed = true)}
            aria-expanded={!sidebarAnalyzeDockCollapsed}
            aria-controls="sidebar-analyze-body"
            title="ANALYZE를 오른쪽으로 접기"
          >
            <span aria-hidden="true">▾</span>
          </button>
        </div>
        <div class="lcs-body" id="sidebar-analyze-body" role="region" aria-label="Analysis details">
          {#if confluence}
            <ConfluenceBanner value={confluence} history={confluenceHistory} compact />
          {/if}
          <div class="conf-inline small" style="margin-bottom: 6px;">
            <span class="conf-label">CONFIDENCE</span>
            <div class="conf-bar"><div class="conf-fill" style:width={confidencePct}></div></div>
            <span class="conf-val">{fmtConf}</span>
          </div>
          <div class="narrative" style="font-size: 9px; line-height: 1.6;" role="region" aria-label="Trade bias">
            <span class="bull">{narrativeDir} 권장 ·</span>
            {' '}{narrativeBias ?? '분석 완료'}
            {#if analyzeData?.snapshot?.regime && analyzeData.snapshot.regime !== 'BULL'}
              {' '}<span class="warn">{analyzeData.snapshot.regime}⚠</span>
            {/if}
          </div>
          <div class="lcs-summary-grid" role="list" aria-label="Analyze summary">
            {#each workspaceSummaryCards as item}
              <div class="lcs-summary-card" class:tone-pos={item.tone === 'pos'} class:tone-neg={item.tone === 'neg'} role="listitem">
                <span class="lcs-summary-label">{item.label}</span>
                <span class="lcs-summary-value">{item.value}</span>
                <span class="lcs-summary-note">{item.note}</span>
              </div>
            {/each}
          </div>
          <div class="lcs-mini-evidence" role="list" aria-label="Top evidence preview">
            {#each evidenceItems.slice(0, 3) as item}
              <div class="ev-chip compact" class:pos={item.pos} class:neg={!item.pos} role="listitem">
                <span class="ev-mark" aria-hidden="true">{item.pos ? '✓' : '✗'}</span>
                <span class="ev-key">{item.k}</span>
                <span class="ev-val">{item.v}</span>
              </div>
            {/each}
          </div>
          <div class="lcs-bridge">
            <div class="lcs-bridge-actions">
              <button
                class="lcs-open-detail"
                class:active={analyzeDetailOpen}
                type="button"
                onclick={openAnalyze}
                aria-pressed={analyzeDetailOpen}
              >
                <span class="lcs-open-label">DETAIL PANEL</span>
                <span class="lcs-open-state">{analyzeDetailOpen ? 'OPEN' : 'OPEN ↗'}</span>
              </button>
              <button
                class="lcs-open-detail ai"
                type="button"
                onclick={openAnalyzeAIDetail}
              >
                <span class="lcs-open-label">AI DETAIL</span>
                <span class="lcs-open-state">OPEN ↗</span>
              </button>
            </div>
            <div class="lcs-bridge-copy">
              LIVE · OPTIONS · VENUE · LIQ · PROPOSAL은 하단 ANALYZE에 통합
            </div>
          </div>
        </div>
      </div>
      <div class="lcs-divider"></div>
      <div class="lcs-section">
        <div class="lcs-header" role="heading" aria-level="2"><span class="lcs-step">03</span><span class="lcs-title">SCAN</span><span class="lcs-meta">{scanCandidates.length} found</span></div>
        <div class="lcs-body" role="list" aria-label="Scan candidates">
          {#each scanCandidates as x}
            {@const sc = x.alpha >= 75 ? 'var(--pos)' : x.alpha >= 60 ? 'var(--amb)' : 'var(--g7)'}
            <button
              class="scan-row"
              class:active={scanSelected === x.id}
              onclick={() => scanSelected = x.id}
              aria-label="{x.symbol}: α{x.alpha}, {Math.round(x.sim * 100)}% similarity"
              aria-current={scanSelected === x.id ? 'true' : 'false'}
            >
              <span class="sr-sym">{x.symbol.replace('USDT','')}</span>
              <span class="sr-tf">{x.tf}</span>
              <div class="sr-bar" aria-hidden="true"><div class="sr-fill" style:width="{x.sim*100}%" style:background={sc}></div></div>
              <span class="sr-alpha" style:color={sc} aria-hidden="true">α{x.alpha}</span>
            </button>
          {/each}
        </div>
      </div>
      <div class="lcs-divider"></div>
      <div class="lcs-section">
        <div class="lcs-header" role="heading" aria-level="2"><span class="lcs-step">04</span><span class="lcs-title">JUDGE</span></div>
        <div class="lcs-body">
          <div role="region" aria-label="Trade proposal">
            {#each proposal as p}
              <div class="prop-cell compact" class:tone-pos={p.tone === 'pos'} class:tone-neg={p.tone === 'neg'} role="row">
                <span class="prop-l">{p.label}</span>
                <span class="prop-v" aria-label="{p.label}: {p.val}">{p.val}</span>
              </div>
            {/each}
          </div>
          <div class="judge-btns" style="margin-top: 8px; gap: 4px;" role="group" aria-label="Verdict options">
            <button
              class="judge-btn agree"
              class:active={judgeVerdict === 'agree'}
              onclick={() => judgeVerdict = 'agree'}
              aria-pressed={judgeVerdict === 'agree'}
              title="Press Y or click to agree (Y key)"
            >
              <span class="jb-key" aria-label="Keyboard shortcut Y">Y</span><div class="jb-text"><span class="jb-label">AGREE</span></div>
            </button>
            <button
              class="judge-btn disagree"
              class:active={judgeVerdict === 'disagree'}
              onclick={() => judgeVerdict = 'disagree'}
              aria-pressed={judgeVerdict === 'disagree'}
              title="Press N or click to skip (N key)"
            >
              <span class="jb-key" aria-label="Keyboard shortcut N">N</span><div class="jb-text"><span class="jb-label">SKIP</span></div>
            </button>
          </div>
        </div>
      </div>
      {/if}
    </div>
  </div>

{/if}<!-- end mobileView -->
</div>

<style>

  /* Fix 1: 모바일에서 ChartBoard 데스크탑 툴바 숨김 (+98px 확보) */
  :global(.mobile-chart-section .chart-toolbar) { display: none; }
  :global(.mobile-chart-section .chart-header--tv) { display: none; }
  /* Fix 2: ChartBoard min-height 420px 오버라이드 → 42vh 컨테이너에 맞춤 */
  :global(.mobile-chart-section .chart-board) { min-height: 0 !important; }

  .trade-mode {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--g0);
    gap: 0;
    overflow: hidden;
  }

  /* ── Empty canvas ── */
  .empty-canvas {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--g0);
    min-height: 0;
  }
  .ec-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    width: 440px;
    max-width: 90vw;
  }
  .ec-logo {
    font-size: 13px;
    color: var(--g5);
    letter-spacing: 0.32em;
  }
  .ec-tagline {
    font-size: 11px;
    color: var(--g6);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.08em;
    text-align: center;
  }
  .ec-divider {
    width: 60px;
    height: 0.5px;
    background: var(--g4);
  }
  .ec-cta-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: 100%;
  }
  .ec-label {
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.22em;
  }
  .ec-options {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }
  .ec-opt {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--g1);
    border: 0.5px solid var(--g4);
    border-radius: 4px;
  }
  .ec-opt-key {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--amb);
    font-weight: 600;
    letter-spacing: 0.06em;
    white-space: nowrap;
    min-width: 80px;
  }
  .ec-opt-txt {
    font-size: 10px;
    color: var(--g6);
  }
  .ec-quick-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    width: 100%;
  }
  .ec-quick {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding: 9px 12px;
    background: var(--g1);
    border: 0.5px solid var(--g4);
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.12s, background 0.12s;
  }
  .ec-quick:hover {
    border-color: var(--g4);
    background: var(--g2);
  }
  .eq-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--g8);
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  .eq-sub {
    font-size: 9px;
    color: var(--g6);
  }

  /* Chart section */
  .chart-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--g1);
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    margin: 6px;
    overflow: hidden;
    position: relative;
  }

  .chart-header {
    padding: 8px 16px;
    border-bottom: 0.5px solid var(--g4);
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--g0);
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
  }
  .symbol {
    font-size: 14px;
    color: var(--g9);
    font-weight: 600;
    letter-spacing: -0.02em;
    font-family: 'Space Grotesk', sans-serif;
  }
  .timeframe { color: var(--g6); letter-spacing: 0.04em; }
  .pattern {
    color: var(--g5);
    padding: 2px 8px;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 999px;
    font-size: 8px;
    letter-spacing: 0.06em;
  }
  .spacer { flex: 1; }

  .hd-sep { width: 1px; height: 14px; background: var(--g3); flex-shrink: 0; }
  .hd-price {
    font-size: 13px; color: var(--g9); font-weight: 600;
    letter-spacing: -0.01em; font-family: 'JetBrains Mono', monospace;
  }
  .hd-chip {
    padding: 2px 7px; border-radius: 3px;
    background: var(--g2); border: 0.5px solid var(--g4);
    font-size: 8px; color: var(--g6); letter-spacing: 0.06em;
  }
  .hd-chip.neg { color: var(--neg); border-color: color-mix(in srgb, var(--neg) 25%, transparent); }
  .hd-chip.pos { color: var(--pos); border-color: color-mix(in srgb, var(--pos) 25%, transparent); }

  .ind-toggles {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .ind-label-hdr {
    color: var(--g6);
    font-size: 7px;
    letter-spacing: 0.1em;
    margin-right: 2px;
  }
  .ind-tog {
    padding: 2px 8px;
    border: 0.5px solid var(--g4);
    border-radius: 2px;
    background: transparent;
    color: var(--g5);
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: all 0.1s;
  }
  .ind-tog:hover { border-color: var(--g4); color: var(--g7); background: var(--g1); }
  .ind-tog.active {
    background: rgba(122,162,224,0.1);
    border-color: rgba(122,162,224,0.4);
    color: #7aa2e0;
  }

  .evidence-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 999px;
  }
  .ev-label {
    font-size: 7.5px;
    color: var(--g6);
    letter-spacing: 0.14em;
  }
  .ev-pos { font-size: 11px; color: var(--amb); font-weight: 700; }
  .ev-sep { font-size: 9px; color: var(--g4); }
  .ev-neg { font-size: 11px; color: var(--neg); font-weight: 700; }

  .conf-inline {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .conf-label {
    font-size: 8px;
    color: var(--g6);
    letter-spacing: 0.12em;
  }
  .conf-bar {
    width: 72px;
    height: 5px;
    background: var(--g3);
    border-radius: 2px;
    overflow: hidden;
  }
  .conf-inline.small .conf-bar { width: 60px; height: 4px; }
  .conf-fill { height: 100%; background: var(--amb); border-radius: 2px; }
  .conf-val {
    font-size: 11px;
    color: var(--amb);
    font-weight: 600;
    width: 22px;
    text-align: right;
  }
  .conf-inline.small .conf-val { font-size: 10px; }

  .chart-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .phase-markers {
    display: flex;
    gap: 0;
    padding: 0 14px;
    height: 26px;
    border-bottom: 0.5px solid var(--g2);
    flex-shrink: 0;
    align-items: center;
  }
  .phase {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: 'JetBrains Mono', monospace;
    color: var(--g5);
    padding: 0 12px;
    border-right: 0.5px solid var(--g2);
    height: 100%;
    transition: color 0.1s;
  }
  .phase:first-child { padding-left: 0; }
  .phase:last-child { border-right: none; }
  .ph-n { font-size: 7.5px; color: var(--g5); letter-spacing: 0.1em; }
  .ph-label { font-size: 8.5px; letter-spacing: 0.08em; }
  .ph-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--pos);
    box-shadow: 0 0 6px var(--pos);
    flex-shrink: 0;
  }
  .phase.active .ph-n   { color: var(--pos); }
  .phase.active .ph-label { color: var(--pos); font-weight: 600; }
  .chart-live {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .chart-loading {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--g4);
    font-size: 11px;
  }

  /* PEEK bar */
  .peek-bar {
    display: flex;
    align-items: stretch;
    height: 30px;
    flex-shrink: 0;
    background: var(--g0);
    border-top: 0.5px solid var(--g4);
  }
  /* W-0122-Phase3: small confluence chip appended to peek-bar */
  .pb-confluence-slot {
    display: flex;
    align-items: center;
    padding: 0 8px;
    border-left: 0.5px solid var(--g4);
  }
  /* W-0122-Phase3: Layout C details accordion */
  .lc-ind-details {
    margin: 6px 0;
    border: 0.5px solid var(--g4);
    border-radius: 3px;
    padding: 0;
  }
  .lc-ind-details summary {
    cursor: pointer;
    padding: 4px 6px;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--g5, rgba(255, 255, 255, 0.5));
    list-style: none;
  }
  .lc-ind-details summary::marker,
  .lc-ind-details summary::-webkit-details-marker {
    display: none;
  }
  .lc-ind-details summary::before {
    content: '▸';
    display: inline-block;
    margin-right: 4px;
    transition: transform 120ms;
  }
  .lc-ind-details[open] summary::before {
    transform: rotate(90deg);
  }
  .pb-tab {
    flex: 1;
    min-width: 0;
    padding: 0 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    border-left: 0.5px solid var(--g4);
    border-bottom: 1.5px solid transparent;
    cursor: pointer;
    overflow: hidden;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.1s;
  }
  .pb-tab:first-child { border-left: none; }
  .pb-tab:hover { background: var(--g1); }
  .pb-tab.active {
    background: var(--g1);
    border-bottom-color: var(--tc);
  }
  .pb-n {
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.18em;
    font-weight: 700;
    flex-shrink: 0;
  }
  .pb-tab.active .pb-n { color: var(--tc); opacity: 0.7; }
  .pb-label {
    font-size: 10px;
    color: var(--g6);
    font-weight: 600;
    letter-spacing: 0.1em;
    flex-shrink: 0;
  }
  .pb-tab.active .pb-label { color: var(--g9); }
  .pb-chevron {
    font-size: 8px;
    color: var(--g5);
    flex-shrink: 0;
  }
  .pb-tab.active .pb-chevron { color: var(--tc); }

  /* PEEK overlay */
  .peek-overlay {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 30px; /* height of peek-bar */
    background: rgba(10,12,16,0.97);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-top: 0.5px solid var(--g4);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 -24px 60px rgba(0,0,0,0.7);
    animation: peekSlide 0.2s cubic-bezier(0.22,1,0.36,1);
    z-index: 10;
    min-height: 200px;
  }

  @keyframes peekSlide {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .resizer {
    height: 8px;
    cursor: ns-resize;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
  }
  .resizer:hover .resizer-pill { background: var(--g4); }
  .resizer-pill {
    width: 32px;
    height: 3px;
    border-radius: 2px;
    background: var(--g4);
    opacity: 0.7;
    transition: background 0.1s;
  }

  /* Drawer header */
  .drawer-header {
    display: flex;
    align-items: stretch;
    background: var(--g0);
    border-bottom: 0.5px solid var(--g4);
    flex-shrink: 0;
    height: 34px;
  }
  .dh-tab {
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    border-right: 0.5px solid var(--g4);
    border-top: 1.5px solid transparent;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.1s;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .dh-tab:hover { background: var(--g1); }
  .dh-tab.active {
    background: var(--g1);
    border-top-color: var(--tc);
  }
  .dh-n {
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.2em;
    font-weight: 600;
  }
  .dh-tab.active .dh-n { color: var(--tc); opacity: 0.7; }
  .dh-label {
    font-size: 11px;
    color: var(--g6);
    font-weight: 600;
    letter-spacing: 0.1em;
  }
  .dh-tab.active .dh-label { color: var(--g9); }
  .dh-desc { font-size: 9px; color: var(--g5); font-family: 'Geist', sans-serif; white-space: nowrap; }

  /* Drawer content */
  .drawer-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    min-height: 0;
  }

  /* ANALYZE body */
  .analyze-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
    min-height: 0;
  }
  .analyze-overview {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    padding: 12px 14px 10px;
    border-bottom: 0.5px solid var(--g4);
    background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.1));
    flex-shrink: 0;
  }
  .analyze-overview-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: 8px 10px;
    border-radius: 4px;
    border: 0.5px solid var(--g4);
    background: var(--g1);
  }
  .analyze-overview-card.tone-pos {
    border-color: color-mix(in srgb, var(--pos) 45%, var(--g4));
    background: color-mix(in srgb, var(--pos) 10%, var(--g1));
  }
  .analyze-overview-card.tone-neg {
    border-color: color-mix(in srgb, var(--neg) 45%, var(--g4));
    background: color-mix(in srgb, var(--neg) 10%, var(--g1));
  }
  .analyze-overview-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    letter-spacing: 0.16em;
    color: var(--g5);
  }
  .analyze-overview-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--g9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .analyze-overview-note {
    font-size: 9px;
    color: var(--g6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .analyze-columns {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }
  .analyze-left {
    flex: 1.3;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    overflow: auto;
    min-width: 0;
    border-right: 0.5px solid var(--g4);
  }
  .analyze-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 2px;
  }
  .analyze-section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .analyze-section-head.compact {
    margin-bottom: 6px;
  }
  .analyze-kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    color: var(--brand);
    letter-spacing: 0.18em;
    font-weight: 700;
    white-space: nowrap;
  }
  .analyze-section-copy {
    font-size: 10px;
    color: var(--g6);
    line-height: 1.4;
  }
  .narrative {
    font-family: 'Geist', sans-serif;
    font-size: 12px;
    color: var(--g8);
    line-height: 1.7;
  }
  .narrative .bull { color: var(--pos); font-weight: 600; }
  .narrative code {
    font-family: 'JetBrains Mono', monospace;
    color: var(--g9);
    font-size: 11px;
    padding: 0 3px;
    background: var(--g2);
    border-radius: 2px;
  }
  .narrative strong { color: var(--g9); }
  .narrative .warn {
    color: var(--amb);
    background: var(--amb-dd);
    padding: 1px 6px;
    border-radius: 2px;
    border: 0.5px solid var(--amb-d);
    font-size: 11px;
  }
  .study-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .study-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 5px;
    border: 0.5px solid var(--g4);
    background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.08));
  }
  .study-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  .study-card-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--g9);
    letter-spacing: 0.08em;
  }
  .study-card-sub {
    margin-top: 2px;
    font-size: 9px;
    color: var(--g6);
    line-height: 1.4;
  }
  .study-card-trust {
    flex-shrink: 0;
    padding: 2px 6px;
    border-radius: 999px;
    border: 0.5px solid var(--g4);
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g7);
    text-transform: uppercase;
  }
  .study-card-trust[data-tier='core'],
  .study-card-trust[data-tier='verified'] {
    border-color: color-mix(in srgb, var(--pos) 35%, var(--g4));
    color: var(--pos);
    background: color-mix(in srgb, var(--pos) 12%, transparent);
  }
  .study-card-trust[data-tier='experimental'] {
    border-color: color-mix(in srgb, var(--amb) 35%, var(--g4));
    color: var(--amb);
    background: color-mix(in srgb, var(--amb) 12%, transparent);
  }
  .study-card-trust[data-tier='deferred'] {
    color: var(--g5);
    background: var(--g1);
  }
  .study-card-metrics {
    display: grid;
    gap: 6px;
  }
  .study-metric {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .study-metric-label {
    min-width: 58px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--g6);
  }
  .study-metric-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--g9);
    font-weight: 600;
  }
  .study-metric-value.tone-bull { color: var(--pos); }
  .study-metric-value.tone-bear { color: var(--neg); }
  .study-metric-value.tone-warn { color: var(--amb); }
  .study-metric-note {
    font-size: 9px;
    color: var(--g6);
  }
  .study-card-method {
    font-size: 9px;
    color: var(--g5);
    line-height: 1.4;
  }
  .dex-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .dex-strip-item,
  .dex-chain-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    padding: 10px;
    border-radius: 5px;
    border: 0.5px solid var(--g4);
    background: var(--g1);
  }
  .dex-strip-label,
  .dex-chain-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.12em;
  }
  .dex-strip-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--g9);
  }
  .dex-strip-note,
  .dex-chain-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 9px;
    color: var(--g6);
  }
  .dex-chain-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .onchain-metric-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .dex-chain-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--g9);
  }
  .dex-chain-share {
    color: var(--amb);
    font-size: 10px;
  }
  .dex-table-wrap {
    border: 0.5px solid var(--g4);
    border-radius: 5px;
    overflow: auto;
    background: var(--bg);
  }
  .dex-table {
    width: 100%;
    min-width: 620px;
    border-collapse: collapse;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
  }
  .dex-table th,
  .dex-table td {
    padding: 8px 9px;
    border-bottom: 0.5px solid var(--g3);
    text-align: left;
    white-space: nowrap;
  }
  .dex-table th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--g1);
    color: var(--g5);
    font-size: 8px;
    letter-spacing: 0.14em;
  }
  .dex-table td {
    color: var(--g8);
  }
  .dex-table tbody tr:hover td {
    background: rgba(255,255,255,0.02);
  }
  @media (max-width: 1100px) {
    .dex-strip,
    .dex-chain-grid,
    .onchain-metric-grid {
      grid-template-columns: 1fr;
    }
  }
  .evidence-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
  }
  .ev-chip {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 5px 10px;
    background: var(--g0);
    border: 0.5px solid var(--g4);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
  }
  .ev-mark { font-size: 11px; font-weight: 700; }
  .ev-chip.pos .ev-mark { color: var(--pos); }
  .ev-chip.neg .ev-mark { color: var(--neg); }
  .ev-key { font-size: 10px; color: var(--g7); width: 80px; }
  .ev-val { font-size: 11px; color: var(--g9); font-weight: 600; }
  .ev-note { font-size: 10px; color: var(--g6); margin-left: auto; font-family: 'Geist', sans-serif; }

  .analyze-right {
    width: 240px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    overflow: auto;
  }
  .analyze-sidebox {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border-radius: 4px;
    border: 0.5px solid var(--g4);
    background: linear-gradient(180deg, var(--g1), rgba(0,0,0,0.12));
  }
  .analyze-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .analyze-action-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: 4px;
    border: 0.5px solid var(--g4);
    background: var(--g1);
    color: var(--g8);
    cursor: pointer;
  }
  .analyze-action-btn.ai {
    border-color: color-mix(in srgb, var(--amb) 34%, var(--g4));
    background: color-mix(in srgb, var(--amb) 10%, var(--g1));
  }
  .analyze-action-btn:hover {
    border-color: var(--g5);
    background: var(--g2);
    color: var(--g9);
  }
  .analyze-action-btn.ai:hover {
    border-color: color-mix(in srgb, var(--amb) 52%, var(--g4));
    background: color-mix(in srgb, var(--amb) 14%, var(--g2));
  }
  .analyze-action-k {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 0.14em;
    color: var(--brand);
    flex-shrink: 0;
  }
  .analyze-action-t {
    font-size: 10px;
    font-weight: 600;
  }
  .proposal-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    color: var(--amb);
    letter-spacing: 0.2em;
    margin-bottom: 2px;
  }
  .prop-cell {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 10px;
    background: var(--g0);
    border: 0.5px solid var(--g4);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
  }
  .prop-l { font-size: 7px; color: var(--g6); letter-spacing: 0.14em; width: 44px; }
  .prop-v { font-size: 14px; color: var(--g9); font-weight: 600; }
  .prop-cell.tone-neg .prop-v { color: var(--neg); }
  .prop-cell.tone-pos .prop-v { color: var(--pos); }
  .prop-h { font-size: 9px; color: var(--g6); margin-left: auto; }

  /* ── SCAN panel (trade_scan.jsx) ── */
  .scan-panel {
    flex: 1; display: flex; flex-direction: column; overflow: hidden;
    background: var(--g1);
  }
  .scan-header {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-bottom: 0.5px solid var(--g4);
    background: var(--g0); flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
  }
  .scan-step { font-size: 7px; color: #7aa2e0; letter-spacing: 0.22em; font-weight: 600; }
  .scan-label { font-size: 7px; color: #7aa2e0; letter-spacing: 0.14em; }
  .scan-label.scanning { animation: scan-pulse 1.1s ease-in-out infinite; }
  @keyframes scan-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  .scan-title { font-size: 13px; color: var(--g9); font-weight: 600; }
  .scan-meta { font-size: 9px; color: var(--g6); letter-spacing: 0.04em; }
  .scan-meta.anim { animation: scan-pulse 1.6s ease-in-out infinite; }
  .scan-prog-track {
    width: 100%; height: 3px; background: var(--g3); border-radius: 2px; overflow: hidden;
    margin: 4px 0;
  }
  .scan-prog-fill {
    height: 100%; background: #7aa2e0; border-radius: 2px;
    transition: width 0.18s ease-out;
  }
  .sc-open {
    padding: 2px 7px; border-radius: 3px;
    background: transparent; border: 0.5px solid var(--g4);
    color: var(--g6); font-size: 9px; cursor: pointer;
    flex-shrink: 0; transition: all 0.1s;
  }
  .sc-open:hover { background: var(--g2); border-color: var(--g5); color: var(--g8); }
  .scan-sort-label { font-size: 9px; color: var(--g5); letter-spacing: 0.14em; }
  .scan-sort-btn {
    font-size: 10px; color: var(--g8); font-weight: 500;
    padding: 3px 8px; background: var(--g2); border-radius: 3px; cursor: pointer;
  }
  .scan-grid {
    flex: 1; overflow: auto; padding: 10px 12px;
    display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
    align-content: start;
  }
  .scan-card {
    padding: 10px 12px 9px; border-radius: 8px; cursor: pointer;
    background: var(--g0); border: 0.5px solid var(--g4);
    display: flex; flex-direction: column; gap: 5px;
    transition: all 0.14s; text-align: left;
  }
  .scan-card:hover { background: var(--g2); border-color: var(--g4); }
  .scan-card.active { background: var(--g2); border-color: var(--sc); box-shadow: 0 0 0 0.5px var(--sc); }
  .scan-card.skeleton {
    min-height: 100px; background: var(--g2); border-color: var(--g3);
    animation: skeleton-fade 1.4s ease-in-out infinite;
  }
  @keyframes skeleton-fade { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
  .sc-top { display: flex; align-items: center; gap: 4px; }
  .sc-sym { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--g9); font-weight: 600; }
  .sc-tf {
    font-family: 'JetBrains Mono', monospace; font-size: 7.5px; color: var(--g6);
    padding: 1px 4px; background: var(--g2); border-radius: 2px;
  }
  .sc-alpha { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; }
  .sc-sim-row { display: flex; align-items: center; gap: 4px; }
  .sc-sim-bar { flex: 1; height: 2.5px; background: var(--g3); border-radius: 2px; overflow: hidden; }
  .sc-sim-fill { height: 100%; opacity: 0.85; }
  .sc-sim-pct { font-family: 'JetBrains Mono', monospace; font-size: 8.5px; color: var(--g8); width: 24px; text-align: right; }
  .sc-pattern { font-size: 8.5px; color: var(--g6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sc-age { font-family: 'JetBrains Mono', monospace; font-size: 8px; color: var(--g5); }

  /* ── ACT panel (trade_act.jsx) ── */
  .act-panel {
    flex: 1; display: flex; flex-direction: column; overflow: hidden;
    background: var(--g1);
  }
  .act-header {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 14px; border-bottom: 0.5px solid var(--g4);
    background: var(--g0); flex-shrink: 0; height: 34px;
    font-family: 'JetBrains Mono', monospace;
  }
  .act-step { font-size: 7px; color: var(--amb); letter-spacing: 0.22em; }
  .act-div { width: 1px; height: 12px; background: var(--g4); }
  .act-sym { font-size: 12px; color: var(--g9); font-weight: 600; }
  .act-tf { font-size: 9px; color: var(--g6); }
  .act-dir { font-size: 9px; color: var(--brand); font-weight: 600; }
  .act-pat { font-size: 9px; color: var(--g6); }
  .act-alpha {
    font-size: 10px; color: var(--amb); font-weight: 600;
    padding: 2px 7px; background: var(--g2); border-radius: 3px;
  }
  .act-cols { flex: 1; display: flex; min-height: 0; overflow: hidden; }
  .act-col { padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
  .plan-col { flex: 1.3; min-width: 0; }
  .judge-col { flex: 1.4; min-width: 0; }
  .after-col { flex: 1.2; min-width: 0; }
  .act-divider { width: 0.5px; background: var(--g4); flex-shrink: 0; }
  .col-label { font-family: 'JetBrains Mono', monospace; font-size: 7px; color: var(--g6); letter-spacing: 0.2em; }

  /* Plan col */
  .lvl-row { display: flex; gap: 6px; }
  .lvl-cell {
    flex: 1; padding: 7px 10px; background: var(--g0);
    border: 0.5px solid var(--g4); border-radius: 7px; min-width: 0;
  }
  .lvl-label { font-family: 'JetBrains Mono', monospace; font-size: 7px; color: var(--g6); letter-spacing: 0.14em; }
  .lvl-val { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lvl-hint { font-family: 'JetBrains Mono', monospace; font-size: 7px; color: var(--g6); }
  .rr-size-row { display: flex; gap: 6px; }
  .rr-box, .size-box {
    flex: 1; padding: 8px 10px; background: var(--g0);
    border: 0.5px solid var(--g4); border-radius: 7px; min-width: 0;
  }
  .rr-box-label, .size-label { font-family: 'JetBrains Mono', monospace; font-size: 7px; color: var(--g6); letter-spacing: 0.1em; margin-bottom: 4px; }
  .rr-bar { height: 5px; background: var(--g2); border-radius: 3px; overflow: hidden; display: flex; }
  .rr-loss { background: var(--neg); opacity: 0.9; }
  .rr-gain { background: var(--pos); }
  .rr-labels { display: flex; justify-content: space-between; margin-top: 2px; font-family: 'JetBrains Mono', monospace; font-size: 8px; }
  .rr-r { color: var(--neg); }
  .rr-g { color: var(--pos); }
  .size-val { font-family: 'JetBrains Mono', monospace; font-size: 16px; color: var(--g9); font-weight: 600; display: flex; align-items: baseline; gap: 6px; }
  .size-usd { font-size: 9px; color: var(--g6); }
  .exchange-btn {
    padding: 9px 14px; background: var(--pos-dd); color: var(--pos);
    border: 0.5px solid var(--pos-d); border-radius: 8px;
    font-family: 'Space Grotesk', sans-serif; font-size: 10px; font-weight: 600;
    letter-spacing: 0.06em; cursor: pointer; transition: all 0.12s;
  }
  .exchange-btn:hover { background: var(--pos-d); border-color: var(--pos); }

  /* Judge col */
  .judge-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .judge-q { font-size: 10px; color: var(--g7); }
  .judge-q strong { color: var(--g9); }
  .judge-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; flex: 1; min-height: 80px; }
  .judge-btn {
    padding: 10px 14px; border-radius: 5px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 12px;
    font-family: 'JetBrains Mono', monospace; border: 1px solid;
    transition: all 0.12s; width: 100%;
  }
  .judge-btn.agree {
    background: rgba(52,196,112,0.07); color: var(--pos); border-color: rgba(52,196,112,0.25);
  }
  .judge-btn.agree:hover { background: rgba(52,196,112,0.12); border-color: rgba(52,196,112,0.4); }
  .judge-btn.agree.active { background: rgba(52,196,112,0.18); border-color: var(--pos); box-shadow: inset 0 0 0 0.5px var(--pos); }
  .judge-btn.disagree {
    background: rgba(248,81,73,0.07); color: var(--neg); border-color: rgba(248,81,73,0.25);
  }
  .judge-btn.disagree:hover { background: rgba(248,81,73,0.12); border-color: rgba(248,81,73,0.4); }
  .judge-btn.disagree.active { background: rgba(248,81,73,0.18); border-color: var(--neg); box-shadow: inset 0 0 0 0.5px var(--neg); }
  .jb-key { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
  .jb-text { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.3; }
  .jb-label { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; }
  .jb-sub { font-size: 8.5px; opacity: 0.6; }
  .judge-tags { display: flex; flex-wrap: wrap; gap: 3px; }
  .judge-tag {
    font-family: 'Space Grotesk', sans-serif; font-size: 9px; font-weight: 500;
    padding: 3px 9px; background: var(--g2); color: var(--g6);
    border: 0.5px solid var(--g4); border-radius: 999px; cursor: pointer;
    white-space: nowrap; transition: all 0.1s;
  }
  .judge-tag:hover { color: var(--g8); border-color: var(--amb); background: var(--amb-dd); }

  /* After col */
  .outcome-row { display: flex; gap: 3px; }
  .outcome-save-hint { margin-top: 4px; font-size: 10px; color: var(--g6); text-align: right; }
  .outcome-btn {
    flex: 1; padding: 6px 4px; font-family: 'Space Grotesk', sans-serif;
    font-size: 9px; font-weight: 600; letter-spacing: 0.06em;
    background: transparent; color: var(--g6);
    border: 0.5px solid var(--g4); border-radius: 7px; cursor: pointer;
    transition: all 0.1s;
  }
  .outcome-btn:hover { border-color: var(--g5); color: var(--g8); }
  .outcome-btn.active { background: var(--obg); color: var(--oc); border-color: var(--oc); }
  .result-row {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 8px; background: var(--g0);
    border: 0.5px solid var(--g4); border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
  }
  .result-label { font-size: 7px; color: var(--g6); letter-spacing: 0.12em; }
  .result-val { font-size: 14px; font-weight: 600; }
  .result-hint { font-size: 8px; color: var(--g6); }
  .rejudge-label { font-family: 'JetBrains Mono', monospace; font-size: 7px; color: var(--amb); letter-spacing: 0.14em; }
  .rejudge-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .rj-btn {
    padding: 7px 6px; border-radius: 3px; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 600;
    letter-spacing: 0.06em; border: 1px solid; transition: all 0.1s;
  }
  .rj-sub { opacity: 0.6; font-size: 8px; }
  .rj-pos { background: var(--pos-dd); color: var(--pos); border-color: var(--pos-d); }
  .rj-pos.active { background: var(--pos-d); border-color: var(--pos); }
  .rj-neg { background: var(--neg-dd); color: var(--neg); border-color: var(--neg-d); }
  .rj-neg.active { background: var(--neg-d); border-color: var(--neg); }
  .bias-box {
    padding: 5px 8px; border-radius: 3px; font-size: 9px; line-height: 1.5;
  }
  .bias-good { background: var(--pos-dd); border: 0.5px solid var(--pos-d); color: var(--pos); }
  .bias-warn { background: var(--amb-dd); border: 0.5px solid var(--amb-d); color: var(--amb); }
  .after-empty {
    flex: 1; display: flex; align-items: center; justify-content: center;
    padding: 10px; border: 0.5px dashed var(--g4); border-radius: 3px;
    font-size: 10px; color: var(--g5); text-align: center; line-height: 1.5;
  }

  /* PeekBar rich summary */
  .pb-sep { font-size: 8px; color: var(--g5); flex-shrink: 0; }
  .pb-val { font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 600; color: var(--g9); flex-shrink: 0; }
  .pb-val.pos { color: var(--pos); }
  .pb-val.neg { color: var(--neg); }
  .pb-txt { font-size: 9px; color: var(--g7); flex-shrink: 0; }
  .pb-dim { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--g6); overflow: hidden; text-overflow: ellipsis; }
  .pb-warn { font-family: 'JetBrains Mono', monospace; font-size: 8px; color: var(--amb); flex-shrink: 0; }

  /* MiniChart */
  .sc-minichart { width: 100%; height: 48px; display: block; }

  /* PastSamplesStrip */
  .past-strip {
    border-top: 0.5px solid var(--g4);
    background: var(--g0);
    padding: 8px 14px 10px;
    flex-shrink: 0;
  }
  .past-header {
    display: flex; align-items: center; gap: 8px;
    font-family: 'JetBrains Mono', monospace; font-size: 8px;
    letter-spacing: 0.14em; margin-bottom: 8px;
  }
  .past-title { color: var(--amb); font-weight: 600; }
  .past-sep { color: var(--g4); }
  .past-win { color: var(--pos); }
  .past-loss { color: var(--neg); }
  .past-avg { color: var(--g6); letter-spacing: 0.04em; }
  .past-hint { font-size: 7.5px; color: var(--g5); letter-spacing: 0.04em; text-transform: none; }
  .past-cards { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
  .past-card {
    padding: 7px 10px; border-radius: 4px; cursor: pointer; min-width: 72px;
    background: var(--g1); border: 0.5px solid var(--g4);
    display: flex; flex-direction: column; gap: 2px; flex-shrink: 0;
    transition: all 0.12s; text-align: left;
  }
  .past-card:hover { background: var(--g2); border-color: var(--g4); }
  .past-sym { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--g9); font-weight: 500; }
  .past-pnl { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 600; }
  .past-sim { font-family: 'JetBrains Mono', monospace; font-size: 8px; color: var(--g5); }

  /* ── Layout switcher strip ─────────────────────────────────────────────── */
  .layout-strip {
    display: flex;
    align-items: center;
    gap: 0;
    height: 28px;
    padding: 0 10px;
    background: var(--g0);
    border-bottom: 0.5px solid var(--g3);
    flex-shrink: 0;
    overflow: hidden;
  }
  .ls-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.2em;
    margin-right: 10px;
    white-space: nowrap;
  }
  .ls-static {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-right: 10px;
    margin-right: 10px;
    border-right: 0.5px solid var(--g3);
    white-space: nowrap;
  }
  .ls-id {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 700;
    color: var(--amb);
    letter-spacing: 0.1em;
  }
  .ls-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--g9);
    letter-spacing: 0.06em;
    font-weight: 500;
    white-space: nowrap;
  }
  .ls-desc { color: var(--g5); font-size: 8px; }
  .ls-hint {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  /* scan-row: compact horizontal scan item for C sidebar */
  .scan-empty { padding: 12px 0; font-size: 11px; color: var(--g6); text-align: center; }
  .scan-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 0;
    width: 100%;
    border-bottom: 0.5px solid var(--g2);
    cursor: pointer;
    background: none;
  }
  .scan-row:hover { background: var(--g2); }
  .scan-row.active { background: var(--g2); }
  .sr-sym {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--g9);
    font-weight: 500;
    width: 50px;
    flex-shrink: 0;
  }
  .sr-tf { font-size: 8px; color: var(--g5); width: 22px; flex-shrink: 0; }
  .sr-bar { flex: 1; height: 3px; background: var(--g3); border-radius: 2px; overflow: hidden; }
  .sr-fill { height: 100%; border-radius: 2px; }
  .sr-alpha { font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 600; width: 30px; text-align: right; flex-shrink: 0; }

  /* ── Layout C — chart + peek bar + sidebar (merged C+D) ─────────────────── */
  .layout-c {
    flex: 1;
    display: flex;
    flex-direction: row;
    overflow: hidden;
    min-height: 0;
  }
  .lc-chart {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  /* merged layout: chart-section.lc-main = left pane (chart + peek) */
  .layout-c .chart-section.lc-main {
    margin: 6px 0 6px 6px;
    border-right: none;
    border-radius: 6px 0 0 6px;
  }
  .lc-sidebar {
    width: 260px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--g1);
    border: 0.5px solid var(--g4);
    border-left: none;
    border-radius: 0 6px 6px 0;
    margin: 6px 6px 6px 0;
    overflow-y: auto;
    transition: width 0.16s ease, margin 0.16s ease;
  }
  .lc-sidebar.collapsed {
    width: 56px;
    overflow: hidden;
    align-items: center;
  }
  .lc-sidebar-rail {
    width: 100%;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 6px;
    background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.12));
  }
  .lc-rail-chip,
  .lc-rail-handle {
    width: 42px;
    border: 0.5px solid var(--g4);
    background: var(--g0);
    color: var(--g7);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: border-color 0.12s, color 0.12s, background 0.12s;
  }
  .lc-rail-chip:hover,
  .lc-rail-handle:hover {
    border-color: var(--g5);
    color: var(--g9);
    background: var(--g1);
  }
  .lc-rail-chip {
    height: 42px;
    position: relative;
    border-radius: 4px;
    overflow: hidden;
  }
  .lc-rail-accent {
    position: absolute;
    inset: 0 auto auto 0;
    width: 2px;
    height: 100%;
    background: var(--brand);
    opacity: 0.9;
  }
  .lc-rail-step {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.16em;
    color: var(--g8);
    transform: translateX(2px);
  }
  .lc-rail-handle {
    height: 42px;
    border-radius: 4px;
    font-size: 13px;
  }
  /* Responsive: hide sidebar below 860px, chart-section goes full width */
  @media (max-width: 860px) {
    .layout-c .lc-sidebar { display: none; }
    .layout-c .chart-section.lc-main {
      margin: 6px;
      border-right: 0.5px solid var(--g4);
      border-radius: 6px;
    }
  }
  .lcs-section {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }
  .lcs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    background: var(--g0);
    border-bottom: 0.5px solid var(--g3);
    flex-shrink: 0;
  }
  .lcs-headline {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .lcs-step {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.18em;
    font-weight: 600;
  }
  .lcs-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 600;
    color: var(--g9);
    letter-spacing: 0.1em;
  }
  .lcs-meta { font-size: 8px; color: var(--g5); }
  .lcs-toggle {
    width: 20px;
    height: 20px;
    border: 0.5px solid var(--g4);
    border-radius: 4px;
    background: var(--g1);
    color: var(--g7);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }
  .lcs-toggle:hover { color: var(--g9); border-color: var(--g5); }
  .lcs-body { padding: 8px 12px; }
  .lcs-divider { height: 0.5px; background: var(--g3); flex-shrink: 0; }
  .prop-cell.compact { padding: 3px 0; }
  .la-meta { font-family: 'JetBrains Mono', monospace; font-size: 8px; color: var(--g5); letter-spacing: 0.04em; }
  .lcs-summary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-top: 8px;
  }
  .lcs-summary-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: 7px 8px;
    border-radius: 4px;
    border: 0.5px solid var(--g4);
    background: var(--g2);
  }
  .lcs-summary-card.tone-pos {
    border-color: color-mix(in srgb, var(--pos) 40%, var(--g4));
    background: color-mix(in srgb, var(--pos) 10%, var(--g2));
  }
  .lcs-summary-card.tone-neg {
    border-color: color-mix(in srgb, var(--neg) 40%, var(--g4));
    background: color-mix(in srgb, var(--neg) 10%, var(--g2));
  }
  .lcs-summary-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    letter-spacing: 0.16em;
    color: var(--g5);
  }
  .lcs-summary-value {
    font-size: 11px;
    color: var(--g9);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lcs-summary-note {
    font-size: 8px;
    color: var(--g6);
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lcs-mini-evidence {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
  }
  .lcs-bridge {
    margin-top: 8px;
    padding: 8px;
    border-radius: 4px;
    border: 0.5px solid var(--g4);
    background: linear-gradient(180deg, var(--g2), rgba(0,0,0,0.16));
  }
  .lcs-bridge-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lcs-open-detail {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px;
    border-radius: 4px;
    border: 0.5px solid var(--g4);
    background: var(--g0);
    color: var(--g8);
    cursor: pointer;
  }
  .lcs-open-detail.ai {
    border-color: color-mix(in srgb, var(--amb) 28%, var(--g4));
    background: color-mix(in srgb, var(--amb) 8%, var(--g0));
  }
  .lcs-open-detail:hover,
  .lcs-open-detail.active {
    border-color: color-mix(in srgb, var(--brand) 48%, var(--g4));
    color: var(--g9);
  }
  .lcs-open-detail.ai:hover {
    border-color: color-mix(in srgb, var(--amb) 48%, var(--g4));
  }
  .lcs-open-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 0.14em;
  }
  .lcs-open-state {
    font-size: 9px;
    color: var(--brand);
  }
  .lcs-bridge-copy {
    margin-top: 6px;
    font-size: 8px;
    line-height: 1.5;
    color: var(--g6);
  }

  /* ── Mobile layout ── */
  .mobile-chart-section {
    height: 42vh;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  .mobile-chart-section.mobile-chart-fullscreen {
    flex: 1;
    height: auto;
  }

  .chart-expand-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    border: 0.5px solid var(--g5);
    border-radius: 4px;
    color: var(--g7);
    font-size: 14px;
    cursor: pointer;
    z-index: 10;
    line-height: 1;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    transition: background 0.12s;
  }

  .chart-expand-btn:active {
    background: rgba(0, 0, 0, 0.8);
    color: var(--brand);
  }

  .mobile-tab-strip {
    height: 28px;
    flex-shrink: 0;
    display: flex;
    background: var(--g2);
    border-top: 1px solid var(--g4);
    border-bottom: 1px solid var(--g4);
  }

  .mts-tab {
    flex: 1;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.06em;
    white-space: nowrap;
    color: var(--g6);
    background: transparent;
    border: none;
    border-right: 1px solid var(--g4);
    cursor: pointer;
    transition: color 0.12s, background 0.12s;
  }
  .mts-tab:last-child { border-right: none; }
  .mts-tab.active {
    color: var(--brand);
    background: var(--g1);
    border-top: 1.5px solid var(--brand);
  }

  .mobile-panel {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 10px 14px;
    padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .mobile-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex: 1;
    color: var(--g5);
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    text-align: center;
  }

  .mobile-analyze-hint {
    margin-top: 12px;
    padding: 10px 14px;
    border-radius: 4px;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    color: var(--g7);
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    line-height: 1.6;
    text-align: center;
  }

  .mp-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 0;
    border-bottom: 0.5px solid var(--g3);
  }
  .mp-section:last-child { border-bottom: none; }
  .mp-header {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.14em;
  }

  /* ── Accessibility: Screen reader only text ── */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  /* ── Mobile loading ── */
  .mobile-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--g5);
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
  }
  .ml-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--g3);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Proposal AI CTA (mobile) ── */
  .proposal-ai-cta {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    background: var(--g2);
    border: 0.5px dashed var(--brand-d);
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.12s;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--brand);
  }
  .proposal-ai-cta:active { background: var(--brand-dd); }
  .pcta-icon { font-size: 11px; flex-shrink: 0; }
  .pcta-text { flex: 1; }

  /* ── Proposal hint (desktop) ── */
  .proposal-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 12px;
    background: var(--g2);
    border: 0.5px dashed var(--g4);
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--g6);
    margin-top: 4px;
  }
  .ph-icon { color: var(--brand); font-size: 10px; }
  .ph-arrow { color: var(--brand); margin-left: auto; }

  /* ── JUDGE context header ── */
  .judge-ctx {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 0 10px;
    border-bottom: 0.5px solid var(--g3);
    margin-bottom: 4px;
    font-family: 'JetBrains Mono', monospace;
  }
  .jc-sym { font-size: 14px; font-weight: 600; color: var(--g9); }
  .jc-sep { font-size: 10px; color: var(--g4); }
  .jc-tf { font-size: 10px; color: var(--g6); letter-spacing: 0.06em; }
  .jc-spacer { flex: 1; }
  .jc-bias {
    font-size: 9px;
    color: var(--brand);
    background: var(--brand-dd);
    padding: 2px 6px;
    border-radius: 3px;
    letter-spacing: 0.06em;
  }
</style>
