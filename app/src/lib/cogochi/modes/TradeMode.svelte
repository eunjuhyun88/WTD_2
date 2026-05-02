<script lang="ts">
  import ChartBoard from '../../../components/terminal/workspace/ChartBoard.svelte';
  import ChartGridLayout from '../../../components/terminal/workspace/ChartGridLayout.svelte';
  import {
    fetchAnalyze,
    fetchAnalyzeAndChart,
    fetchAlphaWorldModel,
    fetchMarketMicrostructure,
    submitTradeOutcome,
    type TradeOutcomeResult,
  } from '$lib/api/terminalBackend';
  import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';
  import { cogochiDataStore } from '$lib/cogochi/cogochi.data.store';
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
  import type { GammaPinData } from '../../../components/terminal/chart/primitives/GammaPinPrimitive';
  import { INDICATOR_REGISTRY } from '$lib/indicators/registry';
  import { buildIndicatorValues } from '$lib/indicators/adapter';
  import { chartIndicators, toggleIndicator } from '$lib/stores/chartIndicators';
  import { chartSaveMode } from '$lib/stores/chartSaveMode';
  import { buildCogochiWorkspaceEnvelope, buildStudyMap } from '$lib/cogochi/workspaceDataPlane';
  import { useMicrostructureSocket } from '$lib/trade/useMicrostructureSocket.svelte';
  import { useTradeData } from '$lib/trade/useTradeData.svelte';
  import AnalyzePanel from './AnalyzePanel.svelte';
  import ScanPanel from './ScanPanel.svelte';
  import JudgePanel from './JudgePanel.svelte';

  type ChartBar = ChartSeriesPayload['klines'][number];
  type MicroOrderbook = MarketMicrostructurePayload['orderbook'];

  interface Props {
    mode: 'trade' | 'train' | 'flywheel';
    tabState: TabState;
    updateTabState: (updater: (ts: TabState) => TabState) => void;
    symbol?: string;
    timeframe?: string;
    mobileView?: 'chart' | 'verdict' | 'research' | 'judge';
    workMode?: ShellWorkMode;
    setMobileView?: (v: 'chart' | 'verdict' | 'research' | 'judge') => void;
    setMobileSymbol?: (sym: string) => void;
    onSymbolTap?: () => void;
    onTFChange?: (tf: string) => void;
    isPaneFocused?: boolean;
  }

  let { mode, tabState, updateTabState, symbol = 'BTCUSDT', timeframe = '4h', mobileView, workMode = 'analyze', setMobileView, setMobileSymbol, onSymbolTap, onTFChange, isPaneFocused = true }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let dragging = $state(false);

  // Mobile swipe gesture
  const MOBILE_VIEWS = ['chart', 'verdict', 'research', 'judge'] as const;
  type MobileViewType = typeof MOBILE_VIEWS[number];
  let swipeStartX = 0;
  function onSwipeStart(e: TouchEvent) { swipeStartX = e.touches[0].clientX; }
  function onSwipeEnd(e: TouchEvent) {
    const dx = e.changedTouches[0].clientX - swipeStartX;
    if (Math.abs(dx) < 48 || !mobileView || !setMobileView) return;
    const idx = MOBILE_VIEWS.indexOf(mobileView as MobileViewType);
    if (dx < 0 && idx < MOBILE_VIEWS.length - 1) setMobileView(MOBILE_VIEWS[idx + 1]);
    else if (dx > 0 && idx > 0) setMobileView(MOBILE_VIEWS[idx - 1]);
  }
  // Chart indicator toggles — backed by chartIndicators store (persisted, also LLM-controllable)
  const showOI      = $derived($chartIndicators.oi);
  const showFunding = $derived($chartIndicators.derivatives);
  const showCVD     = $derived($chartIndicators.cvd);

  // ── Live chart data ────────────────────────────────────────────────────────
  // chartPayload is only for ChartBoard's initialData; ChartBoard owns live updates via DataFeed.
  // analyzeData is refreshed on candle close via ChartBoard's onCandleClose callback.
  let chartPayload = $state<ChartSeriesPayload | null>(null);

  // W-0288: multi-chart grid toggle
  let multiChartMode = $state(false);
  let microstructurePayload = $state<MarketMicrostructurePayload | null>(null);
  let analyzeData = $state<AnalyzeEnvelope | null>(null);
  let chartLoading = $state(false);
  let microstructureLoading = $state(false);
  let lastCandleTime: number | null = null; // plain ref — guards against duplicate onCandleClose fires

  const microSocket = useMicrostructureSocket(
    () => symbol,
    () => microstructurePayload?.currentPrice ?? null
  );
  let microWsState = $derived(microSocket.microWsState);
  let microWsUpdatedAt = $derived(microSocket.microWsUpdatedAt);
  let liveOrderbook = $derived(microSocket.liveOrderbook);
  let liveTrades = $derived(microSocket.liveTrades);

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


  // ── Pillar data (venue divergence, liq clusters, context, options, confluence …)
  const tradeData = useTradeData(() => symbol, () => timeframe);

  // ChartBoard owns the resilient WS (DataFeed: reconnect+backoff+gap-fill+heartbeat).
  // On candle close, refresh analyze only — chart live updates are handled inside ChartBoard.
  async function handleCandleClose(bar: { time: number }) {
    if (lastCandleTime === bar.time) return;
    lastCandleTime = bar.time;
    try {
      const nextAnalyze = await fetchAnalyze(symbol, timeframe);
      if (nextAnalyze) analyzeData = nextAnalyze;
    } catch { /* retry on next candle */ }
    void tradeData.refreshVenueDivergence();
    void tradeData.refreshLiqClusters();
    void tradeData.refreshConfluence();
  }
  let venueDivergence = $derived(tradeData.venueDivergence);
  let liqClusters = $derived(tradeData.liqClusters);
  let indicatorContext = $derived(tradeData.indicatorContext);
  let ssr = $derived(tradeData.ssr);
  let rvCone = $derived(tradeData.rvCone);
  let fundingFlip = $derived(tradeData.fundingFlip);
  let fundingHistory = $derived(tradeData.fundingHistory);
  let pastCaptures = $derived(tradeData.pastCaptures);
  let optionsSnapshot = $derived(tradeData.optionsSnapshot);
  let confluence = $derived(tradeData.confluence);
  let confluenceHistory = $derived(tradeData.confluenceHistory);

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
      setMobileView('verdict');
      return;
    }
    // Desktop: open peek + switch drawer tab to verdict.
    updateTabState(s => ({ ...s, peekOpen: true, drawerTab: 'verdict' }));
  }

  function openWorkspaceTab(tab: 'verdict' | 'research' | 'judge') {
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
    openWorkspaceTab('research');
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
  const analyzeDetailOpen = $derived(peekOpen && drawerTab === 'verdict');
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

  function setDrawerTab(tab: 'verdict' | 'research' | 'judge') {
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

  // ── cogochi.data.store sync (producer role) ──────────────────────────────
  $effect(() => { cogochiDataStore.setAnalyzeData(analyzeData); });
  $effect(() => { cogochiDataStore.setScanCandidates(scanCandidates, scanLoading); });

  // ── Helpers ──────────────────────────────────────────────────────────────
  function _fmtNum(v: number | null | undefined): string {
    if (v == null || v === 0) return '—';
    return v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : v.toFixed(4);
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
      state: (index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending') as 'done' | 'active' | 'pending',
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

  const judgmentOptions: Array<{ label: string; tone: 'pos' | 'neg' | 'warn' }> = [
    { label: 'Valid', tone: 'pos' },
    { label: 'Invalid', tone: 'neg' },
    { label: 'Too Early', tone: 'warn' },
    { label: 'Too Late', tone: 'warn' },
    { label: 'Near Miss', tone: 'warn' },
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
        side: trade.side as 'BUY' | 'SELL',
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
        side: (isBuy ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
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
            side: (trade.side === 'BUY' ? 'buy' : 'sell') as 'buy' | 'sell',
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
            side: (bar.close >= bar.open ? 'buy' : 'sell') as 'buy' | 'sell',
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
      {#each (['chart', 'verdict', 'research', 'judge'] as const) as t}
        <button
          class="mts-tab"
          class:active={mobileView === t}
          onclick={() => setMobileView?.(t)}
          role="tab"
          aria-selected={mobileView === t}
          tabindex={mobileView === t ? 0 : -1}
        >
          {t === 'chart' ? '01 CHART' : t === 'verdict' ? '02 VER' : t === 'research' ? '03 RES' : '04 JUDGE'}
        </button>
      {/each}
    </div>
    {#if mobileView !== 'chart'}
    <div class="mobile-panel" ontouchstart={onSwipeStart} ontouchend={onSwipeEnd}>
      {#if mobileView === 'verdict'}
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
      {:else if mobileView === 'research'}
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
    <div class="chart-controls-bar">
      <!-- symbol + TF moved to TopBar (W-0375 P1) -->
      {#if analyzeData?.snapshot?.funding_rate != null}
        <span class="hd-chip" class:neg={analyzeData.snapshot.funding_rate < 0} class:pos={analyzeData.snapshot.funding_rate > 0}>
          FUND {fmtFunding}
        </span>
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
      <!-- W-0288: multi-chart toggle -->
      <button
        class="chart-save-compact multichart-toggle"
        class:active={multiChartMode}
        type="button"
        title={multiChartMode ? '단일 차트로 전환' : '멀티 차트 레이아웃'}
        aria-pressed={multiChartMode}
        onclick={() => { multiChartMode = !multiChartMode; }}
      >⊞</button>
    </div>
    <div class="chart-body">
      <div class="chart-live">
        {#if multiChartMode}
          <ChartGridLayout
            {symbol}
            tf={timeframe}
            surfaceStyle="velo"
          />
        {:else}
          <ChartBoard
            {symbol}
            tf={timeframe}
            initialData={chartPayload ?? undefined}
            surfaceStyle="velo"
            verdictLevels={verdictLevels}
            change24hPct={analyzeData?.change24h ?? null}
            contextMode="chart"
            onCandleClose={handleCandleClose}
            {gammaPin}
          />
        {/if}
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
        { id: 'analyze', n: '02', label: 'ANALYZE', color: 'var(--brand)',  badge: confidenceAlpha, badgeColor: 'var(--amb)' },
        { id: 'scan',    n: '03', label: 'SCAN',    color: '#7aa2e0',       badge: scanCandidates.length > 0 ? `${scanCandidates.length}` : '—',   badgeColor: '#7aa2e0' },
        { id: 'judge',   n: '04', label: 'JUDGE',   color: 'var(--amb)',    badge: analyzeData?.entryPlan?.riskReward != null ? `R:R ${analyzeData.entryPlan.riskReward.toFixed(1)}×` : '—', badgeColor: 'var(--amb)' },
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
          {#if drawerTab === 'verdict'}
            <AnalyzePanel
              data={{
                direction: analyzeDetailDirection,
                thesis: analyzeDetailThesis,
                phaseTimeline,
                microstructureView,
                domLadderRows,
                timeSalesRows,
                footprintRows,
                heatmapRows,
                evidenceTableRows,
                compareCards,
                ledgerStats,
                judgmentOptions,
                executionProposal: analyzeExecutionProposal,
              }}
              actions={{
                onOpenCompareWorkspace: openCompareWorkspace,
                onSetJudgeVerdict: (v) => judgeVerdict = v,
                onOpenJudgeWorkspace: openJudgeWorkspace,
                onOpenAnalyzeAIDetail: openAnalyzeAIDetail,
                onStartSaveSetup: startSaveSetup,
              }}
              state={{ microstructureView }}
            />
          {:else if drawerTab === 'research'}
            <ScanPanel
              data={{
                confluence,
                scanState,
                scanProgress,
                scanCandidates,
                scanSelected,
                pastCaptures,
              }}
              actions={{
                onOpenAnalyze: openAnalyze,
                onSetScanSelected: (id) => scanSelected = id,
                onOpenTradeTab: (x) => shellStore.openTab({ kind: 'trade', title: `${x.symbol.replace('USDT','')} · ${x.tf}` }),
              }}
            />
          {:else if drawerTab === 'judge'}
            <JudgePanel
              data={{
                confluence,
                confluenceHistory,
                symbol,
                timeframe,
                confidenceAlpha,
                judgePlan,
                rrLossPct,
                rrGainPct,
                judgeVerdict,
                judgeOutcome,
                judgeRejudged,
                judgeSubmitting,
                judgeSubmitResult,
              }}
              actions={{
                onSetJudgeVerdict: (v) => judgeVerdict = v,
                onSetJudgeOutcome: (o) => { judgeOutcome = o; judgeRejudged = null; },
                onSetJudgeRejudged: (r) => judgeRejudged = r,
              }}
            />
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

  .chart-controls-bar {
    height: 28px;
    padding: 0 12px;
    border-bottom: 0.5px solid var(--g4);
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--g0);
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
  }

  .spacer { flex: 1; }

  .hd-chip {
    padding: 2px 7px; border-radius: 3px;
    background: var(--g2); border: 0.5px solid var(--g4);
    font-size: var(--ui-text-xs); color: var(--g6); letter-spacing: 0.06em;
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
    font-size: var(--ui-text-xs);
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
  .ev-sep { font-size: var(--ui-text-xs); color: var(--g4); }
  .ev-neg { font-size: 11px; color: var(--neg); font-weight: 700; }

  .conf-inline {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .conf-label {
    font-size: var(--ui-text-xs);
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
  .conf-inline.small .conf-val { font-size: var(--ui-text-xs); }

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
    font-size: var(--ui-text-xs);
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
  .micro-heat-strip, .micro-depth-strip {
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
  .depth-bid, .depth-ask {
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
  .micro-heat-strip.active, .micro-depth-strip.active {
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
    font-size: var(--ui-text-xs);
    color: var(--g6);
    font-weight: 600;
    letter-spacing: 0.1em;
    flex-shrink: 0;
  }
  .pb-tab.active .pb-label { color: var(--g9); }
  .pb-chevron {
    font-size: var(--ui-text-xs);
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
  .dh-desc { font-size: var(--ui-text-xs); color: var(--g5); font-family: 'Geist', sans-serif; white-space: nowrap; }

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
  .ev-key { font-size: var(--ui-text-xs); color: var(--g7); width: 80px; }
  .ev-val { font-size: 11px; color: var(--g9); font-weight: 600; }

  .analyze-action-btn.ai {
    border-color: color-mix(in srgb, var(--amb) 34%, var(--g4));
    background: color-mix(in srgb, var(--amb) 10%, var(--g1));
  }

  .analyze-action-btn.ai:hover {
    border-color: color-mix(in srgb, var(--amb) 52%, var(--g4));
    background: color-mix(in srgb, var(--amb) 14%, var(--g2));
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
  .prop-h { font-size: var(--ui-text-xs); color: var(--g6); margin-left: auto; }

  /* ── SCAN panel (trade_scan.jsx) ── */

  @keyframes scan-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

  .scan-card.active { background: var(--g2); border-color: var(--sc); box-shadow: 0 0 0 0.5px var(--sc); }

  @keyframes skeleton-fade { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }

  /* ── ACT panel (trade_act.jsx) ── */

  /* Plan col */
  .lvl-row { display: flex; gap: 6px; }
  .lvl-cell {
    flex: 1; padding: 7px 10px; background: var(--g0);
    border: 0.5px solid var(--g4); border-radius: 7px; min-width: 0;
  }
  .lvl-label { font-family: 'JetBrains Mono', monospace; font-size: 7px; color: var(--g6); letter-spacing: 0.14em; }
  .lvl-val { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Judge col */

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
  .jb-label { font-size: var(--ui-text-xs); font-weight: 700; letter-spacing: 0.12em; }

  /* After col */
  .outcome-row { display: flex; gap: 3px; }
  .outcome-save-hint { margin-top: 4px; font-size: var(--ui-text-xs); color: var(--g6); text-align: right; }
  .outcome-btn {
    flex: 1; padding: 6px 4px; font-family: 'Space Grotesk', sans-serif;
    font-size: var(--ui-text-xs); font-weight: 600; letter-spacing: 0.06em;
    background: transparent; color: var(--g6);
    border: 0.5px solid var(--g4); border-radius: 7px; cursor: pointer;
    transition: all 0.1s;
  }
  .outcome-btn:hover { border-color: var(--g5); color: var(--g8); }
  .outcome-btn.active { background: var(--obg); color: var(--oc); border-color: var(--oc); }

  .rj-pos.active { background: var(--pos-d); border-color: var(--pos); }

  .rj-neg.active { background: var(--neg-d); border-color: var(--neg); }

  /* PeekBar rich summary */
  .pb-sep { font-size: var(--ui-text-xs); color: var(--g5); flex-shrink: 0; }
  .pb-val { font-family: 'JetBrains Mono', monospace; font-size: var(--ui-text-xs); font-weight: 600; color: var(--g9); flex-shrink: 0; }
  .pb-val.pos { color: var(--pos); }
  .pb-val.neg { color: var(--neg); }
  .pb-txt { font-size: var(--ui-text-xs); color: var(--g7); flex-shrink: 0; }
  .pb-dim { font-family: 'JetBrains Mono', monospace; font-size: var(--ui-text-xs); color: var(--g6); overflow: hidden; text-overflow: ellipsis; }
  .pb-warn { font-family: 'JetBrains Mono', monospace; font-size: var(--ui-text-xs); color: var(--amb); flex-shrink: 0; }

  /* MiniChart */

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
    font-size: var(--ui-text-xs);
    font-weight: 700;
    color: var(--amb);
    letter-spacing: 0.1em;
  }
  .ls-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g9);
    letter-spacing: 0.06em;
    font-weight: 500;
    white-space: nowrap;
  }
  .ls-desc { color: var(--g5); font-size: var(--ui-text-xs); }
  .ls-hint {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
    color: var(--g9);
    font-weight: 500;
    width: 50px;
    flex-shrink: 0;
  }
  .sr-tf { font-size: var(--ui-text-xs); color: var(--g5); width: 22px; flex-shrink: 0; }
  .sr-bar { flex: 1; height: 3px; background: var(--g3); border-radius: 2px; overflow: hidden; }
  .sr-fill { height: 100%; border-radius: 2px; }
  .sr-alpha { font-family: 'JetBrains Mono', monospace; font-size: var(--ui-text-xs); font-weight: 600; width: 30px; text-align: right; flex-shrink: 0; }

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
  .lc-rail-chip, .lc-rail-handle {
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
  .lc-rail-chip:hover, .lc-rail-handle:hover {
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
    font-size: var(--ui-text-xs);
    letter-spacing: 0.16em;
    color: var(--g8);
    transform: translateX(2px);
  }
  .lc-rail-phase {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
    font-weight: 600;
    color: var(--g9);
    letter-spacing: 0.1em;
  }
  .lcs-meta { font-size: var(--ui-text-xs); color: var(--g5); }
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
  .hud-card-count, .hud-card-note, .hud-confidence {
    margin-left: auto;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
    color: var(--g9);
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
  }
  .hud-evidence-list, .hud-risk-list {
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
    font-size: var(--ui-text-xs);
    font-weight: 800;
    color: var(--pos);
  }
  .hud-evidence-item.neg .hud-evidence-mark { color: var(--neg); }
  .hud-evidence-copy {
    min-width: 0;
    font-size: var(--ui-text-xs);
    color: var(--g7);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hud-evidence-item strong {
    font-size: var(--ui-text-xs);
    color: var(--g9);
  }
  .hud-risk-item {
    padding: 7px 8px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--amb) 8%, var(--g0));
    border: 0.5px solid color-mix(in srgb, var(--amb) 22%, var(--g4));
    color: var(--g8);
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  .hud-action:hover, .hud-action.active {
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
    font-size: var(--ui-text-xs);
    line-height: 1.55;
    color: var(--g5);
  }

  /* ── Analyze workspace: bottom owns verification/comparison/refinement ── */

  .workspace-thesis .bull { color: var(--pos); font-weight: 700; }

  .phase-node.active {
    border-color: color-mix(in srgb, var(--amb) 55%, var(--g4));
    background: color-mix(in srgb, var(--amb) 11%, var(--g0));
  }

  .phase-node.active .phase-dot { background: var(--amb); box-shadow: 0 0 0 4px var(--amb-dd); }

  .phase-node.active .phase-label { color: var(--g9); font-weight: 700; }

  .dom-row.mid {
    min-height: 16px;
    border-block: 0.5px solid color-mix(in srgb, var(--amb) 32%, var(--g4));
    color: var(--g9);
    background: rgba(232,184,106,0.055);
  }

  .footprint-row.buy span:nth-child(4) { color: var(--pos); font-weight: 900; }
  .footprint-row.sell span:nth-child(4) { color: var(--neg); font-weight: 900; }

  .heat-cell.buy {
    color: var(--pos);
    background: linear-gradient(180deg, rgba(74,187,142,0.95), rgba(74,187,142,0.32));
  }
  .heat-cell.sell {
    color: var(--neg);
    background: linear-gradient(180deg, rgba(226,91,91,0.95), rgba(226,91,91,0.3));
  }

  .judgment-option.tone-pos { border-color: color-mix(in srgb, var(--pos) 40%, var(--g4)); color: var(--pos); }
  .judgment-option.tone-neg { border-color: color-mix(in srgb, var(--neg) 40%, var(--g4)); color: var(--neg); }

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
  .chart-controls-bar {
    height: 28px;
    padding: 0 12px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    background: var(--g0);
  }

  .hd-chip, .evidence-badge, .micro-toggle {
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
  .micro-belt-title, .micro-stat, .micro-heat-strip, .micro-depth-strip {
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
    font-size: var(--ui-text-xs);
    color: #dbe4ee;
  }
  .micro-belt-stats {
    gap: 4px;
  }
  .micro-stat {
    padding: 5px 7px;
    font-size: var(--ui-text-xs);
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
  .pb-tab:hover, .pb-tab.active {
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
  .dh-tab:hover, .dh-tab.active {
    background: rgba(255,255,255,0.026);
  }

  .phase-node.active {
    background: rgba(232,184,106,0.105);
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
  .hud-evidence-item, .hud-risk-item, .hud-action {
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

  .multichart-toggle {
    font-size: 13px;
    padding: 2px 7px;
  }
  .multichart-toggle.active {
    border-color: rgba(59,130,246,0.5);
    background: rgba(59,130,246,0.12);
    color: #93c5fd;
  }
  .multichart-toggle.active:hover {
    border-color: rgba(59,130,246,0.7);
    background: rgba(59,130,246,0.2);
    color: #bfdbfe;
  }

  .observe-mode .layout-c .chart-section.lc-main {
    margin: 3px 0 3px 3px;
    border-color: rgba(255,255,255,0.045);
    border-radius: 8px 0 0 8px;
  }

  .observe-mode .chart-controls-bar {
    height: 28px;
    padding: 0 12px;
    gap: 8px;
  }

  .observe-mode .pattern {
    opacity: 0.52;
  }

  .observe-mode .ind-label-hdr {
    display: none;
  }

  .observe-mode .evidence-badge, .observe-mode .conf-inline {
    opacity: 0.62;
  }

  .observe-mode .micro-toggle {
    margin-left: 4px;
  }

  .observe-mode :global(.chart-live .chart-toolbar), .observe-mode :global(.chart-live .chart-header--tv) {
    display: none !important;
  }

  .observe-mode :global(.chart-live .chart-board) {
    border: none !important;
    border-radius: 0 !important;
    background: #0f131d !important;
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
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
  }
  @media (max-width: 1120px) {
    .microstructure-belt {
      grid-template-columns: 1fr;
      min-height: auto;
    }
    .micro-belt-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
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
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
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
  .jc-sep { font-size: var(--ui-text-xs); color: var(--g4); }
  .jc-tf { font-size: var(--ui-text-xs); color: var(--g6); letter-spacing: 0.06em; }
  .jc-spacer { flex: 1; }
  .jc-bias {
    font-size: var(--ui-text-xs);
    color: var(--brand);
    background: var(--brand-dd);
    padding: 2px 6px;
    border-radius: 3px;
    letter-spacing: 0.06em;
  }
</style>
