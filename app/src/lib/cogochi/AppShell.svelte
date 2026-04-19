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

  interface Props {
    canvasComponent?: any;
  }

  const { canvasComponent = TradeMode }: Props = $props();

  let paletteOpen = $state(false);
  let shellState = $state<any>(null);

  $effect(() => {
    shellStore.subscribe(s => (shellState = s))();
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
          splitY={$shellStore.canvasSplitY}
          splitX={$shellStore.canvasSplitX}
          onResizeY={(dy) => shellStore.resizeCanvasY(dy)}
          onResizeX={(dx) => shellStore.resizeCanvasX(dx)}
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
          onSend={(text) => shellStore.updateTabState(s => ({ ...s, chat: [...(s.chat || []), { role: 'user', text }, { role: 'assistant', text: 'Processing: ' + text }] }))}
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
</div>

<style>
  .app-shell {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--g0);
    overflow: hidden;
  }

  .main-row {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }
</style>
