<script lang="ts">
  /**
   * Archetype H — Flow Net-Arrow
   *
   * Compact source→sink directional flow display.
   * Width-proportional bars with in/out color coding.
   * Familiar from Arkham netflow / Nansen fund-flow.
   *
   * Phase 1: renders SankeyEdge[] from adapter stub.
   * Phase 2: Arkham real on-chain data.
   */
  import type { IndicatorDef, IndicatorValue, SankeyEdge } from '$lib/indicators/types';

  interface Props { def: IndicatorDef; value: IndicatorValue; }
  let { def, value }: Props = $props();

  const edges = $derived.by((): SankeyEdge[] => {
    const c = value.current;
    if (!Array.isArray(c) || !c.length) return [];
    if (typeof (c[0] as SankeyEdge).source === 'string') return c as SankeyEdge[];
    return [];
  });

  const maxVal = $derived(edges.length ? Math.max(...edges.map(e => Math.abs(e.value))) || 1 : 1);

  function fmt(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
    return v.toFixed(0);
  }

  const netFlow = $derived(edges.reduce((acc, e) => acc + (e.direction === 'in' ? e.value : -e.value), 0));
  const netFmt  = $derived(fmt(netFlow));
  const netClass = $derived(netFlow > 0 ? 'dn' : netFlow < 0 ? 'up' : '');  // inflow = sell pressure (dn), outflow = bullish (up)
</script>

<div class="sankey" title={def.description ?? def.label ?? def.id}>
  <div class="label">{def.label ?? def.id}</div>

  {#if edges.length}
    <div class="value-row">
      <span class="value {netClass}">{netFlow >= 0 ? '+' : ''}{netFmt}</span>
      <span class="unit">{def.unit ?? 'USD'}</span>
    </div>

    <div class="flow-list">
      {#each edges.slice(0, 4) as edge}
        {@const barW = Math.round((Math.abs(edge.value) / maxVal) * 80)}
        <div class="flow-row">
          <span class="flow-label">{edge.source}</span>
          <div class="flow-bar-wrap">
            <div
              class="flow-bar {edge.direction}"
              style="width: {barW}px"
            ></div>
          </div>
          <span class="flow-label sink">{edge.sink}</span>
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty">—</div>
  {/if}
</div>

<style>
  .sankey {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 6px 10px;
    font-family: var(--sc-font-mono, ui-monospace, monospace);
    font-size: 11px;
    line-height: 1.15;
    min-width: 160px;
    color: var(--g9, rgba(255,255,255,0.85));
  }

  .label {
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--g6, rgba(255,255,255,0.5));
  }

  .value-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-size: 13px;
  }
  .value.up { color: #4caf7d; }
  .value.dn { color: #e05c5c; }

  .unit {
    font-size: 9px;
    color: var(--g5, rgba(255,255,255,0.38));
  }

  .flow-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 2px;
  }

  .flow-row {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 8px;
  }

  .flow-label {
    font-size: 8px;
    color: var(--g5, rgba(255,255,255,0.38));
    width: 28px;
    overflow: hidden;
    white-space: nowrap;
    letter-spacing: 0.02em;
  }

  .flow-label.sink {
    text-align: left;
  }

  .flow-bar-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    height: 4px;
  }

  .flow-bar {
    height: 4px;
    border-radius: 1px;
    min-width: 2px;
    transition: width 0.25s ease;
  }

  .flow-bar.in  { background: #e05c5c; }   /* inflow = sell pressure */
  .flow-bar.out { background: #4caf7d; }   /* outflow = hodl/bullish */

  .empty {
    font-size: 12px;
    color: var(--g4, rgba(255,255,255,0.28));
    height: 36px;
    display: flex;
    align-items: center;
  }
</style>
