<script lang="ts">
  interface F60Status {
    user_id: string;
    gate_passed: boolean;
    verdict_count: number;
    resolved_count: number;
    accuracy: number;
    remaining_to_threshold: number;
    thresholds: { min_resolved: number; min_accuracy: number };
    breakdown?: Record<string, unknown>;
  }

  interface Props {
    userId: string;
    compact?: boolean;
  }

  let { userId, compact = false }: Props = $props();

  let status = $state<F60Status | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function fetchStatus() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/users/${userId}/f60-status`);
      if (!res.ok) throw new Error(`${res.status}`);
      status = await res.json();
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (userId) fetchStatus();
  });

  let verdictPct = $derived(
    status ? Math.min((status.resolved_count / status.thresholds.min_resolved) * 100, 100) : 0
  );
  let accuracyPct = $derived(
    status ? Math.min((status.accuracy / status.thresholds.min_accuracy) * 100, 100) : 0
  );
</script>

{#if loading}
  <div class="f60-bar loading">...</div>
{:else if error}
  <div class="f60-bar error">F60 load failed</div>
{:else if status}
  <div class="f60-bar" class:compact class:passed={status.gate_passed}>
    {#if !compact}
      <div class="f60-header">
        <span class="f60-label">F-60 Gate</span>
        {#if status.gate_passed}
          <span class="badge passed">UNLOCKED</span>
        {:else}
          <span class="badge pending">{status.remaining_to_threshold} left</span>
        {/if}
      </div>
    {/if}

    <div class="bars">
      <div class="bar-row">
        <span class="bar-label">Verdicts</span>
        <div class="progress-track">
          <div class="progress-fill verdicts" style="width: {verdictPct}%"></div>
        </div>
        <span class="bar-value">{status.resolved_count}/{status.thresholds.min_resolved}</span>
      </div>

      <div class="bar-row">
        <span class="bar-label">Accuracy</span>
        <div class="progress-track">
          <div class="progress-fill accuracy" style="width: {accuracyPct}%"></div>
        </div>
        <span class="bar-value">{(status.accuracy * 100).toFixed(1)}%</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .f60-bar {
    padding: 8px 12px;
    background: var(--surface-2, #1a1a2e);
    border: 1px solid var(--border, #2a2a40);
    border-radius: 6px;
    font-size: 12px;
    color: var(--text-muted, #8888aa);
  }

  .f60-bar.passed {
    border-color: var(--accent-green, #00ff88);
  }

  .f60-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .f60-label {
    font-weight: 600;
    color: var(--text, #ccccdd);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .badge {
    font-size: var(--ui-text-xs);
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .badge.passed {
    background: var(--accent-green, #00ff88);
    color: #000;
  }

  .badge.pending {
    background: var(--surface-3, #252535);
    color: var(--text-muted, #8888aa);
    border: 1px solid var(--border, #2a2a40);
  }

  .bars {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bar-label {
    width: 56px;
    font-size: var(--ui-text-xs);
    color: var(--text-muted, #8888aa);
    flex-shrink: 0;
  }

  .progress-track {
    flex: 1;
    height: 4px;
    background: var(--surface-3, #252535);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .progress-fill.verdicts {
    background: var(--accent-blue, #4488ff);
  }

  .progress-fill.accuracy {
    background: var(--accent-purple, #aa44ff);
  }

  .bar-value {
    width: 48px;
    text-align: right;
    font-size: var(--ui-text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--text, #ccccdd);
    flex-shrink: 0;
  }

  .loading, .error {
    text-align: center;
    padding: 8px;
    font-size: 11px;
  }

  .compact {
    padding: 4px 8px;
  }

  .compact .bars {
    gap: 4px;
  }
</style>
