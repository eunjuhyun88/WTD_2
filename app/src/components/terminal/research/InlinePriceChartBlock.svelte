<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { InlinePriceChartBlock } from '$lib/contracts';

  let {
    block,
    presentation = 'inline',
  }: {
    block: InlinePriceChartBlock;
    presentation?: 'inline' | 'focus';
  } = $props();

  let chartContainer: HTMLDivElement | undefined = $state();
  let chart: any = $state(null);
  let candleSeries: any = $state(null);
  let volumeSeries: any = $state(null);
  let lwc: any = null;
  let resizeObserver: ResizeObserver | null = null;
  let activePriceLines: any[] = [];

  onMount(async () => {
    lwc = await import('lightweight-charts');
    initChart();
  });

  onDestroy(() => {
    if (resizeObserver) resizeObserver.disconnect();
    if (chart) chart.remove();
    chart = null;
  });

  function initChart() {
    if (!chartContainer || !lwc) return;
    chart = lwc.createChart(chartContainer, {
      width: chartContainer.clientWidth,
      height: presentation === 'focus' ? 320 : 210,
      layout: {
        background: { color: 'transparent' },
        textColor: 'rgba(247, 242, 234, 0.52)',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: presentation === 'focus' ? 11 : 10,
      },
      grid: {
        vertLines: { color: 'rgba(219, 154, 159, 0.05)' },
        horzLines: { color: 'rgba(219, 154, 159, 0.05)' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: 'rgba(219, 154, 159, 0.2)', width: 1, style: 2 },
        horzLine: { color: 'rgba(219, 154, 159, 0.2)', width: 1, style: 2 },
      },
      timeScale: {
        borderColor: 'rgba(219, 154, 159, 0.12)',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(219, 154, 159, 0.12)',
        scaleMargins: { top: 0.08, bottom: 0.2 },
      },
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

    resizeObserver = new ResizeObserver(() => {
      if (chart && chartContainer) {
        chart.applyOptions({
          width: chartContainer.clientWidth,
          height: presentation === 'focus' ? 320 : 210,
        });
      }
    });
    resizeObserver.observe(chartContainer);
    syncData();
  }

  function clearPriceLines() {
    if (!candleSeries || activePriceLines.length === 0) return;
    for (const line of activePriceLines) {
      try { candleSeries.removePriceLine(line); } catch { /* ignore */ }
    }
    activePriceLines = [];
  }

  function syncData() {
    if (!candleSeries || !volumeSeries) return;
    const series = block.series ?? [];
    candleSeries.setData(series.map((point) => ({
      time: point.t as any,
      open: point.o,
      high: point.h,
      low: point.l,
      close: point.c,
    })));
    volumeSeries.setData(series.map((point) => ({
      time: point.t as any,
      value: point.v ?? 0,
      color: point.c >= point.o ? 'rgba(173, 202, 124, 0.25)' : 'rgba(207, 127, 143, 0.25)',
    })));

    clearPriceLines();
    for (const level of block.overlays?.srLevels ?? []) {
      activePriceLines.push(candleSeries.createPriceLine({
        price: level.price,
        color: level.label === 'S' ? 'rgba(173, 202, 124, 0.38)' : 'rgba(207, 127, 143, 0.38)',
        lineWidth: level.strength && level.strength >= 4 ? 2 : 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: level.label,
      }));
    }

    if (typeof candleSeries.setMarkers === 'function') {
      candleSeries.setMarkers((block.markers ?? []).map((marker) => ({
        time: marker.ts as any,
        position: marker.direction === 'bull' ? 'belowBar' : 'aboveBar',
        color: marker.direction === 'bull' ? '#adca7c' : marker.direction === 'bear' ? '#cf7f8f' : '#f2d193',
        shape: marker.direction === 'bull' ? 'arrowUp' : marker.direction === 'bear' ? 'arrowDown' : 'circle',
        text: marker.label,
      })));
    }

    chart?.timeScale().fitContent();
  }

  $effect(() => {
    block;
    presentation;
    if (chart) syncData();
  });

  function compareLabel(window: typeof block.compareWindows[number]): string {
    if (window.deltaPct == null) return `${window.key} --`;
    const sign = window.deltaPct > 0 ? '+' : '';
    return `${window.key} ${sign}${window.deltaPct.toFixed(2)}%`;
  }
</script>

<div class:focus={presentation === 'focus'} class="inline-price-chart">
  <div class="ipc-chart" bind:this={chartContainer}></div>
  {#if block.compareWindows.length > 0}
    <div class="ipc-compare">
      {#each block.compareWindows as window}
        <span class:up={(window.deltaPct ?? 0) > 0} class:down={(window.deltaPct ?? 0) < 0} class="ipc-chip">
          {compareLabel(window)}
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .inline-price-chart {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ipc-chart {
    width: 100%;
    min-height: 210px;
  }
  .inline-price-chart.focus .ipc-chart {
    min-height: 320px;
  }
  .ipc-compare {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .ipc-chip {
    border-radius: 999px;
    border: 1px solid rgba(219, 154, 159, 0.16);
    padding: 4px 7px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
    font-size: 10px;
    color: var(--sc-text-3, rgba(247, 242, 234, 0.52));
    background: rgba(247, 242, 234, 0.03);
  }
  .ipc-chip.up {
    color: var(--sc-good, #adca7c);
    border-color: rgba(173, 202, 124, 0.3);
  }
  .ipc-chip.down {
    color: var(--sc-bad, #cf7f8f);
    border-color: rgba(207, 127, 143, 0.3);
  }
</style>
