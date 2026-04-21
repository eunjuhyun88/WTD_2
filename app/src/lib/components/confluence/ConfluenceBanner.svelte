<script lang="ts">
  /**
   * ConfluenceBanner — top-of-page directional score with contribution breakdown.
   *
   * Part of W-0122 Confluence Engine. Reads a ConfluenceResult and renders:
   *   ⟨score bar with regime color⟩
   *   ⟨top 3 contributing pillars as chips with sign arrows⟩
   *   ⟨divergence badge when signals disagree⟩
   *
   * The contributions are ranked by magnitude so traders immediately see
   * *why* the score is what it is, not just the number.
   */
  import type { ConfluenceResult, ConfluenceContribution } from '$lib/confluence/types';

  interface Props {
    value: ConfluenceResult | null;
    compact?: boolean;
  }

  let { value, compact = false }: Props = $props();

  const pct = $derived(value?.score ?? 0);
  const confPct = $derived(Math.round((value?.confidence ?? 0) * 100));

  const regimeLabel = $derived.by(() => {
    switch (value?.regime) {
      case 'strong_bull': return 'STRONG BULL';
      case 'bull':        return 'BULL';
      case 'bear':        return 'BEAR';
      case 'strong_bear': return 'STRONG BEAR';
      default:            return 'NEUTRAL';
    }
  });

  const regimeClass = $derived.by(() => {
    switch (value?.regime) {
      case 'strong_bull': return 'regime-strong-bull';
      case 'bull':        return 'regime-bull';
      case 'bear':        return 'regime-bear';
      case 'strong_bear': return 'regime-strong-bear';
      default:            return 'regime-neutral';
    }
  });

  function signSymbol(c: ConfluenceContribution): string {
    if (c.score > 0.05) return '↗';
    if (c.score < -0.05) return '↘';
    return '·';
  }

  function signClass(c: ConfluenceContribution): string {
    if (c.score > 0.05) return 'pos';
    if (c.score < -0.05) return 'neg';
    return 'flat';
  }

  // Bar shows score from -100 to +100 centered at 0 (50% mark visually).
  const barWidth = $derived(Math.min(100, Math.abs(pct) / 2)); // 0-50 each side
  const barSide = $derived(pct >= 0 ? 'right' : 'left');
</script>

{#if value}
  <div class="confluence-banner {regimeClass}" class:compact>
    <div class="score-row">
      <div class="score-lead">
        <span class="regime-label">{regimeLabel}</span>
        <span class="score-value">{pct >= 0 ? '+' : ''}{pct.toFixed(0)}</span>
      </div>
      <div class="bar-track">
        <span class="bar-midpoint" aria-hidden="true"></span>
        {#if barSide === 'right'}
          <span class="bar-fill bar-right" style="width: {barWidth}%;"></span>
        {:else}
          <span class="bar-fill bar-left" style="width: {barWidth}%;"></span>
        {/if}
      </div>
      <div class="confidence">
        <span class="conf-label">conf</span>
        <span class="conf-value">{confPct}%</span>
      </div>
      {#if value.divergence}
        <span class="divergence-badge" title="Material contributions disagree — rare high-alpha window">
          ⚠ DIV
        </span>
      {/if}
    </div>

    {#if !compact && value.top.length}
      <ul class="contrib-list">
        {#each value.top as c (c.source)}
          <li class="chip {signClass(c)}" title={c.reason ?? ''}>
            <span class="sign" aria-hidden="true">{signSymbol(c)}</span>
            <span class="label">{c.label}</span>
            <span class="magnitude">{(c.magnitude * 100).toFixed(0)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .confluence-banner {
    display: grid;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    background: rgba(12, 14, 18, 0.6);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.82rem;
    color: rgba(255, 255, 255, 0.88);
  }
  .confluence-banner.compact { padding: 0.3rem 0.5rem; }

  .score-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .score-lead {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 11ch;
  }
  .regime-label {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    opacity: 0.7;
  }
  .score-value {
    font-size: 1.05rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .bar-track {
    position: relative;
    flex: 1;
    height: 6px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 3px;
    overflow: hidden;
  }
  .bar-midpoint {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(255, 255, 255, 0.22);
  }
  .bar-fill {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 3px;
    transition: width 300ms ease-out;
  }
  .bar-right { left: 50%; }
  .bar-left  { right: 50%; }

  .confidence {
    display: flex;
    gap: 0.3rem;
    font-size: 0.72rem;
    opacity: 0.7;
    min-width: 7ch;
  }
  .conf-value { font-variant-numeric: tabular-nums; }

  .divergence-badge {
    padding: 0.1rem 0.5rem;
    border-radius: 4px;
    background: rgba(245, 180, 80, 0.18);
    border: 1px solid rgba(245, 180, 80, 0.55);
    color: rgb(245, 180, 80);
    font-size: 0.68rem;
    letter-spacing: 0.05em;
  }

  .contrib-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.04);
    font-size: 0.72rem;
  }
  .chip .sign { font-weight: 700; }
  .chip .magnitude {
    opacity: 0.55;
    font-variant-numeric: tabular-nums;
  }
  .chip.pos .sign  { color: rgb(120, 220, 140); }
  .chip.neg .sign  { color: rgb(240, 120, 120); }
  .chip.flat .sign { color: rgba(255, 255, 255, 0.45); }

  /* Regime colors — subtle left border accent */
  .confluence-banner.regime-strong-bull { border-left: 2px solid rgb(120, 220, 140); }
  .confluence-banner.regime-bull        { border-left: 2px solid rgba(120, 220, 140, 0.6); }
  .confluence-banner.regime-neutral     { border-left: 2px solid rgba(255, 255, 255, 0.15); }
  .confluence-banner.regime-bear        { border-left: 2px solid rgba(240, 120, 120, 0.6); }
  .confluence-banner.regime-strong-bear { border-left: 2px solid rgb(240, 120, 120); }

  .bar-right { background: linear-gradient(90deg, rgba(120, 220, 140, 0.25), rgba(120, 220, 140, 0.8)); }
  .bar-left  { background: linear-gradient(270deg, rgba(240, 120, 120, 0.25), rgba(240, 120, 120, 0.8)); }
</style>
