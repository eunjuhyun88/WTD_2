<script lang="ts">
  import { onMount } from 'svelte';
  import PatternLifecycleCard from '$lib/components/patterns/PatternLifecycleCard.svelte';
  import {
    fetchLifecycleList,
    type LifecycleEntry,
    type LifecycleStatus,
  } from '$lib/api/lifecycleApi';
  import { buildCanonicalHref } from '$lib/seo/site';

  let entries = $state<LifecycleEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let filter = $state<LifecycleStatus | 'all'>('all');

  const filteredEntries = $derived(
    filter === 'all' ? entries : entries.filter((entry) => entry.status === filter),
  );

  const counts = $derived({
    all: entries.length,
    draft: entries.filter((entry) => entry.status === 'draft').length,
    candidate: entries.filter((entry) => entry.status === 'candidate').length,
    object: entries.filter((entry) => entry.status === 'object').length,
    archived: entries.filter((entry) => entry.status === 'archived').length,
  });

  async function loadLifecycle() {
    loading = true;
    error = null;
    try {
      const response = await fetchLifecycleList();
      entries = response.entries ?? [];
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  function handleTransition(slug: string, toStatus: LifecycleStatus) {
    entries = entries.map((entry) =>
      entry.slug === slug ? { ...entry, status: toStatus, updated_at: Date.now() / 1000 } : entry,
    );
    void loadLifecycle();
  }

  function metaFor(entry: LifecycleEntry): string {
    const name = entry.name && entry.name !== entry.slug ? `${entry.name} · ` : '';
    const tags = entry.tags.length > 0 ? ` · ${entry.tags.slice(0, 2).join(' · ')}` : '';
    return `${name}${entry.timeframe}${tags}`;
  }

  onMount(loadLifecycle);
</script>

<svelte:head>
  <title>Pattern Lifecycle — Cogochi</title>
  <meta
    name="description"
    content="Review PatternObject lifecycle status and promote or archive patterns from the Cogochi pattern engine."
  />
  <link rel="canonical" href={buildCanonicalHref('/patterns/lifecycle')} />
</svelte:head>

<div class="surface-page chrome-layout lifecycle-page">
  <header class="surface-hero surface-fixed-hero">
    <div class="surface-copy">
      <div>
        <span class="surface-kicker">Patterns</span>
        <h1 class="surface-title">Lifecycle</h1>
      </div>
      <p class="surface-subtitle">
        Draft, candidate, object, archived 상태를 같은 운영 화면에서 관리합니다.
      </p>
    </div>

    <div class="surface-stats">
      <article class="surface-stat">
        <span class="surface-meta">Draft</span>
        <strong>{counts.draft}</strong>
      </article>
      <article class="surface-stat">
        <span class="surface-meta">Candidate</span>
        <strong>{counts.candidate}</strong>
      </article>
      <article class="surface-stat">
        <span class="surface-meta">Object</span>
        <strong>{counts.object}</strong>
      </article>
      <article class="surface-stat">
        <span class="surface-meta">Archived</span>
        <strong>{counts.archived}</strong>
      </article>
    </div>

    <div class="topbar-actions">
      <button class="surface-button" onclick={loadLifecycle} disabled={loading}>
        {loading ? 'Loading…' : 'Refresh'}
      </button>
      <a class="surface-button-secondary" href="/patterns">Pattern Engine</a>
    </div>
  </header>

  <div class="surface-scroll-body lifecycle-content">
    <nav class="filter-tabs" aria-label="Lifecycle status filter">
      {#each (['all', 'draft', 'candidate', 'object', 'archived'] as const) as status}
        <button
          class="filter-tab"
          class:active={filter === status}
          onclick={() => { filter = status; }}
        >
          {status} {counts[status]}
        </button>
      {/each}
    </nav>

    {#if loading}
      <section class="surface-card page-state">
        <span class="pulse"></span>
        <span>라이프사이클 로딩 중…</span>
      </section>
    {:else if error}
      <section class="surface-card page-state error-state">
        <p>엔진 연결 실패</p>
        <p class="error-detail">{error}</p>
        <button class="surface-button-secondary" onclick={loadLifecycle}>Retry</button>
      </section>
    {:else if filteredEntries.length === 0}
      <section class="surface-card page-state">
        <p>{filter === 'all' ? '패턴이 없습니다.' : `${filter} 상태 패턴이 없습니다.`}</p>
      </section>
    {:else}
      <section class="lifecycle-grid" aria-label="Pattern lifecycle list">
        {#each filteredEntries as entry (entry.slug)}
          <PatternLifecycleCard
            slug={entry.slug}
            title={entry.slug}
            meta={metaFor(entry)}
            initialStatus={entry.status}
            ontransition={(_, toStatus) => handleTransition(entry.slug, toStatus)}
          />
        {/each}
      </section>
    {/if}
  </div>
</div>

<style>
  .lifecycle-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .filter-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 16px var(--surface-px, 20px) 0;
  }

  .filter-tab {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.45);
    cursor: pointer;
  }

  .filter-tab:hover,
  .filter-tab.active {
    background: rgba(99, 102, 241, 0.18);
    border-color: rgba(99, 102, 241, 0.38);
    color: #c7d2fe;
  }

  .lifecycle-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 10px;
    padding: 0 var(--surface-px, 20px) 28px;
  }

  .page-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin: 0 var(--surface-px, 20px);
    padding: 44px 20px;
    text-align: center;
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
  }

  .pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.35);
    animation: pulse 1.3s ease-in-out infinite;
  }

  .error-state {
    color: #f87171;
  }

  .error-detail {
    margin: 0;
    max-width: 520px;
    color: rgba(248, 113, 113, 0.65);
    font-size: 11px;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }
</style>
