<script lang="ts">
  import { onMount } from 'svelte';
  // CommandBar unused — W-0375 (removed from desktop chrome)
  // import CommandBar from './CommandBar.svelte';
  import NewsFlashBar from './workspace/NewsFlashBar.svelte';

  import TabBar from './TabBar.svelte';
  import StatusBar from './StatusBar.svelte';
  import WatchlistRail from './panels/WatchlistRail/WatchlistRail.svelte';
  import AIAgentPanel from './panels/AIAgentPanel/AIAgentPanel.svelte';
  import BottomSheet from './BottomSheet.svelte';
  import TopBar from './TopBar.svelte';
  import ChartToolbar from './L1/ChartToolbar.svelte';
  import Splitter from './Splitter.svelte';
  import TradeMode from './workspace/TradeMode.svelte';
  import WorkspaceStage from './workspace/WorkspaceStage.svelte';
  import { get } from 'svelte/store';
  import { shellStore, activeMode, activeTab, activeTabState, verdictCount, modelDelta, allVerdicts } from './shell.store';
  import { chartFreshness } from '$lib/stores/chartFreshness';
  import { viewportTier } from '$lib/stores/viewportTier';
  import { mobileMode } from '$lib/stores/mobileMode';
  import MobileTopBar from './MobileTopBar.svelte';
  import MobileBottomNav from './MobileBottomNav.svelte';
  import { chartSaveMode, selectedRange } from '$lib/stores/chartSaveMode';
  import RangeSelectionPanel from '$lib/shared/chart/overlays/RangeSelectionPanel.svelte';
  import type { JudgeVerdict } from '$lib/shared/chart/overlays/RangeSelectionPanel.svelte';
  import { buildIndicatorSnapshotFromRange } from '$lib/terminal/buildIndicatorSnapshotFromRange';
  import type { RangeSelectionBar } from '$lib/terminal/rangeSelectionCapture';
  import SymbolPickerSheet from './SymbolPickerSheet.svelte';
  import ModeSheet from './ModeSheet.svelte';
  import IndicatorSettingsSheet from './IndicatorSettingsSheet.svelte';
  import IndicatorCatalogModal from '$lib/components/indicators/IndicatorCatalogModal.svelte';
  import DrawingRail from './panels/DrawingRail.svelte';
  import type { DrawingTool } from './shell.store';
  import CommandPalette from '$lib/shared/panels/CommandPalette.svelte';
  import TerminalHoldTimeAdapter from './panels/TerminalHoldTimeAdapter.svelte';
  import { track } from '$lib/analytics';
  import { trackPanelFoldToggle } from './telemetry';
  import SaveRangeToast from './workspace/SaveRangeToast.svelte';

  // ── W-0395: HoldTime stats for StatusBar ──────────────────────────────────
  let holdP50 = $state<number | null>(null);
  let holdP90 = $state<number | null>(null);

  let paletteOpen = $state(false);
  let paletteQ = $state('');
  let mobileTF = $state('4h');
  let mobileSymbol = $state('BTCUSDT');
  let initialDecideId = $state<string | null>(null);

  // ── W-0392: Judge-Save flywheel state ─────────────────────────────────────
  let judgeLoading = $state(false);
  let judgeVerdict = $state<JudgeVerdict | null>(null);

  // ── Pattern recall (core loop: drag → recall → verdict → Layer C) ─────────
  interface PatternMatch { slug: string; label: string; similarity: number; outcome: string; }
  let recallResults = $state<PatternMatch[]>([]);
  let recallLoading = $state(false);

  async function handleRecall(): Promise<void> {
    const range = $selectedRange;
    if (!range) return;
    recallLoading = true;
    try {
      const res = await fetch('/api/patterns/recall', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          symbol: desktopSymbol,
          timeframe: $activeTabState.timeframe ?? '4h',
          fromTime: range.from,
          toTime: range.to,
        }),
      });
      if (!res.ok) throw new Error(`recall ${res.status}`);
      const data = (await res.json()) as { patterns: PatternMatch[] };
      recallResults = data.patterns ?? [];
    } catch (e) {
      console.error('[core-loop] recall failed', e);
    } finally {
      recallLoading = false;
    }
  }

  // Auto-recall: fire as soon as both anchors are set (no button click needed).
  $effect(() => {
    const range = $selectedRange;
    if (!range) { recallResults = []; return; }
    handleRecall();
  });

  /** Bars sliced to the selected anchor range (anchorA..anchorB). */
  const slicedBars = $derived.by<RangeSelectionBar[]>(() => {
    const range = $selectedRange;
    const payload = $chartSaveMode.payload;
    if (!range || !payload?.klines) return [];
    return payload.klines
      .filter((k: { time: number }) => k.time >= range.from && k.time <= range.to)
      .map((k: { time: number; open: number; high: number; low: number; close: number; volume: number }) => ({
        time: k.time,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume ?? 0,
      }));
  });

  /** Indicator snapshot derived from sliced bars. */
  const rangeSnapshot = $derived(buildIndicatorSnapshotFromRange(slicedBars));

  /** Session-level judge cache key. */
  function judgeCacheKey(from: number, to: number, sym: string, tf: string): string {
    return `judge_cache_${sym}_${tf}_${from}_${to}`;
  }

  async function handleJudge(): Promise<void> {
    const range = $selectedRange;
    if (!range) return;
    const sym = desktopSymbol;
    const tf = $activeTabState.timeframe ?? '4h';
    const snap = rangeSnapshot;
    if (!snap || Object.keys(snap).length < 3) return;

    // Check sessionStorage cache (5 min TTL)
    const cacheKey = judgeCacheKey(range.from, range.to, sym, tf);
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { verdict: v, ts } = JSON.parse(cached) as { verdict: JudgeVerdict; ts: number };
        if (Date.now() - ts < 5 * 60_000) {
          judgeVerdict = v;
          return;
        }
      }
    } catch { /* ignore storage errors */ }

    judgeLoading = true;
    try {
      const res = await fetch('/api/engine/agent/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: sym,
          timeframe: tf,
          indicator_snapshot: snap,
          context: { from_ts: range.from, to_ts: range.to },
        }),
      });
      if (!res.ok) throw new Error(`judge ${res.status}`);
      const verdict = (await res.json()) as JudgeVerdict;
      judgeVerdict = verdict;
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ verdict, ts: Date.now() }));
      } catch { /* ignore */ }
    } catch (e) {
      console.error('[W-0392] judge failed', e);
    } finally {
      judgeLoading = false;
    }
  }

  async function handleSaveWithVerdict(): Promise<void> {
    const range = $selectedRange;
    if (!range) return;
    const sym = desktopSymbol;
    const tf = $activeTabState.timeframe ?? '4h';
    try {
      await fetch('/api/engine/agent/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: sym,
          timeframe: tf,
          snapshot: rangeSnapshot ?? {},
          decision: judgeVerdict ? { ...judgeVerdict } : undefined,
          trigger_origin: 'agent_judge',
        }),
      });
    } catch (e) {
      console.error('[W-0392] save failed', e);
    }
    judgeVerdict = null;
    recallResults = [];
    chartSaveMode.exitRangeMode();
  }

  async function handleSaveOnly(): Promise<void> {
    const range = $selectedRange;
    if (!range) return;
    await chartSaveMode.save({
      symbol: desktopSymbol,
      tf: $activeTabState.timeframe ?? '4h',
      ohlcvBars: slicedBars,
    });
    judgeVerdict = null;
    recallResults = [];
  }
  let symbolPickerOpen = $state(false);
  let desktopSymbolPickerOpen = $state(false);
  let desktopSymbolPickerTabId = $state<string | null>(null);
  let modeSheetOpen = $state(false);
  let indicatorSettingsOpen = $state(false);
  let indicatorLibraryOpen = $state(false);

  const desktopSymbol = $derived($activeTabState.symbol ?? 'BTCUSDT');
  const aiPaneWidth = $derived(
    $activeTabState.rightPanelExpanded || $shellStore.aiWide
      ? 520
      : Math.max(300, $shellStore.aiWidth),
  );

  // W-0402 PR2: grid layout state for data-attrs → CSS var hooks
  const watchDataAttr = $derived($shellStore.sidebarVisible ? 'open' : 'folded');
  const aiDataAttr = $derived(
    !$shellStore.aiVisible ? 'folded' : $shellStore.aiWide ? 'wide' : 'open'
  );

  // D-10: status-bar mini Verdict / freshness wiring.
  const lastVerdictKind = $derived.by<'LONG' | 'SHORT' | 'WAIT' | null>(() => {
    const entries = Object.values($allVerdicts);
    if (entries.length === 0) return null;
    const last = entries[entries.length - 1];
    if (last === 'agree') return 'LONG';
    if (last === 'disagree') return 'WAIT';
    return null;
  });

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

  // Desktop default: panels visible on first load only (respect user fold thereafter).
  let didInitDesktopLayout = false;
  $effect(() => {
    if ($viewportTier.tier === 'MOBILE') {
      shellStore.update(s => ({ ...s, sidebarVisible: false, aiVisible: false }));
      shellStore.updateTabState(s => ({ ...s, layoutMode: 'C' }));
    } else if (!didInitDesktopLayout) {
      didInitDesktopLayout = true;
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
      workspacePanel === 'research' || workspacePanel === 'judge' || workspacePanel === 'verdict'
        ? workspacePanel : 'verdict';

    // PR7-AC3: ?decide=<verdictId> deeplink — open JDG drawer with that verdict
    const decideParam = searchParams?.get('decide');
    if (decideParam) {
      initialDecideId = decideParam;
      shellStore.setRightPanelTab('judge');
    }

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
      if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); paletteOpen = !paletteOpen; if (paletteOpen) track('cmdpalette_open', { trigger: 'keyboard_p' }); }
      if (mod && e.key.toLowerCase() === 't') { e.preventDefault(); shellStore.openTab({ kind: 'trade', title: 'new session' }); }
      // ⌘0: reset panels (both visible, AI default width)
      if (mod && e.key === '0') { e.preventDefault(); shellStore.resetPanels(); trackPanelFoldToggle({ panel: 'reset', action: 'reset', trigger: 'keyboard', key: '⌘0' }); }
      // ⌘\: toggle AI wide mode
      if (mod && e.key === '\\') { e.preventDefault(); shellStore.toggleAIWide(); trackPanelFoldToggle({ panel: 'ai_wide', action: 'toggle', trigger: 'keyboard', key: '⌘\\' }); }
      // ⌘[ / ⌘]: toggle side panels (modifier version — preserved for compat)
      if (mod && e.key === '[') { e.preventDefault(); shellStore.toggleSidebar(); trackPanelFoldToggle({ panel: 'sidebar', action: 'toggle', trigger: 'keyboard', key: '⌘[' }); }
      if (mod && e.key === ']') { e.preventDefault(); shellStore.toggleAI(); trackPanelFoldToggle({ panel: 'ai', action: 'toggle', trigger: 'keyboard', key: '⌘]' }); }
      // W-0402 PR2: bare [ / ] — fold toggles (no modifier, desktop-only)
      if (!mod && e.key === '[' && !isInputActive()) { e.preventDefault(); shellStore.toggleSidebar(); trackPanelFoldToggle({ panel: 'sidebar', action: 'toggle', trigger: 'keyboard', key: '[' }); }
      if (!mod && e.key === ']' && !isInputActive()) { e.preventDefault(); shellStore.cycleAI(); trackPanelFoldToggle({ panel: 'ai', action: 'toggle', trigger: 'keyboard', key: ']' }); }
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
        paletteOpen = !paletteOpen;
        if (paletteOpen) track('cmdpalette_open', { trigger: 'keyboard' });
      }
      // ctrl+1/2/3: mode switch (modifier avoids conflict with TF shortcuts)
      if (mod && e.key === '1') { e.preventDefault(); shellStore.switchMode('trade'); }
      if (mod && e.key === '2') { e.preventDefault(); shellStore.switchMode('train'); }
      if (mod && e.key === '3') { e.preventDefault(); shellStore.switchMode('flywheel'); }
      // j/k: WatchlistRail navigation
      if (!mod && e.key === 'j' && !isInputActive()) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('watchlist:nav', { detail: { dir: 'down' } }));
      }
      if (!mod && e.key === 'k' && !isInputActive()) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('watchlist:nav', { detail: { dir: 'up' } }));
      }
      // space: add current chart symbol to watchlist
      if (!mod && e.key === ' ' && !isInputActive()) {
        e.preventDefault();
        const cur = get(activeTabState).symbol ?? 'BTCUSDT';
        window.dispatchEvent(new CustomEvent('watchlist:add', { detail: { symbol: cur } }));
      }
      // enter: open focused watchlist symbol in Terminal
      if (!mod && e.key === 'Enter' && !isInputActive()) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('watchlist:select', {}));
      }
      // D-7: ⌘L → focus AI Search (Bloomberg-style)
      if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('cogochi:cmd', { detail: { id: 'focus_ai_search' } }));
      }
      // ⌘I → toggle IndicatorCatalogModal (canonical indicator picker)
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
      else if (c.id === 'analyze_range') {
        const fromIso = new Date((c.fromTime as number) * 1000).toISOString();
        const toIso = new Date((c.toTime as number) * 1000).toISOString();
        appendAIDetail(
          `Analyze ${c.symbol} ${c.timeframe} range ${fromIso} → ${toIso}`,
          ''
        );
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

<div
  class="app-shell"
  data-watch={watchDataAttr}
  data-ai={aiDataAttr}
  style="
    --watch-w: {$shellStore.sidebarVisible ? $shellStore.sidebarWidth + 'px' : '20px'};
    --ai-w: {!$shellStore.aiVisible ? '20px' : $shellStore.aiWide ? '480px' : Math.max(240, $shellStore.aiWidth) + 'px'};
  "
>
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
          mobileView={$mobileMode.active === 'scan' ? 'research' : $mobileMode.active === 'judge' ? 'judge' : $mobileMode.active === 'chart' ? 'chart' : 'verdict'}
          setMobileView={(v) => mobileMode.setActive(v === 'verdict' ? 'detail' : v === 'research' ? 'scan' : v as 'chart' | 'judge')}
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

    <!-- PR14: MobileBottomNav — 56px fixed bottom (StatusBar absorbed + 4-nav) -->
    <MobileBottomNav
      activeView={$mobileMode.active === 'scan' ? 'research' : $mobileMode.active === 'judge' ? 'judge' : $mobileMode.active === 'chart' ? 'chart' : 'verdict'}
      onViewChange={(v) => mobileMode.setActive(v === 'verdict' ? 'detail' : v === 'research' ? 'scan' : v as 'chart' | 'judge')}
      lastVerdictKind={lastVerdictKind}
      lastUpdatedAt={$chartFreshness}
      verdicts={$verdictCount}
    />

  {:else}
    <!-- ── DESKTOP / TABLET — W-0402 PR2 CSS Grid layout ── -->
    <!-- CommandBar: UNUSED — W-0375 (60px chrome saved) -->

    <!-- grid-area: topbar -->
    <div class="grid-topbar">
      <TopBar
        hideChartControls={true}
        onSymbolTap={() => (desktopSymbolPickerOpen = true)}
        onIndicators={() => (indicatorLibraryOpen = true)}
      />
    </div>

    <!-- grid-area: news — auto-hides when no events, throttled headlines -->
    <div class="grid-news">
      <NewsFlashBar symbol={desktopSymbol} />
    </div>

    <!-- grid-area: watchlist — WatchlistRail column with fold chevron -->
    <div class="watchlist-col">
      <WatchlistRail
        activeSymbol={desktopSymbol}
        onSelectSymbol={(s) => shellStore.setSymbol(s)}
      />
      <!-- Fold chevron: right edge of watchlist column, hover-revealed -->
      <button
        class="col-fold-btn col-fold-watch"
        onclick={() => { shellStore.toggleSidebar(); trackPanelFoldToggle({ panel: 'sidebar', action: $shellStore.sidebarVisible ? 'hide' : 'show', trigger: 'click' }); }}
        title={$shellStore.sidebarVisible ? 'Collapse watchlist ([)' : 'Expand watchlist ([)'}
        aria-label={$shellStore.sidebarVisible ? 'Collapse watchlist' : 'Expand watchlist'}
      >
        {#if $shellStore.sidebarVisible}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        {:else}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        {/if}
      </button>
    </div>

    <!-- grid-area: splch — resize handle between watchlist and draw -->
    <div class="splitter-col" style="grid-area: splch;">
      {#if $shellStore.sidebarVisible}
        <Splitter
          orientation="vertical"
          onDrag={(dx) => shellStore.resizeSidebar(dx)}
          onReset={() => shellStore.resetSidebarWidth()}
          ariaLabel="Resize watchlist panel"
        />
      {/if}
    </div>

    <!-- grid-area: draw — DrawingRail (D-4, desktop only) -->
    <div class="draw-col">
      <DrawingRail />
    </div>

    <!-- grid-area: chart — canvas + tabbar + workspace -->
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
        onIndicators={() => (indicatorLibraryOpen = true)}
      />

      <ChartToolbar
        onIndicators={() => (indicatorLibraryOpen = true)}
        onSettings={() => (indicatorSettingsOpen = true)}
        onSymbolTap={() => openDesktopSymbolPicker()}
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

      <!-- W-0392: RangeSelectionPanel — judge-save flywheel dock -->
      {#if $chartSaveMode.active && $chartSaveMode.anchorA !== null && $chartSaveMode.anchorB !== null}
        <div class="range-selection-dock">
          <RangeSelectionPanel
            symbol={desktopSymbol}
            tf={$activeTabState.timeframe ?? '4h'}
            bars={slicedBars}
            snapshot={rangeSnapshot}
            onJudge={handleJudge}
            onSaveOnly={handleSaveOnly}
            onSave={handleSaveWithVerdict}
            onRecall={handleRecall}
            loading={judgeLoading}
            recallLoading={recallLoading}
            recallResults={recallResults}
            verdict={judgeVerdict}
          />
        </div>
      {/if}
    </div>

    <!-- grid-area: splai — resize handle between chart and ai -->
    <div class="splitter-col" style="grid-area: splai;">
      {#if $shellStore.aiVisible && !$shellStore.aiWide}
        <Splitter
          orientation="vertical"
          onDrag={(dx) => shellStore.resizeAI(dx)}
          onReset={() => shellStore.resetAIWidth()}
          ariaLabel="Resize AI panel"
        />
      {/if}
    </div>

    <!-- grid-area: ai — AIAgentPanel column with fold/wide controls -->
    <div class="ai-col" class:wide={$shellStore.aiWide}>
      <!-- Fold chevron: left edge of AI column, hover-revealed -->
      <button
        class="col-fold-btn col-fold-ai"
        onclick={() => { shellStore.cycleAI(); trackPanelFoldToggle({ panel: 'ai', action: 'toggle', trigger: 'click' }); }}
        title="Cycle AI panel: open → wide → fold (])"
        aria-label="Cycle AI panel state"
      >
        {#if !$shellStore.aiVisible}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        {:else}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        {/if}
      </button>
      {#if $shellStore.aiVisible}
        <div class="ai-pane-actions">
          <button
            class="ai-action-btn"
            onclick={() => { shellStore.toggleAIWide(); trackPanelFoldToggle({ panel: 'ai_wide', action: 'toggle', trigger: 'click' }); }}
            title={$shellStore.aiWide ? 'Narrow AI panel (⌘\\)' : 'Widen AI panel (⌘\\)'}
            aria-label="Toggle AI panel width"
          >
            {#if $shellStore.aiWide}
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M3 3L7 5.5L3 8M8 2v7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {:else}
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M8 3L4 5.5L8 8M3 2v7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            {/if}
          </button>
          <button
            class="ai-action-btn"
            onclick={() => { shellStore.toggleAI(); trackPanelFoldToggle({ panel: 'ai', action: 'hide', trigger: 'click' }); }}
            title="Collapse AI panel (⌘])"
            aria-label="Collapse AI panel"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <AIAgentPanel
            symbol={desktopSymbol}
            timeframe={$activeTabState.timeframe ?? '4h'}
            onSelectSymbol={(s) => shellStore.setSymbol(s)}
            initialDecideId={initialDecideId}
          />
      {/if}
    </div>

    <!-- grid-area: statusbar -->
    <TerminalHoldTimeAdapter onStats={(p50, p90) => { holdP50 = p50; holdP90 = p90; }} />
    <div class="grid-statusbar">
      <StatusBar
        verdicts={$verdictCount}
        modelDelta={$modelDelta}
        sidebarVisible={$shellStore.sidebarVisible}
        lastVerdictKind={lastVerdictKind}
        lastUpdatedAt={$chartFreshness}
        holdP50={holdP50}
        holdP90={holdP90}
      />
    </div>
  {/if}

  <!-- Global overlays -->

  <!-- W-0402 PR11: drag-to-save range toast (z:190, centered top, 5s auto-dismiss) -->
  <SaveRangeToast />

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

  <IndicatorCatalogModal
    open={indicatorLibraryOpen}
    onClose={() => (indicatorLibraryOpen = false)}
  />

  <!-- CommandPalette — ⌘K / ⌘P -->
  {#if paletteOpen}
    <CommandPalette
      q={paletteQ}
      onClose={() => { paletteOpen = false; paletteQ = ''; }}
      onChange={(v) => { paletteQ = v; }}
    />
  {/if}
</div>

<style>
  /* ── W-0402 PR2: CSS Grid 4-column app-shell ─────────────────────────────
     Row 0: topbar     (40px)
     Row 1: news       (auto — NewsFlashBar self-hides when empty)
     Row 2: main row   (1fr — watchlist | draw | chart | ai)
     Row 3: statusbar  (28px)
     Column widths controlled by --watch-w / --ai-w (PR1 tokens).
     data-watch / data-ai attrs trigger token overrides defined in tokens.css.
  ── */
  .app-shell {
    height: 100dvh;
    display: grid;
    grid-template-rows: 32px auto 1fr 20px;
    grid-template-columns:
      var(--watch-w, 140px)
      5px
      32px
      1fr
      5px
      var(--ai-w, 220px);
    grid-template-areas:
      "topbar    topbar  topbar topbar topbar  topbar"
      "news      news    news   news   news    news"
      "watchlist splch   draw   chart  splai   ai"
      "statusbar statusbar statusbar statusbar statusbar statusbar";
    background: var(--g0);
    overflow: hidden;
    font-family: 'Geist', 'Inter', system-ui, sans-serif;
    font-size: 11px;
    color: var(--g9);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  /* Grid-area wrappers for full-width rows */
  .grid-topbar {
    grid-area: topbar;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }
  .grid-topbar > :global(*) { flex: 1; min-width: 0; }

  .grid-news {
    grid-area: news;
    min-height: 0;
    overflow: hidden;
  }

  .grid-statusbar {
    grid-area: statusbar;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }
  .grid-statusbar > :global(*) { flex: 1; min-width: 0; }

  /* Resize handle columns (splch / splai) */
  .splitter-col {
    display: flex;
    align-items: stretch;
    z-index: 20;
    background: transparent;
  }
  .splitter-col :global(.splitter) {
    height: 100%;
    flex: 1;
  }

  /* WatchlistRail column */
  .watchlist-col {
    grid-area: watchlist;
    display: flex;
    overflow: hidden;
    position: relative;
    min-width: 0;
  }

  /* DrawingRail column */
  .draw-col {
    grid-area: draw;
    display: flex;
    overflow: hidden;
    min-width: 0;
    border-right: 1px solid var(--g3);
  }

  /* Chart / canvas column */
  .canvas-col {
    grid-area: chart;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    contain: layout paint;
  }

  /* AI Agent column */
  .ai-col {
    grid-area: ai;
    overflow: hidden;
    contain: layout paint;
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .ai-col.wide { box-shadow: -4px 0 12px rgba(0, 0, 0, 0.18); }

  /* Fold column buttons — hover-revealed chevrons at col edges */
  .col-fold-btn {
    position: absolute;
    top: 8px;
    width: 18px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: var(--g2);
    border: 1px solid var(--g4);
    border-radius: 3px;
    color: var(--g7);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
    z-index: 6;
  }
  .watchlist-col:hover .col-fold-btn,
  .ai-col:hover .col-fold-btn { opacity: 1; }
  .col-fold-btn:hover { background: var(--g3); color: var(--g9); }
  /* Watchlist fold btn: right edge */
  .col-fold-watch { right: 2px; }
  /* AI fold btn: left edge */
  .col-fold-ai { left: 2px; }

  /* When watchlist is folded: hide content, show only thin strip */
  [data-watch='folded'] .watchlist-col {
    overflow: hidden;
    border-right: 1px solid var(--g3);
  }
  [data-watch='folded'] .watchlist-col :global(*:not(.col-fold-btn)) {
    visibility: hidden;
    pointer-events: none;
  }
  [data-watch='folded'] .watchlist-col .col-fold-btn {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    left: 50%;
    transform: translateX(-50%);
    right: auto;
  }

  /* When AI is folded: hide content, show only thin strip */
  [data-ai='folded'] .ai-col {
    overflow: hidden;
    border-left: 1px solid var(--g3);
  }
  [data-ai='folded'] .ai-col :global(*:not(.col-fold-btn)) {
    visibility: hidden;
    pointer-events: none;
  }
  [data-ai='folded'] .ai-col .col-fold-btn {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    left: 50%;
    transform: translateX(-50%);
  }

  /* AI action buttons (wide/close) */
  .ai-pane-actions {
    position: absolute;
    top: 6px;
    right: 6px;
    display: inline-flex;
    gap: 4px;
    z-index: 5;
  }
  .ai-action-btn {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: var(--g2);
    border: 1px solid var(--g4);
    border-radius: 3px;
    color: var(--g7);
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
  }
  .ai-col:hover .ai-action-btn { opacity: 1; }
  .ai-action-btn:hover { background: var(--g3); color: var(--g9); }

  /* Range hint overlay at top of chart column */
  .range-hint {
    position: absolute;
    top: 4px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    background: var(--amb-d);
    border: 1px solid var(--amb);
    color: var(--amb);
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
    color: var(--g8);
  }

  /* W-0392: judge-save dock at bottom of chart column */
  .range-selection-dock {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 21;
  }

  /* ── Mobile (≤768px): single-column stack ──────────────────────────────── */
  @media (max-width: 768px) {
    .app-shell {
      display: flex;
      flex-direction: column;
      padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
    }

    /* Hide desktop grid columns on mobile */
    .watchlist-col,
    .draw-col,
    .canvas-col,
    .ai-col {
      display: none; /* TODO: drawer overlay pattern for mobile */
    }
  }

  /* Mobile canvas / agent host (used in {#if MOBILE} branch) */
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
