<script lang="ts">
  import type { PatternBacktestStats, PatternObjectRow } from '$lib/api/strategyBackend';
  import PatternStrategyCard from './PatternStrategyCard.svelte';

  interface Props {
    patterns: PatternObjectRow[];
    statsMap: Map<string, PatternBacktestStats>;
    loadingSet: Set<string>;
    sort?: 'sharpe' | 'apr' | 'win_rate' | 'n_signals';
    onCardClick?: (slug: string) => void;
    freeLimit?: number;
  }

  let {
    patterns,
    statsMap,
    loadingSet,
    sort = 'sharpe',
    onCardClick,
    freeLimit = 10,
  }: Props = $props();

  function sortVal(slug: string): number {
    const s = statsMap.get(slug);
    if (!s) return -Infinity;
    if (sort === 'sharpe') return s.sharpe ?? -Infinity;
    if (sort === 'apr') return s.apr ?? -Infinity;
    if (sort === 'win_rate') return s.win_rate ?? -Infinity;
    return s.n_signals;
  }

  const sorted = $derived(
    [...patterns].sort((a, b) => sortVal(b.slug) - sortVal(a.slug)),
  );

  const sorts: { key: typeof sort; label: string }[] = [
    { key: 'sharpe', label: 'Sharpe' },
    { key: 'apr', label: 'APR' },
    { key: 'win_rate', label: 'Win Rate' },
    { key: 'n_signals', label: 'Signals' },
  ];
</script>

<div class="strategy-grid-wrap">
  <div class="grid-controls">
    <span class="grid-count">{patterns.length} patterns</span>
    <div class="sort-tabs">
      {#each sorts as s}
        <button
          class="sort-tab"
          class:active={sort === s.key}
          onclick={() => (sort = s.key)}
          type="button"
        >{s.label}</button>
      {/each}
    </div>
  </div>

  <div class="strategy-grid">
    {#each sorted as p, i}
      <PatternStrategyCard
        pattern={p}
        stats={statsMap.get(p.slug) ?? null}
        loading={loadingSet.has(p.slug)}
        locked={i >= freeLimit}
        onclick={() => onCardClick?.(p.slug)}
      />
    {/each}
  </div>
</div>

<style>
  .strategy-grid-wrap { display: flex; flex-direction: column; gap: 12px; }
  .grid-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .grid-count { font-size: 11px; color: var(--g5, #666); }
  .sort-tabs { display: flex; gap: 2px; }
  .sort-tab {
    padding: 3px 8px;
    font-size: var(--ui-text-xs);
    color: var(--g6, #888);
    background: var(--g1, #111);
    border: 1px solid var(--g3, #2a2a2a);
    border-radius: 4px;
    cursor: pointer;
    transition: color 0.12s, background 0.12s;
  }
  .sort-tab:hover { color: var(--g8, #ccc); background: var(--g2, #181818); }
  .sort-tab.active { color: var(--g9, #f0f0f0); background: var(--g2, #181818); border-color: var(--g5, #555); }
  .strategy-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
  }
</style>
