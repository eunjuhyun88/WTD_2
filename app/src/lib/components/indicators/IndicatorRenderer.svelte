<script lang="ts">
  /**
   * Dispatcher — reads IndicatorDef.archetype and renders the right component.
   * Keeps call-sites trivial: <IndicatorRenderer def={...} value={...} />
   */
  import type { IndicatorDef, IndicatorValue } from '$lib/indicators/types';
  import IndicatorGauge from './IndicatorGauge.svelte';
  import IndicatorStratified from './IndicatorStratified.svelte';
  import IndicatorHeatmap from './IndicatorHeatmap.svelte';
  import IndicatorDivergence from './IndicatorDivergence.svelte';
  import IndicatorRegime from './IndicatorRegime.svelte';
  import IndicatorVenueStrip from './IndicatorVenueStrip.svelte';
  import IndicatorFallback from './IndicatorFallback.svelte';

  interface Props {
    def: IndicatorDef;
    value: IndicatorValue;
  }
  let { def, value }: Props = $props();
</script>

{#if def.archetype === 'A'}
  <IndicatorGauge {def} {value} />
{:else if def.archetype === 'B'}
  <IndicatorStratified {def} {value} />
{:else if def.archetype === 'C'}
  <IndicatorHeatmap {def} {value} />
{:else if def.archetype === 'D'}
  <IndicatorDivergence {def} {value} />
{:else if def.archetype === 'E'}
  <IndicatorRegime {def} {value} />
{:else if def.archetype === 'F'}
  <IndicatorVenueStrip {def} {value} />
{:else}
  <IndicatorFallback {def} {value} />
{/if}
