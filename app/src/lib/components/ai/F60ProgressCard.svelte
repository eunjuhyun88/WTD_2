<script lang="ts">
  import { onMount } from 'svelte';

  interface LayerCRun {
    run_id: string;
    triggered_at: string;
    n_verdicts: number;
    status: string;
    ndcg_at_5: number | null;
    promoted: boolean;
  }

  interface F60Progress {
    verdicts_labelled: number;
    accuracy: number | null;
    gate_pct: number;
  }

  let runs = $state<LayerCRun[]>([]);
  let f60 = $state<F60Progress | null>(null);
  let loading = $state(true);
  let error = $state(false);

  onMount(async () => {
    try {
      const res = await fetch('/api/layer_c/progress');
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as { runs: LayerCRun[]; f60_progress: F60Progress };
      runs = data.runs ?? [];
      f60 = data.f60_progress ?? null;
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  });

  const sparkBars = $derived(
    runs
      .slice()
      .reverse()
      .slice(-10)
      .map((r) => ({
        val: r.ndcg_at_5 ?? 0,
        promoted: r.promoted,
        label: `${new Date(r.triggered_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} — NDCG@5: ${r.ndcg_at_5?.toFixed(3) ?? '—'}`,
      }))
  );

  const maxSparkVal = $derived(
    sparkBars.length > 0 ? Math.max(...sparkBars.map((b) => b.val), 0.01) : 1
  );

  const hasPromoted = $derived(runs.some((r) => r.promoted));

  const gaugeWidth = $derived(Math.min(f60?.gate_pct ?? 0, 100));

  const verdictsFmt = $derived(
    f60 != null ? `${f60.verdicts_labelled} / 200` : '—'
  );

  const accuracyFmt = $derived(
    f60?.accuracy != null ? f60.accuracy.toFixed(3) : '—'
  );
</script>

<div class="f60-card">
  <div class="f60-header">
    <span class="f60-title">Layer C · F-60 진척</span>
    {#if hasPromoted}
      <span class="f60-badge active">🟢 Layer C 활성</span>
    {:else if !loading}
      <span class="f60-badge inactive">🔵 Shadow 모드</span>
    {/if}
  </div>

  {#if loading}
    <div class="f60-placeholder">로딩 중…</div>
  {:else if error}
    <div class="f60-placeholder">데이터 로드 실패</div>
  {:else if runs.length === 0}
    <div class="f60-placeholder">첫 훈련 대기 중</div>
  {:else}
    <!-- Sparkline: 최근 10 run ndcg_at_5 -->
    <div class="f60-spark-wrap">
      <span class="f60-section-label">NDCG@5 추이 (최근 {sparkBars.length}회)</span>
      <div class="f60-spark" role="img" aria-label="최근 훈련 NDCG@5 sparkline">
        {#each sparkBars as bar}
          <div
            class="f60-bar"
            class:promoted={bar.promoted}
            style="height: {Math.round((bar.val / maxSparkVal) * 100)}%"
            title={bar.label}
          ></div>
        {/each}
      </div>
    </div>

    <!-- F-60 gate gauge -->
    <div class="f60-gauge-wrap">
      <div class="f60-gauge-meta">
        <span class="f60-section-label">F-60 게이트</span>
        <span class="f60-gauge-pct">{gaugeWidth}%</span>
      </div>
      <div class="f60-gauge-track" role="progressbar" aria-valuenow={gaugeWidth} aria-valuemin={0} aria-valuemax={100}>
        <div class="f60-gauge-fill" style="width: {gaugeWidth}%"></div>
      </div>
      <div class="f60-stats-row">
        <span class="f60-stat">
          <span class="f60-stat-label">Verdicts</span>
          <span class="f60-stat-val">{verdictsFmt}</span>
        </span>
        <span class="f60-stat">
          <span class="f60-stat-label">Accuracy</span>
          <span class="f60-stat-val" class:ok={f60?.accuracy != null && f60.accuracy >= 0.55}>
            {accuracyFmt}
          </span>
        </span>
      </div>
    </div>
  {/if}
</div>

<style>
  .f60-card {
    display: grid;
    gap: 14px;
    padding: 16px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
  }

  .f60-header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .f60-title {
    font-size: var(--ui-text-sm, 0.875rem);
    font-weight: 600;
    color: var(--sc-text-0, #fff);
  }

  .f60-badge {
    font-size: var(--ui-text-xs, 0.75rem);
    padding: 2px 8px;
    border-radius: 999px;
    font-weight: 500;
  }

  .f60-badge.active {
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.3);
  }

  .f60-badge.inactive {
    background: rgba(96, 165, 250, 0.12);
    color: #93c5fd;
    border: 1px solid rgba(96, 165, 250, 0.25);
  }

  .f60-placeholder {
    font-size: var(--ui-text-sm, 0.875rem);
    color: var(--sc-text-2, rgba(255, 255, 255, 0.4));
    padding: 8px 0;
  }

  .f60-section-label {
    font-size: var(--ui-text-xs, 0.75rem);
    color: var(--sc-text-2, rgba(255, 255, 255, 0.4));
    letter-spacing: 0.02em;
  }

  /* Sparkline */
  .f60-spark-wrap {
    display: grid;
    gap: 6px;
  }

  .f60-spark {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 40px;
  }

  .f60-bar {
    flex: 1;
    min-width: 4px;
    border-radius: 2px 2px 0 0;
    background: rgba(148, 163, 184, 0.4);
    transition: background 0.2s;
  }

  .f60-bar.promoted {
    background: rgba(74, 222, 128, 0.7);
  }

  /* Gauge */
  .f60-gauge-wrap {
    display: grid;
    gap: 6px;
  }

  .f60-gauge-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .f60-gauge-pct {
    font-size: var(--ui-text-xs, 0.75rem);
    font-weight: 600;
    color: var(--sc-text-1, rgba(255, 255, 255, 0.7));
  }

  .f60-gauge-track {
    height: 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .f60-gauge-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #6366f1, #8b5cf6);
    transition: width 0.4s ease;
  }

  .f60-stats-row {
    display: flex;
    gap: 20px;
  }

  .f60-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .f60-stat-label {
    font-size: var(--ui-text-xs, 0.75rem);
    color: var(--sc-text-2, rgba(255, 255, 255, 0.4));
  }

  .f60-stat-val {
    font-size: var(--ui-text-sm, 0.875rem);
    font-weight: 600;
    color: var(--sc-text-1, rgba(255, 255, 255, 0.7));
    font-variant-numeric: tabular-nums;
  }

  .f60-stat-val.ok {
    color: #4ade80;
  }
</style>
