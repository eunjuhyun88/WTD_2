<script lang="ts">
  /**
   * Archetype D — Divergence Indicator
   *
   * Shows the *relationship* between two time series: price ↔ CVD,
   * price ↔ OI, spot ↔ futures CVD, basis across venues.
   *
   * Phase 1: reads a pre-computed DivergenceState (type + bars + strength +
   * rankPercentile). Phase 2 could accept raw series pairs and compute here.
   */
  import type { IndicatorDef, IndicatorValue, DivergenceState } from '$lib/indicators/types';

  interface Props {
    def: IndicatorDef;
    value: IndicatorValue;
  }
  let { def, value }: Props = $props();

  const state = $derived<DivergenceState | null>(
    typeof value.current === 'object' && value.current && 'type' in (value.current as object)
      ? (value.current as DivergenceState)
      : null
  );

  const arrow = $derived(
    state?.type === 'bullish' ? '↗'
    : state?.type === 'bearish' ? '↘'
    : state?.type === 'aligned' ? '→'
    : '•'
  );

  const label = $derived.by(() => {
    if (!state) return 'NO DATA';
    if (state.type === 'bullish') return 'BULLISH DIVERGENCE';
    if (state.type === 'bearish') return 'BEARISH DIVERGENCE';
    if (state.type === 'aligned') return 'ALIGNED';
    return 'UNKNOWN';
  });

  const tone = $derived(
    state?.type === 'bullish' ? 'bull'
    : state?.type === 'bearish' ? 'bear'
    : 'neutral'
  );

  const extreme = $derived((state?.rankPercentile ?? 0) >= 95);

  const strengthPct = $derived(state?.strength != null ? Math.round(state.strength * 100) : null);
</script>

<div class="div tone-{tone}" class:extreme title={def.description ?? def.label ?? def.id}>
  <div class="head">
    <span class="arrow" aria-hidden="true">{arrow}</span>
    <span class="def-label">{def.label ?? def.id}</span>
    <span class="state-label">{label}</span>
  </div>
  {#if state}
    <div class="meta">
      {#if state.barsSince != null}<span class="bars">{state.barsSince} bars</span>{/if}
      {#if strengthPct != null}<span class="strength">· strength {strengthPct}%</span>{/if}
      {#if state.rankPercentile != null}<span class="rank">· rank p{Math.round(state.rankPercentile)}</span>{/if}
    </div>
    {#if strengthPct != null}
      <div class="bar" aria-hidden="true">
        <div class="bar-fill" style="width: {strengthPct}%"></div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .div {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 6px 10px;
    border-radius: 3px;
    font-family: var(--sc-font-mono, monospace);
    color: var(--g9, rgba(255, 255, 255, 0.85));
    background: color-mix(in oklab, currentColor 6%, transparent);
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .arrow {
    font-size: 14px;
    line-height: 1;
  }

  .def-label {
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--g6, rgba(255, 255, 255, 0.5));
  }

  .state-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .meta {
    font-size: 9px;
    color: var(--g6);
  }

  .bar {
    height: 3px;
    background: color-mix(in oklab, currentColor 12%, transparent);
    border-radius: 1.5px;
    overflow: hidden;
    margin-top: 2px;
  }

  .bar-fill {
    height: 100%;
    background: currentColor;
    opacity: 0.7;
    transition: width 200ms ease;
  }

  .tone-bull {
    color: var(--pos, #4fb872);
    background: color-mix(in oklab, var(--pos, #4fb872) 10%, transparent);
  }
  .tone-bear {
    color: var(--neg, #d66c7a);
    background: color-mix(in oklab, var(--neg, #d66c7a) 10%, transparent);
  }
  .tone-neutral {
    color: var(--g9);
  }

  .extreme {
    animation: ind-pulse 2.4s ease-in-out infinite;
  }

  @keyframes ind-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.6; }
  }
</style>
