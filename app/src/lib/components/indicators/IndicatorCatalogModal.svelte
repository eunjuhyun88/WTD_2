<script lang="ts">
  import { onMount } from 'svelte';
  import { INDICATOR_REGISTRY } from '$lib/indicators/registry';
  import { catalogSearch, initCatalogSearch } from '$lib/indicators/catalogSearch';
  import { indicatorInstances } from '$lib/chart/indicatorInstances.svelte';
  import type { IndicatorDef } from '$lib/indicators/types';

  interface Props {
    open?: boolean;
    onClose?: () => void;
    onAdd?: (defId: string, engineKey: string, params: Record<string, number | string | boolean>) => void;
  }

  let { open = false, onClose, onAdd }: Props = $props();

  let query = $state('');
  let inputEl: HTMLInputElement | undefined = $state();
  let backdropEl: HTMLDivElement | undefined = $state();

  const allDefs = Object.values(INDICATOR_REGISTRY);
  const taDefs = allDefs.filter(d => d.category === 'TA');
  const marketDefs = allDefs.filter(d => !d.category || d.category === 'MarketData');

  let results = $derived.by(() => {
    if (!query.trim()) return allDefs;
    return catalogSearch(query, allDefs);
  });

  $effect(() => {
    if (open) {
      // Focus search on open
      setTimeout(() => inputEl?.focus(), 50);
      // Init Fuse.js lazy load
      initCatalogSearch(allDefs);
    } else {
      query = '';
    }
  });

  function close() {
    onClose?.();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === backdropEl) close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function defaultParamsFor(def: IndicatorDef): Record<string, number | string | boolean> {
    if (!def.paramSchema) return {};
    return Object.fromEntries(
      Object.entries(def.paramSchema).map(([k, v]) => [k, v.default])
    );
  }

  function addIndicator(def: IndicatorDef) {
    if (!def.engineKey) return;
    const params = defaultParamsFor(def);
    const instanceId = indicatorInstances.add(def.id, def.engineKey, params);
    onAdd?.(def.id, def.engineKey, params);
    close();
  }

  function countActive(def: IndicatorDef): number {
    return indicatorInstances.countByDef(def.id);
  }

  onMount(() => {
    initCatalogSearch(allDefs);
  });
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="catalog-backdrop"
    role="presentation"
    bind:this={backdropEl}
    onclick={handleBackdrop}
  >
    <div
      class="catalog-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Indicator catalog"
    >
      <div class="catalog-header">
        <span class="catalog-title">Indicators</span>
        <button class="catalog-close" onclick={close} aria-label="Close">✕</button>
      </div>

      <div class="catalog-search">
        <input
          bind:this={inputEl}
          bind:value={query}
          type="search"
          placeholder="Search… (rsi, 볼린저, macd)"
          class="catalog-input"
          autocomplete="off"
        />
      </div>

      <div class="catalog-body">
        {#if results.length === 0}
          <p class="catalog-empty">No results for "{query}"</p>
        {:else if query.trim()}
          <div class="catalog-section">
            <div class="catalog-grid">
              {#each results as def}
                <button
                  class="catalog-item"
                  onclick={() => addIndicator(def)}
                  disabled={!def.engineKey}
                  title={def.description}
                >
                  <div class="item-top">
                    <span class="item-label">{def.label ?? def.id}</span>
                    {#if countActive(def) > 0}
                      <span class="item-badge">{countActive(def)}</span>
                    {/if}
                  </div>
                  {#if def.description}
                    <p class="item-desc">{def.description}</p>
                  {/if}
                  {#if !def.engineKey}
                    <span class="item-unavail">Engine only</span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {:else}
          <!-- Ungrouped: TA first, then market data -->
          {#if taDefs.length > 0}
            <div class="catalog-section">
              <h3 class="section-title">Technical Analysis</h3>
              <div class="catalog-grid">
                {#each taDefs as def}
                  <button
                    class="catalog-item"
                    onclick={() => addIndicator(def)}
                    title={def.description}
                  >
                    <div class="item-top">
                      <span class="item-label">{def.label ?? def.id}</span>
                      {#if countActive(def) > 0}
                        <span class="item-badge">{countActive(def)}</span>
                      {/if}
                    </div>
                    {#if def.paramSchema}
                      <p class="item-params">
                        {Object.entries(def.paramSchema)
                          .map(([k, v]) => `${v.label ?? k}: ${v.default}`)
                          .join(' · ')}
                      </p>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          {#if marketDefs.length > 0}
            <div class="catalog-section">
              <h3 class="section-title">Market Data</h3>
              <div class="catalog-grid">
                {#each marketDefs as def}
                  <button
                    class="catalog-item catalog-item--market"
                    onclick={() => addIndicator(def)}
                    disabled={!def.engineKey}
                    title={def.description}
                  >
                    <div class="item-top">
                      <span class="item-label">{def.label ?? def.id}</span>
                    </div>
                    {#if def.description}
                      <p class="item-desc">{def.description.slice(0, 60)}{def.description.length > 60 ? '…' : ''}</p>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .catalog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 9000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 80px;
  }

  .catalog-modal {
    width: 100%;
    max-width: 560px;
    max-height: calc(100dvh - 120px);
    background: #111;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: 'JetBrains Mono', monospace;
  }

  .catalog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .catalog-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.4);
  }

  .catalog-close {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.35);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 4px;
    line-height: 1;
  }
  .catalog-close:hover { color: rgba(255, 255, 255, 0.75); }

  .catalog-search {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .catalog-input {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.85);
    font-family: inherit;
    font-size: 0.85rem;
    padding: 8px 10px;
    outline: none;
    box-sizing: border-box;
  }
  .catalog-input:focus { border-color: rgba(245, 166, 35, 0.4); }
  .catalog-input::placeholder { color: rgba(255, 255, 255, 0.25); }

  .catalog-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }

  .catalog-empty {
    color: rgba(255, 255, 255, 0.35);
    font-size: 0.8rem;
    text-align: center;
    padding: 24px 0;
    margin: 0;
  }

  .catalog-section { margin-bottom: 20px; }

  .section-title {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.25);
    margin: 0 0 8px;
  }

  .catalog-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 6px;
  }

  .catalog-item {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 6px;
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.8);
    font-family: inherit;
    transition: background 80ms, border-color 80ms;
  }
  .catalog-item:hover:not(:disabled) {
    background: rgba(245, 166, 35, 0.08);
    border-color: rgba(245, 166, 35, 0.25);
  }
  .catalog-item:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .catalog-item--market {
    border-color: rgba(255, 255, 255, 0.04);
  }

  .item-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 3px;
  }

  .item-label {
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-badge {
    background: rgba(245, 166, 35, 0.2);
    color: rgba(245, 166, 35, 0.9);
    border-radius: 999px;
    font-size: 0.6rem;
    padding: 1px 5px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .item-desc {
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.35);
    margin: 0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .item-params {
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.3);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-unavail {
    font-size: 0.6rem;
    color: rgba(255, 255, 255, 0.2);
    display: block;
    margin-top: 3px;
  }
</style>
