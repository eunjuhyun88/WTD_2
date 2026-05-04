<script lang="ts">
  import { onMount } from 'svelte';
  import { TerminalHub } from '$lib/hubs/terminal';
  import { activateLegacyMode, readLegacyMode, shellStore } from '$lib/hubs/terminal/shell.store';
  import type { RightPanelTab } from '$lib/hubs/terminal/shell.store';
  import { track } from '$lib/analytics';
  import { workMode } from '$lib/hubs/terminal/workMode.store';
  import TrainStage from '$lib/hubs/terminal/panels/TrainStage.svelte';
  import FlywheelStage from '$lib/hubs/terminal/panels/FlywheelStage.svelte';
  import AiSearchBar from '$lib/hubs/cogochi/AiSearchBar.svelte';

  const { data } = $props<{ data: { legacy: boolean; initialTab: RightPanelTab | null; decideId: string | null } }>();

  let legacyMode = false;
  let currentTab = $state<string>('research');

  onMount(() => {
    if (data.legacy) {
      activateLegacyMode();
      track('cogochi_legacy_toggle', { enabled: true });
    }
    legacyMode = readLegacyMode();
    if (data.initialTab) {
      shellStore.setRightPanelTab(data.initialTab);
      currentTab = data.initialTab;
    }
    // PR7-AC3: ?decide=<id> — handled in TerminalHub.svelte via initialDecideId prop
    // (TerminalHub reads window.location.search directly in onMount)

    // Keep currentTab in sync when panels dispatch cogochi:ai-ask
    const handleAiAsk = (e: Event) => {
      const detail = (e as CustomEvent<{ tab: string }>).detail;
      if (detail?.tab) currentTab = detail.tab;
    };
    window.addEventListener('cogochi:ai-ask', handleAiAsk);
    return () => window.removeEventListener('cogochi:ai-ask', handleAiAsk);
  });
</script>

<AiSearchBar {currentTab} />
<TerminalHub />
{#if $workMode === 'TRAIN'}
  <TrainStage />
{/if}
{#if $workMode === 'FLYWHEEL'}
  <FlywheelStage />
{/if}
