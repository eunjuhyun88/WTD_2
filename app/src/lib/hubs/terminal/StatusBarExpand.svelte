<script lang="ts">
  import HoldTimeStrip from '$lib/components/shared/HoldTimeStrip.svelte';

  interface Props {
    btcFR: number | null;
    kimchiPct: number | null;
    holdP50: number | null;
    holdP90: number | null;
    frClass: string;
    kimchiClass: string;
  }

  const { btcFR, kimchiPct, holdP50, holdP90, frClass, kimchiClass }: Props = $props();
</script>

<!--
  Tier-2 expanded strip shown when [data-statusbar-expanded=true].
  Slides up from bottom of StatusBar as an inline row below the Tier-1 strip.
-->
<div class="expand-row" role="complementary" aria-label="Status detail">
  {#if btcFR !== null}
    <span class="exp-item" title="BTC perpetual funding rate (8h)">
      <span class="exp-label">FR</span>
      <strong class={frClass}>{btcFR > 0 ? '+' : ''}{(btcFR * 100).toFixed(3)}%</strong>
    </span>
    <span class="exp-divider">│</span>
  {/if}

  {#if kimchiPct !== null}
    <span class="exp-item" title="Kimchi Premium — Upbit/Binance BTC spread">
      <span class="exp-label">Kim</span>
      <strong class={kimchiClass}>{kimchiPct > 0 ? '+' : ''}{kimchiPct.toFixed(2)}%</strong>
    </span>
    <span class="exp-divider">│</span>
  {/if}

  <span class="exp-item" title="Hold-time p50/p90 for unresolved watch patterns" data-testid="hold-time-strip-expand">
    <HoldTimeStrip p50={holdP50} p90={holdP90} label="hold" />
  </span>

  <span class="exp-divider">│</span>

  <span class="exp-item" title="Scanner: 300 symbols active, last scan 14s ago">
    <span class="exp-label">scanner</span>
    <strong>300 sym</strong>
    <span class="exp-muted">14s</span>
  </span>

  <span class="exp-divider">│</span>

  <span class="exp-item" title="System health">
    <span class="exp-dot exp-dot--ok"></span>
    <span class="exp-label">sys ok</span>
  </span>
</div>

<style>
  .expand-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2, 8px);
    padding: 0 var(--sp-2, 8px);
    height: 28px;
    background: var(--surface-2, #1c2026);
    border-top: 1px solid var(--border-subtle, #232830);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--type-xs, 10px);
    color: var(--text-secondary, #9aa3b2);
    letter-spacing: 0.04em;
  }

  .exp-item {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1, 4px);
  }

  .exp-item strong {
    color: var(--text-primary, #e8ebf0);
  }

  .exp-label {
    color: var(--text-tertiary, #5a6172);
  }

  .exp-muted {
    color: var(--text-tertiary, #5a6172);
  }

  .exp-divider {
    color: var(--border-subtle, #232830);
  }

  .exp-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    display: inline-block;
  }

  .exp-dot--ok {
    background: var(--accent-pos, #26d07a);
  }

  .exp-dot--warn {
    background: var(--accent-amb, #f5b942);
  }

  .exp-dot--err {
    background: var(--accent-neg, #ff5a4f);
  }
</style>
