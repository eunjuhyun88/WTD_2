<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { BinanceKline } from '$lib/engine/types';
  import type { TradeRecord } from '$lib/engine/backtestEngine';

  export interface ChartMarker {
    time: number;
    position: 'aboveBar' | 'belowBar';
    color: string;
    shape: 'arrowUp' | 'arrowDown' | 'circle';
    text: string;
  }

  export interface PriceLine {
    price: number;
    color: string;
    lineWidth: number;
    lineStyle: number; // 0=solid, 1=dotted, 2=dashed
    title: string;
  }

  const {
    klines = [],
    revealedCount = 0,
    markers = [],
    priceLines = [],
    mode = 'auto',
    onTradeClick,
    selectedTradeIndex = -1,
  } = $props<{
    klines: BinanceKline[];
    revealedCount: number;
    markers: ChartMarker[];
    priceLines: PriceLine[];
    mode: 'auto' | 'manual';
    onTradeClick?: (index: number) => void;
    selectedTradeIndex?: number;
  }>();

  let chartContainer: HTMLDivElement | undefined = $state(undefined);
  let chart: any = $state(null);
  let candleSeries: any = $state(null);
  let volumeSeries: any = $state(null);
  let lwc: any = null;
  let lastRevealed = 0;
  let activePriceLines: any[] = [];
  let ro: ResizeObserver | null = null;

  onMount(async () => {
    lwc = await import('lightweight-charts');
    if (!chartContainer) return;
    initChart();
  });

  onDestroy(() => {
    if (ro) ro.disconnect();
    if (chart) { chart.remove(); chart = null; }
  });

  function initChart(): void {
    if (!chartContainer || !lwc) return;

    chart = lwc.createChart(chartContainer, {
      width: chartContainer.clientWidth,
      height: chartContainer.clientHeight,
      layout: {
        background: { type: 'solid', color: '#0a0f1a' },
        textColor: 'rgba(247, 242, 234, 0.55)',
        fontFamily: "'JetBrains Mono', 'Space Grotesk', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(219, 154, 159, 0.05)' },
        horzLines: { color: 'rgba(219, 154, 159, 0.05)' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: 'rgba(219, 154, 159, 0.25)', width: 1, style: 2, labelBackgroundColor: '#1a2035' },
        horzLine: { color: 'rgba(219, 154, 159, 0.25)', width: 1, style: 2, labelBackgroundColor: '#1a2035' },
      },
      timeScale: {
        visible: true,
        borderColor: 'rgba(219, 154, 159, 0.12)',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 8,
        minBarSpacing: 4,
      },
      rightPriceScale: {
        borderColor: 'rgba(219, 154, 159, 0.12)',
        scaleMargins: { top: 0.08, bottom: 0.15 },
        autoScale: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    candleSeries = chart.addSeries(lwc.CandlestickSeries, {
      upColor: '#adca7c',
      downColor: '#cf7f8f',
      borderUpColor: '#adca7c',
      borderDownColor: '#cf7f8f',
      wickUpColor: 'rgba(173, 202, 124, 0.6)',
      wickDownColor: 'rgba(207, 127, 143, 0.6)',
    });

    volumeSeries = chart.addSeries(lwc.HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    syncAllBars();

    ro = new ResizeObserver(() => {
      if (chart && chartContainer) {
        chart.applyOptions({ width: chartContainer.clientWidth, height: chartContainer.clientHeight });
      }
    });
    ro.observe(chartContainer);
  }

  // ─── Data sync ────────────────────────────────────────────

  function syncAllBars(): void {
    if (!candleSeries || !volumeSeries || klines.length === 0) return;

    const count = mode === 'manual' ? revealedCount : klines.length;
    const visible = klines.slice(0, count);

    candleSeries.setData(visible.map((k: BinanceKline) => ({
      time: k.time as any, open: k.open, high: k.high, low: k.low, close: k.close,
    })));

    volumeSeries.setData(visible.map((k: BinanceKline) => ({
      time: k.time as any,
      value: k.volume,
      color: k.close >= k.open ? 'rgba(173, 202, 124, 0.3)' : 'rgba(207, 127, 143, 0.3)',
    })));

    lastRevealed = count;
    updateMarkers();
    updatePriceLines();

    if (chart) chart.timeScale().fitContent();
  }

  // ─── Markers ──────────────────────────────────────────────

  function updateMarkers(): void {
    if (!candleSeries || markers.length === 0) return;
    try {
      const sorted = [...markers].sort((a, b) => a.time - b.time);
      candleSeries.setMarkers(sorted.map((m: ChartMarker) => ({
        time: m.time as any,
        position: m.position,
        color: m.color,
        shape: m.shape,
        text: m.text,
      })));
    } catch { /* ignore marker errors */ }
  }

  // ─── Price lines (SL/TP) ──────────────────────────────────

  function updatePriceLines(): void {
    if (!candleSeries) return;
    // Remove old lines
    for (const pl of activePriceLines) {
      try { candleSeries.removePriceLine(pl); } catch {}
    }
    activePriceLines = [];

    // Add new lines
    for (const pl of priceLines) {
      try {
        const line = candleSeries.createPriceLine({
          price: pl.price,
          color: pl.color,
          lineWidth: pl.lineWidth,
          lineStyle: pl.lineStyle,
          axisLabelVisible: true,
          title: pl.title,
        });
        activePriceLines.push(line);
      } catch {}
    }
  }

  // ─── Scroll to trade ─────────────────────────────────────

  export function scrollToTime(time: number): void {
    if (!chart) return;
    chart.timeScale().scrollToPosition(-5, false);
    // Find the bar and center on it
    const ts = chart.timeScale();
    ts.setVisibleRange({ from: time - 86400 * 3, to: time + 86400 * 3 });
  }

  // ─── Reactive updates ────────────────────────────────────

  // Watch klines change (new cycle loaded)
  $effect(() => {
    if (klines.length > 0 && chart && candleSeries) {
      syncAllBars();
    }
  });

  // Watch markers change
  $effect(() => {
    if (markers && candleSeries) {
      updateMarkers();
    }
  });

  // Watch price lines change
  $effect(() => {
    if (priceLines && candleSeries) {
      updatePriceLines();
    }
  });

  // Manual mode: watch revealedCount
  $effect(() => {
    if (mode !== 'manual' || !chart || !candleSeries) return;

    if (revealedCount > lastRevealed) {
      for (let i = lastRevealed; i < revealedCount && i < klines.length; i++) {
        const k = klines[i];
        candleSeries.update({ time: k.time as any, open: k.open, high: k.high, low: k.low, close: k.close });
        volumeSeries.update({
          time: k.time as any, value: k.volume,
          color: k.close >= k.open ? 'rgba(173, 202, 124, 0.3)' : 'rgba(207, 127, 143, 0.3)',
        });
      }
      lastRevealed = revealedCount;
      chart.timeScale().scrollToRealTime();
    } else if (revealedCount < lastRevealed) {
      syncAllBars();
    }
  });
</script>

<div class="lab-chart" bind:this={chartContainer}></div>

<style>
  .lab-chart {
    width: 100%;
    height: 100%;
    min-height: 300px;
    border-radius: 8px;
    overflow: hidden;
    background: #0a0f1a;
  }
</style>
