<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
  import type { UTCTimestamp, IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';

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
    onSaveSetup?:   (snap: { symbol: string; timestamp: number; tf: string }) => void;
    onTfChange?:    (tf: string) => void;
  }

  let { symbol, tf: externalTf, verdictLevels, onSaveSetup, onTfChange }: Props = $props();

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

  // ── UI state ───────────────────────────────────────────────────────────────
  let loading  = $state(true);
  let error    = $state<string | null>(null);
  let currentPrice = $state<number | null>(null);
  let currentTime  = $state<number | null>(null);

  // Indicator toggles
  let showVWAP = $state(true);
  let showBB   = $state(false);
  let showMACD = $state(false);   // replaces RSI pane when active

  // ── Chart instances ────────────────────────────────────────────────────────
  let mainChart: IChartApi | null = null;
  let volChart:  IChartApi | null = null;
  let rsiChart:  IChartApi | null = null;
  let macdChart: IChartApi | null = null;
  let oiChart:   IChartApi | null = null;
  let resizeObserver: ResizeObserver | null = null;

  // Level price lines
  let entryLine:  ReturnType<ISeriesApi<SeriesType>['createPriceLine']> | null = null;
  let targetLine: ReturnType<ISeriesApi<SeriesType>['createPriceLine']> | null = null;
  let stopLine:   ReturnType<ISeriesApi<SeriesType>['createPriceLine']> | null = null;
  let candleSeries: ISeriesApi<'Candlestick'> | null = null;

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
  let pendingData: Record<string, unknown> | null = null;

  async function loadData() {
    if (!symbol) return;
    loading = true;
    error = null;
    pendingData = null;
    try {
      const res = await fetch(`/api/chart/klines?symbol=${symbol}&tf=${tf}&limit=500`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      pendingData = data;
      loading = false;
      await tick();
      renderCharts(data);
    } catch (e) {
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

  function renderCharts(data: Record<string, unknown>) {
    if (!mainEl || !volEl || !rsiEl || !oiEl) return;
    destroyCharts();

    const w = containerEl?.offsetWidth ?? 900;

    // ── Main (candles + overlays) ────────────────────────────────────────────
    mainChart = createChart(mainEl, {
      ...baseTheme,
      width: w, height: 340,
      rightPriceScale: { ...baseTheme.rightPriceScale, scaleMargins: { top: 0.08, bottom: 0.08 } },
    });

    const ind = data.indicators as Record<string, Array<{ time: number; value: number }>>;
    const klines = data.klines as Array<{ time: number; open: number; close: number; high: number; low: number; volume: number }>;

    candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor:        '#26a69a',
      downColor:      '#ef5350',
      borderUpColor:  '#26a69a',
      borderDownColor:'#ef5350',
      wickUpColor:    'rgba(38,166,154,0.7)',
      wickDownColor:  'rgba(239,83,80,0.7)',
    });
    candleSeries.setData(data.klines as Parameters<typeof candleSeries.setData>[0]);

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
        const cs = candleSeries;
        if (cs) {
          const d = param.seriesData.get(cs) as { close: number } | undefined;
          if (d) currentPrice = d.close;
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
    if (showMACD && macdEl) {
      macdChart = createChart(macdEl, {
        ...baseTheme, width: w, height: 80,
        timeScale: { ...baseTheme.timeScale, visible: false },
      });
      const macdData = data.macd as Array<{ time: number; macd: number; signal: number; hist: number }>;
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
      rsiChart = createChart(rsiEl, {
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
    const oiBars = data.oiBars as Array<{ time: number; value: number; color: string }>;
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

    syncTimeScales();
  }

  // ── Verdict level lines ───────────────────────────────────────────────────
  function updateLevels() {
    if (!candleSeries) return;

    // Clear existing lines
    try { if (entryLine)  candleSeries.removePriceLine(entryLine);  } catch {}
    try { if (targetLine) candleSeries.removePriceLine(targetLine); } catch {}
    try { if (stopLine)   candleSeries.removePriceLine(stopLine);   } catch {}
    entryLine = targetLine = stopLine = null;

    if (!verdictLevels) return;

    if (verdictLevels.entry != null) {
      entryLine = candleSeries.createPriceLine({
        price: verdictLevels.entry,
        color: 'rgba(251,191,36,0.9)',
        lineWidth: 1, lineStyle: 0,
        axisLabelVisible: true, title: 'ENTRY',
      });
    }
    if (verdictLevels.target != null) {
      targetLine = candleSeries.createPriceLine({
        price: verdictLevels.target,
        color: 'rgba(38,166,154,0.9)',
        lineWidth: 1, lineStyle: 1,
        axisLabelVisible: true, title: 'TARGET',
      });
    }
    if (verdictLevels.stop != null) {
      stopLine = candleSeries.createPriceLine({
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
    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      subs.forEach(c => c.timeScale().setVisibleLogicalRange(range));
    });
    subs.forEach(c => {
      c.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (!range) return;
        mainChart!.timeScale().setVisibleLogicalRange(range);
        subs.filter(o => o !== c).forEach(o => o.timeScale().setVisibleLogicalRange(range));
      });
    });
  }

  function destroyCharts() {
    [mainChart, volChart, rsiChart, macdChart, oiChart].forEach(c => c?.remove());
    mainChart = volChart = rsiChart = macdChart = oiChart = null;
    candleSeries = null;
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
  }

  function handleSaveSetup() {
    onSaveSetup?.({ symbol, timestamp: currentTime ?? Math.floor(Date.now() / 1000), tf });
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

  // Reload on symbol/tf/toggles change
  $effect(() => {
    void symbol; void tf; void showVWAP; void showBB; void showMACD;
    loadData();
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
    </div>

    <div class="chart-controls">
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
        <button class="ind-btn" class:on={showMACD}  onclick={() => { showMACD = !showMACD; }}>MACD</button>
      </div>

      <!-- Legend -->
      <div class="legend">
        <span class="ld" style="--c:#63b3ed">MA5</span>
        <span class="ld" style="--c:#fbbf24">MA20</span>
        <span class="ld" style="--c:#a78bfa">MA60</span>
        {#if showVWAP}<span class="ld" style="--c:rgba(255,200,60,0.9)">VWAP</span>{/if}
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
  {/if}

</div>

<style>
  .chart-board {
    display: flex;
    flex-direction: column;
    background: #0a0a0a;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 4px;
    overflow: hidden;
    min-height: 580px;
    height: 100%;
  }

  /* ── Header ── */
  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
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
  }
  .sym-name {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    color: #fff;
  }
  .sym-quote {
    font-weight: 400;
    color: rgba(255,255,255,0.35);
    font-size: 10px;
  }
  .sym-price {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: rgba(255,255,255,0.65);
  }

  .chart-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* TF buttons */
  .tf-group {
    display: flex;
    gap: 1px;
  }
  .tf-btn {
    padding: 2px 6px;
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
    padding: 2px 7px;
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
    padding: 3px 9px;
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
  .pane-main { flex-shrink: 0; height: 340px; }
  .pane-vol  { flex-shrink: 0; height: 60px; }
  .pane-sub  { flex-shrink: 0; height: 80px; }
  .pane-oi   { flex-shrink: 0; height: 60px; }
  .pane-label {
    flex-shrink: 0;
    padding: 1px 8px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    color: rgba(255,255,255,0.18);
    background: #0a0a0a;
    border-top: 1px solid rgba(255,255,255,0.04);
    letter-spacing: 0.06em;
  }
</style>
