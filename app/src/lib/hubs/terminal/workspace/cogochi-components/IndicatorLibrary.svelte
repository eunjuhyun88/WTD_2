<script lang="ts">
  /**
   * IndicatorLibrary — TV-style 좌측 슬라이드 drawer
   * 70+ indicator 검색 + 카테고리 필터 + add/pin 기능
   */
  import { INDICATOR_REGISTRY, type IndicatorDef, type IndicatorCategory } from '$lib/indicators/indicatorRegistry';

  type Category = IndicatorCategory | 'all';

  interface Props {
    onAddIndicator?: (indicator: IndicatorDef) => void;
  }

  let { onAddIndicator } = $props();

  let searchQuery = $state('');
  let selectedCategory: Category = $state('all');
  let pinnedIds = $state<Set<string>>(new Set());

  const categories: { value: Category; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'onchain', label: 'OnChain' },
    { value: 'derivatives', label: 'Derivatives' },
    { value: 'defi', label: 'DeFi' },
    { value: 'technical', label: 'Technical' },
    { value: 'sentiment', label: 'Sentiment' },
    { value: 'macro', label: 'Macro' },
  ];

  let filteredIndicators = $derived.by(() => {
    let result = INDICATOR_REGISTRY;

    // Category filter
    if (selectedCategory !== 'all') {
      result = result.filter((ind) => ind.category === selectedCategory);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (ind) =>
          ind.name.toLowerCase().includes(q) ||
          ind.shortName.toLowerCase().includes(q) ||
          ind.description.toLowerCase().includes(q) ||
          ind.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    // Sort: pinned first, then by popularity
    return result.sort((a, b) => {
      const aPinned = pinnedIds.has(a.id) ? 0 : 1;
      const bPinned = pinnedIds.has(b.id) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;
      return b.popularity - a.popularity;
    });
  });

  function togglePin(id: string) {
    pinnedIds.has(id) ? pinnedIds.delete(id) : pinnedIds.add(id);
  }

  function handleAddIndicator(indicator: IndicatorDef) {
    if (onAddIndicator) {
      onAddIndicator(indicator);
    }
  }
</script>

<div class="indicator-library">
  <div class="library-header">
    <h3>Indicators</h3>
    <span class="result-count">{filteredIndicators.length}</span>
  </div>

  <!-- Search -->
  <input
    type="text"
    class="search-input"
    placeholder="Search indicators…"
    bind:value={searchQuery}
  />

  <!-- Category tabs -->
  <div class="category-tabs">
    {#each categories as cat}
      <button
        class="cat-tab"
        class:active={selectedCategory === cat.value}
        onclick={() => {
          selectedCategory = cat.value;
        }}
      >
        {cat.label}
      </button>
    {/each}
  </div>

  <!-- Indicator list -->
  <div class="indicator-list">
    {#if filteredIndicators.length === 0}
      <div class="empty-state">No indicators found</div>
    {:else}
      {#each filteredIndicators as indicator (indicator.id)}
        <div class="indicator-item">
          <div class="item-header">
            <div class="item-title">
              <span class="name">{indicator.shortName}</span>
              <span class="tier-badge" class:tier-a={indicator.tier === 'A'} class:tier-b={indicator.tier === 'B'}>
                {indicator.tier}
              </span>
            </div>
            <button
              class="pin-btn"
              class:pinned={pinnedIds.has(indicator.id)}
              onclick={() => togglePin(indicator.id)}
              title={pinnedIds.has(indicator.id) ? 'Unpin' : 'Pin'}
            >
              📌
            </button>
          </div>

          <div class="item-meta">
            <span class="category-badge">{indicator.category}</span>
            {#if indicator.tags.length > 0}
              <span class="tags">{indicator.tags.slice(0, 2).join(', ')}</span>
            {/if}
          </div>

          <p class="item-desc">{indicator.why}</p>

          <button
            class="add-btn"
            onclick={() => handleAddIndicator(indicator)}
            disabled={indicator.tier === 'C'}
          >
            {#if indicator.tier === 'C'}
              Open ↗
            {:else}
              + Add
            {/if}
          </button>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .indicator-library {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--g1);
    border-right: 1px solid var(--g3);
    font-family: var(--font-mono, monospace);
    overflow: hidden;
  }

  .library-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid var(--g3);
  }

  .library-header h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--g9);
  }

  .result-count {
    font-size: var(--ui-text-xs);
    color: var(--g6);
  }

  .search-input {
    padding: 8px 12px;
    margin: 8px;
    background: var(--g0);
    border: 1px solid var(--g3);
    border-radius: 4px;
    font-family: inherit;
    font-size: 11px;
    color: var(--g9);
  }

  .search-input::placeholder {
    color: var(--g6);
  }

  .category-tabs {
    display: flex;
    gap: 4px;
    padding: 8px;
    border-bottom: 1px solid var(--g3);
    overflow-x: auto;
    white-space: nowrap;
  }

  .cat-tab {
    padding: 4px 8px;
    background: transparent;
    border: 1px solid var(--g3);
    border-radius: 3px;
    font-size: var(--ui-text-xs);
    color: var(--g6);
    cursor: pointer;
    transition: all 0.2s;
  }

  .cat-tab:hover {
    border-color: var(--g5);
    color: var(--g8);
  }

  .cat-tab.active {
    background: var(--g3);
    border-color: var(--primary);
    color: var(--primary);
  }

  .indicator-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }

  .empty-state {
    padding: 24px 12px;
    text-align: center;
    color: var(--g6);
    font-size: 11px;
  }

  .indicator-item {
    padding: 8px;
    margin-bottom: 4px;
    background: var(--g0);
    border: 1px solid var(--g3);
    border-radius: 4px;
    transition: all 0.2s;
  }

  .indicator-item:hover {
    background: var(--g1);
    border-color: var(--g4);
  }

  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 4px;
  }

  .item-title {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .name {
    font-size: 11px;
    font-weight: 600;
    color: var(--g9);
  }

  .tier-badge {
    padding: 2px 4px;
    background: var(--g3);
    border-radius: 2px;
    font-size: var(--ui-text-xs);
    color: var(--g7);
  }

  .tier-badge.tier-a {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .tier-badge.tier-b {
    background: rgba(250, 204, 21, 0.2);
    color: #facc15;
  }

  .pin-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.5;
    transition: opacity 0.2s;
  }

  .pin-btn:hover {
    opacity: 0.8;
  }

  .pin-btn.pinned {
    opacity: 1;
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    font-size: var(--ui-text-xs);
  }

  .category-badge {
    padding: 2px 6px;
    background: var(--g2);
    border-radius: 2px;
    color: var(--g7);
  }

  .tags {
    color: var(--g6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-desc {
    margin: 0 0 6px;
    font-size: var(--ui-text-xs);
    line-height: 1.3;
    color: var(--g7);
  }

  .add-btn {
    width: 100%;
    padding: 4px;
    background: var(--primary);
    color: var(--g0);
    border: none;
    border-radius: 3px;
    font-size: var(--ui-text-xs);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-btn:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
