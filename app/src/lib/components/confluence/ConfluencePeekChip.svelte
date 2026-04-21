<script lang="ts">
  /**
   * ConfluencePeekChip — compact inline confluence summary for narrow surfaces
   * (peek-bar, drawer-header, scan-header, Layout C sidebar).
   *
   * Shows regime icon + score + direction arrow + divergence streak badge
   * in ~120px width. Clicking fires an optional callback (caller wires to
   * open the analyze drawer / tab).
   */
  import type { ConfluenceResult } from '$lib/confluence/types';

  interface Props {
    value: ConfluenceResult | null;
    onOpen?: () => void;
  }

  let { value, onOpen }: Props = $props();

  const score = $derived(value?.score ?? 0);
  const regime = $derived(value?.regime ?? 'neutral');
  const divStreak = $derived(value?.divergenceStreak ?? 0);

  const regimeIcon = $derived.by(() => {
    switch (regime) {
      case 'strong_bull': return '⟐';
      case 'bull':        return '⟐';
      case 'bear':        return '⟐';
      case 'strong_bear': return '⟐';
      default:            return '•';
    }
  });

  const regimeShort = $derived.by(() => {
    switch (regime) {
      case 'strong_bull': return 'S.BULL';
      case 'bull':        return 'BULL';
      case 'bear':        return 'BEAR';
      case 'strong_bear': return 'S.BEAR';
      default:            return 'NEUT';
    }
  });

  const arrow = $derived.by(() => {
    if (score > 5) return '↗';
    if (score < -5) return '↘';
    return '·';
  });

  const classes = $derived(`chip regime-${regime.replace('_', '-')}`);
</script>

{#if value}
  <button
    type="button"
    class={classes}
    title={`Confluence ${score >= 0 ? '+' : ''}${score.toFixed(0)} · ${regime}${divStreak > 0 ? ` · div streak ${divStreak}` : ''}`}
    onclick={onOpen}
    disabled={!onOpen}
  >
    <span class="icon" aria-hidden="true">{regimeIcon}</span>
    <span class="score">{score >= 0 ? '+' : ''}{score.toFixed(0)}</span>
    <span class="regime">{regimeShort}</span>
    <span class="arrow" aria-hidden="true">{arrow}</span>
    {#if divStreak > 1}
      <span class="div-badge" title="Divergence has held for {divStreak} consecutive reads">
        DIV·{divStreak}
      </span>
    {:else if value.divergence}
      <span class="div-badge">DIV</span>
    {/if}
  </button>
{/if}

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.12rem 0.5rem;
    height: 22px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(12, 14, 18, 0.6);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.68rem;
    letter-spacing: 0.02em;
    color: rgba(255, 255, 255, 0.88);
    cursor: pointer;
    transition: background 150ms ease-out, border-color 150ms ease-out;
  }
  .chip:hover:not(:disabled) {
    background: rgba(20, 22, 28, 0.75);
    border-color: rgba(255, 255, 255, 0.16);
  }
  .chip:disabled { cursor: default; }

  .icon { font-weight: 700; }
  .score {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .regime {
    opacity: 0.6;
    font-size: 0.62rem;
  }
  .arrow { font-size: 0.72rem; }

  .div-badge {
    margin-left: 0.2rem;
    padding: 0 0.3rem;
    border-radius: 3px;
    background: rgba(245, 180, 80, 0.18);
    color: rgb(245, 180, 80);
    font-size: 0.6rem;
    letter-spacing: 0.04em;
    border: 1px solid rgba(245, 180, 80, 0.4);
  }

  .regime-strong-bull { border-left: 2px solid rgb(120, 220, 140); }
  .regime-bull        { border-left: 2px solid rgba(120, 220, 140, 0.6); }
  .regime-neutral     { border-left: 2px solid rgba(255, 255, 255, 0.15); }
  .regime-bear        { border-left: 2px solid rgba(240, 120, 120, 0.6); }
  .regime-strong-bear { border-left: 2px solid rgb(240, 120, 120); }

  .regime-strong-bull .icon, .regime-bull .icon        { color: rgb(120, 220, 140); }
  .regime-strong-bear .icon, .regime-bear .icon        { color: rgb(240, 120, 120); }
  .regime-strong-bull .arrow, .regime-bull .arrow      { color: rgb(120, 220, 140); }
  .regime-strong-bear .arrow, .regime-bear .arrow      { color: rgb(240, 120, 120); }
</style>
