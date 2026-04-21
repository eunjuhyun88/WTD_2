<script lang="ts">
  /**
   * Archetype J — Event Timeline
   *
   * Discrete events on a horizontal time axis.
   * Dot size = impact (0-1). Hover tooltip shows label + time.
   * Familiar from Arkham activity feed / Glassnode event alerts.
   *
   * Phase 1: renders TimelineEvent[] from adapter stub.
   * Phase 2: Arkham whale transfers.
   */
  import type { IndicatorDef, IndicatorValue, TimelineEvent } from '$lib/indicators/types';

  interface Props { def: IndicatorDef; value: IndicatorValue; }
  let { def, value }: Props = $props();

  const W = 120, H = 28;
  const MIN_R = 3, MAX_R = 8;

  const events = $derived.by((): TimelineEvent[] => {
    const c = value.current;
    if (!Array.isArray(c) || !c.length) return [];
    if (typeof (c[0] as TimelineEvent).ts === 'number') return c as TimelineEvent[];
    return [];
  });

  // Sort by time ascending
  const sorted = $derived([...events].sort((a, b) => a.ts - b.ts));

  // Map timestamps to x coordinates
  const dots = $derived.by(() => {
    if (!sorted.length) return [];
    const tMin = sorted[0].ts;
    const tMax = sorted[sorted.length - 1].ts;
    const tRange = tMax - tMin || 1;
    const PAD = MAX_R;
    return sorted.map(ev => ({
      ...ev,
      x: PAD + ((ev.ts - tMin) / tRange) * (W - PAD * 2),
      r: MIN_R + ev.impact * (MAX_R - MIN_R),
    }));
  });

  function relTime(ts: number): string {
    const ms = Date.now() - ts;
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    if (h >= 24) return `${Math.floor(h / 24)}d`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  const latestLabel = $derived(sorted.length ? sorted[sorted.length - 1].label : '—');
  const latestAge   = $derived(sorted.length ? relTime(sorted[sorted.length - 1].ts) : '');
</script>

<div class="timeline" title={def.description ?? def.label ?? def.id}>
  <div class="label">{def.label ?? def.id}</div>
  <div class="value-row">
    <span class="latest">{latestLabel}</span>
    {#if latestAge}<span class="age">{latestAge}</span>{/if}
  </div>

  {#if dots.length}
    <svg class="chart" viewBox="0 0 {W} {H}" aria-hidden="true">
      <!-- baseline -->
      <line class="baseline" x1="0" y1={H / 2} x2={W} y2={H / 2} />
      {#each dots as dot}
        <circle
          class="dot"
          cx={dot.x}
          cy={H / 2}
          r={dot.r}
        >
          <title>{dot.label} ({relTime(dot.ts)} ago)</title>
        </circle>
      {/each}
    </svg>
  {:else}
    <div class="empty">—</div>
  {/if}
</div>

<style>
  .timeline {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 10px;
    font-family: var(--sc-font-mono, ui-monospace, monospace);
    font-size: 11px;
    line-height: 1.15;
    min-width: 120px;
    color: var(--g9, rgba(255,255,255,0.85));
  }

  .label {
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--g6, rgba(255,255,255,0.5));
  }

  .value-row {
    display: flex;
    align-items: baseline;
    gap: 5px;
    min-height: 16px;
  }

  .latest {
    font-size: 10px;
    font-weight: 500;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 90px;
    color: var(--g9, rgba(255,255,255,0.85));
  }

  .age {
    font-size: 8px;
    color: var(--g5, rgba(255,255,255,0.38));
    flex-shrink: 0;
  }

  .chart {
    display: block;
    width: 100%;
    height: 28px;
    overflow: visible;
  }

  .baseline {
    stroke: color-mix(in oklab, currentColor 15%, transparent);
    stroke-width: 1;
  }

  .dot {
    fill: var(--amb, #f0b847);
    opacity: 0.85;
    cursor: default;
  }

  .dot:hover {
    opacity: 1;
  }

  .empty {
    font-size: 12px;
    color: var(--g4, rgba(255,255,255,0.28));
    height: 28px;
    display: flex;
    align-items: center;
  }
</style>
