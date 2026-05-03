<script lang="ts">
  import { onMount } from 'svelte';
  import { TerminalHub } from '$lib/hubs/terminal';
  import { activateLegacyMode, readLegacyMode } from '$lib/hubs/terminal/shell.store';
  import { track } from '$lib/analytics';
  import { workMode } from '$lib/hubs/terminal/workMode.store';
  import TrainStage from '$lib/hubs/terminal/panels/TrainStage.svelte';

  const { data } = $props<{ data: { legacy: boolean } }>();

  let legacyMode = false;

  onMount(() => {
    if (data.legacy) {
      activateLegacyMode();
      track('cogochi_legacy_toggle', { enabled: true });
    }
    legacyMode = readLegacyMode();
  });
</script>

<TerminalHub />
{#if $workMode === 'TRAIN'}
  <TrainStage />
{/if}
