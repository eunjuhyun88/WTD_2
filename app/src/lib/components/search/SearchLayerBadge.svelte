<script lang="ts">
  import { onMount } from 'svelte';

  type LayerStatus = 'off' | 'training' | 'active';

  interface ActiveModelData {
    status: string;
    version?: string;
    training_size?: number;
    ndcg_at_5?: number;
    ci_lower?: number;
    lgbm_weight: number;
  }

  let status = $state<LayerStatus>('off');
  let data = $state<ActiveModelData | null>(null);
  let showTooltip = $state(false);

  onMount(() => {
    fetchStatus();
    // Refresh every 5 minutes
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  });

  async function fetchStatus() {
    try {
      const res = await fetch('/api/engine/scoring/active-model');
      if (!res.ok) return;
      const json: ActiveModelData = await res.json();
      data = json;
      if (json.status === 'active' && json.lgbm_weight > 0) {
        status = 'active';
      } else if (json.status === 'shadow' || (json.status === 'active' && json.lgbm_weight === 0)) {
        status = 'training';
      } else {
        status = 'off';
      }
    } catch {
      // Non-fatal — badge just stays 'off'
    }
  }

  const label: Record<LayerStatus, string> = {
    off: 'Layer C: OFF',
    training: 'Layer C: Shadow',
    active: 'Layer C: ON',
  };

  const dotClass: Record<LayerStatus, string> = {
    off: 'dot dot--off',
    training: 'dot dot--training',
    active: 'dot dot--active',
  };
</script>

<div class="badge-wrap">
  <button
    class="badge badge--{status}"
    type="button"
    title={label[status]}
    onmouseenter={() => (showTooltip = true)}
    onmouseleave={() => (showTooltip = false)}
    onfocus={() => (showTooltip = true)}
    onblur={() => (showTooltip = false)}
    aria-label={label[status]}
  >
    <span class={dotClass[status]}></span>
    <span class="badge-text">{label[status]}</span>
  </button>

  {#if showTooltip && data}
    <div class="tooltip" role="tooltip">
      {#if status === 'off'}
        <p>Layer C inactive. Save 50+ verdicts to train.</p>
      {:else if status === 'training'}
        <p>Model in shadow evaluation.</p>
        {#if data.training_size}
          <p>Trained on {data.training_size} verdicts</p>
        {/if}
        {#if data.ndcg_at_5 !== undefined}
          <p>NDCG@5: {data.ndcg_at_5.toFixed(3)}</p>
        {/if}
      {:else}
        <p>Layer C blending at weight {data.lgbm_weight.toFixed(2)}</p>
        {#if data.version}<p>Version: {data.version}</p>{/if}
        {#if data.ndcg_at_5 !== undefined}
          <p>NDCG@5: {data.ndcg_at_5.toFixed(3)}</p>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .badge-wrap {
    position: relative;
    display: inline-flex;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 7px;
    border-radius: 10px;
    border: 1px solid transparent;
    background: var(--surface-2, #1e1e1e);
    cursor: default;
    font-size: var(--ui-text-xs, 11px);
    line-height: 1.4;
    white-space: nowrap;
    color: var(--text-muted, #888);
  }

  .badge--active {
    border-color: color-mix(in srgb, var(--pos, #26a69a) 40%, transparent);
    color: var(--pos, #26a69a);
  }

  .badge--training {
    border-color: color-mix(in srgb, var(--amb, #f0b429) 40%, transparent);
    color: var(--amb, #f0b429);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot--off {
    background: var(--text-muted, #555);
  }

  .dot--training {
    background: var(--amb, #f0b429);
    animation: pulse 1.6s ease-in-out infinite;
  }

  .dot--active {
    background: var(--pos, #26a69a);
  }

  .badge-text {
    font-size: var(--ui-text-xs, 11px);
  }

  .tooltip {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 100;
    background: var(--surface-3, #2a2a2a);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    padding: 8px 10px;
    min-width: 180px;
    font-size: var(--ui-text-xs, 11px);
    color: var(--text-2, #ccc);
    pointer-events: none;
  }

  .tooltip p {
    margin: 0 0 3px;
  }

  .tooltip p:last-child {
    margin-bottom: 0;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
