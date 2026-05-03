<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import GeneralPanel from './panels/GeneralPanel.svelte';
  import SubscriptionPanel from './panels/SubscriptionPanel.svelte';

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'subscription', label: 'Subscription' },
    { id: 'api-keys', label: 'API Keys' },
    { id: 'passport', label: 'Passport' },
    { id: 'status', label: 'Status' },
  ];

  const activeTab = $derived($page.url.searchParams.get('tab') ?? 'general');

  function switchTab(id: string) {
    goto(`/settings?tab=${id}`, { replaceState: true });
  }
</script>

<div class="settings-shell">
  <nav class="settings-tabs">
    {#each tabs as tab}
      <button
        class="settings-tab"
        class:active={activeTab === tab.id}
        onclick={() => switchTab(tab.id)}
      >{tab.label}</button>
    {/each}
  </nav>

  <div class="settings-content">
    {#if activeTab === 'general'}
      <GeneralPanel />
    {:else if activeTab === 'subscription'}
      <SubscriptionPanel />
    {:else if activeTab === 'api-keys'}
      <div class="coming-soon">API Keys — coming soon (PR3)</div>
    {:else if activeTab === 'passport'}
      <div class="coming-soon">Passport settings — coming soon (PR2)</div>
    {:else if activeTab === 'status'}
      <div class="coming-soon">System status — coming soon (PR2)</div>
    {/if}
  </div>
</div>

<style>
  .settings-shell { display: flex; flex-direction: column; height: 100%; }
  .settings-tabs {
    display: flex;
    gap: 1px;
    padding: 0 20px;
    border-bottom: 1px solid var(--g3, #1c1918);
    background: var(--g1, #0c0a09);
  }
  .settings-tab {
    padding: 10px 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    color: var(--g5, #3d3830);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
  }
  .settings-tab:hover { color: var(--g7, #9d9690); }
  .settings-tab.active {
    color: var(--g9, #eceae8);
    border-bottom-color: var(--amb, #f5a623);
  }
  .settings-content { flex: 1; overflow-y: auto; padding: 24px 20px; }
  .coming-soon {
    color: var(--g5, #3d3830);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    padding: 40px;
    text-align: center;
  }
</style>
