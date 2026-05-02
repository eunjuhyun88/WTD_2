<script lang="ts">
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';

  interface Props {
    records: PatternCaptureRecord[];
    loading: boolean;
    loaded: boolean;
    filter: string;
    verdictFilter: 'all' | 'bullish' | 'bearish';
    selectedIdx: number;
    onFilterChange: (v: string) => void;
    onVerdictFilterChange: (v: 'all' | 'bullish' | 'bearish') => void;
    onSelectCapture: (r: PatternCaptureRecord, idx: number) => void;
    onOpenLibrary: () => void;
  }

  let {
    records,
    loading,
    loaded,
    filter,
    verdictFilter,
    selectedIdx,
    onFilterChange,
    onVerdictFilterChange,
    onSelectCapture,
    onOpenLibrary,
  }: Props = $props();

  const filteredPatterns = $derived.by(() => {
    let list = records;
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(r =>
        r.symbol.toLowerCase().includes(q) ||
        (r.patternSlug ?? '').toLowerCase().includes(q),
      );
    }
    if (verdictFilter !== 'all') {
      list = list.filter(r => r.decision.verdict === verdictFilter);
    }
    return list;
  });

  function handlePatternKey(e: KeyboardEvent) {
    const len = filteredPatterns.length;
    if (!len) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      onSelectCapture(filteredPatterns[Math.min(selectedIdx + 1, len - 1)], Math.min(selectedIdx + 1, len - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onSelectCapture(filteredPatterns[Math.max(selectedIdx - 1, 0)], Math.max(selectedIdx - 1, 0));
    } else if (e.key === 'Enter' && selectedIdx >= 0) {
      e.preventDefault();
      onSelectCapture(filteredPatterns[selectedIdx], selectedIdx);
    }
  }
</script>

<div class="tab-inner">
  <div class="pat-search-row">
    <input
      class="pat-search"
      placeholder="filter symbol / pattern…"
      value={filter}
      oninput={(e) => onFilterChange((e.currentTarget as HTMLInputElement).value)}
      onkeydown={handlePatternKey}
    />
    <div class="pat-chips">
      <button
        class="pat-chip"
        class:active={verdictFilter === 'all'}
        onclick={() => onVerdictFilterChange('all')}
      >ALL</button>
      <button
        class="pat-chip chip-pos"
        class:active={verdictFilter === 'bullish'}
        onclick={() => onVerdictFilterChange('bullish')}
      >BULL</button>
      <button
        class="pat-chip chip-neg"
        class:active={verdictFilter === 'bearish'}
        onclick={() => onVerdictFilterChange('bearish')}
      >BEAR</button>
    </div>
  </div>
  <div class="pat-list" role="listbox" aria-label="Pattern captures">
    {#if loading}
      <div class="pat-skeleton-list" aria-hidden="true">
        {#each [80, 60, 72] as w}
          <div class="pat-skel-row">
            <span class="skel-block" style="width:{w}px"></span>
            <span class="skel-block" style="width:28px"></span>
            <span class="skel-block" style="width:52px"></span>
            <span class="skel-block" style="width:32px"></span>
          </div>
        {/each}
      </div>
    {:else if filteredPatterns.length === 0}
      <span class="pat-empty">{loaded ? 'no patterns' : 'no data'}</span>
    {:else}
      {#each filteredPatterns as r, i}
        <button
          class="pat-row"
          class:selected={selectedIdx === i}
          role="option"
          aria-selected={selectedIdx === i}
          onclick={() => onSelectCapture(r, i)}
        >
          <span class="pat-sym">{r.symbol.replace('USDT', '')}</span>
          <span class="pat-tf">{r.timeframe.toUpperCase()}</span>
          <span class="pat-slug">{r.patternSlug ? r.patternSlug.replace(/_/g, ' ').slice(0, 14) : ''}</span>
          <span
            class="pat-verdict"
            class:pos={r.decision.verdict === 'bullish'}
            class:neg={r.decision.verdict === 'bearish'}
          >
            {r.decision.verdict ? r.decision.verdict.slice(0, 4).toUpperCase() : '——'}
          </span>
        </button>
      {/each}
    {/if}
  </div>
  <div class="more-btn">
    <button onclick={onOpenLibrary}>Library →</button>
  </div>
</div>

<style>
  .tab-inner {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .pat-search-row {
    padding: 6px 8px;
    border-bottom: 1px solid var(--g3, #1c1918);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .pat-search {
    width: 100%;
    background: var(--g2, #131110);
    border: 1px solid var(--g4, #272320);
    border-radius: 2px;
    color: var(--g8, #cec9c4);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    padding: 3px 6px;
    outline: none;
    box-sizing: border-box;
  }
  .pat-search:focus { border-color: var(--g6, #5a534c); }
  .pat-chips { display: flex; gap: 4px; }
  .pat-chip {
    height: 18px;
    padding: 0 6px;
    border: 1px solid var(--g4, #272320);
    border-radius: 2px;
    background: transparent;
    color: var(--g5, #3d3830);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: color 0.07s, border-color 0.07s, background 0.07s;
  }
  .pat-chip:hover { color: var(--g7, #9d9690); border-color: var(--g5, #3d3830); }
  .pat-chip.active { color: var(--g9, #eceae8); border-color: var(--g6, #5a534c); background: var(--g2, #131110); }
  .pat-chip.chip-pos.active { color: var(--pos, #4ade80); border-color: var(--pos, #4ade80); }
  .pat-chip.chip-neg.active { color: var(--neg, #f87171); border-color: var(--neg, #f87171); }
  .pat-list {
    flex: 1;
    overflow-y: auto;
    padding: 2px 0;
  }
  .pat-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--g2, #131110);
    border-left: 2px solid transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.06s, border-color 0.06s;
  }
  .pat-row:hover { background: var(--g2, #131110); }
  .pat-row.selected { background: var(--g2, #131110); border-left-color: var(--amb, #f5a623); }
  .pat-sym { font-family: 'JetBrains Mono', monospace; font-size: var(--ui-text-xs); font-weight: 700; color: var(--g9, #eceae8); min-width: 40px; }
  .pat-tf { font-family: 'JetBrains Mono', monospace; font-size: var(--ui-text-xs); color: var(--g5, #3d3830); min-width: 24px; }
  .pat-slug { font-family: 'JetBrains Mono', monospace; font-size: var(--ui-text-xs); color: var(--g4, #272320); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pat-verdict { font-family: 'JetBrains Mono', monospace; font-size: var(--ui-text-xs); color: var(--g5, #3d3830); flex-shrink: 0; }
  .pat-verdict.pos { color: var(--pos, #4ade80); }
  .pat-verdict.neg { color: var(--neg, #f87171); }
  .pat-empty { display: block; padding: 20px 12px; font-family: 'JetBrains Mono', monospace; font-size: var(--ui-text-xs); color: var(--g4, #272320); text-align: center; }

  .pat-skeleton-list { display: flex; flex-direction: column; gap: 1px; padding: 4px 0; }
  .pat-skel-row {
    display: flex; align-items: center; gap: 8px;
    height: 30px; padding: 0 10px;
    border-left: 2px solid var(--g3, #1e1c1a);
  }
  .skel-block {
    height: 8px; border-radius: 3px;
    background: linear-gradient(90deg, var(--g2, #131110) 25%, var(--g3, #1e1c1a) 50%, var(--g2, #131110) 75%);
    background-size: 200% 100%;
    animation: skel-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes skel-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .more-btn {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 6px 10px;
    border-top: 1px solid var(--g3, #1c1918);
    flex-shrink: 0;
  }
  .more-btn button {
    padding: 3px 8px;
    background: transparent;
    border: 1px solid var(--g4, #272320);
    border-radius: 2px;
    color: var(--g5, #3d3830);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    cursor: pointer;
    transition: color 0.07s, border-color 0.07s;
  }
  .more-btn button:hover { color: var(--g7, #9d9690); border-color: var(--g5, #3d3830); }
</style>
