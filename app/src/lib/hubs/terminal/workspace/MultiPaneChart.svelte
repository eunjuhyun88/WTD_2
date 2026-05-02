<!--
  MultiPaneChart — single lightweight-charts instance with native multi-pane.

  Replaces the 7-separate-charts strategy in ChartBoard with one chart that
  owns price + N indicator panes via the lightweight-charts v5.1+ pane API:
    chart.addSeries(def, opts, paneIndex)
    chart.panes()[i].setStretchFactor(...)
    layout.panes.{ separatorColor, enableResize: true }   // native drag handles

  Why: native panes get free crosshair sync, single time axis, and pane resize
  drag handles — the things that make CryptoQuant / Velo / Material Indicators
  feel right. The fake `subscribeVisibleLogicalRangeChange` cross-broadcast
  ChartBoard used to do is no longer needed.

  ChartBoard remains the orchestrator: capture mode, save modal, depth strip,
  gamma pin, range primitive, alpha markers, drag handlers, WS feed all stay.
  This component just exposes `getChart()` + `getCandleSeries()` for those.
-->
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
  } from 'lightweight-charts';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import {
    PANE_INDICATORS as PANE_SPECS,
    computePaneLines,
    type IndicatorKind,
    type ValuePoint,
  } from '$lib/chart/paneIndicators';

  type ChartMode = 'candle' | 'line';

  interface Props {
    symbol: string;
    tf: string;
    data: ChartSeriesPayload | null;
    chartMode?: ChartMode;
    showVolume?: boolean;
    showCVD?: boolean;
    showOI?: boolean;
    showFunding?: boolean;
    showLiq?: boolean;
    showRSI?: boolean;
    showMACD?: boolean;
    onChartReady?: (chart: IChartApi, candleSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>) => void;
  }

  let {
    symbol,
    tf,
    data = null,
    chartMode = 'candle',
    showVolume = true,
    showCVD = true,
    showOI = false,
    showFunding = false,
    showLiq = false,
    showRSI = false,
    showMACD = false,
    onChartReady,
  }: Props = $props();

  let containerEl = $state<HTMLDivElement | undefined>(undefined);

  let chart: IChartApi | null = null;
  let priceSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null = null;
  let volumeSeries: ISeriesApi<'Histogram'> | null = null;

  // RSI/MACD share pane index 1 (mutex). When MACD wins, we host its 3 series there.
  type MutexSubKind = 'rsi' | 'macd' | null;
  let mutexKind: MutexSubKind = null;

  // Indicator pane bookkeeping. Recomputed every render.
  type PaneBundle = {
    paneIndex: number;
    raw?: ISeriesApi<'Line'> | ISeriesApi<'Histogram'>;
    histLong?: ISeriesApi<'Histogram'>;
    histShort?: ISeriesApi<'Histogram'>;
    windows: ISeriesApi<'Line'>[];
    aux: ISeriesApi<'Line'>[]; // RSI overbought/oversold lines, MACD signal/hist, etc
  };
  const paneBundles = new Map<IndicatorKind | 'rsi' | 'macd', PaneBundle>();

  const BG = '#131722';
  const GRID = 'rgba(42,46,57,0.9)';
  const TEXT = 'rgba(177,181,189,0.85)';
  const BORDER = 'rgba(42,46,57,1)';

  const baseTheme = {
    layout: {
      background: { color: BG },
      textColor: TEXT,
      fontSize: 11,
      fontFamily: 'var(--sc-font-mono, monospace)',
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

  // Stable order so adding/removing one pane doesn't shuffle indices around.
  type PaneKind = 'rsi_or_macd' | IndicatorKind;
  const PANE_ORDER: PaneKind[] = ['rsi_or_macd', 'oi', 'cvd', 'funding', 'liq'];

  function activePanes(): { kind: PaneKind; mutexFlavor?: 'rsi' | 'macd' }[] {
    const out: { kind: PaneKind; mutexFlavor?: 'rsi' | 'macd' }[] = [];
    if (showMACD) out.push({ kind: 'rsi_or_macd', mutexFlavor: 'macd' });
    else if (showRSI) out.push({ kind: 'rsi_or_macd', mutexFlavor: 'rsi' });
    if (showOI)      out.push({ kind: 'oi' });
    if (showCVD)     out.push({ kind: 'cvd' });
    if (showFunding) out.push({ kind: 'funding' });
    if (showLiq)     out.push({ kind: 'liq' });
    return out;
  }

  // ── Render hash so repeated identical re-renders don't tear down panes ────
  function renderHash(payload: ChartSeriesPayload | null): string {
    if (!payload) return '';
    return [
      payload.symbol, payload.tf,
      payload.klines?.length ?? 0,
      payload.cvdBars?.length ?? 0,
      payload.fundingBars?.length ?? 0,
      payload.oiBars?.length ?? 0,
      payload.liqBars?.length ?? 0,
      chartMode,
      showVolume, showCVD, showOI, showFunding, showLiq, showRSI, showMACD,
    ].join('|');
  }
  let lastHash = '';

  function clearChart() {
    if (chart) {
      try { chart.remove(); } catch { /* ignore */ }
      chart = null;
    }
    priceSeries = null;
    volumeSeries = null;
    paneBundles.clear();
    mutexKind = null;
  }

  function buildAndRender(payload: ChartSeriesPayload) {
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

    // ── Pane 0: price ────────────────────────────────────────────────────
    if (chartMode === 'line') {
      priceSeries = chart.addSeries(
        LineSeries,
        { color: '#e8b84b', lineWidth: 2, priceLineVisible: true, lastValueVisible: true },
        0,
      );
      const lineData = (payload.klines || [])
        .map((k: any) => ({ time: k.time as UTCTimestamp, value: k.close }))
        .filter((p) => Number.isFinite(p.value));
      if (lineData.length > 0) (priceSeries as ISeriesApi<'Line'>).setData(lineData);
    } else {
      priceSeries = chart.addSeries(
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
      if (candleData.length > 0) (priceSeries as ISeriesApi<'Candlestick'>).setData(candleData);
    }

    // Volume overlay on pane 0 (own price scale, pinned to bottom 20%).
    if (showVolume && payload.klines?.length) {
      volumeSeries = chart.addSeries(
        HistogramSeries,
        {
          color: 'rgba(100, 150, 200, 0.5)',
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
          lastValueVisible: false,
        },
        0,
      );
      try {
        chart.priceScale('volume').applyOptions({
          scaleMargins: { top: 0.82, bottom: 0 },
        });
      } catch { /* ignore */ }
      const volumeData = (payload.klines || []).map((k: any) => ({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: k.close >= k.open ? 'rgba(0, 200, 83, 0.3)' : 'rgba(255, 59, 48, 0.3)',
      }));
      if (volumeData.length > 0) volumeSeries.setData(volumeData);
    }

    // ── Indicator panes ──────────────────────────────────────────────────
    const enabled = activePanes();
    enabled.forEach((entry, idx) => {
      const paneIndex = idx + 1; // pane 0 reserved for price
      if (entry.kind === 'rsi_or_macd') {
        if (entry.mutexFlavor === 'macd') mountMACDPane(paneIndex, payload);
        else mountRSIPane(paneIndex, payload);
        mutexKind = entry.mutexFlavor ?? null;
      } else {
        mountIndicatorPane(entry.kind, paneIndex, payload);
      }
    });

    // Stretch factors: price gets the most space.
    try {
      const allPanes = chart.panes();
      if (allPanes.length > 0) {
        allPanes[0].setStretchFactor(4);
        for (let i = 1; i < allPanes.length; i++) allPanes[i].setStretchFactor(1);
      }
    } catch { /* setStretchFactor only available v5.0.8+ */ }

    chart.timeScale().fitContent();

    if (priceSeries && onChartReady) onChartReady(chart, priceSeries);
  }

  function mountIndicatorPane(kind: IndicatorKind, paneIndex: number, payload: ChartSeriesPayload) {
    if (!chart) return;
    const spec = PANE_SPECS[kind];
    const bundle: PaneBundle = { paneIndex, windows: [], aux: [] };

    // Liquidations: two histograms (long/short) + net MA line
    if (kind === 'liq') {
      const liqBars = payload.liqBars ?? [];
      if (liqBars.length === 0) {
        paneBundles.set(kind, bundle);
        return;
      }
      bundle.histLong = chart.addSeries(
        HistogramSeries,
        { color: 'rgba(0,200,83,0.65)', priceFormat: { type: 'volume' }, lastValueVisible: false },
        paneIndex,
      );
      bundle.histShort = chart.addSeries(
        HistogramSeries,
        { color: 'rgba(255,59,48,0.65)', priceFormat: { type: 'volume' }, lastValueVisible: false },
        paneIndex,
      );
      bundle.histLong.setData(
        liqBars.map((b) => ({ time: b.time as UTCTimestamp, value: b.longUsd })),
      );
      bundle.histShort.setData(
        liqBars.map((b) => ({ time: b.time as UTCTimestamp, value: -b.shortUsd })),
      );
      const netBars: ValuePoint[] = liqBars.map((b) => ({ time: b.time, value: b.longUsd - b.shortUsd }));
      const { windowLines } = computePaneLines(spec, netBars, tf);
      for (const { window, data } of windowLines) {
        const line = chart.addSeries(
          LineSeries,
          { color: window.color, lineWidth: window.lineWidth ?? 2, lastValueVisible: true, priceLineVisible: false, title: window.label },
          paneIndex,
        );
        line.setData(data);
        bundle.windows.push(line);
      }
      paneBundles.set(kind, bundle);
      return;
    }

    // CVD / Funding / OI: raw line + MA window lines
    const rawBars = pickRawBars(kind, payload);
    if (rawBars.length === 0) {
      paneBundles.set(kind, bundle);
      return;
    }
    const { rawLine, windowLines } = computePaneLines(spec, rawBars, tf);

    if (spec.includeRaw && rawLine.length > 0) {
      bundle.raw = chart.addSeries(
        LineSeries,
        { color: spec.rawColor, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, title: 'raw' },
        paneIndex,
      );
      (bundle.raw as ISeriesApi<'Line'>).setData(rawLine);
    }

    for (const { window, data } of windowLines) {
      const line = chart.addSeries(
        LineSeries,
        { color: window.color, lineWidth: window.lineWidth ?? 2, lastValueVisible: true, priceLineVisible: false, title: window.label },
        paneIndex,
      );
      line.setData(data);
      bundle.windows.push(line);
    }

    paneBundles.set(kind, bundle);
  }

  function mountRSIPane(paneIndex: number, payload: ChartSeriesPayload) {
    if (!chart) return;
    const ind = (payload.indicators ?? {}) as Record<string, any>;
    const rsi = (ind.rsi14 as Array<{ time: number; value: number }> | undefined) ?? [];
    if (rsi.length === 0) return;
    const bundle: PaneBundle = { paneIndex, windows: [], aux: [] };
    const main = chart.addSeries(
      LineSeries,
      { color: '#a78bfa', lineWidth: 2, lastValueVisible: true, priceLineVisible: false, title: 'RSI 14' },
      paneIndex,
    );
    main.setData(rsi.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    bundle.raw = main;
    // Reference levels at 70/30
    const ob = chart.addSeries(LineSeries, { color: 'rgba(255,59,48,0.4)', lineWidth: 1, lineStyle: 2 as const, lastValueVisible: false, priceLineVisible: false }, paneIndex);
    const os = chart.addSeries(LineSeries, { color: 'rgba(0,200,83,0.4)',  lineWidth: 1, lineStyle: 2 as const, lastValueVisible: false, priceLineVisible: false }, paneIndex);
    ob.setData(rsi.map((p) => ({ time: p.time as UTCTimestamp, value: 70 })));
    os.setData(rsi.map((p) => ({ time: p.time as UTCTimestamp, value: 30 })));
    bundle.aux.push(ob, os);
    paneBundles.set('rsi', bundle);
  }

  function mountMACDPane(paneIndex: number, payload: ChartSeriesPayload) {
    if (!chart) return;
    const ind = (payload.indicators ?? {}) as Record<string, any>;
    const macd = (ind.macd as Array<{ time: number; macd: number; signal: number; hist: number }> | undefined) ?? [];
    if (macd.length === 0) return;
    const bundle: PaneBundle = { paneIndex, windows: [], aux: [] };

    const hist = chart.addSeries(
      HistogramSeries,
      { color: 'rgba(160,180,200,0.55)', priceFormat: { type: 'volume' }, lastValueVisible: false },
      paneIndex,
    );
    hist.setData(macd.map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.hist,
      color: p.hist >= 0 ? 'rgba(0,200,83,0.65)' : 'rgba(255,59,48,0.65)',
    })));
    bundle.raw = hist;

    const macdLine = chart.addSeries(LineSeries, { color: '#3a86ff', lineWidth: 2, lastValueVisible: true, priceLineVisible: false, title: 'MACD' }, paneIndex);
    const sigLine  = chart.addSeries(LineSeries, { color: '#e8b84b', lineWidth: 1, lastValueVisible: true, priceLineVisible: false, title: 'signal' }, paneIndex);
    macdLine.setData(macd.map((p) => ({ time: p.time as UTCTimestamp, value: p.macd })));
    sigLine.setData(macd.map((p) => ({ time: p.time as UTCTimestamp, value: p.signal })));
    bundle.aux.push(macdLine, sigLine);
    paneBundles.set('macd', bundle);
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
      if (!chart) {
        chart = createChart(containerEl, {
          ...baseTheme,
          width: containerEl.offsetWidth || 900,
          height: containerEl.offsetHeight || 400,
        });
      }
      return;
    }
    const hash = renderHash(data);
    if (hash !== lastHash) {
      buildAndRender(data);
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

  // ── Imperative handles for ChartBoard ────────────────────────────────
  export function getChart(): IChartApi | null { return chart; }
  export function getPriceSeries(): ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null { return priceSeries; }
  export function getCandleSeries(): ISeriesApi<'Candlestick'> | null {
    return chartMode === 'candle' ? (priceSeries as ISeriesApi<'Candlestick'> | null) : null;
  }
  export function getPaneIndex(kind: IndicatorKind | 'rsi' | 'macd'): number {
    return paneBundles.get(kind)?.paneIndex ?? -1;
  }

  // For ChartBoard's existing append-on-WS path
  export function updatePriceBar(bar: { time: number; open: number; high: number; low: number; close: number; volume: number }) {
    if (!priceSeries) return;
    if (chartMode === 'candle') {
      (priceSeries as ISeriesApi<'Candlestick'>).update({
        time: bar.time as UTCTimestamp,
        open: bar.open, high: bar.high, low: bar.low, close: bar.close,
      });
    } else {
      (priceSeries as ISeriesApi<'Line'>).update({
        time: bar.time as UTCTimestamp,
        value: bar.close,
      });
    }
    if (volumeSeries) {
      volumeSeries.update({
        time: bar.time as UTCTimestamp,
        value: bar.volume,
        color: bar.close >= bar.open ? 'rgba(0, 200, 83, 0.3)' : 'rgba(255, 59, 48, 0.3)',
      });
    }
  }
</script>

<div class="mpc-root">
  <div class="mpc-container" bind:this={containerEl}></div>

  {#if data}
    <!-- Top-left legend: which lines are drawn in which pane (price pane has none) -->
    <div class="mpc-legend">
      {#each activePanes() as p}
        {#if p.kind === 'rsi_or_macd'}
          <div class="leg-row">
            <span class="leg-title">{p.mutexFlavor === 'macd' ? 'MACD' : 'RSI 14'}</span>
            {#if p.mutexFlavor === 'macd'}
              <span class="leg-chip" style:background="rgba(160,180,200,0.55)">hist</span>
              <span class="leg-chip" style:background="#3a86ff">macd</span>
              <span class="leg-chip" style:background="#e8b84b">signal</span>
            {:else}
              <span class="leg-chip" style:background="#a78bfa">RSI</span>
              <span class="leg-chip dashed" style:background="rgba(255,59,48,0.4)">70</span>
              <span class="leg-chip dashed" style:background="rgba(0,200,83,0.4)">30</span>
            {/if}
          </div>
        {:else}
          {@const spec = PANE_SPECS[p.kind]}
          <div class="leg-row">
            <span class="leg-title">{spec.title}</span>
            {#if p.kind === 'liq'}
              <span class="leg-chip" style:background="rgba(0,200,83,0.65)">long</span>
              <span class="leg-chip" style:background="rgba(255,59,48,0.65)">short</span>
            {:else if spec.includeRaw}
              <span class="leg-chip" style:background={spec.rawColor}>raw</span>
            {/if}
            {#each spec.windows as w}
              <span class="leg-chip" style:background={w.color}>{w.label}</span>
            {/each}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .mpc-root {
    width: 100%;
    height: 100%;
    position: relative;
    background: #131722;
    overflow: hidden;
  }
  .mpc-container {
    width: 100%;
    height: 100%;
  }
  .mpc-legend {
    position: absolute;
    top: 6px;
    left: 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    pointer-events: none;
    z-index: 5;
  }
  .leg-row {
    display: flex;
    align-items: center;
    gap: 5px;
    font: 9px/1.2 var(--sc-font-mono, monospace);
    color: rgba(177, 181, 189, 0.85);
    background: rgba(19, 23, 34, 0.55);
    padding: 2px 6px;
    border-radius: 3px;
    backdrop-filter: blur(2px);
  }
  .leg-title {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(177, 181, 189, 0.55);
    min-width: 56px;
  }
  .leg-chip {
    color: #131722;
    font-weight: 600;
    border-radius: 2px;
    padding: 1px 5px;
    font-size: var(--ui-text-xs);
  }
  .leg-chip.dashed {
    background-image: repeating-linear-gradient(45deg, rgba(0,0,0,0.2) 0 3px, transparent 3px 6px);
  }
  :global(.tv-lightweight-charts) {
    font-family: var(--sc-font-mono, monospace) !important;
  }
</style>
