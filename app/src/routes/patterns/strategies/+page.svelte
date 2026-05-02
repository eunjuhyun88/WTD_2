<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchAllPatternObjects, fetchPatternBacktest } from '$lib/api/strategyBackend';
  import type { PatternBacktestStats, PatternObjectRow } from '$lib/api/strategyBackend';
  import StrategyGrid from '$lib/strategy/StrategyGrid.svelte';

  let patterns = $state<PatternObjectRow[]>([]);
  let statsMap = $state(new Map<string, PatternBacktestStats>());
  let loadingSet = $state(new Set<string>());
  let pageError = $state<string | null>(null);
  let sort = $state<'sharpe' | 'apr' | 'win_rate' | 'n_signals'>('sharpe');
  let drillSlug = $state<string | null>(null);

  onMount(async () => {
    try {
      patterns = await fetchAllPatternObjects();
    } catch (e) {
      pageError = String(e);
      return;
    }

    // Load stats in parallel batches of 8 to avoid overwhelming the proxy
    const BATCH = 8;
    for (let i = 0; i < patterns.length; i += BATCH) {
      const batch = patterns.slice(i, i + BATCH);
      batch.forEach(p => {
        loadingSet = new Set([...loadingSet, p.slug]);
      });
      await Promise.allSettled(
        batch.map(async (p) => {
          try {
            const s = await fetchPatternBacktest(p.slug);
            statsMap = new Map([...statsMap, [p.slug, s]]);
          } catch {
            // individual failures are silent — card shows — with null stats
          } finally {
            loadingSet = new Set([...loadingSet].filter(x => x !== p.slug));
          }
        }),
      );
    }
  });
</script>

<svelte:head>
  <title>Strategies — Cogochi</title>
</svelte:head>

<div class="strategies-page">
  <header class="page-header">
    <h1 class="page-title">Strategies</h1>
    <p class="page-sub">52 patterns · 1-year backtest results · updated daily at 03:00 UTC</p>
    <a href="/benchmark" class="benchmark-link">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <polyline points="1,8 3.5,5 6,6.5 8.5,2.5 11,4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Benchmark Compare →
    </a>
  </header>

  {#if pageError}
    <div class="page-error">{pageError}</div>
  {:else if patterns.length === 0}
    <div class="loading-state">Loading pattern list…</div>
  {:else}
    <StrategyGrid
      {patterns}
      {statsMap}
      {loadingSet}
      {sort}
      freeLimit={10}
      onCardClick={(slug) => (drillSlug = slug)}
    />
  {/if}

  {#if drillSlug}
    {@const s = statsMap.get(drillSlug)}
    <div class="drill-backdrop" onclick={() => (drillSlug = null)} role="presentation"></div>
    <div class="drill-panel" role="dialog" aria-modal="true" aria-label="Pattern Detail">
      <button class="drill-close" onclick={() => (drillSlug = null)} type="button">×</button>
      <h2 class="drill-title">{drillSlug}</h2>
      {#if s}
        <div class="drill-stats">
          <div class="ds"><span>APR</span><strong>{s.apr != null ? ((s.apr * 100).toFixed(1) + '%') : '—'}</strong></div>
          <div class="ds"><span>Win Rate</span><strong>{s.win_rate != null ? ((s.win_rate * 100).toFixed(1) + '%') : '—'}</strong></div>
          <div class="ds"><span>Sharpe</span><strong>{s.sharpe != null ? s.sharpe.toFixed(2) : '—'}</strong></div>
          <div class="ds"><span>Signals</span><strong>{s.n_signals}</strong></div>
          <div class="ds"><span>Avg 72h</span><strong>{s.avg_return_72h != null ? ((s.avg_return_72h * 100).toFixed(2) + '%') : '—'}</strong></div>
          <div class="ds"><span>Hit Rate</span><strong>{s.hit_rate != null ? ((s.hit_rate * 100).toFixed(1) + '%') : '—'}</strong></div>
        </div>
        {#if s.insufficient_data}
          <p class="drill-warn">Insufficient signals (n={s.n_signals}) — low statistical confidence</p>
        {/if}
      {:else}
        <p class="drill-loading">Loading…</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .strategies-page {
    padding: 24px 32px;
    max-width: 1200px;
    margin: 0 auto;
  }
  .page-header {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .page-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--g9, #f0f0f0);
    margin: 0;
  }
  .page-sub {
    font-size: 11px;
    color: var(--g5, #666);
    margin: 0;
  }
  .benchmark-link {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--g6, #888);
    text-decoration: none;
    border: 1px solid var(--g3, #2a2a2a);
    padding: 4px 10px;
    border-radius: 5px;
    transition: color 0.12s, border-color 0.12s;
  }
  .benchmark-link:hover { color: var(--g9, #f0f0f0); border-color: var(--g5, #555); }
  .page-error, .loading-state {
    font-size: 12px;
    color: var(--g5, #666);
    padding: 40px 0;
    text-align: center;
  }
  .page-error { color: var(--sc-red, #e05c5c); }

  /* Drill panel */
  .drill-backdrop {
    position: fixed; inset: 0; z-index: 400;
    background: rgba(0,0,0,0.5);
  }
  .drill-panel {
    position: fixed;
    right: 0; top: 0; bottom: 0;
    width: 320px;
    z-index: 401;
    background: var(--g1, #111);
    border-left: 1px solid var(--g3, #2a2a2a);
    padding: 24px 20px;
    overflow-y: auto;
    animation: slideIn 0.18s ease;
  }
  @keyframes slideIn {
    from { transform: translateX(100%); }
    to   { transform: translateX(0); }
  }
  .drill-close {
    position: absolute; top: 12px; right: 16px;
    width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    background: var(--g2, #1a1a1a);
    border: 1px solid var(--g3, #2a2a2a);
    border-radius: 4px;
    color: var(--g6, #888);
    font-size: 16px;
    cursor: pointer;
  }
  .drill-title {
    font-size: 13px; font-weight: 600;
    color: var(--g9, #f0f0f0);
    margin: 0 0 16px;
    padding-right: 36px;
    word-break: break-all;
  }
  .drill-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .ds { display: flex; flex-direction: column; gap: 2px; }
  .ds span { font-size: var(--ui-text-xs); color: var(--g5, #666); text-transform: uppercase; }
  .ds strong { font-size: 14px; font-weight: 700; color: var(--g9, #f0f0f0); font-variant-numeric: tabular-nums; }
  .drill-warn {
    margin-top: 12px;
    font-size: 11px; color: var(--g5, #888);
    background: var(--g2, #1a1a1a);
    border: 1px solid var(--g3, #2a2a2a);
    border-radius: 4px;
    padding: 8px 10px;
  }
  .drill-loading { font-size: 12px; color: var(--g5, #666); }
</style>
