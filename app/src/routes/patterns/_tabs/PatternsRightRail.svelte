<script lang="ts">
  import VerdictInboxSection from '$lib/components/patterns/VerdictInboxSection.svelte';

  type Tab = 'detail' | 'inbox';
  let activeTab = $state<Tab>('detail');
</script>

<aside class="right-rail">
  <div class="rail-tab-strip">
    <button
      class="rail-tab"
      class:rail-tab--active={activeTab === 'detail'}
      onclick={() => (activeTab = 'detail')}
    >
      Detail
    </button>
    <button
      class="rail-tab"
      class:rail-tab--active={activeTab === 'inbox'}
      onclick={() => (activeTab = 'inbox')}
    >
      Inbox
    </button>
  </div>

  <div class="rail-body">
    {#if activeTab === 'detail'}
      <div class="rail-detail">
        <p class="rail-empty-hint">Select a pattern to see details.</p>
      </div>
    {:else}
      <VerdictInboxSection />
    {/if}
  </div>
</aside>

<style>
  .right-rail {
    width: 320px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--surface-1, rgba(16, 18, 24, 0.82));
    border-left: 1px solid rgba(255, 255, 255, 0.06);
    min-height: 0;
  }

  .rail-tab-strip {
    display: flex;
    align-items: center;
    height: 32px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    flex-shrink: 0;
  }

  .rail-tab {
    flex: 1;
    height: 100%;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--type-md, 14px);
    color: var(--text-secondary, rgba(250, 247, 235, 0.45));
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
    padding: 0 var(--sp-3, 12px);
    letter-spacing: 0.03em;
    margin-bottom: -1px;
  }

  .rail-tab:hover {
    color: var(--text-primary, rgba(250, 247, 235, 0.9));
  }

  .rail-tab--active {
    color: var(--text-primary, rgba(250, 247, 235, 0.9));
    border-bottom-color: var(--accent-amb, #f2d193);
  }

  .rail-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .rail-detail {
    padding: var(--sp-4, 16px) var(--sp-3, 12px);
  }

  .rail-empty-hint {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    color: var(--text-secondary, rgba(250, 247, 235, 0.35));
    text-align: center;
    padding-top: 48px;
  }
</style>
