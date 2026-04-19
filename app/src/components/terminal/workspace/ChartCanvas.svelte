<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
  import type { UTCTimestamp, IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import { tfMinutes } from '$lib/chart/mtfAlign';

  interface Props {
    symbol: string;
    tf: string;
    data: ChartSeriesPayload | null;
    chartMode?: 'candle' | 'line';
    showVolumePane?: boolean;
    onChartReady?: (chart: IChartApi) => void;
  }

  let {
    symbol,
    tf,
    data = null,
    chartMode = 'candle',
    showVolumePane = true,
    onChartReady
  }: Props = $props();

  // ── DOM & LWC refs ────────────────────────────────────────────────
  let containerEl = $state<HTMLDivElement | undefined>(undefined);
  let chart = $state<IChartApi | null>(null);
  let candleSeriesRef = $state<ISeriesApi<'Candlestick'> | null>(null);
  let volumeSeriesRef = $state<ISeriesApi<'Histogram'> | null>(null);

  // ── Track first render to avoid re-fitting on updates ────────────
  let initialized = false;

  // ── Constants (match ChartBoard theme) ────────────────────────────
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

  // ── Initialize & destroy chart ────────────────────────────────────
  function createAndRender(payload: ChartSeriesPayload) {
    if (!containerEl) return;

    // Clean up old chart if exists
    if (chart) {
      chart.remove();
      chart = null;
      candleSeriesRef = null;
      volumeSeriesRef = null;
    }

    const w = containerEl.offsetWidth || 900;
    const h = containerEl.offsetHeight || 400;

    // Create chart
    chart = createChart(containerEl, {
      ...baseTheme,
      width: w,
      height: h,
      rightPriceScale: {
        ...baseTheme.rightPriceScale,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
    });

    if (!chart) return;

    // ── Add candlestick series ────────────────────────────────────
    candleSeriesRef = chart.addSeries(CandlestickSeries, {
      upColor: '#00C853',
      downColor: '#FF3B30',
      borderVisible: false,
      wickUpColor: '#00C853',
      wickDownColor: '#FF3B30',
    });

    // Convert klines to LWC format (timestamp unit: seconds)
    const candleData = (payload.klines || []).map((k: any) => ({
      time: k.time as UTCTimestamp,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
    }));

    if (candleData.length > 0) {
      candleSeriesRef.setData(candleData);
    }

    // ── Add volume series (if enabled) ────────────────────────────
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

      if (volumeData.length > 0) {
        volumeSeriesRef.setData(volumeData);
      }
    }

    // ── Fit all data into view (only on first load) ────────────────
    if (!initialized) {
      chart.timeScale().fitContent();
      chart.timeScale().scrollToPosition(1, false); // Scroll to realtime
      initialized = true;
    }

    // Notify parent
    if (onChartReady) {
      onChartReady(chart);
    }
  }

  // ── Effect: Initialize on mount ───────────────────────────────────
  $effect(() => {
    if (!containerEl) return;

    // Create chart immediately if no data yet
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
      if (chart) {
        chart.remove();
        chart = null;
        candleSeriesRef = null;
        volumeSeriesRef = null;
        initialized = false;
      }
    };
  });

  // ── Effect: Update data when payload changes ──────────────────────
  $effect(() => {
    if (!data) return;
    if (!containerEl) return;

    // Create and render if not yet initialized
    if (!initialized || !chart) {
      createAndRender(data);
      return;
    }

    // Update existing series
    const candleData = (data.klines || []).map((k: any) => ({
      time: k.time as UTCTimestamp,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
    }));

    if (candleData.length > 0 && candleSeriesRef) {
      candleSeriesRef.setData(candleData);
    }

    // Update volume if shown
    if (showVolumePane && volumeSeriesRef) {
      const volumeData = (data.klines || []).map((k: any) => ({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: k.close >= k.open ? 'rgba(0, 200, 83, 0.3)' : 'rgba(255, 59, 48, 0.3)',
      }));

      if (volumeData.length > 0) {
        volumeSeriesRef.setData(volumeData);
      }
    }

    // Scroll to realtime (last bar) without resetting viewport
    if (chart) {
      chart.timeScale().scrollToPosition(1, false);
    }
  });

  // ── Handle window resize ──────────────────────────────────────────
  $effect(() => {
    if (!chart || !containerEl) return;

    const handleResize = () => {
      const w = containerEl?.offsetWidth || 900;
      const h = containerEl?.offsetHeight || 400;
      chart?.applyOptions({ width: w, height: h });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  });

  // ── Public API ────────────────────────────────────────────────────
  export function getChart(): IChartApi | null {
    return chart;
  }

  export function getCandleSeries(): ISeriesApi<'Candlestick'> | null {
    return candleSeriesRef;
  }
</script>

<div
  class="chart-canvas"
  bind:this={containerEl}
  data-mode={chartMode}
>
  <!-- Canvas rendered by LWC -->
</div>

<style>
  .chart-canvas {
    width: 100%;
    height: 100%;
    background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
  }

  :global(.tv-lightweight-charts) {
    font-family: var(--sc-font-mono, monospace) !important;
  }
</style>
