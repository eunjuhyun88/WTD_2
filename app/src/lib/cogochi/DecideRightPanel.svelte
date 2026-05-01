<script lang="ts">
  /**
   * DecideRightPanel — right panel for decide mode.
   *
   * Two tabs: HUD (DecisionHUDAdapter) and Verdicts (VerdictInboxPanel).
   * Replaces AIPanel when workMode === 'decide'.
   */
  import DecisionHUDAdapter from './DecisionHUDAdapter.svelte';
  import VerdictInboxPanel from '../../components/terminal/peek/VerdictInboxPanel.svelte';
  import { shellStore } from './shell.store';

  type Tab = 'hud' | 'verdicts';
  let activeTab = $state<Tab>('hud');

  function onVerdictSubmit(captureId: string, verdict: string) {
    shellStore.selectVerdict(captureId);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'j') {
      // next verdict — VerdictInboxPanel handles its own keyboard nav
    } else if (e.key === 'k') {
      // prev verdict
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="decide-panel">
  <!-- Tab bar -->
  <div class="tab-bar">
    <button
      class="tab-btn"
      class:active={activeTab === 'hud'}
      onclick={() => (activeTab = 'hud')}
    >HUD</button>
    <button
      class="tab-btn"
      class:active={activeTab === 'verdicts'}
      onclick={() => (activeTab = 'verdicts')}
    >VERDICTS</button>
    <button
      class="mode-exit-btn"
      onclick={() => shellStore.setWorkMode('analyze')}
      title="Exit decide mode"
    >Exit Decide</button>
  </div>

  <!-- Tab content -->
  <div class="tab-content">
    {#if activeTab === 'hud'}
      <DecisionHUDAdapter />
    {:else}
      <VerdictInboxPanel
        onVerdictSubmit={onVerdictSubmit}
      />
    {/if}
  </div>
</div>

<style>
  .decide-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--g1, #0c0a09);
    overflow: hidden;
  }

  .tab-bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--g4, #272320);
    flex-shrink: 0;
  }

  .tab-btn {
    padding: 4px 10px;
    border-radius: 3px;
    border: 1px solid transparent;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--g6, #706a62);
    cursor: pointer;
    transition: all 0.1s;
  }

  .tab-btn:hover {
    color: var(--g8, #cec9c4);
    background: var(--g3, #1c1918);
  }

  .tab-btn.active {
    color: var(--g9, #eceae8);
    background: var(--g3, #1c1918);
    border-color: var(--g5, #3d3830);
  }

  .mode-exit-btn {
    margin-left: auto;
    padding: 3px 8px;
    border-radius: 3px;
    border: 1px solid var(--g5, #3d3830);
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--g6, #706a62);
    cursor: pointer;
    transition: all 0.1s;
  }

  .mode-exit-btn:hover {
    color: var(--g8, #cec9c4);
    border-color: var(--g6, #706a62);
  }

  .tab-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
