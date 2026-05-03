<script lang="ts">
  import { onMount } from 'svelte';
  import FeatureDrawer from './FeatureDrawer.svelte';
  import type { DecisionRow } from './decisions.types';

  interface Props {
    agentId: string;
  }

  const { agentId }: Props = $props();

  let rows = $state<DecisionRow[]>([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state(false);
  let nextCursor = $state<string | null>(null);

  let selectedDecision = $state<DecisionRow | null>(null);

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatLatency(ms: number | null | undefined): string {
    if (ms == null) return '—';
    return ms.toFixed(0) + 'ms';
  }

  async function fetchPage(cursor: string | null) {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(`/api/agents/decisions/${agentId}?${params}`);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    return res.json() as Promise<{ rows: DecisionRow[]; next_cursor: string | null }>;
  }

  onMount(async () => {
    try {
      const data = await fetchPage(null);
      rows = data.rows;
      nextCursor = data.next_cursor;
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  });

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    loadingMore = true;
    try {
      const data = await fetchPage(nextCursor);
      rows = [...rows, ...data.rows];
      nextCursor = data.next_cursor;
    } catch {
      // silent — leave existing rows intact
    } finally {
      loadingMore = false;
    }
  }
</script>

<div class="decisions-table-wrap">
  <div class="dt-header-row">
    <span class="dt-section-title">Decisions</span>
    {#if !loading && !error}
      <span class="dt-count">{rows.length}건{nextCursor ? '+' : ''}</span>
    {/if}
  </div>

  {#if loading}
    <!-- Skeleton 3행 -->
    <div class="dt-table">
      <div class="dt-thead">
        <div class="dt-tr dt-tr--head">
          <span class="dt-th dt-col-time">시간</span>
          <span class="dt-th dt-col-cmd">CMD</span>
          <span class="dt-th dt-col-verdict">Verdict</span>
          <span class="dt-th dt-col-latency">Latency</span>
          <span class="dt-th dt-col-action"></span>
        </div>
      </div>
      <div class="dt-tbody">
        {#each [1, 2, 3] as _}
          <div class="dt-tr dt-tr--skeleton">
            <span class="skel skel--time"></span>
            <span class="skel skel--cmd"></span>
            <span class="skel skel--verdict"></span>
            <span class="skel skel--latency"></span>
            <span class="skel skel--action"></span>
          </div>
        {/each}
      </div>
    </div>

  {:else if error}
    <div class="dt-empty">데이터를 불러오지 못했습니다.</div>

  {:else if rows.length === 0}
    <div class="dt-empty">결정 이력이 없습니다.</div>

  {:else}
    <div class="dt-table">
      <div class="dt-thead">
        <div class="dt-tr dt-tr--head">
          <span class="dt-th dt-col-time">시간</span>
          <span class="dt-th dt-col-cmd">CMD</span>
          <span class="dt-th dt-col-verdict">Verdict</span>
          <span class="dt-th dt-col-latency">Latency</span>
          <span class="dt-th dt-col-action"></span>
        </div>
      </div>
      <div class="dt-tbody">
        {#each rows as row (row.id)}
          <button
            class="dt-tr dt-tr--data"
            onclick={() => (selectedDecision = row)}
            aria-label="결정 상세 보기: {row.cmd}"
          >
            <span class="dt-td dt-col-time">{formatTime(row.created_at)}</span>
            <span class="dt-td dt-col-cmd dt-td--mono">{row.cmd}</span>
            <span class="dt-td dt-col-verdict dt-td--mono">{row.llm_verdict ?? '—'}</span>
            <span class="dt-td dt-col-latency dt-td--mono">{formatLatency(row.latency_ms)}</span>
            <span class="dt-td dt-col-action">›</span>
          </button>
        {/each}
      </div>
    </div>

    {#if nextCursor}
      <div class="dt-load-more">
        <button
          class="load-more-btn"
          onclick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? '불러오는 중…' : '더 불러오기'}
        </button>
      </div>
    {/if}
  {/if}
</div>

<FeatureDrawer
  decision={selectedDecision}
  onClose={() => (selectedDecision = null)}
/>

<style>
  .decisions-table-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .dt-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dt-section-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.35);
  }

  .dt-count {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    color: rgba(255, 255, 255, 0.25);
  }

  .dt-table {
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    overflow: hidden;
  }

  .dt-thead {
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }

  .dt-tr {
    display: grid;
    grid-template-columns: 1fr 80px 90px 75px 24px;
    align-items: center;
    gap: 0;
    padding: 0 14px;
    width: 100%;
    box-sizing: border-box;
  }

  .dt-tr--head {
    height: 34px;
  }

  .dt-th {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.22);
  }

  .dt-tr--data {
    height: 42px;
    cursor: pointer;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    text-align: left;
    transition: background 80ms;
  }

  .dt-tr--data:last-child {
    border-bottom: none;
  }

  .dt-tr--data:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .dt-td {
    font-size: 0.78rem;
    color: rgba(255, 255, 255, 0.65);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dt-td--mono {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
  }

  .dt-col-action {
    color: rgba(255, 255, 255, 0.2);
    font-size: 1rem;
    text-align: right;
  }

  /* Skeleton rows */
  .dt-tr--skeleton {
    height: 42px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    pointer-events: none;
  }

  .dt-tr--skeleton:last-child {
    border-bottom: none;
  }

  .skel {
    display: block;
    height: 10px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.06);
    animation: skel-pulse 1.5s ease-in-out infinite;
  }

  .skel--time  { width: 72%;  }
  .skel--cmd   { width: 55%;  }
  .skel--verdict { width: 60%; }
  .skel--latency { width: 50%; }
  .skel--action  { width: 8px; }

  @keyframes skel-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.45; }
  }

  /* Load more */
  .dt-load-more {
    display: flex;
    justify-content: center;
  }

  .load-more-btn {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.45);
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 8px 20px;
    cursor: pointer;
    transition: color 80ms, border-color 80ms;
  }

  .load-more-btn:hover:not(:disabled) {
    color: rgba(255, 255, 255, 0.75);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .load-more-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Empty / error state */
  .dt-empty {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
    color: rgba(255, 255, 255, 0.25);
    text-align: center;
    padding: 32px 0;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 8px;
  }
</style>
