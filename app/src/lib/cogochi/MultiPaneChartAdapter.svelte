<script lang="ts">
  /**
   * MultiPaneChartAdapter — wraps terminal MultiPaneChart for cogochi AppShell.
   *
   * Fetches ChartSeriesPayload from /api/chart/klines and feeds it
   * to MultiPaneChart. Reacts to symbol/timeframe changes from shell.store.
   */
  import MultiPaneChart from '../components/terminal/workspace/MultiPaneChart.svelte';
  import { shellStore } from './shell.store';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';

  const activeTab = $derived($shellStore.tabs.find(t => t.id === $shellStore.activeTabId));
  const symbol = $derived(activeTab?.tabState.symbol ?? 'BTCUSDT');
  const timeframe = $derived(activeTab?.tabState.timeframe ?? '4h');

  let chartData = $state<ChartSeriesPayload | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

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
</script>

<div class="chart-adapter">
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
    />
  {/if}
</div>

<style>
  .chart-adapter {
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
