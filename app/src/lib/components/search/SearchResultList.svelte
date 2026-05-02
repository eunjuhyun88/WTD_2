<script lang="ts">
  /**
   * SearchResultList — paginated wrapper for search result cards.
   *
   * - Shows up to maxResults items (default 20)
   * - Client-side pagination: pageSize items per page (default 10)
   */
  import SearchResultCard from './SearchResultCard.svelte';
  import type { SearchResultCardProps } from './SearchResultCard.svelte';

  interface SearchResultListProps {
    items: SearchResultCardProps[];
    maxResults?: number;
    pageSize?: number;
  }

  let {
    items,
    maxResults = 20,
    pageSize = 10,
  }: SearchResultListProps = $props();

  // Clamp to maxResults
  const visibleItems = $derived(items.slice(0, maxResults));
  const totalPages = $derived(Math.max(1, Math.ceil(visibleItems.length / pageSize)));

  let currentPage = $state(0);

  const pageItems = $derived(
    visibleItems.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  );

  function prevPage() {
    if (currentPage > 0) currentPage -= 1;
  }

  function nextPage() {
    if (currentPage < totalPages - 1) currentPage += 1;
  }
</script>

<div class="srl-root">
  {#if pageItems.length === 0}
    <p class="srl-empty">No results</p>
  {:else}
    <div class="srl-list">
      {#each pageItems as item, i (item.capture_id ?? `${item.symbol}-${item.timestamp}-${i}`)}
        <SearchResultCard {...item} rank={currentPage * pageSize + i} />
      {/each}
    </div>

    {#if totalPages > 1}
      <div class="srl-pagination">
        <button class="page-btn" onclick={prevPage} disabled={currentPage === 0}>← Prev</button>
        <span class="page-info">{currentPage + 1} / {totalPages}</span>
        <button class="page-btn" onclick={nextPage} disabled={currentPage >= totalPages - 1}>Next →</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .srl-root {
    display: flex;
    flex-direction: column;
  }

  .srl-list {
    display: flex;
    flex-direction: column;
  }

  .srl-empty {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
    padding: 24px;
    text-align: center;
  }

  .srl-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .page-btn {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .page-btn:hover:not(:disabled) {
    background: rgba(99, 179, 237, 0.1);
    color: #63b3ed;
  }
  .page-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .page-info {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
    min-width: 50px;
    text-align: center;
  }
</style>
