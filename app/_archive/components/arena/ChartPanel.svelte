<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { gameState } from '$lib/stores/gameState';
  import {
    fetch24hr,
    fetchKlines,
    pairToSymbol,
    subscribeKlines,
    subscribeMiniTicker,
    type BinanceKline
  } from '$lib/api/binance';
  import { updatePrice } from '$lib/stores/priceStore';
  import {
    CORE_TIMEFRAME_OPTIONS,
    normalizeTimeframe,
    toBinanceInterval,
    toTradingViewInterval,
  } from '$lib/utils/timeframe';
  import { openQuickTrade, type TradeDirection } from '$lib/stores/quickTradeStore';
  import {
    detectChartPatterns,
    type ChartPatternDetection,
  } from '$lib/engine/patternDetector';
  import TokenDropdown from '../shared/TokenDropdown.svelte';
  import {
    type ChartTheme,
    FALLBACK_THEME,
    readCssVar,
    toRgbTuple,
    withAlpha,
    toTvHex,
    resolveChartTheme,
  } from './ChartTheme';
  import {
    getNextPositionWheelPrice,
    resolvePositionInteractionTarget,
  } from './chart/chartPositionInteraction';
  import { bindChartRuntimeInteractions } from './chart/chartRuntimeBindings';

  const dispatch = createEventDispatcher<{
    scanrequest: { source: 'chart-bar'; pair: string; timeframe: string };
    chatrequest: { source: 'chart-bar'; pair: string; timeframe: string };
    priceUpdate: { price: number };
    dragTP: { price: number };
    dragSL: { price: number };
    dragEntry: { price: number };
    clearTradeSetup: void;
  }>();

  let chartContainer: HTMLDivElement;
  let chart: any;
  let lwcModule: any = null;
  let series: any;
  let volumeSeries: any;
  let cleanup: (() => void) | null = null;
  let wsCleanup: (() => void) | null = null;
  let priceWsCleanup: (() => void) | null = null;

  // ═══ Indicator Series ═══
  let ma7Series: any;
  let ma20Series: any;
  let ma25Series: any;
  let ma60Series: any;
  let ma99Series: any;
  let ma120Series: any;
  let rsiSeries: any;
  let volumePaneIndex: number | null = null;
  let rsiPaneIndex: number | null = null;
  let klineCache: BinanceKline[] = [];
  let _isLoadingMore = false;
  let _noMoreHistory = false; // true when Binance returns 0 older candles
  let _currentSymbol = '';
  let _currentInterval = '';

  // ═══ Incremental indicator state (avoid full recompute on each WS tick) ═══
  let _rsiAvgGain = 0;
  let _rsiAvgLoss = 0;

  // ═══ Cached MA values for template display ═══
  let ma7Val = 0;
  let ma20Val = 0;
  let ma25Val = 0;
  let ma60Val = 0;
  let ma99Val = 0;
  let ma120Val = 0;
  let rsiVal = 0;
  let latestVolume = 0;

  // ═══ Chart Mode ═══
  let chartMode: 'agent' | 'trading' = 'agent';
  let tvWidget: any = null;
  let tvContainer: HTMLDivElement;
  let tvScriptLoaded = false;
  let tvLoading = false;
  let tvError = '';
  let tvSafeMode = false;
  let _tvFallbackTried = false;
  let _tvLoadTimer: ReturnType<typeof setTimeout> | null = null;
  let _tvReinitKey = '';

  // ═══ Drawing Tools ═══
  const LINE_ENTRY_DEFAULT_RR = 2;
  const LINE_ENTRY_MIN_PIXEL_RISK = 6;
  type DrawingMode = 'none' | 'hline' | 'trendline' | 'longentry' | 'shortentry' | 'trade';
  type DrawingAnchorPoint = { time: number; price: number };
  type DrawingItem =
    | { type: 'hline'; points: Array<{ x: number; y: number }>; price?: number; color: string }
    | { type: 'trendline'; points: Array<{ x: number; y: number }>; anchors?: [DrawingAnchorPoint, DrawingAnchorPoint]; color: string }
    | {
      type: 'tradebox';
      points: Array<{ x: number; y: number }>; // [entry-left, entry-right, sl-left, tp-left]
      fromTime?: number;
      toTime?: number;
      color: string;
      dir: 'LONG' | 'SHORT';
      entry: number;
      sl: number;
      tp: number;
      rr: number;
      riskPct: number;
    };
  let drawingCanvas: HTMLCanvasElement;
  let drawingMode: DrawingMode = 'none';
  let drawings: DrawingItem[] = [];
  let currentDrawing: { type: 'trendline'; points: Array<{ x: number; y: number }> } | null = null;
  let tradePreview: { mode: 'longentry' | 'shortentry' | 'trade'; startX: number; startY: number; cursorX: number; cursorY: number } | null = null;
  type TradePlanDraft = {
    pair: string;
    previewDir: 'LONG' | 'SHORT';
    entry: number;
    sl: number;
    tp: number;
    rr: number;
    riskPct: number;
    longRatio: number;
  };
  let pendingTradePlan: TradePlanDraft | null = null;
  let ratioTrackEl: HTMLButtonElement | null = null;
  let _ratioDragPointerId: number | null = null;
  let _ratioDragBound = false;
  let isDrawing = false;
  let drawingsVisible = true;
  let _agentCloseBtn: { x: number; y: number; r: number } | null = null; // ✕ button hit area
  let chartNotice = '';
  let _chartNoticeTimer: ReturnType<typeof setTimeout> | null = null;

  // Position lines
  let tpLine: any = null;
  let entryLine: any = null;
  let slLine: any = null;

  export let posEntry: number | null = null;
  export let posTp: number | null = null;
  export let posSl: number | null = null;
  export let posDir: string = 'LONG';
  export let showPosition = false;
  export let advancedMode = false;
  export let enableTradeLineEntry = false;
  export let uiPreset: 'default' | 'tradingview' = 'default';
  export let requireTradeConfirm = false;
  export let chatFirstMode = false;
  export let chatTradeReady = false;
  export let chatTradeDir: 'LONG' | 'SHORT' = 'LONG';
  export let hasScanned = false; // true after first scan completes

  // ═══ Agent Trade Overlay (TradingView-style TP/SL zones) ═══
  type AgentTradeSetup = {
    source: 'consensus' | 'agent';
    agentName?: string;
    dir: 'LONG' | 'SHORT';
    entry: number;
    tp: number;
    sl: number;
    rr: number;
    conf: number;
    pair: string;
  };
  export let activeTradeSetup: AgentTradeSetup | null = null;
  let agentPriceLines: { tp: any; entry: any; sl: any } = { tp: null, entry: null, sl: null };

  type ChartMarker = {
    time: number; position: 'aboveBar' | 'belowBar'; color: string;
    shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown'; text: string;
  };
  type PatternScanScope = 'visible' | 'full';
  type PatternScanResult = {
    ok: boolean;
    scope: PatternScanScope;
    candleCount: number;
    patternCount: number;
    patterns: Array<{
      kind: ChartPatternDetection['kind'];
      shortName: string;
      direction: ChartPatternDetection['direction'];
      status: ChartPatternDetection['status'];
      confidence: number;
      startTime: number;
      endTime: number;
    }>;
    message: string;
  };
  const MIN_PATTERN_CANDLES = 30;
  export let agentMarkers: ChartMarker[] = [];
  let patternMarkers: ChartMarker[] = [];
  let detectedPatterns: ChartPatternDetection[] = [];
  let overlayPatterns: ChartPatternDetection[] = [];
  let patternLineSeries: any[] = [];
  const MAX_OVERLAY_PATTERNS = 1;
  const ENABLE_PATTERN_LINE_SERIES = false;
  let _patternSignature = '';
  let _patternRangeScanTimer: ReturnType<typeof setTimeout> | null = null;

  export let agentAnnotations: Array<{
    id: string; icon: string; name: string; color: string; label: string;
    detail: string; yPercent: number; xPercent: number;
    type: 'ob' | 'funding' | 'whale' | 'signal';
  }> = [];

  let selectedAnnotation: typeof agentAnnotations[0] | null = null;

  let state = $gameState;
  $: state = $gameState;
  $: symbol = pairToSymbol(state.pair);
  $: interval = toBinanceInterval(state.timeframe);
  $: pairBaseLabel = (state.pair?.split('/')?.[0] || 'BTC').toUpperCase();
  $: pairQuoteLabel = (state.pair?.split('/')?.[1] || 'USDT').toUpperCase();

  type IndicatorKey = 'ma20' | 'ma60' | 'ma120' | 'ma7' | 'ma25' | 'ma99' | 'rsi' | 'vol';
  let indicatorEnabled: Record<IndicatorKey, boolean> = {
    ma20: true,
    ma60: true,
    ma120: true,
    ma7: true,
    ma25: true,
    ma99: true,
    rsi: true,
    vol: true,
  };
  let chartVisualMode: 'focus' | 'full' = 'focus';
  let showIndicatorLegend = true;
  let indicatorStripState: 'expanded' | 'collapsed' | 'hidden' = 'collapsed';
  $: isTvLikePreset = uiPreset === 'tradingview';
  let _indicatorProfileApplied: string | null = null;
  const BAR_SPACING_MIN = 5;
  const BAR_SPACING_MAX = 28;
  const BAR_SPACING_STEP = 1.5;
  const BAR_SPACING_DEFAULT = 14;
  let barSpacing = BAR_SPACING_DEFAULT;
  let autoScaleY = true;

  function isCompactViewport(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  }

  let chartTheme: ChartTheme = FALLBACK_THEME;

  function pushChartNotice(msg: string) {
    chartNotice = msg;
    if (_chartNoticeTimer) clearTimeout(_chartNoticeTimer);
    _chartNoticeTimer = setTimeout(() => {
      chartNotice = '';
      _chartNoticeTimer = null;
    }, 2800);
  }

  function formatPrice(v: number) {
    if (!Number.isFinite(v)) return '—';
    return v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 2 : 4 });
  }

  function formatCompact(v: number) {
    if (!Number.isFinite(v)) return '—';
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
    return v.toFixed(2);
  }

  function toChartPrice(y: number): number | null {
    if (!series) return null;
    try { return series.coordinateToPrice(y); } catch { return null; }
  }

  function toChartY(price: number): number | null {
    if (!series) return null;
    try { return series.priceToCoordinate(price); } catch { return null; }
  }

  function normalizeChartTime(rawTime: unknown): number | null {
    if (typeof rawTime === 'number' && Number.isFinite(rawTime)) return rawTime;
    if (rawTime && typeof rawTime === 'object') {
      const maybeTimestamp = (rawTime as { timestamp?: unknown }).timestamp;
      if (typeof maybeTimestamp === 'number' && Number.isFinite(maybeTimestamp)) return maybeTimestamp;
      const maybeDay = rawTime as { year?: unknown; month?: unknown; day?: unknown };
      if (
        typeof maybeDay.year === 'number'
        && typeof maybeDay.month === 'number'
        && typeof maybeDay.day === 'number'
      ) {
        return Math.floor(Date.UTC(maybeDay.year, maybeDay.month - 1, maybeDay.day) / 1000);
      }
    }
    return null;
  }

  function toChartTime(x: number): number | null {
    if (!chart || !drawingCanvas || !Number.isFinite(x)) return null;
    try {
      const clampedX = Math.max(0, Math.min(x, drawingCanvas.width));
      const rawTime = chart.timeScale().coordinateToTime(clampedX as any);
      const parsedTime = normalizeChartTime(rawTime);
      if (parsedTime !== null) return parsedTime;
    } catch {}

    try {
      const logical = chart.timeScale().coordinateToLogical(x as any);
      if (logical !== null && Number.isFinite(logical) && klineCache.length > 0) {
        const idx = Math.max(0, Math.min(klineCache.length - 1, Math.round(logical)));
        const time = klineCache[idx]?.time;
        if (Number.isFinite(time)) return time;
      }
    } catch {}
    return null;
  }

  function toChartX(time: number): number | null {
    if (!chart || !Number.isFinite(time)) return null;
    try {
      const x = chart.timeScale().timeToCoordinate(time as any);
      if (Number.isFinite(x)) return x;
    } catch {}
    return null;
  }

  function toDrawingAnchor(x: number, y: number): DrawingAnchorPoint | null {
    const time = toChartTime(x);
    const price = toChartPrice(y);
    if (time === null || price === null || !Number.isFinite(price)) return null;
    return { time, price: clampRoundPrice(price) };
  }

  function clampRoundPrice(v: number) {
    if (!Number.isFinite(v)) return v;
    const abs = Math.abs(v);
    if (abs >= 1000) return Math.round(v);
    if (abs >= 100) return Number(v.toFixed(2));
    return Number(v.toFixed(4));
  }

  function openTradeByLine(dir: 'LONG' | 'SHORT', entry: number, stopHint: number, rr = LINE_ENTRY_DEFAULT_RR) {
    const pair = state.pair || 'BTC/USDT';
    const entryPx = clampRoundPrice(entry);
    let sl = clampRoundPrice(stopHint);
    if (dir === 'LONG' && sl >= entryPx) sl = clampRoundPrice(entryPx * 0.995);
    if (dir === 'SHORT' && sl <= entryPx) sl = clampRoundPrice(entryPx * 1.005);
    const risk = Math.abs(entryPx - sl);
    if (!Number.isFinite(risk) || risk <= 0) {
      pushChartNotice('라인 기준 가격 계산 실패');
      return;
    }
    const tp = clampRoundPrice(dir === 'LONG' ? entryPx + risk * rr : entryPx - risk * rr);
    openQuickTrade(pair, dir, entryPx, tp, sl, 'chart-line', `${dir} line-entry`);
    gtmEvent('terminal_line_entry_open', { pair, dir, entry: entryPx, tp, sl, rr });
    pushChartNotice(`${dir} 진입 생성 · ENTRY ${formatPrice(entryPx)} · TP ${formatPrice(tp)} · SL ${formatPrice(sl)} · RR 1:${rr.toFixed(1)}`);
  }

  function clampRatio(v: number): number {
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  function setTradePlanRatio(nextLongRatio: number) {
    if (!pendingTradePlan) return;
    const longRatio = clampRatio(nextLongRatio);
    if (pendingTradePlan.longRatio === longRatio) return;
    pendingTradePlan = { ...pendingTradePlan, longRatio };
  }

  function getPlannedTradeOrder(plan: TradePlanDraft) {
    const dir: 'LONG' | 'SHORT' = plan.longRatio >= 50 ? 'LONG' : 'SHORT';
    const rr = Number.isFinite(plan.rr) && plan.rr > 0 ? plan.rr : LINE_ENTRY_DEFAULT_RR;
    const risk = Math.max(Math.abs(plan.entry - plan.sl), Math.max(0.0001, Math.abs(plan.entry) * 0.001));
    const sl = clampRoundPrice(dir === 'LONG' ? plan.entry - risk : plan.entry + risk);
    const tp = clampRoundPrice(dir === 'LONG' ? plan.entry + risk * rr : plan.entry - risk * rr);
    return {
      pair: plan.pair,
      dir,
      entry: clampRoundPrice(plan.entry),
      sl,
      tp,
      rr,
      riskPct: (risk / Math.max(Math.abs(plan.entry), 1)) * 100,
      longRatio: plan.longRatio,
      shortRatio: 100 - plan.longRatio,
    };
  }

  function openTradeFromPlan() {
    if (!pendingTradePlan) return;
    const planned = getPlannedTradeOrder(pendingTradePlan);
    openQuickTrade(
      planned.pair,
      planned.dir,
      planned.entry,
      planned.tp,
      planned.sl,
      'chart-plan',
      `ratio L${planned.longRatio}:S${planned.shortRatio}`
    );
    gtmEvent('terminal_chart_plan_open', {
      pair: planned.pair,
      dir: planned.dir,
      entry: planned.entry,
      tp: planned.tp,
      sl: planned.sl,
      rr: planned.rr,
      longRatio: planned.longRatio,
      shortRatio: planned.shortRatio,
    });
    pushChartNotice(
      `OPEN ${planned.dir} · ${planned.longRatio}:${planned.shortRatio} · ENTRY ${formatPrice(planned.entry)}`
    );
    pendingTradePlan = null;
  }

  function cancelTradePlan() {
    pendingTradePlan = null;
    pushChartNotice('Trade cancelled');
  }

  function ratioFromClientX(clientX: number): number | null {
    if (!ratioTrackEl) return null;
    const rect = ratioTrackEl.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || rect.width <= 0) return null;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    return clampRatio(pct);
  }

  function onRatioPointerMove(e: PointerEvent) {
    if (_ratioDragPointerId === null || e.pointerId !== _ratioDragPointerId) return;
    const ratio = ratioFromClientX(e.clientX);
    if (ratio === null) return;
    setTradePlanRatio(ratio);
  }

  function unbindRatioDrag() {
    if (!_ratioDragBound || typeof window === 'undefined') return;
    window.removeEventListener('pointermove', onRatioPointerMove);
    window.removeEventListener('pointerup', onRatioPointerUp);
    _ratioDragBound = false;
    _ratioDragPointerId = null;
  }

  function onRatioPointerUp(e: PointerEvent) {
    if (_ratioDragPointerId !== null && e.pointerId === _ratioDragPointerId) {
      unbindRatioDrag();
    }
  }

  function bindRatioDrag() {
    if (_ratioDragBound || typeof window === 'undefined') return;
    window.addEventListener('pointermove', onRatioPointerMove);
    window.addEventListener('pointerup', onRatioPointerUp);
    _ratioDragBound = true;
  }

  function handleRatioPointerDown(e: PointerEvent) {
    if (!pendingTradePlan) return;
    _ratioDragPointerId = e.pointerId;
    const ratio = ratioFromClientX(e.clientX);
    if (ratio !== null) setTradePlanRatio(ratio);
    bindRatioDrag();
  }

  function clampToCanvas(v: number, max: number) {
    return Math.max(0, Math.min(max, v));
  }

  function computeTradePreview(mode: 'longentry' | 'shortentry' | 'trade', startX: number, startY: number, cursorX: number, cursorY: number) {
    if (!drawingCanvas) return null;
    const sx = clampToCanvas(startX, drawingCanvas.width);
    const sy = clampToCanvas(startY, drawingCanvas.height);
    const cx = clampToCanvas(cursorX, drawingCanvas.width);
    const cy = clampToCanvas(cursorY, drawingCanvas.height);

    const left = Math.min(sx, cx);
    const right = Math.min(drawingCanvas.width, Math.max(sx, cx, left + 26));
    const entryY = sy;
    let slY = cy;
    let tpY = cy;

    // For unified 'trade' mode: auto-detect direction from drag.
    // Drag DOWN (cy > entryY) → SL below entry → LONG
    // Drag UP   (cy < entryY) → SL above entry → SHORT
    const effectiveMode: 'longentry' | 'shortentry' =
      mode === 'trade'
        ? (cy >= entryY ? 'longentry' : 'shortentry')
        : mode;

    if (effectiveMode === 'longentry') {
      slY = Math.max(cy, entryY + LINE_ENTRY_MIN_PIXEL_RISK);
      tpY = entryY - (slY - entryY) * LINE_ENTRY_DEFAULT_RR;
    } else {
      slY = Math.min(cy, entryY - LINE_ENTRY_MIN_PIXEL_RISK);
      tpY = entryY + (entryY - slY) * LINE_ENTRY_DEFAULT_RR;
    }

    const entryRaw = toChartPrice(entryY);
    const fallbackEntry = Number.isFinite(livePrice) && livePrice > 0 ? livePrice : null;
    if (entryRaw == null && fallbackEntry == null) return null;
    const entryPx = clampRoundPrice(entryRaw ?? fallbackEntry!);

    const slRaw = toChartPrice(slY);
    let slPx = 0;
    if (slRaw != null) {
      slPx = clampRoundPrice(slRaw);
    } else {
      const pxDelta = Math.max(LINE_ENTRY_MIN_PIXEL_RISK, Math.abs(slY - entryY));
      const approxRisk = Math.max(0.0035, Math.min(0.08, (pxDelta / Math.max(120, drawingCanvas.height)) * 0.24));
      slPx = clampRoundPrice(effectiveMode === 'longentry' ? entryPx * (1 - approxRisk) : entryPx * (1 + approxRisk));
    }
    if (effectiveMode === 'longentry' && slPx >= entryPx) slPx = clampRoundPrice(entryPx * 0.995);
    if (effectiveMode === 'shortentry' && slPx <= entryPx) slPx = clampRoundPrice(entryPx * 1.005);
    const risk = Math.abs(entryPx - slPx);
    if (!Number.isFinite(risk) || risk <= 0) return null;
    const tpPx = clampRoundPrice(effectiveMode === 'longentry' ? entryPx + risk * LINE_ENTRY_DEFAULT_RR : entryPx - risk * LINE_ENTRY_DEFAULT_RR);

    const mappedEntryY = toChartY(entryPx);
    const mappedSlY = toChartY(slPx);
    const mappedTpY = toChartY(tpPx);
    if (mappedSlY != null) slY = mappedSlY;
    tpY = mappedTpY ?? tpY;
    const normalizedEntryY = mappedEntryY ?? entryY;

    const riskPct = Math.abs(entryPx - slPx) / Math.max(Math.abs(entryPx), 1) * 100;

    return {
      mode: effectiveMode,
      dir: effectiveMode === 'longentry' ? 'LONG' as const : 'SHORT' as const,
      left,
      right,
      entryY: normalizedEntryY,
      slY,
      tpY,
      entry: entryPx,
      sl: slPx,
      tp: tpPx,
      rr: LINE_ENTRY_DEFAULT_RR,
      riskPct,
    };
  }

  function drawTradePreview(ctx: CanvasRenderingContext2D, preview: NonNullable<ReturnType<typeof computeTradePreview>>) {
    const lossTop = Math.min(preview.entryY, preview.slY);
    const lossBottom = Math.max(preview.entryY, preview.slY);
    const gainTop = Math.min(preview.entryY, preview.tpY);
    const gainBottom = Math.max(preview.entryY, preview.tpY);

    ctx.save();
    ctx.fillStyle = withAlpha(chartTheme.candleUp, 0.17);
    ctx.fillRect(preview.left, gainTop, preview.right - preview.left, gainBottom - gainTop);
    ctx.fillStyle = withAlpha(chartTheme.candleDown, 0.17);
    ctx.fillRect(preview.left, lossTop, preview.right - preview.left, lossBottom - lossTop);

    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = withAlpha(chartTheme.entry, 0.92);
    ctx.beginPath();
    ctx.moveTo(preview.left, preview.entryY);
    ctx.lineTo(preview.right, preview.entryY);
    ctx.stroke();

    ctx.strokeStyle = withAlpha(chartTheme.sl, 0.9);
    ctx.beginPath();
    ctx.moveTo(preview.left, preview.slY);
    ctx.lineTo(preview.right, preview.slY);
    ctx.stroke();

    ctx.strokeStyle = withAlpha(chartTheme.tp, 0.9);
    ctx.beginPath();
    ctx.moveTo(preview.left, preview.tpY);
    ctx.lineTo(preview.right, preview.tpY);
    ctx.stroke();
    ctx.setLineDash([]);

    const label = `${preview.dir} · E ${formatPrice(preview.entry)} · TP ${formatPrice(preview.tp)} · SL ${formatPrice(preview.sl)} · RR 1:${preview.rr.toFixed(1)} · Risk ${preview.riskPct.toFixed(2)}%`;
    ctx.font = "10px 'JetBrains Mono', monospace";
    const textW = ctx.measureText(label).width;
    const padX = 7;
    const boxW = textW + padX * 2;
    const boxH = 16;
    const boxX = Math.max(4, Math.min(preview.right + 8, drawingCanvas.width - boxW - 4));
    const boxY = Math.max(4, Math.min(preview.entryY - boxH - 4, drawingCanvas.height - boxH - 4));

    ctx.fillStyle = withAlpha('#000000', 0.68);
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = withAlpha(preview.dir === 'LONG' ? chartTheme.candleUp : chartTheme.candleDown, 0.9);
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.fillStyle = withAlpha('#f5f7fa', 0.95);
    ctx.fillText(label, boxX + padX, boxY + 11);
    ctx.restore();
  }

  // ═══ Agent Trade Overlay — TradingView-style position box ═══
  // Clean, minimal: just colored zones + inside labels. No price lines on axis.
  function drawAgentTradeOverlay(ctx: CanvasRenderingContext2D, setup: AgentTradeSetup) {
    if (!drawingCanvas || !chart) return;
    const rawEntryY = toChartY(setup.entry);
    const rawTpY = toChartY(setup.tp);
    const rawSlY = toChartY(setup.sl);
    if (rawEntryY === null || rawTpY === null || rawSlY === null) return;

    const W = drawingCanvas.width;
    const rightPad = 72;
    const R = W - rightPad;
    const isLong = setup.dir === 'LONG';
    const tpPct = ((Math.abs(setup.tp - setup.entry) / setup.entry) * 100).toFixed(1);
    const slPct = ((Math.abs(setup.entry - setup.sl) / setup.entry) * 100).toFixed(1);

    // ── Enforce minimum zone heights so overlay is always visible ──
    const MIN_ZONE = 22;
    const entryY = rawEntryY;
    let tpY = rawTpY;
    let slY = rawSlY;
    if (Math.abs(tpY - entryY) < MIN_ZONE) {
      tpY = isLong ? entryY - MIN_ZONE : entryY + MIN_ZONE;
    }
    if (Math.abs(slY - entryY) < MIN_ZONE) {
      slY = isLong ? entryY + MIN_ZONE : entryY - MIN_ZONE;
    }

    ctx.save();

    // ── App palette (matches warroom + chart toolbar) ──
    const GREEN = chartTheme.candleUp;   // same as candle up / --grn
    const RED = chartTheme.candleDown;   // same as candle down / --red
    const ACCENT = '#E8967D';            // salmon accent (primary UI accent)
    const BG_DARK = 'rgba(10,9,8,';     // near-black base for labels
    const TEXT = '#F0EDE4';              // off-white text

    // ── TP zone (profit) — subtle tinted band ──
    const tpTop = Math.min(entryY, tpY);
    const tpH = Math.abs(tpY - entryY);
    ctx.fillStyle = withAlpha(GREEN, 0.10);
    ctx.fillRect(0, tpTop, R, tpH);
    ctx.strokeStyle = withAlpha(GREEN, 0.5);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, tpY);
    ctx.lineTo(R, tpY);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── SL zone (risk) — subtle tinted band ──
    const slTop = Math.min(entryY, slY);
    const slH = Math.abs(slY - entryY);
    ctx.fillStyle = withAlpha(RED, 0.10);
    ctx.fillRect(0, slTop, R, slH);
    ctx.strokeStyle = withAlpha(RED, 0.5);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, slY);
    ctx.lineTo(R, slY);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Entry line — salmon accent dashed ──
    ctx.strokeStyle = withAlpha(ACCENT, 0.7);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, entryY);
    ctx.lineTo(R, entryY);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Right-edge price axis tags ──
    const tagW = rightPad - 2;
    const tagH = 16;
    const tagX = R + 1;
    ctx.font = "bold 9px 'JetBrains Mono', monospace";
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    // TP tag
    ctx.fillStyle = withAlpha(GREEN, 0.85);
    _roundRect(ctx, tagX, tpY - tagH / 2, tagW, tagH, 2);
    ctx.fill();
    ctx.fillStyle = TEXT;
    ctx.fillText(formatPrice(setup.tp), tagX + tagW / 2, tpY);
    // Entry tag
    ctx.fillStyle = withAlpha(ACCENT, 0.85);
    _roundRect(ctx, tagX, entryY - tagH / 2, tagW, tagH, 2);
    ctx.fill();
    ctx.fillStyle = TEXT;
    ctx.fillText(formatPrice(setup.entry), tagX + tagW / 2, entryY);
    // SL tag
    ctx.fillStyle = withAlpha(RED, 0.85);
    _roundRect(ctx, tagX, slY - tagH / 2, tagW, tagH, 2);
    ctx.fill();
    ctx.fillStyle = TEXT;
    ctx.fillText(formatPrice(setup.sl), tagX + tagW / 2, slY);
    ctx.textAlign = 'left';

    // ── Zone labels (inside zones, dark pill) ──
    ctx.font = "700 9px 'JetBrains Mono', monospace";
    ctx.textBaseline = 'middle';
    // TP label
    const tpZoneMid = tpTop + tpH / 2;
    const tpLabel = `TP +${tpPct}%`;
    const tpLabelW = ctx.measureText(tpLabel).width;
    ctx.fillStyle = BG_DARK + '0.7)';
    _roundRect(ctx, 8, tpZoneMid - 8, tpLabelW + 12, 16, 3);
    ctx.fill();
    ctx.fillStyle = GREEN;
    ctx.fillText(tpLabel, 14, tpZoneMid);
    // SL label
    const slZoneMid = slTop + slH / 2;
    const slLabel = `SL -${slPct}%`;
    const slLabelW = ctx.measureText(slLabel).width;
    ctx.fillStyle = BG_DARK + '0.7)';
    _roundRect(ctx, 8, slZoneMid - 8, slLabelW + 12, 16, 3);
    ctx.fill();
    ctx.fillStyle = RED;
    ctx.fillText(slLabel, 14, slZoneMid);

    // ── Entry info bar (single compact row above entry line) ──
    const srcLabel = setup.source === 'consensus' ? 'CONSENSUS' : (setup.agentName?.toUpperCase() ?? 'AGENT');
    const dirArrow = isLong ? '▲' : '▼';
    ctx.font = "800 9px 'JetBrains Mono', monospace";
    const eLabelH = 16;
    const eLabelY = entryY - eLabelH - 4;
    let curX = 8;

    // Badge 1: Direction + source (accent bg)
    const b1Text = `${dirArrow} ${srcLabel} ${setup.dir}`;
    const b1W = ctx.measureText(b1Text).width + 12;
    ctx.fillStyle = withAlpha(isLong ? GREEN : RED, 0.8);
    _roundRect(ctx, curX, eLabelY, b1W, eLabelH, 3);
    ctx.fill();
    ctx.fillStyle = TEXT;
    ctx.textBaseline = 'middle';
    ctx.fillText(b1Text, curX + 6, eLabelY + eLabelH / 2);
    curX += b1W + 3;

    // Badge 2: R:R (dark pill)
    const b2Text = `R:R 1:${setup.rr.toFixed(1)}`;
    const b2W = ctx.measureText(b2Text).width + 12;
    ctx.fillStyle = BG_DARK + '0.75)';
    _roundRect(ctx, curX, eLabelY, b2W, eLabelH, 3);
    ctx.fill();
    ctx.strokeStyle = withAlpha(ACCENT, 0.25);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = withAlpha(TEXT, 0.85);
    ctx.fillText(b2Text, curX + 6, eLabelY + eLabelH / 2);
    curX += b2W + 3;

    // Badge 3: Confidence (dark pill)
    const b3Text = `${setup.conf}%`;
    const b3W = ctx.measureText(b3Text).width + 12;
    ctx.fillStyle = BG_DARK + '0.75)';
    _roundRect(ctx, curX, eLabelY, b3W, eLabelH, 3);
    ctx.fill();
    ctx.strokeStyle = withAlpha(ACCENT, 0.25);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = withAlpha(isLong ? GREEN : RED, 0.85);
    ctx.fillText(b3Text, curX + 6, eLabelY + eLabelH / 2);
    curX += b3W + 3;

    // Badge 4: Live P&L
    if (livePrice > 0) {
      const pnl = isLong
        ? ((livePrice - setup.entry) / setup.entry) * 100
        : ((setup.entry - livePrice) / setup.entry) * 100;
      const pnlColor = pnl >= 0 ? GREEN : RED;
      const pnlText = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`;
      const b4W = ctx.measureText(pnlText).width + 12;
      ctx.fillStyle = withAlpha(pnlColor, 0.75);
      _roundRect(ctx, curX, eLabelY, b4W, eLabelH, 3);
      ctx.fill();
      ctx.fillStyle = TEXT;
      ctx.fillText(pnlText, curX + 6, eLabelY + eLabelH / 2);
    }

    // Close button position (used by HTML overlay-close-btn)
    _agentCloseBtn = { x: R - 14, y: tpTop + 14, r: 14 };

    ctx.restore();
  }

  function _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function applyAgentTradeSetup(setup: AgentTradeSetup | null) {
    // Clear old price lines (no more axis labels — canvas only)
    if (agentPriceLines.tp && series) { try { series.removePriceLine(agentPriceLines.tp); } catch {} }
    if (agentPriceLines.entry && series) { try { series.removePriceLine(agentPriceLines.entry); } catch {} }
    if (agentPriceLines.sl && series) { try { series.removePriceLine(agentPriceLines.sl); } catch {} }
    agentPriceLines = { tp: null, entry: null, sl: null };
    if (!setup) _agentCloseBtn = null;
    renderDrawings();
  }

  function makeTradeBoxDrawing(preview: NonNullable<ReturnType<typeof computeTradePreview>>): DrawingItem {
    const leftTime = toChartTime(preview.left);
    const rightTime = toChartTime(preview.right);
    const fromTime = leftTime !== null && rightTime !== null ? Math.min(leftTime, rightTime) : undefined;
    const toTime = leftTime !== null && rightTime !== null ? Math.max(leftTime, rightTime) : undefined;
    return {
      type: 'tradebox',
      points: [
        { x: preview.left, y: preview.entryY },
        { x: preview.right, y: preview.entryY },
        { x: preview.left, y: preview.slY },
        { x: preview.left, y: preview.tpY },
      ],
      fromTime,
      toTime,
      color: preview.dir === 'LONG' ? chartTheme.candleUp : chartTheme.candleDown,
      dir: preview.dir,
      entry: preview.entry,
      sl: preview.sl,
      tp: preview.tp,
      rr: preview.rr,
      riskPct: preview.riskPct,
    };
  }

  function applyIndicatorProfile() {
    const next = advancedMode
      ? (
        chartVisualMode === 'full'
          ? { ma20: true, ma60: true, ma120: true, ma7: true, ma25: true, ma99: true, rsi: true, vol: true }
          : { ma20: true, ma60: true, ma120: true, ma7: false, ma25: false, ma99: false, rsi: true, vol: true }
      )
      : { ma20: false, ma60: false, ma120: false, ma7: true, ma25: true, ma99: true, rsi: true, vol: true };
    indicatorEnabled = next;
  }

  function applyIndicatorVisibility() {
    if (ma7Series) ma7Series.applyOptions({ visible: indicatorEnabled.ma7 });
    if (ma20Series) ma20Series.applyOptions({ visible: indicatorEnabled.ma20 });
    if (ma25Series) ma25Series.applyOptions({ visible: indicatorEnabled.ma25 });
    if (ma60Series) ma60Series.applyOptions({ visible: indicatorEnabled.ma60 });
    if (ma99Series) ma99Series.applyOptions({ visible: indicatorEnabled.ma99 });
    if (ma120Series) ma120Series.applyOptions({ visible: indicatorEnabled.ma120 });
    if (rsiSeries) rsiSeries.applyOptions({ visible: indicatorEnabled.rsi });
    if (volumeSeries) volumeSeries.applyOptions({ visible: indicatorEnabled.vol });
    applyPaneLayout();
  }

  function applyPaneLayout() {
    if (!chart) return;
    try {
      const panes = chart.panes();
      const mainPane = panes?.[0];
      const volPane = volumePaneIndex !== null ? panes?.[volumePaneIndex] : null;
      const rsiPane = rsiPaneIndex !== null ? panes?.[rsiPaneIndex] : null;
      if (!mainPane || !volPane || !rsiPane) return;

      const volOn = indicatorEnabled.vol;
      const rsiOn = indicatorEnabled.rsi;

      if (volOn && rsiOn) {
        mainPane.setStretchFactor(0.82);
        volPane.setStretchFactor(0.09);
        rsiPane.setStretchFactor(0.09);
      } else if (volOn || rsiOn) {
        mainPane.setStretchFactor(0.9);
        volPane.setStretchFactor(volOn ? 0.1 : 0.02);
        rsiPane.setStretchFactor(rsiOn ? 0.1 : 0.02);
      } else {
        mainPane.setStretchFactor(0.96);
        volPane.setStretchFactor(0.02);
        rsiPane.setStretchFactor(0.02);
      }
    } catch {}
    renderDrawings();
  }

  function applyTimeScale() {
    if (!chart) return;
    chart.timeScale().applyOptions({
      barSpacing,
      minBarSpacing: 3,
      rightOffset: 6,
    });
    renderDrawings();
  }

  function zoomChart(direction: 1 | -1) {
    barSpacing = Math.max(BAR_SPACING_MIN, Math.min(BAR_SPACING_MAX, barSpacing + direction * BAR_SPACING_STEP));
    applyTimeScale();
    pushChartNotice(`ZOOM ${barSpacing.toFixed(1)}`);
  }

  function fitChartRange() {
    if (!chart) return;
    chart.timeScale().fitContent();
    pushChartNotice('전체 구간 맞춤');
  }

  function toggleAutoScaleY() {
    autoScaleY = !autoScaleY;
    try { chart?.priceScale('right').applyOptions({ autoScale: autoScaleY }); } catch {}
    pushChartNotice(autoScaleY ? 'Y-AUTO ON' : 'Y-AUTO OFF');
    renderDrawings();
  }

  function resetChartScale() {
    barSpacing = BAR_SPACING_DEFAULT;
    autoScaleY = true;
    applyTimeScale();
    try { chart?.priceScale('right').applyOptions({ autoScale: true }); } catch {}
    chart?.timeScale().fitContent();
    pushChartNotice('스케일 초기화');
    renderDrawings();
  }

  function toggleIndicator(key: IndicatorKey) {
    indicatorEnabled = { ...indicatorEnabled, [key]: !indicatorEnabled[key] };
    applyIndicatorVisibility();
    gtmEvent('terminal_indicator_toggle', { indicator: key, enabled: indicatorEnabled[key] });
  }

  function setChartVisualMode(mode: 'focus' | 'full') {
    if (chartVisualMode === mode) return;
    chartVisualMode = mode;
    gtmEvent('terminal_chart_visual_mode', { mode });
  }

  function toggleIndicatorLegend() {
    showIndicatorLegend = !showIndicatorLegend;
    gtmEvent('terminal_indicator_legend_toggle', { show: showIndicatorLegend });
  }

  function setIndicatorStripState(next: 'expanded' | 'collapsed' | 'hidden') {
    if (isTvLikePreset && next !== 'collapsed') return;
    if (indicatorStripState === next) return;
    indicatorStripState = next;
    gtmEvent('terminal_indicator_strip_state', { state: next });
  }

  $: if (isTvLikePreset) {
    if (indicatorStripState !== 'hidden') indicatorStripState = 'hidden';
    if (showIndicatorLegend) showIndicatorLegend = false;
  }

  $: if (!pendingTradePlan) {
    unbindRatioDrag();
  }

  $: {
    const profileKey = advancedMode ? `advanced:${chartVisualMode}` : 'basic';
    if (_indicatorProfileApplied !== profileKey) {
      _indicatorProfileApplied = profileKey;
      applyIndicatorProfile();
      applyIndicatorVisibility();
    }
  }

  function gtmEvent(event: string, payload: Record<string, unknown> = {}) {
    if (typeof window === 'undefined') return;
    const w = window as any;
    if (!Array.isArray(w.dataLayer)) return;
    w.dataLayer.push({
      event,
      page: 'terminal',
      component: 'chart-panel',
      ...payload,
    });
  }

  // ═══════════════════════════════════════════
  //  INDICATOR COMPUTATION (optimised)
  // ═══════════════════════════════════════════

  function computeSMA(data: { time: any; close: number }[], period: number) {
    const result: { time: any; value: number }[] = [];
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i].close;
      if (i >= period) sum -= data[i - period].close;
      if (i >= period - 1) result.push({ time: data[i].time, value: sum / period });
    }
    return result;
  }

  function computeRSI(data: { time: any; close: number }[], period = 14) {
    if (data.length < period + 1) return [];
    const result: { time: any; value: number }[] = [];
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const d = data[i].close - data[i - 1].close;
      if (d > 0) avgGain += d; else avgLoss -= d;
    }
    avgGain /= period; avgLoss /= period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: data[period].time, value: rsi });
    for (let i = period + 1; i < data.length; i++) {
      const d = data[i].close - data[i - 1].close;
      avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
      result.push({ time: data[i].time, value: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss) });
    }
    // Stash running state for incremental WS updates
    _rsiAvgGain = avgGain;
    _rsiAvgLoss = avgLoss;
    return result;
  }

  // OI/OBV removed — 3-pane layout (candles, volume, RSI) for stability

  // ═══════════════════════════════════════════
  //  TRADINGVIEW WIDGET
  // ═══════════════════════════════════════════

  function pairToTVSymbol(pair: string) { return 'BINANCE:' + pair.replace('/', ''); }
  function tfToTVInterval(tf: string) { return toTradingViewInterval(tf); }

  function initTradingView(useSafeMode = false) {
    if (!tvContainer) return;
    if (_tvLoadTimer) { clearTimeout(_tvLoadTimer); _tvLoadTimer = null; }
    tvError = '';
    tvLoading = true;
    tvSafeMode = useSafeMode;
    try {
      const activeTheme = resolveChartTheme(tvContainer || chartContainer);
      chartTheme = activeTheme;
      tvScriptLoaded = false;
      destroyTradingView();
      const widgetDiv = tvContainer.querySelector('#tradingview_widget');
      if (!widgetDiv) return;
      widgetDiv.innerHTML = '';

      const handleTvFailure = (reason: 'timeout' | 'network') => {
        if (_tvLoadTimer) { clearTimeout(_tvLoadTimer); _tvLoadTimer = null; }
        if (!useSafeMode && !_tvFallbackTried) {
          _tvFallbackTried = true;
          gtmEvent('terminal_tradingview_fallback_start', { reason, pair: state.pair, timeframe: state.timeframe });
          initTradingView(true);
          return;
        }
        tvLoading = false;
        tvError = 'TradingView 연결 실패. 네트워크/확장프로그램 차단 가능성이 있습니다.';
        gtmEvent('terminal_tradingview_error', { reason, mode: useSafeMode ? 'safe' : 'primary', pair: state.pair, timeframe: state.timeframe });
      };

      const iframe = document.createElement('iframe');
      const params: Record<string, string> = {
        symbol: pairToTVSymbol(state.pair), interval: tfToTVInterval(state.timeframe),
        hidesidetoolbar: '0', symboledit: '1', saveimage: '1', toolbarbg: toTvHex(activeTheme.bg),
        theme: 'dark', style: '1', timezone: 'Etc/UTC', withdateranges: '1', locale: 'en',
        hide_top_toolbar: '0', allow_symbol_change: '1',
      };
      if (!useSafeMode) {
        params.studies = ['Volume@tv-basicstudies', 'MASimple@tv-basicstudies', 'RSI@tv-basicstudies', 'OBV@tv-basicstudies'].join('\x1f');
        params.studies_overrides = '{}';
        params.overrides = JSON.stringify({
          'mainSeriesProperties.candleStyle.upColor': activeTheme.candleUp,
          'mainSeriesProperties.candleStyle.downColor': activeTheme.candleDown,
          'mainSeriesProperties.candleStyle.wickUpColor': activeTheme.candleUp,
          'mainSeriesProperties.candleStyle.wickDownColor': activeTheme.candleDown,
          'paneProperties.background': activeTheme.bg,
          'paneProperties.vertGridProperties.color': activeTheme.grid,
          'paneProperties.horzGridProperties.color': activeTheme.grid,
        });
      }
      const qs = new URLSearchParams(params);
      iframe.src = `https://www.tradingview.com/widgetembed/?${qs.toString()}`;
      iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
      iframe.allow = 'fullscreen';
      iframe.loading = 'lazy';
      iframe.onload = () => {
        if (_tvLoadTimer) { clearTimeout(_tvLoadTimer); _tvLoadTimer = null; }
        tvLoading = false;
        tvScriptLoaded = true;
        tvError = '';
        gtmEvent('terminal_tradingview_loaded', { mode: useSafeMode ? 'safe' : 'primary', pair: state.pair, timeframe: state.timeframe });
      };
      iframe.onerror = () => { handleTvFailure('network'); };
      widgetDiv.appendChild(iframe);
      tvWidget = { iframe, container: widgetDiv };
      _tvLoadTimer = setTimeout(() => {
        if (!tvScriptLoaded) handleTvFailure('timeout');
      }, 10000);
    } catch (e) {
      console.error('[ChartPanel] TV init error:', e);
      tvLoading = false;
      tvError = 'TradingView 초기화 실패';
      gtmEvent('terminal_tradingview_error', { reason: 'init_exception', mode: useSafeMode ? 'safe' : 'primary', pair: state.pair, timeframe: state.timeframe });
    }
  }

  function destroyTradingView() {
    if (_tvLoadTimer) { clearTimeout(_tvLoadTimer); _tvLoadTimer = null; }
    if (tvWidget?.iframe) {
      tvWidget.iframe.onload = null;
      tvWidget.iframe.onerror = null;
      tvWidget.iframe.src = 'about:blank';
    }
    tvWidget = null;
    if (tvContainer) {
      const w = tvContainer.querySelector('#tradingview_widget');
      if (w) w.innerHTML = '';
    }
  }

  function runChartCleanup() {
    if (cleanup) {
      const dispose = cleanup;
      cleanup = null;
      dispose();
      return;
    }
    if (wsCleanup) { wsCleanup(); wsCleanup = null; }
    if (priceWsCleanup) { priceWsCleanup(); priceWsCleanup = null; }
    clearPositionLines();
    clearPatternLineSeries();
    destroyTradingView();
    if (chart) {
      chart.remove();
      chart = null;
    }
  }

  async function setChartMode(mode: 'agent' | 'trading') {
    if (mode === chartMode) return;
    chartMode = mode;
    gtmEvent('terminal_chart_mode_change', { mode });
    await tick(); await tick();
    if (mode === 'trading') {
      _tvFallbackTried = false;
      tvError = '';
      tvSafeMode = false;
      _tvReinitKey = '';
    } else {
      destroyTradingView();
      tvError = '';
      tvSafeMode = false;
      _tvReinitKey = '';
      if (_tvInitTimer) { clearTimeout(_tvInitTimer); _tvInitTimer = null; }
      await tick();
      if (chart && chartContainer) { chart.resize(chartContainer.clientWidth, chartContainer.clientHeight); chart.timeScale().fitContent(); }
    }
  }

  // Debounced TradingView init/re-init only when pair/TF key changes.
  let _tvInitTimer: ReturnType<typeof setTimeout> | null = null;
  $: if (chartMode === 'trading' && tvContainer && state.pair && state.timeframe) {
    const key = `${state.pair}|${state.timeframe}`;
    if (key !== _tvReinitKey) {
      _tvReinitKey = key;
      if (_tvInitTimer) clearTimeout(_tvInitTimer);
      _tvInitTimer = setTimeout(() => {
        _tvFallbackTried = false;
        initTradingView(false);
      }, 220);
    }
  }

  function retryTradingView() {
    _tvFallbackTried = false;
    tvError = '';
    gtmEvent('terminal_tradingview_retry', { pair: state.pair, timeframe: state.timeframe });
    initTradingView(false);
  }

  // ═══════════════════════════════════════════
  //  DRAWING TOOLS
  // ═══════════════════════════════════════════

  let _globalDrawingMouseUpBound = false;

  function bindGlobalDrawingMouseUp() {
    if (_globalDrawingMouseUpBound || typeof window === 'undefined') return;
    window.addEventListener('mouseup', handleDrawingMouseUp);
    _globalDrawingMouseUpBound = true;
  }

  function unbindGlobalDrawingMouseUp() {
    if (!_globalDrawingMouseUpBound || typeof window === 'undefined') return;
    window.removeEventListener('mouseup', handleDrawingMouseUp);
    _globalDrawingMouseUpBound = false;
  }

  function setDrawingMode(mode: DrawingMode) {
    drawingMode = mode;
    isDrawing = false;
    currentDrawing = null;
    tradePreview = null;
    if (mode !== 'none') pendingTradePlan = null;
    unbindGlobalDrawingMouseUp();
    renderDrawings();
  }
  function toggleDrawingsVisible() {
    drawingsVisible = !drawingsVisible;
    renderDrawings();
  }
  function clearAllDrawings() {
    drawings = [];
    currentDrawing = null;
    tradePreview = null;
    pendingTradePlan = null;
    isDrawing = false;
    drawingMode = 'none';
    unbindGlobalDrawingMouseUp();
    renderDrawings();
  }

  function handleDrawingMouseDown(e: MouseEvent) {
    if (!drawingCanvas) return;
    const rect = drawingCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (drawingMode === 'none') return;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (drawingMode === 'hline') {
      const linePrice = toChartPrice(y);
      drawings = [
        ...drawings,
        {
          type: 'hline',
          points: [{ x: 0, y }, { x: rect.width, y }],
          price: linePrice == null ? undefined : clampRoundPrice(linePrice),
          color: chartTheme.draw,
        },
      ];
      renderDrawings(); drawingMode = 'none'; return;
    }
    if (drawingMode === 'trendline') {
      if (!isDrawing) { currentDrawing = { type: 'trendline', points: [{ x, y }] }; isDrawing = true; }
      else if (currentDrawing) {
        const startPoint = currentDrawing.points[0];
        const endPoint = { x, y };
        const startAnchor = toDrawingAnchor(startPoint.x, startPoint.y);
        const endAnchor = toDrawingAnchor(endPoint.x, endPoint.y);
        currentDrawing.points.push(endPoint);
        drawings = [
          ...drawings,
          {
            type: 'trendline',
            points: [...currentDrawing.points],
            anchors: startAnchor && endAnchor ? [startAnchor, endAnchor] : undefined,
            color: chartTheme.draw,
          },
        ];
        currentDrawing = null; isDrawing = false; drawingMode = 'none'; renderDrawings();
      }
      return;
    }
    if (drawingMode === 'longentry' || drawingMode === 'shortentry' || drawingMode === 'trade') {
      tradePreview = { mode: drawingMode, startX: x, startY: y, cursorX: x, cursorY: y };
      currentDrawing = null;
      isDrawing = true;
      bindGlobalDrawingMouseUp();
      renderDrawings();
      return;
    }
  }

  function handleDrawingMouseUp(e: MouseEvent) {
    if (!drawingCanvas || !isDrawing || !tradePreview) return;
    if (drawingMode !== 'longentry' && drawingMode !== 'shortentry' && drawingMode !== 'trade') return;
    const rect = drawingCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const preview = computeTradePreview(tradePreview.mode, tradePreview.startX, tradePreview.startY, x, y);
    if (!preview) {
      pushChartNotice('라인 진입 계산 실패');
    } else {
      drawings = [...drawings, makeTradeBoxDrawing(preview)];
      if (requireTradeConfirm) {
        pendingTradePlan = {
          pair: state.pair || 'BTC/USDT',
          previewDir: preview.dir,
          entry: preview.entry,
          sl: preview.sl,
          tp: preview.tp,
          rr: preview.rr,
          riskPct: preview.riskPct,
          longRatio: preview.dir === 'LONG' ? 70 : 30,
        };
        pushChartNotice('Drag complete — adjust ratio and confirm');
      } else {
        openTradeByLine(preview.dir, preview.entry, preview.sl, preview.rr);
      }
    }
    isDrawing = false;
    currentDrawing = null;
    tradePreview = null;
    drawingMode = 'none';
    unbindGlobalDrawingMouseUp();
    renderDrawings();
  }

  let _drawRAF: number | null = null;
  function handleDrawingMouseMove(e: MouseEvent) {
    if (!drawingCanvas) return;
    if (!isDrawing) return;
    if (_drawRAF) return; // throttle to animation frame
    _drawRAF = requestAnimationFrame(() => {
      _drawRAF = null;
      if (!drawingCanvas) return;
      const rect = drawingCanvas.getBoundingClientRect();
      if (tradePreview && (drawingMode === 'longentry' || drawingMode === 'shortentry' || drawingMode === 'trade')) {
        tradePreview = {
          ...tradePreview,
          cursorX: e.clientX - rect.left,
          cursorY: e.clientY - rect.top,
        };
        renderDrawings();
        return;
      }
      if (!currentDrawing) return;
      renderDrawings();
      const ctx = drawingCanvas.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      const ghostColor = chartTheme.drawGhost;
      ctx.strokeStyle = ghostColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(currentDrawing.points[0].x, currentDrawing.points[0].y);
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.stroke(); ctx.setLineDash([]);
    });
  }

  function renderDrawings() {
    if (!drawingCanvas) return;
    const ctx = drawingCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    drawPatternOverlays(ctx);
    // Agent trade overlay (TP/SL zones from scan signals)
    if (activeTradeSetup && drawingsVisible) drawAgentTradeOverlay(ctx, activeTradeSetup);
    if (!drawingsVisible) {
      // Still render active drag preview even when drawings hidden
      if (tradePreview && (drawingMode === 'longentry' || drawingMode === 'shortentry' || drawingMode === 'trade')) {
        const preview = computeTradePreview(tradePreview.mode, tradePreview.startX, tradePreview.startY, tradePreview.cursorX, tradePreview.cursorY);
        if (preview) drawTradePreview(ctx, preview);
      }
      return;
    }
    for (const d of drawings) {
      ctx.beginPath(); ctx.strokeStyle = d.color; ctx.lineWidth = 1.5;
      if (d.type === 'hline') {
        const mappedY = Number.isFinite(d.price) ? toChartY(d.price as number) : null;
        const y = mappedY ?? d.points[0]?.y;
        if (!Number.isFinite(y)) continue;
        ctx.setLineDash([6, 3]);
        ctx.moveTo(0, y);
        ctx.lineTo(drawingCanvas.width, y);
      }
      else if (d.type === 'trendline' && d.points.length === 2) {
        const mappedFrom = d.anchors?.[0] ? toOverlayPoint(d.anchors[0].time, d.anchors[0].price) : null;
        const mappedTo = d.anchors?.[1] ? toOverlayPoint(d.anchors[1].time, d.anchors[1].price) : null;
        const from = mappedFrom ?? d.points[0];
        const to = mappedTo ?? d.points[1];
        if (!from || !to) continue;
        ctx.setLineDash([]);
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
      }
      else if (d.type === 'tradebox' && d.points.length >= 4) {
        const mappedLeftX = Number.isFinite(d.fromTime) ? toChartX(d.fromTime as number) : null;
        const mappedRightX = Number.isFinite(d.toTime) ? toChartX(d.toTime as number) : null;
        const mappedEntryY = toChartY(d.entry);
        const mappedSlY = toChartY(d.sl);
        const mappedTpY = toChartY(d.tp);
        const preview = (
          mappedLeftX !== null
          && mappedRightX !== null
          && mappedEntryY !== null
          && mappedSlY !== null
          && mappedTpY !== null
        )
          ? {
            mode: d.dir === 'LONG' ? 'longentry' as const : 'shortentry' as const,
            dir: d.dir,
            left: Math.min(mappedLeftX, mappedRightX),
            right: Math.max(mappedLeftX, mappedRightX),
            entryY: mappedEntryY,
            slY: mappedSlY,
            tpY: mappedTpY,
            entry: d.entry,
            sl: d.sl,
            tp: d.tp,
            rr: d.rr,
            riskPct: d.riskPct,
          }
          : {
            mode: d.dir === 'LONG' ? 'longentry' as const : 'shortentry' as const,
            dir: d.dir,
            left: Math.min(d.points[0].x, d.points[1].x),
            right: Math.max(d.points[0].x, d.points[1].x),
            entryY: d.points[0].y,
            slY: d.points[2].y,
            tpY: d.points[3].y,
            entry: d.entry,
            sl: d.sl,
            tp: d.tp,
            rr: d.rr,
            riskPct: d.riskPct,
          };
        drawTradePreview(ctx, preview);
        continue;
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (tradePreview && (drawingMode === 'longentry' || drawingMode === 'shortentry' || drawingMode === 'trade')) {
      const preview = computeTradePreview(tradePreview.mode, tradePreview.startX, tradePreview.startY, tradePreview.cursorX, tradePreview.cursorY);
      if (preview) drawTradePreview(ctx, preview);
    }
  }

  function toOverlayPoint(time: number, price: number): { x: number; y: number } | null {
    if (!chart || !drawingCanvas) return null;
    if (!Number.isFinite(time) || !Number.isFinite(price)) return null;
    try {
      const x = chart.timeScale().timeToCoordinate(time as any);
      const y = toChartY(price);
      if (!Number.isFinite(x) || y === null || !Number.isFinite(y)) return null;
      return { x, y };
    } catch {
      return null;
    }
  }

  function drawPatternTag(
    ctx: CanvasRenderingContext2D,
    point: { x: number; y: number },
    text: string,
    color: string
  ) {
    if (!drawingCanvas) return;
    ctx.save();
    ctx.font = "700 9px 'JetBrains Mono', monospace";
    const padX = 6;
    const h = 16;
    const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
    const x = Math.max(4, Math.min(point.x + 8, drawingCanvas.width - w - 4));
    const y = Math.max(4, Math.min(point.y - h - 8, drawingCanvas.height - h - 4));

    ctx.fillStyle = withAlpha('#05070d', 0.84);
    ctx.strokeStyle = withAlpha(color, 0.72);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = withAlpha(color, 0.96);
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + padX, y + h / 2);
    ctx.restore();
  }

  function drawPatternOverlays(ctx: CanvasRenderingContext2D) {
    if (!drawingCanvas || !chart || chartMode !== 'agent' || overlayPatterns.length === 0) return;

    for (const pattern of overlayPatterns) {
      const lineAlpha = 0.9;
      const fillAlpha = 0.14;

      const upperGuide = pattern.guideLines.find((g) => g.label === 'upper');
      const lowerGuide = pattern.guideLines.find((g) => g.label === 'lower');
      if (upperGuide && lowerGuide) {
        const p1 = toOverlayPoint(upperGuide.from.time, upperGuide.from.price);
        const p2 = toOverlayPoint(upperGuide.to.time, upperGuide.to.price);
        const p3 = toOverlayPoint(lowerGuide.to.time, lowerGuide.to.price);
        const p4 = toOverlayPoint(lowerGuide.from.time, lowerGuide.from.price);
        if (p1 && p2 && p3 && p4) {
          ctx.save();
          ctx.fillStyle = withAlpha(upperGuide.color, fillAlpha);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.lineTo(p4.x, p4.y);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      for (const guide of pattern.guideLines) {
        const from = toOverlayPoint(guide.from.time, guide.from.price);
        const to = toOverlayPoint(guide.to.time, guide.to.price);
        if (!from || !to) continue;

        ctx.save();
        ctx.strokeStyle = withAlpha(guide.color, lineAlpha);
        ctx.lineWidth = guide.style === 'dashed' ? 2 : 2.2;
        ctx.setLineDash(guide.style === 'dashed' ? [7, 5] : []);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = withAlpha(guide.color, 0.95);
        ctx.beginPath();
        ctx.arc(from.x, from.y, 2.2, 0, Math.PI * 2);
        ctx.arc(to.x, to.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const marker = toOverlayPoint(pattern.markerTime, pattern.markerPrice);
      if (!marker) continue;
      const tagColor = pattern.direction === 'BULLISH' ? '#58d78d' : '#ff657a';
      const statusLabel = pattern.status === 'CONFIRMED' ? 'OK' : 'PEND';
      drawPatternTag(
        ctx,
        marker,
        `${pattern.shortName} ${statusLabel} ${Math.round(pattern.confidence * 100)}%`,
        tagColor
      );
    }
  }

  function resizeDrawingCanvas() {
    if (!drawingCanvas || !chartContainer) return;
    drawingCanvas.width = chartContainer.clientWidth;
    drawingCanvas.height = chartContainer.clientHeight;
    renderDrawings();
  }

  function clearPatternLineSeries() {
    if (!chart || patternLineSeries.length === 0) {
      patternLineSeries = [];
      return;
    }
    for (const lineSeries of patternLineSeries) {
      try { chart.removeSeries(lineSeries); } catch {}
    }
    patternLineSeries = [];
  }

  function applyPatternLineSeries() {
    // Pattern guides are already drawn on the overlay canvas.
    // Keep lightweight-charts line series off to prevent duplicate/double lines.
    if (!ENABLE_PATTERN_LINE_SERIES) {
      clearPatternLineSeries();
      return;
    }
    if (!chart || !lwcModule) return;
    clearPatternLineSeries();
    if (overlayPatterns.length === 0) return;

    for (const pattern of overlayPatterns) {
      for (const guide of pattern.guideLines) {
        try {
          const lineSeries = chart.addSeries(lwcModule.LineSeries, {
            color: guide.color,
            lineWidth: pattern.status === 'CONFIRMED' ? 2 : 1.5,
            lineStyle: guide.style === 'dashed' ? 2 : 0,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          lineSeries.setData([
            { time: guide.from.time, value: guide.from.price },
            { time: guide.to.time, value: guide.to.price },
          ]);
          patternLineSeries.push(lineSeries);
        } catch (err) {
          console.error('[ChartPanel] pattern line render error', err);
        }
      }
    }
  }

  function toPatternMarker(pattern: ChartPatternDetection): ChartMarker {
    const isBear = pattern.direction === 'BEARISH';
    const isConfirmed = pattern.status === 'CONFIRMED';
    const confidencePct = Math.round(pattern.confidence * 100);
    return {
      time: pattern.markerTime,
      position: isBear ? 'aboveBar' : 'belowBar',
      color: isBear ? '#ff657a' : '#58d78d',
      shape: isConfirmed ? (isBear ? 'arrowDown' : 'arrowUp') : 'circle',
      text: `${pattern.shortName} ${isConfirmed ? 'OK' : 'PEND'} ${confidencePct}%`,
    };
  }

  function applyCombinedMarkers() {
    if (!series) return;
    try {
      series.setMarkers([...agentMarkers, ...patternMarkers]);
    } catch {}
  }

  function clearDetectedPatterns() {
    detectedPatterns = [];
    overlayPatterns = [];
    patternMarkers = [];
    _patternSignature = '';
    applyCombinedMarkers();
    clearPatternLineSeries();
    renderDrawings();
  }

  function rankPatternsForOverlay(patterns: ChartPatternDetection[]): ChartPatternDetection[] {
    return [...patterns].sort((a, b) => {
      const statusDiff = (b.status === 'CONFIRMED' ? 1 : 0) - (a.status === 'CONFIRMED' ? 1 : 0);
      if (statusDiff !== 0) return statusDiff;
      const confidenceDiff = b.confidence - a.confidence;
      if (Math.abs(confidenceDiff) > 1e-6) return confidenceDiff;
      return b.endTime - a.endTime;
    });
  }

  function snapshotPattern(pattern: ChartPatternDetection): PatternScanResult['patterns'][number] {
    return {
      kind: pattern.kind,
      shortName: pattern.shortName,
      direction: pattern.direction,
      status: pattern.status,
      confidence: pattern.confidence,
      startTime: pattern.startTime,
      endTime: pattern.endTime,
    };
  }

  function buildPatternSummary(patterns: ChartPatternDetection[]): string {
    if (patterns.length === 0) return '패턴 미감지 · 조건 미충족';
    const summary = patterns
      .slice(0, 2)
      .map((p) => `${p.shortName} ${Math.round(p.confidence * 100)}%`)
      .join(' · ');
    return `패턴 ${patterns.length}개 감지 · ${summary}`;
  }

  function getVisibleScopeCandles(): BinanceKline[] {
    if (!chart || klineCache.length === 0) return [];
    try {
      const range = chart.timeScale?.().getVisibleLogicalRange?.();
      if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to)) return [];
      const from = Math.max(0, Math.floor(range.from));
      const to = Math.min(klineCache.length - 1, Math.ceil(range.to));
      if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
      return klineCache.slice(from, to + 1);
    } catch {
      return [];
    }
  }

  function applyDetectedPatternState(next: ChartPatternDetection[]) {
    const signature = next
      .map((p) => `${p.id}:${p.status}:${Math.round(p.confidence * 100)}`)
      .join('|');
    if (signature === _patternSignature) return;

    _patternSignature = signature;
    detectedPatterns = next;
    overlayPatterns = rankPatternsForOverlay(next).slice(0, MAX_OVERLAY_PATTERNS);
    patternMarkers = overlayPatterns.map(toPatternMarker);
    applyCombinedMarkers();
    applyPatternLineSeries();
    renderDrawings();
  }

  function scheduleVisiblePatternScan() {
    if (_patternRangeScanTimer) clearTimeout(_patternRangeScanTimer);
    _patternRangeScanTimer = setTimeout(() => {
      _patternRangeScanTimer = null;
      runPatternDetection('visible', { fallbackToFull: true });
    }, 120);
  }

  function runPatternDetection(
    scope: PatternScanScope = 'visible',
    opts: { fallbackToFull?: boolean } = {}
  ): PatternScanResult {
    const fallbackToFull = opts.fallbackToFull ?? false;
    if (!chart || !series || klineCache.length < MIN_PATTERN_CANDLES) {
      clearDetectedPatterns();
      return {
        ok: false,
        scope,
        candleCount: klineCache.length,
        patternCount: 0,
        patterns: [],
        message: '캔들 데이터가 부족해 패턴을 분석할 수 없습니다.',
      };
    }

    let effectiveScope: PatternScanScope = scope;
    let sourceCandles = scope === 'visible' ? getVisibleScopeCandles() : klineCache;
    if (sourceCandles.length < MIN_PATTERN_CANDLES && scope === 'visible' && fallbackToFull) {
      effectiveScope = 'full';
      sourceCandles = klineCache;
    }
    if (sourceCandles.length < MIN_PATTERN_CANDLES) {
      clearDetectedPatterns();
      return {
        ok: false,
        scope: effectiveScope,
        candleCount: sourceCandles.length,
        patternCount: 0,
        patterns: [],
        message: '보이는 구간 캔들이 부족합니다. 조금 줌아웃한 뒤 다시 시도하세요.',
      };
    }

    const next = detectChartPatterns(sourceCandles, { maxPatterns: 3, pivotLookaround: 2 });
    applyDetectedPatternState(next);

    return {
      ok: next.length > 0,
      scope: effectiveScope,
      candleCount: sourceCandles.length,
      patternCount: next.length,
      patterns: next.map(snapshotPattern),
      message: buildPatternSummary(next),
    };
  }

  function focusPatternRange(pattern: ChartPatternDetection) {
    if (!chart) return;
    const span = Math.max(1, pattern.endTime - pattern.startTime);
    const from = Math.max(0, pattern.startTime - Math.round(span * 0.25));
    const to = pattern.endTime + Math.round(span * 0.35);
    try {
      chart.timeScale().setVisibleRange({ from, to } as any);
    } catch {}
  }

  function forcePatternScan() {
    const result = runPatternDetection('visible');
    pushChartNotice(result.message);
  }

  export async function runPatternScanFromIntel(options: { scope?: PatternScanScope; focus?: boolean } = {}): Promise<PatternScanResult> {
    const scope = options.scope ?? 'visible';
    if (chartMode !== 'agent') {
      await setChartMode('agent');
      await tick();
    }

    const result = runPatternDetection(scope);
    if ((options.focus ?? true) && overlayPatterns.length > 0) {
      focusPatternRange(overlayPatterns[0]);
      renderDrawings();
    }
    pushChartNotice(result.message);
    gtmEvent('terminal_pattern_scan_from_intel', {
      pair: state.pair,
      timeframe: state.timeframe,
      scope: result.scope,
      candle_count: result.candleCount,
      pattern_count: result.patternCount,
    });
    return result;
  }

  // ═══════════════════════════════════════════
  //  PRICE & POSITION
  // ═══════════════════════════════════════════

  let livePrice = 0;
  let priceChange24h = 0;
  let high24h = 0;
  let low24h = 0;
  let quoteVolume24h = 0;
  let isLoading = true;
  let error = '';

  let _priceUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  let _pendingPrice: number | null = null;
  let _pendingPairBase: string | null = null;
  function normalizeMarketPrice(price: number): number {
    if (!Number.isFinite(price)) return 0;
    const abs = Math.abs(price);
    if (abs >= 1000) return Number(price.toFixed(2));
    if (abs >= 1) return Number(price.toFixed(4));
    return Number(price.toFixed(6));
  }

  /** priceStore에 즉시 반영 (초기 로드 시 호출) */
  function flushPriceUpdate(price: number, pairBase: string) {
    const normalized = normalizeMarketPrice(price);
    updatePrice(pairBase, normalized, 'rest');
  }

  /** WS 실시간 업데이트용 2초 스로틀 (pairBase도 함께 저장하여 클로저 버그 방지) */
  function throttledPriceUpdate(price: number, pairBase: string) {
    _pendingPrice = price;
    _pendingPairBase = pairBase;
    if (_priceUpdateTimer) return;
    _priceUpdateTimer = setTimeout(() => {
      if (_pendingPrice !== null && _pendingPairBase !== null) {
        const normalized = normalizeMarketPrice(_pendingPrice!);
        // S-03: priceStore가 단일 소스
        updatePrice(_pendingPairBase!, normalized, 'ws');
      }
      _priceUpdateTimer = null; _pendingPrice = null; _pendingPairBase = null;
    }, 2000);
  }

  function hydrate24hStatsFromKlines(klines: BinanceKline[]) {
    if (!Array.isArray(klines) || klines.length === 0) return;
    let hi = Number.NEGATIVE_INFINITY;
    let lo = Number.POSITIVE_INFINITY;
    let qv = 0;
    for (const k of klines) {
      if (Number.isFinite(k.high)) hi = Math.max(hi, k.high);
      if (Number.isFinite(k.low)) lo = Math.min(lo, k.low);
      if (Number.isFinite(k.volume) && Number.isFinite(k.close)) qv += k.volume * k.close;
    }
    if (Number.isFinite(hi) && hi > 0) high24h = hi;
    if (Number.isFinite(lo) && lo > 0) low24h = lo;
    if (Number.isFinite(qv) && qv > 0) quoteVolume24h = qv;
  }

  $: if (series && showPosition && posEntry !== null && posTp !== null && posSl !== null) { updatePositionLines(posEntry, posTp, posSl, posDir); }
  $: if (series && !showPosition) { clearPositionLines(); }
  $: if (series) { applyAgentTradeSetup(activeTradeSetup); }

  function updatePositionLines(entry: number, tp: number, sl: number, dir: string) {
    if (!series) return;
    clearPositionLines();
    const isLong = dir === 'LONG';
    tpLine = series.createPriceLine({ price: tp, color: chartTheme.tp, lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: `TP ${isLong ? '▲' : '▼'} $${Math.round(tp).toLocaleString()}` });
    entryLine = series.createPriceLine({ price: entry, color: chartTheme.entry, lineWidth: 2, lineStyle: 1, axisLabelVisible: true, title: `ENTRY $${Math.round(entry).toLocaleString()}` });
    slLine = series.createPriceLine({ price: sl, color: chartTheme.sl, lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: `SL ${isLong ? '▼' : '▲'} $${Math.round(sl).toLocaleString()}` });
  }

  function clearPositionLines() {
    if (tpLine && series) { try { series.removePriceLine(tpLine); } catch {} tpLine = null; }
    if (entryLine && series) { try { series.removePriceLine(entryLine); } catch {} entryLine = null; }
    if (slLine && series) { try { series.removePriceLine(slLine); } catch {} slLine = null; }
  }

  // ═══ Drag TP/SL ═══
  let isDragging: 'tp' | 'sl' | 'entry' | null = null;
  let hoverLine: 'tp' | 'sl' | 'entry' | null = null;

  function handleChartMouseDown(e: MouseEvent) {
    if (!chart || !series || !showPosition || posEntry === null || posTp === null || posSl === null) return;
    const y = e.clientY - chartContainer.getBoundingClientRect().top;
    const price = priceFromY(y);
    if (price === null) return;
    const target = resolvePositionInteractionTarget(price, {
      entry: posEntry,
      tp: posTp,
      sl: posSl,
    });
    if (!target) return;
    isDragging = target;
    chartContainer.style.cursor = 'ns-resize'; e.preventDefault();
  }

  function handleChartMouseMove(e: MouseEvent) {
    if (!chart || !series) return;
    const y = e.clientY - chartContainer.getBoundingClientRect().top;
    const price = priceFromY(y);
    if (price === null) return;
    if (isDragging) {
      dispatch(isDragging === 'tp' ? 'dragTP' : isDragging === 'sl' ? 'dragSL' : 'dragEntry', { price: Math.round(price) });
    } else if (showPosition && posEntry !== null && posTp !== null && posSl !== null) {
      const target = resolvePositionInteractionTarget(price, {
        entry: posEntry,
        tp: posTp,
        sl: posSl,
      });
      if (target) { hoverLine = target; chartContainer.style.cursor = 'ns-resize'; }
      else { hoverLine = null; chartContainer.style.cursor = ''; }
    }
  }

  function handleChartMouseUp() { if (isDragging) { isDragging = null; hoverLine = null; chartContainer.style.cursor = ''; } }

  function handleChartWheel(e: WheelEvent) {
    if (!chart || !series || !showPosition || posEntry === null || posTp === null || posSl === null) return;
    const target = hoverLine || isDragging;
    if (!target) return;
    e.preventDefault(); e.stopPropagation();
    const basePrice = posEntry || livePrice;
    const nextPrice = getNextPositionWheelPrice({
      target,
      levels: { entry: posEntry, tp: posTp, sl: posSl },
      basePrice,
      deltaY: e.deltaY,
    });
    dispatch(target === 'tp' ? 'dragTP' : target === 'sl' ? 'dragSL' : 'dragEntry', { price: nextPrice });
  }

  function priceFromY(y: number): number | null { if (!series) return null; try { return series.coordinateToPrice(y); } catch { return null; } }

  $: if (series) { applyCombinedMarkers(); }

  export function getCurrentPrice() { return livePrice; }

  // ═══════════════════════════════════════════
  //  CHART INIT & DATA LOADING
  // ═══════════════════════════════════════════

  onMount(async () => {
    try {
      lwcModule = await import('lightweight-charts');
      const lwc = lwcModule;
      chartTheme = resolveChartTheme(chartContainer);

      if (advancedMode && indicatorStripState === 'expanded') {
        indicatorStripState = 'collapsed';
        showIndicatorLegend = false;
        chartVisualMode = 'focus';
      }

      if (_indicatorProfileApplied === null) {
        applyIndicatorProfile();
        _indicatorProfileApplied = advancedMode ? `advanced:${chartVisualMode}` : 'basic';
      }

      const compactViewport = isCompactViewport();
      chart = lwc.createChart(chartContainer, {
        width: chartContainer.clientWidth, height: chartContainer.clientHeight,
        layout: {
          background: { type: lwc.ColorType.Solid, color: chartTheme.bg },
          textColor: chartTheme.text,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: compactViewport ? 12 : 11
        },
        grid: { vertLines: { color: chartTheme.grid }, horzLines: { color: chartTheme.grid } },
        crosshair: {
          mode: lwc.CrosshairMode.Normal,
          vertLine: { labelBackgroundColor: withAlpha('#122031', 0.94) },
          horzLine: { labelBackgroundColor: withAlpha('#122031', 0.94) }
        },
        rightPriceScale: {
          autoScale: true,
          borderColor: chartTheme.border,
          minimumWidth: compactViewport ? 88 : 74,
          scaleMargins: { top: 0.04, bottom: 0.08 }
        },
        timeScale: {
          borderColor: chartTheme.border,
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 6,
          barSpacing,
          minBarSpacing: 3
        },
        handleScale: {
          axisPressedMouseMove: { time: true, price: true },
          mouseWheel: true,
          pinch: true,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        }
      });

      series = chart.addSeries(lwc.CandlestickSeries, {
        upColor: chartTheme.candleUp,
        downColor: chartTheme.candleDown,
        wickUpColor: chartTheme.candleUp,
        wickDownColor: chartTheme.candleDown,
        borderVisible: true,
        borderUpColor: withAlpha(chartTheme.candleUp, 1),
        borderDownColor: withAlpha(chartTheme.candleDown, 1)
      });

      // MA lines on main pane
      const maOpts = (color: string, lineWidth = 1, lineStyle = 0) => ({
        color,
        lineWidth,
        lineStyle,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      ma7Series = chart.addSeries(lwc.LineSeries, maOpts(chartTheme.ma7, 1, 2));
      ma20Series = chart.addSeries(lwc.LineSeries, maOpts(chartTheme.ma20, 2, 0));
      ma25Series = chart.addSeries(lwc.LineSeries, maOpts(chartTheme.ma25, 1, 2));
      ma60Series = chart.addSeries(lwc.LineSeries, maOpts(chartTheme.ma60, 2, 0));
      ma99Series = chart.addSeries(lwc.LineSeries, maOpts(chartTheme.ma99, 1, 2));
      ma120Series = chart.addSeries(lwc.LineSeries, maOpts(chartTheme.ma120, 2, 0));

      // ═══ Volume Pane ═══
      chart.addPane();
      const volIdx = chart.panes().length - 1;
      volumePaneIndex = volIdx;
      volumeSeries = chart.addSeries(lwc.HistogramSeries, { priceFormat: { type: 'volume' }, lastValueVisible: true, priceLineVisible: false }, volIdx);
      chart.panes()[volIdx].setStretchFactor(0.12);

      // ═══ RSI Pane ═══
      chart.addPane();
      const rsiIdx = chart.panes().length - 1;
      rsiPaneIndex = rsiIdx;
      rsiSeries = chart.addSeries(lwc.LineSeries, {
        color: chartTheme.rsi,
        lineWidth: 1.5,
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerVisible: false
      }, rsiIdx);
      rsiSeries.createPriceLine({ price: 70, color: chartTheme.rsiTop, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
      rsiSeries.createPriceLine({ price: 30, color: chartTheme.rsiBottom, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
      rsiSeries.createPriceLine({ price: 50, color: chartTheme.rsiMid, lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '' });
      chart.panes()[rsiIdx].setStretchFactor(0.12);
      applyTimeScale();
      applyIndicatorVisibility();

      await loadKlines();

      const unbindRuntime = bindChartRuntimeInteractions({
        chart,
        chartContainer,
        isAgentMode: () => chartMode === 'agent',
        isTradeLineEntryEnabled: () => enableTradeLineEntry,
        onLoadMoreHistory: () => {
          void loadMoreHistory();
        },
        onScheduleVisiblePatternScan: scheduleVisiblePatternScan,
        onRenderDrawings: renderDrawings,
        onResizeDrawingCanvas: resizeDrawingCanvas,
        onSetDrawingMode: setDrawingMode,
        onZoomChart: zoomChart,
        onResetChartScale: resetChartScale,
        onFitChartRange: fitChartRange,
        onToggleDrawingsVisible: toggleDrawingsVisible,
      });

      cleanup = () => {
        unbindRuntime();
        if (wsCleanup) { wsCleanup(); wsCleanup = null; }
        if (priceWsCleanup) { priceWsCleanup(); priceWsCleanup = null; }
        clearPositionLines();
        clearPatternLineSeries();
        destroyTradingView();
        if (chart) {
          chart.remove();
          chart = null;
        }
      };
    } catch (e) { error = 'Chart initialization failed'; console.error(e); }
  });

  // ═══ Lazy-load older candles when user scrolls left ═══
  async function loadMoreHistory() {
    if (_isLoadingMore || _noMoreHistory || !series || !chart || klineCache.length === 0) return;
    _isLoadingMore = true;

    try {
      const earliest = klineCache[0];
      const endTimeMs = earliest.time * 1000 - 1; // just before the earliest candle
      const older = await fetchKlines(_currentSymbol, _currentInterval, 1000, endTimeMs);
      if (!series || !chart || older.length === 0) { _noMoreHistory = true; _isLoadingMore = false; return; }

      // Deduplicate: remove any overlap
      const earliestTime = earliest.time;
      const unique = older.filter(k => k.time < earliestTime);
      if (unique.length === 0) { _noMoreHistory = true; _isLoadingMore = false; return; }

      // Prepend to cache
      klineCache = [...unique, ...klineCache];

      // Re-set all series data
      series.setData(klineCache.map(k => ({ time: k.time, open: k.open, high: k.high, low: k.low, close: k.close })));
      if (volumeSeries) volumeSeries.setData(klineCache.map(k => ({
        time: k.time,
        value: k.volume,
        color: k.close >= k.open ? chartTheme.volumeUp : chartTheme.volumeDown
      })));

      const closes = klineCache.map(k => ({ time: k.time, close: k.close }));
      if (ma7Series) ma7Series.setData(computeSMA(closes, 7));
      if (ma20Series) ma20Series.setData(computeSMA(closes, 20));
      if (ma25Series) ma25Series.setData(computeSMA(closes, 25));
      if (ma60Series) ma60Series.setData(computeSMA(closes, 60));
      if (ma99Series) ma99Series.setData(computeSMA(closes, 99));
      if (ma120Series) ma120Series.setData(computeSMA(closes, 120));
      if (rsiSeries) {
        const rsiData = computeRSI(closes, 14);
        rsiSeries.setData(rsiData);
        if (rsiData.length > 0) rsiVal = rsiData[rsiData.length - 1].value;
      }
      latestVolume = klineCache[klineCache.length - 1]?.volume || 0;
      runPatternDetection('visible', { fallbackToFull: true });
      // Don't call fitContent — preserve user's scroll position
    } catch (e) {
      console.error('[ChartPanel] loadMoreHistory error:', e);
    }
    _isLoadingMore = false;
  }

  async function loadKlines(overrideSymbol?: string, overrideInterval?: string) {
    if (!series || !volumeSeries || !chart) return;
    const sym = overrideSymbol || symbol;
    const intv = overrideInterval || interval;
    const pairBase = (state.pair.split('/')[0] || 'BTC').toUpperCase();
    _currentSymbol = sym;
    _currentInterval = intv;
    _noMoreHistory = false;
    detectedPatterns = [];
    patternMarkers = [];
    _patternSignature = '';
    applyCombinedMarkers();
    clearPatternLineSeries();
    isLoading = true; error = '';

    try {
      const [klines, ticker24] = await Promise.all([
        fetchKlines(sym, intv, 1000),
        fetch24hr(sym).catch(() => null)
      ]);
      if (!series || !chart) return;
      if (klines.length === 0) { error = 'No data received'; isLoading = false; return; }

      // Candles
      series.setData(klines.map(k => ({ time: k.time, open: k.open, high: k.high, low: k.low, close: k.close })));

      // Volume
      volumeSeries.setData(klines.map(k => ({
        time: k.time,
        value: k.volume,
        color: k.close >= k.open ? chartTheme.volumeUp : chartTheme.volumeDown
      })));

      // ═══ Indicators ═══
      klineCache = klines;
      const closes = klines.map(k => ({ time: k.time, close: k.close }));

      if (ma7Series) ma7Series.setData(computeSMA(closes, 7));
      if (ma20Series) ma20Series.setData(computeSMA(closes, 20));
      if (ma25Series) ma25Series.setData(computeSMA(closes, 25));
      if (ma60Series) ma60Series.setData(computeSMA(closes, 60));
      if (ma99Series) ma99Series.setData(computeSMA(closes, 99));
      if (ma120Series) ma120Series.setData(computeSMA(closes, 120));
      if (rsiSeries) {
        const rsiData = computeRSI(closes, 14);
        rsiSeries.setData(rsiData);
        if (rsiData.length > 0) rsiVal = rsiData[rsiData.length - 1].value;
      }
      runPatternDetection('visible', { fallbackToFull: true });

      // Cache MA display values
      const len = klines.length;
      if (len >= 7) ma7Val = klines.slice(-7).reduce((a, k) => a + k.close, 0) / 7;
      if (len >= 20) ma20Val = klines.slice(-20).reduce((a, k) => a + k.close, 0) / 20;
      if (len >= 25) ma25Val = klines.slice(-25).reduce((a, k) => a + k.close, 0) / 25;
      if (len >= 60) ma60Val = klines.slice(-60).reduce((a, k) => a + k.close, 0) / 60;
      if (len >= 99) ma99Val = klines.slice(-99).reduce((a, k) => a + k.close, 0) / 99;
      if (len >= 120) ma120Val = klines.slice(-120).reduce((a, k) => a + k.close, 0) / 120;

      const lastKline = klines[len - 1];
      latestVolume = lastKline.volume;
      livePrice = lastKline.close;
      if (ticker24 && Number.isFinite(Number(ticker24.priceChangePercent))) {
        priceChange24h = Number(ticker24.priceChangePercent);
        const parsedHigh = Number((ticker24 as any).highPrice);
        const parsedLow = Number((ticker24 as any).lowPrice);
        const parsedQuoteVol = Number((ticker24 as any).quoteVolume);
        if (Number.isFinite(parsedHigh) && parsedHigh > 0) high24h = parsedHigh;
        if (Number.isFinite(parsedLow) && parsedLow > 0) low24h = parsedLow;
        if (Number.isFinite(parsedQuoteVol) && parsedQuoteVol > 0) quoteVolume24h = parsedQuoteVol;
      } else if (len > 6) {
        priceChange24h = ((lastKline.close - klines[len - 7].close) / klines[len - 7].close) * 100;
        hydrate24hStatsFromKlines(klines);
      } else {
        hydrate24hStatsFromKlines(klines);
      }

      // 초기 kline 로드 시 즉시 priceStore에 반영 (Header 즉시 업데이트)
      flushPriceUpdate(lastKline.close, pairBase);
      dispatch('priceUpdate', { price: lastKline.close });
      chart.timeScale().fitContent();

      // ═══ WebSocket real-time ═══
      if (wsCleanup) wsCleanup();
      if (priceWsCleanup) {
        priceWsCleanup();
        priceWsCleanup = null;
      }
      wsCleanup = subscribeKlines(sym, intv, (kline: BinanceKline) => {
        if (!series) return;

        series.update({ time: kline.time, open: kline.open, high: kline.high, low: kline.low, close: kline.close });
        if (volumeSeries) {
          volumeSeries.update({
            time: kline.time,
            value: kline.volume,
            color: kline.close >= kline.open ? chartTheme.volumeUp : chartTheme.volumeDown
          });
        }

        // Update kline cache
        const isUpdate = klineCache.length > 0 && klineCache[klineCache.length - 1].time === kline.time;
        const prevClose = isUpdate ? (klineCache.length > 1 ? klineCache[klineCache.length - 2].close : kline.open) : klineCache[klineCache.length - 1]?.close ?? kline.open;
        if (isUpdate) klineCache[klineCache.length - 1] = kline;
        else klineCache.push(kline);
        const cLen = klineCache.length;
        runPatternDetection('visible', { fallbackToFull: true });

        // MA — simple running average from last N
        if (ma7Series && cLen >= 7) {
          let s = 0; for (let i = cLen - 7; i < cLen; i++) s += klineCache[i].close;
          ma7Val = s / 7; ma7Series.update({ time: kline.time, value: ma7Val });
        }
        if (ma20Series && cLen >= 20) {
          let s = 0; for (let i = cLen - 20; i < cLen; i++) s += klineCache[i].close;
          ma20Val = s / 20; ma20Series.update({ time: kline.time, value: ma20Val });
        }
        if (ma25Series && cLen >= 25) {
          let s = 0; for (let i = cLen - 25; i < cLen; i++) s += klineCache[i].close;
          ma25Val = s / 25; ma25Series.update({ time: kline.time, value: ma25Val });
        }
        if (ma60Series && cLen >= 60) {
          let s = 0; for (let i = cLen - 60; i < cLen; i++) s += klineCache[i].close;
          ma60Val = s / 60; ma60Series.update({ time: kline.time, value: ma60Val });
        }
        if (ma99Series && cLen >= 99) {
          let s = 0; for (let i = cLen - 99; i < cLen; i++) s += klineCache[i].close;
          ma99Val = s / 99; ma99Series.update({ time: kline.time, value: ma99Val });
        }
        if (ma120Series && cLen >= 120) {
          let s = 0; for (let i = cLen - 120; i < cLen; i++) s += klineCache[i].close;
          ma120Val = s / 120; ma120Series.update({ time: kline.time, value: ma120Val });
        }

        // RSI — incremental Wilder smoothing
        if (rsiSeries && cLen > 14) {
          const d = kline.close - prevClose;
          _rsiAvgGain = (_rsiAvgGain * 13 + (d > 0 ? d : 0)) / 14;
          _rsiAvgLoss = (_rsiAvgLoss * 13 + (d < 0 ? -d : 0)) / 14;
          const rsi = _rsiAvgLoss === 0 ? 100 : 100 - 100 / (1 + _rsiAvgGain / _rsiAvgLoss);
          rsiSeries.update({ time: kline.time, value: rsi });
          rsiVal = rsi;
        }

        livePrice = kline.close;
        latestVolume = kline.volume;
        throttledPriceUpdate(kline.close, pairBase);
        dispatch('priceUpdate', { price: kline.close });
      });

      // Keep displayed price synced to trade ticker (closer match with TradingView quote).
      priceWsCleanup = subscribeMiniTicker(
        [sym],
        (update) => {
          const tick = update[sym];
          if (!Number.isFinite(tick) || tick <= 0) return;
          livePrice = tick;
          throttledPriceUpdate(tick, pairBase);
          dispatch('priceUpdate', { price: tick });
        },
        (updates) => {
          const full = updates[sym];
          if (!full) return;
          if (Number.isFinite(full.change24h)) priceChange24h = full.change24h;
          if (Number.isFinite(full.high24h) && full.high24h > 0) high24h = full.high24h;
          if (Number.isFinite(full.low24h) && full.low24h > 0) low24h = full.low24h;
          if (Number.isFinite(full.volume24h) && full.volume24h > 0) quoteVolume24h = full.volume24h;
        }
      );

      isLoading = false;
    } catch (e: any) {
      console.error('[ChartPanel] API error:', e);
      error = `API Error: ${e.message || 'Failed'}`;
      isLoading = false;
      if (klineCache.length === 0) {
        const pairBase = (state.pair.split('/')[0] || 'BTC') as keyof typeof state.prices;
        const fallback = state.prices[pairBase] || state.prices.BTC;
        if (Number.isFinite(fallback) && fallback > 0) livePrice = fallback;
      }
    }
  }

  function loadFallbackData() {
    if (!series || !chart) return;
    const basePrice = state.prices.BTC || 97000;
    const candles = generateCandles(201, basePrice);
    series.setData(candles);
    chart.timeScale().fitContent();
    livePrice = basePrice;
    const fallbackInterval = setInterval(() => {
      const last = candles[candles.length - 1];
      const change = (Math.random() - 0.48) * 80;
      const newClose = last.close + change;
      const time = (last.time as number) + 14400;
      const nc = { time, open: last.close, high: Math.max(last.close, newClose) + Math.random() * 40, low: Math.min(last.close, newClose) - Math.random() * 40, close: newClose };
      candles.push(nc); series.update(nc); livePrice = newClose;
      dispatch('priceUpdate', { price: newClose });
    }, 1500);
    if (cleanup) { const old = cleanup; cleanup = () => { clearInterval(fallbackInterval); old(); }; }
  }

  function generateCandles(count: number, basePrice: number) {
    const candles = [];
    let t = Math.floor(Date.now() / 1000) - count * 14400, price = basePrice;
    for (let i = 0; i < count; i++) {
      const change = (Math.random() - 0.48) * 120;
      const open = price, close = price + change;
      candles.push({ time: t, open, high: Math.max(open, close) + Math.random() * 60, low: Math.min(open, close) - Math.random() * 60, close });
      price = close; t += 14400;
    }
    return candles;
  }

  function changePair(pair: string) {
    gtmEvent('terminal_pair_change', { pair });
    pendingTradePlan = null;
    gameState.update(s => ({ ...s, pair }));
    loadKlines(pairToSymbol(pair), interval);
  }
  function changeTF(tf: string) {
    const normalized = normalizeTimeframe(tf);
    gtmEvent('terminal_timeframe_change', { timeframe: normalized });
    pendingTradePlan = null;
    gameState.update(s => ({ ...s, timeframe: normalized }));
    loadKlines(symbol, toBinanceInterval(normalized));
  }

  function requestAgentScan() {
    gtmEvent('terminal_scan_request_chart', {
      source: 'chart-bar',
      pair: state.pair,
      timeframe: state.timeframe,
    });
    dispatch('scanrequest', {
      source: 'chart-bar',
      pair: state.pair,
      timeframe: state.timeframe,
    });
  }

  function requestChatAssist() {
    gtmEvent('terminal_chat_request_chart', {
      source: 'chart-bar',
      pair: state.pair,
      timeframe: state.timeframe,
      tradeReady: chatTradeReady,
      tradeDir: chatTradeDir,
    });
    if (chatTradeReady) {
      void activateTradeDrawing(chatTradeDir);
      pushChartNotice(`${chatTradeDir} draw mode active`);
      return;
    }
    dispatch('chatrequest', {
      source: 'chart-bar',
      pair: state.pair,
      timeframe: state.timeframe,
    });
    pushChartNotice('채팅 탭에서 질문 후 거래를 시작하세요');
  }

  export async function activateTradeDrawing(dir?: 'LONG' | 'SHORT') {
    if (!enableTradeLineEntry) return;
    if (chartMode !== 'agent') {
      await setChartMode('agent');
      await tick();
    }
    const mode: DrawingMode = dir === 'SHORT' ? 'shortentry' : dir === 'LONG' ? 'longentry' : 'trade';
    setDrawingMode(mode);
    gtmEvent('terminal_trade_drawing_activate', {
      source: dir ? 'chat-first' : 'unified-tool',
      dir: dir ?? 'auto',
      pair: state.pair,
      timeframe: state.timeframe,
    });
    if (dir) {
      pushChartNotice(`${dir} mode — drag on chart to set ENTRY/TP/SL`);
    } else {
      pushChartNotice('Position mode — drag down LONG · drag up SHORT');
    }
  }

  onDestroy(() => {
    if (_patternRangeScanTimer) clearTimeout(_patternRangeScanTimer);
    if (_priceUpdateTimer) clearTimeout(_priceUpdateTimer);
    if (_tvInitTimer) clearTimeout(_tvInitTimer);
    if (_tvLoadTimer) clearTimeout(_tvLoadTimer);
    if (_chartNoticeTimer) clearTimeout(_chartNoticeTimer);
    if (_drawRAF) cancelAnimationFrame(_drawRAF);
    unbindGlobalDrawingMouseUp();
    unbindRatioDrag();
    runChartCleanup();
  });
</script>

<div class="chart-wrapper" class:tv-like={isTvLikePreset}>
  <div class="chart-bar">
    <div class="bar-top top-meta">
      <div class="pair-summary">
        {#if chartMode === 'trading'}
          <span class="pair-name">{pairBaseLabel}/{pairQuoteLabel}</span>
        {/if}
        <span class="pair-k">LAST</span>
        <span class="pair-last">${formatPrice(livePrice)}</span>
        <span class="pair-move" class:up={priceChange24h >= 0} class:down={priceChange24h < 0}>
          {priceChange24h >= 0 ? '+' : '-'}{Math.abs(priceChange24h).toFixed(2)}%
        </span>
      </div>
      <div class="market-stats">
        <div class="mstat">
          <span class="mstat-k">24H LOW</span>
          <span class="mstat-v">{low24h > 0 ? formatPrice(low24h) : '—'}</span>
        </div>
        <div class="mstat">
          <span class="mstat-k">24H HIGH</span>
          <span class="mstat-v">{high24h > 0 ? formatPrice(high24h) : '—'}</span>
        </div>
        <div class="mstat wide">
          <span class="mstat-k">24H VOL(USDT)</span>
          <span class="mstat-v">{quoteVolume24h > 0 ? formatCompact(quoteVolume24h) : '—'}</span>
        </div>
      </div>
    </div>

    <div class="bar-tools">
      <div class="bar-left">
        <div class="live-indicator">
          <span class="live-dot" class:err={!!error}></span>
          {error ? 'OFFLINE' : 'LIVE'}
        </div>

        {#if chartMode === 'agent'}
          <div class="pair-slot">
            <TokenDropdown value={state.pair} compact={isCompactViewport()} on:select={e => changePair(e.detail.pair)} />
          </div>
        {/if}

        <div class="tf-compact">
          <span class="tf-compact-label">TF</span>
          <select
            class="tf-compact-select"
            value={normalizeTimeframe(state.timeframe)}
            on:change={(e) => changeTF((e.currentTarget as HTMLSelectElement).value)}
            aria-label="Timeframe"
          >
            {#each CORE_TIMEFRAME_OPTIONS as tf}
              <option value={tf.value}>{tf.label}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="tf-btns">
        {#each CORE_TIMEFRAME_OPTIONS as tf}
          <button
            class="tfbtn"
            class:active={normalizeTimeframe(state.timeframe) === tf.value}
            on:click={() => changeTF(tf.value)}
          >
            {tf.label}
          </button>
        {/each}
      </div>

      <div class="bar-controls">
        <div class="mode-toggle">
          <button class="mode-btn" class:active={chartMode === 'agent'} on:click={() => setChartMode('agent')}>
            AGENT
          </button>
          <button class="mode-btn" class:active={chartMode === 'trading'} on:click={() => setChartMode('trading')}>
            TRADING
          </button>
        </div>

        {#if chartMode === 'agent'}
          <div class="draw-tools">
            {#if !isTvLikePreset}
              <button class="draw-btn" class:active={drawingMode === 'hline'} on:click={() => setDrawingMode(drawingMode === 'hline' ? 'none' : 'hline')} title="Horizontal Line">&#x2500;</button>
              <button class="draw-btn" class:active={drawingMode === 'trendline'} on:click={() => setDrawingMode(drawingMode === 'trendline' ? 'none' : 'trendline')} title="Trend Line">&#x2571;</button>
            {/if}
            {#if enableTradeLineEntry}
              <button class="draw-btn trade-tool" class:active={drawingMode === 'trade' || drawingMode === 'longentry' || drawingMode === 'shortentry'} on:click={() => setDrawingMode(drawingMode === 'trade' ? 'none' : 'trade')} title="Position Tool (R) — drag down LONG · drag up SHORT">⬡</button>
            {/if}
            {#if drawings.length > 0 || activeTradeSetup}
              <button class="draw-btn vis-toggle" class:off={!drawingsVisible} on:click={toggleDrawingsVisible} title={drawingsVisible ? 'Hide drawings (V)' : 'Show drawings (V)'}>
                {drawingsVisible ? '◉' : '○'}<span class="vis-count">{drawings.length}</span>
              </button>
            {/if}
            <button class="draw-btn clear-btn" on:click={clearAllDrawings} title="Clear">&#x2715;</button>
          </div>
        {/if}

        {#if chartMode === 'agent'}
          {#if chatFirstMode}
            <button
              class="scan-btn chat-trigger"
              class:ready={chatTradeReady}
              on:click={requestChatAssist}
              title={chatTradeReady ? `AI answer ready. Start ${chatTradeDir} drag on chart.` : 'Open Intel chat and ask AI first'}
            >
              {chatTradeReady ? `START ${chatTradeDir}` : 'OPEN CHAT'}
            </button>
          {:else}
            <button class="scan-btn" on:click={requestAgentScan} title="Run agent scan for current market">
              SCAN
            </button>
          {/if}
          <button
            class="scan-btn pattern-trigger"
            on:click={forcePatternScan}
            title="Re-scan head and shoulders / falling wedge patterns"
          >
            PATTERN
          </button>

          {#if advancedMode && indicatorStripState === 'hidden' && !isTvLikePreset}
            <button class="strip-restore-btn" on:click={() => setIndicatorStripState('expanded')}>IND ON</button>
          {/if}
        {/if}

      </div>
    </div>

    {#if chartMode === 'agent' && klineCache.length > 0 && !advancedMode}
      <div class="bar-meta">
        <div class="ma-vals">
          <span class="ma-tag" style="color:{chartTheme.ma7}">MA(7) {ma7Val.toLocaleString('en-US',{maximumFractionDigits:1})}</span>
          <span class="ma-tag" style="color:{chartTheme.ma25}">MA(25) {ma25Val.toLocaleString('en-US',{maximumFractionDigits:1})}</span>
          <span class="ma-tag" style="color:{chartTheme.ma99}">MA(99) {ma99Val.toLocaleString('en-US',{maximumFractionDigits:1})}</span>
          <span class="ma-tag">RSI14 {Number.isFinite(rsiVal) ? rsiVal.toFixed(2) : '—'}</span>
          <span class="ma-tag">VOL {formatCompact(latestVolume)}</span>
        </div>
      </div>
    {/if}
  </div>

  {#if chartMode === 'agent' && advancedMode && indicatorStripState !== 'hidden'}
    <div class="indicator-strip" class:collapsed={indicatorStripState === 'collapsed'}>
      {#if indicatorStripState === 'expanded'}
        <div class="view-mode">
          <button class="view-chip" class:on={chartVisualMode === 'focus'} on:click={() => setChartVisualMode('focus')}>FOCUS</button>
          <button class="view-chip" class:on={chartVisualMode === 'full'} on:click={() => setChartVisualMode('full')}>FULL</button>
        </div>
        <button class="ind-chip" class:on={indicatorEnabled.ma20} on:click={() => toggleIndicator('ma20')} style="--ind-color:{chartTheme.ma20}">
          MA20 <span>{formatPrice(ma20Val)}</span>
        </button>
        <button class="ind-chip" class:on={indicatorEnabled.ma60} on:click={() => toggleIndicator('ma60')} style="--ind-color:{chartTheme.ma60}">
          MA60 <span>{formatPrice(ma60Val)}</span>
        </button>
        <button class="ind-chip optional" class:on={indicatorEnabled.ma120} on:click={() => toggleIndicator('ma120')} style="--ind-color:{chartTheme.ma120}">
          MA120 <span>{formatPrice(ma120Val)}</span>
        </button>
        {#if chartVisualMode === 'full'}
          <button class="ind-chip muted" class:on={indicatorEnabled.ma7} on:click={() => toggleIndicator('ma7')} style="--ind-color:{chartTheme.ma7}">
            MA7
          </button>
          <button class="ind-chip muted" class:on={indicatorEnabled.ma25} on:click={() => toggleIndicator('ma25')} style="--ind-color:{chartTheme.ma25}">
            MA25
          </button>
          <button class="ind-chip muted" class:on={indicatorEnabled.ma99} on:click={() => toggleIndicator('ma99')} style="--ind-color:{chartTheme.ma99}">
            MA99
          </button>
        {/if}
        <button class="ind-chip" class:on={indicatorEnabled.rsi} on:click={() => toggleIndicator('rsi')} style="--ind-color:{chartTheme.rsi}">
          RSI14 <span>{Number.isFinite(rsiVal) && rsiVal > 0 ? rsiVal.toFixed(2) : '—'}</span>
        </button>
        <button class="ind-chip" class:on={indicatorEnabled.vol} on:click={() => toggleIndicator('vol')} style="--ind-color:{chartTheme.candleUp}">
          VOL <span>{formatCompact(latestVolume)}</span>
        </button>
        <button class="legend-chip" class:on={showIndicatorLegend} on:click={toggleIndicatorLegend}>LABELS</button>
        <button class="legend-chip" on:click={() => setIndicatorStripState('collapsed')}>접기</button>
        <button class="legend-chip danger" on:click={() => setIndicatorStripState('hidden')}>끄기</button>
        {#if enableTradeLineEntry}
          <span class="ind-hint">L/S drag · +/- zoom · 0 reset</span>
        {/if}
      {:else}
        <div class="collapsed-summary">
          <span class="sum-title">INDICATORS</span>
          <span class="sum-item">MA20 {formatPrice(ma20Val)}</span>
          <span class="sum-item">MA60 {formatPrice(ma60Val)}</span>
          <span class="sum-item optional">MA120 {formatPrice(ma120Val)}</span>
          <span class="sum-item">RSI14 {Number.isFinite(rsiVal) && rsiVal > 0 ? rsiVal.toFixed(2) : '—'}</span>
          <span class="sum-item">VOL {formatCompact(latestVolume)}</span>
        </div>
        {#if !isTvLikePreset}
          <div class="strip-actions">
            <button class="legend-chip" class:on={showIndicatorLegend} on:click={toggleIndicatorLegend}>LABELS</button>
            <button class="legend-chip" on:click={() => setIndicatorStripState('expanded')}>펴기</button>
            <button class="legend-chip danger" on:click={() => setIndicatorStripState('hidden')}>끄기</button>
          </div>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="chart-container" bind:this={chartContainer}
    class:hidden-chart={chartMode !== 'agent'}
    on:mousedown={handleChartMouseDown} on:mousemove={handleChartMouseMove}
    on:mouseup={handleChartMouseUp} on:mouseleave={handleChartMouseUp} on:wheel={handleChartWheel}>
    {#if isLoading && chartMode === 'agent'}
      <div class="loading-overlay"><div class="loader"></div><span>Loading {symbol}...</span></div>
    {/if}
    {#if error && chartMode === 'agent'}
      <div class="error-badge">{error}</div>
    {/if}
    {#if chartMode === 'agent'}
      <div class="scale-tools">
        <button class="scale-btn" on:click={() => zoomChart(-1)} title="Zoom Out">-</button>
        <button class="scale-btn" on:click={() => zoomChart(1)} title="Zoom In">+</button>
        <button class="scale-btn wide" on:click={fitChartRange} title="Fit Time Range">FIT</button>
        <button class="scale-btn wide" class:on={autoScaleY} on:click={toggleAutoScaleY} title="Y Auto Scale">Y-AUTO</button>
        <button class="scale-btn wide" on:click={resetChartScale} title="Reset Scale">RESET</button>
      </div>
    {/if}
    {#if chartMode === 'agent' && advancedMode && showIndicatorLegend}
      <div class="indicator-legend">
        {#if indicatorEnabled.ma20}
          <span class="legend-item" style="--legend-color:{chartTheme.ma20}">MA20 {ma20Val > 0 ? formatPrice(ma20Val) : '—'}</span>
        {/if}
        {#if indicatorEnabled.ma60}
          <span class="legend-item" style="--legend-color:{chartTheme.ma60}">MA60 {ma60Val > 0 ? formatPrice(ma60Val) : '—'}</span>
        {/if}
        {#if indicatorEnabled.ma120}
          <span class="legend-item" style="--legend-color:{chartTheme.ma120}">MA120 {ma120Val > 0 ? formatPrice(ma120Val) : '—'}</span>
        {/if}
        {#if indicatorEnabled.ma7}
          <span class="legend-item" style="--legend-color:{chartTheme.ma7}">MA7 {ma7Val > 0 ? formatPrice(ma7Val) : '—'}</span>
        {/if}
        {#if indicatorEnabled.ma25}
          <span class="legend-item" style="--legend-color:{chartTheme.ma25}">MA25 {ma25Val > 0 ? formatPrice(ma25Val) : '—'}</span>
        {/if}
        {#if indicatorEnabled.ma99}
          <span class="legend-item" style="--legend-color:{chartTheme.ma99}">MA99 {ma99Val > 0 ? formatPrice(ma99Val) : '—'}</span>
        {/if}
        {#if indicatorEnabled.rsi}
          <span class="legend-item" style="--legend-color:{chartTheme.rsi}">RSI14(상대강도지수) {rsiVal > 0 ? rsiVal.toFixed(2) : '—'}</span>
        {/if}
        {#if indicatorEnabled.vol}
          <span class="legend-item" style="--legend-color:{chartTheme.candleUp}">VOL(거래량) {latestVolume > 0 ? formatCompact(latestVolume) : '—'}</span>
        {/if}
      </div>
    {/if}

    {#if chartMode === 'agent'}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <canvas class="drawing-canvas" bind:this={drawingCanvas}
        class:drawing-active={drawingMode !== 'none'}
        on:mousedown={handleDrawingMouseDown} on:mousemove={handleDrawingMouseMove} on:mouseup={handleDrawingMouseUp}></canvas>
    {/if}

    <!-- ═══ Overlay close button (HTML, always clickable above canvas) ═══ -->
    {#if activeTradeSetup && drawingsVisible && chartMode === 'agent'}
      <button class="overlay-close-btn"
        on:click|stopPropagation={() => { activeTradeSetup = null; _agentCloseBtn = null; dispatch('clearTradeSetup'); renderDrawings(); }}
        title="Close overlay">&#x2715;</button>
    {/if}

    <!-- ═══ First-scan CTA (shows before any scan) ═══ -->
    {#if !hasScanned && !activeTradeSetup && chartMode === 'agent'}
      <div class="first-scan-cta">
        <div class="fsc-inline">
          <span class="fsc-sub">No agent scan yet</span>
          <button class="fsc-btn" on:click={requestAgentScan}>
            <span class="fsc-icon">&#x25C9;</span>
            <span class="fsc-label">RUN FIRST SCAN</span>
          </button>
        </div>
      </div>
    {/if}

    <!-- ═══ Post-scan Trade CTA (shows after scan with active setup) ═══ -->
    {#if activeTradeSetup && chartMode === 'agent'}
      <div class="trade-cta-bar">
        <span class="tcb-dir" class:long={activeTradeSetup.dir === 'LONG'} class:short={activeTradeSetup.dir === 'SHORT'}>
          {activeTradeSetup.dir === 'LONG' ? '▲' : '▼'} {activeTradeSetup.dir}
        </span>
        <span class="tcb-conf">{activeTradeSetup.conf}%</span>
        <span class="tcb-rr">R:R 1:{activeTradeSetup.rr.toFixed(1)}</span>
        <button class="tcb-execute" class:long={activeTradeSetup.dir === 'LONG'} class:short={activeTradeSetup.dir === 'SHORT'}
          on:click={() => {
            if (activeTradeSetup) openQuickTrade(activeTradeSetup.pair, activeTradeSetup.dir as TradeDirection, activeTradeSetup.entry, activeTradeSetup.tp, activeTradeSetup.sl);
          }}>
          EXECUTE {activeTradeSetup.dir}
        </button>
      </div>
    {/if}

    {#if drawingMode !== 'none' && chartMode === 'agent'}
      <div class="drawing-indicator">
        {#if drawingMode === 'hline'}
          ── CLICK to place horizontal line
        {:else if drawingMode === 'trendline'}
          CLICK two points for trend line
        {:else if drawingMode === 'trade'}
          Position — drag down LONG · drag up SHORT
        {:else if drawingMode === 'longentry'}
          LONG — drag to set ENTRY / SL / TP
        {:else if drawingMode === 'shortentry'}
          SHORT — drag to set ENTRY / SL / TP
        {/if}
        <button class="drawing-cancel" on:click={() => setDrawingMode('none')}>ESC</button>
      </div>
    {/if}

    {#if chartNotice}
      <div class="chart-notice">{chartNotice}</div>
    {/if}

    {#if showPosition && posEntry !== null && posTp !== null && posSl !== null}
      <div class="pos-overlay">
        <div class="pos-badge {posDir.toLowerCase()}">
          {posDir === 'LONG' ? '▲ LONG' : posDir === 'SHORT' ? '▼ SHORT' : '— NEUTRAL'}
        </div>
        <div class="pos-levels">
          <span class="pos-tp" class:highlight={hoverLine === 'tp' || isDragging === 'tp'}>{hoverLine === 'tp' ? '↕' : ''} TP ${Math.round(posTp).toLocaleString()}</span>
          <span class="pos-entry" class:highlight={hoverLine === 'entry' || isDragging === 'entry'}>{hoverLine === 'entry' ? '↕' : ''} ENTRY ${Math.round(posEntry).toLocaleString()}</span>
          <span class="pos-sl" class:highlight={hoverLine === 'sl' || isDragging === 'sl'}>{hoverLine === 'sl' ? '↕' : ''} SL ${Math.round(posSl).toLocaleString()}</span>
        </div>
        <div class="pos-rr">R:R 1:{(Math.abs(posTp - posEntry) / Math.max(1, Math.abs(posEntry - posSl))).toFixed(1)}</div>
        <div class="pos-hint">DRAG or SCROLL lines to adjust</div>
      </div>
    {/if}

    {#if pendingTradePlan}
      {@const planned = getPlannedTradeOrder(pendingTradePlan)}
      <div class="trade-plan-overlay">
        <div class="trade-plan-header">
          <span class="plan-title">TRADE PLANNER</span>
          <button type="button" class="plan-close" on:click={cancelTradePlan}>✕</button>
        </div>
        <div class="trade-plan-grid">
          <div class="plan-row"><span>SIGNAL</span><strong>{pendingTradePlan.previewDir}</strong></div>
          <div class="plan-row"><span>ENTRY</span><strong>{formatPrice(planned.entry)}</strong></div>
          <div class="plan-row"><span>TP</span><strong class="tp">{formatPrice(planned.tp)}</strong></div>
          <div class="plan-row"><span>SL</span><strong class="sl">{formatPrice(planned.sl)}</strong></div>
          <div class="plan-row"><span>RISK</span><strong>{planned.riskPct.toFixed(2)}%</strong></div>
          <div class="plan-row"><span>R:R</span><strong>1:{planned.rr.toFixed(1)}</strong></div>
        </div>
        <div class="plan-ratio-meta">
          <span class:active={planned.dir === 'LONG'}>LONG {planned.longRatio}%</span>
          <span class:active={planned.dir === 'SHORT'}>SHORT {planned.shortRatio}%</span>
        </div>
        <button
          type="button"
          class="plan-ratio-track"
          bind:this={ratioTrackEl}
          on:pointerdown={handleRatioPointerDown}
          aria-label="Adjust long short ratio"
        >
          <div class="plan-ratio-long" style="width:{planned.longRatio}%"></div>
          <div class="plan-ratio-knob" style="left:calc({planned.longRatio}% - 8px)"></div>
        </button>
        <div class="plan-ratio-presets">
          <button type="button" on:click={() => setTradePlanRatio(80)}>80/20</button>
          <button type="button" on:click={() => setTradePlanRatio(65)}>65/35</button>
          <button type="button" on:click={() => setTradePlanRatio(50)}>50/50</button>
          <button type="button" on:click={() => setTradePlanRatio(35)}>35/65</button>
          <button type="button" on:click={() => setTradePlanRatio(20)}>20/80</button>
        </div>
        <div class="plan-actions">
          <button type="button" class="plan-action ghost" on:click={cancelTradePlan}>CANCEL</button>
          <button type="button" class="plan-action primary" class:long={planned.dir === 'LONG'} class:short={planned.dir === 'SHORT'} on:click={openTradeFromPlan}>
            OPEN {planned.dir}
          </button>
        </div>
      </div>
    {/if}

    {#if chartMode === 'agent'}
      {#each agentAnnotations as ann (ann.id)}
        <button class="chart-annotation" style="top:{ann.yPercent}%;left:{ann.xPercent}%;--ann-color:{ann.color}"
          class:active={selectedAnnotation?.id === ann.id}
          on:click|stopPropagation={() => selectedAnnotation = selectedAnnotation?.id === ann.id ? null : ann}>
          <span class="ann-icon">{ann.icon}</span>
          {#if selectedAnnotation?.id === ann.id}
            <div class="ann-popup">
              <div class="ann-popup-header" style="border-color:{ann.color}">
                <span class="ann-popup-icon">{ann.icon}</span>
                <span class="ann-popup-name" style="color:{ann.color}">{ann.name}</span>
                <span class="ann-popup-type">{ann.type.toUpperCase()}</span>
              </div>
              <div class="ann-popup-label">{ann.label}</div>
              <div class="ann-popup-detail">{ann.detail}</div>
            </div>
          {/if}
        </button>
      {/each}
    {/if}

    {#if isDragging && chartMode === 'agent'}
      <div class="drag-indicator">DRAGGING {isDragging.toUpperCase()} — Release to set</div>
    {/if}
  </div>

  {#if chartMode === 'trading'}
    <div class="tv-container" bind:this={tvContainer}>
      <div id="tradingview_widget" style="width:100%;height:100%"></div>
      {#if tvLoading}
        <div class="loading-overlay"><div class="loader"></div><span>Loading TradingView...</span></div>
      {/if}
      {#if tvError}
        <div class="tv-error-card">
          <div class="tv-error-title">TradingView 연결 오류</div>
          <div class="tv-error-desc">{tvError}</div>
          <div class="tv-error-actions">
            <button class="tv-retry-btn" on:click={retryTradingView}>다시 시도</button>
            <a
              class="tv-open-link"
              href={`https://www.tradingview.com/chart/?symbol=${pairToTVSymbol(state.pair)}`}
              target="_blank"
              rel="noreferrer"
            >
              TradingView에서 열기
            </a>
          </div>
          {#if tvSafeMode}
            <div class="tv-safe-hint">Safe mode로 재시도 중</div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- chart-footer removed: pattern info shown on chart overlay, indicators in legend -->
</div>

<style>
  .chart-wrapper {
    --cp-font-2xs: clamp(8px, 0.56vw, 9px);
    --cp-font-xs: clamp(9px, 0.64vw, 10px);
    --cp-font-sm: clamp(10px, 0.74vw, 11px);
    --cp-font-md: clamp(11px, 0.86vw, 13px);
    --cp-font-lg: clamp(15px, 1.15vw, 18px);
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0a0a1a;
    overflow: hidden;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }
  .chart-bar {
    padding: 3px 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 3px;
    background: linear-gradient(90deg, #1a1a3a, #0a0a2a);
    font-size: 10px;
    font-family: var(--fm);
    flex-shrink: 0;
  }
  .bar-top.top-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    padding-bottom: 1px;
  }
  .bar-top.top-meta::-webkit-scrollbar {
    height: 2px;
  }
  .bar-top.top-meta::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.18);
    border-radius: 999px;
  }
  .pair-summary {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-width: max-content;
    flex: 0 0 auto;
    white-space: nowrap;
  }
  .pair-name {
    color: rgba(232, 237, 247, 0.92);
    font-family: var(--fd);
    font-size: var(--cp-font-md);
    font-weight: 800;
    letter-spacing: .18px;
  }
  .pair-k {
    color: rgba(187, 198, 216, 0.66);
    font-family: var(--fm);
    font-size: var(--cp-font-2xs);
    font-weight: 700;
    letter-spacing: .42px;
  }
  .pair-last {
    color: #f5f8ff;
    font-family: var(--fd);
    font-size: var(--cp-font-lg);
    font-weight: 900;
    letter-spacing: .18px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .pair-move {
    font-family: var(--fd);
    font-size: var(--cp-font-sm);
    font-weight: 800;
    letter-spacing: .12px;
    font-variant-numeric: tabular-nums;
  }
  .pair-move.up { color: #00ff88; }
  .pair-move.down { color: #ff2d55; }
  .pair-move:not(.up):not(.down) { color: rgba(190, 198, 214, 0.9); }
  .bar-left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: max-content;
    flex: 0 0 auto;
  }
  .pair-slot {
    min-width: 128px;
    flex: 0 1 auto;
  }
  .market-stats {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    padding-bottom: 1px;
  }
  .market-stats::-webkit-scrollbar { height: 2px; }
  .market-stats::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.18);
    border-radius: 999px;
  }
  .mstat {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    height: auto;
    padding: 0;
    border: 0;
    background: transparent;
    white-space: nowrap;
  }
  .mstat.wide {
    min-width: auto;
  }
  .mstat-k {
    font-family: var(--fm);
    font-size: var(--cp-font-2xs);
    font-weight: 700;
    letter-spacing: .4px;
    color: rgba(187, 198, 216, 0.66);
  }
  .mstat-v {
    font-family: var(--fd);
    font-size: var(--cp-font-md);
    font-weight: 800;
    letter-spacing: .12px;
    color: rgba(255,255,255,.92);
    font-variant-numeric: tabular-nums;
  }
  .bar-tools {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    padding-top: 1px;
    padding-bottom: 1px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .bar-tools::-webkit-scrollbar { height: 2px; }
  .bar-tools::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.18);
    border-radius: 999px;
  }
  .bar-controls {
    display: flex;
    align-items: center;
    gap: 3px;
    min-width: max-content;
    flex: 0 0 auto;
  }
  .bar-meta {
    display: flex;
    align-items: center;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    padding-bottom: 1px;
  }
  .bar-meta::-webkit-scrollbar { height: 2px; }
  .bar-meta::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.18);
    border-radius: 999px;
  }
  .live-indicator { font-size: var(--cp-font-xs); font-weight: 800; color: var(--grn); display: flex; align-items: center; gap: 4px; letter-spacing: .45px; }
  .live-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--grn); animation: pulse .8s infinite; }
  .live-dot.err { background: #ff2d55; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

  .tf-btns {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    flex: 1 1 auto;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 1px;
    scrollbar-width: thin;
    -webkit-overflow-scrolling: touch;
  }
  .tf-btns::-webkit-scrollbar { height: 2px; }
  .tf-btns::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 999px;
  }
  .tf-compact {
    display: none;
    align-items: center;
    gap: 3px;
    margin-left: 1px;
    min-width: max-content;
    flex: 0 0 auto;
  }
  .tf-compact-label {
    color: rgba(187, 198, 216, 0.66);
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: .5px;
  }
  .tf-compact-select {
    height: 24px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,.2);
    background: rgba(255,255,255,.06);
    color: rgba(232, 237, 247, 0.92);
    font-family: var(--fd);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .35px;
    padding: 0 24px 0 8px;
    appearance: none;
    cursor: pointer;
  }
  .tf-compact-select:focus-visible {
    outline: 1px solid rgba(232,150,125,.45);
    outline-offset: 1px;
  }
  .tfbtn { padding: 2px 7px; border-radius: 4px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); color: #b8c0cc; font-size: var(--cp-font-2xs); font-family: var(--fd); font-weight: 700; letter-spacing: .3px; cursor: pointer; transition: all .15s; }
  .tfbtn:hover { background: rgba(255,255,255,.1); color: #fff; }
  .tfbtn.active { background: rgba(232,150,125,.15); color: #E8967D; border-color: rgba(232,150,125,.3); }

  .ma-vals { display: flex; gap: 8px; flex-wrap: nowrap; white-space: nowrap; }
  .ma-tag { font-size: var(--cp-font-2xs); font-family: var(--fm); font-weight: 700; letter-spacing: .2px; opacity: 1; }

  @media (max-width: 1280px) {
    .pair-last { font-size: clamp(14px, 1.05vw, 16px); }
    .mstat-v { font-size: clamp(10px, 0.72vw, 11px); }
  }

  @media (max-width: 1180px) {
    .tf-btns {
      display: none;
    }
    .tf-compact {
      display: inline-flex;
    }
  }

  @media (max-width: 768px) {
    .chart-bar {
      padding: 4px 6px;
      gap: 3px;
    }
    .bar-top.top-meta {
      gap: 6px;
    }
    .pair-summary {
      gap: 6px;
    }
    .pair-k {
      font-size: 8px;
      letter-spacing: .42px;
    }
    .pair-name {
      font-size: 12px;
      letter-spacing: .25px;
    }
    .pair-last {
      font-size: 14px;
    }
    .pair-move {
      font-size: 10px;
    }
    .market-stats {
      gap: 6px;
    }
    .mstat-k {
      font-size: 8px;
      letter-spacing: .45px;
    }
    .mstat-v {
      font-size: 11px;
    }
    .bar-left {
      gap: 4px;
    }
    .live-indicator {
      font-size: 10px;
      letter-spacing: .6px;
    }
    .pair-slot {
      min-width: 138px;
      flex: 0 0 auto;
    }
    .bar-tools {
      gap: 4px;
    }
    .tf-btns {
      width: auto;
      flex: 0 0 auto;
    }
    .tf-compact {
      margin-left: 0;
    }
    .tf-compact-select {
      height: 24px;
      font-size: 10px;
      padding: 0 20px 0 7px;
    }
    .tfbtn {
      height: 22px;
      padding: 0 7px;
      font-size: 9px;
      letter-spacing: .32px;
      white-space: nowrap;
    }
    .bar-controls {
      gap: 2px;
    }
    .mode-toggle .mode-btn {
      min-height: 22px;
      padding: 0 7px;
      font-size: 9px;
      letter-spacing: .3px;
    }
    .draw-tools .draw-btn {
      width: 22px;
      height: 22px;
      font-size: 9px;
    }
    .scan-btn {
      min-height: 22px;
      height: 22px;
      padding: 0 7px;
      font-size: 9px;
      letter-spacing: .28px;
    }
    .ma-vals {
      gap: 6px;
    }
  }

  .chart-container { flex: 1; position: relative; overflow: hidden; }
  .chart-container.hidden-chart { display: none; }
  .indicator-legend {
    position: absolute;
    top: 6px;
    left: 6px;
    z-index: 7;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px;
    padding: 5px 6px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,.12);
    background: rgba(5,8,16,.82);
    backdrop-filter: blur(4px);
    pointer-events: none;
    max-width: min(460px, 54%);
  }
  .scale-tools {
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    z-index: 8;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,.2);
    background: rgba(7, 12, 20, 0.86);
    backdrop-filter: blur(4px);
    box-shadow: 0 8px 24px rgba(0,0,0,.34);
  }
  .scale-btn {
    border: 1px solid rgba(255,255,255,.2);
    background: rgba(255,255,255,.06);
    color: rgba(255,255,255,.8);
    border-radius: 6px;
    min-width: 26px;
    height: 22px;
    padding: 0 6px;
    font-family: var(--fd);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: .5px;
    cursor: pointer;
    transition: all .15s;
  }
  .scale-btn.wide { min-width: 46px; }
  .scale-btn:hover {
    color: #fff;
    border-color: rgba(255,255,255,.35);
    background: rgba(255,255,255,.12);
  }
  .scale-btn.on {
    color: #F5C4B8;
    border-color: rgba(232,150,125,.55);
    background: rgba(232,150,125,.16);
  }
  .strip-restore-btn {
    border: 1px solid rgba(255,255,255,.22);
    background: rgba(255,255,255,.08);
    color: rgba(255,255,255,.85);
    border-radius: 6px;
    padding: 3px 8px;
    font-family: var(--fd);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: .5px;
    cursor: pointer;
    transition: all .15s;
  }
  .strip-restore-btn:hover {
    color: #fff;
    border-color: rgba(232,150,125,.45);
    background: rgba(232,150,125,.16);
  }

  @media (max-width: 900px) {
    .scale-tools {
      bottom: 6px;
      gap: 3px;
      padding: 3px;
    }
    .scale-btn {
      min-width: 24px;
      height: 20px;
      font-size: 8px;
      padding: 0 5px;
    }
    .scale-btn.wide { min-width: 40px; }
    .strip-restore-btn { padding: 2px 6px; font-size: 8px; }
    .chart-notice { bottom: 36px; }
    .drag-indicator { bottom: 30px; }
    .trade-plan-overlay {
      left: 8px;
      right: 8px;
      width: auto;
      bottom: 42px;
      padding: 8px;
    }
    .plan-ratio-track { height: 22px; }
    .plan-action { padding: 6px 8px; }
  }
  .legend-item {
    --legend-color: #aaa;
    font-family: var(--fm);
    font-size: 8px;
    color: rgba(255,255,255,.88);
    letter-spacing: .35px;
    white-space: nowrap;
  }
  .legend-item::before {
    content: '';
    display: inline-block;
    width: 7px;
    height: 2px;
    border-radius: 2px;
    margin-right: 4px;
    transform: translateY(-1px);
    background: var(--legend-color);
    box-shadow: 0 0 6px var(--legend-color);
  }

  .mode-toggle { display: flex; gap: 0; border-radius: 6px; overflow: hidden; border: 1px solid rgba(232,150,125,.25); margin-left: 0; }
  .mode-btn { padding: 2px 8px; background: rgba(255,255,255,.03); border: none; color: #b2b9c5; font-size: var(--cp-font-2xs); font-family: var(--fd); font-weight: 800; letter-spacing: .4px; cursor: pointer; transition: all .15s; display: flex; align-items: center; gap: 2px; white-space: nowrap; }
  .mode-btn:first-child { border-right: 1px solid rgba(232,150,125,.15); }
  .mode-btn:hover { background: rgba(232,150,125,.08); color: #ccc; }
  .mode-btn.active { background: linear-gradient(135deg, rgba(232,150,125,.2), rgba(255,180,0,.15)); color: #E8967D; text-shadow: 0 0 8px rgba(232,150,125,.5); }
  .mode-icon { font-size: 10px; line-height: 1; }
  .scan-btn {
    height: 22px;
    padding: 0 8px;
    border-radius: 4px;
    border: 1px solid rgba(232,150,125,.35);
    background: linear-gradient(135deg, rgba(232,150,125,.2), rgba(255,180,0,.12));
    color: #E8967D;
    font-size: var(--cp-font-2xs);
    font-family: var(--fd);
    font-weight: 900;
    letter-spacing: .45px;
    cursor: pointer;
    transition: all .15s;
    white-space: nowrap;
  }
  .scan-btn:hover {
    background: linear-gradient(135deg, rgba(232,150,125,.28), rgba(255,180,0,.18));
    border-color: rgba(232,150,125,.55);
    color: #fff3bf;
    box-shadow: 0 0 10px rgba(232,150,125,.26);
  }
  .scan-btn.chat-trigger {
    border-color: rgba(120, 218, 255, 0.4);
    background: linear-gradient(135deg, rgba(94, 161, 255, 0.34), rgba(94, 161, 255, 0.18));
    color: #d6edff;
  }
  .scan-btn.chat-trigger:hover {
    border-color: rgba(120, 218, 255, 0.62);
    background: linear-gradient(135deg, rgba(94, 161, 255, 0.46), rgba(94, 161, 255, 0.24));
    color: #f0f8ff;
  }
  .scan-btn.chat-trigger.ready {
    border-color: rgba(79, 209, 142, 0.62);
    background: linear-gradient(135deg, rgba(39, 195, 145, 0.38), rgba(39, 195, 145, 0.2));
    color: #dcfff0;
  }
  .scan-btn.chat-trigger.ready:hover {
    border-color: rgba(79, 209, 142, 0.82);
    background: linear-gradient(135deg, rgba(39, 195, 145, 0.5), rgba(39, 195, 145, 0.28));
    color: #f6fff9;
  }
  .scan-btn.pattern-trigger {
    border-color: rgba(255, 140, 160, 0.45);
    background: linear-gradient(135deg, rgba(255, 120, 144, 0.28), rgba(255, 120, 144, 0.12));
    color: #ffdbe2;
  }
  .scan-btn.pattern-trigger:hover {
    border-color: rgba(255, 140, 160, 0.7);
    background: linear-gradient(135deg, rgba(255, 120, 144, 0.4), rgba(255, 120, 144, 0.2));
    color: #fff2f5;
  }

  .draw-tools { display: flex; gap: 2px; margin-left: 0; padding-left: 0; border-left: none; }
  .draw-btn { width: 22px; height: 19px; border-radius: 4px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); color: #b5bdc9; font-size: var(--cp-font-sm); font-family: monospace; cursor: pointer; transition: all .15s; display: flex; align-items: center; justify-content: center; padding: 0; line-height: 1; }
  .draw-btn:hover { background: rgba(232,150,125,.1); color: #E8967D; border-color: rgba(232,150,125,.3); }
  .draw-btn.active { background: rgba(232,150,125,.2); color: #E8967D; border-color: #E8967D; box-shadow: 0 0 6px rgba(232,150,125,.3); }
  .draw-btn.long-tool { font-family: var(--fd); font-size: 8px; color: #5cd4a0; border-color: rgba(92,212,160,.22); }
  .draw-btn.long-tool:hover { background: rgba(92,212,160,.15); color: #78e9bc; border-color: rgba(92,212,160,.45); }
  .draw-btn.long-tool.active { background: rgba(92,212,160,.2); color: #88ffd0; border-color: rgba(92,212,160,.6); box-shadow: 0 0 8px rgba(92,212,160,.35); }
  .draw-btn.short-tool { font-family: var(--fd); font-size: 8px; color: #e77f90; border-color: rgba(231,127,144,.22); }
  .draw-btn.short-tool:hover { background: rgba(231,127,144,.15); color: #ff9caf; border-color: rgba(231,127,144,.45); }
  .draw-btn.short-tool.active { background: rgba(231,127,144,.2); color: #ffadbc; border-color: rgba(231,127,144,.6); box-shadow: 0 0 8px rgba(231,127,144,.35); }
  .draw-btn.trade-tool { font-size: 10px; color: #E8967D; border-color: rgba(232,150,125,.25); width: 26px; }
  .draw-btn.trade-tool:hover { background: rgba(232,150,125,.15); color: #f0a88e; border-color: rgba(232,150,125,.45); }
  .draw-btn.trade-tool.active { background: rgba(232,150,125,.2); color: #f5c0a8; border-color: rgba(232,150,125,.6); box-shadow: 0 0 8px rgba(232,150,125,.35); }
  .draw-btn.vis-toggle { font-size: 9px; gap: 2px; width: auto; padding: 0 5px; color: #E8967D; border-color: rgba(232,150,125,.2); }
  .draw-btn.vis-toggle:hover { background: rgba(232,150,125,.1); border-color: rgba(232,150,125,.35); }
  .draw-btn.vis-toggle.off { opacity: 0.35; border-style: dashed; }
  .draw-btn.vis-toggle.off:hover { opacity: 0.7; }
  .vis-count { font-family: var(--fd, monospace); font-size: 8px; color: rgba(232,150,125,.6); }
  .draw-btn.clear-btn:hover { background: rgba(255,45,85,.15); color: #ff2d55; border-color: rgba(255,45,85,.4); }

  .indicator-strip {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid rgba(255,255,255,.06);
    background: rgba(255,255,255,.03);
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }
  .indicator-strip.collapsed {
    justify-content: flex-start;
    gap: 6px;
  }
  .collapsed-summary {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    flex: 1 1 auto;
    flex-wrap: nowrap;
    white-space: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    padding-bottom: 1px;
  }
  .sum-title {
    font-family: var(--fd);
    font-size: 8px;
    font-weight: 900;
    letter-spacing: .8px;
    color: rgba(255,255,255,.92);
  }
  .sum-item {
    font-family: var(--fm);
    font-size: 7px;
    color: rgba(255,255,255,.74);
    letter-spacing: .25px;
    white-space: nowrap;
  }
  .strip-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 0;
    flex: 0 0 auto;
  }
  .view-mode {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-right: 2px;
    padding-right: 6px;
    border-right: 1px solid rgba(255,255,255,.12);
  }
  .view-chip {
    border: 1px solid rgba(255,255,255,.16);
    background: rgba(255,255,255,.04);
    color: rgba(255,255,255,.78);
    border-radius: 10px;
    padding: 2px 8px;
    font-family: var(--fd);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: .5px;
    cursor: pointer;
    transition: all .15s;
  }
  .view-chip.on {
    color: #fff;
    border-color: rgba(232,150,125,.6);
    background: rgba(232,150,125,.16);
    box-shadow: 0 0 8px rgba(232,150,125,.22);
  }
  .view-chip:hover {
    border-color: rgba(255,255,255,.32);
    color: #fff;
  }
  .ind-chip {
    --ind-color: #888;
    border: 1px solid rgba(255,255,255,.15);
    background: rgba(255,255,255,.05);
    color: rgba(255,255,255,.74);
    border-radius: 12px;
    padding: 2px 7px;
    font-family: var(--fm);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: .3px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all .15s;
  }
  .ind-chip span { color: var(--ind-color); font-weight: 900; }
  .ind-chip.on {
    color: rgba(255,255,255,.95);
    border-color: var(--ind-color);
    background: rgba(255,255,255,.12);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.1);
  }
  .ind-chip.muted { opacity: .72; }
  .ind-chip.optional { opacity: .88; }
  .ind-chip:hover {
    color: #fff;
    border-color: rgba(255,255,255,.24);
  }
  .ind-hint {
    margin-left: auto;
    font-family: var(--fm);
    font-size: 8px;
    color: rgba(255,255,255,.58);
    letter-spacing: .4px;
  }
  .legend-chip {
    border: 1px solid rgba(255,255,255,.2);
    background: rgba(255,255,255,.04);
    color: rgba(255,255,255,.78);
    border-radius: 10px;
    padding: 2px 7px;
    font-family: var(--fd);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: .5px;
    cursor: pointer;
    transition: all .15s;
  }
  .legend-chip.on {
    color: #F5C4B8;
    border-color: rgba(232,150,125,.45);
    background: rgba(232,150,125,.14);
  }
  .legend-chip.danger {
    color: rgba(255,165,165,.85);
    border-color: rgba(255,120,120,.32);
  }
  .legend-chip.danger:hover {
    color: #ffd0d0;
    border-color: rgba(255,120,120,.55);
    background: rgba(255,70,70,.14);
  }
  .legend-chip:hover { color: #fff; border-color: rgba(255,255,255,.36); }

  .drawing-canvas { position: absolute; inset: 0; z-index: 6; pointer-events: none; }
  .drawing-canvas.drawing-active { pointer-events: auto; cursor: crosshair; }

  .drawing-indicator { position: absolute; top: 6px; left: 50%; transform: translateX(-50%); z-index: 15; padding: 4px 12px; border-radius: 6px; background: rgba(232,150,125,.12); border: 1px solid rgba(232,150,125,.3); color: #E8967D; font-size: 9px; font-weight: 700; font-family: var(--fm); letter-spacing: .9px; display: flex; align-items: center; gap: 8px; animation: drawPulse 1.5s ease infinite; }
  @keyframes drawPulse { 0%,100% { opacity: 1 } 50% { opacity: .65 } }
  .drawing-cancel { padding: 1px 6px; border-radius: 3px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.15); color: #ddd; font-size: 7px; font-family: var(--fm); font-weight: 800; cursor: pointer; letter-spacing: .8px; }
  .drawing-cancel:hover { background: rgba(255,45,85,.2); color: #ff2d55; border-color: rgba(255,45,85,.4); }
  .chart-notice {
    position: absolute;
    left: 50%;
    bottom: 44px;
    transform: translateX(-50%);
    z-index: 18;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid rgba(232,150,125,.3);
    background: rgba(0,0,0,.7);
    color: #ffe7b8;
    font-family: var(--fm);
    font-size: 9px;
    letter-spacing: .4px;
    box-shadow: 0 8px 24px rgba(0,0,0,.4);
    pointer-events: none;
    white-space: nowrap;
  }

  /* ═══ Overlay close button (HTML) ═══ */
  .overlay-close-btn {
    position: absolute; top: 8px; right: 80px; z-index: 10;
    width: 22px; height: 22px; border-radius: 4px;
    background: rgba(10,9,8,.8); border: 1px solid rgba(232,150,125,.35);
    color: rgba(232,150,125,.9); font-size: 11px; line-height: 1;
    cursor: pointer; transition: all .15s;
    display: flex; align-items: center; justify-content: center;
  }
  .overlay-close-btn:hover { background: rgba(232,150,125,.15); border-color: #E8967D; color: #E8967D; }

  /* ═══ First-scan CTA overlay ═══ */
  .first-scan-cta {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 12;
    pointer-events: none;
  }
  .fsc-inline {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border-radius: 8px;
    border: 1px solid rgba(232,150,125,.2);
    background: rgba(10,9,8,.72);
    backdrop-filter: blur(4px);
  }
  .fsc-btn {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border-radius: 6px;
    background: rgba(232,150,125,.12);
    border: 1.5px solid rgba(232,150,125,.38);
    cursor: pointer; transition: all .2s;
  }
  .fsc-btn:hover { border-color: #E8967D; box-shadow: 0 0 12px rgba(232,150,125,.15); background: rgba(232,150,125,.2); }
  .fsc-icon { font-size: 11px; color: #E8967D; animation: fscPulse 2s ease infinite; }
  @keyframes fscPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.92)} }
  .fsc-label { font-family: var(--fm); font-size: 9px; font-weight: 900; letter-spacing: 1px; color: #E8967D; }
  .fsc-sub { font-family: var(--fm); font-size: 8px; color: rgba(240,237,228,.52); letter-spacing: .4px; }

  /* ═══ Post-scan Trade CTA bar ═══ */
  .trade-cta-bar {
    position: absolute; bottom: 0; left: 0; right: 0; z-index: 14;
    display: flex; align-items: center; gap: 10px;
    padding: 6px 12px;
    background: rgba(10,9,8,.9); border-top: 1px solid rgba(232,150,125,.2);
    backdrop-filter: blur(4px);
  }
  .tcb-dir { font-family: var(--fm); font-size: 11px; font-weight: 900; letter-spacing: 1px; }
  .tcb-dir.long { color: var(--grn, #00ff88); }
  .tcb-dir.short { color: var(--red, #ff2d55); }
  .tcb-conf { font-family: var(--fd); font-size: 12px; font-weight: 800; color: rgba(240,237,228,.6); }
  .tcb-rr { font-family: var(--fm); font-size: 9px; color: rgba(240,237,228,.4); letter-spacing: .5px; }
  .tcb-execute {
    margin-left: auto;
    padding: 5px 16px; border-radius: 4px;
    font-family: var(--fm); font-size: 10px; font-weight: 900; letter-spacing: 1px;
    cursor: pointer; transition: all .15s; border: 1px solid;
  }
  .tcb-execute.long { color: #0A0908; background: var(--grn, #00ff88); border-color: var(--grn, #00ff88); }
  .tcb-execute.long:hover { box-shadow: 0 0 12px rgba(0,255,136,.3); }
  .tcb-execute.short { color: #fff; background: var(--red, #ff2d55); border-color: var(--red, #ff2d55); }
  .tcb-execute.short:hover { box-shadow: 0 0 12px rgba(255,45,85,.3); }

  .tv-container { flex: 1; position: relative; overflow: hidden; background: #0a0a1a; }
  .tv-container :global(iframe) { width: 100% !important; height: 100% !important; border: none !important; }
  .tv-error-card {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    z-index: 12;
    padding: 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 45, 85, 0.35);
    background: rgba(20, 8, 13, 0.9);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(6px);
  }
  .tv-error-title {
    font-family: var(--fd);
    font-size: 10px;
    letter-spacing: 1px;
    color: #ff8ca1;
    margin-bottom: 4px;
  }
  .tv-error-desc {
    font-family: var(--fm);
    font-size: 9px;
    line-height: 1.45;
    color: rgba(255, 255, 255, 0.72);
    margin-bottom: 10px;
  }
  .tv-error-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .tv-retry-btn {
    border: 1px solid rgba(232,150,125, 0.35);
    background: rgba(232,150,125, 0.12);
    color: #E8967D;
    border-radius: 6px;
    padding: 6px 10px;
    font-family: var(--fm);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.8px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tv-retry-btn:hover {
    background: rgba(232,150,125, 0.2);
    border-color: rgba(232,150,125, 0.5);
  }
  .tv-open-link {
    font-family: var(--fm);
    font-size: 9px;
    font-weight: 700;
    color: #9ed9ff;
    text-decoration: none;
    border-bottom: 1px dashed rgba(158, 217, 255, 0.5);
  }
  .tv-open-link:hover {
    color: #c6e9ff;
    border-bottom-color: rgba(198, 233, 255, 0.8);
  }
  .tv-safe-hint {
    margin-top: 8px;
    font-family: var(--fm);
    font-size: 8px;
    color: rgba(255, 255, 255, 0.62);
    letter-spacing: 0.8px;
  }

  .loading-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; background: rgba(10,10,26,.9); z-index: 10; color: #d0d6df; font-size: 10px; font-family: var(--fm); }
  .loader { width: 24px; height: 24px; border: 2px solid rgba(232,150,125,.2); border-top-color: #E8967D; border-radius: 50%; animation: spin .6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .error-badge { position: absolute; top: 6px; left: 6px; padding: 3px 8px; border-radius: 4px; background: rgba(255,45,85,.2); border: 1px solid rgba(255,45,85,.4); color: #ff2d55; font-size: 8px; font-family: var(--fm); font-weight: 700; z-index: 5; }

  .pos-overlay { position: absolute; top: 6px; right: 6px; z-index: 12; display: flex; flex-direction: column; gap: 3px; align-items: flex-end; }
  .pos-badge { padding: 3px 10px; border-radius: 6px; font-size: 10px; font-weight: 900; font-family: var(--fd); letter-spacing: 2px; border: 2px solid; }
  .pos-badge.long { background: rgba(0,255,136,.2); border-color: #00ff88; color: #00ff88; }
  .pos-badge.short { background: rgba(255,45,85,.2); border-color: #ff2d55; color: #ff2d55; }
  .pos-badge.neutral { background: rgba(255,170,0,.2); border-color: #ffaa00; color: #ffaa00; }
  .pos-levels { display: flex; flex-direction: column; gap: 1px; font-size: 8px; font-family: var(--fm); font-weight: 700; text-align: right; }
  .pos-tp { color: #4ade80; }
  .pos-entry { color: #ffba30; }
  .pos-sl { color: #ff4060; }
  .pos-rr { font-size: 10px; font-weight: 900; font-family: var(--fd); color: #E8967D; background: rgba(0,0,0,.6); padding: 2px 8px; border-radius: 4px; }
  .pos-hint { font-size: 7px; color: rgba(255,255,255,.5); font-family: var(--fm); letter-spacing: .5px; text-align: right; margin-top: 2px; }
  .pos-levels .highlight { background: rgba(255,255,255,.15); padding: 0 4px; border-radius: 3px; animation: lineHover .5s ease infinite; }
  @keyframes lineHover { 0%,100%{opacity:1} 50%{opacity:.7} }

  .trade-plan-overlay {
    position: absolute;
    right: 10px;
    bottom: 54px;
    z-index: 16;
    width: min(320px, calc(100% - 20px));
    border-radius: 12px;
    border: 1px solid rgba(138, 150, 172, 0.35);
    background: rgba(17, 23, 35, 0.92);
    backdrop-filter: blur(6px);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.4);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .trade-plan-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .plan-title {
    font-family: var(--fd);
    font-size: 10px;
    letter-spacing: 1px;
    font-weight: 900;
    color: #d8dfeb;
  }
  .plan-close {
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.75);
    border-radius: 6px;
    width: 22px;
    height: 20px;
    cursor: pointer;
  }
  .plan-close:hover {
    color: #fff;
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.08);
  }
  .trade-plan-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 10px;
  }
  .plan-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-family: var(--fm);
    font-size: 9px;
    color: rgba(216, 223, 235, 0.82);
  }
  .plan-row strong {
    font-family: var(--fd);
    font-size: 10px;
    letter-spacing: .35px;
    color: #f5f7fb;
  }
  .plan-row strong.tp { color: #27c391; }
  .plan-row strong.sl { color: #e95b6a; }
  .plan-ratio-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: var(--fd);
    font-size: 9px;
    letter-spacing: .6px;
    color: rgba(255, 255, 255, 0.65);
  }
  .plan-ratio-meta span.active {
    color: #f0f3fb;
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.22);
  }
  .plan-ratio-track {
    position: relative;
    height: 24px;
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: linear-gradient(90deg, rgba(39, 195, 145, 0.2), rgba(233, 91, 106, 0.2));
    cursor: ew-resize;
    touch-action: none;
    appearance: none;
    display: block;
    width: 100%;
    padding: 0;
  }
  .plan-ratio-long {
    position: absolute;
    inset: 0 auto 0 0;
    background: linear-gradient(90deg, rgba(39, 195, 145, 0.45), rgba(39, 195, 145, 0.2));
    border-right: 1px solid rgba(0, 0, 0, 0.28);
  }
  .plan-ratio-knob {
    position: absolute;
    top: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.8);
    background: #f4f7ff;
    box-shadow: 0 0 0 2px rgba(17, 23, 35, 0.6);
    pointer-events: none;
  }
  .plan-ratio-presets {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .plan-ratio-presets button {
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.82);
    border-radius: 999px;
    padding: 2px 7px;
    font-family: var(--fd);
    font-size: 8px;
    letter-spacing: .5px;
    cursor: pointer;
  }
  .plan-ratio-presets button:hover {
    color: #fff;
    border-color: rgba(255, 255, 255, 0.36);
    background: rgba(255, 255, 255, 0.11);
  }
  .plan-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .plan-action {
    flex: 1;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 7px 10px;
    font-family: var(--fd);
    font-size: 9px;
    letter-spacing: .8px;
    font-weight: 900;
    cursor: pointer;
  }
  .plan-action.ghost {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.82);
  }
  .plan-action.ghost:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
  }
  .plan-action.primary {
    color: #fff;
    border-color: transparent;
  }
  .plan-action.primary.long {
    background: linear-gradient(135deg, rgba(39, 195, 145, 0.45), rgba(39, 195, 145, 0.7));
  }
  .plan-action.primary.short {
    background: linear-gradient(135deg, rgba(233, 91, 106, 0.45), rgba(233, 91, 106, 0.7));
  }
  .plan-action.primary:hover {
    filter: brightness(1.08);
  }

  .drag-indicator { position: absolute; bottom: 38px; left: 50%; transform: translateX(-50%); z-index: 15; padding: 4px 12px; border-radius: 6px; background: rgba(232,150,125,.9); color: #000; font-size: 9px; font-weight: 900; font-family: var(--fd); letter-spacing: 1.6px; animation: dragPulse .5s ease infinite; }
  @keyframes dragPulse { 0%,100% { opacity: 1 } 50% { opacity: .6 } }

  .chart-annotation { position: absolute; z-index: 8; width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--ann-color); background: rgba(0,0,0,.8); box-shadow: 0 0 10px var(--ann-color), 0 0 20px rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all .2s; transform: translate(-50%, -50%); padding: 0; contain: layout style; }
  .chart-annotation::before { content: ''; position: absolute; inset: -5px; border-radius: 50%; border: 1px solid var(--ann-color); opacity: 0; will-change: auto; }
  .chart-annotation::after { content: ''; position: absolute; inset: -2px; border-radius: 50%; background: var(--ann-color); opacity: .08; z-index: -1; }
  .chart-annotation:hover { transform: translate(-50%, -50%) scale(1.35); box-shadow: 0 0 20px var(--ann-color), 0 0 30px var(--ann-color); }
  .chart-annotation.active { transform: translate(-50%, -50%) scale(1.25); box-shadow: 0 0 20px var(--ann-color), 0 0 30px var(--ann-color); z-index: 20; }
  .chart-annotation:hover::before { animation: annRing 2s ease-out; }
  @keyframes annRing { 0% { transform: scale(1); opacity: .4; } 100% { transform: scale(1.8); opacity: 0; } }
  .ann-icon { font-size: 13px; line-height: 1; filter: drop-shadow(0 0 2px var(--ann-color)); }

  .ann-popup { position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); width: 200px; background: rgba(10,10,30,.95); border: 2px solid var(--ann-color); border-radius: 8px; padding: 8px; box-shadow: 0 4px 20px rgba(0,0,0,.5); animation: annPopIn .2s ease; pointer-events: none; }
  @keyframes annPopIn { from { opacity: 0; transform: translateX(-50%) translateY(5px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
  .ann-popup-header { display: flex; align-items: center; gap: 4px; padding-bottom: 4px; border-bottom: 1px solid; margin-bottom: 4px; }
  .ann-popup-icon { font-size: 12px; }
  .ann-popup-name { font-family: var(--fm); font-size: 9px; font-weight: 900; letter-spacing: 1px; }
  .ann-popup-type { margin-left: auto; font-family: var(--fm); font-size: 7px; font-weight: 700; padding: 1px 4px; border-radius: 3px; background: rgba(255,255,255,.1); color: rgba(255,255,255,.7); letter-spacing: .5px; }
  .ann-popup-label { font-family: var(--fm); font-size: 9px; font-weight: 900; color: #fff; margin-bottom: 2px; }
  .ann-popup-detail { font-family: var(--fm); font-size: 8px; color: rgba(255,255,255,.74); line-height: 1.4; }

  /* chart-footer removed — pattern pills shown on chart annotations, indicators in legend */

  /* Keep internal sections fixed-height friendly; pane resizing is handled at terminal layout level. */
  .chart-container,
  .indicator-strip {
    resize: none;
  }

  @media (max-width: 1580px) {
    .ind-hint { display: none; }
  }

  @media (max-width: 1450px) {
    .ind-chip.optional { display: none; }
  }

  @media (max-width: 520px) {
    .sum-title {
      display: none;
    }
    .sum-item.optional {
      display: none;
    }
  }

  .chart-wrapper.tv-like {
    --blk: #131722;
    --fg: #b2b5be;
    --yel: #4f8cff;
    --grn: #26a69a;
    --red: #ef5350;
    --pk: #b388ff;
    --cyan: #5ea1ff;
    --ora: #ffb74d;
    background: #131722;
  }
  .chart-wrapper.tv-like .chart-bar {
    background: #131722;
    border-bottom: 1px solid #2a2e39;
    gap: 4px;
  }
  .chart-wrapper.tv-like .indicator-strip {
    border-bottom-color: #2a2e39;
    background: #131722;
  }
  /* .chart-wrapper.tv-like .chart-footer — removed */
  .chart-wrapper.tv-like .mode-toggle {
    border-color: rgba(255, 255, 255, 0.18);
  }
  .chart-wrapper.tv-like .mode-btn.active {
    background: rgba(79, 140, 255, 0.2);
    color: #e6f0ff;
    text-shadow: none;
  }
  .chart-wrapper.tv-like .scan-btn {
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(79, 140, 255, 0.2);
    color: #e6f0ff;
  }
  .chart-wrapper.tv-like .scan-btn:hover {
    border-color: rgba(79, 140, 255, 0.6);
    background: rgba(79, 140, 255, 0.3);
    color: #fff;
    box-shadow: none;
  }
  .chart-wrapper.tv-like .scan-btn.chat-trigger.ready {
    border-color: rgba(38, 166, 154, 0.62);
    background: rgba(38, 166, 154, 0.24);
    color: #d9fffa;
  }
  .chart-wrapper.tv-like .scan-btn.chat-trigger.ready:hover {
    border-color: rgba(38, 166, 154, 0.8);
    background: rgba(38, 166, 154, 0.33);
    color: #f2ffff;
  }
  .chart-wrapper.tv-like .draw-btn.active {
    border-color: rgba(79, 140, 255, 0.8);
    background: rgba(79, 140, 255, 0.24);
    box-shadow: none;
  }
  .chart-wrapper.tv-like .tfbtn.active {
    color: #e6f0ff;
    border-color: rgba(79, 140, 255, 0.8);
    background: rgba(79, 140, 255, 0.22);
  }
  .chart-wrapper.tv-like .live-indicator {
    color: #8bd0ff;
  }
  .chart-wrapper.tv-like .live-dot {
    background: #8bd0ff;
  }
</style>
