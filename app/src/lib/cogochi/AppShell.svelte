<script lang="ts">
  import { onMount } from 'svelte';
  // CommandBar unused — W-0375 (removed from desktop chrome)
  // import CommandBar from './CommandBar.svelte';
  import NewsFlashBar from '../../components/terminal/workspace/NewsFlashBar.svelte';
  import ResearchPanel from '../../components/terminal/workspace/ResearchPanel.svelte';
  import type { ChartViewportSnapshot } from '$lib/contracts/terminalPersistence';
  import TabBar from './TabBar.svelte';
  import StatusBar from './StatusBar.svelte';
  import WatchlistRail from './WatchlistRail.svelte';
  import AIAgentPanel from './AIAgentPanel.svelte';
  import BottomSheet from './BottomSheet.svelte';
  import TopBar from './TopBar.svelte';
  import ChartToolbar from './ChartToolbar.svelte';
  import Splitter from './Splitter.svelte';
  import TradeMode from './modes/TradeMode.svelte';
  import WorkspaceStage from './WorkspaceStage.svelte';
  import { get } from 'svelte/store';
  import { shellStore, activeMode, activeTab, activeTabState, verdictCount, modelDelta, isDecideMode } from './shell.store';
  import DecideRightPanel from './DecideRightPanel.svelte';
  import MultiPaneChartAdapter from './MultiPaneChartAdapter.svelte';
  import PatternLibraryPanelAdapter from './PatternLibraryPanelAdapter.svelte';
  import { viewportTier } from '$lib/stores/viewportTier';
  import { mobileMode } from '$lib/stores/mobileMode';
  import MobileTopBar from './MobileTopBar.svelte';
  import { chartSaveMode } from '$lib/stores/chartSaveMode';
  import SymbolPickerSheet from './SymbolPickerSheet.svelte';
  import ModeSheet from './ModeSheet.svelte';
  import IndicatorSettingsSheet from './IndicatorSettingsSheet.svelte';
  import IndicatorLibrary from './IndicatorLibrary.svelte';
  import DrawingRail from './DrawingRail.svelte';
  import type { DrawingTool } from './shell.store';

  let paletteOpen = $state(false);
  let mobileTF = $state('4h');
  let mobileSymbol = $state('BTCUSDT');
  let symbolPickerOpen = $state(false);
  let desktopSymbolPickerOpen = $state(false);
  let desktopSymbolPickerTabId = $state<string | null>(null);
  let modeSheetOpen = $state(false);
  let indicatorSettingsOpen = $state(false);
  let indicatorLibraryOpen = $state(false);

  const desktopSymbol = $derived($activeTabState.symbol ?? 'BTCUSDT');
  const aiPaneWidth = $derived($activeTabState.rightPanelExpanded ? 480 : Math.max(300, $shellStore.aiWidth));

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

    const isInputActive = () => {
      const el = document.activeElement as HTMLElement | null;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el?.isContentEditable === true
      );
    };

    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // Cmd+B / Cmd+L removed: WatchlistRail + AIPanel are always visible on desktop.
      if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); paletteOpen = !paletteOpen; }
      if (mod && e.key.toLowerCase() === 't') { e.preventDefault(); shellStore.openTab({ kind: 'trade', title: 'new session' }); }
      if (mod && e.key.toLowerCase() === 'w') {
        const st = get(shellStore);
        if (st.tabs.length > 1) { e.preventDefault(); shellStore.closeTab(st.activeTabId); }
      }

      // TV-style shortcuts (desktop only, no modifier)
      if (!mod && e.key.toLowerCase() === 'b' && !isInputActive()) {
        e.preventDefault();
        chartSaveMode.enterRangeMode();
        shellStore.updateTabState(s => ({ ...s, rangeSelection: true }));
      }

      // 1-8: Timeframe shortcuts (from TopBar integration)
      if (!mod && /^[1-8]$/.test(e.key) && !isInputActive()) {
        const tfIndex = parseInt(e.key) - 1;
        const tfs = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'];
        if (tfs[tfIndex]) {
          e.preventDefault();
          shellStore.setTimeframe(tfs[tfIndex]);
        }
      }

      // D-4: drawing tool shortcuts (no modifier, no input focused)
      if (!mod && !isInputActive()) {
        const k = e.key.toLowerCase();
        const map: Record<string, DrawingTool> = {
          t: 'trendLine',
          h: 'horizontalLine',
          v: 'verticalLine',
          e: 'extendedLine',
          r: 'rectangle',
          f: 'fibRetracement',
          l: 'textLabel',
        };
        if (map[k]) {
          e.preventDefault();
          shellStore.setDrawingTool(map[k]);
        }
      }

      if (e.key === 'Escape') {
        if (chartSaveMode.snapshot().active) {
          chartSaveMode.exitRangeMode();
          shellStore.updateTabState(s => ({ ...s, rangeSelection: false }));
        }
        if (get(shellStore).drawingTool !== 'cursor') {
          shellStore.setDrawingTool('cursor');
        }
        if (desktopSymbolPickerOpen) desktopSymbolPickerOpen = false;
      }
      if (!mod && e.key === '/' && !isInputActive()) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('cogochi:cmd', { detail: { id: 'focus_ai_input' } }));
      }
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        desktopSymbolPickerOpen = true;
      }
      // D-7: ⌘L → focus AI Search (Bloomberg-style)
      if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('cogochi:cmd', { detail: { id: 'focus_ai_search' } }));
      }
      // D-7: ⌘I → toggle IndicatorLibrary (was ⌘L)
      if (mod && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        indicatorLibraryOpen = !indicatorLibraryOpen;
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
      else if (c.id === 'mode_decide') shellStore.setWorkMode('decide');
      else if (c.id === 'new_trade') shellStore.openTab({ kind: 'trade', title: 'new session' });
      else if (c.id === 'open_indicator_settings') { indicatorSettingsOpen = true; }
      else if (c.id === 'open_indicator_library') { indicatorLibraryOpen = true; }
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
    <BottomSheet
      open={$shellStore.aiVisible}
      title="AI AGENT"
      height="85vh"
      onClose={() => shellStore.toggleAI()}
    >
      <div class="mobile-agent-host">
        <AIAgentPanel
          symbol={mobileSymbol}
          timeframe={mobileTF}
          onSelectSymbol={(s) => { mobileSymbol = s; shellStore.setSymbol(s); }}
        />
      </div>
    </BottomSheet>

  {:else}
    <!-- ── DESKTOP / TABLET ── -->
    <!-- CommandBar: UNUSED — W-0375 (60px chrome saved) -->

    <TopBar
      onSymbolTap={() => (desktopSymbolPickerOpen = true)}
      onIndicators={() => (indicatorSettingsOpen = true)}
    />

    <!-- NewsFlashBar: auto-hides when no events, throttled headlines -->
    <NewsFlashBar symbol={desktopSymbol} />

    <div class="main-row">
      <!-- Left: WatchlistRail — always visible -->
      <div class="sidebar-pane" style:width={`${Math.max(180, $shellStore.sidebarWidth)}px`}>
        <WatchlistRail
          activeSymbol={desktopSymbol}
          onSelectSymbol={(s) => shellStore.setSymbol(s)}
        />
      </div>
      <Splitter orientation="vertical" onDrag={(dx) => shellStore.resizeSidebar(dx)} onReset={() => shellStore.resetSidebarWidth()} />

      <!-- D-4: Drawing rail (left of canvas, desktop only) -->
      <DrawingRail />

      <!-- Center: Canvas + TabBar -->
      <div class="canvas-col" style:position="relative">
        {#if $chartSaveMode.active}
          <div class="range-hint">
            {$chartSaveMode.anchorA == null ? 'Click anchor A on chart' : 'Click anchor B on chart'} — <kbd>Esc</kbd> to cancel
          </div>
        {/if}
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

        <ChartToolbar
          onIndicators={() => (indicatorLibraryOpen = true)}
          onSettings={() => (indicatorSettingsOpen = true)}
        />

        {#if $isDecideMode}
          <div class="decide-canvas">
            <MultiPaneChartAdapter />
          </div>
        {:else}
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
        {/if}

        <!-- ResearchPanel: slides in when chart range is fully selected (A+B anchors) -->
        {#if $chartSaveMode.active && $chartSaveMode.anchorA !== null && $chartSaveMode.anchorB !== null}
          <div class="research-overlay">
            <ResearchPanel
              symbol={desktopSymbol}
              tf={$activeTabState.timeframe ?? '4h'}
              open={true}
              viewport={{
                timeFrom: Math.min($chartSaveMode.anchorA, $chartSaveMode.anchorB),
                timeTo: Math.max($chartSaveMode.anchorA, $chartSaveMode.anchorB),
                tf: $activeTabState.timeframe ?? '4h',
                barCount: 0,
                klines: [],
                indicators: {},
              } satisfies ChartViewportSnapshot}
              onClose={() => chartSaveMode.exitRangeMode()}
              onSaved={(captureId) => {
                shellStore.setDecisionBundle({
                  symbol: desktopSymbol,
                  timeframe: $activeTabState.timeframe ?? '4h',
                  patternSlug: null,
                });
                shellStore.setRightPanelTab('analyze');
                chartSaveMode.exitRangeMode();
              }}
            />
          </div>
        {/if}
      </div>

      <!-- Right: AI agent panel or Decide panel — always visible -->
      <Splitter orientation="vertical" onDrag={(dx) => shellStore.resizeAI(dx)} onReset={() => shellStore.resetAIWidth()} />
      <div class="ai-pane" style:width={`${aiPaneWidth}px`}>
        {#if $isDecideMode}
          <DecideRightPanel />
        {:else}
          <AIAgentPanel
            symbol={desktopSymbol}
            timeframe={$activeTabState.timeframe ?? '4h'}
            onSelectSymbol={(s) => shellStore.setSymbol(s)}
          />
        {/if}
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

  <IndicatorLibrary
    open={indicatorLibraryOpen}
    onClose={() => (indicatorLibraryOpen = false)}
  />

  <!-- Pattern Library overlay (modal) — only on desktop -->
  {#if $viewportTier.tier !== 'MOBILE'}
    <PatternLibraryPanelAdapter />
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

  .range-hint {
    position: absolute;
    top: 4px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    background: var(--amb-d);
    border: 1px solid var(--amb);
    color: var(--amb);
    font-size: 10px;
    padding: 3px 10px;
    border-radius: 4px;
    pointer-events: none;
    white-space: nowrap;
    letter-spacing: 0.04em;
  }

  .range-hint kbd {
    font-family: inherit;
    background: var(--g4);
    border: 1px solid var(--g5);
    border-radius: 2px;
    padding: 0 3px;
    font-size: 9px;
    color: var(--g8);
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
    contain: layout paint;
  }

  .decide-canvas {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    contain: layout paint;
  }

  /* ResearchPanel slides in from right side of chart area on range selection */
  .research-overlay {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 340px;
    z-index: 20;
    background: var(--g1, #0c0a09);
    border-left: 1px solid var(--g4, #272320);
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    animation: slide-in-right 0.15s ease-out;
  }

  @keyframes slide-in-right {
    from { transform: translateX(100%); opacity: 0; }
    to   { transform: translateX(0);   opacity: 1; }
  }

  .ai-pane {
    flex-shrink: 0;
    overflow: hidden;
    contain: layout paint;
  }

  .mobile-canvas {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    contain: layout paint;
  }

  .mobile-agent-host {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    contain: layout paint;
  }
</style>
