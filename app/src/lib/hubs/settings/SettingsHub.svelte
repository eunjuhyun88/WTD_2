<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import GeneralPanel from './panels/GeneralPanel.svelte';
  import SubscriptionPanel from './panels/SubscriptionPanel.svelte';
  import ApiKeysPanel from './panels/ApiKeysPanel.svelte';
  import NotificationsPanel from './panels/NotificationsPanel.svelte';
  import DisplayPanel from './panels/DisplayPanel.svelte';
  import Ac10Badge from './panels/Ac10Badge.svelte';

  /**
   * W-0402 PR15: 3 primary tabs (Account / Notifications / Display).
   * Legacy tab IDs (general, subscription, api-keys, passport, status) remain
   * routable but are not shown in the primary strip — overflow is deferred.
   *
   * Tab mapping:
   *   account       ← general + subscription + wallet (existing GeneralPanel + SubscriptionPanel)
   *   notifications ← email digest, signal alerts, telegram (new NotificationsPanel)
   *   display       ← theme, density toggle (new DisplayPanel)
   */
  const PRIMARY_TABS = [
    { id: 'account',       label: 'Account' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'display',       label: 'Display' },
  ];

  // Legacy tab IDs kept for backward compat (not shown in strip)
  const LEGACY_MAP: Record<string, string> = {
    general:      'account',
    subscription: 'account',
    'api-keys':   'account',
    passport:     'account',
    status:       'account',
  };

  const rawTab = $derived($page.url.searchParams.get('tab') ?? 'account');
  const activeTab = $derived(LEGACY_MAP[rawTab] ?? rawTab);

  function switchTab(id: string) {
    goto(`/settings?tab=${id}`, { replaceState: true });
  }
</script>

<div class="settings-shell">
  <nav class="settings-tabs" aria-label="Settings sections">
    {#each PRIMARY_TABS as tab}
      <button
        class="settings-tab"
        class:active={activeTab === tab.id}
        aria-current={activeTab === tab.id ? 'page' : undefined}
        onclick={() => switchTab(tab.id)}
      >{tab.label}</button>
    {/each}
    <div class="tabs-spacer"></div>
    <!-- AC3: Ac10Badge always in DOM — opacity-controlled only, never v-if -->
    <Ac10Badge visible={activeTab === 'account'} />
  </nav>

  <div class="settings-content">
    {#if activeTab === 'account'}
      <div class="account-panels">
        <GeneralPanel />
        <div class="panel-divider"></div>
        <SubscriptionPanel />
        <div class="panel-divider"></div>
        <ApiKeysPanel />
      </div>
    {:else if activeTab === 'notifications'}
      <NotificationsPanel />
    {:else if activeTab === 'display'}
      <DisplayPanel />
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
    flex-shrink: 0;
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
  .tabs-spacer { flex: 1; }
  .settings-content { flex: 1; overflow-y: auto; padding: 24px 20px; }

  .account-panels {
    display: flex;
    flex-direction: column;
    gap: 0;
    max-width: 640px;
  }

  .panel-divider {
    height: 16px;
  }
</style>
