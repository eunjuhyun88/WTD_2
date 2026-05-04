<script lang="ts">
  import type { Tab, ShellWorkMode, WorkspaceStageMode } from './shell.store';

  interface Props {
    tabs: Tab[];
    activeTabId: string;
    setActiveTabId: (id: string) => void;
    onCloseTab: (id: string) => void;
    onNewTab: () => void;
    sidebarVisible: boolean;
    toggleSidebar: () => void;
    workMode: ShellWorkMode;
    workspaceMode: WorkspaceStageMode;
    workspacePaneIds: [string | null, string | null, string | null, string | null];
    workspaceImmersivePaneId: string | null;
    onToggleCompare: (id: string) => void;
    onExpandPane: (id: string) => void;
    onSetWorkMode: (mode: ShellWorkMode) => void;
    onSetWorkspaceMode: (mode: WorkspaceStageMode) => void;
    onResetWorkspaceStage: () => void;
    onIndicators?: () => void;
    onReorderTabs?: (fromId: string, toId: string) => void;
  }

  const {
    tabs,
    activeTabId,
    setActiveTabId,
    onCloseTab,
    onNewTab,
    sidebarVisible,
    toggleSidebar,
    workMode,
    workspaceMode,
    workspacePaneIds,
    workspaceImmersivePaneId,
    onToggleCompare,
    onExpandPane,
    onSetWorkMode,
    onSetWorkspaceMode,
    onResetWorkspaceStage,
    onIndicators,
    onReorderTabs,
  }: Props = $props();

  // ── Tab drag-to-reorder ────────────────────────────────────────────────────
  let dragFromId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);

  function onDragStart(e: DragEvent, id: string) {
    dragFromId = id;
    e.dataTransfer?.setData('text/plain', id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e: DragEvent, id: string) {
    if (!dragFromId || dragFromId === id) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dragOverId = id;
  }

  function onDrop(e: DragEvent, toId: string) {
    e.preventDefault();
    if (dragFromId && dragFromId !== toId) onReorderTabs?.(dragFromId, toId);
    dragFromId = null;
    dragOverId = null;
  }

  function onDragEnd() {
    dragFromId = null;
    dragOverId = null;
  }

  function tabColor(kind: string): string {
    if (kind === 'trade') return 'var(--brand)';
    if (kind === 'train') return 'var(--amb)';
    if (kind === 'flywheel') return '#7aa2e0';
    return 'var(--g6)';
  }

  function tabSymbol(tab: Tab): string {
    const sym = tab.tabState?.symbol ?? 'BTC';
    return sym.replace(/USDT$/, '');
  }

  function tabTF(tab: Tab): string {
    return tab.tabState?.timeframe ?? '4h';
  }

  function paneSlot(id: string): number {
    return workspacePaneIds.findIndex(p => p === id);
  }

  function isInPane(id: string): boolean {
    return paneSlot(id) >= 0;
  }

  function paneCount(): number {
    return workspacePaneIds.filter(Boolean).length;
  }

  function paneLabel(slot: number): string {
    if (workspaceImmersivePaneId) return 'focus';
    if (slot === 0) return 'A';
    if (slot === 1) return 'B';
    if (slot === 2) return 'C';
    return 'D';
  }

  function paneColor(slot: number): string {
    if (slot === 0) return 'var(--brand)';
    if (slot === 1) return 'var(--amb)';
    if (slot === 2) return '#8bb0ff';
    return '#a0d080';
  }

  const WORK_MODES: Array<{ id: ShellWorkMode; label: string; title: string }> = [
    { id: 'observe', label: 'OBS', title: 'Observe — chart focus, no distractions' },
    { id: 'analyze', label: 'ANL', title: 'Analyze — indicators + evidence workspace' },
    { id: 'execute', label: 'EXE', title: 'Execute — order setup + sizing tools' },
  ];

  const LAYOUT_MODES: Array<{ id: WorkspaceStageMode; label: string; title: string }> = [
    { id: 'single', label: '▣', title: 'Single pane' },
    { id: 'split-2', label: '◫', title: 'Two-up compare' },
    { id: 'grid-4', label: '⊞', title: 'Four-up compare' },
  ];
</script>

<div class="tab-bar">
  <!-- Sidebar toggle -->
  <button class="sidebar-toggle" title="Toggle sidebar (⌘B)" onclick={toggleSidebar}>
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
      <rect x="0" y="0" width="5" height="10" rx="1" fill={sidebarVisible ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1" opacity={sidebarVisible ? '0.7' : '0.4'} />
      <rect x="7" y="0" width="7" height="2" rx="0.5" fill="currentColor" opacity={sidebarVisible ? '0.5' : '0.35'} />
      <rect x="7" y="4" width="7" height="2" rx="0.5" fill="currentColor" opacity={sidebarVisible ? '0.5' : '0.35'} />
      <rect x="7" y="8" width="7" height="2" rx="0.5" fill="currentColor" opacity={sidebarVisible ? '0.5' : '0.35'} />
    </svg>
  </button>

  <!-- Tabs -->
  <div class="tabs-scroll">
    {#each tabs as t (t.id)}
      {@const slot = paneSlot(t.id)}
      {@const inPane = slot >= 0}
      {@const isActive = t.id === activeTabId}
      {@const isFocused = workspaceImmersivePaneId === t.id}
      <div
        class="tab"
        class:active={isActive}
        class:in-pane={inPane && paneCount() > 1}
        class:immersive={isFocused}
        class:drag-over={dragOverId === t.id}
        style:--tab-color={tabColor(t.kind)}
        style:--pane-color={inPane ? paneColor(slot) : 'transparent'}
        role="button"
        tabindex="0"
        draggable={onReorderTabs != null}
        onclick={() => setActiveTabId(t.id)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTabId(t.id); } }}
        ondragstart={(e) => onDragStart(e, t.id)}
        ondragover={(e) => onDragOver(e, t.id)}
        ondrop={(e) => onDrop(e, t.id)}
        ondragend={onDragEnd}
        aria-pressed={isActive}
        title="{t.title} · {tabSymbol(t)} · {tabTF(t)}"
      >
        {#if inPane && paneCount() > 1}
          <span class="pane-badge" style:background={paneColor(slot)} title="Pane {paneLabel(slot)}">{paneLabel(slot)}</span>
        {/if}
        <span class="tab-symbol">{tabSymbol(t)}</span>
        <span class="tab-tf">{tabTF(t)}</span>
        <span class="tab-title">{t.title}</span>

        <div class="tab-actions">
          {#if paneCount() > 1 || workspaceMode !== 'single'}
            <button
              class="tab-act tab-act--compare"
              class:in-pane={inPane}
              type="button"
              title={inPane ? 'Remove from compare' : 'Add to compare'}
              onclick={(e) => { e.stopPropagation(); onToggleCompare(t.id); }}
              aria-label={inPane ? 'Remove from compare' : 'Add to compare'}
            >{inPane ? '−' : '⊕'}</button>
          {/if}
          {#if !t.locked}
            <button
              class="tab-act tab-act--close"
              type="button"
              title="Close tab"
              onclick={(e) => { e.stopPropagation(); onCloseTab(t.id); }}
              aria-label="Close tab"
            >×</button>
          {/if}
        </div>
      </div>
    {/each}

    <button class="new-tab-btn" onclick={onNewTab} title="New tab (⌘T)">+</button>
  </div>

  <!-- Spacer -->
  <div class="tab-bar-spacer"></div>

  <!-- Layout mode switcher -->
  <div class="layout-group" role="group" aria-label="Compare layout">
    {#if paneCount() > 1 || workspaceMode !== 'single'}
      <button
        class="layout-reset"
        type="button"
        title="Exit compare / reset to single"
        onclick={onResetWorkspaceStage}
      >✕ {paneCount() > 1 ? `${paneCount()}up` : ''}</button>
    {/if}
    {#each LAYOUT_MODES as lm}
      <button
        class="layout-btn"
        class:active={workspaceMode === lm.id && !workspaceImmersivePaneId}
        type="button"
        title={lm.title}
        onclick={() => onSetWorkspaceMode(lm.id)}
        aria-pressed={workspaceMode === lm.id}
      >{lm.label}</button>
    {/each}
  </div>

  <div class="tab-bar-sep"></div>

  <!-- Work mode switcher -->
  <div class="work-mode-group" role="group" aria-label="Work mode">
    {#each WORK_MODES as wm}
      <button
        class="work-mode-btn"
        class:active={workMode === wm.id}
        type="button"
        title={wm.title}
        onclick={() => onSetWorkMode(wm.id)}
        aria-pressed={workMode === wm.id}
      >{wm.label}</button>
    {/each}
  </div>

  {#if onIndicators}
    <div class="tab-bar-sep"></div>
    <button
      class="ind-tab-btn"
      type="button"
      title="Indicator settings"
      onclick={onIndicators}
      aria-label="Indicator settings"
    >⚙</button>
  {/if}
</div>

<style>
  .tab-bar {
    height: var(--zone-tab-bar, 24px);
    display: flex;
    align-items: stretch;
    background: var(--g0);
    border-bottom: 1px solid color-mix(in srgb, var(--g5) 28%, transparent);
    flex-shrink: 0;
    user-select: none;
  }

  /* Sidebar toggle */
  .sidebar-toggle {
    width: 36px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-right: 1px solid color-mix(in srgb, var(--g5) 18%, transparent);
    cursor: pointer;
    color: var(--g6);
    transition: color 0.12s;
  }
  .sidebar-toggle:hover { color: var(--g8); }

  /* Tabs scroll area */
  .tabs-scroll {
    display: flex;
    align-items: stretch;
    overflow: auto hidden;
    scrollbar-width: none;
    flex: 0 1 auto;
    min-width: 0;
  }
  .tabs-scroll::-webkit-scrollbar { display: none; }

  /* Single tab */
  .tab {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px 0 8px;
    min-width: 100px;
    max-width: 200px;
    cursor: pointer;
    border-right: 1px solid color-mix(in srgb, var(--g5) 16%, transparent);
    border-top: 1.5px solid transparent;
    transition: background 0.12s, border-top-color 0.12s;
    outline: none;
  }

  .tab:hover { background: color-mix(in srgb, var(--g2) 60%, transparent); }

  .tab.active {
    background: var(--g1);
    border-top-color: var(--tab-color);
  }

  .tab.in-pane { border-bottom: 1.5px solid var(--pane-color); }

  .tab.drag-over {
    border-left: 2px solid var(--brand);
    background: color-mix(in srgb, var(--brand) 6%, transparent);
  }

  .tab.immersive {
    border-top-color: var(--brand);
    border-bottom-color: var(--brand);
    background: color-mix(in srgb, var(--brand) 8%, transparent);
  }

  /* Pane badge (A/B/C/D) */
  .pane-badge {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0;
    color: #000;
    opacity: 0.9;
  }

  .tab-symbol {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--g8);
    flex-shrink: 0;
  }

  .tab-tf {
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    color: var(--g5);
    flex-shrink: 0;
  }

  .tab-title {
    font-size: var(--ui-text-xs);
    color: var(--g6);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .tab.active .tab-symbol { color: var(--g9); }
  .tab.active .tab-tf { color: var(--g6); }
  .tab.active .tab-title { color: var(--g7); }

  /* Tab action buttons */
  .tab-actions {
    display: flex;
    align-items: center;
    gap: 1px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .tab:hover .tab-actions,
  .tab.active .tab-actions { opacity: 1; }

  .tab-act {
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    background: transparent;
    border: none;
    font-size: var(--ui-text-xs);
    cursor: pointer;
    color: var(--g5);
    transition: color 0.1s, background 0.1s;
    line-height: 1;
    padding: 0;
  }

  .tab-act:hover { color: var(--g9); background: color-mix(in srgb, var(--g4) 40%, transparent); }

  .tab-act--compare.in-pane { color: var(--pane-color); }
  .tab-act--close:hover { color: var(--neg); }

  /* New tab */
  .new-tab-btn {
    width: 24px;
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: var(--g5);
    font-size: 11px;
    cursor: pointer;
    transition: color 0.12s;
    align-self: center;
  }
  .new-tab-btn:hover { color: var(--g8); }

  /* Spacer */
  .tab-bar-spacer { flex: 1; }

  /* Sep */
  .tab-bar-sep {
    width: 1px;
    align-self: stretch;
    margin: 5px 2px;
    background: color-mix(in srgb, var(--g5) 20%, transparent);
    flex-shrink: 0;
  }

  /* Layout mode group */
  .layout-group {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 0 4px;
    flex-shrink: 0;
  }

  .layout-reset {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 5px;
    height: 18px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--amb) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--amb) 22%, transparent);
    color: var(--amb);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: background 0.12s;
    margin-right: 3px;
  }
  .layout-reset:hover { background: color-mix(in srgb, var(--amb) 20%, transparent); }

  .layout-btn {
    width: 22px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--g5);
    font-size: 11px;
    cursor: pointer;
    transition: color 0.12s, background 0.12s, border-color 0.12s;
  }

  .layout-btn:hover {
    color: var(--g8);
    background: color-mix(in srgb, var(--g3) 50%, transparent);
    border-color: color-mix(in srgb, var(--g5) 20%, transparent);
  }

  .layout-btn.active {
    color: var(--brand);
    background: color-mix(in srgb, var(--brand) 10%, transparent);
    border-color: color-mix(in srgb, var(--brand) 22%, transparent);
  }

  /* Work mode group */
  .work-mode-group {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 0 5px 0 2px;
    flex-shrink: 0;
  }

  .work-mode-btn {
    padding: 0 6px;
    height: 18px;
    border-radius: 3px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--g5);
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: color 0.12s, background 0.12s, border-color 0.12s;
  }

  .work-mode-btn:hover {
    color: var(--g8);
    background: color-mix(in srgb, var(--g3) 50%, transparent);
    border-color: color-mix(in srgb, var(--g5) 20%, transparent);
  }

  .work-mode-btn.active {
    color: var(--amb);
    background: var(--amb-d);
    border-color: color-mix(in srgb, var(--amb) 30%, transparent);
  }

  /* INDICATORS button (right side) */
  .ind-tab-btn {
    width: 28px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--g5);
    font-size: 11px;
    cursor: pointer;
    transition: color 0.12s, background 0.12s;
    flex-shrink: 0;
  }
  .ind-tab-btn:hover {
    color: var(--g8);
    background: color-mix(in srgb, var(--g3) 50%, transparent);
  }
  @media (max-width: 900px) {
    .ind-tab-btn { display: none; }
  }
</style>
