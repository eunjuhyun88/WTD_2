<script lang="ts">
  import { page } from '$app/stores';
  import Library from './_tabs/Library.svelte';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  const tab = $derived($page.url.searchParams.get('tab') ?? 'library');
</script>

{#if tab === 'library' || tab === 'benchmark' || tab === 'lifecycle' || tab === 'search' || tab === 'strategies'}
  {#if tab === 'library'}
    <Library
      candidates={data.candidates}
      states={data.states}
      stats={data.stats}
      transitions={data.transitions}
      lastScan={data.lastScan}
    />
  {:else if tab === 'benchmark'}
    <div class="tab-placeholder">
      <span class="tab-placeholder-label">Benchmark</span>
      <p>Navigate to <a href="/patterns/benchmark">/patterns/benchmark</a> — or select this tab from the nav bar.</p>
    </div>
  {:else if tab === 'lifecycle'}
    <div class="tab-placeholder">
      <span class="tab-placeholder-label">Lifecycle</span>
      <p>Navigate to <a href="/patterns/lifecycle">/patterns/lifecycle</a> — or select this tab from the nav bar.</p>
    </div>
  {:else if tab === 'search'}
    <div class="tab-placeholder">
      <span class="tab-placeholder-label">Search</span>
      <p>Navigate to <a href="/patterns/search">/patterns/search</a> — or select this tab from the nav bar.</p>
    </div>
  {:else if tab === 'strategies'}
    <div class="tab-placeholder">
      <span class="tab-placeholder-label">Strategies</span>
      <p>Navigate to <a href="/patterns/strategies">/patterns/strategies</a> — or select this tab from the nav bar.</p>
    </div>
  {/if}
{:else}
  <Library
    candidates={data.candidates}
    states={data.states}
    stats={data.stats}
    transitions={data.transitions}
    lastScan={data.lastScan}
  />
{/if}

<style>
  .tab-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 80px 24px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 13px;
    color: rgba(255, 255, 255, 0.45);
    text-align: center;
  }
  .tab-placeholder-label {
    font-size: 16px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.7);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .tab-placeholder a {
    color: rgba(99, 179, 237, 0.8);
    text-decoration: none;
  }
  .tab-placeholder a:hover {
    color: #63b3ed;
  }
</style>
