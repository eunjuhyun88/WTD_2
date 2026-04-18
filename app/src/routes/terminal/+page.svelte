<script lang="ts">
  /**
   * Terminal shell
   *
   * Desktop:
   *   [TerminalCommandBar]
   *   [MarketDrawer?][ChartBoard][AnalysisRail]
   *   [TerminalBottomDock]
   *
   * Mobile:
   *   [MobileShell via TerminalShell] — owns all content (slots ignored)
   */
  import { onMount, onDestroy, untrack } from 'svelte';
  import { viewportTier } from '$lib/stores/viewportTier';
  import { activePairState, setActivePair, setActiveTimeframe } from '$lib/stores/activePairStore';
  import {
    addIndicator as addChartIndicator,
    removeIndicator as removeChartIndicator,
    normalizeIndicatorKey,
  } from '$lib/stores/chartIndicators';
  import { normalizeTimeframe } from '$lib/utils/timeframe';
  import { buildCanonicalHref } from '$lib/seo/site';
  import { get } from 'svelte/store';
  import { douniRuntimeStore } from '$lib/stores/douniRuntime';
  import { buildTerminalBoardModel } from '$lib/terminal/terminalBoardModel';
  import {
    fetchTerminalAnomalies,
    fetchTerminalQueryPresets,
    fetchTerminalStatusData,
    fetchDepthLadderData,
    fetchLiquidationClustersData,
    fetchNewsData,
    fetchPatternPhasesData,
    fetchScannerAlerts,
    fetchLiveSignals,
    type LiveSignal,
    fetchTerminalAnalysisBundle,
    fetchTrendingData,
    type TerminalAnalyzeData,
  } from '$lib/terminal/terminalDataOrchestrator';
  import {
    formatAgentFailureMessage,
    isAnalysisQuery,
    snapshotFingerprint,
    streamTerminalMessage,
  } from '$lib/terminal/terminalActions';
  import {
    fetchFlowBias,
    fetchMarketEvents,
    sendMemoryDebugSession,
  } from '$lib/api/terminalBackend';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import {
    fetchPatternCaptures,
  } from '$lib/api/terminalPersistence';
  import { fetchTerminalSession } from '$lib/api/terminalSession';
  import {
    buildPatternRecallMatches,
    buildTerminalDecisionBundle,
    type TerminalDecisionBundle,
  } from '$lib/terminal/panelAdapter';
  import { deriveWatchlistPreview } from '$lib/terminal/watchlistPreview';
  import {
    buildTerminalBootstrapTasks,
    buildTerminalRefreshIntervals,
    runTerminalMemoryRerank,
    executeTerminalDockAction,
    emitTerminalMemoryFeedback,
    runTerminalVisibilityRefresh,
    createTerminalReportExport,
    buildTerminalPersistencePayload,
    buildTerminalRestorePlan,
    findTerminalAlertRule,
    getTerminalExportCompletionMessage,
    pollTerminalExportJobOnce,
    removeSavedTerminalAlert,
    toggleAnalysisPin,
    toggleRiskAlert,
    touchTerminalWatchlistSymbol,
  } from '$lib/terminal/terminalController';
  import type {
    AnalyzeEnvelope,
    DepthLadderEnvelope,
    EventsEnvelope,
    LiquidationClustersEnvelope,
    TerminalAnomaly,
    TerminalPreset,
  } from '$lib/contracts/terminalBackend';
  import type {
    MacroCalendarItem,
    TerminalAlertRule,
    TerminalExportJob,
    TerminalPin,
    TerminalWatchlistItem,
  } from '$lib/contracts/terminalPersistence';

  import TerminalCommandBar from '../../components/terminal/workspace/TerminalCommandBar.svelte';
  import TerminalLeftRail from '../../components/terminal/workspace/TerminalLeftRail.svelte';
  import TerminalBottomDock from '../../components/terminal/workspace/TerminalBottomDock.svelte';
  import TerminalContextPanel from '../../components/terminal/workspace/TerminalContextPanel.svelte';
  import ChartBoard from '../../components/terminal/workspace/ChartBoard.svelte';
  import PatternLibraryPanel from '../../components/terminal/workspace/PatternLibraryPanel.svelte';
  // W-0086 shell components
  import TerminalShell from '../../components/terminal/shell/TerminalShell.svelte';
  import SaveStrip from '../../components/terminal/workspace/SaveStrip.svelte';
  import LiveSignalPanel from '$lib/components/live/LiveSignalPanel.svelte';
  import MarketDrawer from '../../components/terminal/workspace/MarketDrawer.svelte';

  import type { TerminalAsset, TerminalVerdict, TerminalEvidence } from '$lib/types/terminal';

  // ─── State ──────────────────────────────────────────────────

  let boardSymbols = $state<string[]>([]);
  let stubAssetMap = $state<Record<string, TerminalAsset>>({});
  let decisionMap = $state<Record<string, TerminalDecisionBundle>>({});
  let memoryQueryIdMap = $state<Record<string, string>>({});
  let memoryTopEvidenceMap = $state<Record<string, string[]>>({});
  let activeSymbol = $state('');

  type TerminalSnapshot = NonNullable<AnalyzeEnvelope['snapshot']> & {
    rsi14?: number;
    ema_alignment?: string;
    htf_structure?: string;
  };

  let analysisData = $state<TerminalAnalyzeData | null>(null);
  let analysisDataMap = $state<Record<string, TerminalAnalyzeData>>({});
  let analysisFingerprintMap = $state<Record<string, string>>({});
  const analysisInFlight = new Map<string, Promise<void>>();
  const memoryRerankInFlight = new Set<string>();
  let activeReadPathKey = $state('');
  let newsData = $state<any>(null);

  let flowBias = $state<'LONG' | 'SHORT' | 'NEUTRAL'>('NEUTRAL');
  let trendingData = $state<any>(null);
  let scannerAlerts = $state<any[]>([]);
  let savedAlertRules = $state<TerminalAlertRule[]>([]);
  let persistedWatchlist = $state<TerminalWatchlistItem[]>([]);
  let persistedPins = $state<TerminalPin[]>([]);
  let macroCalendarItems = $state<MacroCalendarItem[]>([]);
  let latestExportJob = $state<TerminalExportJob | null>(null);
  let marketEvents = $state<NonNullable<EventsEnvelope['data']>['records'] extends Array<infer T> ? T[] : Array<{ tag?: string; level?: string; text?: string }>>([]);
  let terminalQueryPresets = $state<TerminalPreset[]>([]);
  let terminalAnomalies = $state<TerminalAnomaly[]>([]);
  let terminalStatus = $state<{ scannedAt: number; alertCount: number; anomalyCount: number } | null>(null);
  let readPathDepth = $state<DepthLadderEnvelope['data'] | null>(null);
  let readPathLiq = $state<LiquidationClustersEnvelope['data'] | null>(null);
  let ohlcvBars = $state<any[]>([]);
  let layerBarsMap = $state<Record<string, any[]>>({});
  let chartPayloadMap = $state<Record<string, ChartSeriesPayload>>({});
  let activeChartPayload = $state<ChartSeriesPayload | null>(null);

  let isStreaming = $state(false);
  let streamText = $state('');
  let loadingSymbols = $state(new Set<string>());

  // ── Pattern Engine state ───────────────────────────────────
  interface PatternPhaseRow { slug: string; phaseName: string; symbols: string[]; }
  let patternPhases = $state<PatternPhaseRow[]>([]);
  let liveSignals = $state<LiveSignal[]>([]);
  let liveSignalsCached = $state(false);
  let liveSignalsScannedAt = $state('');
  let showPatternLibrary = $state(false);
  let patternCaptureRecords = $state<Awaited<ReturnType<typeof fetchPatternCaptures>>>([]);
  let lastSavedCaptureId = $state<string | null>(null);
  let showLabCta = $state(false);
  let labCtaSlug = $state<string | null>(null);
  let patternCaptureLoading = $state(false);
  let exportPollTimer: ReturnType<typeof setInterval> | null = null;

  // ── Capture modal ──────────────────────────────────────────
  // On desktop the persistent left rail is always shown; drawer is for tablet/mobile only
  const isDesktop = $derived($viewportTier.tier === 'DESKTOP');
  let showLeftRail = $state(true);
  let activeAnalysisTab = $state<'summary' | 'entry' | 'risk' | 'catalysts' | 'metrics'>('summary');
  let chartWorkspaceEl = $state<HTMLElement | undefined>(undefined);

  // ── Chart price-level overlays (entry / target / stop) ───────
  // Extracted from deep.atr_levels after each analysis; passed to ChartBoard
  interface VerdictLevels { entry?: number; target?: number; stop?: number; }
  let chartLevels = $state<VerdictLevels>({});

  function extractLevels(data: TerminalAnalyzeData | null | undefined): VerdictLevels {
    const deep = data?.deep;
    if (!deep?.atr_levels) return {};
    const bias = _deepBias(deep.verdict ?? '');
    const price = data?.price ?? data?.snapshot?.last_close;
    if (bias === 'bearish') {
      return {
        entry:  price  ? Number(price)                            : undefined,
        target: deep.atr_levels.tp1_short  ? Number(deep.atr_levels.tp1_short)  : undefined,
        stop:   deep.atr_levels.stop_short ? Number(deep.atr_levels.stop_short) : undefined,
      };
    }
    return {
      entry:  price  ? Number(price)                           : undefined,
      target: deep.atr_levels.tp1_long  ? Number(deep.atr_levels.tp1_long)  : undefined,
      stop:   deep.atr_levels.stop_long ? Number(deep.atr_levels.stop_long) : undefined,
    };
  }

  type HistoryEntry = { role: 'user' | 'assistant'; content: string };
  let chatHistory = $state<HistoryEntry[]>([]);

  /** Fingerprint of the snapshot used in the last completed AI response */
  let prevSnapshotFingerprint = $state('');

  // Narrow deriveds: only pair+tf — price changes must NOT re-trigger $effect
  const gPair = $derived($activePairState.pair);
  const gTf   = $derived($activePairState.timeframe);

  // ─── Helpers ────────────────────────────────────────────────

  function pairToSymbol(pair: string): string {
    return pair.replace('/', '');
  }

  function symbolToTF(tf: string): string {
    // Normalize both "4H" (CommandBar format) and "4h" (chart format) → lowercase chart format
    const norm = tf.toLowerCase();
    const valid = ['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','1w'];
    return valid.includes(norm) ? norm : '4h';
  }

  function buildStubAsset(symbol: string): TerminalAsset {
    return {
      symbol,
      venue: 'USDT Perp',
      lastPrice: 0,
      changePct15m: 0, changePct1h: 0, changePct4h: 0,
      volumeRatio1h: 1, oiChangePct1h: 0, fundingRate: 0,
      fundingPercentile7d: 50, spreadBps: 0,
      bias: 'neutral', confidence: 'low',
      action: '—', invalidation: '—',
      sources: [],
      freshnessStatus: 'delayed',
      tf15m: '→', tf1h: '→', tf4h: '→',
    };
  }

  function localizeTerminalText(ko: string, en: string): string {
    if (typeof navigator === 'undefined') return en;
    return navigator.language.toLowerCase().startsWith('ko') ? ko : en;
  }

  function pushAssistantMessage(content: string, transient = false) {
    chatHistory = ([...chatHistory, { role: 'assistant' as const, content }] as HistoryEntry[]).slice(-10);
    streamText = content;
    if (transient) {
      setTimeout(() => {
        if (streamText === content) streamText = '';
      }, 4000);
    }
  }

  function formatAgentFailure(detail?: string): string {
    return formatAgentFailureMessage(detail, localizeTerminalText('AI 응답 실패', 'AI response failed'));
  }

  async function handlePinToggle(): Promise<void> {
    const symbol = activeSymbol || pairToSymbol(gPair);
    if (!symbol) return;
    const timeframe = symbolToTF(gTf);
    const payload = buildTerminalPersistencePayload({
      symbol,
      timeframe,
      analysisData: analysisDataMap[symbol] ?? analysisData,
      decision: decisionMap[symbol],
    });
    const { pins, watchlist, result } = await toggleAnalysisPin({
      symbol,
      timeframe,
      pins: persistedPins,
      watchlist: persistedWatchlist,
      activeSymbol,
      payload,
    });
    persistedPins = pins;
    persistedWatchlist = watchlist;
    pushAssistantMessage(
      result.message.includes('removed')
        ? localizeTerminalText('핀을 해제했습니다.', result.message)
        : localizeTerminalText('분석을 핀에 저장했습니다.', result.message),
      result.transient ?? true,
    );
  }

  async function handleAlertToggle(): Promise<void> {
    const symbol = activeSymbol || pairToSymbol(gPair);
    if (!symbol) return;
    const timeframe = symbolToTF(gTf);
    const payload = buildTerminalPersistencePayload({
      symbol,
      timeframe,
      analysisData: analysisDataMap[symbol] ?? analysisData,
      decision: decisionMap[symbol],
    });
    const { alerts, result } = await toggleRiskAlert({
      symbol,
      timeframe,
      alerts: savedAlertRules,
      payload,
    });
    savedAlertRules = alerts;
    pushAssistantMessage(
      result.message.includes('removed')
        ? localizeTerminalText('저장된 알림을 삭제했습니다.', result.message)
        : localizeTerminalText('리스크 알림을 저장했습니다.', result.message),
      result.transient ?? true,
    );
  }

  async function handleDeleteSavedAlert(id: string): Promise<void> {
    savedAlertRules = await removeSavedTerminalAlert({ alerts: savedAlertRules, id });
  }

  async function handleCreateExport(): Promise<void> {
    const symbol = activeSymbol || pairToSymbol(gPair);
    if (!symbol) return;
    const timeframe = symbolToTF(gTf);
    const payload = buildTerminalPersistencePayload({
      symbol,
      timeframe,
      analysisData: analysisDataMap[symbol] ?? analysisData,
      decision: decisionMap[symbol],
    });
    const { job, result } = await createTerminalReportExport({
      symbol,
      timeframe,
      payload,
    });
    if (!job) {
      pushAssistantMessage(localizeTerminalText('리포트 export 생성에 실패했습니다.', result.message), result.transient ?? true);
      return;
    }
    latestExportJob = job;
    await pollExportJob(job.id);
    pushAssistantMessage(localizeTerminalText('터미널 리포트 export를 시작했습니다.', result.message), result.transient ?? true);
  }

  async function handleDockAction(label: string, prompt: string): Promise<void> {
    if (label === 'Export') {
      await handleCreateExport();
      return;
    }
    const symbol = activeSymbol || pairToSymbol(gPair);
    const timeframe = symbolToTF(gTf);
    const dockResult = await executeTerminalDockAction({
      label,
      prompt,
      symbol,
      timeframe,
      loadAlerts,
      loadTerminalPersistenceState,
      loadAnalysis,
      loadActiveReadPath,
      loadTerminalReadPath,
      loadPatternCaptures,
    });
    if (dockResult.handled) {
      if (dockResult.activeAnalysisTab) activeAnalysisTab = dockResult.activeAnalysisTab;
      if (dockResult.showPatternLibrary) showPatternLibrary = true;
      if (dockResult.messageKey === 'alerts_refreshed') {
        pushAssistantMessage(localizeTerminalText('알림 레일을 최신 상태로 갱신했습니다.', 'Alerts refreshed from backend routes.'), dockResult.transient ?? true);
      } else if (dockResult.messageKey === 'board_refreshed') {
        pushAssistantMessage(localizeTerminalText('보드를 최신 백엔드 상태로 갱신했습니다.', 'Board refreshed from backend routes.'), dockResult.transient ?? true);
      } else if (dockResult.messageKey === 'scan_refreshed') {
        pushAssistantMessage(localizeTerminalText('스캔 상태를 최신 상태로 갱신했습니다.', 'Scan state refreshed from backend routes.'), dockResult.transient ?? true);
      } else if (dockResult.messageKey === 'pattern_modal_opened') {
        pushAssistantMessage(localizeTerminalText('현재 보이는 차트 범위는 차트 안의 Save Setup으로 저장하세요.', 'Use Save Setup inside the chart to save the current visible range.'), dockResult.transient ?? true);
      } else if (dockResult.messageKey === 'pattern_recall_opened') {
        pushAssistantMessage(localizeTerminalText('저장 패턴 검색 패널을 열었습니다.', 'Opened pattern recall panel.'), dockResult.transient ?? true);
      }
      return;
    }
    if (label === 'Fails') {
      await loadPatternCaptures();
      const failed = patternCaptureRecords
        .filter((record) => record.decision.verdict === 'bearish' || (record.reason ?? '').toLowerCase().includes('fail'))
        .slice(0, 5)
        .map((record) => `${record.symbol.replace('USDT', '')} ${record.timeframe.toUpperCase()} · ${record.reason ?? 'no reason'}`);
      pushAssistantMessage(
        failed.length > 0
          ? `${localizeTerminalText('최근 실패 리콜', 'Recent failed recalls')}: ${failed.join(' | ')}`
          : localizeTerminalText('최근 실패 리콜이 없습니다.', 'No failed recalls in recent saved patterns.'),
        true
      );
      return;
    }
    await sendCommand(prompt);
  }

  async function pollExportJob(id: string): Promise<void> {
    if (exportPollTimer) clearInterval(exportPollTimer);
    exportPollTimer = setInterval(() => {
      void (async () => {
        const { job, completed } = await pollTerminalExportJobOnce(id);
        if (!job) return;
        latestExportJob = job;
        if (completed) {
          if (exportPollTimer) clearInterval(exportPollTimer);
          exportPollTimer = null;
          const message = getTerminalExportCompletionMessage(job.status);
          if (!message) return;
          pushAssistantMessage(
            job.status === 'succeeded'
              ? localizeTerminalText('터미널 리포트 export 완료', message)
              : localizeTerminalText('터미널 리포트 export 실패', message),
            true,
          );
        }
      })();
    }, 1200);
  }

  function _deepBias(verdict: string): 'bullish' | 'bearish' | 'neutral' {
    if (!verdict) return 'neutral';
    if (verdict.includes('BULL')) return 'bullish';
    if (verdict.includes('BEAR')) return 'bearish';
    return 'neutral';
  }

  function applyTerminalDecision(symbol: string, data: TerminalAnalyzeData) {
    const decision = buildTerminalDecisionBundle(symbol, data);
    return decision;
  }

  function analysisFingerprint(data: TerminalAnalyzeData | null | undefined): string {
    if (!data) return '';
    const snap = data.snapshot;
    const deep = data.deep as any;
    const ens = data.ensemble;
    return [
      data.symbol ?? '',
      data.mode ?? '',
      data.tf ?? '',
      data.price != null ? data.price.toFixed(4) : '',
      data.change24h != null ? data.change24h.toFixed(4) : '',
      snapshotFingerprint(snap),
      deep?.verdict ?? '',
      deep?.total_score != null ? String(deep.total_score) : '',
      ens?.direction ?? '',
      ens?.ensemble_score != null ? String(ens.ensemble_score) : '',
      (ens?.block_analysis?.disqualifiers ?? []).join('|'),
    ].join('::');
  }

  function applyAnalysisState(symbol: string, data: TerminalAnalyzeData) {
    const nextFingerprint = analysisFingerprint(data);
    const prevFingerprint = analysisFingerprintMap[symbol] ?? '';
    const changed = nextFingerprint !== prevFingerprint;
    if (changed) {
      analysisDataMap = { ...analysisDataMap, [symbol]: data };
      analysisFingerprintMap = { ...analysisFingerprintMap, [symbol]: nextFingerprint };
      if (symbol === activeSymbol || !analysisData) {
        analysisData = data;
      }
    } else if (!analysisData && symbol === activeSymbol) {
      analysisData = data;
    }
    return changed;
  }

  function applyWatchlistPreviewState(symbol: string, preview: TerminalWatchlistItem['preview']) {
    if (!preview || !persistedWatchlist.some((item) => item.symbol === symbol)) return;
    persistedWatchlist = persistedWatchlist.map((item) =>
      item.symbol === symbol
        ? { ...item, preview }
        : item,
    );
  }

  function sameAsset(a?: TerminalAsset | null, b?: TerminalAsset | null): boolean {
    if (!a || !b) return false;
    return (
      a.symbol === b.symbol &&
      a.lastPrice === b.lastPrice &&
      a.changePct4h === b.changePct4h &&
      a.volumeRatio1h === b.volumeRatio1h &&
      a.oiChangePct1h === b.oiChangePct1h &&
      a.fundingRate === b.fundingRate &&
      a.bias === b.bias &&
      a.confidence === b.confidence &&
      a.action === b.action &&
      a.invalidation === b.invalidation &&
      a.tf15m === b.tf15m &&
      a.tf1h === b.tf1h &&
      a.tf4h === b.tf4h
    );
  }

  function sameVerdict(a?: TerminalVerdict | null, b?: TerminalVerdict | null): boolean {
    if (!a || !b) return false;
    return (
      a.direction === b.direction &&
      a.confidence === b.confidence &&
      a.reason === b.reason &&
      a.action === b.action &&
      a.invalidation === b.invalidation &&
      (a.against?.join('|') ?? '') === (b.against?.join('|') ?? '')
    );
  }

  function sameEvidence(a: TerminalEvidence[] = [], b: TerminalEvidence[] = []): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      const x = a[i];
      const y = b[i];
      if (
        x.metric !== y.metric ||
        x.value !== y.value ||
        x.delta !== y.delta ||
        x.interpretation !== y.interpretation ||
        x.state !== y.state ||
        x.sourceCount !== y.sourceCount
      ) return false;
    }
    return true;
  }

  function applyDecisionState(symbol: string, decision: TerminalDecisionBundle, allowInsert = true) {
    const hasSymbol = boardSymbols.includes(symbol);
    const currentDecision = decisionMap[symbol] ?? null;
    const currentAsset = currentDecision?.asset ?? stubAssetMap[symbol] ?? null;
    const currentVerdict = currentDecision?.verdict ?? null;
    const currentEvidence = currentDecision?.evidence ?? [];
    const assetChanged = !sameAsset(currentAsset, decision.asset);
    const verdictChanged = !sameVerdict(currentVerdict, decision.verdict);
    const evidenceChanged = !sameEvidence(currentEvidence, decision.evidence);

    if (!hasSymbol && allowInsert) {
      boardSymbols = [symbol, ...boardSymbols].slice(0, 4);
    } else if (!currentAsset && allowInsert && !hasSymbol) {
      boardSymbols = [symbol, ...boardSymbols].slice(0, 4);
    }
    const decisionChanged = assetChanged || verdictChanged || evidenceChanged || !currentDecision;
    if (decisionChanged) {
      decisionMap = { ...decisionMap, [symbol]: decision };
    }
    return { assetChanged, verdictChanged, evidenceChanged };
  }

  // ─── Data Fetching ───────────────────────────────────────────

  async function loadAnalysis(symbol: string, tf: string) {
    const loadKey = `${symbol}:${tf}`;
    const existing = analysisInFlight.get(loadKey);
    if (existing) {
      await existing;
      return;
    }

    const run = (async () => {
      loadingSymbols = new Set([...loadingSymbols, symbol]);

      if (!boardSymbols.includes(symbol)) {
        boardSymbols = [symbol, ...boardSymbols].slice(0, 4);
        stubAssetMap = { ...stubAssetMap, [symbol]: buildStubAsset(symbol) };
      }
      if (!activeSymbol) activeSymbol = symbol;

      try {
        const bundle = await fetchTerminalAnalysisBundle({ symbol, tf });
        const data = bundle.analysisData;
        const isCurrentActive = symbol === activeSymbol;
        if (bundle.chartPayload) {
          chartPayloadMap = { ...chartPayloadMap, [symbol]: bundle.chartPayload };
        }
        if (isCurrentActive) {
          ohlcvBars = bundle.ohlcvBars;
          layerBarsMap = bundle.layerBarsMap;
          activeChartPayload = bundle.chartPayload ?? chartPayloadMap[symbol] ?? null;
        }

        applyAnalysisState(symbol, data);
        applyWatchlistPreviewState(symbol, deriveWatchlistPreview(data));
        const decision = applyTerminalDecision(symbol, data);
        applyDecisionState(symbol, decision, true);
        if (isCurrentActive || !persistedWatchlist.some((item) => item.symbol === symbol)) {
          void (async () => {
            persistedWatchlist = await touchTerminalWatchlistSymbol({
              watchlist: persistedWatchlist,
              symbol,
              timeframe: tf,
              activeSymbol,
              activate: isCurrentActive,
            });
          })();
        }

        // Memory rerank is expensive. Run it once per active symbol+tf+tab tuple.
        if (isCurrentActive && decision.evidence.length > 0) {
          const rerankKey = `${symbol}:${tf}:${activeAnalysisTab}`;
          if (!memoryRerankInFlight.has(rerankKey)) {
            memoryRerankInFlight.add(rerankKey);
            void (async () => {
              try {
                const rerank = await runTerminalMemoryRerank({
                  symbol,
                  timeframe: tf,
                  intent: activeAnalysisTab,
                  evidence: decision.evidence,
                });
                if (!rerank) return;
                applyDecisionState(symbol, { ...decision, evidence: rerank.evidence }, false);
                memoryQueryIdMap = {
                  ...memoryQueryIdMap,
                  [symbol]: rerank.queryId,
                };
                memoryTopEvidenceMap = {
                  ...memoryTopEvidenceMap,
                  [symbol]: rerank.topEvidenceIds,
                };
              } catch (memoryError) {
                console.warn('memory rerank skipped:', memoryError);
              } finally {
                memoryRerankInFlight.delete(rerankKey);
              }
            })();
          }
        }

        // Extract price levels → chart overlay (entry / target / stop)
        if (isCurrentActive || boardSymbols.length === 1) {
          chartLevels = extractLevels(data);
        }
      } catch (e) {
        console.error('loadAnalysis error:', e);
      } finally {
        loadingSymbols = new Set([...loadingSymbols].filter(s => s !== symbol));
        analysisInFlight.delete(loadKey);
      }
    })();

    analysisInFlight.set(loadKey, run);
    await run;
  }

  async function loadActiveReadPath(symbol: string, tf: string) {
    const pair = symbol.replace('USDT', '/USDT');
    const nextKey = `${symbol}:${tf}`;
    if (nextKey === activeReadPathKey && readPathDepth && readPathLiq) return;
    try {
      const [depth, liq] = await Promise.all([
        fetchDepthLadderData(pair, tf),
        fetchLiquidationClustersData(pair, tf),
      ]);
      if (activeSymbol !== symbol) return;
      readPathDepth = depth;
      readPathLiq = liq;
      activeReadPathKey = nextKey;
    } catch {}
  }

  async function loadFlow(pair: string, tf: string) {
    try {
      flowBias = await fetchFlowBias(pair, tf);
    } catch {}
  }

  async function loadTrending() {
    try {
      trendingData = await fetchTrendingData();
    } catch {}
  }

  async function loadTerminalReadPath() {
    try {
      const [status, presets, anomalies] = await Promise.all([
        fetchTerminalStatusData(),
        fetchTerminalQueryPresets(),
        fetchTerminalAnomalies(12),
      ]);
      terminalStatus = status
        ? {
            scannedAt: status.scannedAt,
            alertCount: status.alertCount,
            anomalyCount: status.anomalyCount,
          }
        : null;
      terminalQueryPresets = presets;
      terminalAnomalies = anomalies;
    } catch {}
  }

  async function loadTerminalPersistenceState() {
    try {
      const session = await fetchTerminalSession();
      const restore = buildTerminalRestorePlan(session);

      persistedWatchlist = restore.watchlist;
      persistedPins = restore.pins;
      savedAlertRules = restore.alerts;
      macroCalendarItems = restore.macro;
      latestExportJob = restore.latestExportJob;

      if (restore.compareSymbols.length >= 2) {
        boardSymbols = restore.compareSymbols;
        stubAssetMap = Object.fromEntries(restore.compareSymbols.map((symbol) => [symbol, buildStubAsset(symbol)]));
        activeSymbol = restore.activeSymbol ?? activeSymbol;
        if (restore.compareTimeframe) {
          setActiveTimeframe(normalizeTimeframe(restore.compareTimeframe));
        }
        if (activeSymbol) {
          setActivePair(activeSymbol.replace('USDT', '/USDT'));
        }
        for (const symbol of restore.compareSymbols) {
          void loadAnalysis(symbol, symbolToTF(restore.compareTimeframe ?? gTf));
        }
      } else if (restore.activeSymbol) {
        setActivePair(restore.activeSymbol.replace('USDT', '/USDT'));
        if (restore.activeTimeframe) {
          setActiveTimeframe(normalizeTimeframe(restore.activeTimeframe));
        }
      } else {
        latestExportJob = restore.latestExportJob;
      }
    } catch {}
  }

  async function loadNews() {
    try {
      newsData = await fetchNewsData();
    } catch {}
  }

  async function loadAlerts() {
    try {
      scannerAlerts = await fetchScannerAlerts(12);
    } catch {}
  }

  async function loadEvents() {
    try {
      const pair = gPair || 'BTC/USDT';
      const tf = symbolToTF(gTf);
      marketEvents = await fetchMarketEvents(pair, tf);
    } catch {}
  }

  async function loadPatternPhases() {
    try {
      patternPhases = await fetchPatternPhasesData();
    } catch {}
  }

  async function loadPatternCaptures() {
    patternCaptureLoading = true;
    try {
      patternCaptureRecords = await fetchPatternCaptures({ limit: 120 });
    } catch {
      patternCaptureRecords = [];
    } finally {
      patternCaptureLoading = false;
    }
  }

  async function loadLiveSignals() {
    try {
      const envelope = await fetchLiveSignals();
      if (envelope) {
        liveSignals = envelope.signals;
        liveSignalsCached = envelope.cached;
        liveSignalsScannedAt = envelope.scanned_at;
      }
    } catch {}
  }

  // ─── SSE Command Flow ─────────────────────────────────────────

  async function sendCommand(text: string, _files?: File[]) {
    if (!text.trim() || isStreaming) return;

    const runtime = get(douniRuntimeStore);

    // TERMINAL mode: data only, no AI call
    if (runtime.mode === 'TERMINAL') {
      const banner = localizeTerminalText(
        '[터미널 모드] AI 분석 없음 — Settings > AI에서 모드를 변경하세요.',
        '[Terminal mode] No AI analysis — change the mode in Settings > AI.',
      );
      chatHistory = ([...chatHistory, { role: 'user' as const, content: text }] as HistoryEntry[]).slice(-10);
      pushAssistantMessage(banner, true);
      return;
    }

    // Delta detection: if snapshot hasn't changed since last AI response and
    // the question is purely about current market data, skip the LLM call
    const currentFingerprint = snapshotFingerprint(analysisData?.snapshot);
    if (
      prevSnapshotFingerprint &&
      currentFingerprint &&
      prevSnapshotFingerprint === currentFingerprint &&
      isAnalysisQuery(text)
    ) {
      const noChange = localizeTerminalText(
        '변화 없음 — 마지막 분석 이후 시장 데이터가 업데이트되지 않았어.',
        'No change — market data has not updated since the last analysis.',
      );
      chatHistory = ([...chatHistory, { role: 'user' as const, content: text }] as HistoryEntry[]).slice(-10);
      pushAssistantMessage(noChange, true);
      return;
    }

    isStreaming = true;
    streamText = '';
    const symbol = pairToSymbol(gPair);
    const tf = symbolToTF(gTf);
    chatHistory = ([...chatHistory, { role: 'user' as const, content: text }] as HistoryEntry[]).slice(-10);

    try {
      const body = {
        message: text,
        history: chatHistory.slice(0, -1).map(h => ({ role: h.role as string, content: h.content, ts: Date.now() })),
        snapshot: analysisData?.snapshot ?? null,
        snapshotTs: analysisData ? Date.now() : undefined,
        detectedSymbol: symbol,
        locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
        runtimeConfig: {
          mode: runtime.mode,
          provider: runtime.provider,
          apiKey: runtime.apiKey,
          ollamaModel: runtime.ollamaModel,
          ollamaEndpoint: runtime.ollamaEndpoint,
        },
      };

      const { assistantText, streamError } = await streamTerminalMessage({
        endpoint: '/api/cogochi/terminal/message',
        body,
        onEvent: async (event) => {
          await handleSSEEvent(event, symbol, tf);
        },
        onTextDelta: (nextText) => {
          streamText = nextText;
        },
        onStreamError: (message) => {
          const formatted = formatAgentFailure(message);
          streamText = streamText ? `${streamText}\n\n${formatted}` : formatted;
        },
      });

      const finalAssistantText = assistantText
        ? (streamError ? `${assistantText}\n\n${formatAgentFailure(streamError)}` : assistantText)
        : '';

      if (finalAssistantText) {
        chatHistory = ([...chatHistory, { role: 'assistant' as const, content: finalAssistantText }] as HistoryEntry[]).slice(-10);
        // Record snapshot fingerprint so identical follow-up questions get the delta guard
        if (!streamError) {
          prevSnapshotFingerprint = snapshotFingerprint(analysisData?.snapshot);
        }
      } else if (streamError) {
        pushAssistantMessage(streamError);
      }
    } catch (e) {
      console.error('SSE error:', e);
      pushAssistantMessage(formatAgentFailure(e instanceof Error ? e.message : undefined));
    } finally {
      isStreaming = false;
      streamText = '';
    }
  }

  async function handleSSEEvent(event: any, defaultSymbol: string, _tf: string) {
    if (!event?.type) return;
    if (event.type === 'research_block' && event.payload) {
      const envelope = event.payload;
      if (envelope?.snapshot || envelope?.ensemble) {
        const sym = envelope.symbol ?? defaultSymbol;
        applyAnalysisState(sym, envelope);
        const decision = applyTerminalDecision(sym, envelope);
        const hadAsset = boardSymbols.includes(sym);
        applyDecisionState(sym, decision, true);
        if (!activeSymbol) activeSymbol = sym;
        // Update chart levels for active symbol
        if (sym === activeSymbol || !activeSymbol) chartLevels = extractLevels(envelope);
      }
    }
    if (event.type === 'tool_result' && event.name === 'analyze' && event.data) {
      const sym = event.data.symbol ?? defaultSymbol;
      applyAnalysisState(sym, event.data);
      const decision = applyTerminalDecision(sym, event.data);
      applyDecisionState(sym, decision, false);
      if (sym === activeSymbol) chartLevels = extractLevels(event.data);
    }
    // W-0102 Slice 2/3: chart_action SSE → ChartBoard reflection.
    // LLM tool call from chart_control tool emits these so natural-language
    // "4h 보여줘" / "ETH로 전환" / "CVD 추가해" drive the chart directly.
    if (event.type === 'chart_action') {
      const action = event.action as string | undefined;
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      if (action === 'change_symbol' && typeof payload.symbol === 'string') {
        const raw = payload.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const sym = raw.endsWith('USDT') ? raw : `${raw}USDT`;
        if (sym.length > 4) selectAsset(sym);
      } else if (action === 'change_timeframe' && typeof payload.timeframe === 'string') {
        try {
          setActiveTimeframe(normalizeTimeframe(payload.timeframe));
        } catch (err) {
          console.warn('chart_action: invalid timeframe', payload.timeframe, err);
        }
      } else if (action === 'add_indicator' && typeof payload.indicator === 'string') {
        const key = normalizeIndicatorKey(payload.indicator);
        if (key) addChartIndicator(key);
        else console.warn('chart_action: unknown indicator', payload.indicator);
      } else if (action === 'remove_indicator' && typeof payload.indicator === 'string') {
        const key = normalizeIndicatorKey(payload.indicator);
        if (key) removeChartIndicator(key);
      }
    }
  }

  function handleQueryChip(query: string) { sendCommand(query); }

  function selectAsset(symbol: string) {
    activeSymbol = symbol;
    activeAnalysisTab = 'summary';
    activeChartPayload = chartPayloadMap[symbol] ?? null;
    if (!decisionMap[symbol]) loadAnalysis(symbol, symbolToTF(gTf));
    void loadActiveReadPath(symbol, symbolToTF(gTf));
    void (async () => {
      persistedWatchlist = await touchTerminalWatchlistSymbol({
        watchlist: persistedWatchlist,
        symbol,
        timeframe: symbolToTF(gTf),
        activeSymbol,
        activate: true,
      });
    })();
    setActivePair(symbol.replace('USDT', '/USDT'));
  }

  function clearBoard() {
    boardSymbols = [];
    stubAssetMap = {};
    decisionMap = {};
    memoryQueryIdMap = {};
    memoryTopEvidenceMap = {};
    analysisDataMap = {};
    analysisFingerprintMap = {};
    chartPayloadMap = {};
    activeSymbol = '';
    activeChartPayload = null;
    chartLevels = {};
    activeAnalysisTab = 'summary';
    loadAnalysis(pairToSymbol(gPair), symbolToTF(gTf));
  }

  function trackMemoryFeedbackForSymbol(symbol: string, event: 'used' | 'confirmed', intent = activeAnalysisTab) {
    const queryId = memoryQueryIdMap[symbol];
    const topEvidenceIds = memoryTopEvidenceMap[symbol] ?? [];
    const tf = symbolToTF(gTf);
    void emitTerminalMemoryFeedback({
      queryId,
      evidenceIds: topEvidenceIds,
      event,
      symbol,
      timeframe: tf,
      intent,
    });
  }

  function handleAnalysisTabChange(tab: string) {
    activeAnalysisTab = tab as typeof activeAnalysisTab;
  }

  function handleRetryAnalysis() {
    const sym = activeSymbol || pairToSymbol(gPair);
    if (!sym) return;
    analysisData = null;
    const tf = symbolToTF(gTf);
    void loadAnalysis(sym, tf);
  }

  function handleCaptureSaved(captureId: string) {
    lastSavedCaptureId = captureId;
    labCtaSlug = activeSymbol ? activeSymbol.toLowerCase().replace('usdt', '') : null;
    showLabCta = true;
    setTimeout(() => {
      if (lastSavedCaptureId === captureId) lastSavedCaptureId = null;
    }, 5000);
    setTimeout(() => { showLabCta = false; }, 15000);
    void loadPatternCaptures();
    if (activeSymbol) {
      trackMemoryFeedbackForSymbol(activeSymbol, 'confirmed');
      void sendMemoryDebugSession({
        sessionId: `capture:${activeSymbol}:${Date.now()}`,
        symbol: activeSymbol,
        timeframe: symbolToTF(gTf),
        intent: 'save_setup',
        hypotheses: [
          {
            id: `capture-${activeSymbol}`,
            text: activeVerdict?.reason || activeAsset?.action || `${activeSymbol} saved setup`,
            status: 'confirmed',
            evidence: activeEvidence.slice(0, 2).map((item) => `${item.metric} ${item.value}`),
          },
        ],
      });
    }
  }

  function handlePatternLibrarySelect(record: { symbol: string; timeframe: string }) {
    showPatternLibrary = false;
    setActiveTimeframe(normalizeTimeframe(record.timeframe));
    selectAsset(record.symbol);
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  let flowInterval: ReturnType<typeof setInterval>;
  let trendingInterval: ReturnType<typeof setInterval>;
  let readPathInterval: ReturnType<typeof setInterval>;
  let alertsInterval: ReturnType<typeof setInterval>;
  let eventsInterval: ReturnType<typeof setInterval>;
  let patternInterval: ReturnType<typeof setInterval>;
  let bootstrapTimers: Array<ReturnType<typeof setTimeout>> = [];

  function runIfVisible(task: () => void) {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    task();
  }

  function scheduleBootstrapTask(task: () => void, delayMs: number) {
    const timer = setTimeout(() => {
      bootstrapTimers = bootstrapTimers.filter((item) => item !== timer);
      runIfVisible(task);
    }, delayMs);
    bootstrapTimers = [...bootstrapTimers, timer];
  }

  onMount(() => {
    // ── URL param: ?symbol=BTCUSDT jumps straight to that asset ──────────────
    const searchParams = new URLSearchParams(window.location.search);
    const symbolParam = searchParams.get('symbol');
    if (symbolParam) {
      const pairStr = symbolParam.toUpperCase().replace(/USDT$/, '') + '/USDT';
      setActivePair(pairStr);
    }

    // ── URL param: ?q=<prompt> auto-submits to BottomDock (W-0102 Slice 1) ──
    // Home composer / Dashboard Watching cards send users here via /terminal?q=…
    // so the prompt becomes the first message in the Terminal SSE thread.
    const qParam = searchParams.get('q');
    if (qParam && qParam.trim()) {
      const qText = qParam.trim();
      // Strip ?q= from URL so page refresh does not re-submit the same prompt.
      const cleanedUrl = new URL(window.location.href);
      cleanedUrl.searchParams.delete('q');
      window.history.replaceState({}, '', cleanedUrl.toString());
      // Defer submit so store hydration + initial bootstrap tasks can settle.
      // TODO(W-0102 Slice 4): wait on analysisData ready instead of fixed delay
      const qAutoSubmitTimer = window.setTimeout(() => {
        void sendCommand(qText);
      }, 500);
      bootstrapTimers = [...bootstrapTimers, qAutoSubmitTimer];
    }

    // $effect handles initial loadAnalysis + loadFlow — only set up intervals and one-shot fetches here
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      runIfVisible(() =>
        runTerminalVisibilityRefresh({
          loadFlow: () => { void loadFlow(gPair, symbolToTF(gTf)); },
          loadEvents: () => { void loadEvents(); },
          loadTerminalReadPath: () => { void loadTerminalReadPath(); },
        })
      );
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    loadTerminalReadPath();
    loadTerminalPersistenceState();
    loadEvents();
    for (const item of buildTerminalBootstrapTasks({
      loadTrending,
      loadNews,
      loadAlerts,
      loadPatternPhases,
      loadPatternCaptures,
      loadLiveSignals,
    })) {
      scheduleBootstrapTask(item.task, item.delayMs);
    }
    const refreshIntervals = buildTerminalRefreshIntervals({
      loadFlow: () => { void loadFlow(gPair, symbolToTF(gTf)); },
      loadTrending,
      loadTerminalReadPath,
      loadAlerts,
      loadEvents,
      loadPatternPhases,
    });
    const scheduledIntervals = refreshIntervals.map((item) =>
      setInterval(() => runIfVisible(item.task), item.everyMs)
    ) as Array<ReturnType<typeof setInterval>>;
    [flowInterval, trendingInterval, readPathInterval, alertsInterval, eventsInterval, patternInterval] = scheduledIntervals as [
      ReturnType<typeof setInterval>,
      ReturnType<typeof setInterval>,
      ReturnType<typeof setInterval>,
      ReturnType<typeof setInterval>,
      ReturnType<typeof setInterval>,
      ReturnType<typeof setInterval>,
    ];

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  onDestroy(() => {
    clearInterval(flowInterval);
    clearInterval(trendingInterval);
    clearInterval(readPathInterval);
    clearInterval(alertsInterval);
    clearInterval(eventsInterval);
    clearInterval(patternInterval);
    if (exportPollTimer) clearInterval(exportPollTimer);
    bootstrapTimers.forEach((timer) => clearTimeout(timer));
    bootstrapTimers = [];
  });

  let prevPair = '';
  let prevTf = '';
  $effect(() => {
    // Track ONLY pair + tf — price updates in activePairState must not re-trigger this
    const pair = gPair;
    const tf   = gTf;
    if (pair !== prevPair) {
      prevPair = pair;
      prevTf = tf;
      const symbol = pairToSymbol(pair);
      activeSymbol = symbol;
      activeAnalysisTab = 'summary';
      analysisData = null;  // clear stale snapshot so chat context resets
      activeReadPathKey = '';
      const alreadyLoaded = untrack(() => boardSymbols.includes(symbol));
      if (!alreadyLoaded) {
        boardSymbols = [];
        stubAssetMap = {};
        decisionMap = {};
        memoryQueryIdMap = {};
        memoryTopEvidenceMap = {};
        analysisDataMap = {};
        analysisFingerprintMap = {};
        chartPayloadMap = {};
        activeChartPayload = null;
      }
      loadAnalysis(symbol, symbolToTF(tf));
      loadActiveReadPath(symbol, symbolToTF(tf));
      loadFlow(pair, symbolToTF(tf));
      loadEvents();
    } else if (tf !== prevTf) {
      prevTf = tf;
      const symbol = pairToSymbol(pair);
      activeReadPathKey = '';
      memoryQueryIdMap = {};
      memoryTopEvidenceMap = {};
      activeAnalysisTab = 'summary';
      loadAnalysis(symbol, symbolToTF(tf));
      loadActiveReadPath(symbol, symbolToTF(tf));
      loadFlow(pair, symbolToTF(tf));
      loadEvents();
    }
  });

  let isLoadingActive = $derived(loadingSymbols.has(activeSymbol));
  let activePairDisplay = $derived(gPair.split('/')[0] ?? 'BTC');

  // ─── Panel visibility ────────────────────────────────────────
  function toggleLeftRail() {
    showLeftRail = !showLeftRail;
  }

  let boardAssets = $derived.by(() =>
    boardSymbols
      .map((symbol) => decisionMap[symbol]?.asset ?? stubAssetMap[symbol])
      .filter((asset): asset is TerminalAsset => Boolean(asset))
      .slice(0, 4)
  );
  let verdictMap = $derived.by(() => {
    const result: Record<string, TerminalVerdict> = {};
    for (const [symbol, decision] of Object.entries(decisionMap)) {
      result[symbol] = decision.verdict;
    }
    return result;
  });
  let evidenceMap = $derived.by(() => {
    const result: Record<string, TerminalEvidence[]> = {};
    for (const [symbol, decision] of Object.entries(decisionMap)) {
      result[symbol] = decision.evidence;
    }
    return result;
  });

  // Computed hero asset — computed HERE in parent scope so boardAssets
  // reactivity is tracked directly (bypasses WorkspaceGrid prop chain issue)
  let heroAsset = $derived(boardAssets.find(a => a.symbol === activeSymbol) ?? boardAssets[0] ?? null);
  let heroVerdict = $derived(heroAsset ? verdictMap[heroAsset.symbol] ?? null : null);

  let activeAsset = $derived(boardAssets.find(a => a.symbol === activeSymbol) ?? boardAssets[0] ?? null);
  let activeVerdict = $derived(activeSymbol ? verdictMap[activeSymbol] ?? null : null);
  let activeEvidence = $derived(activeSymbol ? evidenceMap[activeSymbol] ?? [] : []);
  let activeAnalysisData = $derived(activeSymbol ? analysisDataMap[activeSymbol] ?? analysisData : analysisData);
  let patternRecallMatches = $derived.by(() =>
    buildPatternRecallMatches(activeSymbol, symbolToTF(gTf), activeVerdict, patternCaptureRecords)
  );
  let isActivePinned = $derived.by(() => {
    if (!activeSymbol) return false;
    const timeframe = symbolToTF(gTf);
    return persistedPins.some((pin) =>
      pin.timeframe === timeframe && pin.symbol === activeSymbol && (pin.pinType === 'symbol' || pin.pinType === 'analysis')
    );
  });
  let hasActiveSavedAlert = $derived.by(() => {
    if (!activeSymbol) return false;
    return Boolean(findTerminalAlertRule(savedAlertRules, activeSymbol, symbolToTF(gTf)));
  });

  // ── Analysis rail mode ────────────────────────────────────────
  // SINGLE: ≤1 asset or active symbol has a verdict → show full detail rail
  // SCAN:   >1 assets returned (multi-asset prompt) → show compact scan list
  let isScanMode = $derived(boardAssets.length > 1);
  let scanAssets = $derived(
    boardAssets.map(a => ({
      asset: a,
      verdict: verdictMap[a.symbol] ?? null,
    }))
  );
  let assistantBannerText = $derived(streamText.trim());
  let recentDockHistory = $derived(chatHistory.slice(-4));
  let boardModel = $derived.by(() => buildTerminalBoardModel({
    activeAsset,
    activeAnalysisData,
    chartLevels,
    readPathDepth,
    readPathLiq,
  }));
  // ─── Mobile ModeRouter data ──────────────────────────────────

  /**
   * mobileMarketRows — top 30 items for ScanMode.
   * Source priority: persistedWatchlist first (has live preview prices),
   * then trendingData.trending to pad up to 30.
   * Deduplication by symbol (watchlist wins).
   */
  const mobileMarketRows = $derived.by(() => {
    type MobileMarketRow = {
      symbol: string;
      base: string;
      price: number;
      changePct: number;
      volume24h?: number;
      bias?: 'bullish' | 'bearish' | 'neutral';
    };
    const rows: MobileMarketRow[] = [];
    const seen = new Set<string>();

    // Watchlist items first — they carry persisted preview prices
    for (const item of (persistedWatchlist ?? [])) {
      if (seen.has(item.symbol)) continue;
      seen.add(item.symbol);
      rows.push({
        symbol: item.symbol,
        base: item.symbol.replace(/USDT$/, ''),
        price: item.preview?.price ?? 0,
        changePct: item.preview?.change24h ?? 0,
        bias: item.preview?.bias,
      });
    }

    // Pad with trending coins (trendingData.trending, then .gainers, then .losers)
    const trendingSources: any[] = [
      ...(trendingData?.trending ?? []),
      ...(trendingData?.gainers ?? []),
      ...(trendingData?.losers ?? []),
    ];
    for (const coin of trendingSources) {
      const sym: string = coin?.symbol ?? '';
      if (!sym || seen.has(sym)) continue;
      seen.add(sym);
      rows.push({
        symbol: sym,
        base: sym.replace(/USDT$/, ''),
        price: coin?.price ?? 0,
        changePct: coin?.change24h ?? coin?.percentChange24h ?? 0,
        volume24h: coin?.volume24h ?? undefined,
        // TODO: bias not available from trending feed — derive from changePct sign as approximation
        bias: (coin?.change24h ?? coin?.percentChange24h ?? 0) >= 0 ? 'bullish' : 'bearish',
      });
    }

    return rows.slice(0, 30);
  });

  /**
   * mobileAlerts — scannerAlerts mapped to ModeRouter Alert shape for JudgeMode.
   * scanner alerts do not carry a user judgment state, so status is always 'pending'.
   */
  const mobileAlerts = $derived.by(() => {
    type MobileAlert = {
      id: string;
      symbol: string;
      tf: string;
      direction: 'bullish' | 'bearish' | 'neutral';
      summary: string;
      timestamp: number;
      status: 'pending' | 'agreed' | 'disagreed';
      reason?: 'valid' | 'late' | 'noisy' | 'invalid' | 'almost';
    };
    return (scannerAlerts ?? []).map((alert: any): MobileAlert => {
      // TODO: direction is not a first-class field on engine_alerts rows;
      // derive from blocks_triggered heuristic: if any block name contains 'bull'
      // or 'long' treat as bullish; 'bear'/'short' as bearish; else neutral.
      const blocks: string[] = alert?.blocks_triggered ?? [];
      const blockStr = blocks.join(' ').toLowerCase();
      let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (blockStr.includes('bull') || blockStr.includes('long') || blockStr.includes('reclaim')) {
        direction = 'bullish';
      } else if (blockStr.includes('bear') || blockStr.includes('short') || blockStr.includes('dump')) {
        direction = 'bearish';
      }

      const summary =
        blocks.length > 0
          ? blocks.map((b: string) => b.replace(/_/g, ' ')).join(' · ')
          : 'Signal alert';

      return {
        id: alert?.id ?? '',
        symbol: alert?.symbol ?? '',
        tf: alert?.timeframe ?? '1H',
        direction,
        summary,
        timestamp: alert?.created_at ? new Date(alert.created_at).getTime() : Date.now(),
        status: 'pending',
      };
    });
  });

  /**
   * onAlertFeedback — optimistic state update only; no alert-feedback API exists yet.
   * TODO: POST to /api/cogochi/alert-feedback once the endpoint is built.
   */
  function handleMobileAlertFeedback(id: string, agree: boolean, reason?: string) {
    console.log('[mobile-judge] alert feedback', { id, agree, reason });
    // Optimistic: move the alert out of the scannerAlerts list so JudgeMode
    // shows it as resolved on next mobileAlerts derivation.
    // Since scannerAlerts are any[], we mark it via a local agreed-ids set.
    agreedAlertIds = new Set([...agreedAlertIds, id]);
  }

  /**
   * Track IDs the user has already judged so mobileAlerts can reflect resolved status.
   * Persisted only for the lifetime of this page session.
   */
  let agreedAlertIds = $state(new Set<string>());

  /**
   * mobileAlertsWithStatus — overlays local agree/disagree state onto mobileAlerts
   * so JudgeMode rows switch from 'pending' to resolved without a round-trip.
   */
  const mobileAlertsWithStatus = $derived.by(() =>
    mobileAlerts.map(alert =>
      agreedAlertIds.has(alert.id) ? { ...alert, status: 'agreed' as const } : alert
    )
  );

  /**
   * refreshWatchlistForMobile — called by ScanMode pull-to-refresh.
   * Reloads both the persisted watchlist (for preview prices) and the trending feed.
   */
  async function refreshWatchlistForMobile() {
    await Promise.all([loadTerminalPersistenceState(), loadTrending()]);
  }
</script>

<svelte:head>
  <title>Terminal — Cogochi</title>
  <meta
    name="description"
    content="Analyze live crypto structure, flow, and evidence in the Cogochi terminal before you save or act on a setup."
  />
  <link rel="canonical" href={buildCanonicalHref('/terminal')} />
</svelte:head>

<!-- ═══════════════════════════════════════════════════ -->
<!-- Terminal Shell (W-0086: TerminalShell wrapper)      -->
<!-- ═══════════════════════════════════════════════════ -->

<!-- Market drawer — overlay for tablet/mobile only; desktop uses persistent left rail -->
{#if !isDesktop}
  <MarketDrawer
    open={showLeftRail}
    onClose={toggleLeftRail}
    {trendingData}
    watchlistRows={persistedWatchlist}
    alerts={scannerAlerts}
    savedAlerts={savedAlertRules}
    {patternPhases}
    activeSymbol={activeSymbol || pairToSymbol(gPair)}
    macroItems={macroCalendarItems}
    {marketEvents}
    queryPresets={terminalQueryPresets}
    anomalies={terminalAnomalies}
    onQuery={handleQueryChip}
    onDeleteSavedAlert={handleDeleteSavedAlert}
  />
{/if}

<div class="surface-page terminal-page">
  <TerminalShell
    showRail={true}
    railWidth={330}
    verdict={activeVerdict ?? null}
    evidence={activeEvidence ?? []}
    captureId={lastSavedCaptureId ?? null}
    marketRows={mobileMarketRows}
    alerts={mobileAlertsWithStatus}
    marketLoading={loadingSymbols.size > 0}
    alertsLoading={patternCaptureLoading}
    onAlertFeedback={handleMobileAlertFeedback}
    onMarketRefresh={refreshWatchlistForMobile}
  >
  {#snippet slotLeftRail()}
    <TerminalLeftRail
      {trendingData}
      watchlistRows={persistedWatchlist}
      alerts={scannerAlerts}
      savedAlerts={savedAlertRules}
      {patternPhases}
      activeSymbol={activeSymbol || pairToSymbol(gPair)}
      macroItems={macroCalendarItems}
      {marketEvents}
      queryPresets={terminalQueryPresets}
      anomalies={terminalAnomalies}
      onQuery={handleQueryChip}
      onDeleteSavedAlert={handleDeleteSavedAlert}
    />
  {/snippet}

  {#snippet slotTopBar()}
    <section class="terminal-shell-head">
      <TerminalCommandBar
        assetsCount={boardAssets.length}
        marketRailOpen={showLeftRail}
        onToggleMarketRail={toggleLeftRail}
        tf={gTf}
        onTfChange={(t) => setActiveTimeframe(normalizeTimeframe(t))}
        price={activeAnalysisData?.price ?? activeAnalysisData?.snapshot?.last_close ?? null}
        change24h={activeAnalysisData?.change24h ?? activeAnalysisData?.snapshot?.change24h ?? null}
      />
    </section>
  {/snippet}

  {#snippet slotChart()}
    <!-- Chart pane + SaveStrip below (W-0086 layer architecture) -->
    <div class="chart-and-strip" bind:this={chartWorkspaceEl}>
      <ChartBoard
        symbol={activeSymbol || pairToSymbol(gPair) || 'BTCUSDT'}
        tf={symbolToTF(gTf)}
        verdictLevels={chartLevels}
        initialData={activeChartPayload}
        depthSnapshot={readPathDepth}
        liqSnapshot={readPathLiq}
        quantRegime={boardModel.quantRegime}
        cvdDivergence={boardModel.cvdDivergence}
        change24hPct={activeAnalysisData?.change24h ?? activeAnalysisData?.snapshot?.change24h ?? null}
        contextMode="chart"
        onCaptureSaved={handleCaptureSaved}
        onTfChange={(t) => setActiveTimeframe(normalizeTimeframe(t))}
      />
      <!-- SaveStrip appears below chart when range anchors are set (W-0086) -->
      <SaveStrip
        symbol={activeSymbol || pairToSymbol(gPair) || 'BTCUSDT'}
        tf={symbolToTF(gTf)}
        ohlcvBars={ohlcvBars}
        onSaved={handleCaptureSaved}
      />
      {#if showLabCta}
        <div class="lab-cta-banner">
          <span class="lab-cta-check">✓</span>
          <span class="lab-cta-text">Setup saved</span>
          <div class="lab-cta-actions">
            <a class="lab-cta-link lab-cta-link--dash" href="/dashboard">Dashboard →</a>
            <a class="lab-cta-link" href={labCtaSlug ? `/lab?slug=${labCtaSlug}` : '/lab'}>Lab →</a>
          </div>
          <button class="lab-cta-close" onclick={() => showLabCta = false} aria-label="Dismiss">×</button>
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet slotRail()}
    <!-- Analysis rail (W-0078: right rail owner) -->
    <div class="analysis-rail">
      <!-- Rail header: mode indicator + streaming badge -->
      <div class="rail-header">
        {#if isStreaming}
          <span class="rail-badge streaming">
            <span class="stream-dot pulsing">●</span>
            Analyzing…
          </span>
        {:else if isScanMode}
          <span class="rail-badge scan">{boardAssets.length} RESULTS</span>
          <button class="rail-back" onclick={clearBoard}>← Back</button>
        {:else}
          <span class="rail-mode">Analysis</span>
          <span class="rail-sym">{activeSymbol ? activeSymbol.replace('USDT','') : activePairDisplay}</span>
        {/if}
      </div>
      <!-- W-0092: Live signal overlay — shown when ACCUMULATION/REAL_DUMP signals exist -->
      {#if liveSignals.length > 0}
        <LiveSignalPanel
          signals={liveSignals}
          cached={liveSignalsCached}
          scannedAt={liveSignalsScannedAt}
        />
      {/if}
      <!-- MODE B — Scan results list -->
      {#if isScanMode}
        <div class="scan-list">
          {#each scanAssets as { asset, verdict } (asset.symbol)}
            {@const sym = asset.symbol.replace('USDT','')}
            {@const dir = verdict?.direction ?? asset.bias}
            {@const active = asset.symbol === activeSymbol}
            <button
              class="scan-card"
              class:active
              class:bullish={dir === 'bullish'}
              class:bearish={dir === 'bearish'}
              onclick={() => selectAsset(asset.symbol)}
            >
              <div class="sc-left">
                <span class="sc-sym">{sym}</span>
                <span class="sc-venue">USDT·PERP</span>
              </div>
              <div class="sc-right">
                <span class="sc-dir">{dir?.toUpperCase() ?? '—'}</span>
                {#if verdict?.reason}
                  <span class="sc-reason">{verdict.reason.slice(0, 48)}{verdict.reason.length > 48 ? '…' : ''}</span>
                {:else if verdictMap[asset.symbol] === undefined && loadingSymbols.has(asset.symbol)}
                  <span class="sc-loading">analyzing…</span>
                {/if}
              </div>
            </button>
          {/each}
        </div>

        <!-- Also show active symbol's detail rail below the scan list if loaded -->
        {#if heroAsset && heroVerdict}
          <div class="scan-detail">
            <TerminalContextPanel
              analysisData={activeAnalysisData}
              newsData={newsData}
              activeTab={activeAnalysisTab}
              onTabChange={handleAnalysisTabChange}
              onAction={sendCommand}
              onPinToggle={handlePinToggle}
              onAlertToggle={handleAlertToggle}
              onRetry={handleRetryAnalysis}
              isPinned={isActivePinned}
              hasSavedAlert={hasActiveSavedAlert}
              bars={ohlcvBars}
              {layerBarsMap}
              {patternRecallMatches}
            />
          </div>
        {/if}

      <!-- MODE A — Single asset compact verdict -->
      {:else if isLoadingActive && !heroVerdict}
        <div class="board-loading">
          <div class="loading-ring"></div>
          <p class="loading-msg">Analyzing {activePairDisplay}…</p>
        </div>
      {:else if heroAsset && heroVerdict}
        <TerminalContextPanel
          analysisData={activeAnalysisData}
          newsData={newsData}
          activeTab={activeAnalysisTab}
          onTabChange={handleAnalysisTabChange}
          onAction={sendCommand}
          onPinToggle={handlePinToggle}
          onAlertToggle={handleAlertToggle}
          onRetry={handleRetryAnalysis}
          isPinned={isActivePinned}
          hasSavedAlert={hasActiveSavedAlert}
          bars={ohlcvBars}
          {layerBarsMap}
          {patternRecallMatches}
        />
      {:else}
        <div class="board-empty">
          <p class="empty-icon">◈</p>
          <p class="empty-text">No analysis loaded</p>
          <button class="empty-retry-btn" onclick={handleRetryAnalysis}>
            Analyze {activePairDisplay} →
          </button>
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet slotFooter()}
    <!-- Desktop/tablet bottom dock (W-0078: footer owns prompt) -->
    <TerminalBottomDock
      loading={isStreaming || isLoadingActive}
      assistantText={assistantBannerText}
      history={recentDockHistory}
      onSend={sendCommand}
      onDockAction={handleDockAction}
    />
  {/snippet}
  </TerminalShell>
</div>


<PatternLibraryPanel
  open={showPatternLibrary}
  records={patternCaptureRecords}
  loading={patternCaptureLoading}
  onClose={() => showPatternLibrary = false}
  onSelect={handlePatternLibrarySelect}
/>

<style>
  /* W-0086: chart-and-strip fills all available vertical space in its slot */
  .chart-and-strip {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .terminal-page {
    width: min(100%, calc(100% - 8px));
    height: calc(100dvh - 8px);
    /* W-0086: replaced grid with flex-column; TerminalShell manages internal layout */
    display: flex;
    flex-direction: column;
    padding-top: 2px;
    padding-bottom: max(4px, var(--sc-consent-reserved-h, 0px));
    overflow: hidden;
  }

  .terminal-shell-head {
    /* Transparent passthrough — cmd-bar owns all its own styling */
    display: flex;
    align-items: stretch;
    position: sticky;
    top: 0;
    z-index: 25;
  }

  /* ── Lab CTA banner ── */
  .lab-cta-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: rgba(99, 179, 237, 0.08);
    border-top: 1px solid rgba(99, 179, 237, 0.20);
    flex-shrink: 0;
    font-family: var(--sc-font-mono);
    font-size: 12px;
  }
  .lab-cta-check { color: var(--sc-good, #adca7c); font-size: 14px; }
  .lab-cta-text { color: rgba(247, 242, 234, 0.78); font-weight: 600; }
  .lab-cta-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: 2px;
  }
  .lab-cta-link {
    color: rgba(99, 179, 237, 0.92);
    text-decoration: none;
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 2px 8px;
    border: 1px solid rgba(99, 179, 237, 0.28);
    border-radius: 3px;
    background: rgba(99, 179, 237, 0.08);
    transition: all 0.1s;
  }
  .lab-cta-link:hover {
    background: rgba(99, 179, 237, 0.16);
    border-color: rgba(99, 179, 237, 0.45);
    color: rgba(99, 179, 237, 1);
  }
  .lab-cta-link--dash {
    color: rgba(173, 202, 124, 0.88);
    border-color: rgba(173, 202, 124, 0.24);
    background: rgba(173, 202, 124, 0.07);
  }
  .lab-cta-link--dash:hover {
    background: rgba(173, 202, 124, 0.14);
    border-color: rgba(173, 202, 124, 0.40);
    color: rgba(173, 202, 124, 1);
  }
  .lab-cta-close {
    margin-left: auto;
    background: transparent;
    border: none;
    color: rgba(247, 242, 234, 0.36);
    font-size: 18px;
    cursor: pointer;
    line-height: 1;
    padding: 0 2px;
    transition: color 0.1s;
  }
  .lab-cta-close:hover { color: rgba(247, 242, 234, 0.72); }

  /* Analysis rail — always visible right panel, scrollable */
  .analysis-rail {
    width: auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--sc-terminal-bg, #000);
    position: relative;
    scrollbar-gutter: stable;
    border-left: 1px solid rgba(255,255,255,0.06);
  }

  /* Rail header */
  .rail-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
    flex-shrink: 0;
    min-height: 44px;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0)),
      rgba(255,255,255,0.015);
  }
  .rail-mode {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.40);
    text-transform: uppercase;
  }
  .rail-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: rgba(255,255,255,0.88);
    margin-left: auto;
    letter-spacing: 0.06em;
  }
  .rail-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    letter-spacing: 0.08em;
    padding: 2px 7px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .rail-badge.streaming {
    background: rgba(74,222,128,0.09);
    color: #4ade80;
    border: 1px solid rgba(74,222,128,0.24);
  }
  .rail-badge.scan {
    background: rgba(99,179,237,0.09);
    color: #63b3ed;
    border: 1px solid rgba(99,179,237,0.24);
  }
  .rail-back {
    margin-left: auto;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.48);
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    transition: all 0.1s;
  }
  .rail-back:hover { color: rgba(255,255,255,0.82); border-color: rgba(255,255,255,0.28); }

  /* Scan list (Mode B) */
  .scan-list {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    border-bottom: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
  }
  .scan-card {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border: none;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
    width: 100%;
  }
  .scan-card:hover  { background: rgba(255,255,255,0.05); }
  .scan-card.active { background: rgba(255,255,255,0.07); }
  .scan-card.bullish .sc-dir { color: #4ade80; }
  .scan-card.bearish .sc-dir { color: #f87171; }
  .sc-left { display: flex; flex-direction: column; gap: 3px; min-width: 56px; }
  .sc-sym  { font-family: var(--sc-font-mono, monospace); font-size: 12px; font-weight: 700; color: #fff; }
  .sc-venue{ font-size: 9px; color: rgba(255,255,255,0.30); font-family: var(--sc-font-mono, monospace); }
  .sc-right{ display: flex; flex-direction: column; gap: 3px; flex: 1; align-items: flex-end; }
  .sc-dir  { font-family: var(--sc-font-mono, monospace); font-size: 9px; font-weight: 700; letter-spacing: 0.08em; color: rgba(255,255,255,0.48); }
  .sc-reason { font-size: 10px; color: rgba(255,255,255,0.42); text-align: right; line-height: 1.25; }
  .sc-loading{ font-size: 9px; color: rgba(255,255,255,0.25); font-family: var(--sc-font-mono, monospace); animation: sc-pulse 1.4s ease-in-out infinite; }

  /* Scan detail */
  .scan-detail {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* Empty state */
  .board-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    opacity: 0.70;
  }
  .empty-icon {
    font-size: 32px;
    color: var(--sc-text-3);
    margin: 0;
  }
  .empty-text {
    font-family: var(--sc-font-mono);
    font-size: 13px;
    color: var(--sc-text-2);
    margin: 0;
  }
  .empty-retry-btn {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(247, 242, 234, 0.85);
    background: rgba(77, 143, 245, 0.09);
    border: 1px solid rgba(99, 179, 237, 0.26);
    border-radius: 4px;
    padding: 6px 14px;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
    margin-top: 4px;
    opacity: 1;
  }
  .empty-retry-btn:hover {
    background: rgba(77, 143, 245, 0.18);
    border-color: rgba(99, 179, 237, 0.44);
    color: rgba(247, 242, 234, 1);
  }

  /* Loading */
  .board-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    opacity: 0.65;
  }
  .loading-ring {
    width: 36px; height: 36px;
    border: 2px solid rgba(255,255,255,0.09);
    border-top-color: var(--sc-text-2);
    border-radius: 50%;
    animation: sc-spin 0.9s linear infinite;
  }
  .loading-msg {
    font-family: var(--sc-font-mono);
    font-size: 13px; color: var(--sc-text-2); margin: 0;
  }

  @media (max-width: 540px) {
    .terminal-page {
      width: min(100%, calc(100% - 12px));
    }
  }
</style>
