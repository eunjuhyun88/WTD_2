<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import type { Snippet } from 'svelte';

  interface Props { children: Snippet }
  let { children }: Props = $props();

  const path = $derived($page.url.pathname);
  const queryTab = $derived($page.url.searchParams.get('tab') ?? '');

  const isDetailPage = $derived.by(() => {
    const parts = path.split('/').filter(Boolean);
    return parts.length === 2 && parts[0] === 'patterns' &&
      !['strategies', 'benchmark', 'lifecycle', 'search'].includes(parts[1]);
  });

  // On /patterns, active tab is driven by ?tab= query param
  // On sub-routes (legacy, pre-redirect), active tab is driven by pathname
  const activeTab = $derived.by(() => {
    if (path === '/patterns') {
      return queryTab || 'library';
    }
    if (path === '/patterns/benchmark') return 'benchmark';
    if (path === '/patterns/lifecycle') return 'lifecycle';
    if (path === '/patterns/search') return 'search';
    if (path === '/patterns/strategies') return 'strategies';
    return 'library';
  });

  const tabs = [
    { id: 'library',     label: 'Library' },
    { id: 'benchmark',   label: 'Benchmark' },
    { id: 'lifecycle',   label: 'Lifecycle' },
    { id: 'search',      label: 'Search' },
    { id: 'strategies',  label: 'Strategies' },
  ];

  function selectTab(id: string) {
    if (id === 'library') {
      const url = new URL($page.url);
      url.searchParams.delete('tab');
      goto(url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : ''), {
        replaceState: false,
        noScroll: true,
        keepFocus: true,
      });
    } else {
      const url = new URL($page.url);
      url.pathname = '/patterns';
      url.searchParams.set('tab', id);
      goto(url.pathname + '?' + url.searchParams.toString(), {
        replaceState: false,
        noScroll: true,
        keepFocus: true,
      });
    }
  }
</script>

{#if !isDetailPage}
  <nav class="hub-tabs" aria-label="Patterns navigation">
    {#each tabs as tab}
      <button
        class="hub-tab"
        class:active={activeTab === tab.id}
        aria-current={activeTab === tab.id ? 'page' : undefined}
        onclick={() => selectTab(tab.id)}
        type="button"
      >{tab.label}</button>
    {/each}
  </nav>
{/if}

{@render children()}

<style>
  .hub-tabs {
    display: flex;
    gap: 2px;
    padding: 0 20px;
    border-bottom: 1px solid rgba(249, 216, 194, 0.07);
    background: rgba(6, 6, 7, 0.6);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .hub-tab {
    padding: 10px 14px;
    font-size: 12px;
    font-weight: 500;
    color: rgba(250, 247, 235, 0.38);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
    font-family: inherit;
  }

  .hub-tab:hover {
    color: rgba(250, 247, 235, 0.65);
  }

  .hub-tab.active {
    color: rgba(250, 247, 235, 0.92);
    border-bottom-color: rgba(219, 154, 159, 0.8);
  }

  @media (max-width: 768px) {
    .hub-tabs {
      padding: 0 12px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .hub-tabs::-webkit-scrollbar { display: none; }
    .hub-tab { padding: 10px 10px; font-size: 11px; }
  }
</style>
