<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createChart, LineSeries } from 'lightweight-charts';
  import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
  import type { EquitySeries, EquityPoint } from '$lib/lab/equityCurve';

  interface Props {
    series: EquitySeries | null;
    height?: number;
    selectedTradeTime?: number | null;
  }
  let { series, height = 240, selectedTradeTime = null }: Props = $props();

  let container: HTMLDivElement;
  let chart: IChartApi | null = null;
  let stratLine: ISeriesApi<'Line'> | null = null;
  let btcLine: ISeriesApi<'Line'> | null = null;
  let cycleLines: ISeriesApi<'Line'>[] = [];

  const COLORS = {
    strategy: '#26a65b',  // --pos
    btcHold:  '#524d47',  // --g5 (muted)
    cycle:    '#f5a623',  // --amb
    grid:     '#191714',  // --g3
    bg:       '#0c0a09',  // --g1
    text:     '#857e76',  // --g7
    border:   '#242018',  // --g4
  };

  function toTV(pts: EquityPoint[]) {
    return pts.map(p => ({ time: p.time as UTCTimestamp, value: p.value }));
  }

  onMount(() => {
    chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { color: COLORS.bg },
        textColor: COLORS.text,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      rightPriceScale: {
        borderColor: COLORS.border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: COLORS.border,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 1 },
      handleScroll: true,
      handleScale: true,
    });

    // BTC Hold — grey dashed
    btcLine = chart.addSeries(LineSeries, {
      color: COLORS.btcHold,
      lineWidth: 1,
      lineStyle: 2, // dashed
      title: 'BTC Hold',
      priceLineVisible: false,
      lastValueVisible: true,
    });

    // Strategy — green
    stratLine = chart.addSeries(LineSeries, {
      color: COLORS.strategy,
      lineWidth: 2,
      title: 'Strategy',
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const ro = new ResizeObserver(() => {
      chart?.applyOptions({ width: container.clientWidth });
    });
    ro.observe(container);

    renderSeries();

    return () => ro.disconnect();
  });

  onDestroy(() => {
    chart?.remove();
    chart = null;
  });

  function renderSeries() {
    if (!chart || !stratLine || !btcLine) return;

    // Clear old cycle lines
    for (const l of cycleLines) chart.removeSeries(l);
    cycleLines = [];

    const s = series;
    stratLine.setData(s ? toTV(s.strategy) : []);
    btcLine.setData(s ? toTV(s.btcHold) : []);

    if (s?.cycles?.length) {
      for (const c of s.cycles) {
        const line = chart.addSeries(LineSeries, {
          color: COLORS.cycle,
          lineWidth: 1,
          lineStyle: 1,
          title: c.cycleId,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        line.setData(toTV(c.points));
        cycleLines.push(line);
      }
    }

    if (s && (s.strategy.length > 0 || s.btcHold.length > 0)) {
      chart.timeScale().fitContent();
    }
  }

  $effect(() => {
    // re-render when series prop changes
    series;
    renderSeries();
  });

  $effect(() => {
    // highlight selected trade crosshair position
    if (selectedTradeTime && chart) {
      chart.timeScale().scrollToPosition(0, false);
    }
  });
</script>

<div class="equity-wrap" style:height="{height}px">
  {#if !series || (series.strategy.length === 0 && series.btcHold.length === 0)}
    <div class="empty-state">
      {#if !series}
        <span class="empty-hint">Run a backtest to display the equity curve here</span>
      {:else}
        <span class="empty-hint">No trades matched the entry conditions</span>
      {/if}
    </div>
  {/if}
  <div class="chart-el" bind:this={container}></div>

  <!-- Legend -->
  {#if series && (series.strategy.length > 0 || series.btcHold.length > 0)}
    <div class="legend">
      <span class="leg-item">
        <span class="leg-line" style:background={COLORS.strategy}></span>
        Strategy
      </span>
      <span class="leg-item muted">
        <span class="leg-line dashed" style:background={COLORS.btcHold}></span>
        BTC Hold
      </span>
      {#if series.cycles.length > 0}
        <span class="leg-item">
          <span class="leg-line" style:background={COLORS.cycle}></span>
          Cycles
        </span>
      {/if}
    </div>
  {/if}
</div>

<style>
.equity-wrap {
  position: relative;
  background: var(--g1);
  border-bottom: 1px solid var(--g3);
  flex-shrink: 0;
}

.chart-el {
  width: 100%;
  height: 100%;
}

.empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  pointer-events: none;
}

.empty-hint {
  font-family: var(--font-mono);
  font-size: var(--ui-text-xs);
  color: var(--g5);
  letter-spacing: 0.04em;
}

.legend {
  position: absolute;
  top: 6px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  pointer-events: none;
  z-index: 2;
}

.leg-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: var(--ui-text-xs);
  color: var(--g7);
  letter-spacing: 0.04em;
}

.leg-item.muted { color: var(--g5); }

.leg-line {
  width: 16px;
  height: 2px;
  border-radius: 1px;
  flex-shrink: 0;
}

.leg-line.dashed {
  background: repeating-linear-gradient(
    90deg,
    var(--g5) 0 4px,
    transparent 4px 8px
  ) !important;
}
</style>
