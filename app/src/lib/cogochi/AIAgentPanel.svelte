<script lang="ts">
  /**
   * AIAgentPanel — unified 5-tab right panel for cogochi Hub-2.
   *
   * Tabs:
   *   DEC — DecisionHUDAdapter + AIPanel (AI assist chat)
   *   PAT — PatternLibraryPanelAdapter (inline, not modal)
   *   VER — VerdictInboxPanel (flywheel verdict queue)
   *   RES — Research notes stub (W-0375)
   *   JDG — Judge / trade journal stub (W-0376)
   *
   * Replaces the legacy AIPanel (right column) in AppShell desktop layout.
   * Tab state persisted via shellStore.setRightPanelTab.
   */
  import { shellStore, activeRightPanelTab, activeTabState } from './shell.store';
  import type { RightPanelTab } from './shell.store';
  import AIPanel from './AIPanel.svelte';
  import DecisionHUDAdapter from './DecisionHUDAdapter.svelte';
  import VerdictInboxPanel from '../../components/terminal/peek/VerdictInboxPanel.svelte';

  const TABS: Array<{ id: RightPanelTab; label: string }> = [
    { id: 'decision', label: 'DEC' },
    { id: 'pattern', label: 'PAT' },
    { id: 'verdict', label: 'VER' },
    { id: 'research', label: 'RES' },
    { id: 'judge', label: 'JDG' },
  ];

  interface Message {
    role: 'user' | 'assistant';
    text: string;
  }

  interface Props {
    messages?: Message[];
    onSend?: (text: string, msgs: Message[]) => void;
    onSelectSymbol?: (s: string) => void;
    symbol?: string;
    timeframe?: string;
  }
  let {
    messages = [],
    onSend,
    onSelectSymbol,
    symbol = 'BTCUSDT',
    timeframe = '4h',
  }: Props = $props();

  const activeTab = $derived($activeRightPanelTab);
  const expanded = $derived($activeTabState.rightPanelExpanded ?? false);

  function toggleExpand() {
    shellStore.updateTabState(s => ({ ...s, rightPanelExpanded: !s.rightPanelExpanded }));
  }
</script>

<div class="agent-panel" class:expanded>
  <!-- Tab bar -->
  <div class="tab-bar">
    {#each TABS as tab}
      <button
        class="tab-btn"
        class:active={activeTab === tab.id}
        onclick={() => shellStore.setRightPanelTab(tab.id)}
      >{tab.label}</button>
    {/each}
    <button
      class="expand-btn"
      onclick={toggleExpand}
      title={expanded ? 'Collapse panel' : 'Expand panel'}
    >{expanded ? '⤡' : '⤢'}</button>
  </div>

  <!-- Tab content -->
  <div class="tab-content">
    {#if activeTab === 'decision'}
      <div class="decision-section">
        <DecisionHUDAdapter />
      </div>
      <div class="ai-chat-section">
        <AIPanel
          {messages}
          onSend={onSend}
          {symbol}
          {timeframe}
          onSelectSymbol={onSelectSymbol}
          onClose={() => {}}
        />
      </div>
    {:else if activeTab === 'pattern'}
      <div class="pattern-section">
        <div class="section-header">
          <span class="section-label">PATTERN LIBRARY</span>
        </div>
        <div class="pattern-list-hint">
          <p class="hint-text">Select a pattern from the library to load it into the Decision HUD.</p>
          <button
            class="open-library-btn"
            onclick={() => shellStore.update(s => ({ ...s, activeSection: 'library', sidebarVisible: true }))}
          >Open Pattern Library</button>
        </div>
      </div>
    {:else if activeTab === 'verdict'}
      <VerdictInboxPanel
        onVerdictSubmit={(captureId, verdict) => shellStore.selectVerdict(captureId)}
      />
    {:else if activeTab === 'research'}
      <div class="stub-section">
        <p class="stub-label">RESEARCH</p>
        <p class="stub-note">Notes coming in W-0375</p>
      </div>
    {:else if activeTab === 'judge'}
      <div class="stub-section">
        <p class="stub-label">JUDGE</p>
        <p class="stub-note">Trade journal coming in W-0376</p>
      </div>
    {/if}
  </div>
</div>

<style>
.agent-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--c-bg, #0c0a09);
  overflow: hidden;
}

.tab-bar {
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--c-border, #272320);
  flex-shrink: 0;
  background: var(--c-surface, #141210);
}

.tab-btn {
  padding: 4px 8px;
  border-radius: var(--r-sm, 3px);
  border: 1px solid transparent;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--c-text-dim, #706a62);
  cursor: pointer;
  background: transparent;
  transition: all 0.1s;
}
.tab-btn:hover {
  color: var(--c-text-primary, #eceae8);
  background: var(--c-surface, #141210);
}
.tab-btn.active {
  color: var(--c-text-primary, #eceae8);
  background: var(--c-surface, #141210);
  border-color: var(--c-border, #272320);
}

.expand-btn {
  margin-left: auto;
  padding: 4px 6px;
  color: var(--c-text-dim, #706a62);
  cursor: pointer;
  background: transparent;
  border: none;
  font-size: 12px;
  transition: color 0.1s;
}
.expand-btn:hover {
  color: var(--c-text-secondary, #9d9690);
}

.tab-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.decision-section {
  flex-shrink: 0;
  border-bottom: 1px solid var(--c-border, #272320);
}

.ai-chat-section {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.pattern-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.section-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--c-border, #272320);
  flex-shrink: 0;
}

.section-label {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--c-text-dim, #706a62);
}

.pattern-list-hint {
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.hint-text {
  font-size: 11px;
  color: var(--c-text-dim, #706a62);
  text-align: center;
  line-height: 1.5;
}

.open-library-btn {
  padding: 6px 14px;
  background: var(--c-surface, #141210);
  border: 1px solid var(--c-border, #272320);
  border-radius: var(--r-sm, 3px);
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--c-text-secondary, #9d9690);
  cursor: pointer;
  transition: all 0.1s;
}
.open-library-btn:hover {
  color: var(--c-text-primary, #eceae8);
  border-color: var(--c-text-dim, #706a62);
}

.stub-section {
  padding: 24px 16px;
  text-align: center;
}

.stub-label {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--c-text-dim, #706a62);
}

.stub-note {
  font-size: 11px;
  color: var(--c-text-dim, #706a62);
  margin-top: 8px;
}
</style>
