<script lang="ts">
  import { onDestroy } from 'svelte';
  import { arenaWarStore, arenaWarPhase, resetArenaWar, setTeams, startMatch } from '$lib/stores/arenaWarStore';
  import type { AgentId } from '$lib/engine/types';
  import SetupPhase from '../../components/arena-war/SetupPhase.svelte';
  import DraftPhase from '../../components/arena-war/DraftPhase.svelte';
  import AnalyzePhase from '../../components/arena-war/AnalyzePhase.svelte';
  import HumanCallPhase from '../../components/arena-war/HumanCallPhase.svelte';
  import RevealPhase from '../../components/arena-war/RevealPhase.svelte';
  import BattlePhase from '../../components/arena-war/BattlePhase.svelte';
  import JudgePhase from '../../components/arena-war/JudgePhase.svelte';
  import ResultPhase from '../../components/arena-war/ResultPhase.svelte';

  let phase = $derived($arenaWarPhase);
  let store = $derived($arenaWarStore);

  function handleDraftComplete(humanTeam: AgentId[], aiTeam: AgentId[], banned: AgentId[]) {
    setTeams(humanTeam, aiTeam, banned);
    startMatch(store.setup);
  }

  onDestroy(() => {
    resetArenaWar();
  });
</script>

<svelte:head>
  <title>WTD — Arena War</title>
</svelte:head>

<div class="arena-war-page">
  {#if phase === 'SETUP'}
    <SetupPhase />
  {:else if phase === 'DRAFT'}
    <DraftPhase
      onDraftComplete={handleDraftComplete}
      mode={store.selectedMode === 'spectator' ? 'spectator' : 'pvai'}
    />
  {:else if phase === 'AI_ANALYZE'}
    <AnalyzePhase />
  {:else if phase === 'HUMAN_CALL'}
    <HumanCallPhase />
  {:else if phase === 'REVEAL'}
    <RevealPhase />
  {:else if phase === 'BATTLE'}
    <BattlePhase />
  {:else if phase === 'JUDGE'}
    <JudgePhase />
  {:else if phase === 'RESULT'}
    <ResultPhase />
  {/if}
</div>

<style>
  .arena-war-page {
    width: 100%;
    min-height: 100vh;
    background: var(--arena-bg-0, #07130d);
    color: var(--arena-text-0, #e0f0e8);
    font-family: 'Space Grotesk', 'Pretendard', sans-serif;
  }

  /* Ensure the page fills the viewport */
  :global(body) {
    overflow-x: hidden;
  }
</style>
