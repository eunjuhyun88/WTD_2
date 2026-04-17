<script lang="ts">
  /**
   * PhaseBadge.svelte — Layer 2 DOM chip
   *
   * Positioned top-right of the chart canvas overlay.
   * Container must be pointer-events: none; only this chip is auto.
   */
  interface Props {
    phase?: string | null;
    tone?: 'bull' | 'bear' | 'warn' | 'neutral';
    /** Optional confidence 0-1 */
    confidence?: number | null;
    onclick?: () => void;
  }

  let {
    phase = null,
    tone = 'neutral',
    confidence = null,
    onclick,
  }: Props = $props();

  const TONE_COLORS: Record<string, string> = {
    bull:    'rgba(143,221,157,0.88)',
    bear:    'rgba(241,153,153,0.88)',
    warn:    'rgba(233,193,103,0.88)',
    neutral: 'rgba(131,188,255,0.85)',
  };

  const badgeColor = $derived(TONE_COLORS[tone] ?? TONE_COLORS.neutral);
</script>

{#if phase}
  <button
    class="phase-badge"
    style="--badge-color: {badgeColor};"
    type="button"
    onclick={onclick}
  >
    <span class="phase-name">{phase}</span>
    {#if confidence !== null && confidence !== undefined}
      <span class="phase-conf">{Math.round(confidence * 100)}%</span>
    {/if}
  </button>
{/if}

<style>
  .phase-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 3px;
    border: 1px solid color-mix(in srgb, var(--badge-color) 40%, transparent);
    background: color-mix(in srgb, var(--badge-color) 12%, rgba(13, 16, 22, 0.9));
    cursor: pointer;
    /* Only this element gets pointer-events inside the overlay */
    pointer-events: auto;
  }

  .phase-badge:hover {
    background: color-mix(in srgb, var(--badge-color) 22%, rgba(13, 16, 22, 0.9));
  }

  .phase-name {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--badge-color);
  }

  .phase-conf {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    color: color-mix(in srgb, var(--badge-color) 70%, rgba(247, 242, 234, 0.5));
  }
</style>
