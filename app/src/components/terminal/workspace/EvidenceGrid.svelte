<script lang="ts">
  import type { TerminalEvidence } from '$lib/types/terminal';
  import EvidenceCard from './EvidenceCard.svelte';

  interface Props { evidence: TerminalEvidence[]; cols?: number }
  let { evidence, cols = 3 }: Props = $props();
</script>

<div class="evidence-grid" style="--cols: {cols}">
  {#each evidence as item}
    <EvidenceCard evidence={item} />
  {/each}
</div>

<style>
  .evidence-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    gap: 4px;
  }
</style>
