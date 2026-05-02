<script lang="ts">
  /**
   * CanvasHost.svelte — Layer 0 LWC canvas wrapper
   *
   * Wraps LWC init and exposes an imperative API via bind:this.
   * Subscribes to chartSaveMode to show/hide the range primitive.
   * Handles click events for range-mode anchor placement.
   *
   * Layer rule (W-0086):
   *   - No application DOM is placed on top of this canvas.
   *   - chart.subscribeClick() is used for range anchor capture.
   *   - Pan, zoom, crosshair are NOT intercepted; range mode click is additive.
   */
  import { onMount, onDestroy } from 'svelte';
  import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
  import type {
    IChartApi,
    ISeriesApi,
    UTCTimestamp,
    SeriesType,
    Time,
  } from 'lightweight-charts';
  import { chartSaveMode } from '$lib/stores/chartSaveMode';
  import { RangePrimitive } from './primitives/RangePrimitive';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import type { DepthLadderEnvelope, LiquidationClustersEnvelope } from '$lib/contracts/terminalBackend';

  // ── Props ──────────────────────────────────────────────────────────────────
  interface Props {
    symbol: string;
    tf?: string;
    initialData?: ChartSeriesPayload | null;
    verdictLevels?: { entry?: number; target?: number; stop?: number };
    depthSnapshot?: DepthLadderEnvelope['data'] | null;
    liqSnapshot?: LiquidationClustersEnvelope['data'] | null;
    onPriceUpdate?: (price: number, time: number) => void;
    onTfChange?: (tf: string) => void;
    onChartReady?: () => void;
    /** Returns the main chart API (used by parent for crosshair sync etc.) */
    getMainChart?: () => IChartApi | null;
  }

  let {
    symbol,
    tf = '1h',
    initialData = null,
    verdictLevels,
    onPriceUpdate,
    onChartReady,
  }: Props = $props();

  // ── DOM refs ───────────────────────────────────────────────────────────────
  let containerEl = $state<HTMLDivElement | undefined>(undefined);

  // ── LWC state ──────────────────────────────────────────────────────────────
  let chart: IChartApi | null = null;
  let priceSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null = null;
  let rangePrimitive: RangePrimitive | null = null;
  let rangeClickUnsubscribe: (() => void) | null = null;

  // ── Theme ──────────────────────────────────────────────────────────────────
  const BG    = '#131722';
  const GRID  = 'rgba(42,46,57,0.9)';
  const TEXT  = 'rgba(177,181,189,0.85)';

  // ── Range mode store subscription ─────────────────────────────────────────
  let saveModeUnsubscribe: (() => void) | null = null;

  function handleRangeModeChange(state: { active: boolean; anchorA: number | null; anchorB: number | null }) {
    if (!chart || !priceSeries) return;

    if (state.active) {
      // Subscribe to chart clicks only while range-mode is active
      if (!rangeClickUnsubscribe) {
        const handler = (param: { time?: Time; point?: { x: number; y: number } }) => {
          if (!param.time) return;
          // Convert LWC Time (UTCTimestamp / string) to unix seconds
          const t = typeof param.time === 'number'
            ? param.time
            : Math.floor(new Date(param.time as string).getTime() / 1000);
          chartSaveMode.setAnchor(t);
        };
        chart!.subscribeClick(handler);
        rangeClickUnsubscribe = () => chart?.unsubscribeClick(handler);
      }
    } else {
      // Unsubscribe clicks when range mode exits
      rangeClickUnsubscribe?.();
      rangeClickUnsubscribe = null;
    }

    // Drive the primitive
    if (rangePrimitive) {
      rangePrimitive.setRange(state.anchorA, state.anchorB);
    }
  }

  // ── Keyboard handler for ESC ───────────────────────────────────────────────
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && $chartSaveMode.active) {
      chartSaveMode.exitRangeMode();
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  onMount(() => {
    if (!containerEl) return;

    chart = createChart(containerEl, {
      layout: {
        background: { color: BG },
        textColor: TEXT,
        fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      crosshair: {
        mode: 1, // CROSSHAIR_MODE.Normal = 1
      },
      rightPriceScale: {
        borderColor: GRID,
      },
      timeScale: {
        borderColor: GRID,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    // Candlestick series as the main price series
    priceSeries = chart.addSeries(CandlestickSeries, {
      upColor:   '#26a69a',
      downColor: '#ef5350',
      borderUpColor:   '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor:   '#26a69a',
      wickDownColor: '#ef5350',
    });

    // Attach the range primitive to the price series
    rangePrimitive = new RangePrimitive();
    (priceSeries as ISeriesApi<SeriesType>).attachPrimitive(rangePrimitive as unknown as Parameters<ISeriesApi<SeriesType>['attachPrimitive']>[0]);

    // Load initial data if provided
    if (initialData?.klines?.length) {
      const candles = initialData.klines.map((c: { time: number; open: number; high: number; low: number; close: number; volume: number }) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      (priceSeries as ISeriesApi<'Candlestick'>).setData(candles);
      chart.timeScale().fitContent();
    }

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (chart && containerEl) {
        chart.resize(containerEl.clientWidth, containerEl.clientHeight);
      }
    });
    ro.observe(containerEl);

    // Subscribe crosshair move for price updates
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !priceSeries) return;
      const data = param.seriesData.get(priceSeries);
      if (data && 'close' in data) {
        const t = typeof param.time === 'number'
          ? param.time
          : Math.floor(new Date(param.time as string).getTime() / 1000);
        onPriceUpdate?.(data.close, t);
      }
    });

    // Subscribe to chartSaveMode store
    saveModeUnsubscribe = chartSaveMode.subscribe(handleRangeModeChange);

    // ESC key listener
    window.addEventListener('keydown', handleKeydown);

    onChartReady?.();

    return () => {
      ro.disconnect();
    };
  });

  onDestroy(() => {
    rangeClickUnsubscribe?.();
    saveModeUnsubscribe?.();
    window.removeEventListener('keydown', handleKeydown);
    if (priceSeries && rangePrimitive) {
      try {
        (priceSeries as ISeriesApi<SeriesType>).detachPrimitive(rangePrimitive as unknown as Parameters<ISeriesApi<SeriesType>['detachPrimitive']>[0]);
      } catch {
        // ignore if already detached
      }
    }
    chart?.remove();
    chart = null;
    priceSeries = null;
    rangePrimitive = null;
  });

  // ── Exposed imperative API ─────────────────────────────────────────────────

  /** Returns the main LWC IChartApi instance. */
  export function getMainChart(): IChartApi | null {
    return chart;
  }

  /** Returns the main price series. */
  export function getMainSeries(): ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null {
    return priceSeries;
  }

  /**
   * Feed new OHLCV candles to the chart.
   * Called by parent when data is fetched.
   */
  export function setCandles(
    candles: Array<{ time: number; open: number; high: number; low: number; close: number }>
  ): void {
    if (!priceSeries || !chart) return;
    const mapped = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    (priceSeries as ISeriesApi<'Candlestick'>).setData(mapped);
    chart.timeScale().fitContent();
  }

  /**
   * Returns candles currently visible in the time scale viewport.
   * Used by SaveStrip to compute the range display label.
   */
  export function getVisibleCandles(): Array<{ time: number; open: number; high: number; low: number; close: number }> {
    if (!chart || !priceSeries) return [];
    const visRange = chart.timeScale().getVisibleLogicalRange();
    if (!visRange) return [];
    // Return all candle data (parent can filter by anchor times)
    const seriesData = (priceSeries as ISeriesApi<'Candlestick'>).data();
    return (seriesData as Array<{ time: UTCTimestamp; open: number; high: number; low: number; close: number }>).map((d) => ({
      time: d.time as number,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
  }
</script>

<div
  class="canvas-host"
  bind:this={containerEl}
  class:range-cursor={$chartSaveMode.active}
></div>

<style>
  .canvas-host {
    width: 100%;
    height: 100%;
    position: relative;
    /* Layer 0: no DOM overlay on this element */
  }

  /* Crosshair-with-hint cursor during range selection */
  .canvas-host.range-cursor {
    cursor: crosshair;
  }
</style>
