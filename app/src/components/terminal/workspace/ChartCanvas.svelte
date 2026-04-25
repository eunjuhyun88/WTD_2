<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    createChart,
    CandlestickSeries,
    LineSeries,
    HistogramSeries,
  } from 'lightweight-charts';
  import type {
    UTCTimestamp,
    IChartApi,
    ISeriesApi,
    IPaneApi,
  } from 'lightweight-charts';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import {
    PANE_INDICATORS,
    computePaneLines,
    type IndicatorKind,
    type ValuePoint,
  } from '$lib/chart/paneIndicators';

  interface Props {
    symbol: string;
    tf: string;
    data: ChartSeriesPayload | null;
    chartMode?: 'candle' | 'line';
    showVolumePane?: boolean;
    showOI?: boolean;
    showFunding?: boolean;
    showCVD?: boolean;
    showLiq?: boolean;
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
    showLiq = false,
    onChartReady,
  }: Props = $props();

  let containerEl = $state<HTMLDivElement | undefined>(undefined);
  let chart: IChartApi | null = null;
  let candleSeriesRef: ISeriesApi<'Candlestick'> | null = null;
  let volumeSeriesRef: ISeriesApi<'Histogram'> | null = null;

  // Per-indicator series collection (raw line + window MA lines + histograms).
  // Keyed by IndicatorKind so we can find/clear without name mismatches.
  type IndicatorSeriesBundle = {
    paneIndex: number;
    raw?: ISeriesApi<'Line'> | ISeriesApi<'Histogram'>;
    histLong?: ISeriesApi<'Histogram'>;
    histShort?: ISeriesApi<'Histogram'>;
    windows: ISeriesApi<'Line'>[];
  };
  const indicatorBundles = new Map<IndicatorKind, IndicatorSeriesBundle>();

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
      // Multi-pane separator is part of layout in v5.
      panes: {
        separatorColor: '#2B2B43',
        separatorHoverColor: '#4c4c6e',
        enableResize: true,
      },
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

  // ── Pane-index plan (computed lazily based on enabled indicators) ─────
  // Pane 0 is always price. Then panes are added in this priority order.
  // We compute the actual indices at render time so disabled panes don't
  // leave gaps.
  const PANE_ORDER: IndicatorKind[] = ['cvd', 'oi', 'funding', 'liq'];

  function enabledPanes(): IndicatorKind[] {
    const out: IndicatorKind[] = [];
    if (showCVD)     out.push('cvd');
    if (showOI)      out.push('oi');
    if (showFunding) out.push('funding');
    if (showLiq)     out.push('liq');
    // Stable order regardless of toggle order:
    return PANE_ORDER.filter((k) => out.includes(k));
  }

  // Returns 1-indexed pane number for an indicator (0 is price/volume).
  function paneIndexOf(kind: IndicatorKind, panes: IndicatorKind[]): number {
    // Pane 0: price. Volume sits inside pane 0 (overlay) or its own pane below.
    // Simpler: indicator panes start at 1; volume stays as overlay on pane 0
    // because traders typically want price+volume colocated.
    const idx = panes.indexOf(kind);
    return idx === -1 ? -1 : idx + 1;
  }

  function clearChart() {
    if (chart) {
      try { chart.remove(); } catch { /* ignore */ }
      chart = null;
    }
    candleSeriesRef = null;
    volumeSeriesRef = null;
    indicatorBundles.clear();
  }

  function hashRenderInputs(payload: ChartSeriesPayload | null): string {
    // Cheap discriminator so a re-fetch with same data doesn't tear down panes.
    if (!payload) return '';
    return [
      payload.symbol,
      payload.tf,
      payload.klines?.length ?? 0,
      payload.cvdBars?.length ?? 0,
      payload.fundingBars?.length ?? 0,
      payload.oiBars?.length ?? 0,
      payload.liqBars?.length ?? 0,
      showCVD, showOI, showFunding, showLiq, showVolumePane,
    ].join('|');
  }
  let lastHash = '';

  function createAndRender(payload: ChartSeriesPayload) {
    if (!containerEl) return;
    clearChart();

    const w = containerEl.offsetWidth || 900;
    const h = containerEl.offsetHeight || 400;
    chart = createChart(containerEl, {
      ...baseTheme,
      width: w,
      height: h,
      rightPriceScale: { ...baseTheme.rightPriceScale, scaleMargins: { top: 0.08, bottom: 0.08 } },
    });
    if (!chart) return;

    // ── Pane 0: price (candles) ─────────────────────────────────────────
    candleSeriesRef = chart.addSeries(
      CandlestickSeries,
      {
        upColor: '#00C853',
        downColor: '#FF3B30',
        borderVisible: false,
        wickUpColor: '#00C853',
        wickDownColor: '#FF3B30',
      },
      0,
    );
    const candleData = (payload.klines || []).map((k: any) => ({
      time: k.time as UTCTimestamp,
      open: k.open, high: k.high, low: k.low, close: k.close,
    }));
    if (candleData.length > 0) candleSeriesRef.setData(candleData);

    // Volume overlay on pane 0 (own price scale on the left so it doesn't
    // squash candles).
    if (showVolumePane) {
      volumeSeriesRef = chart.addSeries(
        HistogramSeries,
        {
          color: 'rgba(100, 150, 200, 0.5)',
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
        },
        0,
      );
      // Pin volume to the bottom 20% of the price pane
      chart.priceScale('volume', 0).applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });
      const volumeData = (payload.klines || []).map((k: any) => ({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: k.close >= k.open ? 'rgba(0, 200, 83, 0.3)' : 'rgba(255, 59, 48, 0.3)',
      }));
      if (volumeData.length > 0) volumeSeriesRef.setData(volumeData);
    }

    // ── Indicator panes ─────────────────────────────────────────────────
    const panes = enabledPanes();
    for (const kind of panes) {
      const paneIndex = paneIndexOf(kind, panes);
      if (paneIndex < 0) continue;
      mountIndicatorPane(kind, paneIndex, payload);
    }

    // Apply stretch factors so price gets the most space
    try {
      const allPanes = chart.panes();
      if (allPanes.length > 0) {
        allPanes[0].setStretchFactor(4); // price
        for (let i = 1; i < allPanes.length; i++) {
          allPanes[i].setStretchFactor(1);
        }
      }
    } catch { /* setStretchFactor only available v5.0.8+ */ }

    chart.timeScale().fitContent();
    if (onChartReady) onChartReady(chart);
  }

  /** Build all series for one indicator pane and store the bundle. */
  function mountIndicatorPane(kind: IndicatorKind, paneIndex: number, payload: ChartSeriesPayload) {
    if (!chart) return;
    const spec = PANE_INDICATORS[kind];
    const bundle: IndicatorSeriesBundle = { paneIndex, windows: [] };

    if (kind === 'liq') {
      // Special pane: long histogram + short histogram (mirrored) + net MA line
      const liqBars = payload.liqBars ?? [];
      bundle.histLong = chart.addSeries(
        HistogramSeries,
        { color: 'rgba(0,200,83,0.55)', priceFormat: { type: 'volume' } },
        paneIndex,
      );
      bundle.histShort = chart.addSeries(
        HistogramSeries,
        { color: 'rgba(255,59,48,0.55)', priceFormat: { type: 'volume' } },
        paneIndex,
      );
      bundle.histLong.setData(liqBars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.longUsd,
      })));
      bundle.histShort.setData(liqBars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: -b.shortUsd, // negative side of the histogram
      })));
      // Net MA line (long - short) smoothed
      const netBars: ValuePoint[] = liqBars.map((b) => ({ time: b.time, value: b.longUsd - b.shortUsd }));
      const { windowLines } = computePaneLines(spec, netBars);
      for (const { window, data } of windowLines) {
        const line = chart.addSeries(
          LineSeries,
          { color: window.color, lineWidth: window.lineWidth ?? 2, lastValueVisible: true, priceLineVisible: false },
          paneIndex,
        );
        line.setData(data);
        bundle.windows.push(line);
      }
      indicatorBundles.set(kind, bundle);
      return;
    }

    // Generic line panes (cvd / funding / oi)
    const rawBars = pickRawBars(kind, payload);
    if (rawBars.length === 0 && spec.windows.length === 0) return;

    const { rawLine, windowLines } = computePaneLines(spec, rawBars);

    if (spec.includeRaw && rawLine.length > 0) {
      bundle.raw = chart.addSeries(
        LineSeries,
        {
          color: spec.rawColor,
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
        },
        paneIndex,
      );
      (bundle.raw as ISeriesApi<'Line'>).setData(rawLine);
    }

    for (const { window, data } of windowLines) {
      const line = chart.addSeries(
        LineSeries,
        {
          color: window.color,
          lineWidth: window.lineWidth ?? 2,
          lastValueVisible: true,
          priceLineVisible: false,
          title: window.label,
        },
        paneIndex,
      );
      line.setData(data);
      bundle.windows.push(line);
    }

    indicatorBundles.set(kind, bundle);
  }

  function pickRawBars(kind: IndicatorKind, payload: ChartSeriesPayload): ValuePoint[] {
    if (kind === 'cvd')     return (payload.cvdBars ?? []).map((b) => ({ time: b.time, value: b.value }));
    if (kind === 'funding') return (payload.fundingBars ?? []).map((b) => ({ time: b.time, value: b.value }));
    if (kind === 'oi')      return (payload.oiBars ?? []).map((b) => ({ time: b.time, value: b.value }));
    return [];
  }

  // ── Reactivity ────────────────────────────────────────────────────────
  $effect(() => {
    if (!containerEl) return;
    if (!data) {
      // Empty chart placeholder so the container has dimensions while data loads
      if (!chart) {
        chart = createChart(containerEl, {
          ...baseTheme,
          width: containerEl.offsetWidth || 900,
          height: containerEl.offsetHeight || 400,
        });
      }
      return;
    }
    const hash = hashRenderInputs(data);
    if (hash !== lastHash) {
      createAndRender(data);
      lastHash = hash;
    }
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

  onDestroy(() => clearChart());

  // ── Imperative handles for parent components ──────────────────────────
  export function getChart(): IChartApi | null { return chart; }
  export function getCandleSeries(): ISeriesApi<'Candlestick'> | null { return candleSeriesRef; }
  export function getIndicatorPaneIndex(kind: IndicatorKind): number {
    return indicatorBundles.get(kind)?.paneIndex ?? -1;
  }
</script>

<div class="chart-root">
  <div class="candle-pane" bind:this={containerEl} data-mode={chartMode}></div>

  <!-- Pane legend strip (rendered as overlay so the chart owns the actual panes) -->
  {#if data}
    <div class="pane-legend">
      {#each enabledPanes() as kind}
        {@const spec = PANE_INDICATORS[kind]}
        <div class="leg-row">
          <span class="leg-title">{spec.title}</span>
          {#if spec.includeRaw && kind !== 'liq'}
            <span class="leg-chip" style:background={spec.rawColor}>raw</span>
          {/if}
          {#if kind === 'liq'}
            <span class="leg-chip" style:background="rgba(0,200,83,0.55)">long</span>
            <span class="leg-chip" style:background="rgba(255,59,48,0.55)">short</span>
          {/if}
          {#each spec.windows as w}
            <span class="leg-chip" style:background={w.color}>{w.label}</span>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .chart-root {
    width: 100%;
    height: 100%;
    position: relative;
    background: #131722;
    overflow: hidden;
  }
  .candle-pane {
    width: 100%;
    height: 100%;
  }
  .pane-legend {
    position: absolute;
    top: 8px;
    left: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    pointer-events: none;
    z-index: 5;
  }
  .leg-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 9px/1.2 var(--sc-font-mono, monospace);
    color: rgba(177, 181, 189, 0.85);
    background: rgba(19, 23, 34, 0.6);
    padding: 2px 6px;
    border-radius: 3px;
    backdrop-filter: blur(2px);
  }
  .leg-title {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(177, 181, 189, 0.55);
  }
  .leg-chip {
    color: #131722;
    font-weight: 600;
    border-radius: 2px;
    padding: 1px 5px;
    font-size: 9px;
  }

  :global(.tv-lightweight-charts) {
    font-family: var(--sc-font-mono, monospace) !important;
  }
</style>
