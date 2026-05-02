<script lang="ts">
  /**
   * Archetype E — Regime Badge + Flip Clock
   *
   * Shows the *current state* of a regime-aware indicator (funding flip,
   * CVD flip, gamma flip, market regime) with a clock since the last flip.
   *
   * The visual intent is banner-style: large type, amber-on-neutral.
   * Trader sees "funding flipped 6h ago" at a glance and drops an entry marker.
   */
  import type { IndicatorDef, IndicatorValue, RegimeState } from '$lib/indicators/types';

  interface Props {
    def: IndicatorDef;
    value: IndicatorValue;
  }
  let { def, value }: Props = $props();

  const state = $derived<RegimeState | null>(
    value.state
      ?? (typeof value.current === 'object' && value.current && 'label' in (value.current as object)
          ? (value.current as RegimeState)
          : null)
  );

  const clock = $derived.by(() => {
    const t = state?.flippedAt;
    if (!t) return null;
    const ms = Date.now() - new Date(t).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    const hours = ms / 3_600_000;
    if (hours < 1) return `${Math.round(ms / 60_000)}m ago`;
    if (hours < 24) return `${hours.toFixed(1)}h ago`;
    return `${(hours / 24).toFixed(1)}d ago`;
  });

  const directionClass = $derived(
    state?.direction === 'bull' ? 'bull'
    : state?.direction === 'bear' ? 'bear'
    : 'neutral'
  );
</script>

<div class="regime dir-{directionClass}" title={def.description ?? def.label ?? def.id}>
  <span class="lead" aria-hidden="true">
    {#if state?.direction === 'bull'}↗{:else if state?.direction === 'bear'}↘{:else}•{/if}
  </span>
  <div class="content">
    <div class="head">
      <span class="label">{def.label ?? def.id}</span>
      <span class="state-label">{state?.label ?? '—'}</span>
    </div>
    {#if clock || state?.persistedBars}
      <div class="meta">
        {#if clock}<span class="clock">⏱ {clock}</span>{/if}
        {#if state?.persistedBars}<span class="bars">· persisted {state.persistedBars} bars</span>{/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .regime {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 14px;
    border-radius: 3px;
    font-family: var(--sc-font-mono, monospace);
    background: color-mix(in oklab, currentColor 8%, transparent);
    color: var(--g9, rgba(255, 255, 255, 0.85));
  }

  .lead {
    font-size: 18px;
    line-height: 1;
    opacity: 0.9;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .label {
    font-size: var(--ui-text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--g6, rgba(255, 255, 255, 0.5));
  }

  .state-label {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .meta {
    font-size: var(--ui-text-xs);
    color: var(--g6, rgba(255, 255, 255, 0.55));
  }

  .clock {
    font-variant-numeric: tabular-nums;
  }

  /* Direction tones */
  .dir-bull {
    color: var(--pos, #4fb872);
    background: color-mix(in oklab, var(--pos, #4fb872) 10%, transparent);
  }
  .dir-bear {
    color: var(--neg, #d66c7a);
    background: color-mix(in oklab, var(--neg, #d66c7a) 10%, transparent);
  }
  .dir-neutral {
    color: var(--amb, #f0b847);
    background: color-mix(in oklab, var(--amb, #f0b847) 10%, transparent);
  }
</style>
