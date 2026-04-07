<script lang="ts">
  // ═══════════════════════════════════════════════════════════
  // Cogochi Chart — LightweightCharts candlestick + volume
  // ═══════════════════════════════════════════════════════════
  import { onMount, onDestroy } from 'svelte';

  type ChartKline = { t: number; o: number; h: number; l: number; c: number; v: number };

  let { data = [], currentPrice = 0 }: { data: ChartKline[]; currentPrice?: number } = $props();

  let container: HTMLDivElement;
  let chart: any;
  let candleSeries: any;
  let volumeSeries: any;

  $effect(() => {
    if (candleSeries && data.length > 0) {
      const candles = data.map(k => ({ time: k.t, open: k.o, high: k.h, low: k.l, close: k.c }));
      const volumes = data.map(k => ({
        time: k.t,
        value: k.v,
        color: k.c >= k.o ? 'rgba(34,211,238,0.25)' : 'rgba(244,63,94,0.25)',
      }));
      candleSeries.setData(candles);
      volumeSeries.setData(volumes);
      chart.timeScale().fitContent();
    }
  });

  onMount(async () => {
    const lwc = await import('lightweight-charts');

    chart = lwc.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: '#08080e' },
        textColor: '#4a5568',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: '#111820' },
        horzLines: { color: '#111820' },
      },
      crosshair: {
        mode: lwc.CrosshairMode.Normal,
        vertLine: { color: '#22d3ee40', width: 1, style: lwc.LineStyle.Dashed },
        horzLine: { color: '#22d3ee40', width: 1, style: lwc.LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: '#181828',
        scaleMargins: { top: 0.05, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#181828',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    candleSeries = chart.addCandlestickSeries({
      upColor: '#22d3ee',
      downColor: '#f43f5e',
      borderUpColor: '#22d3ee',
      borderDownColor: '#f43f5e',
      wickUpColor: '#22d3ee80',
      wickDownColor: '#f43f5e80',
    });

    volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (chart && container) {
        chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
      }
    });
    ro.observe(container);
    _roCleanup = () => ro.disconnect();
  });

  let _roCleanup: (() => void) | null = null;

  onDestroy(() => {
    _roCleanup?.();
    if (chart) { chart.remove(); chart = null; }
  });
</script>

<div class="cg-chart" bind:this={container}></div>

<style>
  .cg-chart {
    width: 100%;
    height: 100%;
    min-height: 200px;
  }
</style>
