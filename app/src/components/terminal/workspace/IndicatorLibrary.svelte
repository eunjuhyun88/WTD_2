<script lang="ts">
  import {
    searchIndicators,
    CATEGORIES,
    INDICATOR_REGISTRY,
    type IndicatorDef,
    type FilterMode,
    type IndicatorCategory,
  } from '$lib/indicators/indicatorRegistry';
  import { addIndicator, removeIndicator, chartIndicators, type IndicatorKey } from '$lib/stores/chartIndicators';

  interface Props {
    open?: boolean;
    onClose?: () => void;
    onExternalOpen?: (url: string, label: string) => void;
  }

  let {
    open = false,
    onClose,
    onExternalOpen,
  }: Props = $props();

  let query = $state('');
  let filter = $state<FilterMode>('popular');
  let hoveredId = $state<string | null>(null);

  const results = $derived(searchIndicators(query, filter, 100));

  // Group results by category when no query
  const grouped = $derived(
    (() => {
      if (query.trim()) return null;
      const g: Record<string, IndicatorDef[]> = {};
      for (const cat of CATEGORIES) g[cat.key] = [];
      for (const item of results) g[item.category].push(item);
      return g;
    })(),
  );

  const totalCount = $derived(INDICATOR_REGISTRY.length);
  const engineCount = $derived(INDICATOR_REGISTRY.filter((i) => i.tier === 'A').length);

  function handleIndicatorClick(ind: IndicatorDef) {
    if (ind.tier === 'A' && ind.engineKey) {
      const key = ind.engineKey as IndicatorKey;
      const active = $chartIndicators[key];
      if (active) removeIndicator(key);
      else addIndicator(key);
    } else if (ind.externalUrl) {
      if (onExternalOpen) {
        onExternalOpen(ind.externalUrl, ind.externalLabel ?? ind.name);
      } else {
        window.open(ind.externalUrl, '_blank', 'noopener');
      }
    }
  }

  function isActive(ind: IndicatorDef): boolean {
    if (ind.tier === 'A' && ind.engineKey) {
      return $chartIndicators[ind.engineKey as IndicatorKey] ?? false;
    }
    return false;
  }

  function tierBadge(tier: 'A' | 'B' | 'C') {
    if (tier === 'A') return { label: 'LIVE', cls: 'tier-a' };
    if (tier === 'B') return { label: 'SOON', cls: 'tier-b' };
    return { label: 'LINK', cls: 'tier-c' };
  }

  function catIcon(cat: string) {
    return CATEGORIES.find((c) => c.key === cat)?.icon ?? '·';
  }

  function popularDots(n: number) {
    return '●'.repeat(n) + '○'.repeat(5 - n);
  }
</script>

{#if open}
  <!-- Backdrop -->
  <div class="lib-backdrop" onclick={onClose} role="presentation"></div>

  <aside class="lib-panel">
    <!-- Header -->
    <div class="lib-header">
      <span class="lib-title">Indicator Library</span>
      <span class="lib-count">{totalCount} indicators · {engineCount} live in chart</span>
      <button class="lib-close" onclick={onClose} aria-label="Close">✕</button>
    </div>

    <!-- Search + Filter -->
    <div class="lib-controls">
      <div class="lib-search-wrap">
        <span class="lib-search-icon">⌕</span>
        <input
          class="lib-search"
          type="text"
          placeholder="Search: MVRV, Funding, TVL, RSI…"
          bind:value={query}

        />
        {#if query}
          <button class="lib-clear" onclick={() => query = ''}>✕</button>
        {/if}
      </div>

      <div class="lib-filters">
        <button
          class="lib-filter-btn"
          class:active={filter === 'popular'}
          onclick={() => filter = 'popular'}
        >⭐ Popular</button>
        <button
          class="lib-filter-btn"
          class:active={filter === 'tier_a'}
          onclick={() => filter = 'tier_a'}
        >⚡ In Chart</button>
        {#each CATEGORIES as cat}
          <button
            class="lib-filter-btn"
            class:active={filter === cat.key as FilterMode}
            onclick={() => filter = cat.key as FilterMode}
          >{cat.icon} {cat.label}</button>
        {/each}
        <button
          class="lib-filter-btn"
          class:active={filter === 'all'}
          onclick={() => filter = 'all'}
        >All {totalCount}</button>
      </div>
    </div>

    <!-- Results -->
    <div class="lib-results">
      {#if query.trim() || !grouped}
        <!-- Flat list when searching -->
        {#if results.length === 0}
          <div class="lib-empty">
            <span class="lib-empty-icon">◈</span>
            <p>No indicators found for "{query}"</p>
          </div>
        {:else}
          <div class="lib-flat-count">{results.length} results</div>
          {#each results as ind (ind.id)}
            {@const badge = tierBadge(ind.tier)}
            {@const active = isActive(ind)}
            <button
              class="ind-row"
              class:active
              class:hovered={hoveredId === ind.id}
              onmouseenter={() => hoveredId = ind.id}
              onmouseleave={() => hoveredId = null}
              onclick={() => handleIndicatorClick(ind)}
            >
              <span class="ind-cat-icon">{catIcon(ind.category)}</span>
              <div class="ind-info">
                <div class="ind-name-row">
                  <span class="ind-name">{ind.name}</span>
                  <span class="ind-badge {badge.cls}">{badge.label}</span>
                  {#if ind.externalLabel && ind.tier !== 'A'}
                    <span class="ind-source">{ind.externalLabel}</span>
                  {/if}
                </div>
                <div class="ind-desc">{ind.description}</div>
                {#if hoveredId === ind.id && ind.why}
                  <div class="ind-why">{ind.why}</div>
                {/if}
              </div>
              <div class="ind-meta">
                <span class="ind-pop" title="Popularity">{popularDots(ind.popularity)}</span>
                {#if active}
                  <span class="ind-active-dot">●</span>
                {/if}
              </div>
            </button>
          {/each}
        {/if}

      {:else}
        <!-- Grouped by category -->
        {#each CATEGORIES as cat}
          {@const catItems = grouped?.[cat.key] ?? []}
          {#if catItems.length > 0}
            <div class="lib-group">
              <div class="lib-group-head">
                <span class="lib-group-icon">{cat.icon}</span>
                <span class="lib-group-label">{cat.label}</span>
                <span class="lib-group-count">{catItems.length}</span>
              </div>
              {#each catItems as ind (ind.id)}
                {@const badge = tierBadge(ind.tier)}
                {@const active = isActive(ind)}
                <button
                  class="ind-row"
                  class:active
                  class:hovered={hoveredId === ind.id}
                  onmouseenter={() => hoveredId = ind.id}
                  onmouseleave={() => hoveredId = null}
                  onclick={() => handleIndicatorClick(ind)}
                >
                  <div class="ind-info">
                    <div class="ind-name-row">
                      <span class="ind-name">{ind.shortName}</span>
                      <span class="ind-badge {badge.cls}">{badge.label}</span>
                      {#if ind.externalLabel && ind.tier !== 'A'}
                        <span class="ind-source">{ind.externalLabel}</span>
                      {/if}
                    </div>
                    {#if hoveredId === ind.id}
                      <div class="ind-desc">{ind.description}</div>
                      {#if ind.why}
                        <div class="ind-why">{ind.why}</div>
                      {/if}
                      {#if ind.signal}
                        <div class="ind-signal-row">
                          <span class="sig-bull">▲ {ind.signal.bullish}</span>
                          <span class="sig-bear">▼ {ind.signal.bearish}</span>
                        </div>
                      {/if}
                    {/if}
                  </div>
                  <div class="ind-meta">
                    <span class="ind-pop">{popularDots(ind.popularity)}</span>
                    {#if active}
                      <span class="ind-active-dot">●</span>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        {/each}
      {/if}
    </div>

    <!-- Footer: legend -->
    <div class="lib-footer">
      <span class="leg-item"><span class="ind-badge tier-a">LIVE</span> Add to chart instantly</span>
      <span class="leg-item"><span class="ind-badge tier-b">SOON</span> Backend expansion planned</span>
      <span class="leg-item"><span class="ind-badge tier-c">LINK</span> Open external platform</span>
    </div>
  </aside>
{/if}

<style>
  /* ── Backdrop ── */
  .lib-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.45);
    z-index: 800;
  }

  /* ── Panel ── */
  .lib-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 480px;
    max-width: 100vw;
    z-index: 801;
    background: var(--tv-bg-0, #0b0e11);
    border-left: 1px solid rgba(255,255,255,0.07);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: -8px 0 32px rgba(0,0,0,0.5);
  }

  /* ── Header ── */
  .lib-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    flex-shrink: 0;
    background: rgba(255,255,255,0.02);
  }
  .lib-title {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.85);
  }
  .lib-count {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(255,255,255,0.30);
  }
  .lib-close {
    margin-left: auto;
    background: none;
    border: 1px solid rgba(255,255,255,0.10);
    color: rgba(255,255,255,0.45);
    border-radius: 4px;
    width: 26px;
    height: 26px;
    cursor: pointer;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.08s;
  }
  .lib-close:hover { color: rgba(255,255,255,0.85); border-color: rgba(255,255,255,0.22); }

  /* ── Controls ── */
  .lib-controls {
    flex-shrink: 0;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.01);
  }
  .lib-search-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .lib-search-icon {
    font-size: 14px;
    color: rgba(255,255,255,0.28);
    flex-shrink: 0;
  }
  .lib-search {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    font-size: 13px;
    color: rgba(255,255,255,0.85);
    font-family: var(--sc-font-body, sans-serif);
  }
  .lib-search::placeholder { color: rgba(255,255,255,0.22); }
  .lib-clear {
    background: none;
    border: none;
    color: rgba(255,255,255,0.30);
    cursor: pointer;
    font-size: 11px;
    padding: 2px;
  }

  .lib-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 12px 8px;
  }
  .lib-filter-btn {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 3px 8px;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.02);
    color: rgba(255,255,255,0.40);
    cursor: pointer;
    transition: all 0.07s;
    white-space: nowrap;
  }
  .lib-filter-btn:hover { color: rgba(255,255,255,0.72); border-color: rgba(255,255,255,0.16); }
  .lib-filter-btn.active {
    background: rgba(75,158,253,0.12);
    border-color: rgba(75,158,253,0.30);
    color: #4b9efd;
  }

  /* ── Results ── */
  .lib-results {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .lib-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 48px 24px;
    color: rgba(255,255,255,0.30);
  }
  .lib-empty-icon { font-size: 28px; }
  .lib-empty p { font-family: var(--sc-font-mono, monospace); font-size: 11px; }

  .lib-flat-count {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.25);
    padding: 6px 12px 2px;
  }

  /* ── Group ── */
  .lib-group {
    border-bottom: 1px solid rgba(255,255,255,0.04);
    margin-bottom: 2px;
  }
  .lib-group-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px 4px;
    position: sticky;
    top: 0;
    background: var(--tv-bg-0, #0b0e11);
    z-index: 1;
  }
  .lib-group-icon { font-size: 12px; }
  .lib-group-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.35);
  }
  .lib-group-count {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    color: rgba(255,255,255,0.20);
    margin-left: auto;
  }

  /* ── Indicator Row ── */
  .ind-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
    padding: 7px 12px;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    text-align: left;
    cursor: pointer;
    transition: background 0.07s;
  }
  .ind-row:hover, .ind-row.hovered {
    background: rgba(255,255,255,0.04);
  }
  .ind-row.active {
    background: rgba(75,158,253,0.07);
    border-left: 2px solid rgba(75,158,253,0.45);
  }

  .ind-cat-icon {
    font-size: 12px;
    flex-shrink: 0;
    margin-top: 1px;
    width: 16px;
  }

  .ind-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .ind-name-row {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }
  .ind-name {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    color: rgba(255,255,255,0.82);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
  }

  .ind-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 0.08em;
    padding: 1px 5px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .tier-a { background: rgba(34,171,148,0.16); color: #22ab94; border: 1px solid rgba(34,171,148,0.30); }
  .tier-b { background: rgba(239,192,80,0.12); color: #efc050; border: 1px solid rgba(239,192,80,0.25); }
  .tier-c { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.40); border: 1px solid rgba(255,255,255,0.10); }

  .ind-source {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    color: rgba(255,255,255,0.22);
    border: 1px solid rgba(255,255,255,0.07);
    padding: 1px 4px;
    border-radius: 2px;
  }

  .ind-desc {
    font-size: 10px;
    color: rgba(255,255,255,0.42);
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ind-row.hovered .ind-desc { white-space: normal; }

  .ind-why {
    font-size: 10px;
    color: rgba(255,255,255,0.55);
    line-height: 1.4;
    font-style: italic;
    margin-top: 2px;
    border-left: 2px solid rgba(75,158,253,0.25);
    padding-left: 6px;
  }

  .ind-signal-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 3px;
  }
  .sig-bull {
    font-size: 9px;
    color: rgba(34,171,148,0.80);
    font-family: var(--sc-font-mono, monospace);
  }
  .sig-bear {
    font-size: 9px;
    color: rgba(242,54,69,0.80);
    font-family: var(--sc-font-mono, monospace);
  }

  .ind-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    flex-shrink: 0;
  }
  .ind-pop {
    font-size: 7px;
    letter-spacing: 1px;
    color: rgba(255,255,255,0.18);
    white-space: nowrap;
  }
  .ind-active-dot {
    font-size: 7px;
    color: #4b9efd;
    animation: lib-pulse 1.5s ease-in-out infinite;
  }

  /* ── Footer ── */
  .lib-footer {
    flex-shrink: 0;
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    padding: 7px 14px;
    border-top: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.015);
  }
  .leg-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 9px;
    color: rgba(255,255,255,0.30);
    font-family: var(--sc-font-mono, monospace);
  }

  @keyframes lib-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

  @media (max-width: 640px) {
    .lib-panel { width: 100vw; }
  }
</style>
