<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
  import type { UTCTimestamp, IChartApi, ISeriesApi, SeriesType, SeriesMarker } from 'lightweight-charts';
  import {
    chartIndicators,
    toggleIndicator as toggleChartIndicator,
    removeIndicator as removeChartIndicator,
    type IndicatorKey,
  } from '$lib/stores/chartIndicators';
  import type { DepthLadderEnvelope, LiquidationClustersEnvelope } from '$lib/contracts/terminalBackend';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import type { ChartViewportSnapshot } from '$lib/contracts/terminalPersistence';
  import { tfMinutes } from '$lib/chart/mtfAlign';
  import { chartTimeToUnixSeconds, slicePayloadToViewport } from '$lib/terminal/chartViewportCapture';
  import SaveSetupModal from './SaveSetupModal.svelte';
  import SaveStrip from './SaveStrip.svelte';
  import ChartToolbar from './ChartToolbar.svelte';
  import IndicatorPaneStack from './IndicatorPaneStack.svelte';
  // ── Layer 1 range primitive (W-0086) ────────────────────────────────────────
  import { chartSaveMode } from '$lib/stores/chartSaveMode';
  import { terminalState } from '$lib/stores/terminalState';
  import { RangePrimitive } from '../chart/primitives/RangePrimitive';
  // ── Layer 2 overlay (W-0086) ────────────────────────────────────────────────
  import PhaseBadge from '../chart/overlay/PhaseBadge.svelte';
  import RangeModeToast from '../chart/overlay/RangeModeToast.svelte';
  import type { Time } from 'lightweight-charts';

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
    /** Alpha phase markers — rendered as chart markers on the candle series. */
    alphaMarkers?: Array<{
      timestamp: number;  // unix seconds
      phase: string;
      label: string;
      color?: string;
    }>;
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
    alphaMarkers = undefined,
  }: Props = $props();

  // ── Internal TF state — syncs with externalTf if provided ─────────────────
  // Start with '1h'; externalTf takes precedence via $derived when set by parent
  let internalTf = $state('1h');
  let tf = $derived(externalTf ?? internalTf);

  // ── DOM refs ───────────────────────────────────────────────────────────────
  let containerEl  = $state<HTMLDivElement | undefined>(undefined);
  /** Wraps candle + sub-panes; drives flex height for TradingView-style fill. */
  let chartStackEl = $state<HTMLDivElement | undefined>(undefined);
  let mainEl       = $state<HTMLDivElement | undefined>(undefined);
  let volEl        = $state<HTMLDivElement | undefined>(undefined);
  let rsiEl        = $state<HTMLDivElement | undefined>(undefined);
  let macdEl       = $state<HTMLDivElement | undefined>(undefined);
  let oiEl         = $state<HTMLDivElement | undefined>(undefined);
  let cvdEl        = $state<HTMLDivElement | undefined>(undefined);

  // ── UI state ───────────────────────────────────────────────────────────────
  let loading  = $state(true);
  let error    = $state<string | null>(null);
  let rateLimitRetryIn = $state<number | null>(null);

  // ── History lazy-load state ────────────────────────────────────────────────
  let historyLoadingMore = $state(false);
  let earliestBarTimeMs  = $state<number | null>(null);

  // ── Live WS reference (non-reactive) ──────────────────────────────────────
  let _ws: WebSocket | null = null;
  let currentPrice = $state<number | null>(null);
  let currentTime  = $state<number | null>(null);
  let currentChangePct = $state<number | null>(null);
  let currentOiDelta = $state<number | null>(null);
  let captureWindowLabel = $state('Visible range capture unavailable');
  let captureBarCount = $state<number | null>(null);
  let depthData = $state<DepthLadderEnvelope['data'] | null>(null);
  let liqData = $state<LiquidationClustersEnvelope['data'] | null>(null);
  let depthRatio = $derived.by(() => {
    if (depthData?.imbalanceRatio != null && Number.isFinite(depthData.imbalanceRatio)) {
      return Math.max(0.65, Math.min(1.35, depthData.imbalanceRatio));
    }
    const oi = currentOiDelta ?? 0;
    const ratio = 1 + oi / 40;
    return Math.max(0.65, Math.min(1.35, ratio));
  });
  let bidPct = $derived(Math.round((depthRatio / (1 + depthRatio)) * 100));
  let askPct = $derived(100 - bidPct);
  let liqAnchor = $derived(liqData?.currentPrice ?? currentPrice ?? verdictLevels?.entry ?? 0);
  let liqLong = $derived(liqData?.nearestLong?.price ?? (liqAnchor ? liqAnchor * 0.985 : 0));
  let liqShort = $derived(liqData?.nearestShort?.price ?? (liqAnchor ? liqAnchor * 1.012 : 0));
  let contextSummaryItems = $derived.by(() => {
    const items: Array<{ label: string; value: string; tone?: 'bull' | 'bear' | 'warn' | 'neutral' }> = [];
    if (depthData?.spreadBps != null) {
      items.push({ label: 'Spread', value: `${depthData.spreadBps.toFixed(1)} bps` });
    }
    items.push({
      label: 'Book',
      value: `${bidPct}/${askPct}`,
      tone: bidPct >= askPct ? 'bull' : 'bear',
    });
    if (liqLong && liqShort) {
      items.push({
        label: 'Liq',
        value: `${liqLong.toLocaleString(undefined, { maximumFractionDigits: 0 })} · ${liqShort.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        tone: 'warn',
      });
    }
    if (quantRegime?.label) {
      items.push({
        label: 'Regime',
        value: quantRegime.label,
        tone: quantRegime.tone === 'bull' ? 'bull' : quantRegime.tone === 'bear' ? 'bear' : quantRegime.tone === 'warn' ? 'warn' : 'neutral',
      });
    }
    return items;
  });

  // Save Setup modal
  let showSaveModal = $state(false);
  let savedCaptureId = $state<string | null>(null);   // shown as toast after save

  // Indicator toggles — backed by the shared chartIndicators store so that
  // the SSE `chart_action` handler, the studies popover, and pane × buttons
  // all mutate one source of truth (W-0102 Slice 3).
  let showVWAP = $derived($chartIndicators.vwap);
  let showBB   = $derived($chartIndicators.bb);
  let showEMA  = $derived($chartIndicators.ema);
  let showATRBands = $derived($chartIndicators.atr_bands);
  let showCVD = $derived($chartIndicators.cvd);
  let showMACD = $derived($chartIndicators.macd);   // replaces RSI pane when active
  let derivativesOnMain = $derived($chartIndicators.derivatives);

  let chartMode = $state<'candle' | 'line'>('candle');
  /** Collapsible book / liq / quant strip (TradingView-style: chart first). */
  let contextStripOpen = $state(false);

  /** TradingView-style “Indicators” popover (add studies to chart). */
  let studiesPanelOpen = $state(false);
  let studiesWrapEl = $state<HTMLDivElement | undefined>(undefined);
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

  type StudyCategory = 'Favorites' | 'Overlays' | 'Pane' | 'Flow';
  type StudyId = 'ema' | 'vwap' | 'bb' | 'atr' | 'macd' | 'cvd' | 'overlay';
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

  // ── Chart instances ────────────────────────────────────────────────────────
  let mainChart: IChartApi | null = null;
  let volChart:  IChartApi | null = null;
  let rsiChart:  IChartApi | null = null;
  let macdChart: IChartApi | null = null;
  let oiChart:   IChartApi | null = null;
  let cvdChart:  IChartApi | null = null;
  let priceSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null = null;

  // ── Layer 1: Range primitive (W-0086 / W-0117) ────────────────────────────
  let rangePrimitive: RangePrimitive | null = null;
  let saveModeUnsubscribe: (() => void) | null = null;

  // Drag state — managed as plain variables (not reactive) to avoid cycles
  let _dragActive = false;
  let _dragOnMouseMove: ((e: MouseEvent) => void) | null = null;
  let _dragOnMouseUp: ((e: MouseEvent) => void) | null = null;

  function attachRangePrimitive() {
    if (!priceSeries || rangePrimitive) return;
    rangePrimitive = new RangePrimitive();
    (priceSeries as ISeriesApi<SeriesType>).attachPrimitive(rangePrimitive as unknown as Parameters<ISeriesApi<SeriesType>['attachPrimitive']>[0]);
  }

  function detachRangePrimitive() {
    if (!priceSeries || !rangePrimitive) return;
    try {
      (priceSeries as ISeriesApi<SeriesType>).detachPrimitive(rangePrimitive as unknown as Parameters<ISeriesApi<SeriesType>['detachPrimitive']>[0]);
    } catch { /* ignore */ }
    rangePrimitive = null;
  }

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
  }

  function handleRangeModeKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && $chartSaveMode.active) {
      chartSaveMode.exitRangeMode();
    }
  }

  // Level price lines
  let entryLine:  ReturnType<ISeriesApi<SeriesType>['createPriceLine']> | null = null;
  let targetLine: ReturnType<ISeriesApi<SeriesType>['createPriceLine']> | null = null;
  let stopLine:   ReturnType<ISeriesApi<SeriesType>['createPriceLine']> | null = null;
  /** Liquidation / cluster levels on main chart (CryptoQuant-style price rails). */
  let liqPriceLines: Array<ReturnType<ISeriesApi<SeriesType>['createPriceLine']>> = [];

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
    layout: { background: { color: BG }, textColor: TEXT, fontSize: 10, fontFamily: 'var(--sc-font-mono, monospace)' },
    grid:   { vertLines: { color: GRID }, horzLines: { color: GRID } },
    crosshair: {
      vertLine: { color: 'rgba(255,255,255,0.2)', width: 1 as const, style: 3 },
      horzLine: { color: 'rgba(255,255,255,0.2)', width: 1 as const, style: 3 },
    },
    timeScale: { borderColor: BORDER, timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderColor: BORDER },
  };

  /** Sub-pane pixel heights — responsive to viewport width (W-0114 Phase A) */
  let viewportWidth = $state<number | null>(null);
  let PANE_VOL_H = $derived(viewportWidth && viewportWidth < 768 ? 48 : 60);
  let PANE_SUB_H = $derived(viewportWidth && viewportWidth < 768 ? 64 : 80);
  let PANE_OI_H = $derived(viewportWidth && viewportWidth < 768 ? 56 : 72);
  let PANE_CVD_H = $derived(viewportWidth && viewportWidth < 768 ? 64 : 84);

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

  function measureMainChartHeight(overlayOnMain: boolean): number {
    const h = mainEl?.clientHeight ?? 0;
    if (h > 48) return h;
    return overlayOnMain ? 400 : 340;
  }

  // ── Data load ─────────────────────────────────────────────────────────────
  let chartData = $state<ChartSeriesPayload | null>(null);

  // Keep chartSaveMode payload in sync so SaveStrip can slice indicators (W-0117 Slice B)
  $effect(() => {
    chartSaveMode.setPayload(chartData);
  });
  const chartDataCache = new Map<string, ChartSeriesPayload>();
  let loadToken = 0;
  let lastDataKey = '';

  async function loadData() {
    if (!symbol) return;
    const dataKey = `${symbol}:${tf}:${emaTf || 'chart'}`;
    if (dataKey === lastDataKey && chartData) return;

    if (chartDataCache.has(dataKey)) {
      chartData = chartDataCache.get(dataKey) ?? null;
      depthData = depthSnapshot;
      liqData = liqSnapshot;
      error = null;
      loading = false;
      lastDataKey = dataKey;
      return;
    }

    if (initialData && !emaTf) {
      chartDataCache.set(dataKey, initialData);
      chartData = initialData;
      depthData = depthSnapshot;
      liqData = liqSnapshot;
      error = null;
      loading = false;
      lastDataKey = dataKey;
      return;
    }

    const token = ++loadToken;
    loading = true;
    error = null;
    rateLimitRetryIn = null;
    try {
      const emaQ = emaTf ? `&emaTf=${encodeURIComponent(emaTf)}` : '';
      const chartRes = await fetch(`/api/chart/klines?symbol=${symbol}&tf=${tf}&limit=500${emaQ}`);
      if (chartRes.status === 429) {
        if (token !== loadToken) return;
        loading = false;
        rateLimitRetryIn = 10;
        const countdown = setInterval(() => {
          rateLimitRetryIn = (rateLimitRetryIn ?? 0) - 1;
          if ((rateLimitRetryIn ?? 0) <= 0) {
            clearInterval(countdown);
            rateLimitRetryIn = null;
            loadData();
          }
        }, 1_000);
        return;
      }
      if (!chartRes.ok) throw new Error(`HTTP ${chartRes.status}`);
      const data = await chartRes.json() as ChartSeriesPayload & { error?: unknown };
      if (data.error) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Chart payload error');
      }
      if (token !== loadToken) return;
      chartDataCache.set(dataKey, data);
      chartData = data;
      depthData = depthSnapshot;
      liqData = liqSnapshot;
      loading = false;
      lastDataKey = dataKey;
      const firstBar = (data.klines as Array<{time: number}>)[0];
      if (firstBar) earliestBarTimeMs = firstBar.time * 1000;
    } catch (e) {
      if (token !== loadToken) return;
      error = String(e);
      loading = false;
    }
  }

  // ── History lazy-load ────────────────────────────────────────────────────
  const LAZY_TRIGGER_BARS = 30; // fetch more when within this many bars of the left edge

  async function loadMoreHistory() {
    if (historyLoadingMore || earliestBarTimeMs == null || !symbol) return;
    const tfMs = tfMinutes(tf) * 60_000;
    const startTime = earliestBarTimeMs - 500 * tfMs;
    if (startTime < 0) return;

    historyLoadingMore = true;
    try {
      const emaQ = emaTf ? `&emaTf=${encodeURIComponent(emaTf)}` : '';
      const res = await fetch(
        `/api/chart/klines?symbol=${symbol}&tf=${tf}&limit=500&startTime=${startTime}${emaQ}`,
      );
      if (!res.ok) return;
      const older = await res.json() as { klines?: Array<{time: number; open: number; high: number; low: number; close: number; volume: number}> };
      if (!older.klines?.length) return;

      earliestBarTimeMs = older.klines[0].time * 1000;

      // Prepend bars to existing series — restore visible range after setData
      const savedRange = mainChart?.timeScale().getVisibleLogicalRange();
      const current = (chartData?.klines ?? []) as Array<{time: number; open: number; high: number; low: number; close: number; volume: number}>;
      const cutoff = older.klines[older.klines.length - 1].time;
      const merged = [...older.klines, ...current.filter((k) => k.time > cutoff)];

      if (priceSeries) {
        priceSeries.setData(
          merged.map((k) => ({
            time: k.time as UTCTimestamp,
            open: k.open, high: k.high, low: k.low, close: k.close,
          })),
        );
      }
      if (savedRange) {
        // Shift range by the number of newly prepended bars so the view stays stable
        const prepended = older.klines.length;
        mainChart?.timeScale().setVisibleLogicalRange({
          from: savedRange.from + prepended,
          to:   savedRange.to  + prepended,
        });
      }
    } catch { /* lazy load is best-effort */ }
    finally { historyLoadingMore = false; }
  }

  // ── Binance WebSocket live candle ─────────────────────────────────────────

  function connectKlineWS(sym: string, timeframe: string) {
    if (typeof window === 'undefined') return;
    _ws?.close();
    const stream = `${sym.toLowerCase()}@kline_${timeframe}`;
    _ws = new WebSocket(`wss://fstream.binance.com/ws/${stream}`);

    _ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string) as {
          k: { t: number; o: string; h: string; l: string; c: string; v: string; x: boolean };
        };
        const k = msg.k;
        const bar = {
          time:  Math.floor(k.t / 1000) as UTCTimestamp,
          open:  parseFloat(k.o),
          high:  parseFloat(k.h),
          low:   parseFloat(k.l),
          close: parseFloat(k.c),
        };
        (priceSeries as ISeriesApi<'Candlestick'> | null)?.update(bar);
        currentPrice = bar.close;
      } catch { /* ignore malformed message */ }
    };

    _ws.onerror = () => { _ws?.close(); };
    _ws.onclose = () => { _ws = null; };
  }

  function disconnectWS() {
    _ws?.close();
    _ws = null;
  }

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
    if (!mainEl || !volEl || !oiEl) return;
    if (showMACD && !macdEl) return;
    if (!showMACD && !rsiEl) return;
    if (showCVD && !cvdEl) return;
    destroyCharts();

    let candleSeriesRef: ISeriesApi<'Candlestick'> | null = null;

    const rsiContainer = rsiEl;
    const macdContainer = macdEl;

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
      derivativesOnMain && chartMode === 'candle' && Boolean(fundingBars?.length);
    const mainChartHeight = measureMainChartHeight(hasFundingOverlay);

    // ── Main (candles + overlays) ────────────────────────────────────────────
    mainChart = createChart(mainEl, {
      ...baseTheme,
      width: w,
      height: mainChartHeight,
      rightPriceScale: {
        ...baseTheme.rightPriceScale,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      leftPriceScale: hasFundingOverlay
        ? { visible: true, borderColor: BORDER, scaleMargins: { top: 0.06, bottom: 0.06 } }
        : { visible: false },
    });

    const lastBar = klines[klines.length - 1];
    const prevBar = klines[klines.length - 2];
    currentPrice = lastBar?.close ?? null;
    currentTime = lastBar?.time ?? null;
    currentChangePct = lastBar && prevBar && prevBar.close > 0 ? ((lastBar.close - prevBar.close) / prevBar.close) * 100 : null;
    currentOiDelta = oiBars?.length ? oiBars[oiBars.length - 1]?.value ?? null : null;

    if (chartMode === 'line') {
      const lineSeries = mainChart.addSeries(LineSeries, {
        color: '#63b3ed',
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      lineSeries.setData(klines.map((k) => ({ time: k.time as UTCTimestamp, value: k.close })));
      priceSeries = lineSeries;
    } else {
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
      priceSeries = candleSeries;
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
      // Runtime API (v5 typings omit setMarkers on some ISeriesApi variants).
      (candleSeriesRef as ISeriesApi<'Candlestick'> & { setMarkers: (m: SeriesMarker<UTCTimestamp>[]) => void }).setMarkers(markers);
    }

    mainChart.subscribeCrosshairMove((param) => {
      if (param.time) {
        currentTime = param.time as number;
        const series = priceSeries;
        if (series) {
          const d = param.seriesData.get(series) as { close?: number; value?: number } | undefined;
          if (d?.close != null) currentPrice = d.close;
          else if (d?.value != null) currentPrice = d.value;
        }
      }
    });

    // ── Volume ───────────────────────────────────────────────────────────────
    volChart = createChart(volEl, {
      ...baseTheme, width: w, height: PANE_VOL_H,
      timeScale: { ...baseTheme.timeScale, visible: false },
    });
    const volSeries = volChart.addSeries(HistogramSeries, { color: 'rgba(99,179,237,0.35)', priceFormat: { type: 'volume' as const } });
    volSeries.setData(toHisto(klines.map(k => ({
      time: k.time, value: k.volume,
      color: k.close >= k.open ? 'rgba(38,166,154,0.45)' : 'rgba(239,83,80,0.45)',
    }))));

    // ── RSI or MACD ───────────────────────────────────────────────────────────
    if (showMACD && macdContainer) {
      macdChart = createChart(macdContainer, {
        ...baseTheme, width: w, height: PANE_SUB_H,
        timeScale: { ...baseTheme.timeScale, visible: false },
      });
      const macdData = (data.indicators as Record<string, unknown>).macd as Array<{ time: number; macd: number; signal: number; hist: number }> | undefined;
      if (macdData?.length) {
        const histSeries = macdChart.addSeries(HistogramSeries, { color: 'rgba(99,179,237,0.5)', priceFormat: { type: 'price' as const, precision: 6, minMove: 0.000001 } });
        histSeries.setData(macdData.map(d => ({
          time:  d.time as UTCTimestamp,
          value: d.hist,
          color: d.hist >= 0 ? 'rgba(38,166,154,0.7)' : 'rgba(239,83,80,0.7)',
        })));
        const macdLine_ = macdChart.addSeries(LineSeries, { color: '#63b3ed', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
        macdLine_.setData(macdData.map(d => ({ time: d.time as UTCTimestamp, value: d.macd })));
        const sigLine = macdChart.addSeries(LineSeries, { color: '#fbbf24', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
        sigLine.setData(macdData.map(d => ({ time: d.time as UTCTimestamp, value: d.signal })));
      }
    } else {
      rsiChart = createChart(rsiContainer as HTMLDivElement, {
        ...baseTheme, width: w, height: PANE_SUB_H,
        timeScale: { ...baseTheme.timeScale, visible: false },
        rightPriceScale: { ...baseTheme.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } },
      });
      const rsiS = rsiChart.addSeries(LineSeries, { color: '#fbbf24', lineWidth: 1, lastValueVisible: true, priceLineVisible: false });
      rsiS.setData(toLine(ind.rsi14 ?? []));
      rsiS.createPriceLine({ price: 70, color: 'rgba(239,83,80,0.45)', lineWidth: 1, lineStyle: 2, title: '' });
      rsiS.createPriceLine({ price: 30, color: 'rgba(38,166,154,0.45)', lineWidth: 1, lineStyle: 2, title: '' });
    }

    // ── OI Δ% pane (funding on main when overlay — here OI hist only) ───────
    if (oiEl) {
      const fundInOiPane =
        !hasFundingOverlay && fundingBars != null && fundingBars.length > 0;
      oiChart = createChart(oiEl, {
        ...baseTheme,
        width: w,
        height: PANE_OI_H,
        leftPriceScale: {
          visible: fundInOiPane,
          borderColor: BORDER,
          scaleMargins: { top: 0.12, bottom: 0.12 },
        },
        rightPriceScale: {
          borderColor: BORDER,
          scaleMargins: { top: 0.12, bottom: 0.18 },
        },
        timeScale: { ...baseTheme.timeScale, visible: true },
      });
      if (oiBars?.length) {
        const oiS = oiChart.addSeries(HistogramSeries, {
          priceScaleId: 'right',
          color: 'rgba(99,179,237,0.55)',
          priceFormat: { type: 'price', precision: 3, minMove: 0.001 },
        });
        oiS.setData(toHisto(oiBars));
      }
      if (fundInOiPane) {
        const fS = oiChart.addSeries(LineSeries, {
          priceScaleId: 'left',
          color: 'rgba(251,191,36,0.95)',
          lineWidth: 1,
          priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
          lastValueVisible: true,
          priceLineVisible: false,
        });
        fS.setData(toLine(fundingBars!.map((f) => ({ time: f.time, value: f.value }))));
      }
    }

    // ── CVD pane: Δ vol histogram + cumulative (always lives here now) ───────
    if (cvdEl && showCVD) {
      const cumInCvdPane = true;
      cvdChart = createChart(cvdEl, {
        ...baseTheme,
        width: w,
        height: cumInCvdPane ? PANE_CVD_H : PANE_OI_H,
        leftPriceScale: {
          visible: true,
          borderColor: BORDER,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        rightPriceScale: {
          visible: cumInCvdPane,
          borderColor: BORDER,
          scaleMargins: { top: 0.1, bottom: 0.2 },
        },
        timeScale: { ...baseTheme.timeScale, visible: true },
      });
      const deltaSeries = cvdChart.addSeries(HistogramSeries, {
        priceScaleId: 'left',
        priceFormat: { type: 'volume' },
      });
      deltaSeries.setData(
        toHisto(
          klines.map((k) => ({
            time: k.time,
            value: (k.close >= k.open ? 1 : -1) * k.volume,
            color: k.close >= k.open ? 'rgba(52,211,153,0.38)' : 'rgba(248,113,113,0.38)',
          })),
        ),
      );

      if (cumInCvdPane && cvdCumBars.length > 0) {
        const cumSeries = cvdChart.addSeries(LineSeries, {
          priceScaleId: 'right',
          color: '#5eead4',
          lineWidth: 1,
          lastValueVisible: true,
          priceLineVisible: false,
        });
        cumSeries.setData(toLine(cvdCumBars));
      }
    }

    syncTimeScales();
    void tick().then(() => {
      handleResize();
    });
  }

  // ── Verdict level lines ───────────────────────────────────────────────────
  function updateLevels() {
    if (!priceSeries) return;

    // Clear existing lines
    try { if (entryLine)  priceSeries.removePriceLine(entryLine);  } catch {}
    try { if (targetLine) priceSeries.removePriceLine(targetLine); } catch {}
    try { if (stopLine)   priceSeries.removePriceLine(stopLine);   } catch {}
    entryLine = targetLine = stopLine = null;

    if (!verdictLevels) return;

    if (verdictLevels.entry != null) {
      entryLine = priceSeries.createPriceLine({
        price: verdictLevels.entry,
        color: 'rgba(251,191,36,0.9)',
        lineWidth: 1, lineStyle: 0,
        axisLabelVisible: true, title: 'ENTRY',
      });
    }
    if (verdictLevels.target != null) {
      targetLine = priceSeries.createPriceLine({
        price: verdictLevels.target,
        color: 'rgba(38,166,154,0.9)',
        lineWidth: 1, lineStyle: 1,
        axisLabelVisible: true, title: 'TARGET',
      });
    }
    if (verdictLevels.stop != null) {
      stopLine = priceSeries.createPriceLine({
        price: verdictLevels.stop,
        color: 'rgba(239,83,80,0.9)',
        lineWidth: 1, lineStyle: 1,
        axisLabelVisible: true, title: 'STOP',
      });
    }
  }

  function clearLiqPriceLines() {
    if (!priceSeries) return;
    for (const pl of liqPriceLines) {
      try {
        priceSeries.removePriceLine(pl);
      } catch {
        /* removed with chart */
      }
    }
    liqPriceLines = [];
  }

  /** Nearest long/short liq + strongest cluster prices — same time axis as candles. */
  function applyLiqPriceLines() {
    clearLiqPriceLines();
    if (!priceSeries || !liqData) return;

    const addLine = (price: number, color: string, title: string, lw: 1 | 2) => {
      const pl = priceSeries!.createPriceLine({
        price,
        color,
        lineWidth: lw,
        lineStyle: 2,
        axisLabelVisible: title.length > 0,
        title,
      });
      liqPriceLines.push(pl);
    };

    if (liqData.nearestLong?.price != null && Number.isFinite(liqData.nearestLong.price)) {
      addLine(liqData.nearestLong.price, 'rgba(248,113,113,0.92)', 'L-LIQ', 2);
    }
    if (liqData.nearestShort?.price != null && Number.isFinite(liqData.nearestShort.price)) {
      addLine(liqData.nearestShort.price, 'rgba(52,211,153,0.92)', 'S-LIQ', 2);
    }

    const clusters = [...(liqData.clusters ?? [])].sort((a, b) => b.usd - a.usd).slice(0, 3);
    const used = new Set<number>();
    for (const nl of [liqData.nearestLong, liqData.nearestShort]) {
      if (nl?.price != null) used.add(Math.round(nl.price * 100));
    }
    for (const c of clusters) {
      const key = Math.round(c.price * 100);
      if (used.has(key)) continue;
      used.add(key);
      const a = 0.35 + Math.min(0.45, (c.usd / 500000) * 0.45);
      const col = c.liquidatedSide === 'long' ? `rgba(248,113,113,${a})` : `rgba(52,211,153,${a})`;
      addLine(c.price, col, '', 1);
    }
  }

  // ── Time scale sync ────────────────────────────────────────────────────────
  function syncTimeScales() {
    if (!mainChart) return;
    const subs = [volChart, rsiChart, macdChart, oiChart].filter(
      (c): c is IChartApi => c !== null
    );
    const subsWithCvd = [...subs, cvdChart].filter(
      (c): c is IChartApi => c !== null
    );
    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      subsWithCvd.forEach(c => c.timeScale().setVisibleLogicalRange(range));
      refreshCaptureWindowSummary();
      if (range.from < LAZY_TRIGGER_BARS) void loadMoreHistory();
    });
    subsWithCvd.forEach(c => {
      c.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (!range) return;
        mainChart!.timeScale().setVisibleLogicalRange(range);
        subsWithCvd.filter(o => o !== c).forEach(o => o.timeScale().setVisibleLogicalRange(range));
        refreshCaptureWindowSummary();
      });
    });
  }

  function destroyCharts() {
    clearLiqPriceLines();
    // Detach Layer 1 primitive before removing chart (W-0086)
    rangeClickUnsubscribe?.();
    rangeClickUnsubscribe = null;
    detachRangePrimitive();
    [mainChart, volChart, rsiChart, macdChart, oiChart, cvdChart].forEach(c => c?.remove());
    mainChart = volChart = rsiChart = macdChart = oiChart = cvdChart = null;
    priceSeries = null;
    entryLine = targetLine = stopLine = null;
  }

  function handleResize() {
    if (!containerEl) return;
    const w = Math.max(120, mainEl?.offsetWidth ?? containerEl.offsetWidth);
    const fundStyleOverlay = derivativesOnMain && chartMode === 'candle';
    let mainH =
      mainEl && mainEl.clientHeight > 48
        ? mainEl.clientHeight
        : fundStyleOverlay
          ? 400
          : 340;
    mainChart?.resize(w, mainH);
    const vh = volEl && volEl.clientHeight > 24 ? volEl.clientHeight : PANE_VOL_H;
    const subPane = showMACD ? macdEl : rsiEl;
    const sh = subPane && subPane.clientHeight > 24 ? subPane.clientHeight : PANE_SUB_H;
    volChart?.resize(w, vh);
    rsiChart?.resize(w, sh);
    macdChart?.resize(w, sh);
    const oih = oiEl && oiEl.clientHeight > 24 ? oiEl.clientHeight : PANE_OI_H;
    oiChart?.resize(w, oih);
    const cvdh = cvdEl && cvdEl.clientHeight > 24 ? cvdEl.clientHeight : PANE_CVD_H;
    cvdChart?.resize(w, cvdh);
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
    return slicePayloadToViewport(data, from, to, currentTime ?? undefined);
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
    // Also fire parent callback if provided
    onSaveSetup?.({ symbol, timestamp: currentTime ?? Math.floor(Date.now() / 1000), tf });
    // Clear toast after 4s
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
    overlay: 'derivatives',
  };

  function toggleStudy(id: StudyId) {
    const key = STUDY_TO_INDICATOR[id];
    if (key) toggleChartIndicator(key);
  }

  /** Hide a sub-pane indicator — fires from pane × buttons (W-0102 Slice 3). */
  function hidePane(key: IndicatorKey) {
    removeChartIndicator(key);
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
    void loadData();
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
    void cvdDivergence;
    void derivativesOnMain;
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

  // Close indicators panel on outside click (deferred so the opening click does not close it).
  $effect(() => {
    if (!studiesPanelOpen || typeof document === 'undefined') return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node) || !studiesWrapEl?.contains(t)) {
        studiesPanelOpen = false;
      }
    };
    const id = window.setTimeout(() => {
      document.addEventListener('click', onDocClick, true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', onDocClick, true);
    };
  });
</script>

<div
  class="chart-board"
  bind:this={containerEl}
  data-context={contextMode}
  data-deriv-overlay={derivativesOnMain ? '1' : '0'}
>

  <!-- ── ChartToolbar (TF selector + export) ────── -->
  <ChartToolbar {tf} onTfChange={selectTf} />

  <!-- ── Toolbar (TradingView-style: symbol → interval strip → studies) ────── -->
  <div class="chart-header chart-header--tv">
    <div class="tv-row tv-row--top">
      <!-- Single compact toolbar: venue tag + regime (unique to this pane) +
           chart mode + studies popover + capture controls. Price/%/TF are
           handled by the global CommandBar directly above. -->
      <div class="chart-symbol tv-symbol-cluster chart-symbol--compact">
        <span class="sym-quote">PERP</span>
        {#if quantRegime?.label}
          <span class="sym-regime-pill" data-tone={quantRegime.tone}>{quantRegime.label}</span>
        {/if}
      </div>

      <div class="tv-actions">
        <div class="mode-switch">
          <button class="mode-btn" class:active={chartMode === 'candle'} onclick={() => { chartMode = 'candle'; }}>Candles</button>
          <button class="mode-btn" class:active={chartMode === 'line'} onclick={() => { chartMode = 'line'; }}>Line</button>
        </div>
      </div>
      <!-- Studies / capture / save actions inline on the same row -->
      <!-- (tv-studies-wrap and following siblings continue below inside tv-row--top) -->
      <div class="tv-studies-wrap" bind:this={studiesWrapEl}>
        <button
          type="button"
          class="tv-indicators-trigger"
          class:is-open={studiesPanelOpen}
          onclick={(e) => {
            e.stopPropagation();
            studiesPanelOpen = !studiesPanelOpen;
          }}
          aria-expanded={studiesPanelOpen}
          aria-controls="tv-indicators-panel"
          id="tv-indicators-trigger"
        >
          <span class="tv-indicators-glyph" aria-hidden="true">fx</span>
          Indicators
          {#if activeIndicatorCount > 0}
            <span class="tv-ind-count">{activeIndicatorCount}</span>
          {/if}
        </button>
        {#if studiesPanelOpen}
          <div
            class="tv-studies-panel"
            id="tv-indicators-panel"
            role="dialog"
            aria-labelledby="tv-indicators-trigger"
          >
            <p class="tv-panel-baseline">Moving averages <strong>5 / 20 / 60</strong> are always drawn.</p>

            <label class="tv-search-wrap" for="tv-study-search">
              <span class="tv-study-sublabel">Search studies</span>
              <input
                id="tv-study-search"
                class="tv-study-search"
                type="search"
                bind:value={studyQuery}
                placeholder="EMA, VWAP, CVD, MACD..."
              />
            </label>

            {#if studySections.length > 0}
              {#each studySections as section (section.category)}
                <section class="tv-panel-section" aria-label={section.category}>
                  <h3 class="tv-panel-section-title">{section.category}</h3>
                  {#each section.items as study (study.id)}
                    <button
                      type="button"
                      class="tv-study-button"
                      class:is-active={study.active}
                      onclick={() => toggleStudy(study.id)}
                    >
                      <span class="tv-study-main">
                        <strong>{study.label}</strong>
                        <small>{study.description}</small>
                      </span>
                      <span class="tv-study-meta">
                        {#if study.meta}
                          <em>{study.meta}</em>
                        {/if}
                        <span class="tv-study-state">{study.active ? 'On' : 'Off'}</span>
                      </span>
                    </button>
                    {#if study.id === 'ema' && showEMA && emaTfOptions.length > 0}
                      <div class="tv-study-nested">
                        <label class="tv-study-sublabel" for="tv-ema-tf">EMA resolution</label>
                        <select id="tv-ema-tf" class="tv-panel-select" bind:value={emaTf}>
                          <option value="">Same as chart</option>
                          {#each emaTfOptions as et (et)}
                            <option value={et}>{et}</option>
                          {/each}
                        </select>
                        <p class="tv-study-help">Higher TF EMA is stepped onto chart bars to preserve the TradingView-style MTF read.</p>
                      </div>
                    {/if}
                  {/each}
                </section>
              {/each}
            {:else}
              <div class="tv-study-empty">No matching studies. Try EMA, VWAP, RSI, MACD, CVD, or funding.</div>
            {/if}
          </div>
        {/if}
      </div>
      <div class="capture-inline" aria-label="Visible capture window">
        <span class="capture-kicker">CAPTURE</span>
        <strong class="capture-label">{captureWindowLabel}</strong>
        {#if captureBarCount !== null}
          <span class="capture-meta">· {captureBarCount} bars</span>
        {/if}
      </div>
      <div class="capture-actions">
        <button class="capture-save-btn" onclick={handleSaveSetup} aria-label="Save current visible range">
          Save Setup
        </button>
        {#if savedCaptureId}
          <a class="capture-open-btn" href={`/lab?captureId=${encodeURIComponent(savedCaptureId)}&autorun=1`}>
            이거 찾아줘 →
          </a>
        {/if}
      </div>
    </div>
  </div>

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
      <button onclick={loadData}>Retry</button>
    </div>
  {:else}
    <div class="chart-stack" class:range-mode={$chartSaveMode.active} bind:this={chartStackEl}>
    <!-- Layer 2 overlay container — pointer-events: none; only chips/buttons inside use auto (W-0086) -->
    <div class="chart-layer2-overlay">
      <div class="layer2-topright">
        <RangeModeToast active={$chartSaveMode.active} anchorASet={$chartSaveMode.anchorA !== null} />
        <PhaseBadge phase={null} />
      </div>
    </div>
    <div class="pane-main"  bind:this={mainEl}></div>

    <!-- Indicator panes (Vol, MACD/RSI, OI, CVD) ────────────────────────────── -->
    <IndicatorPaneStack {showMACD} {showCVD} onHidePane={hidePane}>
      <div class="pane-label">VOL</div>
      <div class="pane-vol"   bind:this={volEl}></div>

      {#if showMACD}
        <div class="pane-label">MACD</div>
        <div class="pane-sub"  bind:this={macdEl}></div>
      {:else}
        <div class="pane-label">RSI 14</div>
        <div class="pane-sub"  bind:this={rsiEl}></div>
      {/if}

      <div class="pane-label pane-label-split">
        <span>OI Δ%</span>
        <span class="pane-hint">hist</span>
        <span class="pane-hint pane-hint-gold">Fund %</span>
      </div>
      <div class="pane-oi"    bind:this={oiEl}></div>

      {#if showCVD}
        <div class="pane-label pane-label-split">
          <span>CVD</span>
          <span class="pane-hint">Δ vol</span>
          <span class="pane-hint pane-hint-mint">cum</span>
          <button
            type="button"
            class="pane-close"
            aria-label="Hide CVD pane"
            onclick={() => hidePane('cvd')}
          >×</button>
        </div>
        <div class="pane-cvd" bind:this={cvdEl}></div>
      {/if}
    </IndicatorPaneStack>
    </div>
    <SaveStrip
      {symbol}
      {tf}
      ohlcvBars={chartData?.klines ?? []}
      onSaved={(id) => { onCaptureSaved?.(id); }}
    />
    {#if contextMode === 'full'}
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
            Mid {currentPrice ? currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
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
          <small class="liq-c">Now {currentPrice ? currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}</small>
          <small class="liq-s">Short liq {liqData?.nearestShort?.usd != null ? `${(liqData.nearestShort.usd / 1000).toFixed(1)}k @ ` : ''}{liqShort ? liqShort.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}</small>
        </div>
      </div>
    </div>
      </div>
    </details>
    {/if}
  {/if}

</div>

<!-- W-0117: SaveStrip — appears below chart when range is selected -->
<SaveStrip
  {symbol}
  tf={tf}
  ohlcvBars={(chartData?.klines ?? []) as Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>}
  onSaved={(id) => { savedCaptureId = id; }}
/>

<!-- Save Setup Modal -->
<SaveSetupModal
  symbol={symbol}
  timestamp={currentTime ?? Math.floor(Date.now() / 1000)}
  tf={tf}
  open={showSaveModal}
  getViewportCapture={getViewportForSave}
  onClose={() => {
    showSaveModal = false;
  }}
  onSaved={handleModalSaved}
/>

<!-- Toast: saved confirmation -->
{#if savedCaptureId}
  <div class="save-toast">
    ✓ 캡처 저장됨 — <a href={`/lab?captureId=${encodeURIComponent(savedCaptureId)}&autorun=1`} class="toast-link">이거 찾아줘 →</a>
  </div>
{/if}

<style>
  /* ── Layer 2 overlay (W-0086) ── */
  .chart-layer2-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    /* Overlay sits above chart canvas but below header chrome */
    z-index: 15;
    pointer-events: none;
  }
  .layer2-topright {
    position: absolute;
    top: 8px;
    right: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    pointer-events: none;
  }

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

  /* ── Toolbar (TV-style tiers) ── */
  .chart-header {
    flex-shrink: 0;
  }
  .chart-header--tv {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    padding: 6px 10px 8px;
    border-bottom: 1px solid rgba(42, 46, 57, 0.95);
    background: #131722;
    position: relative;
    z-index: 20;
  }
  .tv-row {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .tv-row--top {
    justify-content: space-between;
    gap: 10px;
  }
  .tv-symbol-cluster {
    flex: 1 1 auto;
    min-width: 0;
  }
  .tv-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex-shrink: 0;
  }
  .tv-row--compact {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(42, 46, 57, 0.85);
    gap: 10px;
    flex-wrap: nowrap;
  }
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
  .capture-inline {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    white-space: nowrap;
  }
  .capture-inline .capture-kicker {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    letter-spacing: 0.12em;
    color: rgba(177, 181, 189, 0.5);
  }
  .capture-inline .capture-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 600;
    color: rgba(247, 242, 234, 0.82);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .capture-inline .capture-meta {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(99, 179, 237, 0.68);
  }
  .capture-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .tf-scroll::-webkit-scrollbar {
    height: 4px;
  }
  .tf-scroll::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 2px;
  }
  .tf-scroll .tf-btn {
    flex-shrink: 0;
  }
  /* legacy selectors removed — compact row now owns these styles */
  .capture-save-btn {
    padding: 6px 12px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    background: rgba(38, 166, 154, 0.16);
    border: 1px solid rgba(38, 166, 154, 0.36);
    color: #7ad5c2;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.12s ease;
  }
  .capture-save-btn:hover {
    background: rgba(38, 166, 154, 0.24);
    border-color: rgba(38, 166, 154, 0.52);
    color: #a7efe0;
  }
  .capture-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .capture-open-btn {
    padding: 6px 12px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    color: #9ac3ff;
    background: rgba(99, 179, 237, 0.12);
    border: 1px solid rgba(99, 179, 237, 0.28);
    border-radius: 4px;
    text-decoration: none;
    white-space: nowrap;
  }
  .capture-open-btn:hover {
    background: rgba(99, 179, 237, 0.18);
    border-color: rgba(99, 179, 237, 0.4);
  }
  .tv-studies-wrap {
    position: relative;
    flex-shrink: 0;
  }
  .tv-indicators-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 600;
    color: #d1d4dc;
    background: #1e222d;
    border: 1px solid #363a45;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease;
  }
  .tv-indicators-trigger:hover {
    background: #2a2e39;
    border-color: #434651;
  }
  .tv-indicators-trigger.is-open {
    background: #2962ff;
    border-color: #2962ff;
    color: #fff;
  }
  .tv-indicators-glyph {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    opacity: 0.9;
  }
  .tv-ind-count {
    min-width: 18px;
    padding: 0 5px;
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.12);
    color: inherit;
  }
  .tv-indicators-trigger.is-open .tv-ind-count {
    background: rgba(255, 255, 255, 0.22);
  }
  .tv-studies-panel {
    position: absolute;
    left: 0;
    top: calc(100% + 6px);
    z-index: 50;
    width: min(340px, calc(100vw - 32px));
    max-height: min(70vh, 520px);
    overflow-y: auto;
    padding: 10px 12px 12px;
    background: #1e222d;
    border: 1px solid #363a45;
    border-radius: 4px;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.55);
  }
  .tv-search-wrap {
    display: grid;
    gap: 4px;
    margin-bottom: 10px;
  }
  .tv-study-search {
    width: 100%;
    padding: 7px 9px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: #d1d4dc;
    background: #131722;
    border: 1px solid #363a45;
    border-radius: 3px;
  }
  .tv-study-search:focus {
    outline: none;
    border-color: #2962ff;
  }
  .tv-panel-baseline {
    margin: 0 0 10px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    line-height: 1.35;
    color: rgba(177, 181, 189, 0.72);
  }
  .tv-panel-baseline strong {
    color: #b2b5be;
    font-weight: 600;
  }
  .tv-panel-section {
    padding-top: 8px;
    margin-top: 8px;
    border-top: 1px solid rgba(54, 58, 69, 0.95);
  }
  .tv-panel-section:first-of-type {
    padding-top: 0;
    margin-top: 0;
    border-top: none;
  }
  .tv-panel-section-title {
    margin: 0 0 8px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(177, 181, 189, 0.55);
  }
  .tv-study-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: #d1d4dc;
    cursor: pointer;
    user-select: none;
  }
  .tv-study-nested {
    margin: -4px 0 10px 24px;
    padding: 8px 10px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(54, 58, 69, 0.9);
    border-radius: 3px;
  }
  .tv-study-sublabel {
    display: block;
    margin-bottom: 4px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(177, 181, 189, 0.5);
  }
  .tv-panel-select {
    width: 100%;
    padding: 5px 8px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: #d1d4dc;
    background: #131722;
    border: 1px solid #363a45;
    border-radius: 3px;
    cursor: pointer;
  }
  .tv-panel-select:focus {
    outline: none;
    border-color: #2962ff;
  }
  .tv-study-help {
    margin: 6px 0 0;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    line-height: 1.35;
    color: rgba(177, 181, 189, 0.45);
  }
  .tv-study-button {
    width: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
    padding: 8px 9px;
    text-align: left;
    background: rgba(19, 23, 34, 0.75);
    border: 1px solid rgba(54, 58, 69, 0.95);
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease;
  }
  .tv-study-button:hover {
    background: rgba(30, 34, 45, 0.95);
    border-color: rgba(99, 179, 237, 0.24);
  }
  .tv-study-button.is-active {
    background: rgba(41, 98, 255, 0.12);
    border-color: rgba(41, 98, 255, 0.45);
  }
  .tv-study-main {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .tv-study-main strong,
  .tv-study-main small,
  .tv-study-meta em,
  .tv-study-state,
  .tv-study-empty {
    font-family: var(--sc-font-mono, monospace);
  }
  .tv-study-main strong {
    font-size: 11px;
    color: #f1f3f6;
    font-weight: 600;
  }
  .tv-study-main small {
    font-size: 9px;
    line-height: 1.35;
    color: rgba(177, 181, 189, 0.58);
  }
  .tv-study-meta {
    display: grid;
    justify-items: end;
    gap: 4px;
    flex-shrink: 0;
  }
  .tv-study-meta em {
    font-style: normal;
    font-size: 8px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(177, 181, 189, 0.48);
  }
  .tv-study-state {
    min-width: 30px;
    padding: 2px 6px;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(239, 242, 247, 0.78);
    border: 1px solid rgba(54, 58, 69, 0.95);
    border-radius: 999px;
    text-align: center;
  }
  .tv-study-button.is-active .tv-study-state {
    background: rgba(41, 98, 255, 0.2);
    border-color: rgba(99, 179, 237, 0.35);
    color: #dce8ff;
  }
  .tv-study-empty {
    padding: 10px 0 2px;
    font-size: 10px;
    line-height: 1.4;
    color: rgba(177, 181, 189, 0.56);
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
    font-size: 8px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(177, 181, 189, 0.46);
  }
  .tv-context-pill strong {
    font-size: 9px;
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
    font-size: 8px;
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

  .chart-symbol {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px 14px;
    min-width: 0;
  }
  .sym-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .price-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .sym-kicker {
    font-family: var(--sc-font-mono, monospace);
    font-size: 7px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.32);
  }
  .sym-metrics {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px 8px;
    min-width: 0;
  }
  .metric-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.35);
    margin-right: 3px;
  }
  .sym-change-muted {
    opacity: 0.88;
  }
  .sym-name {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.04em;
  }
  .sym-quote {
    font-weight: 400;
    color: rgba(255,255,255,0.35);
    font-size: 10px;
  }
  .sym-price {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255,255,255,0.65);
  }
  .sym-change,
  .sym-chip {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
  }
  .sym-change { font-weight: 700; }
  .price-up { color: #34c470; }
  .price-down { color: #e85555; }
  .sym-regime-pill {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    border-radius: 999px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    color: rgba(239, 242, 247, 0.78);
  }
  .sym-regime-pill[data-tone='bull'] {
    color: #8fdd9d;
    border-color: rgba(74, 222, 128, 0.18);
    background: rgba(74, 222, 128, 0.08);
  }
  .sym-regime-pill[data-tone='bear'] {
    color: #f19999;
    border-color: rgba(248, 113, 113, 0.18);
    background: rgba(248, 113, 113, 0.08);
  }
  .sym-regime-pill[data-tone='warn'] {
    color: #e9c167;
    border-color: rgba(251, 191, 36, 0.18);
    background: rgba(251, 191, 36, 0.08);
  }
  .sym-chip {
    color: rgba(255,255,255,0.48);
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
  }

  .chart-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .mode-switch {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 3px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
  }
  .mode-btn {
    padding: 2px 6px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    background: transparent;
    border: 1px solid transparent;
    color: rgba(255,255,255,0.35);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.1s;
  }
  .mode-btn.active {
    color: #63b3ed;
    background: rgba(99,179,237,0.1);
    border-color: rgba(99,179,237,0.25);
  }

  /* TF buttons */
  .tf-group {
    display: flex;
    gap: 1px;
  }
  .tf-btn {
    padding: 2px 5px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.35);
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.1s;
    letter-spacing: 0.02em;
  }
  .tf-btn:hover  { color: rgba(255,255,255,0.6); border-color: rgba(255,255,255,0.15); }
  .tf-btn.active { background: rgba(255,255,255,0.09); color: #fff; border-color: rgba(255,255,255,0.22); }

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
    font-size: 10px;
  }
  .pulse {
    width: 5px; height: 5px; border-radius: 50%;
    background: rgba(255,255,255,0.3);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100%{opacity:.25} 50%{opacity:1} }
  .state-text { font-size: 10px; }

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
  .chart-stack.range-mode,
  .chart-stack.range-mode * {
    cursor: crosshair !important;
  }
  .pane-main {
    flex: 1 1 58%;
    min-height: 260px;
    height: auto;
  }
  .chart-board[data-deriv-overlay='1'] .pane-main {
    min-height: 300px;
  }
  .chart-board[data-context='chart'] .pane-main {
    min-height: min(48vh, 560px);
  }
  .pane-vol  { flex-shrink: 0; height: 60px; min-height: 60px; }
  .pane-sub  { flex-shrink: 0; height: 80px; min-height: 80px; }
  .pane-oi   { flex-shrink: 0; height: 72px; min-height: 72px; }
  .pane-cvd  { flex-shrink: 0; height: 84px; min-height: 84px; }
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
    font-size: 10px;
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
  .pane-label-split > span:first-child {
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(177, 181, 189, 0.82);
  }
  .pane-hint {
    font-size: 9px;
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
    font-size: 8px;
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
    .micro-bars {
      grid-template-columns: 1fr;
    }
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
      font-size: 9px;
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
    /* Extra small mobile adjustments */
    .chart-board {
      min-height: 300px;
    }
    .pane-label {
      font-size: 8px;
      margin-bottom: 2px;
    }
  }
</style>
