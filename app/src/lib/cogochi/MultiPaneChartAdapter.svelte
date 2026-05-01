<script lang="ts">
  /**
   * MultiPaneChartAdapter — wraps terminal MultiPaneChart for cogochi AppShell.
   *
   * Fetches ChartSeriesPayload from /api/chart/klines and feeds it
   * to MultiPaneChart. Reacts to symbol/timeframe changes from shell.store.
   *
   * D-4: hosts DrawingManager + DrawingCanvas overlay; subscribes to
   * shellStore.drawingTool to switch active drawing tool.
   *
   * D-5: subscribes to crosshairBus for X-axis sync, applies AI price-line
   * shapes via PriceLineManager, renders AIOverlayCanvas for non-line shapes.
   */
  import { onDestroy } from 'svelte';
  import MultiPaneChart from '../../components/terminal/workspace/MultiPaneChart.svelte';
  import DrawingCanvas from '../../components/terminal/workspace/DrawingCanvas.svelte';
  import AIOverlayCanvas from './AIOverlayCanvas.svelte';
  import { DrawingManager } from '$lib/chart/DrawingManager';
  import { PriceLineManager } from '$lib/chart/usePriceLines';
  import { shellStore } from './shell.store';
  import { chartAIOverlay } from '$lib/stores/chartAIOverlay';
  import { crosshairBus, publishCrosshair } from '$lib/stores/crosshairBus';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';

  const activeTab = $derived($shellStore.tabs.find(t => t.id === $shellStore.activeTabId));
  const symbol = $derived(activeTab?.tabState.symbol ?? 'BTCUSDT');
  const timeframe = $derived(activeTab?.tabState.timeframe ?? '4h');
  const drawingTool = $derived($shellStore.drawingTool);

  let chartData = $state<ChartSeriesPayload | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  let mainEl = $state<HTMLDivElement | undefined>(undefined);
  let drawingMgr = $state<DrawingManager | null>(null);
  let chartRef: IChartApi | null = null;
  let seriesRef: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null = null;
  const priceLineMgr = new PriceLineManager();

  // Stable id per adapter instance — used as crosshair-bus origin.
  const paneId = `cogochi-${Math.random().toString(36).slice(2, 9)}`;

  let unsubCrossOut: (() => void) | null = null;

  async function fetchChart(sym: string, tf: string) {
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/chart/klines?symbol=${encodeURIComponent(sym)}&tf=${encodeURIComponent(tf)}&limit=300`);
      if (!res.ok) throw new Error(`${res.status}`);
      chartData = await res.json() as ChartSeriesPayload;
    } catch (e) {
      error = 'Chart data unavailable';
      chartData = null;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    fetchChart(symbol, timeframe);
  });

  // Re-create DrawingManager whenever symbol/tf changes (per-pair persistence).
  $effect(() => {
    const key = `cogochi.drawings.${symbol}.${timeframe}`;
    drawingMgr?.detach();
    drawingMgr = new DrawingManager({ storageKey: key });
    return () => {
      drawingMgr?.detach();
    };
  });

  // Sync active tool from shellStore → DrawingManager.
  $effect(() => {
    const mgr = drawingMgr;
    const tool = drawingTool;
    if (!mgr) return;
    if (mgr.getActiveTool() !== tool) mgr.setTool(tool);
  });

  // D-5: apply AI price-line shapes when overlay state changes.
  $effect(() => {
    const overlay = $chartAIOverlay;
    if (!seriesRef) return;
    if (overlay.symbol === symbol && overlay.lines.length > 0) {
      priceLineMgr.setAILines(overlay.lines);
    } else {
      priceLineMgr.clearAILines();
    }
  });

  // D-5: react to crosshair bus updates from other panes.
  $effect(() => {
    const cross = $crosshairBus;
    if (!chartRef) return;
    if (cross.origin === paneId) return; // ignore own emissions
    if (cross.time == null) {
      chartRef.clearCrosshairPosition();
      return;
    }
    if (seriesRef) {
      try {
        chartRef.setCrosshairPosition(NaN, cross.time as Time, seriesRef);
      } catch {
        // ignore — chart may be re-creating
      }
    }
  });

  function handleChartReady(
    chart: IChartApi,
    candle: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>,
  ) {
    chartRef = chart;
    seriesRef = candle;
    priceLineMgr.setSeries(candle);
    drawingMgr?.attach(chart, candle);

    // D-5: publish local crosshair moves to the bus (rAF throttled).
    const handleCross = (param: { time?: Time }) => {
      const t = typeof param.time === 'number' ? param.time : null;
      publishCrosshair(t, paneId);
    };
    chart.subscribeCrosshairMove(handleCross as Parameters<IChartApi['subscribeCrosshairMove']>[0]);
    unsubCrossOut = () => {
      chart.unsubscribeCrosshairMove(handleCross as Parameters<IChartApi['unsubscribeCrosshairMove']>[0]);
    };
  }

  onDestroy(() => {
    drawingMgr?.detach();
    drawingMgr = null;
    unsubCrossOut?.();
    unsubCrossOut = null;
    priceLineMgr.clearAILines();
    chartRef = null;
    seriesRef = null;
  });
</script>

<div class="chart-adapter" bind:this={mainEl}>
  {#if loading && !chartData}
    <div class="chart-placeholder">Loading {symbol} {timeframe.toUpperCase()}…</div>
  {:else if error && !chartData}
    <div class="chart-placeholder chart-error">{error}</div>
  {:else}
    <MultiPaneChart
      {symbol}
      tf={timeframe}
      data={chartData}
      showVolume={true}
      showCVD={true}
      onChartReady={handleChartReady}
    />
    {#if drawingMgr}
      <DrawingCanvas mgr={drawingMgr} containerEl={mainEl} />
    {/if}
    <AIOverlayCanvas
      chart={chartRef}
      series={seriesRef}
      containerEl={mainEl}
      {symbol}
    />
  {/if}
</div>

<style>
  .chart-adapter {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #131722;
  }

  .chart-placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: rgba(177, 181, 189, 0.5);
    letter-spacing: 0.06em;
  }

  .chart-error {
    color: rgba(242, 54, 69, 0.6);
  }
</style>
