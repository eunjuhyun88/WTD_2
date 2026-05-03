<script lang="ts">
  import { goto } from '$app/navigation';
  import { track } from '$lib/analytics';
  import type { OpportunityScore } from '../../../routes/dashboard/+page.server';

  interface Props {
    opp: OpportunityScore;
    rank: number;
  }

  const { opp, rank }: Props = $props();

  function dirIcon(d: string): string {
    return d === 'long' ? '↑' : d === 'short' ? '↓' : '→';
  }

  function confColor(c: number): string {
    if (c >= 0.75) return 'var(--pos)';
    if (c >= 0.5)  return 'var(--amb)';
    return 'var(--g7)';
  }

  function fmtConf(c: number): string {
    return (c * 100).toFixed(0) + '%';
  }

  function analyzeCogochi() {
    track('dashboard_opportunity_click', {
      symbol: opp.symbol,
      pattern: opp.reasons?.[0] ?? '',
      rank,
      confidence: opp.confidence,
    });
    goto(`/cogochi?symbol=${opp.symbol}&tf=4h`);
  }
</script>

<article class="opp-card" class:long={opp.direction === 'long'} class:short={opp.direction === 'short'}>
  <div class="opp-card-top">
    <span class="opp-sym">{opp.symbol}</span>
    <span class="opp-dir" style:color={opp.direction === 'long' ? 'var(--pos)' : opp.direction === 'short' ? 'var(--neg)' : 'var(--g7)'}>
      {dirIcon(opp.direction)} {opp.direction}
    </span>
  </div>

  <div class="opp-conf-row">
    <span class="opp-conf-label">신뢰도</span>
    <span class="opp-conf-val" style:color={confColor(opp.confidence)}>{fmtConf(opp.confidence)}</span>
    <div class="opp-conf-bar">
      <div class="opp-conf-fill" style:width="{opp.confidence * 100}%" style:background={confColor(opp.confidence)}></div>
    </div>
  </div>

  {#if opp.reasons?.length}
    <p class="opp-reason">{opp.reasons[0]}</p>
  {/if}

  <button class="opp-analyze-btn" onclick={analyzeCogochi}>분석하기 →</button>
</article>

<style>
  .opp-card {
    background: var(--g3);
    border: 1px solid var(--g4);
    border-radius: 4px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .opp-card.long  { border-left: 2px solid var(--pos); }
  .opp-card.short { border-left: 2px solid var(--neg); }

  .opp-card-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .opp-sym { font-size: 11px; font-weight: 700; color: var(--g9); }
  .opp-dir { font-size: 10px; font-weight: 600; }

  .opp-conf-row { display: flex; align-items: center; gap: 4px; }
  .opp-conf-label { font-size: 9px; color: var(--g7); flex-shrink: 0; }
  .opp-conf-val   { font-size: 10px; font-weight: 600; flex-shrink: 0; min-width: 30px; }
  .opp-conf-bar   { flex: 1; height: 3px; background: var(--g4); border-radius: 2px; overflow: hidden; }
  .opp-conf-fill  { height: 100%; border-radius: 2px; transition: width 0.3s; }

  .opp-reason {
    font-size: 9px;
    color: var(--g7);
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .opp-analyze-btn {
    margin-top: 2px;
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 600;
    color: var(--g9);
    background: var(--g4);
    border: 1px solid var(--g5);
    border-radius: 3px;
    cursor: pointer;
    text-align: center;
    transition: background 0.15s;
  }
  .opp-analyze-btn:hover { background: var(--g5); }
</style>
