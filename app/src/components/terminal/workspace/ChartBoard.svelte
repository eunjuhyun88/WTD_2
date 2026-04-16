<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
  import type { UTCTimestamp, IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
  import type { DepthLadderEnvelope, LiquidationClustersEnvelope } from '$lib/contracts/terminalBackend';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import type { ChartViewportSnapshot } from '$lib/contracts/terminalPersistence';
  import { chartTimeToUnixSeconds, slicePayloadToViewport } from '$lib/terminal/chartViewportCapture';
  import SaveSetupModal from './SaveSetupModal.svelte';

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
    onSaveSetup?:   (snap: { symbol: string; timestamp: number; tf: string }) => void;
    onTfChange?:    (tf: string) => void;
  }

  let {
    symbol,
    tf: externalTf,
    verdictLevels,
    initialData = null,
    depthSnapshot = null,
    liqSnapshot = null,
    onSaveSetup,
    onTfChange,
  }: Props = $props();

  // ── Internal TF state — syncs with externalTf if provided ─────────────────
  // Start with '1h'; externalTf takes precedence via $derived when set by parent
  let internalTf = $state('1h');
  let tf = $derived(externalTf ?? internalTf);

  // ── DOM refs ───────────────────────────────────────────────────────────────
  let containerEl  = $state<HTMLDivElement | undefined>(undefined);
  let mainEl       = $state<HTMLDivElement | undefined>(undefined);
  let volEl        = $state<HTMLDivElement | undefined>(undefined);
  let rsiEl        = $state<HTMLDivElement | undefined>(undefined);
  let macdEl       = $state<HTMLDivElement | undefined>(undefined);
  let oiEl         = $state<HTMLDivElement | undefined>(undefined);
  let cvdEl        = $state<HTMLDivElement | undefined>(undefined);

  // ── UI state ───────────────────────────────────────────────────────────────
  let loading  = $state(true);
  let error    = $state<string | null>(null);
  let currentPrice = $state<number | null>(null);
  let currentTime  = $state<number | null>(null);
  let currentChangePct = $state<number | null>(null);
  let currentRsi = $state<number | null>(null);
  let currentOiDelta = $state<number | null>(null);
  let currentFundingRate = $state<number | null>(null);
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

  // Save Setup modal
  let showSaveModal = $state(false);
  let savedSlug     = $state<string | null>(null);   // shown as toast after save

  // Indicator toggles
  let showVWAP = $state(true);
  let showBB   = $state(false);
  let showEMA  = $state(true);
  let showATRBands = $state(false);
  let showCVD = $state(true);
  let showMACD = $state(false);   // replaces RSI pane when active
  let chartMode = $state<'candle' | 'line'>('candle');

  // ── Chart instances ────────────────────────────────────────────────────────
  let mainChart: IChartApi | null = null;
  let volChart:  IChartApi | null = null;
  let rsiChart:  IChartApi | null = null;
  let macdChart: IChartApi | null = null;
  let oiChart:   IChartApi | null = null;
  let cvdChart:  IChartApi | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let priceSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null = null;

  // Level price lines
  let entryLine:  ReturnType<ISeriesApi<SeriesType>['createPriceLine']> | null = null;
  let targetLine: ReturnType<ISeriesApi<SeriesType>['createPriceLine']> | null = null;
  let stopLine:   ReturnType<ISeriesApi<SeriesType>['createPriceLine']> | null = null;

  // ── Timeframes ────────────────────────────────────────────────────────────
  const TIMEFRAMES = ['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','1w'];

  // ── Theme ─────────────────────────────────────────────────────────────────
  const BG    = '#0a0a0a';
  const GRID  = 'rgba(255,255,255,0.04)';
  const TEXT  = 'rgba(255,255,255,0.45)';
  const BORDER = 'rgba(255,255,255,0.07)';

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

  // ── Data load ─────────────────────────────────────────────────────────────
  let chartData = $state<ChartSeriesPayload | null>(null);
  const chartDataCache = new Map<string, ChartSeriesPayload>();
  let loadToken = 0;
  let lastDataKey = '';

  async function loadData() {
    if (!symbol) return;
    const dataKey = `${symbol}:${tf}`;
    if (dataKey === lastDataKey && chartData) return;

    if (initialData) {
      chartDataCache.set(dataKey, initialData);
      chartData = initialData;
      depthData = depthSnapshot;
      liqData = liqSnapshot;
      error = null;
      loading = false;
      lastDataKey = dataKey;
      return;
    }

    if (chartDataCache.has(dataKey)) {
      chartData = chartDataCache.get(dataKey) ?? null;
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
    try {
      const chartRes = await fetch(`/api/chart/klines?symbol=${symbol}&tf=${tf}&limit=500`);
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
    } catch (e) {
      if (token !== loadToken) return;
      error = String(e);
      loading = false;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  type LinePoint  = { time: UTCTimestamp; value: number };
  type HistoPoint = { time: UTCTimestamp; value: number; color?: string };

  function toLine(arr: Array<{ time: number; value: number }>): LinePoint[] {
    return arr.map(p => ({ time: p.time as UTCTimestamp, value: p.value }));
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

    const rsiContainer = rsiEl;
    const macdContainer = macdEl;

    const w = containerEl?.offsetWidth ?? 900;

    // ── Main (candles + overlays) ────────────────────────────────────────────
    mainChart = createChart(mainEl, {
      ...baseTheme,
      width: w, height: 340,
      rightPriceScale: { ...baseTheme.rightPriceScale, scaleMargins: { top: 0.08, bottom: 0.08 } },
    });

    const ind = data.indicators as Record<string, Array<{ time: number; value: number }>>;
    const klines = data.klines as Array<{ time: number; open: number; close: number; high: number; low: number; volume: number }>;
    const oiBars = data.oiBars as Array<{ time: number; value: number; color: string }>;
    const fundingBars = data.fundingBars as Array<{ time: number; value: number; color: string }> | undefined;
    const cvdRaw = data.cvdBars as Array<{ time: number; value: number }> | undefined;

    const lastBar = klines[klines.length - 1];
    const prevBar = klines[klines.length - 2];
    currentPrice = lastBar?.close ?? null;
    currentTime = lastBar?.time ?? null;
    currentChangePct = lastBar && prevBar && prevBar.close > 0 ? ((lastBar.close - prevBar.close) / prevBar.close) * 100 : null;
    currentRsi = ind.rsi14?.length ? ind.rsi14[ind.rsi14.length - 1]?.value ?? null : null;
    currentOiDelta = oiBars?.length ? oiBars[oiBars.length - 1]?.value ?? null : null;
    currentFundingRate = fundingBars?.length ? fundingBars[fundingBars.length - 1]?.value ?? null : null;

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
      priceSeries = candleSeries;
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

    // EMA engine overlays
    if (showEMA) {
      const emaFast = ind.ema21 ?? ind.ema20;
      const emaSlow = ind.ema55 ?? ind.ema60;
      if (emaFast?.length) {
        const s = mainChart.addSeries(LineSeries, { color: 'rgba(64,196,255,0.9)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
        s.setData(toLine(emaFast));
      }
      if (emaSlow?.length) {
        const s = mainChart.addSeries(LineSeries, { color: 'rgba(255,152,0,0.9)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
        s.setData(toLine(emaSlow));
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

    // Verdict price levels
    updateLevels();

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
      ...baseTheme, width: w, height: 60,
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
        ...baseTheme, width: w, height: 80,
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
        ...baseTheme, width: w, height: 80,
        timeScale: { ...baseTheme.timeScale, visible: false },
        rightPriceScale: { ...baseTheme.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } },
      });
      const rsiS = rsiChart.addSeries(LineSeries, { color: '#fbbf24', lineWidth: 1, lastValueVisible: true, priceLineVisible: false });
      rsiS.setData(toLine(ind.rsi14 ?? []));
      rsiS.createPriceLine({ price: 70, color: 'rgba(239,83,80,0.45)', lineWidth: 1, lineStyle: 2, title: '' });
      rsiS.createPriceLine({ price: 30, color: 'rgba(38,166,154,0.45)', lineWidth: 1, lineStyle: 2, title: '' });
    }

    // ── OI Δ% ────────────────────────────────────────────────────────────────
    if (oiEl) {
      oiChart = createChart(oiEl, {
        ...baseTheme, width: w, height: 60,
        timeScale: { ...baseTheme.timeScale, visible: true },
      });
      if (oiBars?.length) {
        const oiS = oiChart.addSeries(HistogramSeries, { color: 'rgba(99,179,237,0.5)' });
        oiS.setData(toHisto(oiBars));
      }
    }

    // ── CVD ─────────────────────────────────────────────────────────────────
    if (cvdEl && showCVD) {
      cvdChart = createChart(cvdEl, {
        ...baseTheme, width: w, height: 70,
        timeScale: { ...baseTheme.timeScale, visible: true },
      });
      const cvdSeries = cvdChart.addSeries(LineSeries, {
        color: '#34c470',
        lineWidth: 1,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      const cvdBars: Array<{ time: number; value: number }> = cvdRaw?.length
        ? cvdRaw
        : (() => {
            let acc = 0;
            return klines.map((k) => {
              const signedVol = (k.close >= k.open ? 1 : -1) * k.volume;
              acc += signedVol;
              return { time: k.time, value: acc };
            });
          })();
      cvdSeries.setData(toLine(cvdBars));
    }

    syncTimeScales();
    mainChart.subscribeClick((param) => {
      if (param.time) {
        currentTime = param.time as number;
        showSaveModal = true;
      }
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
    });
    subsWithCvd.forEach(c => {
      c.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (!range) return;
        mainChart!.timeScale().setVisibleLogicalRange(range);
        subsWithCvd.filter(o => o !== c).forEach(o => o.timeScale().setVisibleLogicalRange(range));
      });
    });
  }

  function destroyCharts() {
    [mainChart, volChart, rsiChart, macdChart, oiChart, cvdChart].forEach(c => c?.remove());
    mainChart = volChart = rsiChart = macdChart = oiChart = cvdChart = null;
    priceSeries = null;
    entryLine = targetLine = stopLine = null;
  }

  function handleResize() {
    if (!containerEl) return;
    const w = containerEl.offsetWidth;
    mainChart?.resize(w, 340);
    volChart?.resize(w, 60);
    rsiChart?.resize(w, 80);
    macdChart?.resize(w, 80);
    oiChart?.resize(w, 60);
    cvdChart?.resize(w, 70);
  }

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
        const swap = from;
        from = to;
        to = swap;
      }
    } else {
      from = data.klines[0].time;
      to = data.klines[data.klines.length - 1].time;
    }
    return slicePayloadToViewport(data, from, to, currentTime ?? undefined);
  }

  function handleSaveSetup() {
    // Open modal instead of direct POST — user selects phase label + note
    showSaveModal = true;
  }

  function handleModalSaved(slug: string) {
    showSaveModal = false;
    savedSlug = slug;
    // Also fire parent callback if provided
    onSaveSetup?.({ symbol, timestamp: currentTime ?? Math.floor(Date.now() / 1000), tf });
    // Clear toast after 4s
    setTimeout(() => { savedSlug = null; }, 4000);
  }

  function selectTf(t: string) {
    internalTf = t;
    onTfChange?.(t);
  }

  onMount(() => {
    resizeObserver = new ResizeObserver(handleResize);
    if (containerEl) resizeObserver.observe(containerEl);
  });
  onDestroy(() => { destroyCharts(); resizeObserver?.disconnect(); });

  // Remote data should only reload when the market context changes.
  $effect(() => {
    void symbol;
    void tf;
    void initialData;
    void loadData();
  });

  // Depth/liquidation data comes from the parent terminal page to avoid duplicate requests.
  $effect(() => {
    depthData = depthSnapshot;
    liqData = liqSnapshot;
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
    const data = chartData;
    if (!data || loading) return;
    void tick().then(() => {
      renderCharts(data);
    });
  });

  // Update price lines when verdict changes (no reload)
  $effect(() => {
    void verdictLevels;
    updateLevels();
  });
</script>

<div class="chart-board" bind:this={containerEl}>

  <!-- ── Header ────────────────────────────────────────────────────────────── -->
  <div class="chart-header">
    <div class="chart-symbol">
      <span class="sym-name">{symbol.replace('USDT','')}<span class="sym-quote">/USDT·PERP</span></span>
      {#if currentPrice !== null}
        <span class="sym-price">{currentPrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
      {/if}
      {#if currentChangePct !== null}
        <span class:price-up={currentChangePct >= 0} class:price-down={currentChangePct < 0} class="sym-change">
          {currentChangePct >= 0 ? '+' : ''}{currentChangePct.toFixed(2)}%
        </span>
      {/if}
      {#if currentRsi !== null}
        <span class="sym-chip">RSI {currentRsi.toFixed(1)}</span>
      {/if}
      {#if currentOiDelta !== null}
        <span class="sym-chip">OI Δ {currentOiDelta >= 0 ? '+' : ''}{currentOiDelta.toFixed(1)}%</span>
      {/if}
      {#if currentFundingRate !== null}
        <span class="sym-chip">Funding {currentFundingRate >= 0 ? '+' : ''}{currentFundingRate.toFixed(4)}%</span>
      {/if}
    </div>

    <div class="chart-controls">
      <div class="mode-switch">
        <button class="mode-btn" class:active={chartMode === 'candle'} onclick={() => { chartMode = 'candle'; }}>Candle</button>
        <button class="mode-btn" class:active={chartMode === 'line'} onclick={() => { chartMode = 'line'; }}>Line</button>
      </div>

      <!-- TF row -->
      <div class="tf-group">
        {#each TIMEFRAMES as t}
          <button
            class="tf-btn"
            class:active={tf === t}
            onclick={() => selectTf(t)}
          >{t}</button>
        {/each}
      </div>

      <!-- Indicator toggles -->
      <div class="ind-toggles">
        <button class="ind-btn" class:on={showVWAP} onclick={() => { showVWAP = !showVWAP; }}>VWAP</button>
        <button class="ind-btn" class:on={showBB}   onclick={() => { showBB = !showBB; }}>BB</button>
        <button class="ind-btn" class:on={showEMA}  onclick={() => { showEMA = !showEMA; }}>EMA</button>
        <button class="ind-btn" class:on={showATRBands}  onclick={() => { showATRBands = !showATRBands; }}>ATR CH</button>
        <button class="ind-btn" class:on={showCVD}  onclick={() => { showCVD = !showCVD; }}>CVD</button>
        <button class="ind-btn" class:on={showMACD}  onclick={() => { showMACD = !showMACD; }}>MACD</button>
      </div>

      <!-- Legend -->
      <div class="legend">
        <span class="ld" style="--c:#63b3ed">MA5</span>
        <span class="ld" style="--c:#fbbf24">MA20</span>
        <span class="ld" style="--c:#a78bfa">MA60</span>
        {#if showVWAP}<span class="ld" style="--c:rgba(255,200,60,0.9)">VWAP</span>{/if}
        {#if showBB}<span class="ld" style="--c:rgba(139,92,246,0.65)">BB</span>{/if}
      </div>

      <button class="save-btn" onclick={handleSaveSetup}>+ Save</button>
    </div>
  </div>

  <!-- ── Chart area ────────────────────────────────────────────────────────── -->
  {#if loading}
    <div class="chart-state">
      <span class="pulse"></span>
      <span class="state-text">Loading {symbol} {tf}…</span>
    </div>
  {:else if error}
    <div class="chart-state error">
      <span>! {error}</span>
      <button onclick={loadData}>Retry</button>
    </div>
  {:else}
    <div class="micro-bars">
      <div class="depth-strip">
        <div class="strip-head">
          <span>Order Book Depth</span>
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
          <span>Liquidation Clusters</span>
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
    <div class="pane-main"  bind:this={mainEl}></div>
    <div class="pane-label">VOL</div>
    <div class="pane-vol"   bind:this={volEl}></div>
    {#if showMACD}
      <div class="pane-label">MACD</div>
      <div class="pane-sub"  bind:this={macdEl}></div>
    {:else}
      <div class="pane-label">RSI 14</div>
      <div class="pane-sub"  bind:this={rsiEl}></div>
    {/if}
    <div class="pane-label">OI Δ%</div>
    <div class="pane-oi"    bind:this={oiEl}></div>
      {#if showCVD}
        <div class="pane-label">CVD</div>
        <div class="pane-cvd" bind:this={cvdEl}></div>
      {/if}
  {/if}

</div>

<!-- Save Setup Modal -->
<SaveSetupModal
  symbol={symbol}
  timestamp={currentTime ?? Math.floor(Date.now() / 1000)}
  tf={tf}
  open={showSaveModal}
  getViewportCapture={getViewportForSave}
  onClose={() => { showSaveModal = false; }}
  onSaved={handleModalSaved}
/>

<!-- Toast: saved confirmation -->
{#if savedSlug}
  <div class="save-toast">
    ✓ 셋업 저장됨 — <a href="/patterns" class="toast-link">패턴 대시보드 →</a>
  </div>
{/if}

<style>
  .chart-board {
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, #0b0d12, #080a0d);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 4px;
    overflow: hidden;
    min-height: 540px;
    height: 100%;
  }

  /* ── Header ── */
  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 9px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    gap: 12px;
    flex-shrink: 0;
    flex-wrap: wrap;
    row-gap: 4px;
  }

  .chart-symbol {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
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

  /* Indicator toggles */
  .ind-toggles { display: flex; gap: 2px; }
  .ind-btn {
    padding: 2px 6px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.3);
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.1s;
  }
  .ind-btn:hover { border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.55); }
  .ind-btn.on    { background: rgba(99,179,237,0.12); color: #63b3ed; border-color: rgba(99,179,237,0.35); }

  /* Legend */
  .legend { display: flex; gap: 8px; align-items: center; }
  .ld {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(255,255,255,0.25);
    padding-left: 10px;
    position: relative;
  }
  .ld::before {
    content: '';
    position: absolute;
    left: 0; top: 50%;
    transform: translateY(-50%);
    width: 7px; height: 2px;
    background: var(--c);
    border-radius: 1px;
  }

  .save-btn {
    padding: 2px 8px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 600;
    background: rgba(38,166,154,0.1);
    border: 1px solid rgba(38,166,154,0.3);
    color: #26a69a;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.1s;
  }
  .save-btn:hover { background: rgba(38,166,154,0.2); border-color: rgba(38,166,154,0.5); }

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

  /* ── Panes ── */
  .pane-main { flex-shrink: 0; height: 320px; }
  .pane-vol  { flex-shrink: 0; height: 54px; }
  .pane-sub  { flex-shrink: 0; height: 72px; }
  .pane-oi   { flex-shrink: 0; height: 54px; }
  .pane-cvd  { flex-shrink: 0; height: 70px; }
  .save-toast {
    position: fixed;
    bottom: 80px;
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

  @media (max-width: 1100px) {
    .legend { display: none; }
  }
  .toast-link { color: #63b3ed; text-decoration: underline; }
  @keyframes toast-in { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

  .pane-label {
    flex-shrink: 0;
    padding: 1px 7px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    color: rgba(255,255,255,0.18);
    background: #0a0a0a;
    border-top: 1px solid rgba(255,255,255,0.04);
    letter-spacing: 0.06em;
  }

  .micro-bars {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 4px 7px 5px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    background: rgba(255,255,255,0.01);
  }
  .depth-strip,
  .liq-strip {
    display: grid;
    gap: 3px;
    padding: 4px 6px;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 3px;
    background: rgba(0,0,0,0.22);
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
    height: 16px;
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
    height: 13px;
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
</style>
