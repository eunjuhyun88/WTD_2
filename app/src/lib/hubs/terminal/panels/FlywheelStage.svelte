<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { workMode } from '../workMode.store';
  import RetrainCountdown from './RetrainCountdown.svelte';

  interface VerdictRow {
    id: string;
    symbol: string;
    verdict: string;
    created_at: string;
  }

  interface FlywheelStatus {
    progress_pct: number;
    recent_verdicts: VerdictRow[];
    next_retrain_at: string | null;
  }

  let status = $state<FlywheelStatus>({
    progress_pct: 0,
    recent_verdicts: [],
    next_retrain_at: null,
  });
  let loading = $state(true);
  let error = $state('');

  async function fetchStatus() {
    try {
      const res = await fetch('/api/terminal/flywheel/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: FlywheelStatus = await res.json();
      status = data;
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : '데이터 로드 실패';
    } finally {
      loading = false;
    }
  }

  let pollId: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    fetchStatus();
    pollId = setInterval(fetchStatus, 5_000);
  });

  onDestroy(() => {
    if (pollId !== null) clearInterval(pollId);
  });

  function close() {
    workMode.set('TRADE');
  }

  function verdictColor(verdict: string): string {
    if (verdict === 'UP' || verdict === 'bullish') return 'var(--pos, #22c55e)';
    if (verdict === 'DOWN' || verdict === 'bearish') return 'var(--neg, #ef4444)';
    return 'var(--g6)';
  }

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return '방금';
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    return `${Math.floor(h / 24)}일 전`;
  }
</script>

<div class="flywheel-overlay">
  <div class="flywheel-panel">
    <div class="flywheel-header">
      <span class="flywheel-badge">FLYWHEEL</span>
      <button class="flywheel-close" onclick={close} type="button">✕</button>
    </div>

    {#if loading}
      <div class="flywheel-loading">로딩 중...</div>
    {:else if error}
      <div class="flywheel-error">{error}</div>
    {:else}
      <div class="flywheel-body">
        <!-- Layer C progress -->
        <section class="flywheel-section">
          <div class="section-title">Layer C 진행률</div>
          <div class="progress-bar-track">
            <div
              class="progress-bar-fill"
              style:width={`${Math.min(100, Math.max(0, status.progress_pct))}%`}
            ></div>
          </div>
          <div class="progress-label">{status.progress_pct.toFixed(1)}%</div>
        </section>

        <!-- Countdown -->
        <section class="flywheel-section flywheel-section--row">
          <RetrainCountdown nextRetrainAt={status.next_retrain_at} />
        </section>

        <!-- Recent verdicts -->
        <section class="flywheel-section flywheel-section--verdicts">
          <div class="section-title">최근 verdict <span class="section-count">{status.recent_verdicts.length}</span></div>
          {#if status.recent_verdicts.length === 0}
            <div class="verdict-empty">verdict 데이터 없음</div>
          {:else}
            <ul class="verdict-list">
              {#each status.recent_verdicts as row (row.id)}
                <li class="verdict-row">
                  <span class="verdict-symbol">{row.symbol}</span>
                  <span class="verdict-tag" style:color={verdictColor(row.verdict)}>{row.verdict}</span>
                  <span class="verdict-time">{relativeTime(row.created_at)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>
    {/if}
  </div>
</div>

<style>
  .flywheel-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(12, 10, 9, 0.85);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .flywheel-panel {
    width: min(480px, 90vw);
    background: var(--g2);
    border: 1px solid var(--g4);
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .flywheel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--g3);
    flex-shrink: 0;
  }

  .flywheel-badge {
    font-size: var(--ui-text-xs);
    font-weight: 700;
    color: var(--amb, #f5a623);
    letter-spacing: 0.1em;
    font-family: 'JetBrains Mono', monospace;
  }

  .flywheel-close {
    background: none;
    border: none;
    color: var(--g6);
    cursor: pointer;
    font-size: var(--ui-text-base);
    padding: 4px 8px;
  }

  .flywheel-loading,
  .flywheel-error {
    padding: 40px;
    text-align: center;
    font-size: var(--ui-text-sm);
    color: var(--g6);
  }

  .flywheel-error { color: var(--neg, #ef4444); }

  .flywheel-body {
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
  }

  .flywheel-section {
    padding: 16px 20px;
    border-bottom: 1px solid var(--g3);
  }

  .flywheel-section:last-child { border-bottom: none; }

  .flywheel-section--row {
    display: flex;
    align-items: center;
  }

  .flywheel-section--verdicts {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 320px;
  }

  .section-title {
    font-size: var(--ui-text-xs);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--g5);
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .section-count {
    background: var(--g3);
    color: var(--g7);
    border-radius: 10px;
    padding: 0 5px;
    font-size: var(--ui-text-xs, 11px);
  }

  /* Progress bar */
  .progress-bar-track {
    height: 6px;
    background: var(--g3);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 6px;
  }

  .progress-bar-fill {
    height: 100%;
    background: var(--amb, #f5a623);
    border-radius: 3px;
    transition: width 0.4s ease;
  }

  .progress-label {
    font-size: var(--ui-text-xs);
    font-family: 'JetBrains Mono', monospace;
    color: var(--g7);
    text-align: right;
  }

  /* Verdict list */
  .verdict-empty {
    font-size: var(--ui-text-sm);
    color: var(--g5);
    text-align: center;
    padding: 16px 0;
  }

  .verdict-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;
    scrollbar-gutter: stable;
  }

  .verdict-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px solid var(--g3);
    font-size: var(--ui-text-xs);
  }

  .verdict-row:last-child { border-bottom: none; }

  .verdict-symbol {
    font-family: 'JetBrains Mono', monospace;
    color: var(--g9);
    font-weight: 600;
    min-width: 80px;
  }

  .verdict-tag {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    flex: 1;
  }

  .verdict-time {
    color: var(--g5);
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
  }
</style>
