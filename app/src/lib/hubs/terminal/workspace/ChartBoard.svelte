<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { createChart, CandlestickSeries, LineSeries, HistogramSeries, BarSeries, AreaSeries, createSeriesMarkers, PriceScaleMode } from 'lightweight-charts';
  import type { UTCTimestamp, IChartApi, ISeriesApi, SeriesType, SeriesMarker } from 'lightweight-charts';
  import {
    chartIndicators,
    toggleIndicator as toggleChartIndicator,
    removeIndicator as removeChartIndicator,
    type IndicatorKey,
  } from '$lib/stores/chartIndicators';
  import type { DepthLadderEnvelope, LiquidationClustersEnvelope } from '$lib/contracts/terminalBackend';
  import {
    computeDepthRatio,
    computeContextSummaryItems,
    computeMetricStripItems,
    type MetricItem,
    type QuantRegimeSummary,
    type CvdDivergenceSummary,
  } from '$lib/chart/chartMetrics';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import type { ChartViewportSnapshot } from '$lib/contracts/terminalPersistence';
  import { tfMinutes } from '$lib/chart/mtfAlign';
  import { chartTimeToUnixSeconds, slicePayloadToViewport } from '$lib/terminal/chartViewportCapture';
  import SaveSetupModal from './SaveSetupModal.svelte';
  import SaveStrip from './SaveStrip.svelte';
  import ResearchPanel from './ResearchPanel.svelte';
  import ChartToolbar from './ChartToolbar.svelte';
  import ChartBoardHeader from './ChartBoardHeader.svelte';
  // ── Layer 1 range primitive (W-0086) ────────────────────────────────────────
  import { chartSaveMode } from '$lib/stores/chartSaveMode';
  import { terminalState } from '$lib/stores/terminalState';
  import { RangePrimitive } from '../../../shared/chart/primitives/RangePrimitive';
  import { GammaPinPrimitive, type GammaPinData } from '../../../shared/chart/primitives/GammaPinPrimitive';
  // ── Layer 2 overlay (W-0086) ────────────────────────────────────────────────
  import PhaseBadge from '../../../shared/chart/overlays/PhaseBadge.svelte';
  // ── Layer 3: Capture annotations (W-0120) ───────────────────────────────────
  import CaptureAnnotationLayer from '../../../shared/chart/CaptureAnnotationLayer.svelte';
  import CaptureReviewDrawer    from '../../../shared/chart/CaptureReviewDrawer.svelte';
  import type { CaptureAnnotation } from '../../../shared/chart/primitives/CaptureMarkerPrimitive';
  import type { Time } from 'lightweight-charts';
  import { DataFeed } from '$lib/chart/DataFeed';
  import { useChartDataFeed } from '$lib/chart/useChartDataFeed.svelte';
  import { createLiveTickState } from '$lib/chart/liveTickState.svelte';
  // ── W-0289: Drawing Tools ────────────────────────────────────────────────────
  import DrawingCanvas from './DrawingCanvas.svelte';
  import DrawingToolbar from './DrawingToolbar.svelte';
  import { DrawingManager, type DrawingToolType } from '$lib/chart/DrawingManager';
  import { PriceLineManager } from '$lib/chart/usePriceLines';
  // ── Multi-pane indicator layer (W-0211 follow-up) ──────────────────────────
  import { computePaneChips, computeLiqChips } from '$lib/chart/paneCurrentValues';
  // ── W-0395: modular indicator layout ───────────────────────────────────────
  import {
    mountIndicatorPanes as mountIndicatorPanesModule,
    mountSecondaryIndicator,
    isOverlayIndicator,
    refreshLiqPane,
    type IndicatorSeriesRefs,
    type SecondaryIndicatorPayload,
  } from '$lib/chart/mountIndicatorPanes';
  import { indicatorInstances } from '$lib/chart/indicatorInstances';
  import {
    calcRSI,
    calcMACD,
    calcEMAValues,
    calcBB,
    calcVWAP,
    calcATRBands,
  } from './chartIndicatorCalc';
  import { createCrosshairSync, type CrosshairChips, type CrosshairUnsubscribe } from '$lib/chart/paneCrosshairSync';
  import { createPaneLayoutStore, type PaneKind } from '$lib/chart/paneLayoutStore';
  import PaneInfoBar from './PaneInfoBar.svelte';
  import KpiStrip from './KpiStrip.svelte';
  import type { KpiInputBundle } from '$lib/chart/kpiStrip';
  import { AlphaOverlayLayer } from '../../../shared/chart/AlphaOverlayLayer';
  import type { PanelAnalyzeData } from '$lib/terminal/panelAdapter';
  import { comparisonStore } from '$lib/stores/comparisonStore';
  import { whaleStore } from '$lib/stores/whaleStore';
  import { chartAIOverlay, clearAIOverlay } from '$lib/stores/chartAIOverlay';
  import type { AIRangeBox, AIAnnotation } from '$lib/stores/chartAIOverlay';
  import { setChartFreshness } from '$lib/stores/chartFreshness';
  // ── W-0358: Chart Notes Overlay ───────────────────────────────────────────
  import { chartNotesStore } from '$lib/stores/chartNotesStore.svelte';
  import FloatingNoteButton from '../../../shared/chart/FloatingNoteButton.svelte';
  import { shellStore, activeDrawingMode } from '$lib/hubs/terminal/shell.store';
  import IndicatorLibrary from './IndicatorLibrary.svelte';
  import IndicatorCatalogModal from '$lib/components/indicators/IndicatorCatalogModal.svelte';
  import type { IndicatorDef } from '$lib/indicators/indicatorRegistry';

  // ── Props ──────────────────────────────────────────────────────────────────
  interface VerdictLevels {
    entry?:  number;
    target?: number;
    stop?:   number;
  }

  interface Props {
    symbol:         string;
    tf?:            string;       // controlled externally (gTf); falls back to internal state
    verdictLevels?: VerdictLevels;
    initialData?: ChartSeriesPayload | null;
    depthSnapshot?: DepthLadderEnvelope['data'] | null;
    liqSnapshot?: LiquidationClustersEnvelope['data'] | null;
    quantRegime?: {
      bucket: 'risk_on_leverage' | 'short_squeeze' | 'deleveraging' | 'neutral';
      label: string;
      hint?: string;
      tone: 'bull' | 'bear' | 'neutral' | 'warn';
      oiDeltaPct: number | null;
      fundingPct: number | null;
    };
    cvdDivergence?: {
      state: 'bullish_divergence' | 'bearish_divergence' | 'aligned' | 'unknown';
      score: number;
      label: string;
      hint?: string;
    };
    /** Rolling 24h change from analysis snapshot (exchange-style); distinct from 1-bar change from candles */
    change24hPct?: number | null;
    onSaveSetup?:   (snap: { symbol: string; timestamp: number; tf: string }) => void;
    onCaptureSaved?: (captureId: string) => void;
    onTfChange?:    (tf: string) => void;
    /** full = slim book/liq/quant rails; chart = candle + indicator panes only (context in right rail / Flow tab). */
    contextMode?: 'full' | 'chart';
    /** default = classic terminal pane set; velo = TradingView/Velo-style stacked market panes. */
    surfaceStyle?: 'default' | 'velo';
    /** Alpha phase markers — rendered as chart markers on the candle series. */
    alphaMarkers?: Array<{
      timestamp: number;  // unix seconds
      phase: string;
      label: string;
      color?: string;
    }>;
    /** Fired when a candle closes (WS k.x=true). Parent can refresh analyze/verdict state. */
    onCandleClose?: (bar: { time: number; open: number; high: number; low: number; close: number; volume: number }) => void;
    /**
     * Full analysis response — drives AlphaOverlayLayer (W-0210 Layer 1):
     * ATR TP/Stop price lines, phase markers, breakout arrows.
     */
    analysisData?: PanelAnalyzeData | null;
    /** Gamma pin overlay — pass from parent when options-snapshot data is live. null hides line. */
    gammaPin?: GammaPinData | null;
    /**
     * Tablet routing: when provided, capture annotation clicks call this instead of
     * opening the internal fixed drawer. CenterPanel uses this to show in PeekDrawer.
     */
    onCaptureSelect?: (ann: CaptureAnnotation) => void;
  }

  let {
    symbol,
    tf: externalTf,
    verdictLevels,
    initialData = null,
    depthSnapshot = null,
    liqSnapshot = null,
    quantRegime = undefined,
    cvdDivergence = undefined,
    change24hPct = null,
    onSaveSetup,
    onCaptureSaved,
    onTfChange,
    contextMode = 'full',
    surfaceStyle = 'default',
    alphaMarkers = undefined,
    onCandleClose,
    gammaPin = null,
    onCaptureSelect = undefined,
    analysisData = null,
  }: Props = $props();

  // ── Internal TF state — syncs with externalTf if provided ─────────────────
  // Start with '1h'; externalTf takes precedence via $derived when set by parent
  let internalTf = $state('1h');
  let tf = $derived(externalTf ?? internalTf);

  // ── DOM refs ───────────────────────────────────────────────────────────────
  let containerEl  = $state<HTMLDivElement | undefined>(undefined);
  /** Wraps candle + sub-panes; drives flex height for TradingView-style fill. */
  let chartStackEl = $state<HTMLDivElement | undefined>(undefined);
  /**
   * Single chart container — native multi-pane (lightweight-charts v5.1).
   * Indicators (vol/rsi/macd/oi/cvd/liq) live in panes 1..N inside this same
   * IChartApi, so they share crosshair + time axis natively.
   */
  let mainEl       = $state<HTMLDivElement | undefined>(undefined);

  // ── W-0289: Drawing tools ──────────────────────────────────────────────────
  let drawingActiveTool     = $state<DrawingToolType>('cursor');
  let drawingToolsVisible   = $state(false);
  let drawingMgr = $state<DrawingManager | null>(null);

  const onToggleDrawingTools = () => { drawingToolsVisible = !drawingToolsVisible; shellStore.setDrawingTool(drawingToolsVisible ? 'trendLine' : 'cursor'); };

  let indicatorLibraryOpen = $state(false);
  let catalogModalOpen = $state(false);

  // ── W-0358: Chart Notes ───────────────────────────────────────────────────
  $effect(() => { chartNotesStore.loadNotes(symbol, tf); });

  function getLastClosedBarTime(): number {
    const ks = chartData?.klines;
    if (!ks || ks.length < 2) return Math.floor(Date.now() / 1000);
    // slice(-2,-1) avoids the forming (last) bar
    return (ks[ks.length - 2] as { time: number }).time;
  }

  // ── Live tick scalars (price / time / changePct / oiDelta) ───────────────
  // Owned by liveTickState; callbacks (DataFeed.onBar, renderCharts, crosshair)
  // call liveTick.update() — coupling stays here, ownership does not.
  const liveTick = createLiveTickState();
  let captureWindowLabel = $state('Visible range capture unavailable');
  let captureBarCount = $state<number | null>(null);
  let depthData = $state<DepthLadderEnvelope['data'] | null>(null);
  let liqData = $state<LiquidationClustersEnvelope['data'] | null>(null);
  let depthRatio = $derived(computeDepthRatio(depthData, liveTick.oiDelta));
  let bidPct = $derived(Math.round((depthRatio / (1 + depthRatio)) * 100));
  let askPct = $derived(100 - bidPct);
  let liqAnchor = $derived(liqData?.currentPrice ?? liveTick.price ?? verdictLevels?.entry ?? 0);
  let liqLong = $derived(liqData?.nearestLong?.price ?? (liqAnchor ? liqAnchor * 0.985 : 0));
  let liqShort = $derived(liqData?.nearestShort?.price ?? (liqAnchor ? liqAnchor * 1.012 : 0));
  let contextSummaryItems = $derived.by<MetricItem[]>(() =>
    computeContextSummaryItems(depthData, bidPct, askPct, liqLong, liqShort, quantRegime as QuantRegimeSummary | undefined)
  );
  let metricStripItems = $derived.by<MetricItem[]>(() =>
    computeMetricStripItems(quantRegime as QuantRegimeSummary | undefined, cvdDivergence as CvdDivergenceSummary | undefined, bidPct, askPct, depthData)
  );

  // Save Setup modal (mobile legacy)
  let showSaveModal = $state(false);
  let savedCaptureId = $state<string | null>(null);   // shown as toast after save

  // ResearchPanel — opens automatically when range is fully selected
  let showResearchPanel = $state(false);
  let researchViewport = $state<ChartViewportSnapshot | null>(null);

  // Indicator toggles — backed by the shared chartIndicators store so that
  // the SSE `chart_action` handler, the studies popover, and pane × buttons
  // all mutate one source of truth (W-0102 Slice 3).
  let showVWAP = $derived($chartIndicators.vwap);
  let showBB   = $derived($chartIndicators.bb);
  let showEMA  = $derived($chartIndicators.ema);
  let showATRBands = $derived($chartIndicators.atr_bands);
  let showCVD = $derived($chartIndicators.cvd);
  let showMACD = $derived($chartIndicators.macd);   // replaces RSI pane when active
  let showRSI = $derived($chartIndicators.rsi);
  let showOI = $derived($chartIndicators.oi);
  let showFundingPane = $derived($chartIndicators.funding);
  let showLiqPane = $derived($chartIndicators.liq);
  let showVolume = $derived($chartIndicators.volume);
  // derivativesOverlay = opt-in overlay on main chart; false = sub-pane (default/standard)
  let derivativesOnMain = $derived($chartIndicators.derivativesOverlay);
  // W-0210 Layer 3: comparison overlay (BTC or benchmark symbol)
  let showComparison = $derived($chartIndicators.comparison);
  let isVeloSurface = $derived(surfaceStyle === 'velo');

  let chartMode = $state<'candle' | 'line' | 'bar' | 'area' | 'heikin'>('candle');
  let priceScaleMode = $state<'normal' | 'log' | 'percent'>('normal');
  /** Collapsible book / liq / quant strip (TradingView-style: chart first). */
  let contextStripOpen = $state(false);

  let studyQuery = $state('');

  let activeIndicatorCount = $derived.by(() => {
    let n = 0;
    if (showVWAP) n++;
    if (showBB) n++;
    if (showEMA) n++;
    if (showATRBands) n++;
    if (showMACD) n++;
    if (showCVD) n++;
    if (derivativesOnMain) n++;
    return n;
  });

  /** Number of sub-panes actually mounted below the price pane. */
  let activePanelCount = $derived.by(() => {
    let n = 0;
    if (panePositions.rsiOrMacd >= 0) n++;
    if (panePositions.oi >= 0) n++;
    if (panePositions.cvd >= 0) n++;
    if (panePositions.funding >= 0) n++;
    if (panePositions.liq >= 0) n++;
    return n;
  });

  /**
   * Price pane takes stretchFactor=4 (adjustable); each sub-pane takes its
   * stored stretch factor. Used as a CSS custom property for pib-anchor overlays.
   */
  const ORDERED_KINDS = ['rsiOrMacd', 'oi', 'cvd', 'funding', 'liq'] as const;
  let priceFracPct = $derived.by(() => {
    if (activePanelCount === 0) return 100;
    const activeKinds = ORDERED_KINDS.filter(k => panePositions[k] >= 0);
    const totalStretch = priceStretch + activeKinds.reduce((s, k) => s + paneLayout.state.stretch[k], 0);
    return Math.round((priceStretch / totalStretch) * 10000) / 100;
  });

  /** Per-pane top position (%) derived from actual stretch ratios. */
  let pibTops = $derived.by((): Partial<Record<PaneKind, number>> => {
    const activeKinds = ORDERED_KINDS.filter(k => panePositions[k] >= 0);
    if (activeKinds.length === 0) return {};
    const totalStretch = priceStretch + activeKinds.reduce((s, k) => s + paneLayout.state.stretch[k], 0);
    let cumPct = priceStretch / totalStretch * 100;
    const tops: Partial<Record<PaneKind, number>> = {};
    for (const kind of activeKinds) {
      tops[kind] = cumPct;
      cumPct += paneLayout.state.stretch[kind] / totalStretch * 100;
    }
    return tops;
  });

  /** Pane boundary lines: position + which pane is above (to resize on drag). */
  let resizeBoundaries = $derived.by(() => {
    const activeKinds = ORDERED_KINDS.filter(k => panePositions[k] >= 0);
    if (activeKinds.length === 0) return [] as Array<{ upperKind: 'price' | PaneKind; top: number }>;
    const result: Array<{ upperKind: 'price' | PaneKind; top: number }> = [];
    // Price / first-indicator boundary
    result.push({ upperKind: 'price', top: priceFracPct });
    // Indicator / indicator boundaries
    for (let i = 0; i < activeKinds.length - 1; i++) {
      const nextTop = pibTops[activeKinds[i + 1]];
      if (nextTop != null) result.push({ upperKind: activeKinds[i], top: nextTop });
    }
    return result;
  });

  type StudyCategory = 'Favorites' | 'Overlays' | 'Pane' | 'Flow';
  type StudyId = 'ema' | 'vwap' | 'bb' | 'atr' | 'macd' | 'cvd' | 'overlay' | 'comparison';
  type StudyDefinition = {
    id: StudyId;
    label: string;
    short: string;
    category: StudyCategory;
    description: string;
    active: boolean;
    featured?: boolean;
    meta?: string;
  };

  let studyCatalog = $derived.by<StudyDefinition[]>(() => [
    {
      id: 'ema',
      label: 'EMA 21 / 55',
      short: 'EMA',
      category: 'Favorites',
      description: 'Fast and slow trend pair with optional higher-timeframe stepping.',
      active: showEMA,
      featured: true,
      meta: emaTf ? `HTF ${emaTf}` : 'Chart resolution',
    },
    {
      id: 'vwap',
      label: 'VWAP',
      short: 'VWAP',
      category: 'Overlays',
      description: 'Session-weighted price anchor on the main chart.',
      active: showVWAP,
      featured: true,
    },
    {
      id: 'bb',
      label: 'Bollinger 20, 2',
      short: 'BB',
      category: 'Overlays',
      description: 'Volatility envelopes around the 20-period basis.',
      active: showBB,
      featured: true,
    },
    {
      id: 'atr',
      label: 'ATR 14 bands',
      short: 'ATR',
      category: 'Overlays',
      description: 'ATR channel projected around the MA20 trend basis.',
      active: showATRBands,
    },
    {
      id: 'macd',
      label: showMACD ? 'MACD pane' : 'RSI 14 pane',
      short: showMACD ? 'MACD' : 'RSI',
      category: 'Pane',
      description: 'Switch the lower oscillator pane between RSI and MACD.',
      active: true,
      featured: true,
      meta: showMACD ? 'MACD active' : 'RSI active',
    },
    {
      id: 'cvd',
      label: 'CVD pane',
      short: 'CVD',
      category: 'Flow',
      description: 'Delta volume histogram with cumulative CVD tracking.',
      active: showCVD,
      featured: true,
    },
    {
      id: 'overlay',
      label: 'Funding + cumulative CVD overlay',
      short: 'Overlay',
      category: 'Flow',
      description: 'Draw funding and cumulative CVD directly on the price chart.',
      active: derivativesOnMain,
    },
    {
      id: 'comparison',
      label: 'BTC comparison overlay',
      short: 'BTC ∥',
      category: 'Overlays',
      description: 'Normalized BTC price alongside current symbol — shows correlation / divergence.',
      active: showComparison,
      featured: true,
    },
  ]);

  let filteredStudyCatalog = $derived.by(() => {
    const q = studyQuery.trim().toLowerCase();
    if (!q) return studyCatalog;
    return studyCatalog.filter((study) =>
      study.label.toLowerCase().includes(q)
      || study.short.toLowerCase().includes(q)
      || study.category.toLowerCase().includes(q)
      || study.description.toLowerCase().includes(q)
    );
  });

  let studySections = $derived.by(() => {
    const order: StudyCategory[] = ['Favorites', 'Overlays', 'Pane', 'Flow'];
    return order
      .map((category) => ({
        category,
        items: filteredStudyCatalog.filter((study) => study.category === category || (category === 'Favorites' && study.featured)),
      }))
      .filter((section) => section.items.length > 0);
  });

  // ── Chart instance (single, native multi-pane) ────────────────────────────
  let mainChart = $state<IChartApi | null>(null);
  let priceSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'> | ISeriesApi<'Bar'> | null = null;
  /** Pane indices for indicator panes — assigned during renderCharts(). */
  let panePositions = $state<{ rsiOrMacd: number; oi: number; cvd: number; funding: number; liq: number }>({
    rsiOrMacd: -1, oi: -1, cvd: -1, funding: -1, liq: -1,
  });
  /** Series refs returned by mountIndicatorPanes — used by crosshair sync. */
  let indicatorSeriesRefs: IndicatorSeriesRefs | null = null;
  /** Unsubscribe handle for the active crosshair sync subscription. */
  let crosshairUnsub: CrosshairUnsubscribe | null = null;
  /** Per-pane layout store (visibility + stretch persistence). */
  const paneLayout = createPaneLayoutStore();
  /**
   * Live chips driven by crosshair. null = crosshair off chart;
   * parent falls back to static last-bar chips from chartData.
   */
  let crosshairChips = $state<CrosshairChips | null>(null);

  // ── Phase 4: pane resize handles ─────────────────────────────────────────
  /** Price pane stretch factor; normally 4, adjustable by dragging the first boundary. */
  let priceStretch = $state(4);
  type ResizeHandle = {
    upperKind: 'price' | PaneKind;
    startY: number;
    startStretch: number;
    startTotalStretch: number;
    containerH: number;
  };
  let activeResize = $state<ResizeHandle | null>(null);

  // ── DataFeed (resilient WS + polling) ─────────────────────────────────────
  let _dataFeed: DataFeed | null = null;

  // ── Layer 1: Range primitive (W-0086 / W-0117) ────────────────────────────
  let rangePrimitive: RangePrimitive | null = null;
  let saveModeUnsubscribe: (() => void) | null = null;

  // ── Layer 4: Gamma pin primitive (W-0122-Phase3) ──────────────────────────
  let gammaPinPrimitive: GammaPinPrimitive | null = null;

  // ── W-0210 Layer 1: Alpha overlay (analysis → price lines + markers) ───────
  let _alphaOverlay: AlphaOverlayLayer | null = null;

  // ── Layer 3: Capture annotations (W-0120) ────────────────────────────────
  let candleSeriesForAnnotations = $state<ISeriesApi<'Candlestick'> | null>(null);
  let candleMarkerApi: { setMarkers: (markers: SeriesMarker<UTCTimestamp>[]) => void } | null = null;
  let selectedCapture = $state<CaptureAnnotation | null>(null);
  let _annotationsCache = $state<CaptureAnnotation[]>([]);

  /** Convert tf string to seconds for ±2-bar click threshold (W-0124). */
  function _tfToSec(t: string): number {
    const map: Record<string, number> = {
      '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
      '1h': 3600, '2h': 7200, '4h': 14400, '6h': 21600, '12h': 43200,
      '1d': 86400, '3d': 259200, '1w': 604800,
    };
    return map[t] ?? 3600;
  }

  // Drag state — managed as plain variables (not reactive) to avoid cycles
  let _dragActive = false;
  let _dragOnMouseMove: ((e: MouseEvent) => void) | null = null;
  let _dragOnMouseUp: ((e: MouseEvent) => void) | null = null;

  function attachRangePrimitive() {
    if (!priceSeries || rangePrimitive) return;
    rangePrimitive = new RangePrimitive();
    (priceSeries as ISeriesApi<SeriesType>).attachPrimitive(rangePrimitive as unknown as Parameters<ISeriesApi<SeriesType>['attachPrimitive']>[0]);
  }

  /** Instantiate or update the AlphaOverlayLayer against the current candle series. */
  function syncAlphaOverlay() {
    if (!priceSeries || !mainChart) { _alphaOverlay = null; return; }
    // Only Candlestick series supports the full overlay (price lines + markers)
    if (!candleSeriesForAnnotations) { _alphaOverlay = null; return; }
    if (!_alphaOverlay) {
      _alphaOverlay = new AlphaOverlayLayer(
        candleSeriesForAnnotations as ISeriesApi<'Candlestick'>,
        mainChart,
      );
    }
    _alphaOverlay.apply(analysisData);
  }

  function detachRangePrimitive() {
    if (!priceSeries || !rangePrimitive) return;
    try {
      (priceSeries as ISeriesApi<SeriesType>).detachPrimitive(rangePrimitive as unknown as Parameters<ISeriesApi<SeriesType>['detachPrimitive']>[0]);
    } catch { /* ignore */ }
    rangePrimitive = null;
  }

  /** Attach/update/detach gamma pin line based on the `gammaPin` prop. */
  function syncGammaPinPrimitive(data: GammaPinData | null) {
    if (!priceSeries) return;
    const hasPin = data && data.pinLevel != null;
    if (hasPin) {
      if (!gammaPinPrimitive) {
        gammaPinPrimitive = new GammaPinPrimitive(data);
        (priceSeries as ISeriesApi<SeriesType>).attachPrimitive(
          gammaPinPrimitive as unknown as Parameters<ISeriesApi<SeriesType>['attachPrimitive']>[0]
        );
      } else {
        gammaPinPrimitive.update(data);
      }
    } else if (gammaPinPrimitive) {
      try {
        (priceSeries as ISeriesApi<SeriesType>).detachPrimitive(
          gammaPinPrimitive as unknown as Parameters<ISeriesApi<SeriesType>['detachPrimitive']>[0]
        );
      } catch { /* ignore */ }
      gammaPinPrimitive = null;
    }
  }

  // React to gamma prop changes — after priceSeries is created, keep primitive in sync.
  $effect(() => {
    void gammaPin;       // subscribe
    syncGammaPinPrimitive(gammaPin);
  });

  /** Convert clientX to chart time using mainEl bounding rect. */
  function clientXToChartTime(clientX: number): number | null {
    if (!mainChart || !mainEl) return null;
    const rect = mainEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const t = mainChart.timeScale().coordinateToTime(x);
    if (t === null) return null;
    return typeof t === 'number' ? t : Math.floor(new Date(t as string).getTime() / 1000);
  }

  function attachDragHandlers() {
    if (!mainEl || _dragOnMouseMove) return;

    const onMouseDown = (e: MouseEvent) => {
      const t = clientXToChartTime(e.clientX);
      if (t === null) return;
      chartSaveMode.startDrag(t);
      _dragActive = true;
      e.preventDefault(); // block text-selection during drag
    };

    _dragOnMouseMove = (e: MouseEvent) => {
      if (!_dragActive) return;
      const t = clientXToChartTime(e.clientX);
      if (t !== null) chartSaveMode.adjustAnchor('B', t);
    };

    _dragOnMouseUp = (e: MouseEvent) => {
      if (!_dragActive) return;
      const t = clientXToChartTime(e.clientX);
      if (t !== null) chartSaveMode.adjustAnchor('B', t);
      _dragActive = false;
    };

    mainEl.addEventListener('mousedown', onMouseDown);
    mainEl.addEventListener('mousemove', _dragOnMouseMove);
    mainEl.addEventListener('mouseup', _dragOnMouseUp);
    // catch mouseup outside chart bounds too
    window.addEventListener('mouseup', _dragOnMouseUp);
  }

  function detachDragHandlers() {
    if (_dragOnMouseMove && mainEl) {
      mainEl.removeEventListener('mousemove', _dragOnMouseMove);
      mainEl.removeEventListener('mouseup', _dragOnMouseUp!);
    }
    if (_dragOnMouseUp) window.removeEventListener('mouseup', _dragOnMouseUp);
    _dragOnMouseMove = null;
    _dragOnMouseUp = null;
    _dragActive = false;
  }

  // ── Pane resize handlers (Phase 4) ───────────────────────────────────────

  function _onResizeMove(e: MouseEvent) {
    if (!activeResize || !mainChart) return;
    const deltaY = e.clientY - activeResize.startY;
    const deltaStretch = (deltaY / activeResize.containerH) * activeResize.startTotalStretch;
    if (activeResize.upperKind === 'price') {
      priceStretch = Math.max(1, Math.min(12, activeResize.startStretch + deltaStretch));
      try { mainChart.panes()[0]?.setStretchFactor(priceStretch); } catch { /* v5.0.8+ */ }
    } else {
      const newStretch = Math.max(0.5, Math.min(8, activeResize.startStretch + deltaStretch));
      paneLayout.setStretch(activeResize.upperKind, newStretch);
      try {
        const idx = panePositions[activeResize.upperKind];
        if (idx >= 0) mainChart.panes()[idx]?.setStretchFactor(newStretch);
      } catch { /* ignore */ }
    }
  }

  function _onResizeUp() {
    activeResize = null;
    window.removeEventListener('mousemove', _onResizeMove);
    window.removeEventListener('mouseup', _onResizeUp);
  }

  function startPaneResize(e: MouseEvent, upperKind: 'price' | PaneKind) {
    if (!mainEl) return;
    e.preventDefault();
    e.stopPropagation();
    const activeKinds = ORDERED_KINDS.filter(k => panePositions[k] >= 0);
    const totalStretch = priceStretch + activeKinds.reduce((s, k) => s + paneLayout.state.stretch[k], 0);
    const startStretch = upperKind === 'price' ? priceStretch : paneLayout.state.stretch[upperKind];
    activeResize = {
      upperKind,
      startY: e.clientY,
      startStretch,
      startTotalStretch: totalStretch,
      containerH: Math.max(1, mainEl.clientHeight),
    };
    window.addEventListener('mousemove', _onResizeMove);
    window.addEventListener('mouseup', _onResizeUp);
  }

  function handleSaveModeChange(state: { active: boolean; anchorA: number | null; anchorB: number | null }) {
    if (!mainChart) return;

    if (state.active) {
      // Disable LWC pan/scale so drag selects range instead of panning
      mainChart.applyOptions({ handleScroll: false, handleScale: false });
      attachDragHandlers();
    } else {
      detachDragHandlers();
      mainChart.applyOptions({ handleScroll: true, handleScale: true });
    }

    rangePrimitive?.setRange(state.anchorA, state.anchorB);

    // Open ResearchPanel when both anchors are set (range fully selected)
    if (state.active && state.anchorA !== null && state.anchorB !== null) {
      const viewport = getViewportForSave();
      if (viewport && viewport.barCount > 0) {
        researchViewport = viewport;
        showResearchPanel = true;
      }
    }
  }

  function handleRangeModeKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && $chartSaveMode.active) {
      chartSaveMode.exitRangeMode();
    }
  }

  function handleDrawingModeKeydown(e: KeyboardEvent) {
    if ((e.key === 'd' || e.key === 'D') && !$chartSaveMode.active) {
      e.preventDefault();
      shellStore.setDrawingTool('trendLine');
    }
  }

  function handleIndicatorLibraryKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    if (e.key === '/' && !inInput) {
      e.preventDefault();
      catalogModalOpen = !catalogModalOpen;
      if (catalogModalOpen) indicatorLibraryOpen = false;
    }
    if (e.key === 'Escape' && indicatorLibraryOpen) {
      indicatorLibraryOpen = false;
    }
  }

  // ── Price line manager (verdict / liq / whale) ─────────────────────────────
  let priceLineMgr = new PriceLineManager();

  // ── Timeframes ────────────────────────────────────────────────────────────
  const TIMEFRAMES = ['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','1w'];

  /** EMA computed on this TF then aligned to chart bars; '' = same as chart (no MTF request). */
  let emaTf = $state('');
  let emaTfOptions = $derived(TIMEFRAMES.filter((t) => tfMinutes(t) > tfMinutes(tf)));

  $effect(() => {
    void tf;
    if (emaTf && !emaTfOptions.includes(emaTf)) {
      emaTf = '';
    }
  });

  // ── Theme (TradingView-inspired dark) ─────────────────────────────────────
  const BG    = '#131722';
  const GRID  = 'rgba(42,46,57,0.9)';
  const TEXT  = 'rgba(177,181,189,0.85)';
  const BORDER = 'rgba(42,46,57,1)';

  const baseTheme = {
    handleScroll: true,
    handleScale: true,
    layout: { background: { color: BG }, textColor: TEXT, fontSize: 10, fontFamily: 'var(--sc-font-mono, monospace)' },
    grid:   { vertLines: { color: GRID }, horzLines: { color: GRID } },
    crosshair: {
      vertLine: { color: 'rgba(255,255,255,0.2)', width: 1 as const, style: 3 },
      horzLine: { color: 'rgba(255,255,255,0.2)', width: 1 as const, style: 3 },
    },
    timeScale: { borderColor: BORDER, timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderColor: BORDER },
  };

  /** Viewport width for responsive UI choices (toolbar / context strip). */
  let viewportWidth = $state<number | null>(null);
  // Native multi-pane handles per-pane sizing via setStretchFactor — no manual
  // pane-height constants needed.

  const volumeProfileRows = $derived.by(() => {
    const bars = chartData?.klines?.slice(-180) ?? [];
    if (bars.length < 8) return [];
    const high = Math.max(...bars.map((bar) => bar.high));
    const low = Math.min(...bars.map((bar) => bar.low));
    const span = Math.max(1e-9, high - low);
    const bucketCount = 22;
    const buckets = Array.from({ length: bucketCount }, (_, index) => ({
      price: high - (span * index) / Math.max(1, bucketCount - 1),
      bid: 0,
      ask: 0,
      total: 0,
    }));

    for (const bar of bars) {
      const idx = Math.max(0, Math.min(bucketCount - 1, Math.floor(((high - bar.close) / span) * bucketCount)));
      const closePos = Math.max(0, Math.min(1, (bar.close - bar.low) / Math.max(1e-9, bar.high - bar.low)));
      const ask = bar.volume * (0.3 + closePos * 0.58);
      const bid = Math.max(0, bar.volume - ask);
      buckets[idx].bid += bid;
      buckets[idx].ask += ask;
      buckets[idx].total += bar.volume;
    }

    const maxTotal = Math.max(1, ...buckets.map((bucket) => bucket.total));
    return buckets.map((bucket) => ({
      price: bucket.price,
      bidWidth: `${Math.max(2, Math.min(100, (bucket.bid / maxTotal) * 100))}%`,
      askWidth: `${Math.max(2, Math.min(100, (bucket.ask / maxTotal) * 100))}%`,
      opacity: 0.24 + Math.min(0.76, bucket.total / maxTotal),
      isPoc: bucket.total === maxTotal,
    }));
  });

  const veloCaption = $derived.by(() => {
    const bars = chartData?.klines ?? [];
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    if (!last) return null;
    const change = prev?.close ? ((last.close - prev.close) / prev.close) * 100 : 0;
    return {
      o: last.open,
      h: last.high,
      l: last.low,
      c: last.close,
      change,
    };
  });

  function formatCaptureTime(ts: number): string {
    return new Date(ts * 1000).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function refreshCaptureWindowSummary() {
    const viewport = getViewportForSave();
    if (!viewport || viewport.barCount <= 0 || viewport.klines.length === 0) {
      captureWindowLabel = 'Visible range capture unavailable';
      captureBarCount = null;
      return;
    }
    const first = viewport.klines[0]?.time ?? viewport.timeFrom;
    const last = viewport.klines[viewport.klines.length - 1]?.time ?? viewport.timeTo;
    captureWindowLabel = `${formatCaptureTime(first)} -> ${formatCaptureTime(last)}`;
    captureBarCount = viewport.barCount;
  }

  /**
   * Native multi-pane: the chart owns the full host element height. Indicator
   * pane heights inside are governed by `setStretchFactor` on each pane.
   */
  function measureChartHostHeight(): number {
    const h = mainEl?.clientHeight ?? 0;
    if (h > 200) return h;
    return 520; // sensible default — fills price + 4 panes comfortably
  }

  // ── Data load — delegated to useChartDataFeed composable ─────────────────
  const feed = useChartDataFeed({
    getSymbol: () => symbol,
    getTf: () => tf,
    getEmaTf: () => emaTf,
    getInitialData: () => initialData ?? null,
    getChart: () => mainChart,
    getPriceSeries: () => priceSeries,
  });

  // Accessor aliases so existing code reads naturally
  let loading = $derived(feed.loading);
  let error = $derived(feed.error);
  let rateLimitRetryIn = $derived(feed.rateLimitRetryIn);
  let chartData = $derived(feed.chartData);

  // Keep chartSaveMode payload in sync so SaveStrip can slice indicators (W-0117 Slice B)
  $effect(() => {
    chartSaveMode.setPayload(feed.chartData);
    if (feed.chartData) setChartFreshness(Date.now());
  });

  // ── Pane info chips (current value + Δ for each line in each pane) ───────
  // Recomputed any time chartData / tf changes. Cheap (O(N) per pane).
  const oiChips = $derived.by(() => {
    if (!chartData?.oiBars?.length) return null;
    return computePaneChips('oi', chartData.oiBars.map((b) => ({ time: b.time, value: b.value })), tf);
  });
  const cvdChips = $derived.by(() => {
    if (!chartData) return null;
    const raw = chartData.cvdBars?.length
      ? chartData.cvdBars.map((b) => ({ time: b.time, value: b.value }))
      : (() => {
          let cum = 0;
          return (chartData.klines ?? []).map((k) => {
            cum += (k.close >= k.open ? 1 : -1) * k.volume;
            return { time: k.time, value: cum };
          });
        })();
    if (raw.length === 0) return null;
    return computePaneChips('cvd', raw, tf);
  });
  const fundingChips = $derived.by(() => {
    if (!chartData?.fundingBars?.length) return null;
    return computePaneChips('funding', chartData.fundingBars.map((b) => ({ time: b.time, value: b.value })), tf);
  });
  const liqChips = $derived.by(() => {
    if (!chartData?.liqBars?.length) return null;
    return computeLiqChips(chartData.liqBars, tf);
  });
  const rsiOrMacdChips = $derived.by(() => {
    if (!chartData) return null;
    if (showMACD) {
      const macdArr = (chartData.indicators as Record<string, unknown>)?.macd as
        Array<{ time: number; macd: number; signal: number; hist: number }> | undefined;
      if (!macdArr?.length) return null;
      const last = macdArr[macdArr.length - 1];
      return [
        { key: 'macd',   color: '#63b3ed', label: 'MACD',   value: last.macd.toFixed(4) },
        { key: 'signal', color: '#fbbf24', label: 'signal', value: last.signal.toFixed(4) },
        {
          key: 'hist', label: 'hist',
          color: last.hist >= 0 ? 'rgba(38,166,154,0.9)' : 'rgba(239,83,80,0.9)',
          value: last.hist.toFixed(4),
          tone: (last.hist >= 0 ? 'bull' : 'bear') as 'bull' | 'bear',
        },
      ];
    }
    if (showRSI) {
      const rsiArr = (chartData.indicators as Record<string, unknown>)?.rsi14 as
        Array<{ time: number; value: number }> | undefined;
      if (!rsiArr?.length) return null;
      const v = rsiArr[rsiArr.length - 1].value;
      return [{ key: 'rsi', color: '#fbbf24', label: 'RSI 14', value: v.toFixed(2) }];
    }
    return null;
  });

  // Bundle for the KPI strip
  const kpiBundle = $derived<KpiInputBundle>({
    chart: chartData,
    depth: depthData,
    liq: liqData,
    feedStatus: _dataFeed ? 'ws' : 'poll',
  });
  // ── History lazy-load ────────────────────────────────────────────────────
  const LAZY_TRIGGER_BARS = 30; // fetch more when within this many bars of the left edge

  // ── DataFeed: resilient WS + polling (replaces bare connectKlineWS) ────────

  function initDataFeed(sym: string, timeframe: string) {
    if (typeof window === 'undefined') return;
    _dataFeed?.disconnect();
    _dataFeed = new DataFeed({ symbol: sym, tf: timeframe });

    // Live tick → update price series in real-time
    _dataFeed.onBar = (bar, isClosed) => {
      (priceSeries as ISeriesApi<'Candlestick'> | null)?.update({
        time:  bar.time as UTCTimestamp,
        open:  bar.open,
        high:  bar.high,
        low:   bar.low,
        close: bar.close,
      });
      liveTick.update({ price: bar.close });
      if (isClosed) onCandleClose?.(bar);
    };

    // Initial historical load → render liq sub-pane
    _dataFeed.onLoad = (payload) => {
      if (payload.liqBars?.length) _initLiqPane(payload.liqBars);
    };

    // Poll refresh (60s) → update liq pane with fresh data
    _dataFeed.onPoll = (payload) => {
      if (payload.liqBars?.length) _refreshLiqPane(payload.liqBars);
    };

    void _dataFeed.connect();
  }

  function disconnectFeed() {
    _dataFeed?.disconnect();
    _dataFeed = null;
  }

  // Legacy alias used by existing $effect below — keeps change minimal
  function connectKlineWS(sym: string, timeframe: string) { initDataFeed(sym, timeframe); }
  function disconnectWS() { disconnectFeed(); }

  // ── Render ────────────────────────────────────────────────────────────────
  type LinePoint  = { time: UTCTimestamp; value: number };
  type HistoPoint = { time: UTCTimestamp; value: number; color?: string };

  function toLine(arr: Array<{ time: number; value: number }>): LinePoint[] {
    return arr
      .filter((p) => Number.isFinite(p.value))
      .map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
  }
  function toHisto(arr: Array<{ time: number; value: number; color?: string }>): HistoPoint[] {
    return arr.map(p => ({ time: p.time as UTCTimestamp, value: p.value, color: p.color }));
  }

  function renderCharts(data: ChartSeriesPayload) {
    if (!mainEl) return;
    destroyCharts();

    let candleSeriesRef: ISeriesApi<'Candlestick'> | null = null;

    const w = containerEl?.offsetWidth ?? 900;

    const ind = data.indicators as Record<string, Array<{ time: number; value: number }>>;
    const klines = data.klines as Array<{ time: number; open: number; close: number; high: number; low: number; volume: number }>;
    const oiBars = data.oiBars as Array<{ time: number; value: number; color: string }>;
    const fundingBars = data.fundingBars as Array<{ time: number; value: number; color: string }> | undefined;
    const cvdRaw = data.cvdBars as Array<{ time: number; value: number }> | undefined;

    const cvdCumBars: Array<{ time: number; value: number }> = cvdRaw?.length
      ? cvdRaw
      : (() => {
          let acc = 0;
          return klines.map((k) => {
            const signedVol = (k.close >= k.open ? 1 : -1) * k.volume;
            acc += signedVol;
            return { time: k.time, value: acc };
          });
        })();

    // Main chart overlays only host true price-aligned studies (EMA / BB /
    // VWAP / ATR bands) plus the CQ-style Funding % line on the left axis.
    // CVD is a sub-pane indicator — it belongs in `.pane-cvd`, never on the
    // price pane (user feedback 2026-04-19: "보조지표만 같이 나오고 나머지는
    // 하단으로 붙어야지").
    const hasFundingOverlay =
      derivativesOnMain && (chartMode === 'candle' || chartMode === 'bar' || chartMode === 'heikin') && Boolean(fundingBars?.length);
    const mainChartHeight = measureChartHostHeight();

    // ── Main (candles + overlays) ────────────────────────────────────────────
    mainChart = createChart(mainEl, {
      ...baseTheme,
      width: w,
      height: mainChartHeight,
      rightPriceScale: {
        ...baseTheme.rightPriceScale,
        scaleMargins: { top: 0.08, bottom: 0.08 },
        mode: priceScaleMode === 'log'
          ? PriceScaleMode.Logarithmic
          : priceScaleMode === 'percent'
            ? PriceScaleMode.Percentage
            : PriceScaleMode.Normal,
      },
      leftPriceScale: hasFundingOverlay
        ? { visible: true, borderColor: BORDER, scaleMargins: { top: 0.06, bottom: 0.06 } }
        : { visible: false },
    });

    const lastBar = klines[klines.length - 1];
    const prevBar = klines[klines.length - 2];
    liveTick.update({
      price:     lastBar?.close ?? null,
      time:      lastBar?.time  ?? null,
      changePct: lastBar && prevBar && prevBar.close > 0 ? ((lastBar.close - prevBar.close) / prevBar.close) * 100 : null,
      oiDelta:   oiBars?.length ? oiBars[oiBars.length - 1]?.value ?? null : null,
    });

    if (chartMode === 'line') {
      const lineSeries = mainChart.addSeries(LineSeries, {
        color: '#63b3ed',
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      lineSeries.setData(klines.map((k) => ({ time: k.time as UTCTimestamp, value: k.close })));
      priceSeries = lineSeries;
      candleSeriesForAnnotations = null;
      candleMarkerApi = null;
    } else if (chartMode === 'area') {
      const areaSeries = mainChart.addSeries(AreaSeries, {
        lineColor: '#63b3ed',
        topColor: 'rgba(99,179,237,0.3)',
        bottomColor: 'rgba(99,179,237,0)',
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      areaSeries.setData(klines.map((k) => ({ time: k.time as UTCTimestamp, value: k.close })));
      priceSeries = areaSeries;
      candleSeriesForAnnotations = null;
      candleMarkerApi = null;
    } else if (chartMode === 'bar') {
      const barSeries = mainChart.addSeries(BarSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
        openVisible: true,
        thinBars: false,
      });
      barSeries.setData(klines.map((bar) => ({
        time: bar.time as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })));
      priceSeries = barSeries;
      candleSeriesForAnnotations = null;
      candleMarkerApi = null;
    } else if (chartMode === 'heikin') {
      // Heikin Ashi calculation
      const haBars = klines.map((bar, i) => {
        const prev = i > 0 ? klines[i - 1] : bar;
        const haClose = (bar.open + bar.high + bar.low + bar.close) / 4;
        const haOpen = i === 0 ? (bar.open + bar.close) / 2 : (prev.open + prev.close) / 2;
        const haHigh = Math.max(bar.high, haOpen, haClose);
        const haLow = Math.min(bar.low, haOpen, haClose);
        return { time: bar.time as UTCTimestamp, open: haOpen, high: haHigh, low: haLow, close: haClose };
      });
      const haSeries = mainChart.addSeries(CandlestickSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderUpColor: '#26a69a',
        borderDownColor: '#ef5350',
        wickUpColor: 'rgba(38,166,154,0.7)',
        wickDownColor: 'rgba(239,83,80,0.7)',
      });
      haSeries.setData(haBars);
      priceSeries = haSeries;
      candleSeriesForAnnotations = null;
      candleMarkerApi = null;
    } else {
      // Default: candlestick
      const candleSeries = mainChart.addSeries(CandlestickSeries, {
        upColor:        '#26a69a',
        downColor:      '#ef5350',
        borderUpColor:  '#26a69a',
        borderDownColor:'#ef5350',
        wickUpColor:    'rgba(38,166,154,0.7)',
        wickDownColor:  'rgba(239,83,80,0.7)',
      });
      candleSeries.setData(
        klines.map((bar) => ({
          time: bar.time as UTCTimestamp,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        }))
      );
      candleSeriesRef = candleSeries;
      candleMarkerApi = createSeriesMarkers(candleSeries, []);
      priceSeries = candleSeries;
      candleSeriesForAnnotations = candleSeries;  // Layer 3: capture overlay
      // Attach range primitive to candlestick series (Layer 1, W-0086)
      attachRangePrimitive();
    }

    // SMA 20 / 60 — always on
    if (ind.sma20?.length) {
      const s = mainChart.addSeries(LineSeries, { color: '#fbbf24', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      s.setData(toLine(ind.sma20));
    }
    if (ind.sma60?.length) {
      const s = mainChart.addSeries(LineSeries, { color: '#a78bfa', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      s.setData(toLine(ind.sma60));
    }
    // SMA 5
    if (ind.sma5?.length) {
      const s = mainChart.addSeries(LineSeries, { color: 'rgba(99,179,237,0.7)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      s.setData(toLine(ind.sma5));
    }

    // W-0210 Layer 3: Comparison overlay — normalized BTC (or benchmark) on same panel
    // Uses a dedicated right price scale so it doesn't distort the main price scale.
    if (showComparison && symbol !== COMPARISON_SYMBOL) {
      const compData = $comparisonStore.data;
      if (compData.length) {
        // Normalize main symbol klines to same 100-base for fair comparison
        const mainBase = klines[0]?.close;
        if (mainBase) {
          const mainNorm = klines.map(k => ({
            time: k.time as UTCTimestamp,
            value: (k.close / mainBase) * 100,
          }));

          // Add main series normalized line (on comparison scale)
          const mainNormSeries = mainChart.addSeries(LineSeries, {
            color: 'rgba(255,199,80,0.5)',
            lineWidth: 1 as const,
            priceScaleId: 'comparison',
            lastValueVisible: false,
            priceLineVisible: false,
            title: symbol.replace('USDT', ''),
          });
          mainNormSeries.setData(mainNorm);

          // Add BTC normalized line
          const compSeries = mainChart.addSeries(LineSeries, {
            color: 'rgba(75,158,253,0.65)',
            lineWidth: 1 as const,
            priceScaleId: 'comparison',
            lastValueVisible: true,
            priceLineVisible: false,
            title: 'BTC',
          });
          compSeries.setData(compData);

          // Configure shared comparison price scale (right-side, minimal footprint)
          mainChart.priceScale('comparison').applyOptions({
            visible: false,  // hide axis — relative values are less meaningful
            scaleMargins: { top: 0.05, bottom: 0.05 },
          });
        }
      }
    }

    // VWAP toggle
    if (showVWAP && ind.vwap?.length) {
      const s = mainChart.addSeries(LineSeries, { color: 'rgba(255,200,60,0.9)', lineWidth: 1, lineStyle: 1 as const, lastValueVisible: true, priceLineVisible: false });
      s.setData(toLine(ind.vwap));
    }

    // EMA engine overlays (chart TF solid; optional HTF EMA aligned to bar times — dashed, TV-style)
    if (showEMA) {
      const emaFast = ind.ema21 ?? ind.ema20;
      const emaSlow = ind.ema55 ?? ind.ema60;
      const emaFastMtf = ind.ema21_mtf as Array<{ time: number; value: number }> | undefined;
      const emaSlowMtf = ind.ema55_mtf as Array<{ time: number; value: number }> | undefined;
      const hasMtf =
        Array.isArray(emaFastMtf) &&
        emaFastMtf.length > 0 &&
        Array.isArray(emaSlowMtf) &&
        emaSlowMtf.length > 0;

      if (hasMtf) {
        if (emaFast?.length) {
          const s = mainChart.addSeries(LineSeries, { color: 'rgba(64,196,255,0.38)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
          s.setData(toLine(emaFast));
        }
        if (emaSlow?.length) {
          const s = mainChart.addSeries(LineSeries, { color: 'rgba(255,152,0,0.38)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
          s.setData(toLine(emaSlow));
        }
        if (emaFastMtf?.length) {
          const s = mainChart.addSeries(LineSeries, { color: 'rgba(64,196,255,0.95)', lineWidth: 1, lineStyle: 2 as const, lastValueVisible: true, priceLineVisible: false });
          s.setData(toLine(emaFastMtf));
        }
        if (emaSlowMtf?.length) {
          const s = mainChart.addSeries(LineSeries, { color: 'rgba(255,152,0,0.95)', lineWidth: 1, lineStyle: 2 as const, lastValueVisible: true, priceLineVisible: false });
          s.setData(toLine(emaSlowMtf));
        }
      } else {
        if (emaFast?.length) {
          const s = mainChart.addSeries(LineSeries, { color: 'rgba(64,196,255,0.9)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
          s.setData(toLine(emaFast));
        }
        if (emaSlow?.length) {
          const s = mainChart.addSeries(LineSeries, { color: 'rgba(255,152,0,0.9)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
          s.setData(toLine(emaSlow));
        }
      }
    }

    // ATR channel proxy: SMA20 +/- ATR14
    if (showATRBands && ind.sma20?.length && ind.atr14?.length) {
      const atrMap = new Map(ind.atr14.map((p) => [p.time, p.value]));
      const upper = ind.sma20.map((p) => ({ time: p.time, value: p.value + (atrMap.get(p.time) ?? 0) }));
      const lower = ind.sma20.map((p) => ({ time: p.time, value: p.value - (atrMap.get(p.time) ?? 0) }));
      const up = mainChart.addSeries(LineSeries, { color: 'rgba(255,255,255,0.28)', lineWidth: 1, lineStyle: 2 as const, lastValueVisible: false, priceLineVisible: false });
      const lo = mainChart.addSeries(LineSeries, { color: 'rgba(255,255,255,0.28)', lineWidth: 1, lineStyle: 2 as const, lastValueVisible: false, priceLineVisible: false });
      up.setData(toLine(upper));
      lo.setData(toLine(lower));
    }

    // Bollinger Bands toggle
    if (showBB) {
      const bbU = ind.bbUpper as Array<{ time: number; value: number }>;
      const bbL = ind.bbLower as Array<{ time: number; value: number }>;
      if (bbU?.length) {
        const su = mainChart.addSeries(LineSeries, { color: 'rgba(139,92,246,0.5)', lineWidth: 1, lineStyle: 2 as const, lastValueVisible: false, priceLineVisible: false });
        su.setData(toLine(bbU));
        const sl = mainChart.addSeries(LineSeries, { color: 'rgba(139,92,246,0.5)', lineWidth: 1, lineStyle: 2 as const, lastValueVisible: false, priceLineVisible: false });
        sl.setData(toLine(bbL));
      }
    }

    // Fund % on main pane (left axis, shared time axis — CryptoQuant-style
    // derivative overlay on price). CVD moved out to the sub-pane.
    if (hasFundingOverlay && fundingBars != null && fundingBars.length > 0) {
      const fMain = mainChart.addSeries(LineSeries, {
        priceScaleId: 'left',
        color: 'rgba(251,191,36,0.92)',
        lineWidth: 1,
        priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
        lastValueVisible: true,
        priceLineVisible: false,
      });
      fMain.setData(toLine(fundingBars.map((f) => ({ time: f.time, value: f.value }))));
    }

    // Verdict price levels + liquidation rails (price-scale aligned)
    updateLevels();
    applyLiqPriceLines();

    if (candleSeriesRef && klines.length) {
      const markers: SeriesMarker<UTCTimestamp>[] = [];
      const t = klines[klines.length - 1].time as UTCTimestamp;
      if (cvdDivergence?.state === 'bullish_divergence') {
        markers.push({
          time: t,
          position: 'belowBar',
          color: '#4ade80',
          shape: 'arrowUp',
          text: 'CVD',
        });
      } else if (cvdDivergence?.state === 'bearish_divergence') {
        markers.push({
          time: t,
          position: 'aboveBar',
          color: '#f87171',
          shape: 'arrowDown',
          text: 'CVD',
        });
      }
      // Alpha phase markers (W-0116): phase transitions overlaid on candles
      if (alphaMarkers?.length) {
        for (const am of alphaMarkers) {
          markers.push({
            time: am.timestamp as UTCTimestamp,
            position: 'belowBar',
            color: am.color ?? '#a78bfa',
            shape: 'circle',
            text: am.label ?? am.phase,
          });
        }
      }
      // W-0358: note markers concat (sorted by time)
      const allMarkers = [...markers, ...chartNotesStore.markers]
        .sort((a, b) => (a.time as number) - (b.time as number));
      candleMarkerApi?.setMarkers(allMarkers);
    }

    // W-0210 Layer 1: Alpha overlay — ATR levels + phase markers from analysisData
    syncAlphaOverlay();

    mainChart.subscribeCrosshairMove((param) => {
      if (param.time) {
        const series = priceSeries;
        const d = series ? param.seriesData.get(series) as { close?: number; value?: number } | undefined : undefined;
        liveTick.update({
          time:  param.time as number,
          price: d?.close ?? d?.value ?? liveTick.price,
        });
      }
    });

    // W-0358: note marker click — open NotePanel view for matching note
    mainChart.subscribeClick((param) => {
      if (!param.time || !chartNotesStore.showNotes || chartNotesStore.notes.length === 0) return;
      const clickTs = typeof param.time === 'number'
        ? param.time
        : Math.floor(new Date(param.time as string).getTime() / 1000);
      const barSec = _tfToSec(tf);
      const tolerance = barSec * 0.6;
      const hit = chartNotesStore.notes.find(n => Math.abs(n.bar_time - clickTs) <= tolerance);
      if (hit) chartNotesStore.openView(hit);
    });

    // Capture annotation click: open drawer for nearest marker within ±2 bars (W-0124)
    mainChart.subscribeClick((param) => {
      if (!param.time || !_annotationsCache.length || selectedCapture) return;
      const ts = typeof param.time === 'number'
        ? param.time
        : Math.floor(new Date(param.time as string).getTime() / 1000);
      const threshold = _tfToSec(tf) * 2;
      let nearest: CaptureAnnotation | null = null;
      let nearestDist = Infinity;
      for (const ann of _annotationsCache) {
        const d = Math.abs(ann.captured_at_s - ts);
        if (d < nearestDist) { nearestDist = d; nearest = ann; }
      }
      if (nearest && nearestDist <= threshold) {
        selectedCapture = nearest;
      }
    });

    // ── Indicator panes (native lightweight-charts v5.1 multi-pane) ─────────
    // Volume sits inside pane 0 (price) on its own price scale, pinned to the
    // bottom 20% — keeps price + volume colocated, the way most traders read.
    const mountResult = mountIndicatorPanesModule(mainChart, data, klines, ind, {
      showVolume,
      showRSI,
      showMACD,
      showOI,
      showCVD,
      showFundingPane,
      showLiqPane,
    }, tf);
    panePositions = mountResult.positions;
    indicatorSeriesRefs = mountResult.seriesRefs;

    // Mount secondary indicator instances (multi-instance — W-0399)
    const posVals = Object.values(mountResult.positions).filter((v) => v >= 0);
    let nextExtraPane = posVals.length ? Math.max(...posVals) + 1 : 1;
    for (const inst of indicatorInstances.instances) {
      if (!inst.style.visible) continue;
      const key = inst.engineKey;
      const p = inst.params;
      const overlay = isOverlayIndicator(key);
      const targetPane = overlay ? 0 : nextExtraPane;

      let secPayload: SecondaryIndicatorPayload | null = null;

      if (key === 'rsi') {
        secPayload = { engineKey: 'rsi', data: calcRSI(klines, (p.period as number) || 14) };
      } else if (key === 'macd') {
        secPayload = { engineKey: 'macd', data: calcMACD(klines, (p.fast as number) || 12, (p.slow as number) || 26, (p.signal as number) || 9) };
      } else if (key === 'ema') {
        const period = (p.period as number) || 21;
        secPayload = { engineKey: 'ema', data: calcEMAValues(klines, period), label: `EMA ${period}` };
      } else if (key === 'vwap') {
        secPayload = { engineKey: 'vwap', data: calcVWAP(klines) };
      } else if (key === 'bb') {
        secPayload = { engineKey: 'bb', data: calcBB(klines, (p.period as number) || 20, (p.mult as number) || 2) };
      } else if (key === 'atr_bands') {
        secPayload = { engineKey: 'atr_bands', data: calcATRBands(klines, (p.period as number) || 14, (p.mult as number) || 2) };
      } else if (key === 'volume') {
        secPayload = { engineKey: 'volume', bars: klines };
      } else if (key === 'oi') {
        const oiData = data.oiBars?.map((b) => ({ time: b.time, value: b.value })) ?? [];
        secPayload = { engineKey: 'oi', data: oiData, tf };
      } else if (key === 'cvd') {
        let cvd = data.cvdBars?.map((b) => ({ time: b.time, value: b.value })) ?? [];
        if (!cvd.length) {
          let cum = 0;
          cvd = klines.map((k) => { cum += (k.close >= k.open ? 1 : -1) * k.volume; return { time: k.time, value: cum }; });
        }
        secPayload = { engineKey: 'cvd', data: cvd, tf };
      } else if (key === 'derivatives') {
        const fundData = (data.fundingBars ?? []) as Array<{ time: number; value: number }>;
        secPayload = { engineKey: 'derivatives', data: fundData.map((b) => ({ time: b.time, value: b.value })), tf };
      }

      if (secPayload) {
        mountSecondaryIndicator(mainChart!, secPayload, targetPane, inst.instanceId, inst.style.color);
        if (!overlay) nextExtraPane++;
      }
    }

    // Wire crosshair → live chip updates (rAF throttled)
    crosshairUnsub?.();
    crosshairUnsub = createCrosshairSync(
      mainChart,
      indicatorSeriesRefs,
      panePositions,
      (chips) => { crosshairChips = chips; },
    );

    subscribeMainTimeScale();

    void tick().then(() => {
      handleResize();
      mainChart?.timeScale().scrollToRealTime();

      // W-0289: init DrawingManager after chart is ready
      if (mainChart && priceSeries) {
        const key = `drawings:${symbol}:${tf}`;
        if (!drawingMgr || drawingMgr.storageKey !== key) {
          drawingMgr?.detach();
          drawingMgr = new DrawingManager({ storageKey: key });
        }
        drawingMgr.onToolChange = (t) => { drawingActiveTool = t; };
        drawingMgr.attach(mainChart, priceSeries as ISeriesApi<SeriesType>);
      }
    });
  }

  // ── Verdict / whale level lines — delegated to PriceLineManager ─────────
  function updateLevels() {
    priceLineMgr.setSeries(priceSeries as ISeriesApi<SeriesType> | null);
    priceLineMgr.updateVerdictLevels(verdictLevels);
  }

  // W-0210 Layer 2: Whale liquidation price lines
  function applyWhalePriceLines() {
    priceLineMgr.setSeries(priceSeries as ISeriesApi<SeriesType> | null);
    // Filter out 'unknown' netPosition — PriceLineManager only accepts 'long' | 'short'
    const knownPositions = $whaleStore.positions.filter(
      (p): p is typeof p & { netPosition: 'long' | 'short' } => p.netPosition !== 'unknown',
    );
    priceLineMgr.applyWhaleLines(knownPositions);
  }

  /** Nearest long/short liq + strongest cluster prices — adapted from ChartBoard liqData shape. */
  function applyLiqPriceLines() {
    priceLineMgr.setSeries(priceSeries as ISeriesApi<SeriesType> | null);
    if (!liqData) {
      priceLineMgr.clearLiqLines();
      return;
    }
    // Adapt ChartBoard's liqData (clusters[] with usd/liquidatedSide) to LiqData shape
    const clusters = [...(liqData.clusters ?? [])].sort((a, b) => b.usd - a.usd);
    const used = new Set<number>();
    for (const nl of [liqData.nearestLong, liqData.nearestShort]) {
      if (nl?.price != null) used.add(Math.round(nl.price * 100));
    }
    const strongestClusters = clusters
      .filter((c) => {
        const key = Math.round(c.price * 100);
        if (used.has(key)) return false;
        used.add(key);
        return true;
      })
      .slice(0, 4)
      .map((c) => ({
        price: c.price,
        side: c.liquidatedSide as 'long' | 'short',
        totalUsd: c.usd,
      }));
    priceLineMgr.applyLiqLines({
      nearestLong: liqData.nearestLong ?? undefined,
      nearestShort: liqData.nearestShort ?? undefined,
      strongestClusters,
    });
  }

  // ── Time scale sync ────────────────────────────────────────────────────────
  // Native multi-pane (lightweight-charts v5.1+) shares one time axis across
  // all panes automatically. We only need to subscribe once on mainChart for
  // capture-window updates and lazy-load triggers.
  function subscribeMainTimeScale() {
    if (!mainChart) return;
    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      refreshCaptureWindowSummary();
      if (range.from < LAZY_TRIGGER_BARS) void feed.loadMoreHistory();
    });
  }

  // ── Liq pane helpers (native multi-pane: update kept series in place) ─────

  type LiqBarRaw = { time: number; longUsd: number; shortUsd: number };

  function _initLiqPane(liqBars: LiqBarRaw[]) {
    if (indicatorSeriesRefs) refreshLiqPane(indicatorSeriesRefs, liqBars);
  }

  function _refreshLiqPane(liqBars: LiqBarRaw[]) {
    _initLiqPane(liqBars);
  }

  function destroyCharts() {
    // Tear down crosshair sync before removing the chart
    crosshairUnsub?.();
    crosshairUnsub = null;
    indicatorSeriesRefs = null;
    crosshairChips = null;

    priceLineMgr.clearAll();
    clearAIOverlay();
    priceLineMgr = new PriceLineManager();
    _alphaOverlay?.destroy();
    _alphaOverlay = null;
    detachDragHandlers();
    detachRangePrimitive();
    mainChart?.remove();
    mainChart = null;
    priceSeries = null;
    candleMarkerApi = null;
    candleSeriesForAnnotations = null;
    panePositions = { rsiOrMacd: -1, oi: -1, cvd: -1, funding: -1, liq: -1 };
    priceStretch = 4;
    activeResize = null;
  }

  function handleResize() {
    if (!containerEl) return;
    const w = Math.max(120, mainEl?.offsetWidth ?? containerEl.offsetWidth);
    // With native multi-pane the chart owns the full stack height. We give
    // it the full container minus a tiny safety margin.
    const h = Math.max(240, mainEl?.clientHeight ?? containerEl.clientHeight - 8);
    mainChart?.resize(w, h);
    refreshCaptureWindowSummary();
  }

  /** Current visible range on main chart → OHLCV + indicators slice for pattern persistence */
  function getViewportForSave(): ChartViewportSnapshot | null {
    const data = chartData;
    if (!data?.klines?.length || !mainChart) return null;
    const vr = mainChart.timeScale().getVisibleRange();
    let from: number;
    let to: number;
    if (vr) {
      from = chartTimeToUnixSeconds(vr.from);
      to = chartTimeToUnixSeconds(vr.to);
      if (!Number.isFinite(from) || !Number.isFinite(to)) {
        from = data.klines[0].time;
        to = data.klines[data.klines.length - 1].time;
      } else if (from > to) {
        const s = from;
        from = to;
        to = s;
      }
    } else {
      from = data.klines[0].time;
      to = data.klines[data.klines.length - 1].time;
    }
    return slicePayloadToViewport(data, from, to, liveTick.time ?? undefined);
  }

  function handleSaveSetup() {
    if ($chartSaveMode.active) {
      chartSaveMode.exitRangeMode();
    } else {
      chartSaveMode.enterRangeMode();
    }
  }

  function handleModalSaved(captureId: string) {
    showSaveModal = false;
    savedCaptureId = captureId;
    onCaptureSaved?.(captureId);
    onSaveSetup?.({ symbol, timestamp: liveTick.time ?? Math.floor(Date.now() / 1000), tf });
    setTimeout(() => { savedCaptureId = null; }, 4000);
  }

  function handleResearchSaved(captureId: string) {
    showResearchPanel = false;
    researchViewport = null;
    chartSaveMode.exitRangeMode();
    savedCaptureId = captureId;
    onCaptureSaved?.(captureId);
    onSaveSetup?.({ symbol, timestamp: liveTick.time ?? Math.floor(Date.now() / 1000), tf });
    setTimeout(() => { savedCaptureId = null; }, 4000);
  }

  function selectTf(t: string) {
    internalTf = t;
    onTfChange?.(t);
  }

  const STUDY_TO_INDICATOR: Record<StudyId, IndicatorKey> = {
    ema: 'ema',
    vwap: 'vwap',
    bb: 'bb',
    atr: 'atr_bands',
    macd: 'macd',
    cvd: 'cvd',
    overlay: 'derivativesOverlay',
    comparison: 'comparison',
  };

  function toggleStudy(id: StudyId) {
    const key = STUDY_TO_INDICATOR[id];
    if (key) toggleChartIndicator(key);
  }

  /** Hide a sub-pane indicator — fires from pane × buttons (W-0102 Slice 3). */
  function hidePane(key: IndicatorKey) {
    removeChartIndicator(key);
  }

  /** W-0399: Add indicator from IndicatorLibrary drawer. All Tier-A keys support multi-instance. */
  function handleAddIndicator(indicator: IndicatorDef) {
    if (indicator.tier === 'A' && indicator.engineKey) {
      const key = indicator.engineKey as IndicatorKey;
      const alreadyActive = $chartIndicators[key];
      if (alreadyActive) {
        // Already on → spawn a new instance pane instead of toggling off
        indicatorInstances.add(indicator.id, key);
        if (chartData) renderCharts(chartData);
        indicatorLibraryOpen = false;
        return;
      }
      toggleChartIndicator(key);
    }
    indicatorLibraryOpen = false;
  }

  /** W-0399: Remove a secondary indicator instance and re-render. */
  function removeInstance(instanceId: string) {
    indicatorInstances.remove(instanceId);
    if (chartData) renderCharts(chartData);
  }

  /** W-0399: Update params on a secondary indicator instance and re-render. */
  function updateInstance(instanceId: string, params: Record<string, number | string | boolean>) {
    indicatorInstances.updateParams(instanceId, params);
    if (chartData) renderCharts(chartData);
  }

  onMount(() => {
    const onWin = () => {
      viewportWidth = containerEl?.offsetWidth ?? window.innerWidth;
      handleResize();
    };
    window.addEventListener('resize', onWin);
    // Subscribe to save-mode store for range-mode click handling (W-0086)
    saveModeUnsubscribe = chartSaveMode.subscribe(handleSaveModeChange);
    // ESC exits range-mode without capturing pointer events
    window.addEventListener('keydown', handleRangeModeKeydown);
    // D key toggles drawing mode (W-0374)
    window.addEventListener('keydown', handleDrawingModeKeydown);
    // / key opens indicator library (W-0399)
    window.addEventListener('keydown', handleIndicatorLibraryKeydown);
    // Initial viewport width
    onWin();
    return () => {
      window.removeEventListener('resize', onWin);
    };
  });
  onDestroy(() => {
    saveModeUnsubscribe?.();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleRangeModeKeydown);
      window.removeEventListener('keydown', handleDrawingModeKeydown);
      window.removeEventListener('keydown', handleIndicatorLibraryKeydown);
    }
    disconnectWS();
    destroyCharts();
  });

  /** Main + sub-panes fill `chart-stack`; keep canvas size in sync when flex height changes. */
  $effect(() => {
    const el = chartStackEl;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      handleResize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  // Remote data should only reload when the market context changes.
  $effect(() => {
    void symbol;
    void tf;
    void emaTf;
    void initialData;
    void feed.loadData();
  });

  // WebSocket real-time candle feed — reconnects when symbol or tf changes.
  $effect(() => {
    const sym = symbol;
    const timeframe = tf;
    connectKlineWS(sym, timeframe);
    return () => disconnectWS();
  });

  // Depth/liquidation data comes from the parent terminal page to avoid duplicate requests.
  $effect(() => {
    depthData = depthSnapshot;
    liqData = liqSnapshot;
  });

  /** Re-stamp liq rails when snapshot arrives after candles render. */
  $effect(() => {
    void liqData;
    if (!priceSeries || loading || !chartData) return;
    void tick().then(() => {
      applyLiqPriceLines();
    });
  });

  // Indicator toggles should only re-render from cached data, not refetch it.
  $effect(() => {
    void showVWAP;
    void showBB;
    void showEMA;
    void showATRBands;
    void showCVD;
    void showMACD;
    void chartMode;
    void priceScaleMode;
    void cvdDivergence;
    void derivativesOnMain;
    void showComparison;
    void $comparisonStore.data;  // re-render when comparison data arrives
    const data = chartData;
    if (!data || loading) return;
    void tick().then(() => {
      renderCharts(data);
      refreshCaptureWindowSummary();
    });
  });

  // Update price lines when verdict changes (no reload)
  $effect(() => {
    void verdictLevels;
    updateLevels();
  });

  // W-0210 Layer 1: Re-apply alpha overlay when analysisData changes (no chart rebuild)
  $effect(() => {
    void analysisData;
    if (priceSeries && !loading) {
      syncAlphaOverlay();
    }
  });

  // W-0210 Layer 2: Apply whale liq price lines when data changes
  $effect(() => {
    void $whaleStore.positions;
    if (priceSeries && !loading) {
      applyWhalePriceLines();
    }
  });

  // W-0357: Apply AI analysis price lines (entry/stop) from AIPanel ANALYZE results.
  // Lines are cleared automatically when the symbol changes.
  $effect(() => {
    const state = $chartAIOverlay;
    if (!priceSeries) return;
    if (state.symbol === symbol && state.lines.length > 0) {
      priceLineMgr.setSeries(priceSeries as ISeriesApi<SeriesType> | null);
      priceLineMgr.setAILines(state.lines);
    } else {
      priceLineMgr.clearAILines();
    }
  });

  // W-0357: Clear AI overlay when symbol changes so stale lines don't persist.
  $effect(() => {
    void symbol;
    clearAIOverlay();
  });

  // D-9: AI overlay shapes
  interface AIBoxCoord { x: number; y: number; w: number; h: number; color: string; label?: string }
  let aiBoxCoords = $state<AIBoxCoord[]>([]);
  function recomputeAIShapes() {
    if (!mainChart || !priceSeries) { aiBoxCoords = []; return; }
    const ov = $chartAIOverlay;
    if (ov.symbol !== symbol) { aiBoxCoords = []; return; }
    const ts = mainChart.timeScale();
    aiBoxCoords = (ov.shapes.filter((s): s is AIRangeBox => s.kind === 'range')).flatMap(b => {
      const x1 = ts.timeToCoordinate(b.fromTime as UTCTimestamp), x2 = ts.timeToCoordinate(b.toTime as UTCTimestamp);
      const y1 = priceSeries!.priceToCoordinate(b.fromPrice), y2 = priceSeries!.priceToCoordinate(b.toPrice);
      if (x1 == null || x2 == null || y1 == null || y2 == null) return [];
      return [{ x: Math.min(x1,x2), y: Math.min(y1,y2), w: Math.abs(x2-x1), h: Math.abs(y2-y1), color: b.color, label: b.label }];
    });
    if (candleMarkerApi && ov.symbol === symbol) {
      const ann = ov.shapes.filter((s): s is AIAnnotation => s.kind === 'annotation')
        .map(s => ({ time: s.time as UTCTimestamp, position: 'aboveBar' as const, color: s.color, shape: 'circle' as const, text: s.text }));
      if (ann.length) candleMarkerApi.setMarkers([...ann]);
    }
  }
  $effect(() => {
    if (!mainChart) return;
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(recomputeAIShapes);
    return () => mainChart?.timeScale().unsubscribeVisibleLogicalRangeChange(recomputeAIShapes);
  });
  $effect(() => { void $chartAIOverlay; recomputeAIShapes(); });

  // W-0210 Layer 3: Fetch comparison data when comparison is toggled or TF changes
  const COMPARISON_SYMBOL = 'BTCUSDT';
  $effect(() => {
    void showComparison;
    void tf;
    if (showComparison && symbol !== COMPARISON_SYMBOL) {
      comparisonStore.setSymbol(COMPARISON_SYMBOL, tf);
    }
  });

</script>

<div
  class="chart-board"
  bind:this={containerEl}
  data-context={contextMode}
  data-deriv-overlay={derivativesOnMain ? '1' : '0'}
  data-surface={surfaceStyle}
>

  <!-- ── ChartToolbar (TF selector + export + drawing mode) ────── -->
  <ChartToolbar
    {tf}
    onTfChange={selectTf}
    drawingMode={$activeDrawingMode}
    onToggleDrawing={() => shellStore.setDrawingTool('trendLine')}
  />

  <!-- ── Toolbar (TradingView-style: symbol → interval strip → studies) ────── -->
  <ChartBoardHeader
    {chartMode}
    {priceScaleMode}
    mainChart={mainChart}
    quantRegime={quantRegime}
    {studySections}
    {activeIndicatorCount}
    {studyQuery}
    {showEMA}
    {emaTfOptions}
    {emaTf}
    {captureWindowLabel}
    {captureBarCount}
    {savedCaptureId}
    onChartModeChange={(mode) => { chartMode = mode; }}
    onPriceScaleModeChange={(mode) => { priceScaleMode = mode; }}
    onToggleStudy={(id) => toggleStudy(id)}
    onSaveSetup={handleSaveSetup}
    onEmaTfChange={(t) => { emaTf = t; }}
    drawingMode={drawingToolsVisible}
    onToggleDrawingMode={onToggleDrawingTools}
    {indicatorLibraryOpen}
    onToggleIndicatorLibrary={() => { indicatorLibraryOpen = !indicatorLibraryOpen; }}
  />

  <!-- ── Chart area ────────────────────────────────────────────────────────── -->
  {#if loading}
    <div class="chart-state">
      <span class="pulse"></span>
      <span class="state-text">Loading {symbol} {tf}…</span>
    </div>
  {:else if rateLimitRetryIn !== null}
    <div class="chart-state rate-limit">
      <span class="pulse rate-limit-pulse"></span>
      <span class="state-text">Throttled — retrying in {rateLimitRetryIn}s</span>
    </div>
  {:else if error}
    <div class="chart-state error">
      <span>! {error}</span>
      <button onclick={() => void feed.loadData()}>Retry</button>
    </div>
  {:else}
    <!-- W-0289: Drawing toolbar (left of chart) -->
    {#if $activeDrawingMode}
      <DrawingToolbar
        activeTool={drawingActiveTool}
        onSelectTool={(t) => {
          drawingActiveTool = t;
          drawingMgr?.setTool(t);
        }}
        onClearAll={() => drawingMgr?.clearAll()}
        onDeleteSelected={() => drawingMgr?.deleteSelected()}
      />
    {/if}

    <!-- W-0374 Phase D-4: IndicatorLibrary drawer -->
    {#if indicatorLibraryOpen}
      <IndicatorLibrary
        onAddIndicator={handleAddIndicator}
        onRemoveInstance={removeInstance}
        onUpdateInstance={updateInstance}
      />
    {/if}

    <div class="chart-stack" class:range-mode={$chartSaveMode.active} class:drawer-open={selectedCapture !== null} bind:this={chartStackEl}>
    <!-- Layer 2 overlay container — pointer-events: none; only chips/buttons inside use auto (W-0086) -->
    <div class="chart-layer2-overlay">
      <!-- D-9: AI range box overlay -->
      {#if aiBoxCoords.length > 0}
        <svg class="ai-range-overlay" aria-hidden="true">
          {#each aiBoxCoords as box}
            <rect x={box.x} y={box.y} width={box.w} height={box.h}
              fill={box.color} fill-opacity="0.10"
              stroke={box.color} stroke-width="1" stroke-opacity="0.45" />
            {#if box.label}
              <text x={box.x + 4} y={box.y + 11} fill={box.color} font-size="8" opacity="0.75">{box.label}</text>
            {/if}
          {/each}
        </svg>
      {/if}
      <div class="layer2-topright">
        <PhaseBadge phase={null} />
      </div>
    </div>
    <!-- W-0358: Floating note button (bottom-right of chart) -->
    <FloatingNoteButton
      {symbol}
      timeframe={tf}
      getCapturePrice={() => liveTick.price ?? 0}
      getLastClosedBarTime={getLastClosedBarTime}
    />
    <!--
      Native multi-pane: a single lightweight-charts instance owns the price
      pane plus N indicator panes (CVD / OI / Funding / Liq / RSI or MACD).
      All panes share crosshair + time axis natively (v5.1 pane API).
    -->
    <div class="pane-main multi-pane-host" bind:this={mainEl}
      style="--price-frac: {priceFracPct}%">
      <!-- W-0289: Drawing overlay canvas -->
      {#if $activeDrawingMode && drawingMgr}
        <DrawingCanvas mgr={drawingMgr} containerEl={mainEl} />
      {/if}

      <!-- W-0395 Phase 4: pane resize handles — 6px grab zone at each pane boundary -->
      {#each resizeBoundaries as boundary}
        <div
          class="pane-resizer"
          class:is-resizing={activeResize?.upperKind === boundary.upperKind}
          style="top: {boundary.top.toFixed(2)}%"
          role="presentation"
          aria-hidden="true"
          onmousedown={(e) => startPaneResize(e, boundary.upperKind)}
        ></div>
      {/each}

      <!--
        Per-pane info bars — TV × Santiment style chips. Positioned via
        inline `top` derived from actual stretch ratios so they stay
        aligned after user resize (pibTops always matches setStretchFactor).
      -->
      {#if chartData}
        {#if rsiOrMacdChips && panePositions.rsiOrMacd >= 0}
          <div class="pib-anchor" style="top: {(pibTops.rsiOrMacd ?? 0).toFixed(2)}%">
            <PaneInfoBar
              title={showMACD ? 'MACD' : 'RSI'}
              sublabel={tf}
              chips={crosshairChips?.rsiOrMacd ?? rsiOrMacdChips}
              closable
              onClose={() => removeChartIndicator(showMACD ? 'macd' : 'rsi')}
            />
          </div>
        {/if}
        {#if oiChips && panePositions.oi >= 0}
          <div class="pib-anchor" style="top: {(pibTops.oi ?? 0).toFixed(2)}%">
            <PaneInfoBar
              title="OI Δ"
              sublabel={tf}
              chips={crosshairChips?.oi ?? oiChips.chips}
              closable
              onClose={() => removeChartIndicator('oi')}
            />
          </div>
        {/if}
        {#if cvdChips && panePositions.cvd >= 0}
          <div class="pib-anchor" style="top: {(pibTops.cvd ?? 0).toFixed(2)}%">
            <PaneInfoBar
              title="CVD"
              sublabel={tf}
              chips={crosshairChips?.cvd ?? cvdChips.chips}
              closable
              onClose={() => removeChartIndicator('cvd')}
            />
          </div>
        {/if}
        {#if fundingChips && panePositions.funding >= 0}
          <div class="pib-anchor" style="top: {(pibTops.funding ?? 0).toFixed(2)}%">
            <PaneInfoBar
              title="Funding"
              sublabel={tf}
              chips={crosshairChips?.funding ?? fundingChips.chips}
              closable
              onClose={() => removeChartIndicator('funding')}
            />
          </div>
        {/if}
        {#if liqChips && panePositions.liq >= 0}
          <div class="pib-anchor" style="top: {(pibTops.liq ?? 0).toFixed(2)}%">
            <PaneInfoBar
              title="Liquidations"
              sublabel={tf}
              chips={crosshairChips?.liq ?? liqChips.chips}
              closable
              onClose={() => removeChartIndicator('liq')}
            />
          </div>
        {/if}
      {/if}
    </div>
    </div>
    <SaveStrip
      {symbol}
      {tf}
      ohlcvBars={chartData?.klines ?? []}
      onSaved={(id) => { onCaptureSaved?.(id); }}
    />
    {#if contextMode === 'full'}
    <KpiStrip bundle={kpiBundle} />
    <details class="tv-context-strip" bind:open={contextStripOpen}>
      <summary class="tv-context-summary">
        <div class="tv-context-inline">
          {#each contextSummaryItems as item}
            <span class="tv-context-pill" data-tone={item.tone ?? 'neutral'}>
              <em>{item.label}</em>
              <strong>{item.value}</strong>
            </span>
          {/each}
        </div>
        <span class="tv-context-toggle">{contextStripOpen ? 'Hide depth' : 'Depth / liq'}</span>
      </summary>
      <div class="tv-context-body">
    <div class="micro-bars" aria-label="Order book and liquidation snapshot">
      <div class="depth-strip">
        <div class="strip-head">
          <span>Book imbalance</span>
          <small>
            Spread {depthData?.spreadBps != null ? `${depthData.spreadBps.toFixed(1)} bps` : 'est.'}
            {' · '}
            Mid {liveTick.price ? liveTick.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
          </small>
        </div>
        <div class="depth-bar">
          <div class="depth-bid" style={`width:${bidPct}%`}>
            <span>BID {bidPct}%</span>
          </div>
          <div class="depth-ask" style={`width:${askPct}%`}>
            <span>ASK {askPct}%</span>
          </div>
        </div>
      </div>
      <div class="liq-strip">
        <div class="strip-head">
          <span>Liq clusters</span>
          <small>{liqLong ? liqLong.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'} — {liqShort ? liqShort.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}</small>
        </div>
        <div class="liq-track">
          {#if liqData?.clusters?.length}
            {#each liqData.clusters.slice(0, 3) as cluster, index}
              <span
                class={`liq-zone ${cluster.liquidatedSide === 'long' ? 'long' : 'short'} ${index === 1 ? 'warn' : ''}`}
                style={`left:${12 + index * 24}%;width:${Math.max(12, Math.min(22, cluster.usd / 25000))}%`}
              ></span>
            {/each}
          {:else}
            <span class="liq-zone long" style="left:12%;width:14%"></span>
            <span class="liq-zone warn" style="left:37%;width:18%"></span>
            <span class="liq-zone short" style="left:68%;width:16%"></span>
          {/if}
          <span class="liq-now" style="left:52%"></span>
        </div>
        <div class="liq-labels">
          <small class="liq-l">Long liq {liqData?.nearestLong?.usd != null ? `${(liqData.nearestLong.usd / 1000).toFixed(1)}k @ ` : ''}{liqLong ? liqLong.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}</small>
          <small class="liq-c">Now {liveTick.price ? liveTick.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}</small>
          <small class="liq-s">Short liq {liqData?.nearestShort?.usd != null ? `${(liqData.nearestShort.usd / 1000).toFixed(1)}k @ ` : ''}{liqShort ? liqShort.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}</small>
        </div>
      </div>
    </div>
      </div>
    </details>
    {/if}
  {/if}

</div>

<!-- Research Panel (W-0200): range select → auto-analyze → find similar → save -->
<ResearchPanel
  {symbol}
  {tf}
  open={showResearchPanel}
  viewport={researchViewport}
  onClose={() => {
    showResearchPanel = false;
    researchViewport = null;
    chartSaveMode.exitRangeMode();
  }}
  onSaved={handleResearchSaved}
/>

<!-- Save Setup Modal (mobile / legacy path) -->
<SaveSetupModal
  symbol={symbol}
  timestamp={liveTick.time ?? Math.floor(Date.now() / 1000)}
  tf={tf}
  open={showSaveModal && !showResearchPanel}
  getViewportCapture={getViewportForSave}
  onClose={() => {
    showSaveModal = false;
  }}
  onSaved={handleModalSaved}
/>

<IndicatorCatalogModal
  open={catalogModalOpen}
  onClose={() => { catalogModalOpen = false; }}
/>

<!-- Layer 3: Capture annotation overlay (W-0120) -->
<CaptureAnnotationLayer
  series={candleSeriesForAnnotations}
  {symbol}
  timeframe={tf}
  onAnnotationsChange={(anns) => { _annotationsCache = anns; }}
/>
{#if !onCaptureSelect}
  <CaptureReviewDrawer
    annotation={selectedCapture}
    onClose={() => { selectedCapture = null; }}
    onVerdict={(id, verdict) => { selectedCapture = null; }}
  />
{/if}

<!-- Toast: saved confirmation -->
{#if savedCaptureId}
  <div class="save-toast">
    ✓ Capture saved — <a href={`/lab?captureId=${encodeURIComponent(savedCaptureId)}&autorun=1`} class="toast-link">Find this →</a>
  </div>
{/if}

<style>
  .chart-layer2-overlay { position: absolute; top: 0; left: 0; right: 0; z-index: 15; pointer-events: none; }
  .ai-range-overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
  .layer2-topright { position: absolute; top: 8px; right: 10px; display: flex; align-items: center; gap: 6px; pointer-events: none; }

  .chart-board {
    display: flex;
    flex-direction: column;
    background: #131722;
    border: 1px solid rgba(19, 23, 34, 0.98);
    border-radius: 2px;
    overflow: visible;
    min-height: 420px;
    height: 100%;
    position: relative;
    z-index: 1;
  }

  @media (max-width: 768px) {
    .chart-board { min-height: 0; border-radius: 0; border: none; }
  }

  /* ── TF scroll (ChartToolbar) ── */
  .tf-scroll {
    display: flex;
    flex-wrap: nowrap;
    gap: 2px;
    flex: 0 1 auto;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 2px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
  }
  .tf-scroll::-webkit-scrollbar {
    height: 4px;
  }
  .tf-scroll::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 2px;
  }
  .tv-context-strip {
    border-top: 1px solid rgba(42, 46, 57, 0.85);
    background: rgba(7, 11, 18, 0.92);
    flex-shrink: 0;
  }
  .tv-context-summary {
    list-style: none;
    cursor: pointer;
    padding: 4px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    user-select: none;
  }
  .tv-context-summary::-webkit-details-marker {
    display: none;
  }
  .tv-context-summary::before {
    content: none;
  }
  .tv-context-inline {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tv-context-inline::-webkit-scrollbar {
    display: none;
  }
  .tv-context-pill {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 0;
    font-family: var(--sc-font-mono, monospace);
    border-bottom: 1px solid transparent;
  }
  .tv-context-pill em {
    font-style: normal;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(177, 181, 189, 0.46);
  }
  .tv-context-pill strong {
    font-size: var(--ui-text-xs);
    font-weight: 600;
    color: rgba(239, 242, 247, 0.88);
  }
  .tv-context-pill[data-tone='bull'] strong {
    color: #8fdd9d;
  }
  .tv-context-pill[data-tone='bear'] strong {
    color: #f19999;
  }
  .tv-context-pill[data-tone='warn'] strong {
    color: #e9c167;
  }
  .tv-context-toggle {
    flex-shrink: 0;
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(177, 181, 189, 0.52);
  }
  .tv-context-body {
    padding: 0 8px 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* ── States ── */
  .chart-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: rgba(255,255,255,0.3);
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    min-height: 400px;
  }
  .chart-state.error { flex-direction: column; gap: 8px; }
  .chart-state.rate-limit { color: rgba(251,191,36,0.55); }
  .rate-limit-pulse { background: rgba(251,191,36,0.5) !important; }
  .chart-state button {
    padding: 3px 8px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.4);
    border-radius: 3px;
    cursor: pointer;
    font-size: var(--ui-text-xs);
  }
  .pulse {
    width: 5px; height: 5px; border-radius: 50%;
    background: rgba(255,255,255,0.3);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100%{opacity:.25} 50%{opacity:1} }
  .state-text { font-size: var(--ui-text-xs); }

  /* ── Panes (main chart flexes; sub-panes fixed — matches lightweight-charts) ── */
  .chart-stack {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* Layer 2 overlay anchors to this container */
    position: relative;
  }
  /* Shift chart right when capture review drawer is open (desktop only) */
  @media (min-width: 768px) {
    .chart-stack.drawer-open {
      padding-right: 304px;
      transition: padding-right 240ms ease-out;
    }
  }
  .chart-stack.range-mode,
  .chart-stack.range-mode * {
    cursor: crosshair !important;
  }
  .pane-main {
    flex: 1 1 58%;
    min-height: 260px;
    height: auto;
    position: relative; /* host for PaneInfoBar overlays */
  }
  .pane-main.multi-pane-host {
    flex: 1 1 100%;
    min-height: 480px;
  }
  /* PaneInfoBar: top is set via inline style from pibTops (stretch-aware). */
  .pib-anchor {
    position: absolute;
    left: 0;
    right: 0;
    pointer-events: none;
    top: var(--price-frac, 50%); /* fallback only — overridden by inline style */
  }
  /* W-0395 Phase 4: pane resize handles */
  .pane-resizer {
    position: absolute;
    left: 0;
    right: 0;
    height: 6px;
    transform: translateY(-3px);
    cursor: row-resize;
    z-index: 6;
    background: transparent;
  }
  .pane-resizer::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 1px;
    transform: translateY(-50%);
    background: rgba(255,255,255,0.08);
    transition: background 0.12s;
  }
  .pane-resizer:hover::after,
  .pane-resizer.is-resizing::after {
    background: rgba(99,179,237,0.55);
    height: 2px;
  }
  .chart-board[data-deriv-overlay='1'] .pane-main {
    min-height: 300px;
  }
  .chart-board[data-context='chart'] .pane-main {
    min-height: min(48vh, 560px);
  }
  .pane-vol  { flex-shrink: 0; height: 60px; min-height: 60px; }
  .pane-sub  { flex-shrink: 0; height: 80px; min-height: 80px; }
  .pane-funding { flex-shrink: 0; height: 92px; min-height: 92px; }
  .pane-oi   { flex-shrink: 0; height: 72px; min-height: 72px; }
  .pane-cvd  { flex-shrink: 0; height: 84px; min-height: 84px; }
  .chart-board[data-surface='velo'] .pane-main {
    flex-basis: 54%;
    min-height: min(42vh, 520px);
  }
  .chart-board[data-surface='velo'] .pane-vol {
    height: 52px;
    min-height: 52px;
  }
  .chart-board[data-surface='velo'] .pane-funding {
    height: 92px;
    min-height: 92px;
  }
  .chart-board[data-surface='velo'] .pane-liq {
    height: 104px;
    min-height: 104px;
  }
  .chart-board[data-surface='velo'] .pane-oi {
    height: 118px;
    min-height: 118px;
  }
  .chart-board[data-surface='velo'] :global(.indicator-pane-stack) {
    gap: 0;
    background: #0f131d;
    border-top-color: rgba(255,255,255,0.09);
  }
  .velo-chart-caption {
    position: absolute;
    top: 10px;
    left: 12px;
    z-index: 8;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 2px 4px;
    border-radius: 4px;
    background: rgba(19,23,34,0.42);
    backdrop-filter: blur(2px);
    pointer-events: none;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    line-height: 1.2;
    color: rgba(239,242,247,0.86);
  }
  .volume-profile-overlay {
    position: absolute;
    top: 9%;
    right: 0;
    bottom: 8%;
    z-index: 7;
    width: min(28%, 320px);
    display: grid;
    grid-template-rows: repeat(22, minmax(0, 1fr));
    gap: 1px;
    padding-right: 4px;
    pointer-events: none;
    mix-blend-mode: screen;
  }
  .vp-row {
    min-height: 3px;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0;
  }
  .vp-bid,
  .vp-ask {
    height: 100%;
    max-height: 16px;
  }
  .vp-bid {
    background: linear-gradient(90deg, rgba(232,184,106,0.12), rgba(232,184,106,0.72));
  }
  .vp-ask {
    background: linear-gradient(90deg, rgba(80,178,232,0.72), rgba(80,178,232,0.20));
  }
  .save-toast {
    position: fixed;
    bottom: calc(var(--sc-consent-reserved-h, 0px) + 20px);
    left: 50%;
    transform: translateX(-50%);
    background: #0f0f0f;
    border: 1px solid rgba(38,166,154,0.5);
    color: #26a69a;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    padding: 8px 16px;
    border-radius: 6px;
    z-index: 2000;
    white-space: nowrap;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    animation: toast-in 0.2s ease;
  }

  .toast-link { color: #63b3ed; text-decoration: underline; }
  @keyframes toast-in { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

  /* Bloomberg-style pane header — 10px mono, tight 4/8px rhythm. */
  .pane-label {
    flex-shrink: 0;
    padding: 2px 8px;
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(177, 181, 189, 0.58);
    background: rgba(19, 23, 34, 0.66);
    border-top: 1px solid rgba(42, 46, 57, 0.55);
    letter-spacing: 0.06em;
    line-height: 1.4;
  }
  .pane-label-split {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
  }
  .pane-hint {
    font-size: var(--ui-text-xs);
    font-weight: 500;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.38);
  }
  .pane-hint-gold {
    color: rgba(251, 191, 36, 0.72);
  }
  .pane-close {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 0;
    background: transparent;
    color: rgba(177, 181, 189, 0.42);
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    border-radius: 2px;
    font-family: inherit;
    transition: color 80ms ease, background 80ms ease;
  }
  .pane-close:hover {
    color: rgba(239, 68, 68, 0.86);
    background: rgba(239, 68, 68, 0.08);
  }
  .pane-close:focus-visible {
    outline: 1px solid rgba(94, 234, 212, 0.5);
    outline-offset: 1px;
  }

  .pane-hint-mint {
    color: rgba(94, 234, 212, 0.72);
  }

  .micro-bars {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 2px 4px 4px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    background: transparent;
  }
  .depth-strip,
  .liq-strip {
    display: grid;
    gap: 3px;
    padding: 3px 4px;
    border: none;
    border-radius: 0;
    background: transparent;
  }
  .strip-head {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    min-width: 0;
  }
  .strip-head span,
  .strip-head small,
  .depth-bid span,
  .depth-ask span,
  .liq-labels small {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
  }
  .strip-head span {
    color: rgba(247,242,234,0.6);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .strip-head small {
    color: rgba(247,242,234,0.3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .depth-bar {
    display: flex;
    height: 12px;
    border-radius: 2px;
    overflow: hidden;
    background: rgba(255,255,255,0.04);
  }
  .depth-bid,
  .depth-ask {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .depth-bid {
    justify-content: flex-start;
    background: linear-gradient(90deg, rgba(52,196,112,0.35), rgba(52,196,112,0.7));
  }
  .depth-ask {
    justify-content: flex-end;
    background: linear-gradient(90deg, rgba(232,85,85,0.72), rgba(232,85,85,0.35));
  }
  .depth-bid span,
  .depth-ask span {
    color: rgba(255,255,255,0.74);
    padding: 0 5px;
    white-space: nowrap;
  }
  .liq-track {
    position: relative;
    height: 10px;
    border-radius: 2px;
    background: rgba(255,255,255,0.04);
    overflow: hidden;
  }
  .liq-zone {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 1px;
  }
  .liq-zone.long { background: rgba(232,85,85,0.8); }
  .liq-zone.warn { background: rgba(212,135,10,0.75); }
  .liq-zone.short { background: rgba(52,196,112,0.75); }
  .liq-now {
    position: absolute;
    top: -1px;
    bottom: -1px;
    width: 1px;
    background: rgba(247,242,234,0.85);
  }
  .liq-labels {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .liq-l { color: rgba(241,153,153,0.85); }
  .liq-c { color: rgba(247,242,234,0.68); }
  .liq-s { color: rgba(143,221,157,0.85); }

  @media (max-width: 1200px) {
    .micro-bars { grid-template-columns: 1fr; }
  }

  @media (max-width: 768px) {
    .chart-header--tv {
      padding: 8px 10px 10px;
    }
    .tv-row--top {
      align-items: flex-start;
    }
    .tv-row--capture {
      align-items: flex-start;
    }
    .capture-window {
      flex-basis: 100%;
    }
    .capture-actions {
      width: auto;
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      margin-left: auto;
    }
    .capture-save-btn {
      width: auto;
      min-height: 34px;
      font-size: 11px;
      background: rgba(38, 166, 154, 0.22);
    }
    .capture-open-btn {
      width: auto;
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
    }
    /* Mobile indicator pane adjustments (W-0114 Phase A) */
    .pane-label {
      font-size: var(--ui-text-xs);
      margin-bottom: 3px;
    }
    .pane-vol {
      min-height: 48px;
    }
    .pane-sub {
      min-height: 64px;
    }
    .pane-oi {
      min-height: 56px;
    }
    .pane-cvd {
      min-height: 64px;
    }
  }

  @media (max-width: 425px) {
    .pane-label { font-size: var(--ui-text-xs); margin-bottom: 2px; }
  }
</style>
