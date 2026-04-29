<script lang="ts">
  /**
   * /patterns/candidates — Pattern Lifecycle Management
   *
   * Lists patterns by lifecycle status (draft / candidate / object / archived).
   * Allows promoting patterns through the lifecycle:
   *   draft → candidate → object
   *           ↘ archived ↙
   */
  import { onMount } from 'svelte';
  import PatternLifecycleCard from '$lib/components/patterns/PatternLifecycleCard.svelte';
  import type { PatternLifecycleStatus } from '$lib/api/patterns';

  interface LifecycleEntry {
    slug: string;
    name: string | null;
    status: PatternLifecycleStatus;
    promoted_at: string | null;
    updated_at: string;
    timeframe: string;
    tags: string[];
  }

  let entries = $state<LifecycleEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let filterStatus = $state<PatternLifecycleStatus | 'all'>('candidate');

  const filtered = $derived(
    filterStatus === 'all'
      ? entries
      : entries.filter((e) => e.status === filterStatus)
  );

  const counts = $derived({
    draft:     entries.filter((e) => e.status === 'draft').length,
    candidate: entries.filter((e) => e.status === 'candidate').length,
    object:    entries.filter((e) => e.status === 'object').length,
    archived:  entries.filter((e) => e.status === 'archived').length,
  });

  async function loadEntries() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/patterns/lifecycle');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { entries: LifecycleEntry[] };
      entries = data.entries ?? [];
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  function onStatusChange(slug: string, newStatus: PatternLifecycleStatus) {
    // Optimistic update + reload
    entries = entries.map((e) =>
      e.slug === slug ? { ...e, status: newStatus } : e
    );
    // Reload after a short delay to get server-confirmed state
    setTimeout(() => loadEntries(), 500);
  }

  onMount(loadEntries);
</script>

<svelte:head>
  <title>Pattern Lifecycle — Cogochi</title>
</svelte:head>

<div class="surface-page chrome-layout lifecycle-page">
  <header class="surface-hero surface-fixed-hero">
    <div class="surface-copy">
      <div>
        <span class="surface-kicker">Patterns</span>
        <h1 class="surface-title">Pattern Lifecycle</h1>
      </div>
      <p class="surface-subtitle">
        Draft → Candidate → Object 전환. Candidate 단계에서 검토 후 production 승급.
      </p>
    </div>

    <div class="surface-stats">
      <article class="surface-stat">
        <span class="surface-meta">Draft</span>
        <strong>{counts.draft}</strong>
      </article>
      <article class="surface-stat">
        <span class="surface-meta">Candidate</span>
        <strong class:highlight={counts.candidate > 0}>{counts.candidate}</strong>
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
      <button class="surface-button-secondary" onclick={loadEntries} disabled={loading}>
        {loading ? '로딩 중…' : '새로고침'}
      </button>
      <a class="surface-button-ghost" href="/patterns">Pattern Engine</a>
    </div>
  </header>

  <div class="surface-scroll-body lifecycle-content">
    <!-- Status filter tabs -->
    <div class="filter-tabs">
      {#each (['all', 'draft', 'candidate', 'object', 'archived'] as const) as s}
        <button
          class="filter-tab"
          class:active={filterStatus === s}
          onclick={() => { filterStatus = s; }}
        >
          {s === 'all' ? `전체 ${entries.length}` : `${s} ${counts[s as PatternLifecycleStatus] ?? 0}`}
        </button>
      {/each}
    </div>

    {#if loading}
      <section class="surface-card page-loading">
        <span class="pulse"></span>
        <span>라이프사이클 데이터 로딩 중…</span>
      </section>

    {:else if error}
      <section class="surface-card page-error">
        <p>엔진 연결 실패 — Python 엔진이 실행 중인지 확인하세요</p>
        <p class="error-detail">{error}</p>
        <button class="surface-button-secondary" onclick={loadEntries}>재시도</button>
      </section>

    {:else if filtered.length === 0}
      <section class="surface-card empty-card">
        <p>
          {filterStatus === 'all'
            ? '패턴이 없습니다.'
            : `${filterStatus} 상태의 패턴이 없습니다.`}
        </p>
      </section>

    {:else}
      <section class="lifecycle-grid">
        {#each filtered as entry (entry.slug)}
          <PatternLifecycleCard
            slug={entry.slug}
            name={entry.name ?? undefined}
            status={entry.status}
            timeframe={entry.timeframe}
            tags={entry.tags}
            {onStatusChange}
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
    gap: 4px;
    flex-wrap: wrap;
    padding: 0 var(--surface-px, 20px);
    padding-top: 16px;
  }

  .filter-tab {
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 5px 14px;
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.45);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .filter-tab:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.7);
  }

  .filter-tab.active {
    background: rgba(99, 102, 241, 0.2);
    color: #a5b4fc;
    border-color: rgba(99, 102, 241, 0.4);
  }

  .lifecycle-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 10px;
    padding: 0 var(--surface-px, 20px);
    padding-bottom: 24px;
  }

  .page-loading,
  .page-error,
  .empty-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    color: rgba(255,255,255,0.55);
    padding: 48px 24px;
    text-align: center;
    margin: 0 var(--surface-px, 20px);
  }

  .pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255,255,255,0.3);
    animation: pulse 1.4s ease-in-out infinite;
  }

  @keyframes pulse { 0%,100%{opacity:.2} 50%{opacity:1} }

  .page-error { color: #f87171; }

  .error-detail {
    font-size: 10px;
    color: rgba(248,113,113,0.6);
    max-width: 400px;
  }

  strong.highlight {
    color: #fbbf24;
  }
</style>
