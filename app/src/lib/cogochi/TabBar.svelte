<script lang="ts">
  import type { Tab } from './shell.store';

  interface Props {
    tabs: Tab[];
    activeTabId: string;
    setActiveTabId: (id: string) => void;
    onCloseTab: (id: string) => void;
    onNewTab: () => void;
    sidebarVisible: boolean;
    toggleSidebar: () => void;
  }

  const { tabs, activeTabId, setActiveTabId, onCloseTab, onNewTab, sidebarVisible, toggleSidebar }: Props = $props();

  function tabIcon(kind: string): string {
    if (kind === 'trade') return '◆';
    if (kind === 'train') return '◈';
    if (kind === 'flywheel') return '◉';
    if (kind === 'capture') return '◇';
    if (kind === 'rule') return '⚖';
    if (kind === 'rejudge') return '↻';
    return '·';
  }

  function tabColor(kind: string): string {
    if (kind === 'trade') return 'var(--brand)';
    if (kind === 'train') return 'var(--amb)';
    if (kind === 'flywheel') return '#7aa2e0';
    return 'var(--g6)';
  }

  function onTabKeyDown(event: KeyboardEvent, tabId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActiveTabId(tabId);
    }
  }
</script>

<div class="tab-bar">
  <button
    class="sidebar-toggle"
    title="Toggle sidebar (⌘B)"
    onclick={toggleSidebar}
  >
    {sidebarVisible ? '◨' : '◧'}
  </button>

  <div class="tabs-container">
    {#each tabs as t (t.id)}
      <div
        class="tab"
        class:active={t.id === activeTabId}
        style:--tab-color={tabColor(t.kind)}
        role="button"
        tabindex="0"
        onclick={() => setActiveTabId(t.id)}
        onkeydown={(event) => onTabKeyDown(event, t.id)}
      >
        <span class="tab-text">
          {tabIcon(t.kind)} {t.title}
        </span>
        {#if !t.locked}
          <button
            class="close-btn"
            onclick={(e) => {
              e.stopPropagation();
              onCloseTab(t.id);
            }}
          >
            ×
          </button>
        {/if}
      </div>
    {/each}
    <button class="new-tab-btn" onclick={onNewTab}>+</button>
  </div>
</div>

<style>
  .tab-bar {
    height: 30px;
    display: flex;
    align-items: stretch;
    background: var(--g0);
    border-bottom: 1px solid var(--g5);
    flex-shrink: 0;
  }

  .sidebar-toggle {
    width: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border-right: 1px solid var(--g5);
    cursor: pointer;
    font-size: 13px;
    color: var(--g6);
    transition: color 0.15s;
  }

  .sidebar-toggle:hover {
    color: var(--g7);
  }

  .tabs-container {
    flex: 1;
    display: flex;
    overflow: auto;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px 0 12px;
    background: transparent;
    border-right: 1px solid var(--g5);
    border-top: 1.5px solid transparent;
    cursor: pointer;
    min-width: 140px;
    max-width: 240px;
    transition: all 0.15s;
  }

  .tab.active {
    background: var(--g1);
    border-top-color: var(--tab-color);
  }

  .tab-text {
    font-size: 10px;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    color: var(--g7);
  }

  .tab.active .tab-text {
    color: var(--g9);
  }

  .close-btn {
    color: transparent;
    font-size: 12px;
    line-height: 1;
    padding: 0 2px;
    cursor: pointer;
    background: none;
    border: none;
    transition: color 0.12s;
    flex-shrink: 0;
  }

  .tab:hover .close-btn {
    color: var(--g5);
  }

  .close-btn:hover {
    color: var(--g8) !important;
  }

  .new-tab-btn {
    width: 28px;
    color: var(--g5);
    font-size: 14px;
    cursor: pointer;
    background: transparent;
    border: none;
    transition: color 0.15s;
  }

  .new-tab-btn:hover {
    color: var(--g7);
  }
</style>
