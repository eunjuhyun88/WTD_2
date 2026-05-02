<script lang="ts">
  /**
   * PhaseBadge.svelte — Layer 2 DOM chip
   *
   * Positioned top-right of the chart canvas overlay.
   * Container must be pointer-events: none; only this chip is pointer-events: auto.
   *
   * Phase colors and Korean copy come from PHASE_META (phaseInfo.ts).
   * Chip is tappable; tapping surfaces the Tooltip with Korean phase meaning.
   */
  import Tooltip from '$lib/components/ui/Tooltip.svelte';
  import { PHASE_META, type Phase } from '$lib/terminal/phaseInfo.js';

  interface Props {
    phase?: string | null;
    /** Optional confidence 0-1 */
    confidence?: number | null;
    onclick?: () => void;
  }

  let {
    phase = null,
    confidence = null,
    onclick,
  }: Props = $props();

  // Resolve phase meta. Fall back gracefully for unknown phase strings.
  const meta = $derived(
    phase && phase in PHASE_META
      ? PHASE_META[phase as Phase]
      : null
  );

  // Color: prefer PHASE_META tint; otherwise a neutral fallback.
  const chipColor = $derived(meta?.color ?? 'rgba(131, 188, 255, 0.4)');

  // Tooltip label: koLabel — meaning
  const tooltipLabel = $derived(
    meta ? `${meta.koLabel}` : (phase ?? '')
  );
  const tooltipSublabel = $derived(
    meta ? meta.tradingRule : undefined
  );
</script>

{#if phase}
  <Tooltip label={tooltipLabel} sublabel={tooltipSublabel}>
    <button
      class="phase-badge"
      style="--chip-color: {chipColor};"
      type="button"
      onclick={onclick}
    >
      <span class="phase-name">{phase}</span>
      {#if confidence !== null && confidence !== undefined}
        <span class="phase-conf">{Math.round(confidence * 100)}%</span>
      {/if}
    </button>
  </Tooltip>
{/if}

<style>
  .phase-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 3px;
    border: 1px solid color-mix(in srgb, var(--chip-color) 60%, transparent);
    background: var(--chip-color);
    cursor: pointer;
    /* Only this element gets pointer-events inside the overlay */
    pointer-events: auto;
    transition: filter 0.1s ease;
  }

  .phase-badge:hover {
    filter: brightness(1.25);
  }

  .phase-name {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(247, 242, 234, 0.92);
  }

  .phase-conf {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(247, 242, 234, 0.55);
  }
</style>
