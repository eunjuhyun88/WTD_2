<script lang="ts">
  import { onMount } from 'svelte';
  import { TerminalHub } from '$lib/hubs/terminal';
  import { activateLegacyMode, readLegacyMode, shellStore } from '$lib/hubs/terminal/shell.store';
  import type { RightPanelTab } from '$lib/hubs/terminal/shell.store';
  import { track } from '$lib/analytics';
  import { workMode } from '$lib/hubs/terminal/workMode.store';
  import TrainStage from '$lib/hubs/terminal/panels/TrainStage.svelte';
  import FlywheelStage from '$lib/hubs/terminal/panels/FlywheelStage.svelte';

  const { data } = $props<{ data: { legacy: boolean; initialTab: RightPanelTab | null } }>();

  let legacyMode = false;

  onMount(() => {
    if (data.legacy) {
      activateLegacyMode();
      track('cogochi_legacy_toggle', { enabled: true });
    }
    legacyMode = readLegacyMode();
    if (data.initialTab) {
      shellStore.setRightPanelTab(data.initialTab);
    }
  });
</script>

<TerminalHub />
{#if $workMode === 'TRAIN'}
  <TrainStage />
{/if}
{#if $workMode === 'FLYWHEEL'}
  <FlywheelStage />
{/if}
