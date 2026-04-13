<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
  import type { UTCTimestamp } from 'lightweight-charts';

  interface Props {
    symbol: string;
    tf?: string;
    onSaveSetup?: (snap: { symbol: string; timestamp: number; tf: string }) => void;
  }

  let { symbol, tf = $bindable('1h'), onSaveSetup }: Props = $props();

  // DOM refs — $state() required for Svelte 5 bind: to trigger reactivity
  let mainEl = $state<HTMLDivElement | undefined>(undefined);
  let volEl = $state<HTMLDivElement | undefined>(undefined);
  let rsiEl = $state<HTMLDivElement | undefined>(undefined);
  let oiEl = $state<HTMLDivElement | undefined>(undefined);
  let containerEl = $state<HTMLDivElement | undefined>(undefined);

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let currentPrice = $state<number | null>(null);
  let currentTime = $state<number | null>(null);

  // Chart instances — typed as any to avoid heavyweight lw-charts type imports
  let mainChart: ReturnType<typeof createChart> | null = null;
  let volChart: ReturnType<typeof createChart> | null = null;
  let rsiChart: ReturnType<typeof createChart> | null = null;
  let oiChart: ReturnType<typeof createChart> | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const TIMEFRAMES = ['15m', '1h', '4h', '1d'];

  const darkTheme = {
    layout: {
      background: { color: '#000000' },
      textColor: 'rgba(255,255,255,0.5)',
      fontSize: 10,
      fontFamily: 'var(--sc-font-mono, monospace)',
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.04)' },
      horzLines: { color: 'rgba(255,255,255,0.04)' },
    },
    crosshair: {
      vertLine: { color: 'rgba(255,255,255,0.2)', width: 1 as const, style: 3 },
      horzLine: { color: 'rgba(255,255,255,0.2)', width: 1 as const, style: 3 },
    },
    timeScale: {
      borderColor: 'rgba(255,255,255,0.07)',
      timeVisible: true,
      secondsVisible: false,
    },
    rightPriceScale: {
      borderColor: 'rgba(255,255,255,0.07)',
    },
  };

  async function loadData() {
    if (!symbol) return;
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/chart/klines?symbol=${symbol}&tf=${tf}&limit=300`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      loading = false;       // show chart divs first
      await tick();          // wait for DOM update
      renderCharts(data);
    } catch (e) {
      error = String(e);
      loading = false;
    }
  }

  function renderCharts(data: Record<string, unknown>) {
    if (!mainEl || !volEl || !rsiEl || !oiEl) return;
    destroyCharts();

    const w = containerEl?.offsetWidth ?? 800;

    // ── Main chart ──
    mainChart = createChart(mainEl, {
      ...darkTheme,
      width: w,
      height: 300,
      rightPriceScale: { ...darkTheme.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } },
    });

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#4ade80',
      downColor: '#f87171',
      borderUpColor: '#4ade80',
      borderDownColor: '#f87171',
      wickUpColor: 'rgba(74,222,128,0.6)',
      wickDownColor: 'rgba(248,113,113,0.6)',
    });
    candleSeries.setData(data.klines as Parameters<typeof candleSeries.setData>[0]);

    // lightweight-charts Time = UTCTimestamp | BusinessDay | string; cast number → UTCTimestamp
  type LinePoint = { time: UTCTimestamp; value: number };
  type HistoPoint = { time: UTCTimestamp; value: number; color?: string };

  function toLineData(arr: Array<{ time: number; value: number }>): LinePoint[] {
    return arr.map(p => ({ time: p.time as UTCTimestamp, value: p.value }));
  }
  function toHistoData(arr: Array<{ time: number; value: number; color?: string }>): HistoPoint[] {
    return arr.map(p => ({ time: p.time as UTCTimestamp, value: p.value, color: p.color }));
  }

  const indicators = data.indicators as Record<string, Array<{ time: number; value: number }>>;

    if (indicators.sma5?.length) {
      const s = mainChart.addSeries(LineSeries, {
        color: 'rgba(99,179,237,0.8)',
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      s.setData(toLineData(indicators.sma5));
    }
    if (indicators.sma20?.length) {
      const s = mainChart.addSeries(LineSeries, {
        color: 'rgba(251,191,36,0.8)',
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      s.setData(toLineData(indicators.sma20));
    }
    if (indicators.sma60?.length) {
      const s = mainChart.addSeries(LineSeries, {
        color: 'rgba(167,139,250,0.8)',
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      s.setData(toLineData(indicators.sma60));
    }

    mainChart.subscribeCrosshairMove((param) => {
      if (param.time) {
        currentTime = param.time as number;
        const price = param.seriesData.get(candleSeries) as { close: number } | undefined;
        if (price) currentPrice = price.close;
      }
    });

    // ── Volume chart ──
    volChart = createChart(volEl!, {
      ...darkTheme,
      width: w,
      height: 70,
      timeScale: { ...darkTheme.timeScale, visible: false },
    });
    const volSeries = volChart.addSeries(HistogramSeries, {
      color: 'rgba(99,179,237,0.4)',
      priceFormat: { type: 'volume' as const },
    });
    const klines = data.klines as Array<{ time: number; open: number; close: number; volume: number }>;
    volSeries.setData(
      toHistoData(klines.map(k => ({
        time: k.time,
        value: k.volume,
        color: k.close >= k.open ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)',
      })))
    );

    // ── RSI chart ──
    rsiChart = createChart(rsiEl!, {
      ...darkTheme,
      width: w,
      height: 70,
      timeScale: { ...darkTheme.timeScale, visible: false },
      rightPriceScale: { ...darkTheme.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } },
    });
    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: 'rgba(251,191,36,0.8)',
      lineWidth: 1,
      lastValueVisible: true,
      priceLineVisible: false,
    });
    rsiSeries.setData(toLineData(indicators.rsi14 ?? []));
    rsiSeries.createPriceLine({ price: 70, color: 'rgba(248,113,113,0.4)', lineWidth: 1, lineStyle: 2, title: 'OB' });
    rsiSeries.createPriceLine({ price: 30, color: 'rgba(74,222,128,0.4)', lineWidth: 1, lineStyle: 2, title: 'OS' });

    // ── OI chart ──
    oiChart = createChart(oiEl!, {
      ...darkTheme,
      width: w,
      height: 70,
      timeScale: { ...darkTheme.timeScale, visible: true },
    });
    const oiBars = data.oiBars as Array<{ time: number; value: number; color: string }>;
    if (oiBars?.length) {
      const oiSeries = oiChart.addSeries(HistogramSeries, { color: 'rgba(99,179,237,0.6)' });
      oiSeries.setData(toHistoData(oiBars));
    }

    syncTimeScales();
  }

  function syncTimeScales() {
    if (!mainChart) return;
    const subCharts = [volChart, rsiChart, oiChart].filter(
      (c): c is ReturnType<typeof createChart> => c !== null
    );

    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      subCharts.forEach(c => c.timeScale().setVisibleLogicalRange(range));
    });

    subCharts.forEach(c => {
      c.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (!range) return;
        mainChart!.timeScale().setVisibleLogicalRange(range);
        subCharts.filter(other => other !== c).forEach(other =>
          other.timeScale().setVisibleLogicalRange(range)
        );
      });
    });
  }

  function destroyCharts() {
    [mainChart, volChart, rsiChart, oiChart].forEach(c => c?.remove());
    mainChart = volChart = rsiChart = oiChart = null;
  }

  function handleSaveSetup() {
    onSaveSetup?.({
      symbol,
      timestamp: currentTime ?? Math.floor(Date.now() / 1000),
      tf,
    });
  }

  function handleResize() {
    if (!containerEl) return;
    const w = containerEl.offsetWidth;
    if (mainChart) mainChart.resize(w, 300);
    if (volChart) volChart.resize(w, 70);
    if (rsiChart) rsiChart.resize(w, 70);
    if (oiChart) oiChart.resize(w, 70);
  }

  onMount(() => {
    resizeObserver = new ResizeObserver(handleResize);
    if (containerEl) resizeObserver.observe(containerEl);
  });

  onDestroy(() => {
    destroyCharts();
    resizeObserver?.disconnect();
  });

  // Reactive reload on symbol/tf change (also fires after mount when DOM is ready)
  $effect(() => {
    void symbol;
    void tf;
    loadData();
  });
</script>

<div class="chart-board" bind:this={containerEl}>
  <!-- Header -->
  <div class="chart-header">
    <div class="chart-symbol">
      <span class="sym-name">{symbol.replace('USDT', '')}<span class="sym-quote">/USDT</span></span>
      {#if currentPrice !== null}
        <span class="sym-price">{currentPrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
      {/if}
    </div>

    <div class="chart-controls">
      <div class="tf-group">
        {#each TIMEFRAMES as t}
          <button
            class="tf-btn {tf === t ? 'active' : ''}"
            onclick={() => { tf = t; }}
          >{t}</button>
        {/each}
      </div>

      <div class="sma-legend">
        <span class="sma-dot" style="--dot-color:#63b3ed">MA5</span>
        <span class="sma-dot" style="--dot-color:#fbbf24">MA20</span>
        <span class="sma-dot" style="--dot-color:#a78bfa">MA60</span>
      </div>

      <button class="save-btn" onclick={handleSaveSetup}>
        + Save Setup
      </button>
    </div>
  </div>

  <!-- Chart area -->
  {#if loading}
    <div class="chart-loading">
      <span class="loading-dot"></span>
      <span class="loading-text">Loading {symbol} {tf}…</span>
    </div>
  {:else if error}
    <div class="chart-error">
      <span>! {error}</span>
      <button onclick={loadData}>Retry</button>
    </div>
  {:else}
    <div class="chart-main" bind:this={mainEl}></div>
    <div class="chart-label">VOL</div>
    <div class="chart-sub" bind:this={volEl}></div>
    <div class="chart-label">RSI</div>
    <div class="chart-sub" bind:this={rsiEl}></div>
    <div class="chart-label">OI Δ%</div>
    <div class="chart-sub chart-sub-last" bind:this={oiEl}></div>
  {/if}
</div>

<style>
  .chart-board {
    display: flex;
    flex-direction: column;
    background: var(--sc-terminal-bg, #000);
    border: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
    border-radius: 6px;
    overflow: hidden;
    height: 100%;
    min-height: 500px;
  }

  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
    gap: 12px;
    flex-shrink: 0;
  }

  .chart-symbol {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .sym-name {
    font-family: var(--sc-font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: var(--sc-text-0, #fff);
  }

  .sym-quote {
    font-weight: 400;
    color: var(--sc-text-2, rgba(255,255,255,0.4));
    font-size: 11px;
  }

  .sym-price {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    color: var(--sc-text-1, rgba(255,255,255,0.7));
  }

  .chart-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tf-group {
    display: flex;
    gap: 2px;
  }

  .tf-btn {
    padding: 3px 8px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    background: transparent;
    border: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
    color: var(--sc-text-2, rgba(255,255,255,0.4));
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .tf-btn:hover {
    color: var(--sc-text-1, rgba(255,255,255,0.7));
    border-color: rgba(255,255,255,0.2);
  }

  .tf-btn.active {
    background: rgba(255,255,255,0.08);
    color: var(--sc-text-0, #fff);
    border-color: rgba(255,255,255,0.25);
  }

  .sma-legend {
    display: flex;
    gap: 8px;
  }

  .sma-dot {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: var(--sc-text-3, rgba(255,255,255,0.2));
    padding-left: 10px;
    position: relative;
  }

  .sma-dot::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 7px;
    height: 2px;
    background: var(--dot-color);
    border-radius: 1px;
  }

  .save-btn {
    padding: 4px 10px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 600;
    background: rgba(74,222,128,0.1);
    border: 1px solid rgba(74,222,128,0.3);
    color: #4ade80;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
  }

  .save-btn:hover {
    background: rgba(74,222,128,0.2);
    border-color: rgba(74,222,128,0.5);
  }

  .chart-loading,
  .chart-error {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--sc-text-2, rgba(255,255,255,0.4));
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    min-height: 300px;
  }

  .chart-error button {
    padding: 3px 8px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.15);
    color: var(--sc-text-2, rgba(255,255,255,0.4));
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
  }

  .loading-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--sc-text-2, rgba(255,255,255,0.4));
    animation: sc-pulse 1.4s ease-in-out infinite;
  }

  @keyframes sc-pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }

  .chart-main {
    flex-shrink: 0;
    height: 300px;
  }

  .chart-label {
    padding: 2px 10px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: var(--sc-text-3, rgba(255,255,255,0.2));
    background: var(--sc-terminal-bg, #000);
    border-top: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.04));
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }

  .chart-sub {
    flex-shrink: 0;
    height: 70px;
  }
</style>
