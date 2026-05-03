<script lang="ts">
  import { onMount } from 'svelte';

  let {
    onOpen = undefined
  }: {
    onOpen?: (path: string, cta: string) => void;
  } = $props();

  let stats = $state<{
    active_patterns: number | null;
    verdict_accuracy_7d: number | null;
    active_users_24h: number | null;
  } | null>(null);

  let loading = $state(true);

  async function fetchStats() {
    try {
      const res = await fetch('/api/landing/stats');
      if (res.ok) stats = await res.json();
    } catch {
      // silent fail — strip stays hidden
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  });

  const shouldShow = $derived(
    !loading && stats !== null &&
    (stats.active_patterns ?? 0) > 0
  );
</script>

{#if loading}
  <div class="stat-strip stat-strip--skeleton" aria-hidden="true">
    <div class="stat-skeleton"></div>
    <div class="stat-skeleton"></div>
    <div class="stat-skeleton"></div>
  </div>
{:else if shouldShow && stats}
  <div class="stat-strip" role="status" aria-label="라이브 지표">
    <span class="stat-item">
      <span class="stat-value">{stats.active_patterns}</span>
      <span class="stat-label">패턴 활성</span>
    </span>
    <span class="stat-sep" aria-hidden="true">·</span>
    <span class="stat-item">
      <span class="stat-value">
        {stats.verdict_accuracy_7d !== null
          ? (stats.verdict_accuracy_7d * 100).toFixed(1) + '%'
          : '—'}
      </span>
      <span class="stat-label">정확도 (7일)</span>
    </span>
    <span class="stat-sep" aria-hidden="true">·</span>
    <span class="stat-item">
      <span class="stat-value">{stats.active_users_24h ?? '—'}</span>
      <span class="stat-label">활성 트레이더</span>
    </span>
    {#if onOpen}
      <span class="stat-sep" aria-hidden="true">·</span>
      <button
        type="button"
        class="strip-cta"
        onclick={() => onOpen!('/cogochi', 'strip_start')}
      >
        Start
      </button>
    {/if}
  </div>
{/if}

<style>
  .stat-strip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 8px 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    color: var(--g7, #9d9690);
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stat-value {
    color: var(--g9, #eceae8);
    font-weight: 600;
  }

  .stat-label {
    color: var(--g5, #3d3830);
  }

  .stat-sep {
    color: var(--g4, #272320);
  }

  .strip-cta {
    background: none;
    border: 1px solid var(--g4, #272320);
    border-radius: 3px;
    color: var(--g8, #ccc9c5);
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    padding: 2px 8px;
    transition: border-color 0.15s, color 0.15s;
  }

  .strip-cta:hover {
    border-color: var(--g6, #5a5650);
    color: var(--g9, #eceae8);
  }

  .stat-strip--skeleton {
    display: flex;
    gap: 24px;
    justify-content: center;
    padding: 8px 16px;
  }

  .stat-skeleton {
    height: 12px;
    width: 80px;
    background: var(--g3, #1c1918);
    border-radius: 2px;
    animation: stat-pulse 1.5s ease-in-out infinite;
  }

  @keyframes stat-pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }

  @media (max-width: 640px) {
    .stat-sep {
      display: none;
    }
    .stat-strip {
      flex-wrap: wrap;
      gap: 8px;
    }
  }
</style>
