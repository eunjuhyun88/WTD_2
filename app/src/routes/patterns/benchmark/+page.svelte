<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchAllPatternObjects, fetchPatternBacktest } from '$lib/api/strategyBackend';
  import type { PatternBacktestStats, PatternObjectRow } from '$lib/api/strategyBackend';
  import BenchmarkChart from '$lib/strategy/BenchmarkChart.svelte';

  const MAX_SELECT = 5;
  const COLORS = ['#db9a9f', '#7ec8e3', '#a8e6b4', '#ffd18c', '#c3b1e1'];

  let patterns = $state<PatternObjectRow[]>([]);
  let statsMap = $state(new Map<string, PatternBacktestStats>());
  let selected = $state<string[]>([]);
  let btcCurve = $state<number[] | undefined>(undefined);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const chartSeries = $derived(
    selected.map((slug, i) => ({
      slug,
      curve: statsMap.get(slug)?.equity_curve ?? [],
      color: COLORS[i % COLORS.length],
    })).filter(s => s.curve.length >= 2),
  );

  function toggleSlug(slug: string) {
    if (selected.includes(slug)) {
      selected = selected.filter(s => s !== slug);
    } else if (selected.length < MAX_SELECT) {
      selected = [...selected, slug];
    }
  }

  async function loadBtcCurve() {
    try {
      const res = await fetch('/api/chart/klines?symbol=BTCUSDT&tf=1d&limit=365');
      if (!res.ok) return;
      const data = await res.json() as { klines?: Array<{ close: number }> };
      const closes = data.klines?.map(k => k.close) ?? [];
      if (closes.length < 2) return;
      const curve = [1.0];
      for (let i = 1; i < closes.length; i++) {
        const r = closes[i] / closes[i - 1] - 1;
        curve.push(curve[curve.length - 1] * (1 + r));
      }
      btcCurve = curve;
    } catch { /* best-effort */ }
  }

  onMount(async () => {
    try {
      [patterns] = await Promise.all([fetchAllPatternObjects(), loadBtcCurve()]);
      // Pre-load stats for all patterns
      await Promise.allSettled(patterns.map(async (p) => {
        try {
          const s = await fetchPatternBacktest(p.slug);
          statsMap = new Map([...statsMap, [p.slug, s]]);
        } catch { /* silent */ }
      }));
      // Auto-select top 3 by Sharpe
      const ranked = [...patterns]
        .filter(p => statsMap.get(p.slug)?.sharpe != null)
        .sort((a, b) => (statsMap.get(b.slug)?.sharpe ?? -Infinity) - (statsMap.get(a.slug)?.sharpe ?? -Infinity));
      selected = ranked.slice(0, 3).map(p => p.slug);
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Benchmark — Cogochi</title>
</svelte:head>

<div class="benchmark-page">
  <header class="page-header">
    <div>
      <h1 class="page-title">Benchmark</h1>
      <p class="page-sub">Select up to 5 patterns → compare returns vs BTC Hold</p>
    </div>
    <a href="/strategies" class="back-link">← Strategies</a>
  </header>

  {#if error}
    <div class="page-error">{error}</div>
  {:else if loading}
    <div class="loading-state">Loading data…</div>
  {:else}
    <div class="benchmark-layout">
      <!-- Selector -->
      <div class="selector-panel">
        <div class="selector-header">
          <span>Select Pattern</span>
          <span class="sel-count">{selected.length}/{MAX_SELECT}</span>
        </div>
        <div class="selector-list">
          {#each patterns as p}
            {@const s = statsMap.get(p.slug)}
            {@const isSelected = selected.includes(p.slug)}
            {@const idx = selected.indexOf(p.slug)}
            <button
              class="sel-item"
              class:active={isSelected}
              class:disabled={!isSelected && selected.length >= MAX_SELECT}
              onclick={() => toggleSlug(p.slug)}
              type="button"
            >
              {#if isSelected}
                <span class="sel-dot" style="background:{COLORS[idx % COLORS.length]}"></span>
              {:else}
                <span class="sel-dot empty"></span>
              {/if}
              <span class="sel-slug">{p.slug.replace(/-v\d+$/, '')}</span>
              {#if s?.sharpe != null}
                <span class="sel-sharpe">{s.sharpe.toFixed(1)}</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <!-- Chart -->
      <div class="chart-panel">
        {#if chartSeries.length === 0}
          <div class="chart-empty">Select a pattern on the left</div>
        {:else}
          <BenchmarkChart series={chartSeries} {btcCurve} height={280} />

          <div class="stats-table">
            <div class="st-header">
              <span>Pattern</span><span>APR</span><span>Win Rate</span><span>Sharpe</span><span>Signals</span>
            </div>
            {#each selected as slug, i}
              {@const s = statsMap.get(slug)}
              <div class="st-row">
                <span class="st-name" style="border-left: 2px solid {COLORS[i % COLORS.length]}; padding-left: 6px;">
                  {slug.replace(/-v\d+$/, '')}
                </span>
                <span>{s?.apr != null ? ((s.apr * 100).toFixed(1) + '%') : '—'}</span>
                <span>{s?.win_rate != null ? ((s.win_rate * 100).toFixed(1) + '%') : '—'}</span>
                <span>{s?.sharpe != null ? s.sharpe.toFixed(2) : '—'}</span>
                <span>{s?.n_signals ?? '—'}</span>
              </div>
            {/each}
            {#if btcCurve}
              {@const btcReturn = btcCurve[btcCurve.length - 1] - 1}
              <div class="st-row btc-row">
                <span class="st-name" style="border-left: 2px solid rgba(247,147,26,0.6); padding-left: 6px;">BTC Hold</span>
                <span>{(btcReturn * 100).toFixed(1)}%</span>
                <span>—</span><span>—</span><span>—</span>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .benchmark-page {
    padding: 24px 32px;
    max-width: 1200px;
    margin: 0 auto;
  }
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 20px;
  }
  .page-title { font-size: 18px; font-weight: 700; color: var(--g9, #f0f0f0); margin: 0 0 4px; }
  .page-sub { font-size: 11px; color: var(--g5, #666); margin: 0; }
  .back-link {
    font-size: 11px; color: var(--g6, #888);
    text-decoration: none; padding: 4px 10px;
    border: 1px solid var(--g3, #2a2a2a); border-radius: 5px;
    transition: color 0.12s;
  }
  .back-link:hover { color: var(--g9, #f0f0f0); }
  .page-error, .loading-state {
    font-size: 12px; color: var(--g5, #666); padding: 40px 0; text-align: center;
  }
  .page-error { color: var(--sc-red, #e05c5c); }

  .benchmark-layout {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 700px) {
    .benchmark-layout { grid-template-columns: 1fr; }
  }

  .selector-panel {
    background: var(--g1, #111);
    border: 1px solid var(--g3, #2a2a2a);
    border-radius: 8px;
    overflow: hidden;
  }
  .selector-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--g3, #2a2a2a);
    font-size: 11px; color: var(--g6, #888);
  }
  .sel-count { font-variant-numeric: tabular-nums; }
  .selector-list { max-height: 480px; overflow-y: auto; padding: 4px 0; }
  .sel-item {
    width: 100%; display: flex; align-items: center; gap: 7px;
    padding: 6px 12px; cursor: pointer; text-align: left;
    background: transparent; border: none; border-radius: 0;
    transition: background 0.1s;
  }
  .sel-item:hover:not(.disabled) { background: var(--g2, #181818); }
  .sel-item.active { background: var(--g2, #181818); }
  .sel-item.disabled { opacity: 0.35; cursor: not-allowed; }
  .sel-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .sel-dot.empty { border: 1px solid var(--g4, #444); }
  .sel-slug { font-size: 10px; color: var(--g7, #bbb); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sel-sharpe { font-size: 9px; color: var(--g5, #666); font-variant-numeric: tabular-nums; }

  .chart-panel { display: flex; flex-direction: column; gap: 12px; }
  .chart-empty { font-size: 12px; color: var(--g5, #666); padding: 80px 0; text-align: center; }

  .stats-table { border: 1px solid var(--g3, #2a2a2a); border-radius: 6px; overflow: hidden; }
  .st-header, .st-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
    padding: 6px 12px;
    font-size: 10px;
    gap: 4px;
  }
  .st-header { color: var(--g5, #666); text-transform: uppercase; background: var(--g1, #0e0e0e); border-bottom: 1px solid var(--g3, #2a2a2a); }
  .st-row { color: var(--g7, #bbb); font-variant-numeric: tabular-nums; }
  .st-row:not(:last-child) { border-bottom: 1px solid var(--g2, #1a1a1a); }
  .st-row.btc-row { color: var(--g5, #666); }
  .st-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
