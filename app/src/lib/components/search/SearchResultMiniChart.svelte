<script lang="ts">
  /**
   * SearchResultMiniChart — compact candlestick chart for search result cards.
   *
   * Fetches ~60 candles centered on bar_ts_ms via /api/klines proxy,
   * renders a read-only lightweight-charts candlestick (no scroll, no scale).
   * Degrades gracefully to a placeholder on fetch/render failure.
   *
   * Props:
   *   symbol      e.g. "BTCUSDT"
   *   timeframe   e.g. "4h"  (engine format — normalized in /api/klines)
   *   bar_ts_ms   ms timestamp of the matched bar (chart centered here)
   */
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

  interface Props {
    symbol: string;
    timeframe: string;
    bar_ts_ms: number;
  }

  let { symbol, timeframe, bar_ts_ms }: Props = $props();

  // ── State ────────────────────────────────────────────────────────────────
  let containerEl: HTMLDivElement | undefined = $state();
  let status: 'loading' | 'ready' | 'error' = $state('loading');
  let chart: import('lightweight-charts').IChartApi | undefined;

  // ── Constants ────────────────────────────────────────────────────────────
  const CHART_W = 180;
  const CHART_H = 80;
  const CANDLE_LIMIT = 60; // fetch 60 bars, center on bar_ts_ms

  // ── Fetch + Render ───────────────────────────────────────────────────────
  async function load() {
    if (!browser || !containerEl) return;

    // endTime = bar_ts_ms + 20 bars ahead so the matched bar is ~⅔ from left
    const INTERVAL_MS: Record<string, number> = {
      '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
      '1h': 3_600_000, '2h': 7_200_000, '4h': 14_400_000,
      '6h': 21_600_000, '8h': 28_800_000, '12h': 43_200_000,
      '1d': 86_400_000,
    };
    const tfLower = timeframe.toLowerCase();
    const barMs = INTERVAL_MS[tfLower] ?? INTERVAL_MS['4h'];
    const endTime = bar_ts_ms + barMs * 20;

    try {
      const params = new URLSearchParams({
        symbol,
        interval: timeframe,
        limit: String(CANDLE_LIMIT),
        endTime: String(endTime),
      });
      const res = await fetch(`/api/klines?${params}`);
      if (!res.ok) throw new Error(`klines ${res.status}`);

      const klines: Array<{ time: number; open: number; high: number; low: number; close: number }> =
        await res.json();

      if (!klines.length) throw new Error('empty klines');

      await renderChart(klines);
      status = 'ready';
    } catch {
      status = 'error';
    }
  }

  async function renderChart(
    klines: Array<{ time: number; open: number; high: number; low: number; close: number }>,
  ) {
    if (!containerEl) return;

    // Dynamic import — avoids SSR issues
    const { createChart, CandlestickSeries } = await import('lightweight-charts');

    chart = createChart(containerEl, {
      width: CHART_W,
      height: CHART_H,
      layout: {
        background: { color: '#0d1117' },
        textColor: 'rgba(255,255,255,0)',  // hide labels in mini mode
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: {
        visible: false,
        borderVisible: false,
      },
      crosshair: { mode: 0 },   // 0 = None
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#00C853',
      downColor: '#FF3B30',
      borderVisible: false,
      wickUpColor: '#00C853',
      wickDownColor: '#FF3B30',
    });

    series.setData(klines as any);
    chart.timeScale().fitContent();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  onMount(() => {
    load();
  });

  onDestroy(() => {
    chart?.remove();
    chart = undefined;
  });
</script>

<div class="mini-chart-wrap" aria-label="Mini chart for {symbol} {timeframe}">
  {#if status === 'loading'}
    <div class="mini-placeholder loading">
      <span class="spinner"></span>
    </div>
  {:else if status === 'error'}
    <div class="mini-placeholder error">
      <span class="chart-icon">▤</span>
    </div>
  {:else}
    <!-- chart rendered into containerEl -->
  {/if}

  <!-- Always mount container so chart can render into it -->
  <div
    bind:this={containerEl}
    class="chart-container"
    class:hidden={status !== 'ready'}
  ></div>
</div>

<style>
  .mini-chart-wrap {
    width: 180px;
    height: 80px;
    flex-shrink: 0;
    border-radius: 6px;
    overflow: hidden;
    background: #0d1117;
    position: relative;
  }

  .mini-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    inset: 0;
  }

  .chart-icon {
    font-size: 1.4rem;
    opacity: 0.25;
  }

  /* Spinner */
  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top-color: rgba(255, 255, 255, 0.4);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .chart-container {
    width: 180px;
    height: 80px;
  }

  .chart-container.hidden {
    visibility: hidden;
    position: absolute;
    pointer-events: none;
  }
</style>
