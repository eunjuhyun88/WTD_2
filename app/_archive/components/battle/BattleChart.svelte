<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Candle } from '$lib/stores/battleStore';

  let {
    candles = [] as Candle[],
    revealedCount = 0,
  }: {
    candles: Candle[];
    revealedCount: number;
  } = $props();

  let chartContainer: HTMLDivElement | undefined = $state(undefined);
  let chart: any = $state(null);
  let candleSeries: any = $state(null);
  let volumeSeries: any = $state(null);
  let lwcModule: any = null;
  let lastRevealed = 0;

  onMount(async () => {
    lwcModule = await import('lightweight-charts');
    if (!chartContainer) return;
    initChart();
  });

  onDestroy(() => {
    if (chart) {
      chart.remove();
      chart = null;
    }
  });

  function initChart(): void {
    if (!chartContainer || !lwcModule) return;

    chart = lwcModule.createChart(chartContainer, {
      width: chartContainer.clientWidth,
      height: chartContainer.clientHeight,
      layout: {
        background: { type: 'solid', color: '#0b1220' },
        textColor: 'rgba(247, 242, 234, 0.68)',
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(219, 154, 159, 0.08)' },
        horzLines: { color: 'rgba(219, 154, 159, 0.08)' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: 'rgba(219, 154, 159, 0.3)', width: 1, style: 2 },
        horzLine: { color: 'rgba(219, 154, 159, 0.3)', width: 1, style: 2 },
      },
      timeScale: {
        visible: true,
        borderColor: 'rgba(219, 154, 159, 0.16)',
        timeVisible: false,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(219, 154, 159, 0.16)',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      handleScroll: { vertTouchDrag: false },
    });

    candleSeries = chart.addSeries(lwcModule.CandlestickSeries, {
      upColor: '#adca7c',
      downColor: '#cf7f8f',
      borderUpColor: '#adca7c',
      borderDownColor: '#cf7f8f',
      wickUpColor: '#adca7c',
      wickDownColor: '#cf7f8f',
    });

    volumeSeries = chart.addSeries(lwcModule.HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // Set initial data if already revealed
    if (revealedCount > 0) {
      syncAllBars();
    }

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (chart && chartContainer) {
        chart.applyOptions({
          width: chartContainer.clientWidth,
          height: chartContainer.clientHeight,
        });
      }
    });
    ro.observe(chartContainer);
  }

  function syncAllBars(): void {
    if (!candleSeries || !volumeSeries) return;
    const revealed = candles.slice(0, revealedCount);

    const candleData = revealed.map(c => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volData = revealed.map(c => ({
      time: c.time as any,
      value: c.volume,
      color: c.close >= c.open
        ? 'rgba(173, 202, 124, 0.4)'
        : 'rgba(207, 127, 143, 0.4)',
    }));

    candleSeries.setData(candleData);
    volumeSeries.setData(volData);
    lastRevealed = revealedCount;

    if (chart) chart.timeScale().fitContent();
  }

  function addSingleBar(c: Candle): void {
    if (!candleSeries || !volumeSeries) return;

    candleSeries.update({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    });

    volumeSeries.update({
      time: c.time as any,
      value: c.volume,
      color: c.close >= c.open
        ? 'rgba(173, 202, 124, 0.4)'
        : 'rgba(207, 127, 143, 0.4)',
    });
  }

  // Watch for revealedCount changes
  $effect(() => {
    if (!chart || !candleSeries) return;

    if (revealedCount === 0 && lastRevealed > 0) {
      // Reset
      candleSeries.setData([]);
      volumeSeries.setData([]);
      lastRevealed = 0;
      return;
    }

    if (revealedCount > lastRevealed) {
      // Add new bars incrementally
      for (let i = lastRevealed; i < revealedCount; i++) {
        const c = candles[i];
        if (c) addSingleBar(c);
      }
      lastRevealed = revealedCount;

      // Auto-scroll to latest
      if (chart) chart.timeScale().scrollToRealTime();
    } else if (revealedCount < lastRevealed) {
      // Full reset (new battle)
      syncAllBars();
    }
  });
</script>

<div class="battle-chart" bind:this={chartContainer}></div>

<style>
  .battle-chart {
    width: 100%;
    height: 100%;
    min-height: 200px;
    border-radius: var(--sc-radius-md, 6px);
    overflow: hidden;
  }
</style>
