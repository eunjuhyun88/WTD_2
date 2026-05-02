<script lang="ts">
  import type { TerminalSource } from '$lib/types/terminal';
  import SourcePill from './SourcePill.svelte';

  interface Props { sources: TerminalSource[] }
  let { sources }: Props = $props();
</script>

<div class="source-row">
  {#each sources as source}
    <SourcePill {source} />
  {/each}
</div>

<style>
  .source-row {
    display: flex; flex-wrap: wrap; gap: 4px;
    padding: 6px 0 2px;
  }
</style>
