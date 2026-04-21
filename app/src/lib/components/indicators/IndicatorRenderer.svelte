<script lang="ts">
  /**
   * Dispatcher — reads IndicatorDef.archetype (or user archetype override)
   * and renders the right component.
   * Keeps call-sites trivial: <IndicatorRenderer def={...} value={...} />
   */
  import type { IndicatorDef, IndicatorValue, IndicatorArchetype } from '$lib/indicators/types';
  import { shellStore } from '$lib/cogochi/shell.store';
  import IndicatorGauge from './IndicatorGauge.svelte';
  import IndicatorStratified from './IndicatorStratified.svelte';
  import IndicatorHeatmap from './IndicatorHeatmap.svelte';
  import IndicatorDivergence from './IndicatorDivergence.svelte';
  import IndicatorRegime from './IndicatorRegime.svelte';
  import IndicatorVenueStrip from './IndicatorVenueStrip.svelte';
  import IndicatorCurve from './IndicatorCurve.svelte';
  import IndicatorSankey from './IndicatorSankey.svelte';
  import IndicatorHistogram from './IndicatorHistogram.svelte';
  import IndicatorTimeline from './IndicatorTimeline.svelte';
  import IndicatorFallback from './IndicatorFallback.svelte';

  interface Props {
    def: IndicatorDef;
    value: IndicatorValue;
  }
  let { def, value }: Props = $props();

  // User may override the archetype via IndicatorSettingsSheet (persisted in shell.archetypePrefs)
  const archetype = $derived<IndicatorArchetype>(
    ($shellStore.archetypePrefs[def.id] as IndicatorArchetype | undefined) ?? def.archetype
  );
</script>

{#if archetype === 'A'}
  <IndicatorGauge {def} {value} />
{:else if archetype === 'B'}
  <IndicatorStratified {def} {value} />
{:else if archetype === 'C'}
  <IndicatorHeatmap {def} {value} />
{:else if archetype === 'D'}
  <IndicatorDivergence {def} {value} />
{:else if archetype === 'E'}
  <IndicatorRegime {def} {value} />
{:else if archetype === 'F'}
  <IndicatorVenueStrip {def} {value} />
{:else if archetype === 'G'}
  <IndicatorCurve {def} {value} />
{:else if archetype === 'H'}
  <IndicatorSankey {def} {value} />
{:else if archetype === 'I'}
  <IndicatorHistogram {def} {value} />
{:else if archetype === 'J'}
  <IndicatorTimeline {def} {value} />
{:else}
  <IndicatorFallback {def} {value} />
{/if}
