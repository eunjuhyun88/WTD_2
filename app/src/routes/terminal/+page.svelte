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
   *   [TerminalCommandBar]
   *   [ChartBoard]
   *   [MobileCommandDock]
   *   [MobileShell via TerminalShell]
   */
  import { onMount, onDestroy, untrack } from 'svelte';
  import { activePairState, setActivePair, setActiveTimeframe } from '$lib/stores/activePairStore';
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
    type PatternTransitionAlert,
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

  // Mobile components
  import MobileCommandDock from '../../components/terminal/mobile/MobileCommandDock.svelte';

  import type { TerminalAsset, TerminalVerdict, TerminalEvidence } from '$lib/types/terminal';

  // ─── State ──────────────────────────────────────────────────

  let layout = $state<'hero3' | 'compare2x2' | 'focus'>('focus');
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
  let patternTransitionAlerts = $state<PatternTransitionAlert[]>([]);
  let liveSignals = $state<LiveSignal[]>([]);
  let liveSignalsCached = $state(false);
  let liveSignalsScannedAt = $state('');
  let showPatternLibrary = $state(false);
  let patternCaptureRecords = $state<Awaited<ReturnType<typeof fetchPatternCaptures>>>([]);
  let lastSavedCaptureId = $state<string | null>(null);
  let patternCaptureLoading = $state(false);
  let exportPollTimer: ReturnType<typeof setInterval> | null = null;

  // ── Capture modal ──────────────────────────────────────────
  let showLeftRail = $state(false);
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
        layout = 'compare2x2';
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

  function dismissPatternAlert(id: string) {
    patternTransitionAlerts = patternTransitionAlerts.filter((item) => item.id !== id);
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
        if (!hadAsset && boardSymbols.length > 1) layout = 'hero3';
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
    activeSymbol = ''; layout = 'focus';
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

  function handleCaptureSaved(captureId: string) {
    lastSavedCaptureId = captureId;
    setTimeout(() => {
      if (lastSavedCaptureId === captureId) lastSavedCaptureId = null;
    }, 5000);
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
        layout = 'focus';
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

  // ─── Panel visibility + resize ───────────────────────────────
  let leftWidth = $state(232);

  function toggleLeftRail() {
    showLeftRail = !showLeftRail;
  }

  function startResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      leftWidth = Math.max(132, Math.min(320, startW + delta));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ─── Mobile ─────────────────────────────────────────────────
  let showDetailSheet = $state(false);

  function openMobileDetail(tab: typeof activeAnalysisTab = 'summary') {
    activeAnalysisTab = tab;
    showDetailSheet = true;
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
  // Quick chips for mobile dock
  const MOBILE_CHIPS = $derived([
    { id: 'top-oi',    label: 'Top OI',         action: 'Show assets with highest OI expansion right now' },
    { id: 'alts',      label: 'Hot Alts',        action: 'Show hot altcoins with breakout signals' },
    { id: 'long-bias', label: 'LONG setups',     action: 'Show best long setups with high confluence' },
    { id: 'risk',      label: 'Risk check',      action: `What are the main risks for ${gPair.split('/')[0]}?` },
    { id: 'compare',   label: 'BTC vs ETH',      action: 'Compare BTC and ETH side by side' },
  ]);

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

<!-- Market drawer (W-0086: opens from top-bar market button; left drawer not permanent column) -->
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
  {#snippet slotTopBar()}
    <section class="terminal-shell-head">
      <TerminalCommandBar
        assetsCount={boardAssets.length}
        marketRailOpen={showLeftRail}
        onToggleMarketRail={toggleLeftRail}
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
          isPinned={isActivePinned}
          hasSavedAlert={hasActiveSavedAlert}
          bars={ohlcvBars}
          {layerBarsMap}
          {patternRecallMatches}
        />
      {:else}
        <div class="board-empty">
          <p class="empty-icon">◈</p>
          <p class="empty-text">아래에서 {activePairDisplay} 분석 시작</p>
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet slotFooter()}
    <!-- Desktop bottom dock (W-0078: footer owns prompt) -->
    <div class="desktop-dock">
      <TerminalBottomDock
        loading={isStreaming || isLoadingActive}
        assistantText={assistantBannerText}
        history={recentDockHistory}
        onSend={sendCommand}
        onDockAction={handleDockAction}
      />
    </div>
    <!-- Mobile board + dock -->
    <div class="mobile-board-wrap">
      <MobileCommandDock
        loading={isStreaming}
        queryChips={MOBILE_CHIPS}
        assistantText={assistantBannerText}
        onOpenDetail={() => openMobileDetail('summary')}
        onSend={sendCommand}
        onChip={(action) => sendCommand(action)}
      />
    </div>
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
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 8px 10px 6px;
    background:
      linear-gradient(180deg, rgba(9, 12, 17, 0.96), rgba(9, 12, 17, 0.88));
    position: sticky;
    top: 0;
    z-index: 25;
    border-radius: 8px 8px 0 0;
    backdrop-filter: blur(18px);
    border: 1px solid rgba(255,255,255,0.04);
    border-bottom-color: rgba(255,255,255,0.02);
  }

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
    border-left: 1px solid rgba(255,255,255,0.05);
  }

  /* Rail header */
  .rail-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
    flex-shrink: 0;
    min-height: 40px;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0)),
      rgba(255,255,255,0.015);
  }
  .rail-mode {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.34);
    text-transform: uppercase;
  }
  .rail-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: rgba(255,255,255,0.82);
    margin-left: auto;
    letter-spacing: 0.08em;
  }
  .rail-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    letter-spacing: 0.08em;
    padding: 1px 5px;
    border-radius: 2px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .rail-badge.streaming {
    background: rgba(74,222,128,0.08);
    color: #4ade80;
    border: 1px solid rgba(74,222,128,0.2);
  }
  .rail-badge.scan {
    background: rgba(99,179,237,0.08);
    color: #63b3ed;
    border: 1px solid rgba(99,179,237,0.2);
  }
  .rail-back {
    margin-left: auto;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.4);
    border-radius: 3px;
    padding: 1px 5px;
    cursor: pointer;
    transition: all 0.1s;
  }
  .rail-back:hover { color: rgba(255,255,255,0.7); border-color: rgba(255,255,255,0.25); }

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
    gap: 6px;
    padding: 5px 6px;
    border: none;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
    width: 100%;
  }
  .scan-card:hover  { background: rgba(255,255,255,0.04); }
  .scan-card.active { background: rgba(255,255,255,0.06); }
  .scan-card.bullish .sc-dir { color: #4ade80; }
  .scan-card.bearish .sc-dir { color: #f87171; }
  .sc-left { display: flex; flex-direction: column; gap: 2px; min-width: 52px; }
  .sc-sym  { font-family: var(--sc-font-mono, monospace); font-size: 10px; font-weight: 700; color: #fff; }
  .sc-venue{ font-size: 8px; color: rgba(255,255,255,0.25); font-family: var(--sc-font-mono, monospace); }
  .sc-right{ display: flex; flex-direction: column; gap: 3px; flex: 1; align-items: flex-end; }
  .sc-dir  { font-family: var(--sc-font-mono, monospace); font-size: 8px; font-weight: 700; letter-spacing: 0.08em; color: rgba(255,255,255,0.4); }
  .sc-reason { font-size: 9px; color: rgba(255,255,255,0.35); text-align: right; line-height: 1.22; }
  .sc-loading{ font-size: 8px; color: rgba(255,255,255,0.2); font-family: var(--sc-font-mono, monospace); animation: sc-pulse 1.4s ease-in-out infinite; }

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
    gap: 10px;
    opacity: 0.5;
  }
  .empty-icon {
    font-size: 28px;
    color: var(--sc-text-3);
    margin: 0;
  }
  .empty-text {
    font-family: var(--sc-font-mono);
    font-size: 13px;
    color: var(--sc-text-2);
    margin: 0;
  }

  /* Loading */
  .board-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    opacity: 0.6;
  }
  .loading-ring {
    width: 32px; height: 32px;
    border: 2px solid rgba(255,255,255,0.08);
    border-top-color: var(--sc-text-2);
    border-radius: 50%;
    animation: sc-spin 0.9s linear infinite;
  }
  .loading-msg {
    font-family: var(--sc-font-mono);
    font-size: 12px; color: var(--sc-text-2); margin: 0;
  }

  .desktop-dock {
    flex-shrink: 0;
  }

  /* Mobile */
  @media (max-width: 768px) {
    .terminal-page {
      width: min(100%, calc(100% - 16px));
      height: auto;
      min-height: calc(100dvh - 12px);
      padding-bottom: max(10px, var(--sc-consent-reserved-h, 0px));
      overflow: visible;
    }
    .terminal-shell-head {
      padding: 8px 10px 6px;
      position: sticky;
      top: 0;
      z-index: 40;
    }
    .analysis-rail { display: none; }
    .desktop-dock  { display: none; }
    .mobile-board-wrap {
      display: block;
      position: sticky;
      bottom: var(--sc-consent-reserved-h, 0px);
      z-index: 30;
      margin-top: auto;
      padding-top: 8px;
      background: linear-gradient(180deg, rgba(6,8,13,0), rgba(6,8,13,0.92) 24%, rgba(6,8,13,0.98));
    }
  }

  /* Hide mobile wrap on desktop */
  @media (min-width: 769px) {
    .mobile-board-wrap { display: none; }
  }

  @media (max-width: 540px) {
    .terminal-page {
      width: min(100%, calc(100% - 12px));
    }
  }
</style>
