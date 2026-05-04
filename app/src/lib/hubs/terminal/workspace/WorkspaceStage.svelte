<script lang="ts">
  import Splitter from '../Splitter.svelte';
  import TradeMode from './TradeMode.svelte';
  import TrainMode from './TrainMode.svelte';
  import RadialTopology from './RadialTopology.svelte';
  import { shellStore, type ShellWorkMode, type Tab, type WorkspaceStageMode } from '../shell.store';

  interface Props {
    tabs: Tab[];
    activeTabId: string;
    workMode: ShellWorkMode;
    workspaceMode: WorkspaceStageMode;
    workspacePaneIds: [string | null, string | null, string | null, string | null];
    workspaceImmersivePaneId: string | null;
    workspaceColumnSplit: number;
    workspaceLeftSplitY: number;
    workspaceRightSplitY: number;
    onSymbolPickerOpen?: (tabId: string) => void;
  }

  const {
    tabs,
    activeTabId,
    workMode,
    workspaceMode,
    workspacePaneIds,
    workspaceImmersivePaneId,
    workspaceColumnSplit,
    workspaceLeftSplitY,
    workspaceRightSplitY,
    onSymbolPickerOpen,
  }: Props = $props();

  function paneTab(id: string | null): Tab | null {
    if (!id) return null;
    return tabs.find(t => t.id === id) ?? null;
  }

  function compareCount(): number {
    return workspacePaneIds.filter(Boolean).length;
  }

  function isCompared(id: string): boolean {
    return compareCount() > 1 && workspacePaneIds.includes(id);
  }

  function slotLabel(index: number): string {
    return `P${index + 1}`;
  }

  function hasPaneAt(index: number): boolean {
    return Boolean(workspacePaneIds[index]);
  }

  function canMovePrev(index: number): boolean {
    return index > 0 && hasPaneAt(index - 1);
  }

  function canMoveNext(index: number): boolean {
    return index < workspacePaneIds.length - 1 && hasPaneAt(index + 1);
  }

  function semanticRole(index: number): { label: string; tone: string } | null {
    if (compareCount() <= 1) return null;
    if (index === 0) return { label: 'Primary', tone: 'primary' };
    if (index === 1) return { label: 'Compare', tone: 'compare' };
    if (index === 2) return { label: 'Reference', tone: 'reference' };
    return { label: 'Alt', tone: 'alt' };
  }

  function immersiveSlotIndex(): number {
    if (!workspaceImmersivePaneId) return 0;
    const index = workspacePaneIds.findIndex(id => id === workspaceImmersivePaneId);
    return index >= 0 ? index : 0;
  }
</script>

{#snippet paneSurface(tab: Tab | null, slotIndex: number, immersive = false)}
  <div class="workspace-slot-shell" data-slot={slotIndex}>
    {#if tab}
      {@const role = semanticRole(slotIndex)}
      <section class="workspace-pane" class:active={tab.id === activeTabId} class:workspace-pane--immersive={immersive}>
        {#if immersive}
          <div class="workspace-immersive-bar">
            <button class="workspace-pane-title workspace-pane-title--immersive" type="button" onclick={() => shellStore.focusWorkspaceTab(tab.id)}>
              <span class="workspace-pane-kicker">{role?.label ?? 'Focus'}</span>
              <span class="workspace-pane-name">{tab.title}</span>
            </button>
            <div class="workspace-immersive-meta">
              {#if compareCount() > 1}{compareCount()} panes preserved{:else}focus mode{/if}
            </div>
            <button class="workspace-pane-btn workspace-pane-btn--immersive" type="button" title="Exit focus mode" onclick={() => shellStore.exitWorkspaceImmersive()}>×</button>
          </div>
        {:else if compareCount() > 1}
          <header class="workspace-pane-head">
            <button class="workspace-pane-title" type="button" onclick={() => shellStore.focusWorkspaceTab(tab.id)}>
              <span class="workspace-pane-kicker">{slotLabel(slotIndex)}</span>
              {#if role}<span class="workspace-pane-role" data-tone={role.tone}>{role.label}</span>{/if}
              {#if compareCount() > 1 && tab.id === activeTabId}<span class="workspace-pane-focus">Focus</span>{/if}
              <span class="workspace-pane-name">{tab.title}</span>
            </button>
            <div class="workspace-pane-actions">
              {#if canMovePrev(slotIndex)}
                <button class="workspace-pane-btn" type="button" title="Move pane left" onclick={() => shellStore.moveWorkspacePane(slotIndex, slotIndex - 1)}>←</button>
              {/if}
              {#if canMoveNext(slotIndex)}
                <button class="workspace-pane-btn" type="button" title="Move pane right" onclick={() => shellStore.moveWorkspacePane(slotIndex, slotIndex + 1)}>→</button>
              {/if}
              <button
                class="workspace-pane-btn"
                class:active={isCompared(tab.id)}
                type="button"
                title={isCompared(tab.id) ? 'Remove from compare' : 'Add to compare'}
                onclick={() => shellStore.toggleTabCompare(tab.id)}
              >{isCompared(tab.id) ? '−' : '+'}</button>
              <button class="workspace-pane-btn" type="button" title="Focus mode" onclick={() => shellStore.expandWorkspacePane(tab.id)}>⤢</button>
            </div>
          </header>
        {/if}

        <div class="workspace-pane-body">
          {#if tab.mode === 'trade'}
            <TradeMode
              mode={tab.mode}
              tabState={tab.tabState}
              updateTabState={(updater) => shellStore.updateTabStateFor(tab.id, updater)}
              symbol={tab.tabState.symbol ?? 'BTCUSDT'}
              timeframe={tab.tabState.timeframe ?? '4h'}
              tabId={tab.id}
              {workMode}
              isPaneFocused={tab.id === activeTabId}
              onSymbolTap={onSymbolPickerOpen ? () => onSymbolPickerOpen!(tab.id) : undefined}
              onTFChange={(tf) => shellStore.setTimeframe(tf, tab.id)}
            />
          {:else if tab.mode === 'train'}
            <TrainMode mode={tab.mode} />
          {:else if tab.mode === 'flywheel'}
            <RadialTopology mode={tab.mode} />
          {/if}
        </div>
      </section>
    {:else}
      <div class="workspace-empty">
        <span class="workspace-empty-kicker">{slotLabel(slotIndex)}</span>
        <span class="workspace-empty-copy">Compare slot is empty</span>
      </div>
    {/if}
  </div>
{/snippet}

<div
  class="workspace-stage"
  data-mode={workspaceMode}
  class:workspace-stage--immersive={Boolean(workspaceImmersivePaneId)}
  class:workspace-stage--observe={workMode === 'observe' && workspaceMode === 'single' && !workspaceImmersivePaneId}
>
  {#if workspaceImmersivePaneId}
    <div class="workspace-stage-single workspace-stage-single--immersive">
      {@render paneSurface(paneTab(workspaceImmersivePaneId), immersiveSlotIndex(), true)}
    </div>
  {:else if workspaceMode === 'single'}
    <div class="workspace-stage-single">
      {@render paneSurface(paneTab(workspacePaneIds[0]), 0)}
    </div>
  {:else if workspaceMode === 'split-2'}
    <div class="workspace-stage-row">
      <div class="workspace-stage-col" style:width={`${workspaceColumnSplit}%`}>
        {@render paneSurface(paneTab(workspacePaneIds[0]), 0)}
      </div>
      <Splitter orientation="vertical" onDrag={(dx) => shellStore.resizeWorkspaceColumn(dx)} onReset={() => shellStore.resetWorkspaceSplits()} />
      <div class="workspace-stage-col workspace-stage-col--fill">
        {@render paneSurface(paneTab(workspacePaneIds[1]), 1)}
      </div>
    </div>
  {:else}
    <div class="workspace-stage-row">
      <div class="workspace-stage-col" style:width={`${workspaceColumnSplit}%`}>
        <div class="workspace-stage-cell" style:height={`${workspaceLeftSplitY}%`}>
          {@render paneSurface(paneTab(workspacePaneIds[0]), 0)}
        </div>
        <Splitter orientation="horizontal" onDrag={(dy) => shellStore.resizeWorkspaceLeftRow(dy)} onReset={() => shellStore.resetWorkspaceSplits()} />
        <div class="workspace-stage-cell workspace-stage-cell--fill">
          {@render paneSurface(paneTab(workspacePaneIds[2]), 2)}
        </div>
      </div>
      <Splitter orientation="vertical" onDrag={(dx) => shellStore.resizeWorkspaceColumn(dx)} onReset={() => shellStore.resetWorkspaceSplits()} />
      <div class="workspace-stage-col workspace-stage-col--fill">
        <div class="workspace-stage-cell" style:height={`${workspaceRightSplitY}%`}>
          {@render paneSurface(paneTab(workspacePaneIds[1]), 1)}
        </div>
        <Splitter orientation="horizontal" onDrag={(dy) => shellStore.resizeWorkspaceRightRow(dy)} onReset={() => shellStore.resetWorkspaceSplits()} />
        <div class="workspace-stage-cell workspace-stage-cell--fill">
          {@render paneSurface(paneTab(workspacePaneIds[3]), 3)}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .workspace-stage {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: auto;
    scrollbar-gutter: stable both-edges;
    background: var(--g0);
  }

  .workspace-stage-single,
  .workspace-stage-row,
  .workspace-stage-col,
  .workspace-stage-cell,
  .workspace-slot-shell {
    min-height: 0;
    min-width: 0;
    display: flex;
    overflow: hidden;
  }

  .workspace-stage-single,
  .workspace-stage-row,
  .workspace-stage-col--fill,
  .workspace-stage-cell--fill,
  .workspace-slot-shell,
  .workspace-pane,
  .workspace-pane-body {
    flex: 1;
  }

  .workspace-stage-row { width: 100%; }
  .workspace-stage--immersive { overflow: hidden; }
  .workspace-stage-col { flex-direction: column; }

  .workspace-pane {
    min-width: 240px;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--g5) 10%, transparent);
    background: color-mix(in srgb, var(--g1) 90%, black);
  }

  .workspace-pane--immersive {
    border-color: transparent;
    box-shadow: none;
    background: var(--g0);
  }

  .workspace-pane.active {
    border-color: color-mix(in srgb, var(--brand) 16%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand) 8%, transparent);
  }

  .workspace-pane-head {
    height: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 6px;
    border-bottom: 1px solid color-mix(in srgb, var(--g5) 10%, transparent);
    background: color-mix(in srgb, var(--g1) 82%, black);
  }

  .workspace-immersive-bar {
    height: 22px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 4px 0 2px;
    border-bottom: 1px solid color-mix(in srgb, var(--g5) 8%, transparent);
    background: color-mix(in srgb, var(--g1) 54%, transparent);
  }

  .workspace-pane-title {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }

  .workspace-pane-title--immersive { gap: 8px; }

  .workspace-pane-kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--g5);
    flex-shrink: 0;
  }

  .workspace-pane-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ui-text-xs);
    color: color-mix(in srgb, var(--g9) 88%, var(--g6));
  }

  .workspace-pane-role,
  .workspace-pane-focus,
  .workspace-immersive-meta {
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .workspace-pane-role { color: var(--g6); }
  .workspace-pane-role[data-tone='primary'] { color: color-mix(in srgb, var(--brand) 82%, white); }
  .workspace-pane-role[data-tone='compare'] { color: color-mix(in srgb, var(--amb) 78%, white); }
  .workspace-pane-role[data-tone='reference'] { color: #8bb0ff; }
  .workspace-pane-focus { color: color-mix(in srgb, var(--pos) 72%, white); }
  .workspace-immersive-meta { color: var(--g5); }

  .workspace-pane-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0.12;
    transition: opacity 0.15s ease;
  }

  .workspace-pane:hover .workspace-pane-actions,
  .workspace-pane:focus-within .workspace-pane-actions,
  .workspace-pane.active .workspace-pane-actions { opacity: 1; }

  .workspace-pane-btn {
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    color: var(--g6);
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }

  .workspace-pane-btn:hover {
    border-color: color-mix(in srgb, var(--g5) 28%, transparent);
    color: var(--g9);
    background: color-mix(in srgb, var(--g2) 62%, black);
  }

  .workspace-pane-btn.active {
    border-color: color-mix(in srgb, var(--brand) 28%, transparent);
    color: var(--brand);
    background: color-mix(in srgb, var(--brand) 10%, transparent);
  }

  .workspace-pane-btn--immersive { opacity: 1; }

  .workspace-pane-body {
    min-height: 0;
    display: flex;
    overflow: auto;
    scrollbar-gutter: stable;
  }

  .workspace-stage--observe {
    background:
      radial-gradient(circle at 50% -18%, rgba(232,184,106,0.055), transparent 32%),
      #030405;
  }

  .workspace-stage--observe .workspace-pane,
  .workspace-stage--observe .workspace-pane.active {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }

  .workspace-stage--observe .workspace-pane-head {
    display: none;
  }

  .workspace-empty {
    flex: 1;
    min-width: 180px;
    min-height: 160px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px dashed color-mix(in srgb, var(--g5) 24%, transparent);
    background: color-mix(in srgb, var(--g1) 68%, black);
    color: var(--g6);
  }

  .workspace-empty-kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--g5);
  }

  .workspace-empty-copy { font-size: 11px; color: var(--g7); }
</style>
