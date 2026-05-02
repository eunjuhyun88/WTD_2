<!--
  KpiStrip — horizontal CryptoQuant/Velo-style strip rendered above the chart.

  Reads `chartData` + depth + liq + WS status, builds 9 KPI snapshots, and
  renders them as KpiCards. Clicking a card with a `togglesIndicator` toggles
  the chart pane (via the chartIndicators store) — so "click CVD Δ to open
  CVD pane" works end-to-end with no extra wiring in ChartBoard.
-->
<script lang="ts">
  import { buildKpiSnapshots, type KpiInputBundle, type KpiId, type KpiSnapshot } from '$lib/chart/kpiStrip';
  import { toggleIndicator } from '$lib/stores/chartIndicators';
  import KpiCard from './KpiCard.svelte';

  interface Props {
    bundle: KpiInputBundle;
  }

  let { bundle }: Props = $props();

  const snapshots = $derived(buildKpiSnapshots(bundle));

  function activate(id: KpiId) {
    const s = snapshots.find((x) => x.id === id);
    if (s?.togglesIndicator) toggleIndicator(s.togglesIndicator);
  }
</script>

<div class="kpi-strip" role="region" aria-label="Live market KPIs">
  {#each snapshots as snap (snap.id)}
    <KpiCard {snap} onActivate={activate} />
  {/each}
</div>

<style>
  .kpi-strip {
    display: flex;
    gap: 6px;
    flex-wrap: nowrap;
    overflow-x: auto;
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.18);
    border-bottom: 1px solid rgba(42, 46, 57, 0.6);
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .kpi-strip::-webkit-scrollbar {
    display: none;
  }
  @media (max-width: 768px) {
    .kpi-strip {
      padding: 5px 8px;
      gap: 5px;
    }
  }
</style>
