<script lang="ts">
  import type { TerminalEvidence } from '$lib/types/terminal';
  import EvidenceCard from './EvidenceCard.svelte';

  interface Props { evidence: TerminalEvidence[]; cols?: number; bars?: any[]; layerBarsMap?: Record<string, any[]> }
  let { evidence, cols = 3, bars = [], layerBarsMap = {} }: Props = $props();
</script>

<div class="evidence-grid" style="--cols: {cols}">
  {#each evidence as item}
    <EvidenceCard evidence={item} {bars} {layerBarsMap} />
  {/each}
</div>

<style>
  .evidence-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    gap: 4px;
  }
</style>
