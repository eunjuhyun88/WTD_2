<script lang="ts">
  import type { SimilarityCardPayload } from '$lib/agent/directives';
  interface Props { payload: SimilarityCardPayload; }
  let { payload }: Props = $props();

  function outcomeColor(outcome: string) {
    if (outcome === 'WIN') return '#4caf50';
    if (outcome === 'LOSS') return '#f44336';
    return '#9e9e9e';
  }
</script>

<div class="sim-card">
  <div class="sim-header">Similar patterns for {payload.symbol}</div>
  <div class="sim-list">
    {#each payload.similar_patterns.slice(0, 5) as p}
      <div class="sim-row">
        <span class="sim-sym">{p.symbol} {p.timeframe}</span>
        <span class="sim-outcome" style="color:{outcomeColor(p.outcome)}">{p.outcome}</span>
        <span class="sim-pwin">{Math.round(p.p_win * 100)}%</span>
      </div>
    {/each}
  </div>
</div>

<style>
.sim-card {
  background: #111222; border: 1px solid #2a2a3a; border-radius: 8px; padding: 8px 12px; width: 100%;
}
.sim-header { font-size: 11px; color: #7a8a9a; margin-bottom: 6px; }
.sim-list { display: flex; flex-direction: column; gap: 4px; }
.sim-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.sim-sym { flex: 1; color: #c8ccd4; font-family: monospace; }
.sim-outcome { font-weight: 600; width: 36px; }
.sim-pwin { color: #8a9ab0; width: 32px; text-align: right; }
</style>
