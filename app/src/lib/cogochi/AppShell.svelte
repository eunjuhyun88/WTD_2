<script lang="ts">
  import { onMount } from 'svelte';
  import CommandBar from './CommandBar.svelte';
  import TabBar from './TabBar.svelte';
  import StatusBar from './StatusBar.svelte';
  import Sidebar from './Sidebar.svelte';
  import AIPanel from './AIPanel.svelte';
  import Splitter from './Splitter.svelte';
  import TradeMode from './modes/TradeMode.svelte';
  import TrainMode from './modes/TrainMode.svelte';
  import RadialTopology from './modes/RadialTopology.svelte';
  import { shellStore, activeMode, activeTab, activeTabState, verdictCount, modelDelta } from './shell.store';
  import { viewportTier } from '$lib/stores/viewportTier';
  import { mobileMode } from '$lib/stores/mobileMode';
  import MobileTopBar from './MobileTopBar.svelte';
  import MobileFooter from './MobileFooter.svelte';
  import SymbolPickerSheet from './SymbolPickerSheet.svelte';
  import ModeSheet from './ModeSheet.svelte';

  interface Props {
    canvasComponent?: any;
  }

  const { canvasComponent = TradeMode }: Props = $props();

  let paletteOpen = $state(false);
  let shellState = $state<any>(null);
  let mobileTF = $state('4h');
  let mobileSymbol = $state('BTCUSDT');
  let symbolPickerOpen = $state(false);
  let modeSheetOpen = $state(false);

  // AI sheet swipe-down dismiss
  let aiSwipeTouchStartY = $state(0);
  function onAITouchStart(e: TouchEvent) { aiSwipeTouchStartY = e.touches[0].clientY; }
  function onAITouchEnd(e: TouchEvent) {
    const dy = e.changedTouches[0].clientY - aiSwipeTouchStartY;
    if (dy > 60) shellStore.update(s => ({ ...s, aiVisible: false }));
  }

  $effect(() => {
    shellStore.subscribe(s => (shellState = s))();
  });

  $effect(() => {
    if ($viewportTier.tier === 'MOBILE') {
      shellStore.update(s => ({ ...s, sidebarVisible: false, aiVisible: false }));
      shellStore.updateTabState(s => ({ ...s, layoutMode: 'D' }));
    }
  });

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        shellStore.toggleSidebar();
      }
      if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        shellStore.toggleAI();
      }
      if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        paletteOpen = !paletteOpen;
      }
      if (mod && e.key.toLowerCase() === 't') {
        e.preventDefault();
        shellStore.openTab({ kind: 'trade', title: 'new session' });
      }
      if (mod && e.key.toLowerCase() === 'w' && shellState?.tabs?.length > 1) {
        e.preventDefault();
        shellStore.closeTab(shellState.activeTabId);
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
      else if (c.id === 'reset') {
        shellStore.reset();
        window.location.reload();
      }
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
    <!-- ── MOBILE shell ── -->
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
          setMobileView={(v) => mobileMode.setActive(v)}
          setMobileSymbol={(s) => (mobileSymbol = s)}
        />
      {/if}
    </div>
    <MobileFooter symCount={300} live={true} />
    {#if symbolPickerOpen}
      <SymbolPickerSheet
        currentSymbol={mobileSymbol}
        onSelect={(s) => (mobileSymbol = s)}
        onClose={() => (symbolPickerOpen = false)}
      />
    {/if}
    {#if modeSheetOpen}
      <ModeSheet
        activeMode={$activeMode}
        onClose={() => (modeSheetOpen = false)}
      />
    {/if}
    {#if $shellStore.aiVisible}
      <div class="mobile-ai-sheet" ontouchstart={onAITouchStart} ontouchend={onAITouchEnd}>
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
              tabs: st.tabs.map(t =>
                t.id === st.activeTabId
                  ? { ...t, title: setup.text.slice(0, 30) }
                  : t
              ),
            }));
          }}
          onClose={() => shellStore.toggleAI()}
        />
      </div>
    {/if}
  {:else}
    <!-- ── DESKTOP / TABLET shell ── -->
    <CommandBar
      sessionName={$activeTab?.title?.slice(0, 32) || ''}
      onRangeSelect={() => shellStore.updateTabState(s => ({ ...s, rangeSelection: !s.rangeSelection }))}
      hasRange={$activeTabState.rangeSelection}
      aiVisible={$shellStore.aiVisible}
      toggleAI={() => shellStore.toggleAI()}
      {paletteOpen}
      setPaletteOpen={(open) => (paletteOpen = open)}
    />

    <TabBar
      tabs={$shellStore.tabs}
      activeTabId={$shellStore.activeTabId}
      setActiveTabId={(id) => shellStore.setActiveTabId(id)}
      onCloseTab={(id) => shellStore.closeTab(id)}
      onNewTab={() => shellStore.openTab({ kind: 'trade', title: 'new session' })}
      sidebarVisible={$shellStore.sidebarVisible}
      toggleSidebar={() => shellStore.toggleSidebar()}
    />

    <div class="main-row">
      {#if $shellStore.sidebarVisible}
        <div style:width={`${$shellStore.sidebarWidth}px`} style:flex-shrink="0" style:display="flex">
          <Sidebar
            visible={true}
            activeSection={$shellStore.activeSection}
            setActiveSection={(id) => shellStore.setActiveSection(id)}
            onOpenTab={(tab) => shellStore.openTab(tab)}
          />
        </div>
        <Splitter orientation="vertical" onDrag={(dx) => shellStore.resizeSidebar(dx)} />
      {/if}

      <div style:flex="1" style:min-width="0" style:display="flex" style:flex-direction="column" style:overflow="hidden">
        {#if $activeMode === 'trade'}
          <TradeMode
            mode={$activeMode}
            tabState={$activeTabState}
            updateTabState={(updater) => shellStore.updateTabState(updater)}
            symbol="BTCUSDT"
            timeframe="4h"
          />
        {:else if $activeMode === 'train'}
          <TrainMode mode={$activeMode} />
        {:else if $activeMode === 'flywheel'}
          <RadialTopology mode={$activeMode} />
        {/if}
      </div>

      {#if $shellStore.aiVisible}
        <Splitter orientation="vertical" onDrag={(dx) => shellStore.resizeAI(dx)} />
        <div style:width={`${$shellStore.aiWidth}px`} style:flex-shrink="0">
          <AIPanel
            messages={$activeTabState.chat || []}
            onSend={(_text, newMessages) => shellStore.updateTabState(s => ({ ...s, chat: newMessages }))}
            onApplySetup={(setup) => {
              shellStore.updateTabState(s => ({ ...s, tradePrompt: setup.text }));
              shellStore.update(st => ({
                ...st,
                tabs: st.tabs.map(t =>
                  t.id === st.activeTabId
                    ? { ...t, title: setup.text.slice(0, 30) }
                    : t
                ),
              }));
            }}
            onClose={() => shellStore.toggleAI()}
          />
        </div>
      {/if}
    </div>

    <StatusBar
      mode={$activeMode}
      verdicts={$verdictCount}
      modelDelta={$modelDelta}
      onSwitchMode={(m) => shellStore.switchMode(m)}
      sidebarVisible={$shellStore.sidebarVisible}
    />
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
    /* Fix 5: iOS safe area — 홈 인디케이터 뒤 안 가려짐 */
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  .main-row {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
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
    left: 0;
    right: 0;
    bottom: 0;
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
    width: 36px;
    height: 4px;
    background: var(--g5);
    border-radius: 2px;
  }

  .sheet-close {
    position: absolute;
    right: 12px;
    top: 6px;
    width: 28px;
    height: 28px;
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

  .sheet-close:active {
    background: var(--g3);
  }

  @keyframes sheetSlideUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
</style>
