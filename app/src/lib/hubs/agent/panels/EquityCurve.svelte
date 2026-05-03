<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    agentId: string;
  }
  const { agentId }: Props = $props();

  interface Snapshot {
    snapshot_date: string;
    cumulative_decisions: number;
    decision_count: number;
  }

  let snapshots = $state<Snapshot[]>([]);
  let loading = $state(true);
  let error = $state(false);

  const W = 600;
  const H = 120;

  const path = $derived.by(() => {
    if (snapshots.length < 2) return '';
    const vals = snapshots.map((s) => s.cumulative_decisions);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 1;

    return snapshots
      .map((s, i) => {
        const x = (i / (snapshots.length - 1)) * W;
        const y = H - ((s.cumulative_decisions - minV) / range) * (H - 16) - 8;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  });

  const latest = $derived(snapshots[snapshots.length - 1]);
  const oldest = $derived(snapshots[0]);
  const growth = $derived(
    latest && oldest && oldest.cumulative_decisions > 0
      ? (
          ((latest.cumulative_decisions - oldest.cumulative_decisions) /
            oldest.cumulative_decisions) *
          100
        ).toFixed(1)
      : null
  );

  onMount(async () => {
    try {
      const res = await fetch(`/api/agents/stats/${agentId}/equity`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      // API returns { rows: [...] } or { snapshots: [...] }
      const raw: Array<{ snapshot_date: string; cumulative_decisions: number | string; decision_count: number | string }> =
        data.rows ?? data.snapshots ?? [];
      snapshots = raw.map((r) => ({
        snapshot_date: r.snapshot_date,
        cumulative_decisions: Number(r.cumulative_decisions),
        decision_count: Number(r.decision_count),
      }));
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  });
</script>

<div class="equity-curve">
  <div class="eq-header">
    <span class="eq-title">90일 결정 누적</span>
    {#if growth != null}
      <span class="eq-growth">+{growth}%</span>
    {/if}
  </div>

  {#if loading}
    <div class="eq-skeleton" aria-label="loading"></div>
  {:else if error || snapshots.length < 2}
    <div class="eq-empty">데이터 없음</div>
  {:else}
    <svg
      viewBox="0 0 {W} {H}"
      class="eq-svg"
      role="img"
      aria-label="90-day decision curve"
    >
      <defs>
        <linearGradient id="eq-grad-{agentId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#4ade80" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#4ade80" stop-opacity="0" />
        </linearGradient>
      </defs>
      <!-- Fill area -->
      <path d="{path} L {W} {H} L 0 {H} Z" fill="url(#eq-grad-{agentId})" />
      <!-- Line -->
      <path d={path} fill="none" stroke="#4ade80" stroke-width="1.5" />
    </svg>
    <div class="eq-footer">
      <span class="eq-date">{oldest?.snapshot_date?.slice(0, 10)}</span>
      <span class="eq-date">{latest?.snapshot_date?.slice(0, 10)}</span>
    </div>
  {/if}
</div>

<style>
  .equity-curve {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    background: var(--g2, rgba(255, 255, 255, 0.03));
    border-radius: 8px;
    border: 1px solid var(--g3, rgba(255, 255, 255, 0.07));
  }

  .eq-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .eq-title {
    font-size: var(--ui-text-sm, 0.8rem);
    color: var(--g7, rgba(255, 255, 255, 0.55));
  }

  .eq-growth {
    font-size: var(--ui-text-sm, 0.8rem);
    color: var(--pos, #4ade80);
    font-family: 'JetBrains Mono', monospace;
  }

  .eq-svg {
    width: 100%;
    height: 120px;
    display: block;
  }

  .eq-skeleton {
    height: 120px;
    background: var(--g3, rgba(255, 255, 255, 0.07));
    border-radius: 4px;
    animation: eq-pulse 1.5s ease-in-out infinite;
  }

  .eq-empty {
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--ui-text-sm, 0.8rem);
    color: var(--g5, rgba(255, 255, 255, 0.3));
  }

  .eq-footer {
    display: flex;
    justify-content: space-between;
  }

  .eq-date {
    font-size: var(--ui-text-xs, 0.75rem);
    color: var(--g5, rgba(255, 255, 255, 0.3));
    font-family: 'JetBrains Mono', monospace;
  }

  @keyframes eq-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
</style>
