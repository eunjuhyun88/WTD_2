<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
  import type { UTCTimestamp, IChartApi, ISeriesApi } from 'lightweight-charts';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import { tfMinutes } from '$lib/chart/mtfAlign';

  interface Props {
    symbol: string;
    tf: string;
    data: ChartSeriesPayload | null;
    chartMode?: 'candle' | 'line';
    showVolumePane?: boolean;
    showOI?: boolean;
    showFunding?: boolean;
    showCVD?: boolean;
    onChartReady?: (chart: IChartApi) => void;
  }

  let {
    symbol,
    tf,
    data = null,
    chartMode = 'candle',
    showVolumePane = true,
    showOI = true,
    showFunding = true,
    showCVD = false,
    onChartReady
  }: Props = $props();

  let containerEl = $state<HTMLDivElement | undefined>(undefined);
  let chart: IChartApi | null = null;
  let candleSeriesRef: ISeriesApi<'Candlestick'> | null = null;
  let volumeSeriesRef: ISeriesApi<'Histogram'> | null = null;
  let initialized = false;

  const BG = '#131722';
  const GRID = 'rgba(42,46,57,0.9)';
  const TEXT = 'rgba(177,181,189,0.85)';
  const BORDER = 'rgba(42,46,57,1)';

  const baseTheme = {
    layout: {
      background: { color: BG },
      textColor: TEXT,
      fontSize: 10,
      fontFamily: 'var(--sc-font-mono, monospace)',
    },
    grid: {
      vertLines: { color: GRID },
      horzLines: { color: GRID },
    },
    crosshair: {
      vertLine: { color: 'rgba(255,255,255,0.2)', width: 1 as const, style: 3 },
      horzLine: { color: 'rgba(255,255,255,0.2)', width: 1 as const, style: 3 },
    },
    timeScale: { borderColor: BORDER, timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderColor: BORDER },
  };

  function createAndRender(payload: ChartSeriesPayload) {
    if (!containerEl) return;
    if (chart) {
      chart.remove();
      chart = null;
      candleSeriesRef = null;
      volumeSeriesRef = null;
    }
    const w = containerEl.offsetWidth || 900;
    const h = containerEl.offsetHeight || 400;
    chart = createChart(containerEl, {
      ...baseTheme,
      width: w,
      height: h,
      rightPriceScale: { ...baseTheme.rightPriceScale, scaleMargins: { top: 0.08, bottom: 0.08 } },
    });
    if (!chart) return;

    candleSeriesRef = chart.addSeries(CandlestickSeries, {
      upColor: '#00C853',
      downColor: '#FF3B30',
      borderVisible: false,
      wickUpColor: '#00C853',
      wickDownColor: '#FF3B30',
    });

    const candleData = (payload.klines || []).map((k: any) => ({
      time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close,
    }));
    if (candleData.length > 0) candleSeriesRef.setData(candleData);

    if (showVolumePane) {
      volumeSeriesRef = chart.addSeries(HistogramSeries, {
        color: 'rgba(100, 150, 200, 0.5)',
        title: 'Volume',
        priceFormat: { type: 'volume' },
      });
      const volumeData = (payload.klines || []).map((k: any) => ({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: k.close >= k.open ? 'rgba(0, 200, 83, 0.3)' : 'rgba(255, 59, 48, 0.3)',
      }));
      if (volumeData.length > 0) volumeSeriesRef.setData(volumeData);
    }

    if (!initialized) {
      chart.timeScale().fitContent();
      chart.timeScale().scrollToPosition(1, false);
      initialized = true;
    }
    if (onChartReady) onChartReady(chart);
  }

  $effect(() => {
    if (!containerEl) return;
    if (!chart && !data) {
      const tempChart = createChart(containerEl, {
        ...baseTheme,
        width: containerEl.offsetWidth || 900,
        height: containerEl.offsetHeight || 400,
      });
      chart = tempChart;
      initialized = true;
    }
    return () => {
      if (chart) { chart.remove(); chart = null; candleSeriesRef = null; volumeSeriesRef = null; initialized = false; }
    };
  });

  $effect(() => {
    if (!data || !containerEl) return;
    if (!initialized || !chart) { createAndRender(data); return; }
    const candleData = (data.klines || []).map((k: any) => ({
      time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close,
    }));
    if (candleData.length > 0 && candleSeriesRef) candleSeriesRef.setData(candleData);
    if (showVolumePane && volumeSeriesRef) {
      const volumeData = (data.klines || []).map((k: any) => ({
        time: k.time as UTCTimestamp, value: k.volume,
        color: k.close >= k.open ? 'rgba(0, 200, 83, 0.3)' : 'rgba(255, 59, 48, 0.3)',
      }));
      if (volumeData.length > 0) volumeSeriesRef.setData(volumeData);
    }
    if (chart) chart.timeScale().scrollToPosition(1, false);
  });

  $effect(() => {
    if (!containerEl) return;
    const handleResize = () => {
      const w = containerEl?.offsetWidth || 900;
      const h = containerEl?.offsetHeight || 400;
      if (chart) chart.applyOptions({ width: w, height: h });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  });

  // ── Indicator pane helpers ────────────────────────────────────────────
  function normBars(bars: Array<{ time: number; value: number; color: string }>, paneH: number) {
    if (!bars.length) return [];
    const absMax = Math.max(...bars.map(b => Math.abs(b.value)), 0.0001);
    return bars.map(b => ({
      ...b,
      pct: Math.min(Math.abs(b.value) / absMax, 1),
      pos: b.value >= 0,
    }));
  }

  const oiBars = $derived(data?.oiBars ?? []);
  const fundingBars = $derived(data?.fundingBars ?? []);
  const cvdBars = $derived((data as any)?.cvdBars ?? []);

  // Latest summary values
  const oiLatest = $derived(oiBars.length ? oiBars[oiBars.length - 1].value : null);
  const oiSummary = $derived(oiLatest !== null ? `${oiLatest >= 0 ? '+' : ''}${(oiLatest * 100).toFixed(1)}%` : '—');
  const fundingLatest = $derived(fundingBars.length ? fundingBars[fundingBars.length - 1].value : null);
  const fundingSummary = $derived(fundingLatest !== null ? `${fundingLatest >= 0 ? '+' : ''}${fundingLatest.toFixed(4)}` : '—');

  // Funding flip detection
  const fundingFlipped = $derived(() => {
    for (let i = 1; i < fundingBars.length; i++) {
      if (Math.sign(fundingBars[i].value) !== Math.sign(fundingBars[i - 1].value)) return i;
    }
    return -1;
  });

  // SVG path for funding line
  function fundingPath(bars: typeof fundingBars, w: number, h: number): string {
    if (!bars.length) return '';
    const vals = bars.map(b => b.value);
    const mn = Math.min(...vals);
    const mx = Math.max(...vals, 0.0001);
    const range = mx - mn || 0.001;
    const step = w / (bars.length - 1 || 1);
    return bars.map((b, i) => {
      const x = i * step;
      const y = h - ((b.value - mn) / range) * (h - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  export function getChart(): IChartApi | null { return chart; }
  export function getCandleSeries(): ISeriesApi<'Candlestick'> | null { return candleSeriesRef; }
</script>

<div class="chart-root">
  <!-- Main candlestick chart -->
  <div class="candle-pane" bind:this={containerEl} data-mode={chartMode}></div>

  <!-- OI Δ pane -->
  {#if showOI && oiBars.length > 0}
    {@const normed = normBars(oiBars, 48)}
    <div class="ind-pane" style="--ph:64px">
      <div class="ind-label">OI Δ <span class="ind-val {oiLatest !== null && oiLatest >= 0 ? 'pos' : 'neg'}">{oiSummary}</span></div>
      <div class="ind-bars-center">
        <div class="zero-line"></div>
        {#each normed as bar}
          <div class="oi-col">
            {#if bar.pos}
              <div class="oi-half-top"></div>
              <div class="oi-bar-half" style:background={bar.color} style:height="{bar.pct * 100}%"></div>
            {:else}
              <div class="oi-bar-half neg" style:background={bar.color} style:height="{bar.pct * 100}%"></div>
              <div class="oi-half-top"></div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Funding pane -->
  {#if showFunding && fundingBars.length > 0}
    <div class="ind-pane" style="--ph:44px">
      <div class="ind-label">
        FUNDING
        <span class="ind-val {fundingLatest !== null && fundingLatest >= 0 ? 'pos' : 'neg'}">{fundingSummary}</span>
        {#if fundingFlipped() >= 0}<span class="flip-badge">flip</span>{/if}
      </div>
      <svg class="ind-svg" viewBox="0 0 400 28" preserveAspectRatio="none">
        <line x1="0" y1="14" x2="400" y2="14" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"/>
        <path d={fundingPath(fundingBars, 400, 28)} fill="none" stroke="#e8b84b" stroke-width="1.2"/>
      </svg>
    </div>
  {/if}

  <!-- CVD pane -->
  {#if showCVD}
    <div class="ind-pane" style="--ph:44px">
      <div class="ind-label">CVD 15m <span class="ind-val pos">양전환</span></div>
      <svg class="ind-svg" viewBox="0 0 400 28" preserveAspectRatio="none">
        <path d="M0,20 L40,22 L80,24 L120,20 L160,18 L200,16 L240,14 L280,10 L320,7 L360,5 L400,3"
              fill="rgba(52,196,112,0.15)" stroke="#34c470" stroke-width="1.2"/>
      </svg>
    </div>
  {/if}
</div>

<style>
  .chart-root {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #131722;
    overflow: hidden;
  }
  .candle-pane {
    flex: 1;
    min-height: 0;
  }
  .ind-pane {
    height: var(--ph, 60px);
    flex-shrink: 0;
    border-top: 0.5px solid rgba(42,46,57,1);
    display: flex;
    flex-direction: column;
    padding: 0 12px 4px;
    gap: 2px;
  }
  .ind-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: rgba(177,181,189,0.6);
    letter-spacing: 0.08em;
    padding-top: 3px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ind-val { font-size: 8px; font-weight: 600; }
  .ind-val.pos { color: #34c470; }
  .ind-val.neg { color: #ff3b30; }
  .flip-badge {
    font-size: 7px;
    background: rgba(232,184,75,0.15);
    color: #e8b84b;
    border: 0.5px solid rgba(232,184,75,0.3);
    border-radius: 2px;
    padding: 0 3px;
    letter-spacing: 0;
  }
  .ind-bars-center {
    flex: 1;
    position: relative;
    display: flex;
    align-items: stretch;
    gap: 1px;
    overflow: hidden;
  }
  .zero-line {
    position: absolute;
    left: 0; right: 0;
    top: 50%;
    height: 0.5px;
    background: rgba(255,255,255,0.15);
    z-index: 1;
    pointer-events: none;
  }
  .oi-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 1px;
  }
  .oi-half-top { flex: 1; }
  .oi-bar-half {
    flex: 0 0 auto;
    min-width: 1px;
    opacity: 0.85;
  }
  .oi-bar-half:not(.neg) { border-radius: 1px 1px 0 0; }
  .oi-bar-half.neg { border-radius: 0 0 1px 1px; }
  .ind-svg {
    flex: 1;
    width: 100%;
    overflow: visible;
  }

  :global(.tv-lightweight-charts) {
    font-family: var(--sc-font-mono, monospace) !important;
  }
</style>
