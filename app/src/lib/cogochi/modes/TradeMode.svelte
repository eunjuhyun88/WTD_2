<script lang="ts">
  import ChartBoard from '../../../components/terminal/workspace/ChartBoard.svelte';
  import {
    fetchAnalyze,
    fetchAnalyzeAndChart,
    fetchAlphaWorldModel,
    fetchConfluenceCurrent,
    fetchConfluenceHistory,
    fetchFundingFlip,
    fetchFundingHistory,
    fetchIndicatorContext,
    fetchLiqClusters,
    fetchMarketMicrostructure,
    fetchOptionsSnapshot,
    fetchRecentCaptures,
    fetchRvCone,
    fetchSsr,
    fetchVenueDivergence,
    submitTradeOutcome,
    type ConfluenceHistoryEntry,
    type RecentCaptureSummary,
    type TradeOutcomeResult,
  } from '$lib/api/terminalBackend';
  import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';
  import type { ChartSeriesPayload, MarketMicrostructurePayload } from '$lib/api/terminalBackend';
  import type { FootprintBucket, MarketDepthLevel, MarketTradePrint } from '$lib/contracts/marketMicrostructure';
  import type { ShellWorkMode, TabState } from '$lib/cogochi/shell.store';
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
  import { chartSaveMode } from '$lib/stores/chartSaveMode';
  import { buildCogochiWorkspaceEnvelope, buildStudyMap } from '$lib/cogochi/workspaceDataPlane';

  type ChartBar = ChartSeriesPayload['klines'][number];
  type MicroOrderbook = MarketMicrostructurePayload['orderbook'];

  interface Props {
    mode: 'trade' | 'train' | 'flywheel';
    tabState: TabState;
    updateTabState: (updater: (ts: TabState) => TabState) => void;
    symbol?: string;
    timeframe?: string;
    mobileView?: 'chart' | 'analyze' | 'scan' | 'judge';
    workMode?: ShellWorkMode;
    setMobileView?: (v: 'chart' | 'analyze' | 'scan' | 'judge') => void;
    setMobileSymbol?: (sym: string) => void;
    onSymbolTap?: () => void;
    onTFChange?: (tf: string) => void;
    isPaneFocused?: boolean;
  }

  let { mode, tabState, updateTabState, symbol = 'BTCUSDT', timeframe = '4h', mobileView, workMode = 'analyze', setMobileView, setMobileSymbol, onSymbolTap, onTFChange, isPaneFocused = true }: Props = $props();

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
  let microstructurePayload = $state<MarketMicrostructurePayload | null>(null);
  let analyzeData = $state<AnalyzeEnvelope | null>(null);
  let chartLoading = $state(false);
  let microstructureLoading = $state(false);
  let microWsState = $state<'idle' | 'connecting' | 'live' | 'error' | 'closed'>('idle');
  let microWsUpdatedAt = $state<number | null>(null);
  let liveOrderbook = $state<MicroOrderbook | null>(null);
  let liveTrades = $state<MarketTradePrint[]>([]);
  let lastCandleTime: number | null = null; // plain ref — guards against duplicate onCandleClose fires

  // Fetch initial bundle (one-shot per symbol/tf)
  $effect(() => {
    const sym = symbol;
    const tf = timeframe;
    let cancelled = false;
    chartLoading = true;
    microstructureLoading = true;
    lastCandleTime = null;

    fetchAnalyzeAndChart({ symbol: sym, tf })
      .then(result => {
        if (cancelled) return;
        chartPayload = result.chartPayload ?? null;
        analyzeData = result.analyze ?? null;
        chartLoading = false;
        if (result.chartPayload?.klines?.length) {
          lastCandleTime = result.chartPayload.klines[result.chartPayload.klines.length - 1].time;
        }
      })
      .catch(() => {
        if (!cancelled) chartLoading = false;
      });

    const refreshMicrostructure = () => {
      fetchMarketMicrostructure(sym, tf)
        .then(payload => {
          if (!cancelled) microstructurePayload = payload;
        })
        .catch(() => {
          if (!cancelled) microstructurePayload = null;
        })
        .finally(() => {
          if (!cancelled) microstructureLoading = false;
        });
    };

    refreshMicrostructure();
    const microTimer = window.setInterval(refreshMicrostructure, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(microTimer);
    };
  });

  // Browser live layer: REST snapshot is the boot/fallback, WS is the live surface.
  $effect(() => {
    const sym = toBinanceFuturesStreamSymbol(symbol);
    if (typeof WebSocket === 'undefined' || !sym) return;

    let closed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closed) return;
      microWsState = 'connecting';
      ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${sym}@aggTrade/${sym}@depth20@100ms`);

      ws.onopen = () => {
        if (!closed) microWsState = 'live';
      };

      ws.onmessage = (event) => {
        if (closed) return;
        try {
          const message = JSON.parse(String(event.data));
          const data = message?.data ?? message;
          if (data?.e === 'aggTrade') {
            const trade = toLiveTrade(data);
            if (!trade) return;
            liveTrades = [trade, ...liveTrades.filter((row) => row.id !== trade.id)].slice(0, 120);
            microWsUpdatedAt = Date.now();
            microWsState = 'live';
          } else if (data?.e === 'depthUpdate' && Array.isArray(data.b) && Array.isArray(data.a)) {
            liveOrderbook = buildLiveOrderbook(data.b, data.a, liveTrades[0]?.price ?? microstructurePayload?.currentPrice ?? null);
            microWsUpdatedAt = Date.now();
            microWsState = 'live';
          }
        } catch {
          // Keep REST snapshot active; malformed stream packets should not blank the UI.
        }
      };

      ws.onerror = () => {
        if (!closed) microWsState = 'error';
      };

      ws.onclose = () => {
        if (closed) return;
        microWsState = liveTrades.length > 0 || liveOrderbook ? 'closed' : 'error';
        reconnectTimer = window.setTimeout(connect, 3_000);
      };
    };

    liveTrades = [];
    liveOrderbook = null;
    microWsUpdatedAt = null;
    connect();

    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  });

  function toBinanceFuturesStreamSymbol(rawSymbol: string): string {
    const compact = rawSymbol.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!compact) return '';
    return compact.endsWith('usdt') ? compact : `${compact}usdt`;
  }

  // ChartBoard owns the resilient WS (DataFeed: reconnect+backoff+gap-fill+heartbeat).
  // On candle close, refresh analyze only — chart live updates are handled inside ChartBoard.
  async function handleCandleClose(bar: { time: number }) {
    if (lastCandleTime === bar.time) return; // dedup duplicate fires
    lastCandleTime = bar.time;
    try {
      const nextAnalyze = await fetchAnalyze(symbol, timeframe);
      if (nextAnalyze) analyzeData = nextAnalyze;
    } catch { /* retry on next candle */ }
    // Also refresh Pillar 3 (venue divergence) + Pillar 1 (liq clusters)
    // in lock-step with analyze on candle close.
    void refreshVenueDivergence();
    void refreshLiqClusters();
    void refreshConfluence();
  }

  // ── Pillar 3: Venue Divergence (W-0122-A) ────────────────────────────
  let venueDivergence = $state<VenueDivergencePayload | null>(null);

  async function refreshVenueDivergence() {
    try {
      venueDivergence = await fetchVenueDivergence(symbol);
    } catch { /* tolerate: next refresh will retry */ }
  }

  // ── Pillar 1: Liquidation Clusters (W-0122-B1) ───────────────────────
  let liqClusters = $state<LiqClusterPayload | null>(null);

  async function refreshLiqClusters() {
    try {
      liqClusters = await fetchLiqClusters(symbol, '4h');
    } catch { /* tolerate */ }
  }

  // ── Rolling Percentile Context (W-0122 rolling percentile) ───────────
  // 30d distribution data: OI deltas + funding history → real percentiles.
  // 10-min cache on the server so polling is cheap.
  let indicatorContext = $state<IndicatorContextPayload | null>(null);

  async function refreshIndicatorContext() {
    try {
      indicatorContext = await fetchIndicatorContext(symbol);
    } catch { /* tolerate */ }
  }

  // ── W-0122-F Free Wins — SSR, RV Cone, Funding Flip ─────────────────
  let ssr = $state<SsrPayload | null>(null);
  let rvCone = $state<RvConePayload | null>(null);
  let fundingFlip = $state<FundingFlipPayload | null>(null);

  async function refreshSsr() {
    try {
      ssr = await fetchSsr();
    } catch { /* tolerate */ }
  }

  async function refreshRvCone() {
    try {
      rvCone = await fetchRvCone(symbol);
    } catch { /* tolerate */ }
  }

  async function refreshFundingFlip() {
    try {
      fundingFlip = await fetchFundingFlip(symbol);
    } catch { /* tolerate */ }
  }

  // ── Funding history (270 bars = ~90d of 8h intervals) → real G curve ──
  let fundingHistory = $state<FundingHistoryPayload | null>(null);

  async function refreshFundingHistory() {
    try {
      fundingHistory = await fetchFundingHistory(symbol, 270);
    } catch { /* tolerate */ }
  }

  // ── Past captures (real historical setups for PAST strip) ─────────────
  let pastCaptures = $state<RecentCaptureSummary[]>([]);

  async function refreshPastCaptures() {
    try {
      pastCaptures = await fetchRecentCaptures(8);
    } catch { /* tolerate */ }
  }

  // ── Pillar 2: Options snapshot (W-0122-C1) ───────────────────────────
  let optionsSnapshot = $state<OptionsSnapshotPayload | null>(null);

  async function refreshOptionsSnapshot() {
    // Deribit supports BTC and ETH currencies.
    const currency = symbol.startsWith('BTC') ? 'BTC' : symbol.startsWith('ETH') ? 'ETH' : null;
    if (!currency) { optionsSnapshot = null; return; }
    try {
      optionsSnapshot = await fetchOptionsSnapshot(currency);
    } catch { /* tolerate */ }
  }

  // ── Confluence Engine (W-0122 master score) ──────────────────────────
  let confluence = $state<ConfluenceResult | null>(null);
  let confluenceHistory = $state<ConfluenceHistoryEntry[]>([]);

  async function refreshConfluence() {
    try {
      confluence = await fetchConfluenceCurrent(symbol, timeframe);
    } catch { /* tolerate */ }
  }

  async function refreshConfluenceHistory() {
    try {
      confluenceHistory = await fetchConfluenceHistory(symbol, 96);
    } catch { /* tolerate */ }
  }

  // Trigger on symbol change + initial mount. Polling every 60s as a safety net
  // (candle close also triggers refresh above). Indicator context polls only
  // every 5m since its server cache TTL is 10m. SSR/RV/flip are slower still.
  $effect(() => {
    void symbol;
    venueDivergence = null;
    liqClusters = null;
    indicatorContext = null;
    ssr = null;
    rvCone = null;
    fundingFlip = null;
    fundingHistory = null;
    optionsSnapshot = null;
    confluence = null;
    confluenceHistory = [];
    void refreshVenueDivergence();
    void refreshLiqClusters();
    void refreshIndicatorContext();
    void refreshSsr();
    void refreshRvCone();
    void refreshFundingFlip();
    void refreshFundingHistory();
    void refreshOptionsSnapshot();
    void refreshConfluence();
    void refreshConfluenceHistory();
    void refreshPastCaptures();
    const fastIv = setInterval(() => {
      void refreshVenueDivergence();
      void refreshLiqClusters();
      void refreshConfluence(); // confluence tracks the venue/liq refresh cadence
      void refreshConfluenceHistory(); // pull updated sparkline entries
    }, 60_000);
    const slowIv = setInterval(() => void refreshIndicatorContext(), 5 * 60_000);
    // SSR server cache is 30min, RV cone is 1h, funding-flip is 10min, options is 5min.
    const flipIv = setInterval(() => void refreshFundingFlip(), 5 * 60_000);
    const ssrIv = setInterval(() => void refreshSsr(), 10 * 60_000);
    const rvIv = setInterval(() => void refreshRvCone(), 30 * 60_000);
    const optIv = setInterval(() => void refreshOptionsSnapshot(), 5 * 60_000);
    return () => {
      clearInterval(fastIv);
      clearInterval(slowIv);
      clearInterval(flipIv);
      clearInterval(ssrIv);
      clearInterval(rvIv);
      clearInterval(optIv);
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

  const workspaceEnvelope = $derived(buildCogochiWorkspaceEnvelope({
    symbol,
    timeframe,
    analyze: analyzeData,
    chartPayload,
    confluence,
    venueDivergence,
    liqClusters,
    optionsSnapshot,
  }));

  const workspaceStudyMap = $derived.by(() => buildStudyMap(workspaceEnvelope.studies));
  const workspaceSummaryCards = $derived.by(() => {
    const summaryIds = workspaceEnvelope.sections.find((section) => section.id === 'summary-hud')?.studyIds ?? [];
    return summaryIds
      .map((id) => workspaceStudyMap[id])
      .filter((study): study is NonNullable<typeof study> => Boolean(study))
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

  function openWorkspaceTab(tab: 'analyze' | 'scan' | 'judge') {
    if (mobileView !== undefined && setMobileView) {
      setMobileView(tab);
      return;
    }
    updateTabState(s => ({ ...s, peekOpen: true, drawerTab: tab }));
  }

  function startSaveSetup() {
    chartSaveMode.enterRangeMode();
  }

  function openCompareWorkspace() {
    openWorkspaceTab('scan');
  }

  function openJudgeWorkspace() {
    openWorkspaceTab('judge');
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
      ...selectedStudies.map((study) => {
        const parts = study.summary
          .filter((row) => row.value != null && row.value !== '')
          .slice(0, 3)
          .map((row) => `${row.label} ${row.value}${row.note ? ` · ${row.note}` : ''}`);
        return `- ${study.title}: ${parts.join(' / ') || '—'}`;
      }),
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
  let sidebarAnalyzeDockCollapsed = $state(true);
  let microstructureView = $state<'candle' | 'heatmap' | 'footprint'>('heatmap');

  // ── Scan core loop state ────────────────────────────────────────────────
  // scanState/scanProgress are used by the live SCAN tab UI.
  // Range selection → ResearchPanel is handled inside ChartBoard via chartSaveMode.
  let scanState = $state<'idle' | 'scanning' | 'done'>('idle');
  let scanProgress = $state(0);

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
  let judgeSubmitResult = $state<TradeOutcomeResult | null>(null);

  // Auto-save outcome to flywheel when user selects WIN/LOSS/FLAT
  $effect(() => {
    const outcome = judgeOutcome;
    if (!outcome) return;
    const snap = analyzeData?.snapshot;
    if (!snap) return;
    // Move state mutation out of sync effect body to avoid Svelte 5 unsafe-mutation warning
    Promise.resolve().then(() => {
      judgeSubmitting = true;
      submitTradeOutcome({
        snapshot: { ...snap, user_verdict: judgeVerdict },
        outcome: outcome === 'win' ? 1 : outcome === 'loss' ? 0 : -1,
        symbol,
        timeframe,
      })
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
    fetchAlphaWorldModel()
      .then((data) => {
        const items = ((data as any).phases ?? [])
          .filter((p: any) => p.phase !== 'IDLE')
          .sort((a: any, b: any) => (_PHASE_ORDER[a.phase] ?? 9) - (_PHASE_ORDER[b.phase] ?? 9))
          .map((p: any) => ({
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

  function toLiveTrade(data: any): MarketTradePrint | null {
    const price = Number.parseFloat(data?.p);
    const qty = Number.parseFloat(data?.q);
    const id = Number(data?.a);
    const time = Number(data?.T);
    if (!Number.isFinite(price) || !Number.isFinite(qty) || !Number.isFinite(id) || !Number.isFinite(time)) return null;
    const isBuyerMaker = Boolean(data?.m);
    return {
      id,
      time,
      price,
      qty,
      notional: price * qty,
      side: isBuyerMaker ? 'SELL' : 'BUY',
      isBuyerMaker,
    };
  }

  function normalizeDepthLevels(rawLevels: any[], maxNotional: number): MarketDepthLevel[] {
    return rawLevels
      .slice(0, 20)
      .map((row) => {
        const price = Number.parseFloat(row?.[0]);
        const qty = Number.parseFloat(row?.[1]);
        return { price, qty, notional: price * qty };
      })
      .filter((level) => Number.isFinite(level.price) && Number.isFinite(level.qty) && level.price > 0 && level.qty > 0)
      .slice(0, 12)
      .map((level) => ({
        ...level,
        weight: level.notional / Math.max(1, maxNotional),
      }));
  }

  function buildLiveOrderbook(bidsRaw: any[], asksRaw: any[], current: number | null): MicroOrderbook {
    const parsedBids = bidsRaw
      .slice(0, 20)
      .map((row) => {
        const price = Number.parseFloat(row?.[0]);
        const qty = Number.parseFloat(row?.[1]);
        return { price, qty, notional: price * qty };
      })
      .filter((level) => Number.isFinite(level.price) && Number.isFinite(level.qty) && level.price > 0 && level.qty > 0);
    const parsedAsks = asksRaw
      .slice(0, 20)
      .map((row) => {
        const price = Number.parseFloat(row?.[0]);
        const qty = Number.parseFloat(row?.[1]);
        return { price, qty, notional: price * qty };
      })
      .filter((level) => Number.isFinite(level.price) && Number.isFinite(level.qty) && level.price > 0 && level.qty > 0);
    const maxNotional = Math.max(1, ...parsedBids.map((level) => level.notional), ...parsedAsks.map((level) => level.notional));
    const bids = normalizeDepthLevels(bidsRaw, maxNotional);
    const asks = normalizeDepthLevels(asksRaw, maxNotional);
    const bidNotional = bids.reduce((sum, level) => sum + level.notional, 0);
    const askNotional = asks.reduce((sum, level) => sum + level.notional, 0);
    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    const refPrice = current ?? (bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null);

    return {
      bestBid,
      bestAsk,
      spreadBps: bestBid != null && bestAsk != null && refPrice != null && refPrice > 0 ? ((bestAsk - bestBid) / refPrice) * 10_000 : null,
      imbalanceRatio: askNotional > 0 ? bidNotional / askNotional : null,
      bidNotional,
      askNotional,
      bids,
      asks,
    };
  }

  function buildFootprintBucketsFromTrades(trades: MarketTradePrint[], current: number | null): FootprintBucket[] {
    if (trades.length === 0) return [];
    const prices = trades.map((trade) => trade.price);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const base = current && current > 0 ? current : prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const bucketSize = Math.max(base * 0.0001, (high - low) / 10, 0.0001);
    const buckets = new Map<number, FootprintBucket>();

    for (const trade of trades) {
      const bucketKey = Math.floor(trade.price / bucketSize);
      const priceLow = bucketKey * bucketSize;
      const existing = buckets.get(bucketKey) ?? {
        price: priceLow + bucketSize / 2,
        priceLow,
        priceHigh: priceLow + bucketSize,
        buyQty: 0,
        sellQty: 0,
        buyNotional: 0,
        sellNotional: 0,
        deltaQty: 0,
        deltaNotional: 0,
        totalNotional: 0,
        tradeCount: 0,
        weight: 0,
      };
      if (trade.side === 'BUY') {
        existing.buyQty += trade.qty;
        existing.buyNotional += trade.notional;
      } else {
        existing.sellQty += trade.qty;
        existing.sellNotional += trade.notional;
      }
      existing.tradeCount += 1;
      existing.totalNotional += trade.notional;
      existing.deltaQty = existing.buyQty - existing.sellQty;
      existing.deltaNotional = existing.buyNotional - existing.sellNotional;
      buckets.set(bucketKey, existing);
    }

    const rows = [...buckets.values()].sort((a, b) => b.price - a.price);
    const maxNotional = Math.max(1, ...rows.map((bucket) => bucket.totalNotional));
    return rows.map((bucket) => ({ ...bucket, weight: bucket.totalNotional / maxNotional }));
  }

  // ── Confidence ───────────────────────────────────────────────────────────
  const confidence = $derived(
    analyzeData?.entryPlan?.confidencePct ??
    (analyzeData?.deep?.total_score != null ? Math.abs(analyzeData.deep.total_score) * 100 : null)
  );
  const confidencePct  = $derived(confidence != null ? `${Math.round(confidence)}%` : '0%');
  const fmtConf        = $derived(confidence != null ? `${Math.round(confidence)}` : '—');
  const confidenceAlpha = $derived(confidence != null ? `α${Math.round(confidence)}` : 'α—');

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
  const analyzeDetailDirection = $derived.by(() => {
    const thesis = workspaceEnvelope.aiContext.thesis?.toLowerCase() ?? '';
    const direction = analyzeData?.ensemble?.direction?.toLowerCase() ?? '';
    return direction.includes('short') || thesis.includes('short') || thesis.includes('bear') ? '숏' : '롱';
  });
  const analyzeDetailThesis = $derived(
    workspaceEnvelope.aiContext.thesis ?? '분석 완료'
  );
  const analyzeDetailWarnings = $derived(workspaceEnvelope.aiContext.warnings ?? []);
  const narrativeDir = $derived(analyzeDetailDirection);
  const narrativeBias = $derived(workspaceEnvelope.aiContext.thesis ?? null);
  const analyzeEvidenceItems = $derived.by(() => {
    const evidenceIds = workspaceEnvelope.sections.find((section) => section.id === 'evidence-log')?.studyIds ?? [];
    const items = evidenceIds
      .map((id) => workspaceStudyMap[id])
      .filter((study): study is NonNullable<typeof study> => Boolean(study))
      .map((study) => {
        const primary = study.summary[0];
        const secondary = study.summary[1];
        return {
          k: primary?.label ?? study.title,
          v: primary?.value == null || primary.value === '' ? '—' : String(primary.value),
          note:
            primary?.note ??
            (secondary
              ? `${secondary.label}${secondary.value != null && secondary.value !== '' ? ` ${secondary.value}` : ''}`
              : study.title),
          pos: primary?.tone !== 'bear' && primary?.tone !== 'warn',
        };
      });

    if (items.length > 0) return items;

    const fallbackItems = evidenceIds
      .flatMap((id) => {
        const study = workspaceStudyMap[id];
        if (!study) return [];
        return study.summary
          .filter((row) => row.value != null && row.value !== '')
          .slice(0, 2)
          .map((row) => ({
            k: row.label,
            v: String(row.value ?? '—'),
            note: row.note ?? study.title,
            pos: row.tone !== 'bear' && row.tone !== 'warn',
          }));
      })
      .slice(0, 6);

    return fallbackItems.length > 0 ? fallbackItems : [{ k: '분석 중', v: '...', note: '', pos: true }];
  });
  const analyzeExecutionProposal = $derived.by(() => {
    const study = workspaceStudyMap.execution;
    if (!study) {
      return [
        { label: 'ENTRY',  val: '—', hint: '', tone: '' as '' | 'neg' | 'pos' },
        { label: 'STOP',   val: '—', hint: '', tone: 'neg' as '' | 'neg' | 'pos' },
        { label: 'TARGET', val: '—', hint: '', tone: 'pos' as '' | 'neg' | 'pos' },
        { label: 'R:R',    val: '—', hint: '', tone: '' as '' | 'neg' | 'pos' },
      ];
    }

    if (study.summary.length === 0) return [];

    return study.summary.map((row) => ({
      label: row.label.toUpperCase(),
      val: row.value == null || row.value === '' ? '—' : String(row.value),
      hint: row.note ?? '',
      tone: (row.tone === 'bull' ? 'pos' : row.tone === 'bear' ? 'neg' : '') as '' | 'neg' | 'pos',
    }));
  });
  const evidencePos = $derived(analyzeEvidenceItems.filter(e => e.pos).length);
  const evidenceNeg = $derived(analyzeEvidenceItems.filter(e => !e.pos).length);

  const currentPhase = $derived.by(() => {
    const haystack = [
      analyzeDetailThesis,
      analyzeData?.deep?.verdict,
      analyzeData?.ensemble?.reason,
      analyzeData?.riskPlan?.bias,
      analyzeData?.snapshot?.regime,
    ].filter(Boolean).join(' ').toLowerCase();

    if (haystack.includes('breakout') || haystack.includes('돌파')) return 'BREAKOUT WATCH';
    if (haystack.includes('accum') || haystack.includes('축적')) return 'ACCUMULATION';
    if (haystack.includes('dump') || haystack.includes('flush')) return 'REAL DUMP';
    if (haystack.includes('range') || haystack.includes('arch')) return 'ARCH ZONE';
    return analyzeData?.snapshot?.regime ?? 'STRUCTURE';
  });

  const marketBias = $derived.by(() => {
    const raw = analyzeData?.riskPlan?.bias ?? analyzeData?.ensemble?.direction ?? analyzeDetailDirection;
    const normalized = String(raw || '').toLowerCase();
    if (normalized.includes('short') || normalized.includes('bear') || normalized.includes('숏')) return 'BEAR';
    if (normalized.includes('long') || normalized.includes('bull') || normalized.includes('롱')) return 'BULL';
    return raw ? String(raw).toUpperCase() : 'NEUTRAL';
  });

  const hudStateRows = $derived.by(() => [
    { label: 'Pattern', value: analyzeData?.mode ?? 'Tradoor v2' },
    { label: 'Phase', value: currentPhase },
    { label: 'Bias', value: marketBias },
    { label: 'TF', value: timeframe.toUpperCase() },
  ]);

  const hudEvidenceItems = $derived.by(() => analyzeEvidenceItems.slice(0, 3));

  const riskItems = $derived.by(() => {
    const items = [
      analyzeData?.riskPlan?.invalidation ? `Invalidation · ${analyzeData.riskPlan.invalidation}` : null,
      analyzeData?.riskPlan?.riskTrigger ? `Trigger risk · ${analyzeData.riskPlan.riskTrigger}` : null,
      analyzeData?.riskPlan?.crowding ? `Crowding · ${analyzeData.riskPlan.crowding}` : null,
      analyzeData?.riskPlan?.avoid ? `Avoid · ${analyzeData.riskPlan.avoid}` : null,
      ...analyzeDetailWarnings,
    ]
      .filter((item): item is string => Boolean(item))
      .filter((item, idx, arr) => arr.indexOf(item) === idx)
      .slice(0, 3);

    return items.length > 0 ? items : ['Breakout confirmation required', 'Fresh low break invalidates setup'];
  });

  const phaseTimeline = $derived.by(() => {
    const labels = ['FAKE DUMP', 'ARCH ZONE', 'REAL DUMP', 'ACCUMULATION', 'BREAKOUT'];
    const phase = currentPhase.toLowerCase();
    const activeIndex = phase.includes('breakout')
      ? 4
      : phase.includes('accum')
        ? 3
        : phase.includes('dump')
          ? 2
          : phase.includes('arch')
            ? 1
            : 0;

    return labels.map((label, index) => ({
      label,
      state: index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending',
    }));
  });

  const evidenceTableRows = $derived.by(() => {
    const rows = analyzeEvidenceItems.map((item) => ({
      feature: item.k,
      value: item.v,
      threshold: item.pos ? 'pass zone' : 'watch',
      status: item.pos ? 'PASS' : 'FAIL',
      why: item.note || 'engine evidence',
      pos: item.pos,
    }));

    if (rows.length > 0) return rows.slice(0, 8);

    return [
      { feature: 'OI', value: '—', threshold: 'context', status: 'WAIT', why: 'open interest pane', pos: true },
      { feature: 'Funding', value: '—', threshold: 'flip/overheat', status: 'WAIT', why: 'funding pane', pos: true },
      { feature: 'CVD', value: '—', threshold: 'divergence', status: 'WAIT', why: 'flow pane', pos: true },
    ];
  });

  const compareCards = $derived.by(() => [
    {
      label: 'Current vs TRADOOR',
      value: `${scanCandidates.length} live`,
      note: 'world-model candidates',
      action: openCompareWorkspace,
    },
    {
      label: 'Current vs Saved',
      value: `${pastCaptures.length} saved`,
      note: 'recent capture memory',
      action: openCompareWorkspace,
    },
    {
      label: 'Near Miss',
      value: scanSelected ? scanSelected.replace('USDT', '') : 'select',
      note: 'failure-case compare',
      action: openCompareWorkspace,
    },
  ]);

  const ledgerStats = $derived.by(() => {
    const outcomeReady = pastCaptures.filter((capture) => capture.status === 'outcome_ready').length;
    const verdictReady = pastCaptures.filter((capture) => capture.status === 'verdict_ready').length;
    return [
      { label: 'Saved', value: String(pastCaptures.length), note: 'captures' },
      { label: 'Outcome', value: String(outcomeReady), note: 'ready' },
      { label: 'Verdict', value: String(verdictReady), note: 'ready' },
    ];
  });

  const judgmentOptions = [
    { label: 'Valid', tone: 'pos' },
    { label: 'Invalid', tone: 'neg' },
    { label: 'Too Early', tone: 'warn' },
    { label: 'Too Late', tone: 'warn' },
    { label: 'Near Miss', tone: 'neutral' },
  ];

  const microBars = $derived.by<ChartBar[]>(() => {
    const realBars = chartPayload?.klines ?? [];
    if (realBars.length > 0) return realBars;

    const base = currentPrice > 0
      ? currentPrice
      : symbol.startsWith('BTC')
        ? 64280
        : symbol.startsWith('ETH')
          ? 3160
          : 100;
    const now = Math.floor(Date.now() / 1000);
    const stepSec = timeframe.endsWith('m')
      ? Number.parseInt(timeframe, 10) * 60
      : timeframe.endsWith('h')
        ? Number.parseInt(timeframe, 10) * 3600
        : 86400;

    return Array.from({ length: 36 }, (_, index) => {
      const wave = Math.sin(index * 0.78) * 0.006 + Math.cos(index * 0.31) * 0.004;
      const drift = (index - 18) * 0.00042;
      const close = base * (1 + wave + drift);
      const open = base * (1 + Math.sin((index - 1) * 0.78) * 0.0055 + (index - 19) * 0.00038);
      const spread = base * (0.0016 + Math.abs(Math.sin(index * 0.47)) * 0.0018);
      const high = Math.max(open, close) + spread;
      const low = Math.min(open, close) - spread;
      const volume = 720 + Math.abs(Math.sin(index * 0.9)) * 2200 + (index % 7 === 0 ? 1800 : 0);

      return {
        time: now - (36 - index) * stepSec,
        open,
        high,
        low,
        close,
        volume,
      };
    });
  });

  const activeOrderbook = $derived<MicroOrderbook | null>(liveOrderbook ?? microstructurePayload?.orderbook ?? null);
  const activeTrades = $derived<MarketTradePrint[]>(liveTrades.length > 0 ? liveTrades : microstructurePayload?.tradeTape.trades ?? []);
  const activeCurrentMicroPrice = $derived.by(() => {
    if (activeTrades[0]?.price) return activeTrades[0].price;
    if (microstructurePayload?.currentPrice) return microstructurePayload.currentPrice;
    const book = activeOrderbook;
    if (book?.bestBid != null && book?.bestAsk != null) return (book.bestBid + book.bestAsk) / 2;
    return currentPrice > 0 ? currentPrice : microBars[microBars.length - 1]?.close ?? null;
  });
  const activeFootprintBuckets = $derived.by(() => {
    if (liveTrades.length > 0) return buildFootprintBucketsFromTrades(liveTrades, activeCurrentMicroPrice);
    return microstructurePayload?.footprint.buckets ?? [];
  });
  const activeHeatmapBands = $derived.by(() => {
    const book = activeOrderbook;
    if (!book) return microstructurePayload?.heatmap.bands ?? [];
    return [
      ...book.asks.map((level) => ({ price: level.price, side: 'ask' as const, notional: level.notional, intensity: level.weight })),
      ...book.bids.map((level) => ({ price: level.price, side: 'bid' as const, notional: level.notional, intensity: level.weight })),
    ].sort((a, b) => b.price - a.price);
  });

  const microStats = $derived.by(() => {
    if (liveTrades.length > 0 || liveOrderbook) {
      const book = activeOrderbook;
      const trades = activeTrades;
      const bidNotional = book?.bidNotional ?? 0;
      const askNotional = book?.askNotional ?? 0;
      const totalDepth = bidNotional + askNotional;
      const imbalancePct = totalDepth > 0 ? ((bidNotional - askNotional) / totalDepth) * 100 : 0;
      const spanMs = trades.length > 1 ? Math.max(1, trades[0].time - trades[trades.length - 1].time) : 0;
      const tradesPerMinute = spanMs > 0 ? (trades.length / spanMs) * 60_000 : null;
      const recentNotional = trades.reduce((sum, trade) => sum + trade.notional, 0);
      const topDepthNotional =
        (book?.bids.slice(0, 3).reduce((sum, level) => sum + level.notional, 0) ?? 0) +
        (book?.asks.slice(0, 3).reduce((sum, level) => sum + level.notional, 0) ?? 0);
      const absorptionPct = topDepthNotional + recentNotional > 0
        ? (topDepthNotional / (topDepthNotional + recentNotional)) * 100
        : null;

      return {
        spreadBps: book?.spreadBps != null ? `${book.spreadBps.toFixed(1)} bps` : '—',
        imbalancePct,
        imbalanceLabel: `${imbalancePct >= 0 ? '+' : ''}${imbalancePct.toFixed(0)}%`,
        tapeSpeed: tradesPerMinute != null ? `${tradesPerMinute.toFixed(0)}/m` : '—',
        absorptionLabel: absorptionPct != null ? `${absorptionPct.toFixed(0)}%` : '—',
      };
    }

    const realStats = microstructurePayload?.stats;
    if (realStats) {
      const imbalancePct = realStats.imbalancePct ?? 0;
      const tradesPerMinute = realStats.tradesPerMinute;
      return {
        spreadBps: realStats.spreadBps != null ? `${realStats.spreadBps.toFixed(1)} bps` : '—',
        imbalancePct,
        imbalanceLabel: `${imbalancePct >= 0 ? '+' : ''}${imbalancePct.toFixed(0)}%`,
        tapeSpeed: tradesPerMinute != null ? `${tradesPerMinute.toFixed(0)}/m` : '—',
        absorptionLabel: realStats.absorptionPct != null ? `${realStats.absorptionPct.toFixed(0)}%` : '—',
      };
    }

    const bars = microBars;
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    const price = analyzeData?.price ?? last?.close ?? 0;
    const spreadBps = price > 0 && last
      ? Math.max(0.6, ((last.high - last.low) / price) * 10000 * 0.08)
      : 0;
    const recent = bars.slice(-24);
    const upVolume = recent.reduce((sum, bar) => sum + (bar.close >= bar.open ? bar.volume : 0), 0);
    const downVolume = recent.reduce((sum, bar) => sum + (bar.close < bar.open ? bar.volume : 0), 0);
    const total = Math.max(1, upVolume + downVolume);
    const imbalancePct = ((upVolume - downVolume) / total) * 100;
    const tapeSpeed = recent.reduce((sum, bar) => sum + bar.volume, 0) / Math.max(1, recent.length);
    const absorption = prev && last
      ? Math.abs(last.close - last.open) / Math.max(1e-9, last.high - last.low)
      : 0;
    return {
      spreadBps: spreadBps ? `${spreadBps.toFixed(1)} bps` : '—',
      imbalancePct,
      imbalanceLabel: `${imbalancePct >= 0 ? '+' : ''}${imbalancePct.toFixed(0)}%`,
      tapeSpeed: tapeSpeed > 1000 ? `${(tapeSpeed / 1000).toFixed(1)}k` : tapeSpeed.toFixed(0),
      absorptionLabel: `${Math.round((1 - Math.min(1, absorption)) * 100)}%`,
    };
  });

  const domLadderRows = $derived.by(() => {
    const orderbook = activeOrderbook;
    if (orderbook && (orderbook.bids.length > 0 || orderbook.asks.length > 0)) {
      const asks = orderbook.asks.slice(0, 6).reverse().map((level) => ({
        price: _fmtNum(level.price),
        bid: '—',
        ask: level.notional > 1000 ? `${(level.notional / 1000).toFixed(1)}k` : level.notional.toFixed(0),
        bidWidth: '0%',
        askWidth: `${Math.max(8, Math.min(100, level.weight * 100))}%`,
        delta: -level.notional,
        isMid: false,
      }));
      const midpoint =
        orderbook.bestBid != null && orderbook.bestAsk != null
          ? (orderbook.bestBid + orderbook.bestAsk) / 2
          : activeCurrentMicroPrice ?? 0;
      const mid = {
        price: midpoint > 0 ? _fmtNum(midpoint) : '—',
        bid: 'MID',
        ask: orderbook.spreadBps != null ? `${orderbook.spreadBps.toFixed(1)}bps` : 'MID',
        bidWidth: '28%',
        askWidth: '28%',
        delta: 0,
        isMid: true,
      };
      const bids = orderbook.bids.slice(0, 6).map((level) => ({
        price: _fmtNum(level.price),
        bid: level.notional > 1000 ? `${(level.notional / 1000).toFixed(1)}k` : level.notional.toFixed(0),
        ask: '—',
        bidWidth: `${Math.max(8, Math.min(100, level.weight * 100))}%`,
        askWidth: '0%',
        delta: level.notional,
        isMid: false,
      }));
      return [...asks, mid, ...bids];
    }

    const bars = microBars;
    const last = bars[bars.length - 1];
    const price = analyzeData?.price ?? last?.close ?? 0;
    const step = price > 0 ? Math.max(price * 0.00045, 0.0001) : 10;
    const recentVolume = Math.max(1, bars.slice(-24).reduce((sum, bar) => sum + bar.volume, 0) / 24);
    const levels = Array.from({ length: 13 }, (_, i) => i - 6).reverse();

    return levels.map((offset) => {
      const levelPrice = price > 0 ? price + offset * step : offset * step;
      const distance = Math.abs(offset);
      const sideBias = offset < 0 ? 1.18 : offset > 0 ? 0.86 : 1;
      const base = Math.max(0.16, 1 - distance / 8);
      const wave = 0.72 + Math.abs(Math.sin((levelPrice || offset) * 0.013)) * 0.7;
      const bid = recentVolume * base * sideBias * wave;
      const ask = recentVolume * base * (2 - sideBias) * (1.52 - wave * 0.36);
      const max = Math.max(bid, ask, 1);
      const delta = bid - ask;

      return {
        price: _fmtNum(levelPrice),
        bid: bid > 1000 ? `${(bid / 1000).toFixed(1)}k` : bid.toFixed(0),
        ask: ask > 1000 ? `${(ask / 1000).toFixed(1)}k` : ask.toFixed(0),
        bidWidth: `${Math.max(8, Math.min(100, (bid / max) * 100))}%`,
        askWidth: `${Math.max(8, Math.min(100, (ask / max) * 100))}%`,
        delta,
        isMid: offset === 0,
      };
    });
  });

  const timeSalesRows = $derived.by(() => {
    const trades = activeTrades;
    if (trades.length > 0) {
      const maxNotional = Math.max(1, ...trades.slice(0, 18).map((trade) => trade.notional));
      return trades.slice(0, 18).map((trade) => ({
        time: new Date(trade.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        side: trade.side,
        price: _fmtNum(trade.price),
        size: trade.notional > 1000 ? `${(trade.notional / 1000).toFixed(1)}k` : trade.notional.toFixed(0),
        intensity: `${Math.max(12, Math.min(100, (trade.notional / maxNotional) * 100))}%`,
      }));
    }

    const bars = microBars;
    return bars.slice(-18).reverse().map((bar) => {
      const body = Math.abs(bar.close - bar.open);
      const range = Math.max(1e-9, bar.high - bar.low);
      const directional = body / range;
      const isBuy = bar.close >= bar.open;
      const size = bar.volume * (0.45 + directional * 0.55);
      return {
        time: new Date(bar.time * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        side: isBuy ? 'BUY' : 'SELL',
        price: _fmtNum(bar.close),
        size: size > 1000 ? `${(size / 1000).toFixed(1)}k` : size.toFixed(0),
        intensity: `${Math.max(14, Math.min(100, directional * 100))}%`,
      };
    });
  });

  const footprintRows = $derived.by(() => {
    const buckets = activeFootprintBuckets;
    if (buckets.length > 0) {
      return buckets.slice(0, 12).map((bucket) => ({
        price: _fmtNum(bucket.price),
        bid: bucket.sellNotional > 1000 ? `${(bucket.sellNotional / 1000).toFixed(1)}k` : bucket.sellNotional.toFixed(0),
        ask: bucket.buyNotional > 1000 ? `${(bucket.buyNotional / 1000).toFixed(1)}k` : bucket.buyNotional.toFixed(0),
        deltaLabel: `${bucket.deltaNotional >= 0 ? '+' : ''}${Math.abs(bucket.deltaNotional) > 1000 ? `${(bucket.deltaNotional / 1000).toFixed(1)}k` : bucket.deltaNotional.toFixed(0)}`,
        delta: bucket.deltaNotional,
        width: `${Math.max(8, Math.min(100, bucket.weight * 100))}%`,
      }));
    }

    const bars = microBars;
    const sample = bars.slice(-12).reverse();
    const maxVolume = Math.max(1, ...sample.map((bar) => bar.volume));
    return sample.map((bar) => {
      const range = Math.max(1e-9, bar.high - bar.low);
      const closePos = Math.max(0, Math.min(1, (bar.close - bar.low) / range));
      const buy = bar.volume * (0.32 + closePos * 0.56);
      const sell = Math.max(0, bar.volume - buy);
      const delta = buy - sell;
      return {
        price: _fmtNum(bar.close),
        bid: sell > 1000 ? `${(sell / 1000).toFixed(1)}k` : sell.toFixed(0),
        ask: buy > 1000 ? `${(buy / 1000).toFixed(1)}k` : buy.toFixed(0),
        deltaLabel: `${delta >= 0 ? '+' : ''}${delta > 1000 || delta < -1000 ? `${(delta / 1000).toFixed(1)}k` : delta.toFixed(0)}`,
        delta,
        width: `${Math.max(8, Math.min(100, (bar.volume / maxVolume) * 100))}%`,
      };
    });
  });

  const heatmapRows = $derived.by(() => {
    const realBands = activeHeatmapBands;
    const trades = activeTrades;
    if (realBands.length > 0) {
      const sortedBands = [...realBands].sort((a, b) => b.price - a.price);
      const bandStep = Math.max(1, Math.floor(sortedBands.length / 7));
      const selectedBands = sortedBands.filter((_, index) => index % bandStep === 0).slice(0, 7);
      const tapeCells = trades.length > 0
        ? trades.slice(0, 18).reverse()
        : selectedBands.map((band, index) => ({
            price: band.price,
            side: band.side === 'bid' ? 'BUY' : 'SELL',
            notional: band.notional,
            id: index,
            time: Date.now(),
            qty: 0,
            isBuyerMaker: band.side !== 'bid',
          }));
      const prices = tapeCells.map((trade) => trade.price);
      const span = Math.max(1e-9, Math.max(...prices) - Math.min(...prices));
      const maxNotional = Math.max(1, ...tapeCells.map((trade) => trade.notional));

      return selectedBands.map((band) => ({
        price: _fmtNum(band.price),
        cells: tapeCells.map((trade) => {
          const distance = Math.min(1, Math.abs(trade.price - band.price) / span);
          const intensity = Math.max(0.04, Math.min(1, band.intensity * 0.55 + (trade.notional / maxNotional) * 0.3 + (1 - distance) * 0.2));
          return {
            intensity,
            side: trade.side === 'BUY' ? 'buy' : 'sell',
            label: `${_fmtNum(trade.price)} · ${Math.round(intensity * 100)}%`,
          };
        }),
      }));
    }

    const bars = microBars.slice(-18);
    const highs = bars.map((bar) => bar.high);
    const lows = bars.map((bar) => bar.low);
    const high = Math.max(...highs, analyzeData?.price ?? 1);
    const low = Math.min(...lows, analyzeData?.price ?? 1);
    const span = Math.max(1e-9, high - low);
    const volumeMax = Math.max(1, ...bars.map((bar) => bar.volume));
    const fallbackBands = Array.from({ length: 7 }, (_, band) => {
      const pct = band / 6;
      const price = high - span * pct;
      return {
        price: _fmtNum(price),
        cells: bars.map((bar, index) => {
          const inRange = price <= bar.high && price >= bar.low;
          const distance = Math.abs(price - bar.close) / span;
          const liq = chartPayload?.liqBars?.[chartPayload.liqBars.length - bars.length + index];
          const liqBoost = liq ? Math.min(1, (liq.longUsd + liq.shortUsd) / 2_500_000) : 0;
          const volumeBoost = Math.min(1, bar.volume / volumeMax);
          const intensity = inRange
            ? Math.max(0.16, Math.min(1, volumeBoost * 0.72 + liqBoost * 0.38 + (1 - distance) * 0.22))
            : Math.max(0.04, (1 - distance) * 0.12);
          return {
            intensity,
            side: bar.close >= bar.open ? 'buy' : 'sell',
            label: `${_fmtNum(bar.close)} · ${Math.round(intensity * 100)}%`,
          };
        }),
      };
    });
    return fallbackBands;
  });

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

<div bind:this={containerEl} class="trade-mode" class:observe-mode={workMode === 'observe'} class:analyze-mode={workMode === 'analyze'} class:execute-mode={workMode === 'execute'}>
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
            <span class="bull" aria-label="Recommendation">{analyzeDetailDirection} 진입 권장 ·</span> {analyzeDetailThesis}
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
            {#each analyzeEvidenceItems as item}
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
            {#each analyzeExecutionProposal as p}
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
          {#if analyzeDetailThesis}
            <span class="jc-bias">{analyzeDetailDirection} 편향</span>
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
  {#if workMode !== 'observe'}
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
  {/if}

  <!-- ═══ LAYOUT C · Chart + peek bar + sidebar (merged C+D) ═══════════════ -->
  <div class="layout-c">
    <div class="chart-section lc-main">
    <div class="chart-header">
      <button class="symbol" onclick={() => onSymbolTap?.()} title="심볼 변경">{symbol}</button>
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
      <div class="micro-toggle" role="group" aria-label="Chart microstructure view">
        <button
          class="micro-toggle-btn"
          class:active={microstructureView === 'candle'}
          type="button"
          aria-pressed={microstructureView === 'candle'}
          onclick={() => microstructureView = 'candle'}
        >CANDLE</button>
        <button
          class="micro-toggle-btn"
          class:active={microstructureView === 'heatmap'}
          type="button"
          aria-pressed={microstructureView === 'heatmap'}
          onclick={() => microstructureView = 'heatmap'}
        >HEATMAP</button>
        <button
          class="micro-toggle-btn"
          class:active={microstructureView === 'footprint'}
          type="button"
          aria-pressed={microstructureView === 'footprint'}
          onclick={() => microstructureView = 'footprint'}
        >FOOTPRINT</button>
      </div>
      <span class="spacer"></span>
      <div class="evidence-badge">
        <span class="ev-pos">{evidencePos}</span><span class="ev-sep">/</span><span class="ev-neg">{evidenceNeg}</span>
      </div>
      <div class="conf-inline">
        <div class="conf-bar"><div class="conf-fill" style:width={confidencePct}></div></div>
        <span class="conf-val">{confidenceAlpha}</span>
      </div>
      <button class="chart-save-compact" type="button" onclick={startSaveSetup}>SAVE RANGE</button>
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

    <div class="microstructure-belt" data-view={microstructureView} aria-label="Market microstructure belt">
      <div class="micro-belt-title">
        <span class="micro-kicker">
          {microWsState === 'live'
            ? 'BINANCE WS LIVE'
            : microWsState === 'connecting'
              ? 'CONNECTING WS'
              : microstructurePayload
                ? 'BINANCE SNAPSHOT'
                : microstructureLoading
                  ? 'LOADING DEPTH'
                  : 'FALLBACK SHELL'}
        </span>
        <strong>{microstructureView.toUpperCase()}</strong>
      </div>
      <div class="micro-belt-stats" aria-label="Market depth summary">
        <span class="micro-stat"><b>Spread</b>{microStats.spreadBps}</span>
        <span class="micro-stat" class:buy={microStats.imbalancePct >= 0} class:sell={microStats.imbalancePct < 0}>
          <b>Imbalance</b>{microStats.imbalanceLabel}
        </span>
        <span class="micro-stat"><b>Tape</b>{microStats.tapeSpeed}</span>
        <span class="micro-stat"><b>Absorb</b>{microStats.absorptionLabel}</span>
      </div>
      <div class="micro-heat-strip" class:active={microstructureView === 'heatmap'} aria-label="Liquidity heat strip">
        {#each (heatmapRows[3]?.cells ?? []).slice(-16) as cell}
          <span
            class="micro-heat-cell"
            class:buy={cell.side === 'buy'}
            class:sell={cell.side === 'sell'}
            style:opacity={0.18 + cell.intensity * 0.82}
            title={cell.label}
          ></span>
        {/each}
      </div>
      <div class="micro-depth-strip" class:active={microstructureView === 'footprint'} aria-label="DOM depth strip">
        {#each domLadderRows.slice(4, 9) as row}
          <div class="micro-depth-row" class:mid={row.isMid}>
            <span class="depth-bid" style:width={row.bidWidth}></span>
            <span class="depth-price">{row.price}</span>
            <span class="depth-ask" style:width={row.askWidth}></span>
          </div>
        {/each}
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
            <span class="pb-txt">{analyzeDetailDirection} 진입 권장</span>
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
            <div class="workspace-body">
              <section class="workspace-hero" aria-label="Analyze thesis and phase path">
                <div class="workspace-hero-copy">
                  <span class="workspace-kicker">PHASE TIMELINE</span>
                  <div class="workspace-thesis">
                    <span class="bull">{analyzeDetailDirection} view ·</span>
                    {' '}{analyzeDetailThesis}
                  </div>
                </div>
                <div class="phase-timeline" role="list" aria-label="Pattern phase timeline">
                  {#each phaseTimeline as phase}
                    <div class="phase-node" class:done={phase.state === 'done'} class:active={phase.state === 'active'} role="listitem">
                      <span class="phase-dot"></span>
                      <span class="phase-label">{phase.label}</span>
                    </div>
                  {/each}
                </div>
              </section>

              <div class="market-depth-grid" aria-label="Market microstructure workspace">
                <section class="workspace-panel depth-panel dom-ladder-panel" class:selected={microstructureView === 'footprint'} aria-label="DOM ladder">
                  <div class="workspace-panel-head">
                    <span class="workspace-kicker">DOM LADDER</span>
                    <span class="workspace-panel-copy">bid depth · ask depth · mid liquidity</span>
                  </div>
                  <div class="dom-ladder" role="table" aria-label="Depth of market ladder">
                    <div class="dom-row dom-head" role="row">
                      <span role="columnheader">BID</span>
                      <span role="columnheader">PRICE</span>
                      <span role="columnheader">ASK</span>
                    </div>
                    {#each domLadderRows as row}
                      <div class="dom-row" class:mid={row.isMid} class:bid-heavy={row.delta > 0} class:ask-heavy={row.delta < 0} role="row">
                        <span class="dom-side bid" role="cell">
                          <span class="dom-bar bid" style:width={row.bidWidth}></span>
                          <span class="dom-val">{row.bid}</span>
                        </span>
                        <span class="dom-price" role="cell">{row.price}</span>
                        <span class="dom-side ask" role="cell">
                          <span class="dom-bar ask" style:width={row.askWidth}></span>
                          <span class="dom-val">{row.ask}</span>
                        </span>
                      </div>
                    {/each}
                  </div>
                </section>

                <section class="workspace-panel depth-panel tape-panel" aria-label="Time and sales">
                  <div class="workspace-panel-head">
                    <span class="workspace-kicker">TIME & SALES</span>
                    <span class="workspace-panel-copy">aggressor side and print intensity</span>
                  </div>
                  <div class="tape-list" aria-label="Recent trade tape">
                    {#each timeSalesRows as row}
                      <div class="tape-row" class:buy={row.side === 'BUY'} class:sell={row.side === 'SELL'}>
                        <span class="tape-time">{row.time}</span>
                        <span class="tape-side">{row.side}</span>
                        <span class="tape-price">{row.price}</span>
                        <span class="tape-size">{row.size}</span>
                        <span class="tape-intensity"><span style:width={row.intensity}></span></span>
                      </div>
                    {/each}
                    {#if timeSalesRows.length === 0}
                      <div class="depth-empty">waiting for trade tape payload</div>
                    {/if}
                  </div>
                </section>

                <section class="workspace-panel depth-panel footprint-panel" class:selected={microstructureView === 'footprint'} aria-label="Footprint table">
                  <div class="workspace-panel-head">
                    <span class="workspace-kicker">FOOTPRINT</span>
                    <span class="workspace-panel-copy">bid x ask delta by price bucket</span>
                  </div>
                  <div class="footprint-table" role="table" aria-label="Footprint buckets">
                    <div class="footprint-row footprint-head" role="row">
                      <span role="columnheader">BID</span>
                      <span role="columnheader">PRICE</span>
                      <span role="columnheader">ASK</span>
                      <span role="columnheader">DELTA</span>
                    </div>
                    {#each footprintRows as row}
                      <div class="footprint-row" class:buy={row.delta >= 0} class:sell={row.delta < 0} role="row">
                        <span role="cell">{row.bid}</span>
                        <span role="cell">{row.price}</span>
                        <span role="cell">{row.ask}</span>
                        <span role="cell">{row.deltaLabel}</span>
                        <span class="footprint-volume" style:width={row.width}></span>
                      </div>
                    {/each}
                  </div>
                </section>

                <section class="workspace-panel depth-panel heatmap-panel" class:selected={microstructureView === 'heatmap'} aria-label="Liquidity heatmap">
                  <div class="workspace-panel-head">
                    <span class="workspace-kicker">LIQ HEATMAP</span>
                    <span class="workspace-panel-copy">volume/liquidation concentration bands</span>
                  </div>
                  <div class="heatmap-grid" aria-label="Liquidity heatmap matrix">
                    {#each heatmapRows as band}
                      <div class="heatmap-row">
                        <span class="heat-price">{band.price}</span>
                        <span class="heat-cells">
                          {#each band.cells as cell}
                            <span
                              class="heat-cell"
                              class:buy={cell.side === 'buy'}
                              class:sell={cell.side === 'sell'}
                              style:opacity={0.16 + cell.intensity * 0.84}
                              title={cell.label}
                            ></span>
                          {/each}
                        </span>
                      </div>
                    {/each}
                  </div>
                </section>
              </div>

              <div class="workspace-grid">
                <section class="workspace-panel evidence-table-panel" aria-label="Feature evidence table">
                  <div class="workspace-panel-head">
                    <span class="workspace-kicker">EVIDENCE TABLE</span>
                    <span class="workspace-panel-copy">raw values and threshold status stay here, not in the HUD</span>
                  </div>
                  <div class="evidence-table" role="table" aria-label="Evidence table">
                    <div class="evidence-table-row header" role="row">
                      <span role="columnheader">Feature</span>
                      <span role="columnheader">Value</span>
                      <span role="columnheader">Threshold</span>
                      <span role="columnheader">Status</span>
                      <span role="columnheader">Why</span>
                    </div>
                    {#each evidenceTableRows as row}
                      <div class="evidence-table-row" class:pass={row.pos} class:fail={!row.pos} role="row">
                        <span role="cell">{row.feature}</span>
                        <span role="cell">{row.value}</span>
                        <span role="cell">{row.threshold}</span>
                        <span role="cell">{row.status}</span>
                        <span role="cell">{row.why}</span>
                      </div>
                    {/each}
                  </div>
                </section>

                <section class="workspace-panel compare-panel" aria-label="Compare workspace">
                  <div class="workspace-panel-head">
                    <span class="workspace-kicker">COMPARE</span>
                    <span class="workspace-panel-copy">pattern-object comparisons</span>
                  </div>
                  <div class="compare-card-stack">
                    {#each compareCards as card}
                      <button class="compare-card" type="button" onclick={card.action}>
                        <span class="compare-label">{card.label}</span>
                        <span class="compare-value">{card.value}</span>
                        <span class="compare-note">{card.note}</span>
                      </button>
                    {/each}
                  </div>
                  <button class="workspace-primary-action" type="button" onclick={openCompareWorkspace}>Open Compare Workspace</button>
                </section>
              </div>

              <div class="workspace-bottom-grid">
                <section class="workspace-panel ledger-panel" aria-label="Pattern ledger">
                  <div class="workspace-panel-head">
                    <span class="workspace-kicker">LEDGER</span>
                    <span class="workspace-panel-copy">saved evidence memory</span>
                  </div>
                  <div class="ledger-stats">
                    {#each ledgerStats as stat}
                      <div class="ledger-stat">
                        <span class="ledger-label">{stat.label}</span>
                        <span class="ledger-value">{stat.value}</span>
                        <span class="ledger-note">{stat.note}</span>
                      </div>
                    {/each}
                  </div>
                </section>

                <section class="workspace-panel judgment-panel" aria-label="User refinement judgment">
                  <div class="workspace-panel-head">
                    <span class="workspace-kicker">JUDGMENT</span>
                    <span class="workspace-panel-copy">turn reading into refinement data</span>
                  </div>
                  <div class="judgment-options">
                    {#each judgmentOptions as option}
                      <button
                        class="judgment-option"
                        class:tone-pos={option.tone === 'pos'}
                        class:tone-neg={option.tone === 'neg'}
                        class:tone-warn={option.tone === 'warn'}
                        type="button"
                        onclick={() => {
                          if (option.label === 'Valid') judgeVerdict = 'agree';
                          if (option.label === 'Invalid') judgeVerdict = 'disagree';
                          openJudgeWorkspace();
                        }}
                      >
                        {option.label}
                      </button>
                    {/each}
                  </div>
                </section>

                <section class="workspace-panel execution-panel" aria-label="Execution handoff">
                  <div class="workspace-panel-head">
                    <span class="workspace-kicker">EXECUTION</span>
                    <span class="workspace-panel-copy">isolated from decision HUD</span>
                  </div>
                  <div class="execution-mini-grid">
                    {#each analyzeExecutionProposal as p}
                      <div class="prop-cell" class:tone-pos={p.tone === 'pos'} class:tone-neg={p.tone === 'neg'}>
                        <span class="prop-l">{p.label}</span>
                        <span class="prop-v">{p.val}</span>
                      </div>
                    {/each}
                  </div>
                </section>
              </div>

              <div class="workspace-action-strip">
                <button class="analyze-action-btn ai" type="button" onclick={openAnalyzeAIDetail}>
                  <span class="analyze-action-k">AI</span>
                  <span class="analyze-action-t">Explain current workspace</span>
                </button>
                <button class="analyze-action-btn" type="button" onclick={startSaveSetup}>
                  <span class="analyze-action-k">SAVE</span>
                  <span class="analyze-action-t">Select range and save setup</span>
                </button>
                <button class="analyze-action-btn" type="button" onclick={openJudgeWorkspace}>
                  <span class="analyze-action-k">04</span>
                  <span class="analyze-action-t">Move to Judge</span>
                </button>
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
                      {@const patternSlug = s.pattern_slug ?? 'saved-setup'}
                      <button class="past-card" title="{patternSlug} · {s.timeframe}">
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
            <span class="lc-rail-step">{fmtConf}</span>
          </button>
          <span class="lc-rail-phase">{marketBias}</span>
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
      <div class="decision-hud" id="sidebar-analyze-body" role="region" aria-label="Decision HUD">
        <div class="lcs-header decision-hud-header">
          <div class="lcs-headline" role="heading" aria-level="2">
            <span class="lcs-step">02</span>
            <span class="lcs-title">DECISION HUD</span>
            <span class="lcs-meta">{confidenceAlpha}</span>
          </div>
          <button
            class="lcs-toggle"
            type="button"
            onclick={() => (sidebarAnalyzeDockCollapsed = true)}
            aria-expanded={!sidebarAnalyzeDockCollapsed}
            aria-controls="sidebar-analyze-body"
            title="HUD를 오른쪽으로 접기"
          >
            <span aria-hidden="true">▾</span>
          </button>
        </div>

        <section class="hud-card hud-current-state" aria-label="Current pattern state">
          <div class="hud-card-head">
            <span class="hud-card-kicker">CURRENT STATE</span>
            <span class="hud-confidence">{fmtConf}</span>
          </div>
          <div class="hud-state-grid">
            {#each hudStateRows as row}
              <div class="hud-state-row">
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            {/each}
          </div>
          <div class="conf-inline small">
            <span class="conf-label">CONFIDENCE</span>
            <div class="conf-bar"><div class="conf-fill" style:width={confidencePct}></div></div>
            <span class="conf-val">{fmtConf}</span>
          </div>
        </section>

        <section class="hud-card" aria-label="Top evidence">
          <div class="hud-card-head">
            <span class="hud-card-kicker">TOP EVIDENCE</span>
            <span class="hud-card-count">{hudEvidenceItems.length}</span>
          </div>
          <div class="hud-evidence-list" role="list">
            {#each hudEvidenceItems as item}
              <div class="hud-evidence-item" class:pos={item.pos} class:neg={!item.pos} role="listitem">
                <span class="hud-evidence-mark">{item.pos ? '✓' : '!'}</span>
                <span class="hud-evidence-copy">{item.k}</span>
                <strong>{item.v}</strong>
              </div>
            {/each}
          </div>
        </section>

        <section class="hud-card" aria-label="Risks">
          <div class="hud-card-head">
            <span class="hud-card-kicker">RISK</span>
            <span class="hud-card-count">{riskItems.length}</span>
          </div>
          <div class="hud-risk-list">
            {#each riskItems as risk}
              <div class="hud-risk-item">{risk}</div>
            {/each}
          </div>
        </section>

        <section class="hud-card hud-actions-card" aria-label="Actions">
          <div class="hud-card-head">
            <span class="hud-card-kicker">ACTIONS</span>
            <span class="hud-card-note">route detail down</span>
          </div>
          <div class="hud-actions">
            <button class="hud-action primary" type="button" onclick={startSaveSetup}>Save Setup</button>
            <button class="hud-action" class:active={analyzeDetailOpen} type="button" onclick={openAnalyze}>Open Workspace</button>
            <button class="hud-action" type="button" onclick={openCompareWorkspace}>Compare</button>
            <button class="hud-action" type="button" onclick={openJudgeWorkspace}>Judge</button>
            <button class="hud-action ai" type="button" onclick={openAnalyzeAIDetail}>Explain</button>
          </div>
        </section>

        <p class="hud-routing-note">
          Raw metrics, venue detail, liquidity, proposal, compare, and ledger stay in the bottom workspace.
        </p>
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
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: 3px;
    transition: color 0.15s;
  }
  .symbol:hover { color: var(--brand); }
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
  .micro-toggle {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border: 0.5px solid var(--g4);
    border-radius: 5px;
    background: color-mix(in srgb, var(--g1) 84%, transparent);
  }
  .micro-toggle-btn {
    padding: 3px 7px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--g5);
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    font-weight: 800;
    letter-spacing: 0.11em;
    cursor: pointer;
  }
  .micro-toggle-btn:hover {
    color: var(--g8);
    background: var(--g2);
  }
  .micro-toggle-btn.active {
    color: #d9edf8;
    background: linear-gradient(135deg, rgba(74,187,142,0.22), rgba(122,162,224,0.18));
    box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--pos) 38%, var(--g4));
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
  .chart-live {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .indicator-lane-stack {
    min-height: 66px;
    flex-shrink: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border-top: 0.5px solid rgba(255,255,255,0.055);
    border-bottom: 0.5px solid rgba(255,255,255,0.05);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.018), rgba(0,0,0,0.12)),
      repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 48px),
      #0b0f17;
    font-family: 'JetBrains Mono', monospace;
  }
  .indicator-lane {
    min-width: 0;
    display: grid;
    grid-template-columns: 94px minmax(0, 1fr);
    gap: 8px;
    align-items: stretch;
    padding: 7px 10px 6px;
    border-right: 0.5px solid rgba(255,255,255,0.07);
    position: relative;
    overflow: hidden;
  }
  .indicator-lane::before {
    content: '';
    position: absolute;
    inset: auto 10px 50% 112px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent);
    opacity: 0.42;
    pointer-events: none;
  }
  .indicator-lane[data-mode='heatmap']::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 86% 45%, rgba(232,184,106,0.13), transparent 48%);
    pointer-events: none;
  }
  .indicator-lane-meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    position: relative;
    z-index: 1;
  }
  .indicator-lane-meta span {
    color: var(--g5);
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 0.16em;
  }
  .indicator-lane-meta strong {
    color: var(--g9);
    font-size: 12px;
    font-weight: 900;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .indicator-lane-meta em {
    color: var(--g5);
    font-size: 7px;
    font-style: normal;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .indicator-lane[data-tone='buy'] .indicator-lane-meta strong { color: #5bd2aa; }
  .indicator-lane[data-tone='sell'] .indicator-lane-meta strong { color: #ff7373; }
  .indicator-lane[data-tone='warn'] .indicator-lane-meta strong { color: #e8b86a; }
  .indicator-lane[data-tone='info'] .indicator-lane-meta strong { color: #7aa2e0; }
  .indicator-lane-plot {
    min-width: 0;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(2px, 1fr);
    gap: 2px;
    align-items: end;
    position: relative;
    z-index: 1;
  }
  .indicator-cell {
    width: 100%;
    min-height: 2px;
    align-self: end;
    border-radius: 2px 2px 0 0;
    background: rgba(166,176,196,0.42);
    box-shadow: 0 0 0 1px rgba(255,255,255,0.025) inset;
  }
  .indicator-cell[data-tone='buy'] {
    background: linear-gradient(180deg, rgba(91,210,170,0.94), rgba(91,210,170,0.2));
  }
  .indicator-cell[data-tone='sell'] {
    background: linear-gradient(180deg, rgba(255,115,115,0.94), rgba(255,115,115,0.18));
  }
  .indicator-cell[data-tone='warn'] {
    background: linear-gradient(180deg, rgba(232,184,106,0.96), rgba(232,184,106,0.16));
  }
  .indicator-cell[data-tone='info'] {
    background: linear-gradient(180deg, rgba(122,162,224,0.94), rgba(122,162,224,0.16));
  }
  .indicator-cell.active {
    filter: saturate(1.25);
    box-shadow: 0 0 10px rgba(255,255,255,0.14);
  }
  .microstructure-belt {
    min-height: 54px;
    flex-shrink: 0;
    display: grid;
    grid-template-columns: 150px minmax(300px, 0.8fr) minmax(180px, 0.55fr) minmax(220px, 0.65fr);
    gap: 8px;
    align-items: stretch;
    padding: 6px 10px;
    border-top: 0.5px solid rgba(255,255,255,0.05);
    border-bottom: 0.5px solid var(--g4);
    background:
      linear-gradient(90deg, rgba(74,187,142,0.055), transparent 36%),
      radial-gradient(circle at 86% 50%, rgba(122,162,224,0.09), transparent 34%),
      var(--g0);
    font-family: 'JetBrains Mono', monospace;
  }
  .micro-belt-title {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    padding: 0 10px;
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    background: rgba(255,255,255,0.018);
  }
  .micro-kicker {
    color: var(--g5);
    font-size: 7px;
    letter-spacing: 0.18em;
  }
  .micro-belt-title strong {
    color: var(--g9);
    font-size: 11px;
    letter-spacing: 0.12em;
  }
  .micro-belt-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 5px;
  }
  .micro-stat {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    padding: 6px 7px;
    border: 0.5px solid var(--g4);
    border-radius: 5px;
    color: var(--g8);
    background: rgba(0,0,0,0.18);
    font-size: 10px;
    font-weight: 800;
  }
  .micro-stat b {
    color: var(--g5);
    font-size: 7px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .micro-stat.buy { color: var(--pos); }
  .micro-stat.sell { color: var(--neg); }
  .micro-heat-strip,
  .micro-depth-strip {
    min-width: 0;
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    background: rgba(0,0,0,0.22);
    overflow: hidden;
  }
  .micro-heat-strip {
    display: grid;
    grid-template-columns: repeat(16, minmax(4px, 1fr));
    gap: 2px;
    padding: 7px;
  }
  .micro-heat-cell {
    border-radius: 2px;
    background: #7aa2e0;
    box-shadow: 0 0 16px currentColor;
  }
  .micro-heat-cell.buy { color: var(--pos); background: var(--pos); }
  .micro-heat-cell.sell { color: var(--neg); background: var(--neg); }
  .micro-depth-strip {
    display: grid;
    grid-template-rows: repeat(5, 1fr);
    gap: 2px;
    padding: 5px;
  }
  .micro-depth-row {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 70px 1fr;
    align-items: center;
    gap: 5px;
    min-height: 7px;
    color: var(--g5);
    font-size: 7px;
  }
  .micro-depth-row.mid {
    color: var(--g9);
    font-weight: 800;
  }
  .depth-bid,
  .depth-ask {
    height: 5px;
    border-radius: 999px;
    opacity: 0.8;
  }
  .depth-bid {
    justify-self: end;
    background: linear-gradient(90deg, transparent, rgba(74,187,142,0.72));
  }
  .depth-ask {
    justify-self: start;
    background: linear-gradient(90deg, rgba(226,91,91,0.72), transparent);
  }
  .depth-price {
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .micro-heat-strip.active,
  .micro-depth-strip.active {
    border-color: color-mix(in srgb, var(--amb) 48%, var(--g4));
    box-shadow: inset 0 0 0 1px rgba(232,184,106,0.08);
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

  /* ANALYZE workspace shared primitives */
  .narrative {
    font-family: 'Geist', sans-serif;
    font-size: 12px;
    color: var(--g8);
    line-height: 1.7;
  }
  .narrative .bull { color: var(--pos); font-weight: 600; }
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
  .lc-rail-phase {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 0.16em;
    color: var(--g6);
    text-transform: uppercase;
    margin: 4px 0;
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

  /* ── Decision HUD: right rail owns conclusions only ───────────────────── */
  .decision-hud {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 100%;
    padding-bottom: 10px;
  }
  .decision-hud-header {
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .hud-card {
    margin: 0 10px;
    padding: 10px;
    border: 0.5px solid var(--g4);
    border-radius: 8px;
    background: linear-gradient(180deg, var(--g1), rgba(0,0,0,0.14));
  }
  .hud-current-state {
    border-color: color-mix(in srgb, var(--amb) 30%, var(--g4));
    background:
      radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--amb) 12%, transparent), transparent 36%),
      linear-gradient(180deg, var(--g1), rgba(0,0,0,0.16));
  }
  .hud-card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .hud-card-kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    letter-spacing: 0.18em;
    color: var(--g6);
    font-weight: 700;
  }
  .hud-card-count,
  .hud-card-note,
  .hud-confidence {
    margin-left: auto;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--amb);
  }
  .hud-confidence {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.04em;
  }
  .hud-state-grid {
    display: grid;
    gap: 5px;
    margin-bottom: 8px;
  }
  .hud-state-row {
    display: grid;
    grid-template-columns: 64px 1fr;
    gap: 8px;
    align-items: baseline;
    font-family: 'JetBrains Mono', monospace;
  }
  .hud-state-row span {
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .hud-state-row strong {
    min-width: 0;
    font-size: 10px;
    color: var(--g9);
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
  }
  .hud-evidence-list,
  .hud-risk-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .hud-evidence-item {
    display: grid;
    grid-template-columns: 16px 1fr auto;
    gap: 7px;
    align-items: center;
    padding: 7px 8px;
    border-radius: 5px;
    background: var(--g0);
    border: 0.5px solid var(--g4);
    font-family: 'JetBrains Mono', monospace;
  }
  .hud-evidence-item.pos { border-color: color-mix(in srgb, var(--pos) 28%, var(--g4)); }
  .hud-evidence-item.neg { border-color: color-mix(in srgb, var(--neg) 28%, var(--g4)); }
  .hud-evidence-mark {
    font-size: 10px;
    font-weight: 800;
    color: var(--pos);
  }
  .hud-evidence-item.neg .hud-evidence-mark { color: var(--neg); }
  .hud-evidence-copy {
    min-width: 0;
    font-size: 9px;
    color: var(--g7);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hud-evidence-item strong {
    font-size: 9px;
    color: var(--g9);
  }
  .hud-risk-item {
    padding: 7px 8px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--amb) 8%, var(--g0));
    border: 0.5px solid color-mix(in srgb, var(--amb) 22%, var(--g4));
    color: var(--g8);
    font-size: 9px;
    line-height: 1.45;
  }
  .hud-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .hud-action {
    min-height: 30px;
    border: 0.5px solid var(--g4);
    border-radius: 5px;
    background: var(--g0);
    color: var(--g8);
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  .hud-action:hover,
  .hud-action.active {
    background: var(--g2);
    border-color: var(--brand);
    color: var(--g9);
  }
  .hud-action.primary {
    grid-column: 1 / -1;
    background: color-mix(in srgb, var(--pos) 12%, var(--g0));
    border-color: color-mix(in srgb, var(--pos) 38%, var(--g4));
    color: var(--pos);
    font-weight: 700;
  }
  .hud-action.ai {
    border-color: color-mix(in srgb, var(--amb) 34%, var(--g4));
    color: var(--amb);
  }
  .hud-routing-note {
    margin: 0 12px;
    font-size: 8px;
    line-height: 1.55;
    color: var(--g5);
  }

  /* ── Analyze workspace: bottom owns verification/comparison/refinement ── */
  .workspace-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 10px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background:
      radial-gradient(circle at 12% 0%, rgba(122,162,224,0.08), transparent 28%),
      linear-gradient(180deg, rgba(255,255,255,0.015), rgba(0,0,0,0.12));
  }
  .workspace-hero,
  .workspace-panel {
    border: 0.5px solid var(--g4);
    border-radius: 8px;
    background: rgba(10,12,16,0.72);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.025);
  }
  .workspace-hero {
    display: grid;
    grid-template-columns: minmax(210px, 0.75fr) minmax(420px, 1.25fr);
    gap: 14px;
    align-items: center;
    padding: 12px 14px;
    flex-shrink: 0;
  }
  .workspace-hero-copy {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
  }
  .workspace-kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    color: var(--brand);
    letter-spacing: 0.2em;
    font-weight: 800;
  }
  .workspace-thesis {
    font-size: 12px;
    line-height: 1.55;
    color: var(--g8);
    min-width: 0;
  }
  .workspace-thesis .bull { color: var(--pos); font-weight: 700; }
  .phase-timeline {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    align-items: stretch;
    gap: 4px;
  }
  .phase-node {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    min-height: 48px;
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    background: var(--g0);
  }
  .phase-node.done {
    border-color: color-mix(in srgb, var(--brand) 28%, var(--g4));
    background: color-mix(in srgb, var(--brand) 7%, var(--g0));
  }
  .phase-node.active {
    border-color: color-mix(in srgb, var(--amb) 55%, var(--g4));
    background: color-mix(in srgb, var(--amb) 11%, var(--g0));
  }
  .phase-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--g5);
  }
  .phase-node.done .phase-dot { background: var(--brand); }
  .phase-node.active .phase-dot { background: var(--amb); box-shadow: 0 0 0 4px var(--amb-dd); }
  .phase-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g7);
    letter-spacing: 0.07em;
  }
  .phase-node.active .phase-label { color: var(--g9); font-weight: 700; }
  .workspace-grid {
    display: grid;
    grid-template-columns: minmax(460px, 1.6fr) minmax(240px, 0.8fr);
    gap: 10px;
    min-height: 0;
  }
  .workspace-bottom-grid {
    display: grid;
    grid-template-columns: 0.8fr 1.25fr 1fr;
    gap: 10px;
    flex-shrink: 0;
  }
  .workspace-panel {
    padding: 10px;
    min-width: 0;
  }
  .workspace-panel-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
  }
  .workspace-panel-copy {
    font-size: 9px;
    color: var(--g6);
    line-height: 1.4;
    text-align: right;
  }
  .market-depth-grid {
    display: grid;
    grid-template-columns: minmax(210px, 0.82fr) minmax(250px, 1fr) minmax(260px, 1.1fr) minmax(280px, 1.2fr);
    gap: 10px;
    flex-shrink: 0;
  }
  .depth-panel {
    min-height: 212px;
    border-color: color-mix(in srgb, var(--g4) 72%, #7aa2e0);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.02), transparent),
      rgba(5,7,10,0.82);
  }
  .depth-panel.selected {
    border-color: color-mix(in srgb, var(--amb) 58%, var(--g4));
    box-shadow: inset 0 0 0 1px rgba(232,184,106,0.075), 0 0 22px rgba(232,184,106,0.035);
  }
  .dom-ladder,
  .tape-list,
  .footprint-table,
  .heatmap-grid {
    font-family: 'JetBrains Mono', monospace;
  }
  .dom-ladder {
    display: grid;
    gap: 2px;
  }
  .dom-row {
    display: grid;
    grid-template-columns: minmax(58px, 1fr) 72px minmax(58px, 1fr);
    align-items: center;
    min-height: 12px;
    gap: 5px;
    color: var(--g7);
    font-size: 8px;
  }
  .dom-head {
    color: var(--g5);
    font-size: 7px;
    letter-spacing: 0.14em;
  }
  .dom-row.mid {
    min-height: 16px;
    border-block: 0.5px solid color-mix(in srgb, var(--amb) 32%, var(--g4));
    color: var(--g9);
    background: rgba(232,184,106,0.055);
  }
  .dom-side {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    height: 12px;
    border-radius: 3px;
    overflow: hidden;
    background: rgba(255,255,255,0.018);
  }
  .dom-side.bid { justify-content: flex-end; }
  .dom-side.ask { justify-content: flex-start; }
  .dom-bar {
    position: absolute;
    top: 1px;
    bottom: 1px;
    border-radius: 3px;
    opacity: 0.76;
  }
  .dom-bar.bid {
    right: 0;
    background: linear-gradient(90deg, rgba(74,187,142,0.05), rgba(74,187,142,0.72));
  }
  .dom-bar.ask {
    left: 0;
    background: linear-gradient(90deg, rgba(226,91,91,0.72), rgba(226,91,91,0.05));
  }
  .dom-val {
    position: relative;
    z-index: 1;
    padding: 0 4px;
    font-variant-numeric: tabular-nums;
  }
  .dom-price {
    text-align: center;
    color: var(--g8);
    font-variant-numeric: tabular-nums;
  }
  .dom-row.bid-heavy .dom-price { color: var(--pos); }
  .dom-row.ask-heavy .dom-price { color: var(--neg); }
  .tape-list {
    display: grid;
    gap: 3px;
  }
  .tape-row {
    display: grid;
    grid-template-columns: 38px 34px minmax(58px, 1fr) 42px 48px;
    gap: 6px;
    align-items: center;
    min-height: 14px;
    padding: 2px 3px;
    border-radius: 3px;
    color: var(--g7);
    font-size: 8px;
    background: rgba(255,255,255,0.012);
  }
  .tape-row.buy { color: var(--pos); background: rgba(74,187,142,0.035); }
  .tape-row.sell { color: var(--neg); background: rgba(226,91,91,0.035); }
  .tape-time,
  .tape-size {
    color: var(--g5);
  }
  .tape-side {
    font-weight: 900;
    letter-spacing: 0.08em;
  }
  .tape-price,
  .tape-size {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .tape-intensity {
    height: 4px;
    border-radius: 999px;
    background: rgba(255,255,255,0.05);
    overflow: hidden;
  }
  .tape-intensity span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: currentColor;
    opacity: 0.76;
  }
  .footprint-table {
    display: grid;
    gap: 3px;
  }
  .footprint-row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(44px, 0.8fr) minmax(64px, 1fr) minmax(44px, 0.8fr) minmax(48px, 0.8fr);
    align-items: center;
    gap: 6px;
    min-height: 14px;
    padding: 2px 5px;
    border-radius: 3px;
    overflow: hidden;
    color: var(--g7);
    font-size: 8px;
    background: rgba(255,255,255,0.014);
  }
  .footprint-head {
    color: var(--g5);
    font-size: 7px;
    letter-spacing: 0.12em;
    background: transparent;
  }
  .footprint-row.buy span:nth-child(4) { color: var(--pos); font-weight: 900; }
  .footprint-row.sell span:nth-child(4) { color: var(--neg); font-weight: 900; }
  .footprint-row span {
    position: relative;
    z-index: 1;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .footprint-row span:nth-child(2) { color: var(--g8); text-align: center; }
  .footprint-volume {
    position: absolute !important;
    left: 0;
    top: 1px;
    bottom: 1px;
    z-index: 0 !important;
    border-radius: 3px;
    background: linear-gradient(90deg, rgba(122,162,224,0.18), transparent);
  }
  .heatmap-grid {
    display: grid;
    gap: 4px;
  }
  .heatmap-row {
    display: grid;
    grid-template-columns: 62px 1fr;
    align-items: center;
    gap: 6px;
  }
  .heat-price {
    color: var(--g5);
    font-size: 8px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .heat-cells {
    display: grid;
    grid-template-columns: repeat(18, minmax(4px, 1fr));
    gap: 2px;
    min-height: 16px;
  }
  .heat-cell {
    min-height: 16px;
    border-radius: 2px;
    background: #7aa2e0;
    box-shadow: 0 0 18px currentColor;
  }
  .heat-cell.buy {
    color: var(--pos);
    background: linear-gradient(180deg, rgba(74,187,142,0.95), rgba(74,187,142,0.32));
  }
  .heat-cell.sell {
    color: var(--neg);
    background: linear-gradient(180deg, rgba(226,91,91,0.95), rgba(226,91,91,0.3));
  }
  .depth-empty {
    padding: 18px 8px;
    border: 0.5px dashed var(--g4);
    border-radius: 6px;
    color: var(--g5);
    font-size: 8px;
    letter-spacing: 0.1em;
    text-align: center;
    text-transform: uppercase;
  }
  .evidence-table {
    display: grid;
    gap: 3px;
    font-family: 'JetBrains Mono', monospace;
  }
  .evidence-table-row {
    display: grid;
    grid-template-columns: minmax(84px, 1.2fr) minmax(58px, 0.75fr) minmax(72px, 0.85fr) 56px minmax(120px, 1.4fr);
    gap: 8px;
    align-items: center;
    min-height: 28px;
    padding: 5px 7px;
    border: 0.5px solid var(--g3);
    border-radius: 4px;
    background: var(--g0);
    color: var(--g7);
    font-size: 8px;
  }
  .evidence-table-row.header {
    min-height: 22px;
    color: var(--g5);
    background: transparent;
    border-color: transparent;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .evidence-table-row.pass span:nth-child(4) { color: var(--pos); font-weight: 800; }
  .evidence-table-row.fail span:nth-child(4) { color: var(--neg); font-weight: 800; }
  .evidence-table-row span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .compare-card-stack {
    display: grid;
    gap: 7px;
  }
  .compare-card {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "label value"
      "note note";
    gap: 3px 8px;
    padding: 9px 10px;
    text-align: left;
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    background: var(--g0);
    color: var(--g8);
    cursor: pointer;
  }
  .compare-card:hover { border-color: #7aa2e0; background: var(--g2); }
  .compare-label {
    grid-area: label;
    font-size: 10px;
    font-weight: 700;
  }
  .compare-value {
    grid-area: value;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: #7aa2e0;
  }
  .compare-note {
    grid-area: note;
    font-size: 9px;
    color: var(--g6);
  }
  .workspace-primary-action {
    width: 100%;
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 5px;
    border: 0.5px solid color-mix(in srgb, #7aa2e0 42%, var(--g4));
    background: color-mix(in srgb, #7aa2e0 10%, var(--g0));
    color: #9bbcf0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .ledger-stats,
  .execution-mini-grid {
    display: grid;
    gap: 6px;
  }
  .ledger-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .ledger-stat {
    padding: 8px;
    border-radius: 6px;
    background: var(--g0);
    border: 0.5px solid var(--g4);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ledger-label,
  .ledger-note {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .ledger-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 18px;
    line-height: 1;
    color: var(--g9);
    font-weight: 800;
  }
  .judgment-options {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }
  .judgment-option {
    min-height: 34px;
    padding: 6px 5px;
    border-radius: 6px;
    border: 0.5px solid var(--g4);
    background: var(--g0);
    color: var(--g8);
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 0.05em;
    cursor: pointer;
  }
  .judgment-option:hover { background: var(--g2); color: var(--g9); }
  .judgment-option.tone-pos { border-color: color-mix(in srgb, var(--pos) 40%, var(--g4)); color: var(--pos); }
  .judgment-option.tone-neg { border-color: color-mix(in srgb, var(--neg) 40%, var(--g4)); color: var(--neg); }
  .judgment-option.tone-warn { border-color: color-mix(in srgb, var(--amb) 40%, var(--g4)); color: var(--amb); }
  .workspace-action-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    flex-shrink: 0;
  }

  /* Visual salvage pass: less card noise, more trading-terminal density. */
  .trade-mode {
    background:
      radial-gradient(circle at 50% -18%, rgba(232,184,106,0.055), transparent 34%),
      linear-gradient(180deg, #050608 0%, #030405 100%);
  }
  .layout-c {
    background:
      linear-gradient(90deg, rgba(232,184,106,0.04), transparent 18%, transparent 82%, rgba(122,162,224,0.025)),
      #050608;
  }
  .layout-c .chart-section.lc-main {
    margin: 4px 0 4px 4px;
    border: 1px solid rgba(255,255,255,0.07);
    border-right: none;
    border-radius: 10px 0 0 10px;
    background: #06080b;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.025), 0 20px 60px rgba(0,0,0,0.28);
  }
  .lc-sidebar {
    width: 232px;
    margin: 4px 4px 4px 0;
    border: 1px solid rgba(255,255,255,0.07);
    border-left: 1px solid rgba(255,255,255,0.045);
    border-radius: 0 10px 10px 0;
    background:
      radial-gradient(circle at 100% 0%, rgba(232,184,106,0.08), transparent 30%),
      rgba(5,7,10,0.94);
    box-shadow: inset 1px 0 0 rgba(255,255,255,0.02);
  }
  .chart-header {
    min-height: 46px;
    padding: 8px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.055);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.008)),
      #07090d;
  }
  .symbol {
    font-size: 15px;
    letter-spacing: 0.005em;
  }
  .timeframe {
    color: var(--g7);
  }
  .pattern,
  .hd-chip,
  .evidence-badge,
  .micro-toggle {
    border-color: rgba(255,255,255,0.065);
    background: rgba(255,255,255,0.026);
  }
  .micro-toggle-btn {
    color: var(--g5);
  }
  .micro-toggle-btn.active {
    color: #f3d58d;
    background: rgba(232,184,106,0.105);
    box-shadow: inset 0 0 0 1px rgba(232,184,106,0.22);
  }
  .chart-body {
    background:
      linear-gradient(180deg, rgba(122,162,224,0.025), transparent 16%),
      #080b11;
  }
  .microstructure-belt {
    min-height: 38px;
    grid-template-columns: 120px minmax(260px, 0.78fr) minmax(280px, 1fr);
    gap: 7px;
    padding: 5px 9px;
    border-top: 1px solid rgba(255,255,255,0.052);
    border-bottom: 1px solid rgba(255,255,255,0.052);
    background:
      linear-gradient(90deg, rgba(74,187,142,0.045), transparent 28%),
      rgba(3,5,8,0.96);
  }
  .micro-belt-title,
  .micro-stat,
  .micro-heat-strip,
  .micro-depth-strip {
    border-color: rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.018);
    border-radius: 5px;
  }
  .micro-belt-title {
    padding: 0 8px;
  }
  .micro-kicker {
    color: #6f7a89;
    letter-spacing: 0.14em;
  }
  .micro-belt-title strong {
    font-size: 10px;
    color: #dbe4ee;
  }
  .micro-belt-stats {
    gap: 4px;
  }
  .micro-stat {
    padding: 5px 7px;
    font-size: 9px;
    box-shadow: none;
  }
  .micro-stat b {
    font-size: 6.5px;
    color: #68717c;
  }
  .micro-heat-strip {
    padding: 6px;
  }
  .micro-depth-strip {
    display: none;
  }
  .peek-bar {
    height: 28px;
    border-top: 1px solid rgba(255,255,255,0.055);
    background: #050608;
  }
  .pb-tab {
    border-left-color: rgba(255,255,255,0.045);
    border-bottom-width: 1px;
  }
  .pb-tab:hover,
  .pb-tab.active {
    background: rgba(255,255,255,0.028);
  }
  .peek-overlay {
    bottom: 28px;
    background:
      linear-gradient(180deg, rgba(9,12,17,0.965), rgba(4,6,9,0.985)),
      #050608;
    border-top: 1px solid rgba(232,184,106,0.20);
    box-shadow: 0 -30px 80px rgba(0,0,0,0.82);
  }
  .drawer-header {
    height: 30px;
    border-bottom-color: rgba(255,255,255,0.055);
    background: rgba(4,5,7,0.95);
  }
  .dh-tab {
    border-right-color: rgba(255,255,255,0.045);
  }
  .dh-tab:hover,
  .dh-tab.active {
    background: rgba(255,255,255,0.026);
  }
  .workspace-body {
    padding: 8px;
    gap: 8px;
    background:
      radial-gradient(circle at 12% -6%, rgba(232,184,106,0.045), transparent 28%),
      #05070a;
  }
  .workspace-hero,
  .workspace-panel {
    border-color: rgba(255,255,255,0.065);
    background: rgba(255,255,255,0.018);
    box-shadow: none;
  }
  .workspace-hero {
    grid-template-columns: minmax(190px, 0.58fr) minmax(420px, 1.42fr);
    padding: 8px 10px;
  }
  .phase-node {
    min-height: 34px;
    padding: 6px 7px;
    border-color: rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.018);
  }
  .phase-node.active {
    background: rgba(232,184,106,0.105);
  }
  .market-depth-grid {
    grid-template-columns: minmax(190px, 0.84fr) minmax(230px, 1fr) minmax(230px, 1.02fr) minmax(250px, 1.1fr);
    gap: 8px;
  }
  .workspace-panel {
    padding: 8px;
    border-radius: 7px;
  }
  .workspace-panel-head {
    margin-bottom: 6px;
  }
  .depth-panel {
    min-height: 178px;
    background: rgba(3,5,8,0.70);
    border-color: rgba(122,162,224,0.10);
  }
  .dom-row,
  .tape-row,
  .footprint-row {
    min-height: 13px;
  }
  .hud-card {
    margin: 0 8px;
    padding: 8px;
    border-color: rgba(255,255,255,0.065);
    background: rgba(255,255,255,0.018);
    border-radius: 7px;
    box-shadow: none;
  }
  .hud-current-state {
    border-color: rgba(232,184,106,0.24);
    background:
      radial-gradient(circle at 100% 0%, rgba(232,184,106,0.105), transparent 40%),
      rgba(255,255,255,0.018);
  }
  .hud-evidence-item,
  .hud-risk-item,
  .hud-action {
    border-color: rgba(255,255,255,0.06);
    background: rgba(0,0,0,0.22);
  }
  .hud-evidence-item.pos {
    border-left: 2px solid rgba(74,187,142,0.65);
  }
  .hud-evidence-item.neg {
    border-left: 2px solid rgba(226,91,91,0.65);
  }
  .hud-risk-item {
    color: var(--g7);
    border-left: 2px solid rgba(232,184,106,0.52);
  }
  .hud-action.primary {
    background: rgba(74,187,142,0.09);
  }

  .chart-save-compact {
    height: 24px;
    padding: 0 10px;
    border: 1px solid rgba(74,187,142,0.28);
    border-radius: 5px;
    background: rgba(74,187,142,0.075);
    color: #76d8ba;
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    font-weight: 800;
    letter-spacing: 0.12em;
    cursor: pointer;
  }

  .chart-save-compact:hover {
    border-color: rgba(74,187,142,0.56);
    background: rgba(74,187,142,0.13);
    color: #a8f1dc;
  }

  .observe-mode .layout-c .chart-section.lc-main {
    margin: 3px 0 3px 3px;
    border-color: rgba(255,255,255,0.045);
    border-radius: 8px 0 0 8px;
  }

  .observe-mode .chart-header {
    min-height: 38px;
    padding: 6px 12px;
    gap: 9px;
  }

  .observe-mode .pattern {
    opacity: 0.52;
  }

  .observe-mode .ind-label-hdr {
    display: none;
  }

  .observe-mode .evidence-badge,
  .observe-mode .conf-inline {
    opacity: 0.62;
  }

  .observe-mode .micro-toggle {
    margin-left: 4px;
  }

  .observe-mode :global(.chart-live .chart-toolbar),
  .observe-mode :global(.chart-live .chart-header--tv) {
    display: none !important;
  }

  .observe-mode :global(.chart-live .chart-board) {
    border: none !important;
    border-radius: 0 !important;
    background: #0f131d !important;
  }

  .observe-mode .indicator-lane-stack {
    min-height: 52px;
  }

  .observe-mode .indicator-lane {
    grid-template-columns: 78px minmax(0, 1fr);
    gap: 6px;
    padding: 5px 8px;
  }

  .observe-mode .indicator-lane::before {
    left: 94px;
  }

  .observe-mode .indicator-lane-meta span {
    font-size: 7px;
  }

  .observe-mode .indicator-lane-meta strong {
    font-size: 10px;
  }

  .observe-mode .indicator-lane-meta em {
    display: none;
  }

  .observe-mode .indicator-lane-plot {
    gap: 1.5px;
  }

  .observe-mode .microstructure-belt {
    min-height: 32px;
    grid-template-columns: 126px minmax(300px, 0.72fr) minmax(360px, 1fr);
    padding: 4px 8px;
  }

  .observe-mode .micro-belt-title {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .observe-mode .micro-belt-title strong {
    font-size: 8px;
  }

  .observe-mode .micro-stat {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 7px;
  }

  .observe-mode .micro-stat b {
    font-size: 6px;
  }

  .observe-mode .peek-bar {
    height: 24px;
  }

  .observe-mode .peek-overlay {
    bottom: 24px;
  }

  .observe-mode .pb-tab {
    padding: 0 12px;
  }

  .observe-mode .pb-label {
    font-size: 9px;
  }
  @media (max-width: 1120px) {
    .indicator-lane-stack {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      min-height: 112px;
    }
    .indicator-lane:nth-child(2n) {
      border-right: none;
    }
    .microstructure-belt {
      grid-template-columns: 1fr;
      min-height: auto;
    }
    .micro-belt-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .workspace-hero,
    .market-depth-grid,
    .workspace-grid,
    .workspace-bottom-grid {
      grid-template-columns: 1fr;
    }
    .phase-timeline {
      grid-template-columns: repeat(5, minmax(96px, 1fr));
      overflow-x: auto;
    }
    .judgment-options {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .workspace-action-strip {
      grid-template-columns: 1fr;
    }
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
