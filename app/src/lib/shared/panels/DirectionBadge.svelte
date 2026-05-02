<script lang="ts">
  type DirectionInput = 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT' | 'long' | 'short' | 'neutral' | 'wait';
  type Size = 'xs' | 'sm' | 'md';
  type Variant = 'solid' | 'soft';

  export let direction: DirectionInput | string = 'NEUTRAL';
  export let confidence: number | null = null;
  export let showArrow = true;
  export let showConfidence = false;
  export let size: Size = 'sm';
  export let variant: Variant = 'soft';

  $: normalized = String(direction || 'neutral').toLowerCase();
  $: tone = normalized === 'long'
    ? 'long'
    : normalized === 'short'
      ? 'short'
      : 'neutral';
  $: label = tone === 'long' ? 'LONG' : tone === 'short' ? 'SHORT' : 'NEUTRAL';
  $: arrow = tone === 'long' ? '▲' : tone === 'short' ? '▼' : '◆';
</script>

<span class="dir-badge {tone} {size} {variant}">
  {#if showArrow}
    <span class="db-arrow">{arrow}</span>
  {/if}
  <span class="db-label">{label}</span>
  {#if showConfidence && confidence != null}
    <span class="db-conf">{Math.round(confidence)}%</span>
  {/if}
</span>

<style>
  .dir-badge {
    --db-long: #00e676;
    --db-short: #ff2d55;
    --db-neutral: rgba(240, 237, 228, 0.72);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-radius: 999px;
    border: 1px solid transparent;
    font-family: var(--fm, 'JetBrains Mono', monospace);
    font-weight: 800;
    line-height: 1;
    letter-spacing: .4px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .dir-badge.soft.long {
    color: var(--db-long);
    border-color: rgba(0, 230, 118, 0.28);
    background: rgba(0, 230, 118, 0.12);
  }
  .dir-badge.soft.short {
    color: var(--db-short);
    border-color: rgba(255, 45, 85, 0.28);
    background: rgba(255, 45, 85, 0.12);
  }
  .dir-badge.soft.neutral {
    color: var(--db-neutral);
    border-color: rgba(240, 237, 228, 0.2);
    background: rgba(240, 237, 228, 0.08);
  }

  .dir-badge.solid.long {
    color: #06140b;
    border-color: rgba(0, 230, 118, 0.58);
    background: rgba(0, 230, 118, 0.9);
  }
  .dir-badge.solid.short {
    color: #fff;
    border-color: rgba(255, 45, 85, 0.58);
    background: rgba(255, 45, 85, 0.9);
  }
  .dir-badge.solid.neutral {
    color: #132015;
    border-color: rgba(240, 237, 228, 0.5);
    background: rgba(240, 237, 228, 0.86);
  }

  .dir-badge.xs {
    padding: 2px 5px;
    font-size: var(--ui-text-xs);
  }
  .dir-badge.sm {
    padding: 3px 7px;
    font-size: var(--ui-text-xs);
  }
  .dir-badge.md {
    padding: 4px 9px;
    font-size: var(--ui-text-xs);
  }

  .db-arrow,
  .db-label,
  .db-conf {
    display: inline-flex;
    align-items: center;
  }
</style>
