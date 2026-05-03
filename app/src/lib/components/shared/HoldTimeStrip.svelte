<script lang="ts">
  interface Props {
    p50?: number | null;
    p90?: number | null;
    label?: string;
  }
  const { p50 = null, p90 = null, label = 'Hold Time' }: Props = $props();

  function color(v: number | null): string {
    if (v == null) return 'var(--g6, rgba(255,255,255,0.4))';
    if (v < 5) return 'var(--g4, rgba(255,255,255,0.25))';
    if (v < 20) return 'var(--amb, #f5a623)';
    return 'var(--neg, #f87171)';
  }

  function fmt(v: number | null): string {
    return v == null ? '—' : `${v}b`;
  }
</script>

<div class="hold-strip">
  <span class="hold-label">{label}</span>
  <span class="hold-val" style="color: {color(p50)}">p50 {fmt(p50)}</span>
  <span class="hold-sep">·</span>
  <span class="hold-val" style="color: {color(p90)}">p90 {fmt(p90)}</span>
</div>

<style>
  .hold-strip {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .hold-label {
    font-size: var(--ui-text-xs, 0.75rem);
    color: var(--g6, rgba(255, 255, 255, 0.4));
  }

  .hold-val {
    font-size: var(--ui-text-xs, 0.75rem);
    font-family: 'JetBrains Mono', monospace;
  }

  .hold-sep {
    color: var(--g5, rgba(255, 255, 255, 0.3));
    font-size: var(--ui-text-xs, 0.75rem);
  }
</style>
