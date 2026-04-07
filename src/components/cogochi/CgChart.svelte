<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type ChartKline = { t: number; o: number; h: number; l: number; c: number; v: number };

  let {
    data = [],
    currentPrice = 0,
    visible = true,
  }: {
    data: ChartKline[];
    currentPrice?: number;
    visible?: boolean;
  } = $props();

  let container: HTMLDivElement;
  let chart: any;
  let candleSeries: any;
  let volumeSeries: any;
  let ro: ResizeObserver | null = null;

  // Update data reactively
  $effect(() => {
    if (candleSeries && data.length > 0) {
      const candles = data.map(k => ({ time: k.t, open: k.o, high: k.h, low: k.l, close: k.c }));
      const volumes = data.map(k => ({
        time: k.t,
        value: k.v,
        color: k.c >= k.o ? 'rgba(173,202,124,0.2)' : 'rgba(207,127,143,0.2)',
      }));
      candleSeries.setData(candles);
      volumeSeries.setData(volumes);
      chart.timeScale().fitContent();
    }
  });

  // Handle visibility changes — resize chart when becoming visible
  $effect(() => {
    if (visible && chart && container) {
      // Multiple attempts to catch CSS layout settling
      const tryResize = () => {
        if (chart && container && container.clientWidth > 0 && container.clientHeight > 0) {
          chart.applyOptions({
            width: container.clientWidth,
            height: container.clientHeight,
          });
          chart.timeScale().fitContent();
        }
      };
      // Try immediately, then at 50ms, 150ms, 300ms
      tryResize();
      setTimeout(tryResize, 50);
      setTimeout(tryResize, 150);
      setTimeout(tryResize, 300);
    }
  });

  onMount(async () => {
    const lwc = await import('lightweight-charts');

    chart = lwc.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: 'transparent' },
        textColor: '#383860',
        fontSize: 9,
        fontFamily: 'IBM Plex Mono, monospace',
      },
      grid: {
        vertLines: { color: '#0e0e1a' },
        horzLines: { color: '#0e0e1a' },
      },
      crosshair: {
        mode: lwc.CrosshairMode.Normal,
        vertLine: { color: 'rgba(219,154,159,0.15)', width: 1, style: lwc.LineStyle.Dashed },
        horzLine: { color: 'rgba(219,154,159,0.15)', width: 1, style: lwc.LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: '#16162a',
        scaleMargins: { top: 0.05, bottom: 0.18 },
      },
      timeScale: {
        borderColor: '#16162a',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    candleSeries = chart.addCandlestickSeries({
      upColor: '#adca7c',
      downColor: '#cf7f8f',
      borderUpColor: '#adca7c',
      borderDownColor: '#cf7f8f',
      wickUpColor: 'rgba(173,202,124,0.5)',
      wickDownColor: 'rgba(207,127,143,0.5)',
    });

    volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    // Resize observer — always watches, even when hidden
    ro = new ResizeObserver(() => {
      if (chart && container && container.clientWidth > 0) {
        chart.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    });
    ro.observe(container);
  });

  onDestroy(() => {
    ro?.disconnect();
    if (chart) { chart.remove(); chart = null; }
  });
</script>

<div class="cg-chart" bind:this={container}></div>

<style>
  .cg-chart {
    width: 100%;
    height: 100%;
    min-height: 160px;
  }
</style>
