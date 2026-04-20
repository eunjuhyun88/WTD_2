<script lang="ts">
  import type { TerminalVerdict } from '$lib/types/terminal';
  import { canonicalSymbol } from '$lib/stores/terminalState';
  import FreshnessBadge from './FreshnessBadge.svelte';

  interface Props {
    verdict: TerminalVerdict;
  }
  let { verdict }: Props = $props();

  const dirColor = { bullish: '#4ade80', bearish: '#f87171', neutral: 'rgba(247,242,234,0.5)' };
  const dirLabel = { bullish: 'BULLISH', bearish: 'BEARISH', neutral: 'NEUTRAL' };
  const confLabel = { high: 'High', medium: 'Med', low: 'Low' };
</script>

<div class="verdict-header" style="--dir-color: {dirColor[verdict.direction]}">
  <div class="top-row">
    <span class="symbol-label">{$canonicalSymbol?.slice(0, -4) ?? 'BTC'}</span>
    <span class="direction-badge">
      <span class="dot"></span>
      {dirLabel[verdict.direction]}
    </span>
    <span class="meta-right">
      <FreshnessBadge status="recent" updatedAt={verdict.updatedAt} />
    </span>
  </div>
  <p class="reason">{verdict.reason}</p>
  <div class="conf-row">
    <span class="conf-label">Confidence <strong>{confLabel[verdict.confidence]}</strong></span>
    {#if verdict.action}
      <span class="action">{verdict.action}</span>
    {/if}
  </div>
</div>

<style>
  .verdict-header { display: flex; flex-direction: column; gap: 6px; }
  .top-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .symbol-label {
    font-family: var(--sc-font-mono); font-size: 11px; font-weight: 700;
    letter-spacing: 0.04em; color: rgba(247,242,234,0.88); margin-right: 4px;
    padding-right: 4px; border-right: 1px solid rgba(255,255,255,0.12);
  }
  .direction-badge {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: var(--sc-font-mono); font-size: 11px; font-weight: 700;
    letter-spacing: 0.08em; color: var(--dir-color);
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dir-color); }
  .meta-right { margin-left: auto; }
  .reason { font-size: 13px; color: var(--sc-text-1); line-height: 1.4; margin: 0; }
  .conf-row { display: flex; align-items: center; gap: 12px; }
  .conf-label { font-family: var(--sc-font-mono); font-size: 10px; color: var(--sc-text-2); }
  .conf-label strong { color: var(--sc-text-1); }
  .action {
    font-family: var(--sc-font-mono); font-size: 10px;
    padding: 2px 8px; border: 1px solid rgba(255,255,255,0.12);
    border-radius: 3px; color: var(--sc-text-1);
  }
</style>
