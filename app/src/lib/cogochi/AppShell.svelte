<script lang="ts">
  import { onMount } from 'svelte';
  import CommandBar from './CommandBar.svelte';
  import TabBar from './TabBar.svelte';
  import StatusBar from './StatusBar.svelte';
  import WatchlistRail from './WatchlistRail.svelte';
  import AIPanel from './AIPanel.svelte';
  import Splitter from './Splitter.svelte';
  import TradeMode from './modes/TradeMode.svelte';
  import WorkspaceStage from './WorkspaceStage.svelte';
  import { get } from 'svelte/store';
  import { shellStore, activeMode, activeTab, activeTabState, verdictCount, modelDelta } from './shell.store';
  import { viewportTier } from '$lib/stores/viewportTier';
  import { mobileMode } from '$lib/stores/mobileMode';
  import MobileTopBar from './MobileTopBar.svelte';
  import { chartSaveMode } from '$lib/stores/chartSaveMode';
  import SymbolPickerSheet from './SymbolPickerSheet.svelte';
  import ModeSheet from './ModeSheet.svelte';
  import IndicatorSettingsSheet from './IndicatorSettingsSheet.svelte';

  let paletteOpen = $state(false);
  let mobileTF = $state('4h');
  let mobileSymbol = $state('BTCUSDT');
  let symbolPickerOpen = $state(false);
  let desktopSymbolPickerOpen = $state(false);
  let desktopSymbolPickerTabId = $state<string | null>(null);
  let modeSheetOpen = $state(false);
  let indicatorSettingsOpen = $state(false);

  const desktopSymbol = $derived($activeTabState.symbol ?? 'BTCUSDT');

  function openDesktopSymbolPicker(tabId?: string) {
    desktopSymbolPickerTabId = tabId ?? $shellStore.activeTabId;
    desktopSymbolPickerOpen = true;
  }

  function appendAIDetail(userText: string, assistantText: string) {
    shellStore.update((s) => ({ ...s, aiVisible: true }));
    shellStore.updateTabState((s) => {
      const chat = s.chat || [];
      const prevUser = chat.at(-2);
      const prevAssistant = chat.at(-1);
      if (
        prevUser?.role === 'user' &&
        prevAssistant?.role === 'assistant' &&
        prevUser.text === userText &&
        prevAssistant.text === assistantText
      ) return s;
      return {
        ...s,
        chat: [...chat, { role: 'user', text: userText }, { role: 'assistant', text: assistantText }],
      };
    });
  }

  let aiSwipeTouchStartY = $state(0);
  function onAITouchStart(e: TouchEvent) { aiSwipeTouchStartY = e.touches[0].clientY; }
  function onAITouchEnd(e: TouchEvent) {
    const dy = e.changedTouches[0].clientY - aiSwipeTouchStartY;
    if (dy > 60) shellStore.update(s => ({ ...s, aiVisible: false }));
  }

  $effect(() => {
    if ($viewportTier.tier === 'MOBILE') {
      shellStore.update(s => ({ ...s, sidebarVisible: false, aiVisible: false }));
      shellStore.updateTabState(s => ({ ...s, layoutMode: 'C' }));
    } else {
      // Desktop / tablet: WatchlistRail + AIPanel are always visible.
      shellStore.update(s =>
        s.sidebarVisible && s.aiVisible ? s : { ...s, sidebarVisible: true, aiVisible: true },
      );
    }
  });

  onMount(() => {
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const workspaceMode = searchParams?.get('m');
    const workspacePanel = searchParams?.get('panel');
    const targetPanel =
      workspacePanel === 'scan' || workspacePanel === 'judge' || workspacePanel === 'analyze'
        ? workspacePanel : 'analyze';

    if (workspaceMode === 'detail') {
      if (get(viewportTier).tier === 'MOBILE') {
        mobileMode.setActive('detail');
      } else {
        shellStore.updateTabState((s) => ({ ...s, peekOpen: true, drawerTab: targetPanel }));
      }
    }

    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // Cmd+B / Cmd+L removed: WatchlistRail + AIPanel are always visible on desktop.
      if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); paletteOpen = !paletteOpen; }
      if (mod && e.key.toLowerCase() === 't') { e.preventDefault(); shellStore.openTab({ kind: 'trade', title: 'new session' }); }
      if (mod && e.key.toLowerCase() === 'w') {
        const st = get(shellStore);
        if (st.tabs.length > 1) { e.preventDefault(); shellStore.closeTab(st.activeTabId); }
      }
    };

    const onCmd = (e: CustomEvent) => {
      const c = e.detail;
      if (c.id === 'new_tab') shellStore.openTab({ kind: 'trade', title: 'new session' });
      else if (c.id === 'toggle_side') shellStore.toggleSidebar();
      else if (c.id === 'toggle_ai') shellStore.toggleAI();
      else if (c.id === 'mode_trade') shellStore.switchMode('trade');
      else if (c.id === 'mode_train') shellStore.switchMode('train');
      else if (c.id === 'mode_fly') shellStore.switchMode('flywheel');
      else if (c.id === 'new_trade') shellStore.openTab({ kind: 'trade', title: 'new session' });
      else if (c.id === 'open_indicator_settings') { indicatorSettingsOpen = true; }
      else if (c.id === 'open_ai_detail') {
        appendAIDetail(c.userText ?? '현재 analyze detail 설명해줘', c.assistantText ?? '');
      }
      else if (c.id === 'reset') { shellStore.reset(); window.location.reload(); }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('cogochi:cmd', onCmd as EventListener);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('cogochi:cmd', onCmd as EventListener);
    };
  });
</script>

<div class="app-shell">
  {#if $viewportTier.tier === 'MOBILE'}
    <!-- ── MOBILE ── -->
    <MobileTopBar
      symbol={mobileSymbol}
      timeframe={mobileTF}
      aiVisible={$shellStore.aiVisible}
      toggleAI={() => shellStore.toggleAI()}
      onTFChange={(tf) => (mobileTF = tf)}
      onSymbolTap={() => (symbolPickerOpen = true)}
      onModeTap={() => (modeSheetOpen = true)}
    />
    <div class="mobile-canvas">
      {#if $activeMode === 'trade'}
        <TradeMode
          mode={$activeMode}
          tabState={$activeTabState}
          updateTabState={(updater) => shellStore.updateTabState(updater)}
          symbol={mobileSymbol}
          timeframe={mobileTF}
          mobileView={$mobileMode.active === 'scan' ? 'scan' : $mobileMode.active === 'judge' ? 'judge' : $mobileMode.active === 'chart' ? 'chart' : 'analyze'}
          setMobileView={(v) => mobileMode.setActive(v === 'analyze' ? 'detail' : v)}
          setMobileSymbol={(s) => (mobileSymbol = s)}
        />
      {/if}
    </div>
    {#if symbolPickerOpen}
      <SymbolPickerSheet
        currentSymbol={mobileSymbol}
        onSelect={(s) => { mobileSymbol = s; shellStore.setSymbol(s); }}
        onClose={() => (symbolPickerOpen = false)}
      />
    {/if}
    {#if modeSheetOpen}
      <ModeSheet activeMode={$activeMode} onClose={() => (modeSheetOpen = false)} />
    {/if}
    {#if $shellStore.aiVisible}
      <div
        class="mobile-ai-sheet"
        ontouchstart={onAITouchStart}
        ontouchend={onAITouchEnd}
        role="dialog"
        aria-modal="true"
        aria-label="AI panel"
        tabindex="0"
      >
        <div class="sheet-topbar">
          <div class="sheet-handle"></div>
          <button class="sheet-close" onclick={() => shellStore.toggleAI()}>×</button>
        </div>
        <AIPanel
          messages={$activeTabState.chat || []}
          onSend={(_text, newMessages) => shellStore.updateTabState(s => ({ ...s, chat: newMessages }))}
          onApplySetup={(setup) => {
            shellStore.updateTabState(s => ({ ...s, tradePrompt: setup.text }));
            shellStore.update(st => ({
              ...st,
              tabs: st.tabs.map(t => t.id === st.activeTabId ? { ...t, title: setup.text.slice(0, 30) } : t),
            }));
          }}
          onClose={() => shellStore.toggleAI()}
        />
      </div>
    {/if}

  {:else}
    <!-- ── DESKTOP / TABLET ── -->
    <CommandBar
      sessionName={$activeTab?.title?.slice(0, 32) || ''}
      onRangeSelect={() => {
        const next = !$activeTabState.rangeSelection;
        shellStore.updateTabState(s => ({ ...s, rangeSelection: next }));
        if (next) chartSaveMode.enterRangeMode();
        else chartSaveMode.exitRangeMode();
      }}
      hasRange={$activeTabState.rangeSelection || $chartSaveMode.active}
      {paletteOpen}
      setPaletteOpen={(open) => (paletteOpen = open)}
    />

    <div class="main-row">
      <!-- Left: WatchlistRail — always visible -->
      <div class="sidebar-pane" style:width={`${Math.max(180, $shellStore.sidebarWidth)}px`}>
        <WatchlistRail
          activeSymbol={desktopSymbol}
          onSelectSymbol={(s) => shellStore.setSymbol(s)}
        />
      </div>
      <Splitter orientation="vertical" onDrag={(dx) => shellStore.resizeSidebar(dx)} onReset={() => shellStore.resetSidebarWidth()} />

      <!-- Center: Canvas + TabBar -->
      <div class="canvas-col">
        <TabBar
          tabs={$shellStore.tabs}
          activeTabId={$shellStore.activeTabId}
          setActiveTabId={(id) => shellStore.setActiveTabId(id)}
          onCloseTab={(id) => shellStore.closeTab(id)}
          onNewTab={() => shellStore.openTab({ kind: 'trade', title: 'new session' })}
          sidebarVisible={$shellStore.sidebarVisible}
          toggleSidebar={() => shellStore.toggleSidebar()}
          workMode={$shellStore.workMode}
          workspaceMode={$shellStore.workspaceMode}
          workspacePaneIds={$shellStore.workspacePaneIds}
          workspaceImmersivePaneId={$shellStore.workspaceImmersivePaneId}
          onToggleCompare={(id) => shellStore.toggleTabCompare(id)}
          onExpandPane={(id) => shellStore.expandWorkspacePane(id)}
          onSetWorkMode={(mode) => shellStore.setWorkMode(mode)}
          onSetWorkspaceMode={(mode) => shellStore.setWorkspaceStageMode(mode)}
          onResetWorkspaceStage={() => shellStore.resetWorkspaceStage()}
          onIndicators={() => (indicatorSettingsOpen = true)}
        />

        <WorkspaceStage
          tabs={$shellStore.tabs}
          activeTabId={$shellStore.activeTabId}
          workMode={$shellStore.workMode}
          workspaceMode={$shellStore.workspaceMode}
          workspacePaneIds={$shellStore.workspacePaneIds}
          workspaceImmersivePaneId={$shellStore.workspaceImmersivePaneId}
          workspaceColumnSplit={$shellStore.workspaceColumnSplit}
          workspaceLeftSplitY={$shellStore.workspaceLeftSplitY}
          workspaceRightSplitY={$shellStore.workspaceRightSplitY}
          onSymbolPickerOpen={(tabId) => openDesktopSymbolPicker(tabId)}
        />
      </div>

      <!-- Right: AI panel — always visible -->
      <Splitter orientation="vertical" onDrag={(dx) => shellStore.resizeAI(dx)} onReset={() => shellStore.resetAIWidth()} />
      <div class="ai-pane" style:width={`${Math.max(300, $shellStore.aiWidth)}px`}>
        <AIPanel
          messages={$activeTabState.chat || []}
          onSend={(_text, newMessages) => shellStore.updateTabState(s => ({ ...s, chat: newMessages }))}
          onApplySetup={(setup) => {
            shellStore.updateTabState(s => ({ ...s, tradePrompt: setup.text }));
            shellStore.update(st => ({
              ...st,
              tabs: st.tabs.map(t => t.id === st.activeTabId ? { ...t, title: setup.text.slice(0, 30) } : t),
            }));
          }}
          onClose={() => {}}
          symbol={desktopSymbol}
          timeframe={$activeTabState.timeframe ?? '4h'}
          onSelectSymbol={(s) => shellStore.setSymbol(s)}
        />
      </div>
    </div>

    <StatusBar
      mode={$activeMode}
      verdicts={$verdictCount}
      modelDelta={$modelDelta}
      onSwitchMode={(m) => shellStore.switchMode(m)}
      sidebarVisible={$shellStore.sidebarVisible}
    />
  {/if}

  <!-- Global overlays -->
  {#if desktopSymbolPickerOpen}
    <SymbolPickerSheet
      currentSymbol={desktopSymbol}
      onSelect={(s) => {
        shellStore.setSymbol(s, desktopSymbolPickerTabId ?? undefined);
        desktopSymbolPickerOpen = false;
      }}
      onClose={() => (desktopSymbolPickerOpen = false)}
    />
  {/if}

  {#if indicatorSettingsOpen}
    <IndicatorSettingsSheet onClose={() => (indicatorSettingsOpen = false)} />
  {/if}
</div>

<style>
  .app-shell {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--g0);
    overflow: hidden;
    font-family: 'Geist', 'Inter', system-ui, sans-serif;
    font-size: 11px;
    color: var(--g9);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  @media (max-width: 768px) {
    .app-shell {
      padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
    }
  }

  .main-row {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  .sidebar-pane {
    flex-shrink: 0;
    display: flex;
    overflow: hidden;
  }

  .canvas-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .ai-pane {
    flex-shrink: 0;
    overflow: hidden;
  }

  .mobile-canvas {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .mobile-ai-sheet {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    height: 52%;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    z-index: 200;
    background: var(--g1);
    border-top: 1px solid var(--g5);
    border-radius: 8px 8px 0 0;
    display: flex;
    flex-direction: column;
    animation: sheetSlideUp 0.2s ease;
  }

  .sheet-topbar {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 8px 12px 4px;
    flex-shrink: 0;
  }

  .sheet-handle {
    width: 36px; height: 4px;
    background: var(--g5);
    border-radius: 2px;
  }

  .sheet-close {
    position: absolute;
    right: 12px; top: 6px;
    width: 28px; height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 4px;
    color: var(--g6);
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
  }
  .sheet-close:active { background: var(--g3); }

  @keyframes sheetSlideUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
</style>
