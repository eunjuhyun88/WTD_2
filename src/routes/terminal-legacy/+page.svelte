<script lang="ts">
  import WarRoom from '../../components/terminal/WarRoom.svelte';
  import ChartPanel from '../../components/arena/ChartPanel.svelte';
  import VerdictBanner from '../../components/terminal/VerdictBanner.svelte';
  import IntelPanel from '../../components/terminal/IntelPanel.svelte';
  import TokenDropdown from '../../components/shared/TokenDropdown.svelte';
  import CopyTradeModal from '../../components/modals/CopyTradeModal.svelte';
  import { AGDEFS } from '$lib/data/agents';
  import {
    type PatternScanScope as PSScopeType,
    type PatternScanReport as PSReportType,
    type ChatErrorKind,
    ERROR_MESSAGES,
    buildAgentMeta,
    detectMentionedAgent as detectMentionedAgentLocal,
    inferAgentFromIntent as inferAgentFromIntentLocal,
    inferSuggestedDirection,
    classifyError,
    isPatternScanIntent,
    patternKindLabel,
    patternStatusLabel,
    formatPatternChatReply,
    clampPercent,
    isHorizontalResizeGesture,
  } from '../../components/terminal/terminalHelpers';
  import {
    BP_MOBILE,
    BP_TABLET,
    MOBILE_TAB_META,
    type DragTarget,
    type MobileTab,
    type MobilePanelSize,
    type MobileResizeAxis,
    type MobileResizeState,
    type MobileTouchResizeState,
    type DesktopPanelKey,
    type DesktopPanelSize,
    type TabletPanelKey,
    type TabletPanelSize,
    type TabletSplitResizeAxis,
    type TabletSplitResizeState,
    createDefaultMobilePanelSizes,
    createDefaultDesktopPanelSizes,
    createDefaultTabletPanelSizes,
    getViewportFlags,
    getDesktopPanelStyle as buildDesktopPanelStyle,
    applyDesktopPanelWheelResize,
    resetDesktopPanelSize as resetDesktopPanelLayoutSize,
    getTabletPanelStyle as buildTabletPanelStyle,
    getDefaultTabletLeftWidth,
    getDefaultTabletBottomHeight,
    clampTabletLeftWidth,
    clampTabletBottomHeight,
    applyTabletPanelWheelResize,
    resetTabletPanelSize as resetTabletLayoutSize,
    getMobilePanelStyle as buildMobilePanelStyle,
    applyMobilePanelWheelResize,
    resetMobilePanelSize as resetMobileLayoutSize,
    applyMobilePanelDrag,
    clampLeftWidth,
    clampRightWidth,
  } from '../../components/terminal/terminalLayoutController';

  let liveTickerStr = '';
  let tickerLoaded = false;
  let tickerText = 'Loading market data...';
  let tickerSegments: string[] = ['Loading market data...'];
  $: tickerText = tickerLoaded && liveTickerStr ? liveTickerStr : 'Loading market data...';
  $: tickerSegments = tickerText.split(' | ').filter(Boolean);
  import { gameState } from '$lib/stores/gameState';
  import { livePrices } from '$lib/stores/priceStore';
  import { hydrateQuickTrades, openTradeCount } from '$lib/stores/quickTradeStore';
  import { activeSignalCount } from '$lib/stores/trackedSignalStore';
  import { copyTradeStore } from '$lib/stores/copyTradeStore';
  import { formatTimeframeLabel } from '$lib/utils/timeframe';
  import { alertEngine } from '$lib/services/alertEngine';
  import { fetchUiStateApi, updateUiStateApi } from '$lib/api/preferencesApi';
  import { onMount, onDestroy, tick } from 'svelte';

  let leftW = 280;
  let rightW = 300;
  let windowWidth = 1200;
  let leftCollapsed = false;
  let rightCollapsed = false;
  let savedLeftW = 280;
  let savedRightW = 300;
  let dragTarget: DragTarget = null;
  let dragStartX = 0;
  let dragStartVal = 0;

  let isMobile = false;
  let isTablet = false;
  let isDesktop = true;
  $: ({ isMobile, isTablet, isDesktop } = getViewportFlags(windowWidth));

  let mobileTab: MobileTab = 'chart';
  let densityMode: 'essential' | 'pro' = 'essential';
  let densityLabel = 'ESSENTIAL';
  let decisionDirectionLabel = 'UNSCANNED';
  let decisionDirectionClass = 'neutral';
  let decisionConfidenceLabel = '--';
  let decisionPrimaryLabel = 'RUN FIRST SCAN';
  let decisionPrimaryHint = 'Scan current pair to generate agent consensus';
  let mobileViewTracked = false;
  let mobileNavTracked = false;

  let mobileResizeState: MobileResizeState | null = null;
  let mobileTouchResizeState: MobileTouchResizeState | null = null;
  let mobilePanelSizes: Record<MobileTab, MobilePanelSize> = createDefaultMobilePanelSizes();

  let desktopPanelSizes: Record<DesktopPanelKey, DesktopPanelSize> = createDefaultDesktopPanelSizes();

  let tabletPanelSizes: Record<TabletPanelKey, TabletPanelSize> = createDefaultTabletPanelSizes();
  let tabletLeftWidth = 232;
  let tabletBottomHeight = 260;
  let tabletLayoutStyle = '';
  $: tabletLayoutStyle = `--tab-left-width: ${tabletLeftWidth}px; --tab-bottom-height: ${tabletBottomHeight}px;`;
  let tabletSplitResizeState: TabletSplitResizeState | null = null;

  function toggleLeft() {
    if (leftCollapsed) {
      leftW = savedLeftW;
      leftCollapsed = false;
    } else {
      savedLeftW = leftW;
      leftW = 0;
      leftCollapsed = true;
    }
    persistPanelState();
  }

  function toggleRight() {
    if (rightCollapsed) {
      rightW = savedRightW;
      rightCollapsed = false;
    } else {
      savedRightW = rightW;
      rightW = 0;
      rightCollapsed = true;
    }
    persistPanelState();
  }

  function getDesktopPanelStyle(panel: DesktopPanelKey) {
    return buildDesktopPanelStyle(desktopPanelSizes, panel);
  }

  function resizeDesktopPanelByWheel(panel: DesktopPanelKey, axis: 'x' | 'y', e: WheelEvent) {
    if (!isDesktop) return;
    const next = applyDesktopPanelWheelResize(desktopPanelSizes, panel, axis, e);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    desktopPanelSizes = next;
  }

  function resetDesktopPanelSize(panel: DesktopPanelKey) {
    desktopPanelSizes = resetDesktopPanelLayoutSize(desktopPanelSizes, panel);
  }

  function getTabletPanelStyle(panel: TabletPanelKey) {
    return buildTabletPanelStyle(tabletPanelSizes, panel);
  }

  function startTabletSplitDrag(axis: TabletSplitResizeAxis, e: PointerEvent) {
    if (!isTablet) return;
    const source = e.currentTarget as HTMLElement | null;
    source?.setPointerCapture?.(e.pointerId);
    tabletSplitResizeState = {
      axis,
      pointerId: e.pointerId,
      startClient: axis === 'x' ? e.clientX : e.clientY,
      startValue: axis === 'x' ? tabletLeftWidth : tabletBottomHeight,
    };
    e.preventDefault();
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }

  function onTabletSplitPointerMove(e: PointerEvent) {
    const state = tabletSplitResizeState;
    if (!state || e.pointerId !== state.pointerId) return;
    const currentClient = state.axis === 'x' ? e.clientX : e.clientY;
    const delta = currentClient - state.startClient;
    if (state.axis === 'x') {
      tabletLeftWidth = clampTabletLeftWidth(state.startValue + delta, window.innerWidth);
    } else {
      tabletBottomHeight = clampTabletBottomHeight(state.startValue - delta, window.innerHeight);
    }
    e.preventDefault();
  }

  function finishTabletSplitDrag(e?: PointerEvent) {
    if (!tabletSplitResizeState) return;
    if (e && e.pointerId !== tabletSplitResizeState.pointerId) return;
    tabletSplitResizeState = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function resizeTabletPanelByWheel(panel: TabletPanelKey, axis: 'x' | 'y', e: WheelEvent) {
    if (!isTablet) return;
    const next = applyTabletPanelWheelResize(
      tabletLeftWidth,
      tabletBottomHeight,
      panel,
      axis,
      e,
      window.innerWidth,
      window.innerHeight
    );
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    tabletLeftWidth = next.tabletLeftWidth;
    tabletBottomHeight = next.tabletBottomHeight;
  }

  function resetTabletPanelSize(panel: TabletPanelKey) {
    const next = resetTabletLayoutSize(panel, window.innerWidth, window.innerHeight);
    tabletLeftWidth = next.tabletLeftWidth;
    tabletBottomHeight = next.tabletBottomHeight;
  }

  function getMobilePanelStyle(tab: MobileTab) {
    return buildMobilePanelStyle(mobilePanelSizes, tab);
  }

  function resizeMobilePanelByWheel(tab: MobileTab, axis: 'x' | 'y', e: WheelEvent) {
    if (!isMobile) return;
    const next = applyMobilePanelWheelResize(mobilePanelSizes, tab, axis, e);
    if (!next) return;
    e.preventDefault();
    mobilePanelSizes = next;
  }

  function resetMobilePanelSize(tab: MobileTab) {
    mobilePanelSizes = resetMobileLayoutSize(mobilePanelSizes, tab);
  }

  function supportsPointerDrag() {
    return typeof window !== 'undefined' && 'PointerEvent' in window;
  }

  function clearBodySelectionIfIdle() {
    if (!mobileResizeState && !mobileTouchResizeState) {
      document.body.style.userSelect = '';
    }
  }

  function startMobilePanelDrag(tab: MobileTab, axis: MobileResizeAxis, e: PointerEvent) {
    if (!isMobile) return;

    const handle = e.currentTarget as HTMLElement | null;
    const panel = handle?.closest('.mob-panel-resizable') as HTMLElement | null;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    const basisPx = axis === 'x' ? rect.width : rect.height;
    if (!Number.isFinite(basisPx) || basisPx <= 1) return;

    const current = mobilePanelSizes[tab];
    mobileResizeState = {
      tab,
      axis,
      pointerId: e.pointerId,
      startClient: axis === 'x' ? e.clientX : e.clientY,
      startPct: axis === 'x' ? current.widthPct : current.heightPct,
      basisPx,
    };

    handle?.setPointerCapture?.(e.pointerId);
    if (!mobileTouchResizeState) document.body.style.userSelect = 'none';
    e.preventDefault();

    gtmEvent('terminal_mobile_panel_resize_start', {
      tab,
      axis,
      width_pct: current.widthPct,
      height_pct: current.heightPct,
    });
  }

  function onMobilePanelPointerMove(e: PointerEvent) {
    if (!mobileResizeState || e.pointerId !== mobileResizeState.pointerId) return;

    const { tab, axis, startClient, startPct, basisPx } = mobileResizeState;
    const currentClient = axis === 'x' ? e.clientX : e.clientY;
    const deltaPct = ((currentClient - startClient) / basisPx) * 100;
    const next = applyMobilePanelDrag(mobilePanelSizes, tab, axis, startPct, deltaPct);
    if (!next) return;
    mobilePanelSizes = next;
    e.preventDefault();
  }

  function finishMobilePanelDrag(e?: PointerEvent) {
    if (!mobileResizeState) return;
    if (e && e.pointerId !== mobileResizeState.pointerId) return;

    const { tab, axis } = mobileResizeState;
    const current = mobilePanelSizes[tab];
    mobileResizeState = null;
    clearBodySelectionIfIdle();

    gtmEvent('terminal_mobile_panel_resize_end', {
      tab,
      axis,
      width_pct: current.widthPct,
      height_pct: current.heightPct,
      input: 'pointer',
    });
  }

  function startMobilePanelTouchDrag(tab: MobileTab, axis: MobileResizeAxis, e: TouchEvent) {
    if (!isMobile || supportsPointerDrag()) return;
    const touch = e.changedTouches[0];
    if (!touch) return;

    const handle = e.currentTarget as HTMLElement | null;
    const panel = handle?.closest('.mob-panel-resizable') as HTMLElement | null;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    const basisPx = axis === 'x' ? rect.width : rect.height;
    if (!Number.isFinite(basisPx) || basisPx <= 1) return;

    const current = mobilePanelSizes[tab];
    mobileTouchResizeState = {
      tab,
      axis,
      touchId: touch.identifier,
      startClient: axis === 'x' ? touch.clientX : touch.clientY,
      startPct: axis === 'x' ? current.widthPct : current.heightPct,
      basisPx,
    };

    if (!mobileResizeState) document.body.style.userSelect = 'none';
    e.preventDefault();

    gtmEvent('terminal_mobile_panel_resize_start', {
      tab,
      axis,
      width_pct: current.widthPct,
      height_pct: current.heightPct,
      input: 'touch',
    });
  }

  function onMobilePanelTouchMove(e: TouchEvent) {
    if (!mobileTouchResizeState) return;
    const touch = Array.from(e.touches).find(t => t.identifier === mobileTouchResizeState?.touchId);
    if (!touch) return;

    const { tab, axis, startClient, startPct, basisPx } = mobileTouchResizeState;
    const currentClient = axis === 'x' ? touch.clientX : touch.clientY;
    const deltaPct = ((currentClient - startClient) / basisPx) * 100;
    const next = applyMobilePanelDrag(mobilePanelSizes, tab, axis, startPct, deltaPct);
    if (!next) return;
    mobilePanelSizes = next;
    e.preventDefault();
  }

  function finishMobilePanelTouchDrag(e?: TouchEvent) {
    if (!mobileTouchResizeState) return;
    if (e) {
      const ended = Array.from(e.changedTouches).some(t => t.identifier === mobileTouchResizeState?.touchId);
      if (!ended) return;
    }

    const { tab, axis } = mobileTouchResizeState;
    const current = mobilePanelSizes[tab];
    mobileTouchResizeState = null;
    clearBodySelectionIfIdle();

    gtmEvent('terminal_mobile_panel_resize_end', {
      tab,
      axis,
      width_pct: current.widthPct,
      height_pct: current.heightPct,
      input: 'touch',
    });
  }

  function gtmEvent(event: string, payload: Record<string, unknown> = {}) {
    if (typeof window === 'undefined') return;
    const w = window as any;
    if (!Array.isArray(w.dataLayer)) return;
    w.dataLayer.push({
      event,
      page: 'terminal',
      component: 'terminal-shell',
      viewport: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop',
      ...payload,
    });
  }

  function tickerSegmentClass(segment: string): string {
    if (segment.startsWith('FEAR_GREED:')) {
      const m = segment.match(/FEAR_GREED:\s*(\d+)/i);
      const value = m ? Number(m[1]) : null;
      if (value != null && value <= 25) return 'ticker-chip ticker-chip-fg fear';
      if (value != null && value >= 75) return 'ticker-chip ticker-chip-fg greed';
      return 'ticker-chip ticker-chip-fg neutral';
    }
    if (segment.startsWith('MCAP_24H:')) {
      return segment.includes('-')
        ? 'ticker-chip ticker-chip-neg'
        : 'ticker-chip ticker-chip-pos';
    }
    return 'ticker-chip';
  }

  $: densityLabel = densityMode === 'essential' ? 'ESSENTIAL' : 'PRO';
  $: if (terminalScanning) {
    decisionDirectionLabel = 'SCANNING';
    decisionDirectionClass = 'scanning';
    decisionConfidenceLabel = '--';
  } else if (latestScan) {
    decisionDirectionLabel = latestScan.consensus.toUpperCase();
    decisionDirectionClass = latestScan.consensus;
    decisionConfidenceLabel = `${Math.round(latestScan.avgConfidence)}%`;
  } else {
    decisionDirectionLabel = 'UNSCANNED';
    decisionDirectionClass = 'neutral';
    decisionConfidenceLabel = '--';
  }
  $: if (!latestScan) {
    decisionPrimaryLabel = 'RUN FIRST SCAN';
    decisionPrimaryHint = 'Scan current pair to generate agent consensus';
  } else if (chatTradeReady) {
    decisionPrimaryLabel = `TRADE ${chatSuggestedDir}`;
    decisionPrimaryHint = 'Open chart planner with latest consensus direction';
  } else {
    decisionPrimaryLabel = 'OPEN CHAT PLAN';
    decisionPrimaryHint = 'Ask agents for trade-ready setup first';
  }

  function toggleDensityMode() {
    const nextMode = densityMode === 'essential' ? 'pro' : 'essential';
    densityMode = nextMode;
    gtmEvent('terminal_density_mode_toggle', {
      mode: nextMode,
      pair: $gameState.pair,
      timeframe: $gameState.timeframe,
    });
  }

  function setMobileTab(tab: MobileTab) {
    if (mobileTab === tab) return;
    const fromTab = mobileTab;
    mobileTab = tab;
    gtmEvent('terminal_mobile_tab_change', {
      tab,
      from_tab: fromTab,
      source: 'bottom-nav',
      pair: $gameState.pair,
      timeframe: $gameState.timeframe,
    });
  }

  $: if (isMobile && !mobileViewTracked) {
    mobileViewTracked = true;
    gtmEvent('terminal_mobile_view', {
      tab: mobileTab,
      pair: $gameState.pair,
      timeframe: $gameState.timeframe,
    });
  } else if (!isMobile && mobileViewTracked) {
    mobileViewTracked = false;
  }

  $: if (isMobile && !mobileNavTracked) {
    mobileNavTracked = true;
    gtmEvent('terminal_mobile_nav_impression', {
      tab: mobileTab,
      pair: $gameState.pair,
      timeframe: $gameState.timeframe,
    });
  } else if (!isMobile && mobileNavTracked) {
    mobileNavTracked = false;
  }

  function startDrag(target: DragTarget, e: MouseEvent) {
    if (isMobile || isTablet) return;
    dragTarget = target;
    dragStartX = e.clientX;
    if (target === 'left') dragStartVal = leftW;
    else if (target === 'right') dragStartVal = rightW;
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragTarget) return;
    if (dragTarget === 'left') {
      const delta = e.clientX - dragStartX;
      leftW = clampLeftWidth(dragStartVal + delta);
    } else if (dragTarget === 'right') {
      const delta = dragStartX - e.clientX;
      rightW = clampRightWidth(dragStartVal + delta);
    }
  }

  // ── Panel Persistence ──────────────────────────────────────
  let _panelPersistTimer: ReturnType<typeof setTimeout> | null = null;
  function persistPanelState() {
    if (_panelPersistTimer) clearTimeout(_panelPersistTimer);
    _panelPersistTimer = setTimeout(() => {
      void updateUiStateApi({
        terminalLeftWidth: leftW,
        terminalRightWidth: rightW,
        terminalLeftCollapsed: leftCollapsed,
        terminalRightCollapsed: rightCollapsed,
      });
    }, 600);
  }

  function onMouseUp() {
    if (!dragTarget) return;
    dragTarget = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    persistPanelState();
  }

  // isHorizontalResizeGesture — imported from terminalHelpers

  function resizePanelByWheel(target: 'left' | 'right' | 'center', e: WheelEvent, options?: { force?: boolean }) {
    if (!isDesktop) return;

    const force = options?.force === true;
    const horizontalGesture = isHorizontalResizeGesture(e);
    const wantsResize = force || horizontalGesture || e.altKey || e.ctrlKey || e.metaKey;
    if (!wantsResize) return;

    const delta = horizontalGesture ? e.deltaX : (e.deltaY === 0 ? e.deltaX : e.deltaY);
    if (!Number.isFinite(delta) || delta === 0) return;
    e.preventDefault();

    const step = e.shiftKey ? 26 : 14;
    const signed = delta > 0 ? step : -step;

    if (target === 'left') {
      if (leftCollapsed) {
        leftCollapsed = false;
        leftW = savedLeftW;
      }
      leftW = clampLeftWidth(leftW + signed);
      savedLeftW = leftW;
      return;
    }

    if (target === 'right') {
      if (rightCollapsed) {
        rightCollapsed = false;
        rightW = savedRightW;
      }
      rightW = clampRightWidth(rightW + signed);
      savedRightW = rightW;
      return;
    }

    if (target === 'center') {
      if (leftCollapsed || rightCollapsed) return;
      const half = Math.round(signed / 2);
      // Wheel down: widen side panels (center narrower). Wheel up: opposite.
      const nextLeft = clampLeftWidth(leftW + half);
      const nextRight = clampRightWidth(rightW + half);
      leftW = nextLeft;
      rightW = nextRight;
      savedLeftW = leftW;
      savedRightW = rightW;
    }
  }

  function handleResize() {
    const wasTablet = windowWidth >= BP_MOBILE && windowWidth < BP_TABLET;
    windowWidth = window.innerWidth;
    const nowTablet = windowWidth >= BP_MOBILE && windowWidth < BP_TABLET;
    if (!nowTablet) return;
    if (!wasTablet) {
      tabletLeftWidth = getDefaultTabletLeftWidth(window.innerWidth);
      tabletBottomHeight = getDefaultTabletBottomHeight(window.innerHeight);
      return;
    }
    tabletLeftWidth = clampTabletLeftWidth(tabletLeftWidth, window.innerWidth);
    tabletBottomHeight = clampTabletBottomHeight(tabletBottomHeight, window.innerHeight);
  }

  async function fetchLiveTicker() {
    try {
      const [fgRes, cgRes] = await Promise.all([
        fetch('/api/feargreed?limit=1', { signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => null),
        fetch('/api/coingecko/global', { signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => null),
      ]);

      const parts: string[] = [];
      if (cgRes?.ok && cgRes.data?.global) {
        const g = cgRes.data.global;
        if (g.btcDominance) parts.push(`BTC_DOM: ${g.btcDominance.toFixed(1)}%`);
        if (g.totalVolumeUsd) parts.push(`VOL_24H: $${(g.totalVolumeUsd / 1e9).toFixed(1)}B`);
        if (g.totalMarketCapUsd) parts.push(`MCAP: $${(g.totalMarketCapUsd / 1e12).toFixed(2)}T`);
        if (g.ethDominance) parts.push(`ETH_DOM: ${g.ethDominance.toFixed(1)}%`);
        if (g.marketCapChange24hPct != null) parts.push(`MCAP_24H: ${g.marketCapChange24hPct >= 0 ? '+' : ''}${g.marketCapChange24hPct.toFixed(2)}%`);
      }
      if (fgRes?.ok && fgRes.data?.current) {
        const fg = fgRes.data.current;
        parts.push(`FEAR_GREED: ${fg.value} (${fg.classification})`);
      }
      if (cgRes?.ok && cgRes.data?.stablecoin) {
        const s = cgRes.data.stablecoin;
        if (s.totalMcapUsd) parts.push(`STABLE_MCAP: $${(s.totalMcapUsd / 1e9).toFixed(1)}B`);
      }

      if (parts.length > 0) {
        parts.push(`UPDATED: ${new Date().toTimeString().slice(0, 5)}`);
        liveTickerStr = parts.join(' | ');
        tickerLoaded = true;
      }
    } catch (e) {
      console.warn('[Terminal] Live ticker fetch failed, using fallback');
    }
  }

  onMount(() => {
    windowWidth = window.innerWidth;
    if (windowWidth >= BP_MOBILE && windowWidth < BP_TABLET) {
      tabletLeftWidth = getDefaultTabletLeftWidth(window.innerWidth);
      tabletBottomHeight = getDefaultTabletBottomHeight(window.innerHeight);
    }
    window.addEventListener('resize', handleResize);
    window.addEventListener('pointermove', onMobilePanelPointerMove, { passive: false });
    window.addEventListener('pointerup', finishMobilePanelDrag);
    window.addEventListener('pointercancel', finishMobilePanelDrag);
    window.addEventListener('touchmove', onMobilePanelTouchMove, { passive: false });
    window.addEventListener('touchend', finishMobilePanelTouchDrag);
    window.addEventListener('touchcancel', finishMobilePanelTouchDrag);
    window.addEventListener('pointermove', onTabletSplitPointerMove, { passive: false });
    window.addEventListener('pointerup', finishTabletSplitDrag);
    window.addEventListener('pointercancel', finishTabletSplitDrag);

    // ── Restore saved panel state ──
    void (async () => {
      const ui = await fetchUiStateApi();
      if (ui) {
        const lw = ui.terminalLeftWidth;
        const rw = ui.terminalRightWidth;
        if (lw >= 0 && lw <= 900) { leftW = lw; savedLeftW = lw || 280; }
        if (rw >= 0 && rw <= 900) { rightW = rw; savedRightW = rw || 300; }
        leftCollapsed = ui.terminalLeftCollapsed;
        rightCollapsed = ui.terminalRightCollapsed;
        if (leftCollapsed) leftW = 0;
        if (rightCollapsed) rightW = 0;
      }
    })();

    // ── Hydrate quick trades (터미널 페이지에서만 호출) ──
    void hydrateQuickTrades();

    // ── Load live ticker data ──
    fetchLiveTicker();

    // Background alert engine — scans every 5min, fires notifications
    alertEngine.start();

    const params = new URLSearchParams(window.location.search);
    if (params.get('copyTrade') === '1') {
      const pair = params.get('pair') || 'BTC/USDT';
      const dir = params.get('dir') === 'SHORT' ? 'SHORT' : 'LONG';
      const entry = Number(params.get('entry') || 0);
      const tp = Number(params.get('tp') || 0);
      const sl = Number(params.get('sl') || 0);
      const conf = Number(params.get('conf') || 70);
      const source = params.get('source') || 'SIGNAL ROOM';
      const reason = params.get('reason') || '';

      if (pair && Number.isFinite(entry) && entry > 0 && Number.isFinite(tp) && Number.isFinite(sl)) {
        copyTradeStore.openFromSignal({
          pair,
          dir,
          entry,
          tp,
          sl,
          conf: Number.isFinite(conf) ? conf : 70,
          source,
          reason,
        });
      }

      params.delete('copyTrade');
      params.delete('pair');
      params.delete('dir');
      params.delete('entry');
      params.delete('tp');
      params.delete('sl');
      params.delete('conf');
      params.delete('source');
      params.delete('reason');
      const nextQuery = params.toString();
      const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
      history.replaceState({}, '', nextUrl);
    }
  });

  onDestroy(() => {
    finishMobilePanelDrag();
    finishMobilePanelTouchDrag();
    finishTabletSplitDrag();
    alertEngine.stop();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', onMobilePanelPointerMove);
      window.removeEventListener('pointerup', finishMobilePanelDrag);
      window.removeEventListener('pointercancel', finishMobilePanelDrag);
      window.removeEventListener('touchmove', onMobilePanelTouchMove);
      window.removeEventListener('touchend', finishMobilePanelTouchDrag);
      window.removeEventListener('touchcancel', finishMobilePanelTouchDrag);
      window.removeEventListener('pointermove', onTabletSplitPointerMove);
      window.removeEventListener('pointerup', finishTabletSplitDrag);
      window.removeEventListener('pointercancel', finishTabletSplitDrag);
    }
  });

  // Selected pair display
  let pair = 'BTC/USDT';
  let mobileMeta = MOBILE_TAB_META.chart;
  let mobileOpenTrades = 0;
  let mobileTrackedSignals = 0;
  $: pair = $gameState.pair || 'BTC/USDT';
  $: mobileMeta = MOBILE_TAB_META[mobileTab];
  $: mobileOpenTrades = $openTradeCount;
  $: mobileTrackedSignals = $activeSignalCount;

  function onTokenSelect(e: CustomEvent<{ pair: string }>) {
    gameState.update(s => ({ ...s, pair: e.detail.pair }));
    gtmEvent('terminal_pair_change_shell', {
      pair: e.detail.pair,
      source: isMobile ? 'mobile-topbar' : 'shell-token-control',
      timeframe: $gameState.timeframe,
    });
  }

  type WarRoomHandle = {
    triggerScanFromChart?: () => void;
  };
  // PatternScanScope, PatternScanReport — imported from terminalHelpers.ts
  type PatternScanScope = PSScopeType;
  type PatternScanReport = PSReportType;
  type ChartPanelHandle = {
    activateTradeDrawing?: (dir?: 'LONG' | 'SHORT') => Promise<void> | void;
    runPatternScanFromIntel?: (options?: { scope?: PatternScanScope; focus?: boolean }) => Promise<PatternScanReport>;
  };
  let warRoomRef: WarRoomHandle | null = null;
  let mobileChartRef: ChartPanelHandle | null = null;
  let tabletChartRef: ChartPanelHandle | null = null;
  let desktopChartRef: ChartPanelHandle | null = null;
  let pendingChartScan = false;

  function tryTriggerWarRoomScan(): boolean {
    if (!warRoomRef || typeof warRoomRef.triggerScanFromChart !== 'function') return false;
    warRoomRef.triggerScanFromChart();
    return true;
  }

  function requestTerminalScan(source: string, pairHint?: string, timeframeHint?: string) {
    gtmEvent('terminal_scan_request_shell', {
      source,
      pair: pairHint || $gameState.pair,
      timeframe: timeframeHint || $gameState.timeframe,
    });

    if (tryTriggerWarRoomScan()) return;

    pendingChartScan = true;
    if (isDesktop && leftCollapsed) {
      toggleLeft();
    }
    if (isMobile && mobileTab !== 'warroom') {
      gtmEvent('terminal_mobile_tab_auto_switch', {
        from_tab: mobileTab,
        to_tab: 'warroom',
        reason: 'scan_request',
      });
      setMobileTab('warroom');
    }
  }

  function handleChartScanRequest(e: CustomEvent<{ source?: string; pair?: string; timeframe?: string }>) {
    const detail = e.detail ?? {};
    requestTerminalScan(detail.source || 'chart-panel', detail.pair, detail.timeframe);
  }

  $: if (pendingChartScan && tryTriggerWarRoomScan()) {
    pendingChartScan = false;
  }

  // ── Agent Chat State ──
  interface ChatMsg {
    from: string;
    icon: string;
    color: string;
    text: string;
    time: string;
    isUser: boolean;
    isSystem?: boolean;
  }

  type ScanHighlight = {
    agent: string;
    vote: 'long' | 'short' | 'neutral';
    conf: number;
    note: string;
  };

  type ScanIntelDetail = {
    pair: string;
    timeframe: string;
    token: string;
    createdAt: number;
    label: string;
    consensus: 'long' | 'short' | 'neutral';
    avgConfidence: number;
    summary: string;
    highlights: ScanHighlight[];
    signals: Array<{ vote: string; conf: number; entry: number; tp: number; sl: number; name: string; pair: string }>;
  };

  type AgentTradeSetup = {
    source: 'consensus' | 'agent';
    agentName?: string;
    dir: 'LONG' | 'SHORT';
    entry: number;
    tp: number;
    sl: number;
    rr: number;
    conf: number;
    pair: string;
  };

  let chatMessages: ChatMsg[] = [
    { from: 'SYSTEM', icon: '🤖', color: '#E8967D', text: 'Stockclaw Orchestrator v8 online. 8 agents standing by. Scan first, then ask questions about the results.', time: '—', isUser: false, isSystem: true },
    { from: 'ORCHESTRATOR', icon: '🧠', color: '#ff2d9b',
      text: '💡 Try these:\n• "BTC 전망 분석해줘" — I\'ll route to the right agents\n• "차트패턴 찾아봐" — 보이는 구간 패턴을 차트에 바로 표시\n• "@STRUCTURE MA, RSI 분석" — Direct to Structure agent\n• "@DERIV 펀딩 + OI 어때?" — Derivatives analysis\n• "@FLOW 고래 움직임?" — On-chain + whale flow\n• "@SENTI 소셜 센티먼트" — F&G + LunarCrush social\n• "@MACRO DXY, 금리 영향?" — Macro regime check',
      time: '—', isUser: false },
  ];
  let isTyping = false;
  let latestScan: ScanIntelDetail | null = null;
  let terminalScanning = false;
  type ChatTradeDirection = 'LONG' | 'SHORT';
  let chatTradeReady = false;
  let chatSuggestedDir: ChatTradeDirection = 'LONG';
  let chatFocusKey = 0;
  let activeTradeSetup: AgentTradeSetup | null = null;

  // Agent/error/direction helpers — imported from terminalHelpers.ts
  const AGENT_META = buildAgentMeta();

  // Chat connection status for UI dot indicator
  let chatConnectionStatus: 'connected' | 'degraded' | 'disconnected' = 'connected';
  let lastChatSuccess = 0;

  function buildOfflineAgentReply(userText: string, statusLabel: string, err?: unknown): { sender: string; text: string; tradeDir: ChatTradeDirection | null } {
    const sender = detectMentionedAgentLocal(userText) || inferAgentFromIntentLocal(userText);
    const pair = $gameState.pair || 'BTC/USDT';
    const timeframe = ($gameState.timeframe || '4h').toUpperCase();
    const errorKind = classifyError(statusLabel, err);

    // Update connection status
    if (errorKind === 'network' || errorKind === 'llm_unavailable') {
      chatConnectionStatus = 'disconnected';
    } else {
      chatConnectionStatus = 'degraded';
    }

    const scanSummary = latestScan
      ? `최근 스캔: ${latestScan.pair} ${latestScan.timeframe.toUpperCase()} ${String(latestScan.consensus).toUpperCase()} ${Math.round(latestScan.avgConfidence)}%`
      : '';
    const tradeDirFromQuestion = inferSuggestedDirection(userText);
    const tradeDirFromScan = latestScan?.consensus === 'long'
      ? 'LONG'
      : latestScan?.consensus === 'short'
        ? 'SHORT'
        : null;
    const tradeDir = tradeDirFromQuestion || tradeDirFromScan;
    const tradeHint = tradeDir
      ? `\n💡 ${tradeDir} 관점 참고. START ${tradeDir}로 드래그 진입 가능.`
      : '';

    return {
      sender,
      tradeDir,
      text:
        `⚠️ ${ERROR_MESSAGES[errorKind]}\n` +
        `${pair} ${timeframe} 기준 로컬 폴백 응답입니다.` +
        (scanSummary ? `\n${scanSummary}` : '') +
        tradeHint,
    };
  }

  // isPatternScanIntent, patternKindLabel, patternStatusLabel, formatPatternChatReply
  // — imported from terminalHelpers.ts

  async function triggerPatternScanFromChat(source: string, time: string) {
    if (isMobile && mobileTab !== 'chart') {
      gtmEvent('terminal_mobile_tab_auto_switch', {
        from_tab: mobileTab,
        to_tab: 'chart',
        reason: 'pattern_scan_from_chat',
      });
      setMobileTab('chart');
      await tick();
    }

    await tick();
    const chartPanel = getActiveChartPanel();
    if (!chartPanel || typeof chartPanel.runPatternScanFromIntel !== 'function') {
      gtmEvent('terminal_pattern_scan_request_failed', {
        source,
        reason: 'chart_panel_unavailable',
        pair: $gameState.pair,
        timeframe: $gameState.timeframe,
      });
      chatMessages = [...chatMessages, {
        from: 'SYSTEM',
        icon: '⚠️',
        color: '#ff8c3b',
        text: '차트가 준비되지 않아 패턴 스캔을 실행하지 못했습니다.',
        time,
        isUser: false,
        isSystem: true,
      }];
      return;
    }

    try {
      const report = await chartPanel.runPatternScanFromIntel({ scope: 'visible', focus: true });
      gtmEvent('terminal_pattern_scan_request', {
        source,
        pair: $gameState.pair,
        timeframe: $gameState.timeframe,
        scope: report.scope,
        candle_count: report.candleCount,
        pattern_count: report.patternCount,
        ok: report.ok,
      });
      chatMessages = [...chatMessages, {
        from: 'ORCHESTRATOR',
        icon: '🧠',
        color: '#ff2d9b',
        text: formatPatternChatReply(report),
        time,
        isUser: false,
      }];
    } catch (error) {
      gtmEvent('terminal_pattern_scan_request_failed', {
        source,
        reason: 'runtime_error',
        pair: $gameState.pair,
        timeframe: $gameState.timeframe,
      });
      chatMessages = [...chatMessages, {
        from: 'SYSTEM',
        icon: '⚠️',
        color: '#ff8c3b',
        text: '패턴 스캔 실행 중 오류가 발생했습니다.',
        time,
        isUser: false,
        isSystem: true,
      }];
      console.error('[terminal] pattern scan from chat failed:', error);
    }
  }

  function getActiveChartPanel(): ChartPanelHandle | null {
    if (isMobile) return mobileChartRef;
    if (isTablet) return tabletChartRef;
    return desktopChartRef;
  }

  function focusIntelChat(source: string) {
    if (isDesktop && rightCollapsed) toggleRight();
    if (isMobile && mobileTab !== 'intel') {
      gtmEvent('terminal_mobile_tab_auto_switch', {
        from_tab: mobileTab,
        to_tab: 'intel',
        reason: source,
      });
      setMobileTab('intel');
    }
    chatFocusKey += 1;
  }

  function handleChartChatRequest(e: CustomEvent<{ source?: string; pair?: string; timeframe?: string }>) {
    const detail = e.detail ?? {};
    gtmEvent('terminal_chat_request_shell', {
      source: detail.source || 'chart-panel',
      pair: detail.pair || $gameState.pair,
      timeframe: detail.timeframe || $gameState.timeframe,
      trade_ready: chatTradeReady,
    });
    focusIntelChat(detail.source || 'chart-panel');
  }

  async function triggerTradePlanFromChat(source: string) {
    if (!chatTradeReady) {
      gtmEvent('terminal_trade_plan_request_blocked', {
        source,
        reason: 'chat_answer_required',
        pair: $gameState.pair,
        timeframe: $gameState.timeframe,
      });
      focusIntelChat(`${source}-chat-first`);
      return;
    }

    if (isDesktop && rightCollapsed) toggleRight();
    if (isMobile && mobileTab !== 'chart') {
      gtmEvent('terminal_mobile_tab_auto_switch', {
        from_tab: mobileTab,
        to_tab: 'chart',
        reason: 'trade_plan_from_chat',
      });
      setMobileTab('chart');
      await tick();
    }

    await tick();
    const chartPanel = getActiveChartPanel();
    if (!chartPanel || typeof chartPanel.activateTradeDrawing !== 'function') {
      gtmEvent('terminal_trade_plan_request_failed', {
        source,
        reason: 'chart_panel_unavailable',
        pair: $gameState.pair,
        timeframe: $gameState.timeframe,
      });
      return;
    }

    gtmEvent('terminal_trade_plan_request', {
      source,
      pair: $gameState.pair,
      timeframe: $gameState.timeframe,
      suggested_dir: chatSuggestedDir,
    });
    await chartPanel.activateTradeDrawing(chatSuggestedDir);
  }

  function handleIntelGoTrade() {
    void triggerTradePlanFromChat('intel-panel');
  }

  async function handleDecisionPrimaryAction() {
    if (terminalScanning) return;
    if (!latestScan) {
      requestTerminalScan('decision-rail');
      return;
    }
    if (chatTradeReady) {
      await triggerTradePlanFromChat('decision-rail');
      return;
    }
    focusIntelChat('decision-rail-chat');
  }

  async function handleSendChat(e: CustomEvent<{ text: string }>) {
    const text = e.detail.text;
    if (!text.trim()) return;
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 유저 메시지 즉시 표시
    chatMessages = [...chatMessages, { from: 'YOU', icon: '🐕', color: '#E8967D', text, time, isUser: true }];
    isTyping = true;

    // 멘션된 에이전트 감지 (없으면 서버에서 ORCHESTRATOR로 기본 처리)
    const agent = AGDEFS.find(ag => text.toLowerCase().includes(`@${ag.name.toLowerCase()}`));
    const mentionedAgent = agent?.name || undefined;
    const patternIntent = isPatternScanIntent(text);
    chatTradeReady = false;
    gtmEvent('terminal_chat_question_sent', {
      source: 'intel-chat',
      pair: $gameState.pair || 'BTC/USDT',
      timeframe: $gameState.timeframe || '4h',
      chars: text.length,
      mentioned_agent: mentionedAgent || 'auto',
      intent: patternIntent ? 'pattern_scan' : 'agent_chat',
    });

    if (patternIntent) {
      isTyping = false;
      await triggerPatternScanFromChat('intel-chat', time);
      return;
    }

    isTyping = true;

    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'terminal',
          senderKind: 'user',
          senderName: 'YOU',
          message: text,
          meta: {
            pair: $gameState.pair || 'BTC/USDT',
            timeframe: $gameState.timeframe || '4h',
            mentionedAgent,
            livePrices: { ...$livePrices },
          },
        }),
        signal: AbortSignal.timeout(20000), // 20s timeout for LLM responses
      });

      isTyping = false;

      if (res.ok) {
        chatConnectionStatus = 'connected';
        lastChatSuccess = Date.now();
        const data = await res.json();
        if (data.agentResponse) {
          const r = data.agentResponse;
          const agMeta = AGENT_META[r.senderName] || AGENT_META['ORCHESTRATOR'];
          chatMessages = [...chatMessages, {
            from: r.senderName,
            icon: agMeta.icon,
            color: agMeta.color,
            text: r.message,
            time,
            isUser: false,
          }];
          const inferred = inferSuggestedDirection(String(r.message || ''));
          if (inferred) chatSuggestedDir = inferred;
          chatTradeReady = true;
          gtmEvent('terminal_chat_answer_received', {
            source: 'intel-chat',
            pair: $gameState.pair || 'BTC/USDT',
            timeframe: $gameState.timeframe || '4h',
            responder: r.senderName || 'ORCHESTRATOR',
            chars: String(r.message || '').length,
            suggested_dir: inferred || chatSuggestedDir,
          });
        }
      } else {
        let statusLabel = String(res.status);
        try {
          const errBody = await res.json();
          const errMsg = typeof errBody?.error === 'string' ? errBody.error : '';
          if (errMsg) statusLabel = `${res.status} ${errMsg}`;
        } catch {
          // noop
        }
        const offline = buildOfflineAgentReply(text, statusLabel);
        const fallbackMeta = AGENT_META[offline.sender] || AGENT_META.ORCHESTRATOR;
        if (offline.tradeDir) {
          chatSuggestedDir = offline.tradeDir;
          chatTradeReady = true;
        } else {
          chatTradeReady = false;
        }
        gtmEvent('terminal_chat_answer_error', {
          source: 'intel-chat',
          pair: $gameState.pair || 'BTC/USDT',
          timeframe: $gameState.timeframe || '4h',
          status: res.status,
          mode: 'offline_fallback',
        });
        chatMessages = [...chatMessages, {
          from: offline.sender,
          icon: fallbackMeta.icon,
          color: fallbackMeta.color,
          text: offline.text,
          time,
          isUser: false,
        }];
      }
    } catch (err) {
      isTyping = false;
      const errorLabel = err instanceof DOMException && err.name === 'TimeoutError' ? 'timeout' : 'network';
      const offline = buildOfflineAgentReply(text, errorLabel, err);
      const fallbackMeta = AGENT_META[offline.sender] || AGENT_META.ORCHESTRATOR;
      if (offline.tradeDir) {
        chatSuggestedDir = offline.tradeDir;
        chatTradeReady = true;
      } else {
        chatTradeReady = false;
      }
      gtmEvent('terminal_chat_answer_error', {
        source: 'intel-chat',
        pair: $gameState.pair || 'BTC/USDT',
        timeframe: $gameState.timeframe || '4h',
        status: 'network',
        mode: 'offline_fallback',
      });
      chatMessages = [...chatMessages, {
        from: offline.sender,
        icon: fallbackMeta.icon,
        color: fallbackMeta.color,
        text: offline.text,
        time,
        isUser: false,
      }];
    }
  }

  function handleScanStart() {
    terminalScanning = true;
  }

  function handleScanComplete(payload: ScanIntelDetail | CustomEvent<ScanIntelDetail>) {
    terminalScanning = false;
    const d = 'detail' in payload ? payload.detail : payload;
    latestScan = d;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 1) 스캔 완료 시스템 메시지
    chatMessages = [...chatMessages, {
      from: 'SYSTEM', icon: '⚡', color: '#E8967D',
      text: `SCAN COMPLETE — ${d.pair} ${d.timeframe.toUpperCase()} (${d.label})`,
      time, isUser: false, isSystem: true,
    }];

    // 2) COMMANDER 종합 판정만 표시 (개별 에이전트는 WarRoom에서 확인)
    const dirEmoji = d.consensus === 'long' ? '🟢' : d.consensus === 'short' ? '🔴' : '⚪';
    chatMessages = [...chatMessages, {
      from: 'COMMANDER',
      icon: '🧠',
      color: '#ff2d9b',
      text: `${dirEmoji} VERDICT: ${d.consensus.toUpperCase()} — Confidence ${d.avgConfidence}%\n${d.summary}\n📊 차트에 TP/SL 표시됨 · 왼쪽 시그널 카드에서 개별 에이전트 확인`,
      time, isUser: false,
    }];

    // 3) consensus 방향 에이전트들의 평균 entry/tp/sl → 차트 오버레이
    if (d.signals && d.signals.length > 0 && d.consensus !== 'neutral') {
      const dirSignals = d.signals.filter(s => s.vote === d.consensus);
      if (dirSignals.length > 0) {
        const avgEntry = dirSignals.reduce((sum, s) => sum + s.entry, 0) / dirSignals.length;
        const avgTp = dirSignals.reduce((sum, s) => sum + s.tp, 0) / dirSignals.length;
        const avgSl = dirSignals.reduce((sum, s) => sum + s.sl, 0) / dirSignals.length;
        const risk = Math.abs(avgEntry - avgSl);
        const reward = Math.abs(avgTp - avgEntry);
        activeTradeSetup = {
          source: 'consensus',
          dir: d.consensus === 'long' ? 'LONG' : 'SHORT',
          entry: avgEntry,
          tp: avgTp,
          sl: avgSl,
          rr: risk > 0 ? reward / risk : 2,
          conf: d.avgConfidence,
          pair: d.pair,
        };
      }
    } else {
      activeTradeSetup = null;
    }

    // 방향 추론 → 트레이드 버튼 활성화
    if (d.consensus === 'long' || d.consensus === 'short') {
      chatSuggestedDir = d.consensus === 'long' ? 'LONG' : 'SHORT';
      chatTradeReady = true;
    }
  }

  function handleShowOnChart(payload: { signal: { vote: string; conf: number; entry: number; tp: number; sl: number; name: string; pair: string } } | CustomEvent<{ signal: { vote: string; conf: number; entry: number; tp: number; sl: number; name: string; pair: string } }>) {
    const sig = 'detail' in payload ? payload.detail.signal : payload.signal;
    if (sig.vote === 'neutral' || !sig.entry || !sig.tp || !sig.sl) return;
    const risk = Math.abs(sig.entry - sig.sl);
    const reward = Math.abs(sig.tp - sig.entry);
    activeTradeSetup = {
      source: 'agent',
      agentName: sig.name,
      dir: sig.vote === 'long' ? 'LONG' : 'SHORT',
      entry: sig.entry,
      tp: sig.tp,
      sl: sig.sl,
      rr: risk > 0 ? reward / risk : 2,
      conf: sig.conf,
      pair: sig.pair,
    };
  }
</script>

<div class="terminal-shell">
  <div class="term-stars" aria-hidden="true"></div>
  <div class="term-stars term-stars-soft" aria-hidden="true"></div>
  <div class="term-grain" aria-hidden="true"></div>
  {#if isMobile}
    <button type="button" class="density-toggle" on:click={toggleDensityMode} title="정보 밀도 전환">
      {densityLabel}
    </button>
  {:else}
    <div class="decision-rail" role="region" aria-label="Trading decision rail">
      <div class="decision-context">
        <span class="dc-pair">{pair}</span>
        <span class="dc-tf">{formatTimeframeLabel($gameState.timeframe)}</span>
      </div>
      <div class="decision-verdict">
        <span class="dv-label">CONSENSUS</span>
        <span class="dv-dir {decisionDirectionClass}">{decisionDirectionLabel}</span>
        <span class="dv-conf">{decisionConfidenceLabel}</span>
      </div>
      <button
        type="button"
        class="decision-primary"
        class:trade={latestScan && chatTradeReady}
        on:click={() => void handleDecisionPrimaryAction()}
      >
        <span class="dp-text">{decisionPrimaryLabel}</span>
        <span class="dp-hint">{decisionPrimaryHint}</span>
      </button>
      <button type="button" class="decision-mode" on:click={toggleDensityMode} title="정보 밀도 전환">
        {densityLabel}
      </button>
    </div>
  {/if}

  <!-- ═══ MOBILE LAYOUT ═══ -->
  {#if isMobile}
  <div class="terminal-mobile">
    {#if mobileTab !== 'chart'}
      <div class="mob-topbar">
        <div class="mob-topline">
          <div class="mob-title-wrap">
            <span class="mob-eyebrow">TERMINAL MOBILE</span>
            <span class="mob-title">{mobileMeta.label}</span>
          </div>
          <span class="mob-live"><span class="ctb-dot"></span>LIVE</span>
        </div>
        <div class="mob-meta">
          <div class="mob-token">
            <TokenDropdown value={pair} compact on:select={onTokenSelect} />
          </div>
          <span class="mob-meta-chip">{formatTimeframeLabel($gameState.timeframe)}</span>
        </div>
        <div class="mob-desc">{mobileMeta.desc}</div>
      </div>
    {/if}

    <div class="mob-content" class:chart-only={mobileTab === 'chart'}>
      {#if mobileTab === 'warroom'}
        <div class="mob-panel-wrap mob-panel-resizable" style={getMobilePanelStyle('warroom')}>
          <WarRoom
            bind:this={warRoomRef}
            {densityMode}
            onScanStart={handleScanStart}
            onScanComplete={handleScanComplete}
            onShowOnChart={handleShowOnChart}
          />
          <button
            type="button"
            class="resize-handle resize-handle-x mob-resize-handle mob-resize-handle-x"
            title="좌우 크기 조절: 스크롤 / 더블클릭 초기화"
            aria-label="Resize war room panel width with scroll"
            on:wheel={(e) => resizeMobilePanelByWheel('warroom', 'x', e)}
            on:pointerdown={(e) => startMobilePanelDrag('warroom', 'x', e)}
            on:touchstart={(e) => startMobilePanelTouchDrag('warroom', 'x', e)}
            on:dblclick={() => resetMobilePanelSize('warroom')}
          ></button>
          <button
            type="button"
            class="resize-handle resize-handle-y mob-resize-handle mob-resize-handle-y"
            title="위아래 크기 조절: 스크롤 / 더블클릭 초기화"
            aria-label="Resize war room panel height with scroll"
            on:wheel={(e) => resizeMobilePanelByWheel('warroom', 'y', e)}
            on:pointerdown={(e) => startMobilePanelDrag('warroom', 'y', e)}
            on:touchstart={(e) => startMobilePanelTouchDrag('warroom', 'y', e)}
            on:dblclick={() => resetMobilePanelSize('warroom')}
          ></button>
        </div>
      {:else if mobileTab === 'chart'}
        <div class="mob-chart-stack">
          <div class="mob-chart-section mob-panel-resizable" style={getMobilePanelStyle('chart')}>
            <VerdictBanner verdict={latestScan} scanning={terminalScanning} />
            <div class="mob-chart-area">
              <ChartPanel
                bind:this={mobileChartRef}
                advancedMode
                enableTradeLineEntry
                uiPreset="tradingview"
                requireTradeConfirm
                chatFirstMode
                {chatTradeReady}
                chatTradeDir={chatSuggestedDir}
                {activeTradeSetup}
                hasScanned={!!latestScan}
                on:scanrequest={handleChartScanRequest}
                on:chatrequest={handleChartChatRequest}
                on:clearTradeSetup={() => { activeTradeSetup = null; }}
              />
            </div>
            <button
              type="button"
              class="resize-handle resize-handle-x mob-resize-handle mob-resize-handle-x"
              title="좌우 크기 조절: 스크롤 / 더블클릭 초기화"
              aria-label="Resize chart panel width with scroll"
              on:wheel={(e) => resizeMobilePanelByWheel('chart', 'x', e)}
              on:pointerdown={(e) => startMobilePanelDrag('chart', 'x', e)}
              on:touchstart={(e) => startMobilePanelTouchDrag('chart', 'x', e)}
              on:dblclick={() => resetMobilePanelSize('chart')}
            ></button>
            <button
              type="button"
              class="resize-handle resize-handle-y mob-resize-handle mob-resize-handle-y"
              title="위아래 크기 조절: 스크롤 / 더블클릭 초기화"
              aria-label="Resize chart panel height with scroll"
              on:wheel={(e) => resizeMobilePanelByWheel('chart', 'y', e)}
              on:pointerdown={(e) => startMobilePanelDrag('chart', 'y', e)}
              on:touchstart={(e) => startMobilePanelTouchDrag('chart', 'y', e)}
            on:dblclick={() => resetMobilePanelSize('chart')}
          ></button>
          </div>
        </div>
      {:else if mobileTab === 'intel'}
        <div class="mob-panel-wrap mob-panel-resizable" style={getMobilePanelStyle('intel')}>
          <IntelPanel
            {densityMode}
            {chatMessages}
            {isTyping}
            {latestScan}
            prioritizeChat
            {chatTradeReady}
            {chatFocusKey}
            {chatConnectionStatus}
            on:sendchat={handleSendChat}
            on:gototrade={handleIntelGoTrade}
          />
          <button
            type="button"
            class="resize-handle resize-handle-x mob-resize-handle mob-resize-handle-x"
            title="좌우 크기 조절: 스크롤 / 더블클릭 초기화"
            aria-label="Resize intel panel width with scroll"
            on:wheel={(e) => resizeMobilePanelByWheel('intel', 'x', e)}
            on:pointerdown={(e) => startMobilePanelDrag('intel', 'x', e)}
            on:touchstart={(e) => startMobilePanelTouchDrag('intel', 'x', e)}
            on:dblclick={() => resetMobilePanelSize('intel')}
          ></button>
          <button
            type="button"
            class="resize-handle resize-handle-y mob-resize-handle mob-resize-handle-y"
            title="위아래 크기 조절: 스크롤 / 더블클릭 초기화"
            aria-label="Resize intel panel height with scroll"
            on:wheel={(e) => resizeMobilePanelByWheel('intel', 'y', e)}
            on:pointerdown={(e) => startMobilePanelDrag('intel', 'y', e)}
            on:touchstart={(e) => startMobilePanelTouchDrag('intel', 'y', e)}
            on:dblclick={() => resetMobilePanelSize('intel')}
          ></button>
        </div>
      {/if}
    </div>

    <div class="mob-bottom-nav">
      <button class="mob-nav-btn" class:active={mobileTab === 'warroom'} on:click={() => setMobileTab('warroom')}>
        <span class="mob-nav-label">WAR ROOM</span>
        {#if mobileOpenTrades > 0}
          <span class="mob-nav-badge">{mobileOpenTrades > 9 ? '9+' : mobileOpenTrades}</span>
        {/if}
      </button>
      <button class="mob-nav-btn" class:active={mobileTab === 'chart'} on:click={() => setMobileTab('chart')}>
        <span class="mob-nav-label">CHART</span>
      </button>
      <button class="mob-nav-btn" class:active={mobileTab === 'intel'} on:click={() => setMobileTab('intel')}>
        <span class="mob-nav-label">CHAT</span>
        {#if mobileTrackedSignals > 0}
          <span class="mob-nav-badge">{mobileTrackedSignals > 9 ? '9+' : mobileTrackedSignals}</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- ═══ TABLET LAYOUT (no side resizers, stacked) ═══ -->
  {:else if isTablet}
  <div class="terminal-tablet" style={tabletLayoutStyle}>
    <div class="tab-top">
      <div class="tab-left">
        <div class="tab-panel-resizable" style={getTabletPanelStyle('left')}>
          <div class="tab-panel-body">
            <WarRoom
              bind:this={warRoomRef}
              {densityMode}
              onScanStart={handleScanStart}
              onScanComplete={handleScanComplete}
              onShowOnChart={handleShowOnChart}
            />
          </div>
          <button
            type="button"
            class="resize-handle resize-handle-x tab-resize-handle tab-resize-handle-x"
            title="WAR ROOM 좌우 크기 조절: 스크롤 / 더블클릭 초기화"
            aria-label="Resize tablet war room width with scroll"
            on:wheel={(e) => resizeTabletPanelByWheel('left', 'x', e)}
            on:pointerdown={(e) => startTabletSplitDrag('x', e)}
            on:dblclick={() => resetTabletPanelSize('left')}
          ></button>
          <button
            type="button"
            class="resize-handle resize-handle-y tab-resize-handle tab-resize-handle-y"
            title="WAR ROOM 위아래 크기 조절: 스크롤 / 더블클릭 초기화"
            aria-label="Resize tablet war room height with scroll"
            on:wheel={(e) => resizeTabletPanelByWheel('left', 'y', e)}
            on:pointerdown={(e) => startTabletSplitDrag('y', e)}
            on:dblclick={() => resetTabletPanelSize('left')}
          ></button>
        </div>
      </div>
      <button
        type="button"
        class="tab-layout-split tab-layout-split-v"
        title="WAR ROOM / CHART 분할 조절: 스크롤/드래그/더블클릭 리셋"
        aria-label="Resize tablet left and chart split"
        on:wheel={(e) => resizeTabletPanelByWheel('left', 'x', e)}
        on:pointerdown={(e) => startTabletSplitDrag('x', e)}
        on:dblclick={() => resetTabletPanelSize('left')}
      >
        <span></span>
      </button>
      <div class="tab-center">
        <div class="tab-panel-resizable" style={getTabletPanelStyle('center')}>
          <VerdictBanner verdict={latestScan} scanning={terminalScanning} />
          <div class="tab-panel-body tab-chart-area">
            <ChartPanel
              bind:this={tabletChartRef}
              advancedMode
              enableTradeLineEntry
              uiPreset="tradingview"
              requireTradeConfirm
              chatFirstMode
              {chatTradeReady}
              chatTradeDir={chatSuggestedDir}
              {activeTradeSetup}
              on:scanrequest={handleChartScanRequest}
              on:chatrequest={handleChartChatRequest}
              on:clearTradeSetup={() => { activeTradeSetup = null; }}
            />
          </div>
          <button
            type="button"
            class="resize-handle resize-handle-x tab-resize-handle tab-resize-handle-x"
            title="CHART 좌우 크기 조절: 스크롤 / 더블클릭 초기화"
            aria-label="Resize tablet chart width with scroll"
            on:wheel={(e) => resizeTabletPanelByWheel('center', 'x', e)}
            on:pointerdown={(e) => startTabletSplitDrag('x', e)}
            on:dblclick={() => resetTabletPanelSize('center')}
          ></button>
          <button
            type="button"
            class="resize-handle resize-handle-y tab-resize-handle tab-resize-handle-y"
            title="CHART 위아래 크기 조절: 스크롤 / 더블클릭 초기화"
            aria-label="Resize tablet chart height with scroll"
            on:wheel={(e) => resizeTabletPanelByWheel('center', 'y', e)}
            on:pointerdown={(e) => startTabletSplitDrag('y', e)}
            on:dblclick={() => resetTabletPanelSize('center')}
          ></button>
        </div>
      </div>
    </div>
    <button
      type="button"
      class="tab-layout-split tab-layout-split-h"
      title="CHART / INTEL 높이 조절: 스크롤/드래그/더블클릭 리셋"
      aria-label="Resize tablet chart and intel split"
      on:wheel={(e) => resizeTabletPanelByWheel('bottom', 'y', e)}
      on:pointerdown={(e) => startTabletSplitDrag('y', e)}
      on:dblclick={() => resetTabletPanelSize('bottom')}
    >
      <span></span>
    </button>
    <div class="tab-bottom">
      <div class="tab-panel-resizable" style={getTabletPanelStyle('bottom')}>
        <div class="tab-panel-body">
          <IntelPanel
            {densityMode}
            {chatMessages}
            {isTyping}
            {latestScan}
            {chatTradeReady}
            {chatFocusKey}
            {chatConnectionStatus}
            on:sendchat={handleSendChat}
            on:gototrade={handleIntelGoTrade}
          />
        </div>
        <button
          type="button"
          class="resize-handle resize-handle-x tab-resize-handle tab-resize-handle-x"
          title="좌우 패널 비율 조절: 스크롤 / 더블클릭 초기화"
          aria-label="Resize tablet left and chart split with scroll"
          on:wheel={(e) => resizeTabletPanelByWheel('left', 'x', e)}
          on:pointerdown={(e) => startTabletSplitDrag('x', e)}
          on:dblclick={() => resetTabletPanelSize('left')}
        ></button>
        <button
          type="button"
            class="resize-handle resize-handle-y tab-resize-handle tab-resize-handle-y"
            title="INTEL 위아래 크기 조절: 스크롤 / 더블클릭 초기화"
            aria-label="Resize tablet intel height with scroll"
            on:wheel={(e) => resizeTabletPanelByWheel('bottom', 'y', e)}
            on:pointerdown={(e) => startTabletSplitDrag('y', e)}
            on:dblclick={() => resetTabletPanelSize('bottom')}
          ></button>
      </div>
    </div>

    <div class="ticker-bar">
      <div class="ticker-inner">
        <div class="ticker-track">
          {#each tickerSegments as segment, idx (`tab-a-${idx}-${segment}`)}
            <span class={tickerSegmentClass(segment)}>{segment}</span>
          {/each}
        </div>
        <div class="ticker-track" aria-hidden="true">
          {#each tickerSegments as segment, idx (`tab-b-${idx}-${segment}`)}
            <span class={tickerSegmentClass(segment)}>{segment}</span>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ DESKTOP LAYOUT (full 3-panel with resizers) ═══ -->
  {:else}
  <div class="terminal-page"
    style="grid-template-columns: {leftCollapsed ? 30 : leftW}px 4px 1fr 4px {rightCollapsed ? 30 : rightW}px">

    <!-- Left: WAR ROOM or collapsed strip -->
    {#if !leftCollapsed}
      <div class="tl" on:wheel={(e) => resizePanelByWheel('left', e)}>
        <div class="desk-panel-resizable" style={getDesktopPanelStyle('left')}>
          <div class="desk-panel-body">
            <WarRoom
              bind:this={warRoomRef}
              {densityMode}
              onCollapse={toggleLeft}
              onScanStart={handleScanStart}
              onScanComplete={handleScanComplete}
              onShowOnChart={handleShowOnChart}
            />
          </div>
          <button
            type="button"
            class="resize-handle resize-handle-x desk-resize-handle desk-resize-handle-x"
            title="WAR ROOM 좌우 크기 조절: 스크롤 / 더블클릭 초기화"
            aria-label="Resize war room panel width with scroll"
            on:wheel={(e) => resizeDesktopPanelByWheel('left', 'x', e)}
            on:dblclick={() => resetDesktopPanelSize('left')}
          ></button>
          <button
            type="button"
            class="resize-handle resize-handle-y desk-resize-handle desk-resize-handle-y"
            title="WAR ROOM 위아래 크기 조절: 스크롤 / 더블클릭 초기화"
            aria-label="Resize war room panel height with scroll"
            on:wheel={(e) => resizeDesktopPanelByWheel('left', 'y', e)}
            on:dblclick={() => resetDesktopPanelSize('left')}
          ></button>
        </div>
      </div>
    {:else}
      <button
        class="panel-strip panel-strip-left"
        on:click={toggleLeft}
        on:wheel={(e) => resizePanelByWheel('left', e, { force: true })}
        title="Show War Room"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="1" y="2" width="14" height="12" rx="1.5"/>
          <line x1="6" y1="2" x2="6" y2="14"/>
        </svg>
        <span class="strip-label">WAR</span>
      </button>
    {/if}

    <!-- Left Resizer (drag only, no toggle) -->
    {#if !leftCollapsed}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="resizer resizer-h resizer-left" on:mousedown={(e) => startDrag('left', e)}>
      </div>
    {:else}
      <div class="resizer-spacer"></div>
    {/if}

    <!-- Center: Chart -->
    <div class="tc">
      <div class="desk-panel-resizable" style={getDesktopPanelStyle('center')}>
        <div class="desk-panel-body">
          <VerdictBanner verdict={latestScan} scanning={terminalScanning} />
          <div class="chart-area chart-area-full">
            <ChartPanel
              bind:this={desktopChartRef}
              advancedMode
              enableTradeLineEntry
              uiPreset="tradingview"
              requireTradeConfirm
              chatFirstMode
              {chatTradeReady}
              chatTradeDir={chatSuggestedDir}
              {activeTradeSetup}
              on:scanrequest={handleChartScanRequest}
              on:chatrequest={handleChartChatRequest}
              on:clearTradeSetup={() => { activeTradeSetup = null; }}
            />
          </div>
        </div>
        <button
          type="button"
          class="resize-handle resize-handle-x desk-resize-handle desk-resize-handle-x"
          title="CHART 좌우 크기 조절: 스크롤 / 더블클릭 초기화"
          aria-label="Resize chart panel width with scroll"
          on:wheel={(e) => resizeDesktopPanelByWheel('center', 'x', e)}
          on:dblclick={() => resetDesktopPanelSize('center')}
        ></button>
        <button
          type="button"
          class="resize-handle resize-handle-y desk-resize-handle desk-resize-handle-y"
          title="CHART 위아래 크기 조절: 스크롤 / 더블클릭 초기화"
          aria-label="Resize chart panel height with scroll"
          on:wheel={(e) => resizeDesktopPanelByWheel('center', 'y', e)}
          on:dblclick={() => resetDesktopPanelSize('center')}
        ></button>
      </div>
    </div>

    <!-- Right Resizer (drag only, no toggle) -->
    {#if !rightCollapsed}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="resizer resizer-h resizer-right" on:wheel={(e) => resizePanelByWheel('right', e, { force: true })} title="스크롤/드래그로 INTEL 너비 조절">
        <div class="resizer-drag" on:mousedown={(e) => startDrag('right', e)}></div>
      </div>
    {:else}
      <div class="resizer-spacer"></div>
    {/if}

    <!-- Right: Intel Panel or collapsed strip -->
    {#if !rightCollapsed}
      <div class="tr" on:wheel={(e) => resizePanelByWheel('right', e)}>
        <div class="desk-panel-resizable" style={getDesktopPanelStyle('right')}>
          <div class="desk-panel-body">
            <IntelPanel
              {densityMode}
              {chatMessages}
              {isTyping}
              {latestScan}
              {chatTradeReady}
              {chatFocusKey}
              on:sendchat={handleSendChat}
              on:gototrade={handleIntelGoTrade}
              on:collapse={toggleRight}
            />
          </div>
          <button
            type="button"
            class="resize-handle resize-handle-x desk-resize-handle desk-resize-handle-x"
            title="INTEL 좌우 크기 조절: 스크롤 / 더블클릭 초기화"
            aria-label="Resize intel panel width with scroll"
            on:wheel={(e) => resizeDesktopPanelByWheel('right', 'x', e)}
            on:dblclick={() => resetDesktopPanelSize('right')}
          ></button>
          <button
            type="button"
            class="resize-handle resize-handle-y desk-resize-handle desk-resize-handle-y"
            title="INTEL 위아래 크기 조절: 스크롤 / 더블클릭 초기화"
            aria-label="Resize intel panel height with scroll"
            on:wheel={(e) => resizeDesktopPanelByWheel('right', 'y', e)}
            on:dblclick={() => resetDesktopPanelSize('right')}
          ></button>
        </div>
      </div>
    {:else}
      <button
        class="panel-strip panel-strip-right"
        on:click={toggleRight}
        on:wheel={(e) => resizePanelByWheel('right', e, { force: true })}
        title="Show Intel"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="1" y="2" width="14" height="12" rx="1.5"/>
          <line x1="10" y1="2" x2="10" y2="14"/>
        </svg>
        <span class="strip-label">INTEL</span>
      </button>
    {/if}

    <!-- Ticker -->
    <div class="ticker-bar">
      <div class="ticker-inner">
        <div class="ticker-track">
          {#each tickerSegments as segment, idx (`desk-a-${idx}-${segment}`)}
            <span class={tickerSegmentClass(segment)}>{segment}</span>
          {/each}
        </div>
        <div class="ticker-track" aria-hidden="true">
          {#each tickerSegments as segment, idx (`desk-b-${idx}-${segment}`)}
            <span class={tickerSegmentClass(segment)}>{segment}</span>
          {/each}
        </div>
      </div>
    </div>

    <!-- Drag Overlay (prevents iframes/canvas from eating events) -->
    {#if dragTarget}
      <div class="drag-overlay col"></div>
    {/if}
  </div>
  {/if}
</div>

<!-- Copy Trade Modal (shared across all layouts) -->
<CopyTradeModal />

<style>
  .terminal-shell {
    --term-bg: #0a1a0d;
    --term-bg2: #0f2614;
    --term-bg3: #143620;
    --term-accent: #e8967d;
    --term-accent-soft: #f5c4b8;
    --term-live: #87dcbe;
    --term-danger: #d86b79;
    --term-text: #f0ede4;
    --term-text-dim: rgba(240, 237, 228, 0.56);
    --term-border: rgba(232, 150, 125, 0.2);
    --term-border-soft: rgba(232, 150, 125, 0.12);
    --term-panel: rgba(13, 35, 22, 0.9);
    --term-panel-2: rgba(10, 27, 17, 0.92);

    /* Override legacy terminal globals inside this route only */
    --yel: var(--term-accent);
    --pk: var(--term-accent);
    --grn: var(--term-live);
    --red: var(--term-danger);
    --ora: #d8a266;
    --cyan: #9fd5cb;
    --blk: #0a1a0d;

    position: absolute;
    inset: 0;
    width: auto;
    height: auto;
    min-height: 0;
    overflow: hidden;
    overflow-x: clip;
    overscroll-behavior: none;
    isolation: isolate;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    background:
      radial-gradient(110% 72% at 15% 0%, rgba(232, 150, 125, 0.1) 0%, rgba(232, 150, 125, 0) 58%),
      radial-gradient(96% 68% at 88% 6%, rgba(135, 220, 190, 0.14) 0%, rgba(135, 220, 190, 0) 62%),
      linear-gradient(180deg, var(--term-bg2) 0%, var(--term-bg) 72%);
  }
  .terminal-shell::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background:
      linear-gradient(180deg, rgba(240, 237, 228, 0.03) 0%, rgba(240, 237, 228, 0) 24%),
      repeating-linear-gradient(
        0deg,
        transparent 0,
        transparent 2px,
        rgba(0, 0, 0, 0.14) 2px,
        rgba(0, 0, 0, 0.14) 3px
      );
    opacity: 0.52;
  }
  .density-toggle {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 30;
    font: 800 9px/1 var(--fm);
    letter-spacing: .9px;
    color: rgba(240,237,228,.9);
    border: 1px solid rgba(232,150,125,.35);
    border-radius: 999px;
    background: rgba(10,9,8,.72);
    padding: 6px 10px;
    cursor: pointer;
    backdrop-filter: blur(4px);
    transition: all .12s ease;
  }
  .density-toggle:hover {
    border-color: rgba(232,150,125,.55);
    background: rgba(232,150,125,.14);
    color: #fff;
  }
  .decision-rail {
    position: absolute;
    top: 10px;
    left: 10px;
    right: 10px;
    z-index: 28;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border: 1px solid rgba(232,150,125,.28);
    border-radius: 10px;
    background: rgba(7, 15, 10, .72);
    box-shadow: 0 8px 22px rgba(0,0,0,.25);
    backdrop-filter: blur(6px);
  }
  .decision-context {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-family: var(--fm);
  }
  .dc-pair {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1px;
    color: rgba(255,255,255,.92);
  }
  .dc-tf {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: .8px;
    color: rgba(255,255,255,.62);
    border: 1px solid rgba(255,255,255,.16);
    border-radius: 999px;
    padding: 2px 6px;
  }
  .decision-verdict {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--fm);
    min-width: 0;
  }
  .dv-label {
    font-size: 8px;
    letter-spacing: .9px;
    color: rgba(255,255,255,.55);
  }
  .dv-dir {
    font-size: 10px;
    font-weight: 900;
    letter-spacing: .9px;
  }
  .dv-dir.long { color: #00e676; }
  .dv-dir.short { color: #ff6b6b; }
  .dv-dir.neutral { color: #ffd54f; }
  .dv-dir.scanning { color: #87dcbe; }
  .dv-conf {
    font-size: 9px;
    font-weight: 800;
    color: rgba(255,255,255,.84);
  }
  .decision-primary {
    margin-left: auto;
    min-width: 0;
    border: 1px solid rgba(135,220,190,.34);
    border-radius: 8px;
    background: rgba(135,220,190,.14);
    color: #dff9ef;
    font-family: var(--fm);
    padding: 6px 9px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    cursor: pointer;
    transition: all .12s ease;
  }
  .decision-primary.trade {
    border-color: rgba(0,230,118,.45);
    background: rgba(0,230,118,.14);
  }
  .decision-primary:hover {
    border-color: rgba(232,150,125,.55);
    background: rgba(232,150,125,.16);
    color: #fff;
  }
  .dp-text {
    font-size: 9px;
    font-weight: 900;
    letter-spacing: .9px;
    line-height: 1;
  }
  .dp-hint {
    font-size: 8px;
    color: rgba(255,255,255,.66);
    letter-spacing: .4px;
    line-height: 1.1;
    white-space: nowrap;
  }
  .decision-mode {
    font: 800 9px/1 var(--fm);
    letter-spacing: .9px;
    color: rgba(240,237,228,.9);
    border: 1px solid rgba(232,150,125,.35);
    border-radius: 999px;
    background: rgba(10,9,8,.72);
    padding: 6px 10px;
    cursor: pointer;
    transition: all .12s ease;
    white-space: nowrap;
  }
  .decision-mode:hover {
    border-color: rgba(232,150,125,.55);
    background: rgba(232,150,125,.14);
    color: #fff;
  }
  @media (max-width: 1180px) {
    .decision-rail { gap: 6px; padding: 6px 8px; }
    .dc-pair { font-size: 9px; }
    .dc-tf { font-size: 8px; padding: 2px 5px; }
    .dp-hint { display: none; }
  }
  .term-stars,
  .term-grain {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }
  .term-stars {
    background:
      radial-gradient(1px 1px at 10% 15%, rgba(255, 255, 255, 0.65) 50%, transparent 50%),
      radial-gradient(1.2px 1.2px at 35% 30%, rgba(255, 255, 255, 0.5) 50%, transparent 50%),
      radial-gradient(1px 1px at 52% 8%, rgba(255, 255, 255, 0.45) 50%, transparent 50%),
      radial-gradient(1px 1px at 76% 46%, rgba(255, 255, 255, 0.6) 50%, transparent 50%),
      radial-gradient(1.2px 1.2px at 84% 18%, rgba(255, 255, 255, 0.42) 50%, transparent 50%),
      radial-gradient(1px 1px at 18% 64%, rgba(255, 255, 255, 0.5) 50%, transparent 50%),
      radial-gradient(1px 1px at 64% 74%, rgba(255, 255, 255, 0.38) 50%, transparent 50%),
      radial-gradient(1.3px 1.3px at 93% 82%, rgba(255, 255, 255, 0.56) 50%, transparent 50%);
    background-size: 320px 320px;
    opacity: 0.45;
  }
  .term-stars-soft {
    background:
      radial-gradient(1px 1px at 22% 22%, rgba(135, 220, 190, 0.55) 50%, transparent 50%),
      radial-gradient(1px 1px at 68% 36%, rgba(135, 220, 190, 0.45) 50%, transparent 50%),
      radial-gradient(1.5px 1.5px at 78% 66%, rgba(135, 220, 190, 0.45) 50%, transparent 50%),
      radial-gradient(1px 1px at 42% 84%, rgba(135, 220, 190, 0.35) 50%, transparent 50%);
    background-size: 520px 520px;
    opacity: 0.38;
    animation: termTwinkle 4.2s ease-in-out infinite alternate;
  }
  @keyframes termTwinkle {
    0% { opacity: 0.26; }
    100% { opacity: 0.52; }
  }
  .term-grain {
    opacity: 0.03;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 200px 200px;
    animation: termGrainShift 0.3s steps(3) infinite;
  }
  @keyframes termGrainShift {
    0% { transform: translate(0, 0); }
    33% { transform: translate(-1px, 1px); }
    66% { transform: translate(1px, -1px); }
    100% { transform: translate(0, 0); }
  }

  .terminal-page,
  .terminal-mobile,
  .terminal-tablet {
    position: relative;
    z-index: 1;
  }

  /* Global thin scrollbar for all terminal panels */
  .terminal-page :global(*::-webkit-scrollbar),
  .terminal-mobile :global(*::-webkit-scrollbar),
  .terminal-tablet :global(*::-webkit-scrollbar) { width: 3px; height: 3px; }
  .terminal-page :global(*::-webkit-scrollbar-thumb),
  .terminal-mobile :global(*::-webkit-scrollbar-thumb),
  .terminal-tablet :global(*::-webkit-scrollbar-thumb) { background: rgba(255,255,255,.1); border-radius: 3px; }
  .terminal-page :global(*::-webkit-scrollbar-track),
  .terminal-mobile :global(*::-webkit-scrollbar-track),
  .terminal-tablet :global(*::-webkit-scrollbar-track) { background: transparent; }

  /* ═══════════════════════════════════════════
     DESKTOP — Full 5-column grid with resizers
     ═══════════════════════════════════════════ */
  .terminal-page {
    display: grid;
    grid-template-columns: 280px 4px 1fr 4px 300px; /* overridden by inline style */
    grid-template-rows: 1fr auto;
    height: 100%;
    padding-top: 50px;
    box-sizing: border-box;
    overflow: hidden;
    overflow-x: clip;
    background: linear-gradient(180deg, var(--term-panel) 0%, var(--term-panel-2) 100%);
    box-shadow: inset 0 0 0 1px var(--term-border-soft);
  }
  .ticker-bar {
    grid-column: 1 / -1;
  }
  .tl,
  .tr,
  .tc {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-width: 0;
    min-height: 0;
  }
  .tab-left {
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    min-width: 0;
  }
  .tl {
    grid-row: 1;
    grid-column: 1;
  }
  .tr {
    grid-row: 1;
    grid-column: 5;
  }
  .tab-left::-webkit-scrollbar { width: 3px; }
  .tab-left::-webkit-scrollbar-track { background: transparent; }
  .tab-left::-webkit-scrollbar-thumb {
    background: rgba(232, 150, 125, 0.45);
    border-radius: 2px;
  }

  .tc {
    grid-row: 1;
    grid-column: 3;
    flex-direction: column;
  }

  .desk-panel-resizable {
    --desk-panel-width: 100%;
    --desk-panel-height: 100%;
    position: relative;
    width: min(100%, var(--desk-panel-width));
    height: min(100%, var(--desk-panel-height));
    min-width: 0;
    min-height: 0;
    margin: auto;
    display: flex;
    flex-direction: column;
    transition: width .16s ease, height .16s ease, box-shadow .16s ease, border-color .16s ease;
    border: 1px solid transparent;
    border-radius: 8px;
  }
  .desk-panel-resizable:hover,
  .desk-panel-resizable:focus-within {
    border-color: rgba(232, 150, 125, 0.24);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
  }
  .desk-panel-body {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .resize-handle {
    position: absolute;
    border: 0;
    background: transparent;
    padding: 0;
    margin: 0;
    opacity: 0;
    transition: opacity .2s ease;
  }
  .resize-handle::before {
    content: '';
    position: absolute;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    border-radius: 999px;
    background: rgba(232, 150, 125, 0.5);
  }
  .resize-handle:hover,
  .resize-handle:focus-visible {
    opacity: 0.7;
    outline: none;
  }
  .resize-handle-x {
    top: var(--rh-x-top, 10px);
    right: 0;
    width: var(--rh-x-width, 12px);
    height: calc(100% - var(--rh-pad, 20px));
    cursor: ew-resize;
  }
  .resize-handle-x::before {
    width: 2px;
    height: var(--rh-x-indicator, 42%);
  }
  .resize-handle-y {
    left: var(--rh-y-left, 10px);
    bottom: 0;
    width: calc(100% - var(--rh-pad, 20px));
    height: var(--rh-y-height, 12px);
    cursor: ns-resize;
  }
  .resize-handle-y::before {
    width: var(--rh-y-indicator, 42%);
    height: 2px;
  }
  .desk-resize-handle {
    z-index: 18;
    --rh-x-top: 12px;
    --rh-pad: 24px;
    --rh-x-width: 8px;
    --rh-x-indicator: 36%;
    --rh-y-left: 12px;
    --rh-y-height: 8px;
    --rh-y-indicator: 36%;
  }

  /* Shared live status dot */
  .ctb-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--term-live);
    box-shadow: 0 0 8px rgba(135, 220, 190, 0.8);
    animation: blink-dot 0.9s infinite;
  }
  @keyframes blink-dot {
    0%,100% { opacity: 1; }
    50% { opacity: .2; }
  }

  .chart-area {
    flex: 1;
    overflow: hidden;
    min-height: 180px;
  }
  .chart-area-full { flex: 1; }

  /* ── Resizers ── */
  .resizer {
    position: relative;
    z-index: 20;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    grid-row: 1;
  }
  .resizer-left { grid-column: 2; }
  .resizer-right { grid-column: 4; }
  .resizer-h {
    width: 2px;
    background: rgba(255, 255, 255, 0.04);
    cursor: col-resize;
    transition: background .15s;
  }
  .resizer-h:hover {
    background: rgba(232, 150, 125, 0.15);
  }
  .resizer-spacer {
    width: 1px;
    grid-row: 1;
  }
  .resizer-spacer:nth-of-type(1) { grid-column: 2; }

  .panel-strip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 7px 0;
    background: rgba(12, 29, 19, 0.95);
    border: none;
    cursor: pointer;
    transition: background .15s;
    grid-row: 1;
  }
  .panel-strip:hover { background: rgba(232, 150, 125, 0.08); }
  .panel-strip svg {
    color: rgba(245, 196, 184, 0.62);
    transition: color .15s;
  }
  .panel-strip:hover svg { color: var(--term-accent-soft); }
  .strip-label {
    writing-mode: vertical-rl;
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 1.8px;
    color: rgba(245, 196, 184, 0.62);
    transition: color .15s;
  }
  .panel-strip:hover .strip-label { color: rgba(245, 196, 184, 0.8); }
  .panel-strip-left {
    grid-column: 1;
    border-right: 1px solid var(--term-border);
  }
  .panel-strip-right {
    grid-column: 5;
    border-left: 1px solid var(--term-border);
  }

  .resizer-drag {
    position: absolute;
    inset: 0;
    cursor: col-resize;
  }

  /* Drag Overlay */
  .drag-overlay {
    position: absolute;
    inset: 0;
    z-index: 100;
  }
  .drag-overlay.col { cursor: col-resize; }

  /* ═══════════════════════════════════════════
     TICKER BAR — shared across all layouts
     ═══════════════════════════════════════════ */
  .ticker-bar {
    height: 22px;
    background: linear-gradient(180deg, rgba(15, 40, 24, 0.95) 0%, rgba(10, 27, 17, 0.98) 100%);
    border-top: 1px solid var(--term-border);
    overflow: hidden;
    position: relative;
    flex-shrink: 0;
  }
  .ticker-inner {
    display: flex;
    animation: tickerScroll 40s linear infinite;
    will-change: transform;
    contain: layout style;
  }
  .ticker-track {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
  }
  .ticker-chip {
    font-size: 9px;
    font-family: var(--fm);
    color: var(--term-live);
    font-weight: 600;
    letter-spacing: 0.35px;
    line-height: 1;
    padding: 3px 8px;
    margin: 0 10px;
    border-radius: 999px;
    border: 1px solid transparent;
  }
  .ticker-chip-pos {
    color: #98f5cc;
    border-color: rgba(152,245,204,.22);
    background: rgba(152,245,204,.1);
  }
  .ticker-chip-neg {
    color: #ff9eb0;
    border-color: rgba(255,158,176,.24);
    background: rgba(255,158,176,.12);
  }
  .ticker-chip-fg {
    font-weight: 800;
    border-color: rgba(232,150,125,.3);
    background: rgba(232,150,125,.12);
  }
  .ticker-chip-fg.fear {
    color: #ff8ca1;
    box-shadow: 0 0 8px rgba(255,140,161,.24);
  }
  .ticker-chip-fg.greed {
    color: #86f7b4;
    box-shadow: 0 0 8px rgba(134,247,180,.24);
  }
  .ticker-chip-fg.neutral {
    color: #ffd89d;
  }
  @keyframes tickerScroll {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }

  /* ═══════════════════════════════════════════
     MOBILE — Context header + bottom nav
     ═══════════════════════════════════════════ */
  .terminal-mobile {
    --mob-nav-slot: calc(72px + env(safe-area-inset-bottom));
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: linear-gradient(180deg, var(--term-panel) 0%, var(--term-panel-2) 100%);
    box-shadow: inset 0 0 0 1px var(--term-border-soft);
    overflow: hidden;
    overscroll-behavior-y: contain;
  }
  .mob-topbar {
    flex-shrink: 0;
    padding: 8px 10px 6px;
    border-bottom: 1px solid var(--term-border);
    background:
      linear-gradient(135deg, rgba(232, 150, 125, 0.14), rgba(232, 150, 125, 0.04)),
      linear-gradient(180deg, rgba(14, 36, 23, 0.92), rgba(10, 27, 17, 0.94));
    backdrop-filter: blur(8px);
  }
  .mob-topline {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-bottom: 6px;
  }
  .mob-title-wrap {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 1px;
  }
  .mob-eyebrow {
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.4px;
    color: rgba(240, 237, 228, 0.48);
  }
  .mob-title {
    font-family: var(--fd);
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 0.35px;
    color: var(--term-text);
    line-height: 1.2;
  }
  .mob-live {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid rgba(135, 220, 190, 0.26);
    background: rgba(135, 220, 190, 0.08);
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 1.3px;
    color: var(--term-live);
    white-space: nowrap;
  }
  .mob-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }
  .mob-token {
    min-width: 0;
    flex: 1;
  }
  .mob-meta-chip {
    flex-shrink: 0;
    padding: 4px 8px;
    border-radius: 8px;
    border: 1px solid rgba(240, 237, 228, 0.2);
    background: rgba(240, 237, 228, 0.08);
    font-family: var(--fm);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.2px;
    color: rgba(240, 237, 228, 0.84);
    max-width: 44vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mob-desc {
    margin-top: 6px;
    font-family: var(--fm);
    font-size: 9px;
    color: rgba(240, 237, 228, 0.56);
    letter-spacing: 0.15px;
    line-height: 1.35;
  }
  .mob-content {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    touch-action: pan-y;
    padding: 8px 8px calc(10px + var(--mob-nav-slot));
    scroll-padding-bottom: calc(8px + var(--mob-nav-slot));
    display: flex;
    flex-direction: column;
  }
  .mob-content.chart-only {
    padding: 4px 6px calc(6px + var(--mob-nav-slot));
  }
  .mob-chart-stack {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1 1 auto;
    gap: 0;
  }
  .mob-panel-wrap,
  .mob-chart-section {
    height: auto;
    min-height: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    border: 1px solid rgba(232, 150, 125, 0.16);
    overflow: hidden;
    background: rgba(8, 22, 14, 0.58);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.26);
  }
  .mob-panel-resizable {
    position: relative;
    width: min(100%, var(--mob-panel-width, 100%));
    height: min(100%, var(--mob-panel-height, 100%));
    margin-inline: auto;
    transition: width .16s ease, height .16s ease, box-shadow .16s ease, border-color .16s ease;
  }
  .mob-panel-resizable:focus-within,
  .mob-panel-resizable:hover {
    border-color: rgba(232, 150, 125, 0.28);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  }
  .mob-resize-handle {
    z-index: 8;
    touch-action: none;
    user-select: none;
    --rh-x-top: 10px;
    --rh-pad: 20px;
    --rh-x-width: 12px;
    --rh-x-indicator: 42%;
    --rh-y-left: 10px;
    --rh-y-height: 12px;
    --rh-y-indicator: 42%;
  }
  .mob-chart-area {
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .mob-bottom-nav {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-rows: minmax(44px, 44px);
    align-items: center;
    gap: 6px;
    padding: 7px 8px calc(5px + env(safe-area-inset-bottom));
    min-height: calc(60px + env(safe-area-inset-bottom));
    max-height: calc(72px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--term-border);
    background: rgba(10, 26, 16, 0.92);
    backdrop-filter: blur(8px);
    margin-top: 0;
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 4;
    overflow: hidden;
  }
  .mob-nav-btn {
    height: 44px;
    min-height: 44px;
    max-height: 44px;
    align-self: center;
    border-radius: 12px;
    border: 1px solid rgba(232, 150, 125, 0.16);
    background: rgba(240, 237, 228, 0.03);
    color: rgba(240, 237, 228, 0.62);
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 0;
    font-family: var(--fm);
    cursor: pointer;
    transition: all .14s ease;
  }
  .mob-nav-btn.active {
    color: var(--term-accent-soft);
    border-color: rgba(232, 150, 125, 0.4);
    background: linear-gradient(135deg, rgba(232, 150, 125, 0.2), rgba(232, 150, 125, 0.08));
    box-shadow: inset 0 0 0 1px rgba(245, 196, 184, 0.18);
  }
  .mob-nav-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.8px;
    line-height: 1;
  }
  .mob-nav-badge {
    margin-left: 6px;
    min-width: 16px;
    height: 16px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 900;
    line-height: 1;
    color: #0b1b12;
    background: var(--term-live);
    box-shadow: 0 0 8px rgba(135, 220, 190, 0.45);
  }

  /* ═══════════════════════════════════════════
     TABLET — 2-col top + Intel bottom
     ═══════════════════════════════════════════ */
  .terminal-tablet {
    --tab-left-width: clamp(196px, 23vw, 232px);
    --tab-bottom-height: clamp(200px, 28vh, 280px);
    display: grid;
    grid-template-rows: minmax(0, 1fr) 6px var(--tab-bottom-height) auto;
    height: 100%;
    padding-top: 50px;
    box-sizing: border-box;
    background: linear-gradient(180deg, var(--term-panel) 0%, var(--term-panel-2) 100%);
    box-shadow: inset 0 0 0 1px var(--term-border-soft);
    overflow: hidden;
  }
  .tab-top {
    grid-row: 1;
    display: grid;
    grid-template-columns: var(--tab-left-width) 6px minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
  }
  .tab-left {
    grid-column: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 3px 4px 4px;
    overflow: hidden;
  }
  .tab-center {
    grid-column: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 4px 4px 3px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .tab-panel-resizable {
    --tab-panel-width: 100%;
    --tab-panel-height: 100%;
    position: relative;
    width: min(100%, var(--tab-panel-width));
    height: min(100%, var(--tab-panel-height));
    margin: auto;
    border-radius: 8px;
    border: 1px solid transparent;
    transition: width .16s ease, height .16s ease, box-shadow .16s ease, border-color .16s ease;
    min-width: 0;
    min-height: 0;
  }
  .tab-panel-resizable:hover,
  .tab-panel-resizable:focus-within {
    border-color: rgba(232, 150, 125, 0.24);
    box-shadow: 0 8px 26px rgba(0, 0, 0, 0.26);
  }
  .tab-panel-body {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .tab-resize-handle {
    z-index: 16;
    --rh-x-top: 10px;
    --rh-pad: 20px;
    --rh-x-width: 20px;
    --rh-x-indicator: 44%;
    --rh-y-left: 10px;
    --rh-y-height: 20px;
    --rh-y-indicator: 44%;
  }
  .tab-chart-area {
    flex: 1;
    min-height: 200px;
    overflow: hidden;
  }
  .tab-layout-split {
    border: 0;
    background: rgba(8, 18, 13, 0.86);
    padding: 0;
    margin: 0;
    position: relative;
    z-index: 16;
    cursor: col-resize;
    transition: background .14s ease;
  }
  .tab-layout-split span {
    position: absolute;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    display: block;
    border-radius: 999px;
    background: rgba(245, 196, 184, 0.45);
  }
  .tab-layout-split:hover,
  .tab-layout-split:focus-visible {
    background: rgba(232, 150, 125, 0.14);
    outline: none;
  }
  .tab-layout-split-v {
    grid-column: 2;
  }
  .tab-layout-split-v span {
    width: 2px;
    height: 42px;
  }
  .tab-layout-split-h {
    grid-row: 2;
    width: 100%;
    cursor: row-resize;
  }
  .tab-layout-split-h span {
    width: 44px;
    height: 2px;
  }
  .tab-bottom {
    grid-row: 3;
    height: 100%;
    border-top: 1px solid var(--term-border);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    overflow: hidden;
  }
  .terminal-tablet .ticker-bar {
    grid-row: 4;
  }

  /* Route-scoped tone overrides for terminal child components */
  .terminal-shell :global(.war-room),
  .terminal-shell :global(.intel-panel) {
    background: var(--term-panel-2);
  }

  .terminal-shell :global(.war-room) {
    border-right: 1px solid var(--term-border-soft);
  }
  .terminal-shell :global(.war-room .wr-header) {
    background: linear-gradient(90deg, rgba(232, 150, 125, 0.94), rgba(245, 196, 184, 0.86));
    border-bottom: 1px solid rgba(10, 26, 13, 0.5);
  }
  .terminal-shell :global(.war-room .wr-title) {
    color: #112419;
    letter-spacing: 1.4px;
    white-space: nowrap;
  }
  .terminal-shell :global(.war-room .signal-link) {
    color: #132418;
    background: rgba(240, 237, 228, 0.55);
    border-color: rgba(10, 26, 13, 0.28);
  }
  .terminal-shell :global(.war-room .arena-trigger) {
    color: var(--term-accent-soft);
    background: rgba(10, 26, 16, 0.78);
    border-color: rgba(245, 196, 184, 0.34);
  }
  .terminal-shell :global(.war-room .arena-trigger:hover) {
    color: #fff4e9;
    background: rgba(10, 26, 16, 0.94);
    border-color: rgba(245, 196, 184, 0.58);
  }
  .terminal-shell :global(.war-room .ticker-flow) {
    border-bottom-color: var(--term-border-soft);
    background: rgba(9, 24, 16, 0.62);
  }
  .terminal-shell :global(.war-room .ticker-chip) {
    color: rgba(240, 237, 228, 0.78);
    border-color: rgba(232, 150, 125, 0.2);
    background: rgba(240, 237, 228, 0.03);
  }
  .terminal-shell :global(.war-room .ticker-label) {
    color: var(--term-accent-soft);
    border-color: rgba(232, 150, 125, 0.42);
    background: rgba(232, 150, 125, 0.16);
  }
  .terminal-shell :global(.war-room .ticker-tf) {
    color: var(--term-live);
    border-color: rgba(94, 203, 180, 0.44);
    background: rgba(94, 203, 180, 0.14);
  }
  .terminal-shell :global(.war-room .token-tabs) {
    border-bottom-color: var(--term-border-soft);
    background: rgba(9, 24, 16, 0.55);
  }
  .terminal-shell :global(.war-room .token-tab) {
    color: rgba(240, 237, 228, 0.78);
  }
  .terminal-shell :global(.war-room .token-tab.active) {
    color: var(--term-accent-soft);
    border-color: rgba(232, 150, 125, 0.52);
    background: rgba(232, 150, 125, 0.08);
  }
  .terminal-shell :global(.war-room .token-tab.active .token-tab-count) {
    background: rgba(232, 150, 125, 0.14);
    color: var(--term-accent-soft);
  }
  .terminal-shell :global(.war-room .deriv-strip) {
    background: rgba(10, 26, 16, 0.6);
    border-bottom-color: var(--term-border-soft);
  }
  .terminal-shell :global(.war-room .wr-msg) {
    border-bottom-color: rgba(232, 150, 125, 0.08);
  }
  .terminal-shell :global(.war-room .wr-msg:hover) {
    background: rgba(232, 150, 125, 0.04);
  }
  .terminal-shell :global(.war-room .wr-msg.selected) {
    background: rgba(232, 150, 125, 0.07);
    border-left-color: var(--term-accent);
  }
  .terminal-shell :global(.war-room .copy-trade-cta) {
    background: linear-gradient(90deg, rgba(232, 150, 125, 0.2), rgba(232, 150, 125, 0.09));
    border-top-color: var(--term-border);
  }
  .terminal-shell :global(.war-room .copy-trade-cta:hover) {
    background: linear-gradient(90deg, rgba(232, 150, 125, 0.3), rgba(232, 150, 125, 0.14));
  }
  .terminal-shell :global(.war-room .wr-stats) {
    border-top-color: var(--term-border);
    background: rgba(232, 150, 125, 0.04);
  }
  .terminal-shell :global(.war-room .stat-cell) {
    border-right-color: rgba(232, 150, 125, 0.14);
  }
  .terminal-shell :global(.war-room .stat-lbl) {
    color: rgba(245, 196, 184, 0.72);
  }

  .terminal-shell :global(.intel-panel) {
    border-left: 1px solid var(--term-border-soft);
  }
  .terminal-shell :global(.intel-panel .rp-tabs) {
    border-bottom-color: var(--term-border);
  }
  .terminal-shell :global(.intel-panel .rp-tab) {
    color: rgba(240, 237, 228, 0.8);
    background: rgba(240, 237, 228, 0.04);
  }
  .terminal-shell :global(.intel-panel .rp-tab.active) {
    background: rgba(232, 150, 125, 0.2);
    color: var(--term-accent-soft);
  }
  .terminal-shell :global(.intel-panel .rp-tab:not(.active):hover) {
    color: var(--term-accent-soft);
    background: rgba(232, 150, 125, 0.08);
  }
  .terminal-shell :global(.intel-panel .rp-collapse),
  .terminal-shell :global(.intel-panel .rp-panel-collapse) {
    border-left-color: var(--term-border-soft);
    color: rgba(245, 196, 184, 0.78);
  }
  .terminal-shell :global(.intel-panel .rp-collapse:hover),
  .terminal-shell :global(.intel-panel .rp-panel-collapse:hover) {
    background: rgba(232, 150, 125, 0.14);
    color: var(--term-accent-soft);
  }
  .terminal-shell :global(.intel-panel .feed-chips) {
    border-bottom-color: var(--term-border-soft);
  }
  .terminal-shell :global(.intel-panel .feed-chip) {
    color: rgba(240, 237, 228, 0.52);
    border-color: var(--term-border-soft);
  }
  .terminal-shell :global(.intel-panel .feed-chip.active) {
    color: var(--term-accent-soft);
    border-color: var(--term-accent);
    background: rgba(232, 150, 125, 0.1);
  }
  .terminal-shell :global(.intel-panel .hl-ticker-badge) {
    color: var(--term-accent-soft);
    background: rgba(232, 150, 125, 0.1);
    border-bottom-color: var(--term-border-soft);
  }
  .terminal-shell :global(.intel-panel .hl-row),
  .terminal-shell :global(.intel-panel .ev-card) {
    border-bottom-color: rgba(232, 150, 125, 0.08);
  }
  .terminal-shell :global(.intel-panel .hl-time),
  .terminal-shell :global(.intel-panel .ev-etime),
  .terminal-shell :global(.intel-panel .comm-time),
  .terminal-shell :global(.intel-panel .flow-addr),
  .terminal-shell :global(.intel-panel .ac-name) {
    color: rgba(240, 237, 228, 0.68);
  }
  .terminal-shell :global(.war-room .wr-msg-text),
  .terminal-shell :global(.war-room .wr-msg-name),
  .terminal-shell :global(.intel-panel .hl-txt),
  .terminal-shell :global(.intel-panel .comm-txt),
  .terminal-shell :global(.intel-panel .ev-body),
  .terminal-shell :global(.intel-panel .ac-txt) {
    line-height: 1.4;
    letter-spacing: 0.08px;
  }
  .terminal-shell :global(.war-room .deriv-val),
  .terminal-shell :global(.war-room .wr-msg-price),
  .terminal-shell :global(.intel-panel .flow-amt),
  .terminal-shell :global(.intel-panel .hl-time),
  .terminal-shell :global(.intel-panel .ev-etime) {
    font-variant-numeric: tabular-nums;
  }
  .terminal-shell :global(.intel-panel .hl-row:hover),
  .terminal-shell :global(.intel-panel .comm-react:hover) {
    background: rgba(232, 150, 125, 0.08);
  }
  .terminal-shell :global(.intel-panel .user-post) {
    border-left-color: var(--term-accent);
  }
  .terminal-shell :global(.intel-panel .ac-send) {
    background: var(--term-accent);
    color: var(--term-bg);
    border-color: rgba(10, 26, 13, 0.45);
  }
  .terminal-shell :global(.intel-panel .ac-input input:focus) {
    border-color: rgba(232, 150, 125, 0.42);
  }

  /* Text density tuning (desktop/tablet): denser headers, clearer body hierarchy */
  .terminal-shell {
    --term-font-2xs: clamp(7px, 0.42vw, 8px);
    --term-font-xs: clamp(8px, 0.5vw, 9px);
    --term-font-sm: clamp(9px, 0.62vw, 10px);
    --term-font-md: clamp(10px, 0.78vw, 11.5px);
    --term-font-lg: clamp(11px, 0.9vw, 13px);
  }
  .terminal-shell :global(.war-room .wr-title) {
    font-size: var(--term-font-md);
    letter-spacing: 1.05px;
  }
  .terminal-shell :global(.war-room .wr-chip),
  .terminal-shell :global(.war-room .ticker-chip),
  .terminal-shell :global(.war-room .scan-tab),
  .terminal-shell :global(.war-room .token-tab),
  .terminal-shell :global(.intel-panel .feed-chip),
  .terminal-shell :global(.intel-panel .ac-trade-btn) {
    font-size: var(--term-font-xs);
    letter-spacing: 0.42px;
  }
  .terminal-shell :global(.war-room .scan-tab-history),
  .terminal-shell :global(.war-room .token-tab-count),
  .terminal-shell :global(.war-room .wr-msg-time),
  .terminal-shell :global(.war-room .wr-msg-src),
  .terminal-shell :global(.intel-panel .hl-time),
  .terminal-shell :global(.intel-panel .ev-etime),
  .terminal-shell :global(.intel-panel .flow-addr),
  .terminal-shell :global(.intel-panel .ac-name) {
    font-size: var(--term-font-2xs);
    letter-spacing: 0.28px;
  }
  .terminal-shell :global(.war-room .deriv-lbl),
  .terminal-shell :global(.war-room .scan-status-text),
  .terminal-shell :global(.war-room .select-all-btn),
  .terminal-shell :global(.war-room .wr-act-btn),
  .terminal-shell :global(.war-room .src-count),
  .terminal-shell :global(.war-room .src-tracked),
  .terminal-shell :global(.intel-panel .hl-net),
  .terminal-shell :global(.intel-panel .hl-engage),
  .terminal-shell :global(.intel-panel .hl-creator),
  .terminal-shell :global(.intel-panel .trend-name),
  .terminal-shell :global(.intel-panel .trend-vol),
  .terminal-shell :global(.intel-panel .trend-soc),
  .terminal-shell :global(.intel-panel .trend-galaxy) {
    font-size: var(--term-font-xs);
    letter-spacing: 0.18px;
  }
  .terminal-shell :global(.war-room .wr-msg-name),
  .terminal-shell :global(.war-room .wr-msg-vote),
  .terminal-shell :global(.war-room .wr-msg-conf),
  .terminal-shell :global(.war-room .wr-msg-signal-row),
  .terminal-shell :global(.war-room .wr-msg-text),
  .terminal-shell :global(.war-room .src-text),
  .terminal-shell :global(.war-room .ctc-text),
  .terminal-shell :global(.intel-panel .rp-tab),
  .terminal-shell :global(.intel-panel .hl-txt),
  .terminal-shell :global(.intel-panel .flow-lbl),
  .terminal-shell :global(.intel-panel .flow-amt),
  .terminal-shell :global(.intel-panel .comm-name),
  .terminal-shell :global(.intel-panel .comm-txt),
  .terminal-shell :global(.intel-panel .ev-body),
  .terminal-shell :global(.intel-panel .ac-title),
  .terminal-shell :global(.intel-panel .ac-txt),
  .terminal-shell :global(.intel-panel .ac-input input),
  .terminal-shell :global(.intel-panel .trend-sym),
  .terminal-shell :global(.intel-panel .trend-price),
  .terminal-shell :global(.intel-panel .trend-chg) {
    font-size: var(--term-font-sm);
    letter-spacing: 0.12px;
  }
  .terminal-shell :global(.war-room .deriv-val),
  .terminal-shell :global(.war-room .stat-val),
  .terminal-shell :global(.war-room .wr-msg-entry),
  .terminal-shell :global(.war-room .wr-msg-tp),
  .terminal-shell :global(.war-room .wr-msg-sl),
  .terminal-shell :global(.intel-panel .pos-pnl),
  .terminal-shell :global(.intel-panel .pick-score) {
    font-size: var(--term-font-md);
    letter-spacing: 0.08px;
  }
  .terminal-shell :global(.war-room .wr-msg-text),
  .terminal-shell :global(.intel-panel .hl-txt),
  .terminal-shell :global(.intel-panel .comm-txt),
  .terminal-shell :global(.intel-panel .ev-body),
  .terminal-shell :global(.intel-panel .ac-txt) {
    line-height: 1.38;
  }
  .terminal-shell :global(.war-room .deriv-val),
  .terminal-shell :global(.war-room .wr-msg-conf),
  .terminal-shell :global(.war-room .wr-msg-time),
  .terminal-shell :global(.war-room .stat-val),
  .terminal-shell :global(.intel-panel .flow-amt),
  .terminal-shell :global(.intel-panel .trend-price),
  .terminal-shell :global(.intel-panel .trend-chg),
  .terminal-shell :global(.intel-panel .pick-score),
  .terminal-shell :global(.intel-panel .pos-pnl) {
    font-variant-numeric: tabular-nums lining-nums;
  }

  /* Mobile-only readability and touch ergonomics */
  .terminal-mobile :global(.war-room),
  .terminal-mobile :global(.intel-panel),
  .terminal-mobile :global(.chart-wrapper),
  .terminal-mobile :global(.tv-container) {
    border-radius: 12px;
    overflow: hidden;
  }
  .terminal-mobile :global(.chart-wrapper) {
    height: 100%;
    min-height: 0;
  }
  .terminal-mobile :global(.chart-wrapper .chart-container) {
    min-height: max(180px, 36vh);
  }
  .terminal-mobile :global(.war-room .wr-header) {
    height: 38px;
    padding: 0 12px;
  }
  .terminal-mobile :global(.war-room .wr-header-right) {
    flex: 0 0 auto;
    overflow: visible;
    padding-right: 0;
    margin-left: auto;
    scrollbar-width: none;
  }
  .terminal-mobile :global(.war-room .wr-header-right::-webkit-scrollbar) {
    display: none;
  }
  .terminal-mobile :global(.war-room .wr-title) {
    font-size: 13px;
    letter-spacing: 1.5px;
  }
  .terminal-mobile :global(.war-room .signal-link),
  .terminal-mobile :global(.war-room .wr-collapse-btn) {
    display: none;
  }
  .terminal-mobile :global(.war-room .arena-trigger) {
    min-height: 26px;
    height: 26px;
    min-width: 70px;
    padding: 0 10px;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: .8px;
    color: rgba(245,196,184,.96);
    background: rgba(10,26,16,.8);
    border: 1px solid rgba(245,196,184,.35);
    box-shadow: inset 0 0 0 1px rgba(10,26,16,.45);
  }
  .terminal-mobile :global(.war-room .arena-trigger:hover),
  .terminal-mobile :global(.war-room .arena-trigger:active) {
    color: #fff4e9;
    background: rgba(10,26,16,.95);
    border-color: rgba(245,196,184,.62);
  }
  .terminal-mobile :global(.scan-btn) {
    min-height: 28px;
    padding: 4px 10px;
    font-size: 9px;
  }
  .terminal-mobile :global(.war-room .token-tab),
  .terminal-mobile :global(.intel-panel .rp-tab),
  .terminal-mobile :global(.intel-panel .feed-chip) {
    min-height: 38px;
    font-size: 10px;
    letter-spacing: 0.9px;
  }
  .terminal-mobile :global(.war-room .token-tab-count) {
    font-size: 8px;
  }
  .terminal-mobile :global(.war-room .deriv-strip) {
    padding: 6px 8px;
  }
  .terminal-mobile :global(.war-room .ticker-flow) {
    padding: 4px 8px;
    gap: 4px;
  }
  .terminal-mobile :global(.war-room .ticker-chip) {
    height: 18px;
    padding: 0 6px;
    font-size: 7px;
    letter-spacing: .4px;
  }
  .terminal-mobile :global(.war-room .scan-tabs),
  .terminal-mobile :global(.war-room .token-tabs) {
    padding: 3px 6px;
    gap: 3px;
  }
  .terminal-mobile :global(.war-room .scan-tab),
  .terminal-mobile :global(.war-room .token-tab) {
    min-height: 28px;
    height: 28px;
    padding: 0 8px;
    border-radius: 12px;
    font-size: 9px;
  }
  .terminal-mobile :global(.war-room .scan-tab-meta),
  .terminal-mobile :global(.war-room .token-tab-count) {
    font-size: 7px;
  }
  .terminal-mobile :global(.war-room .deriv-val) {
    font-size: 12px;
  }
  .terminal-mobile :global(.war-room .wr-msg-body) {
    padding: 10px 12px 10px 6px;
  }
  .terminal-mobile :global(.war-room .wr-msg-head) {
    gap: 5px;
    margin-bottom: 4px;
  }
  .terminal-mobile :global(.war-room .wr-msg-name),
  .terminal-mobile :global(.war-room .wr-msg-text) {
    font-size: 10px;
  }
  .terminal-mobile :global(.war-room .wr-msg-signal-row),
  .terminal-mobile :global(.war-room .wr-msg-actions) {
    margin-top: 6px;
    gap: 6px;
  }
  .terminal-mobile :global(.war-room .wr-act-btn),
  .terminal-mobile :global(.war-room .copy-trade-cta),
  .terminal-mobile :global(.war-room .signal-room-cta) {
    min-height: 34px;
  }
  .terminal-mobile :global(.war-room .wr-act-btn) {
    font-size: 8px;
    padding: 4px 7px;
  }
  .terminal-mobile :global(.war-room .ctc-text),
  .terminal-mobile :global(.war-room .src-text) {
    font-size: 9px;
    letter-spacing: 1px;
  }

  .terminal-mobile :global(.intel-panel .rp-tabs) {
    border-bottom-width: 2px;
  }
  .terminal-mobile :global(.intel-panel .rp-collapse) {
    width: 34px;
    font-size: 10px;
  }
  .terminal-mobile :global(.intel-panel .rp-panel-collapse) {
    display: none;
  }
  .terminal-mobile :global(.intel-panel .rp-body) {
    padding: 10px;
    gap: 8px;
  }
  .terminal-mobile :global(.intel-panel .hl-row),
  .terminal-mobile :global(.intel-panel .ev-card),
  .terminal-mobile :global(.intel-panel .pos-row),
  .terminal-mobile :global(.intel-panel .comm-post) {
    padding-top: 10px;
    padding-bottom: 10px;
  }
  .terminal-mobile :global(.intel-panel .hl-txt),
  .terminal-mobile :global(.intel-panel .comm-txt),
  .terminal-mobile :global(.intel-panel .ev-body),
  .terminal-mobile :global(.intel-panel .ac-txt) {
    font-size: 10px;
    line-height: 1.45;
  }
  .terminal-mobile :global(.intel-panel .ac-section) {
    flex: 1 1 auto;
    min-height: 185px;
    max-height: none;
  }
  .terminal-mobile :global(.intel-panel .ac-title) {
    font-size: 10px;
    letter-spacing: 1.2px;
  }
  .terminal-mobile :global(.intel-panel .ac-input) {
    padding: 6px 8px 8px;
    gap: 6px;
  }
  .terminal-mobile :global(.intel-panel .ac-input input) {
    min-height: 36px;
    font-size: 10px;
    padding: 8px 10px;
  }
  .terminal-mobile :global(.intel-panel .ac-send) {
    width: 38px;
    min-height: 36px;
    border-radius: 8px;
  }

  .terminal-tablet :global(.intel-panel .rp-body-wrap) {
    min-height: 0;
  }
  .terminal-tablet :global(.intel-panel .ac-section) {
    flex: 1 1 0%;
    min-height: 0;
    max-height: none;
  }

  .terminal-mobile :global(.chart-wrapper .chart-bar) {
    gap: 2px;
    padding: 3px 5px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .bar-top) { gap: 5px; }
  .terminal-mobile :global(.chart-wrapper .chart-bar .bar-tools) {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    gap: 3px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .bar-left) {
    gap: 4px;
    width: auto;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .pair-slot) {
    min-width: 124px;
    flex: 0 0 auto;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .pair-slot .tdd-trigger) {
    min-height: 20px;
    padding: 1px 6px;
    gap: 3px;
    border-radius: 7px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .pair-slot .tdd-sym) {
    font-size: 10px;
    letter-spacing: .55px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .pair-slot .tdd-pair),
  .terminal-mobile :global(.chart-wrapper .chart-bar .pair-slot .tdd-arrow) {
    font-size: 8px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .pair-slot .tdd-panel:not(.mobile)) {
    width: min(92vw, 320px);
    max-height: min(62vh, 340px);
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .tf-btns) {
    width: auto;
    flex: 0 0 auto;
    min-width: max-content;
    padding-bottom: 1px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .tf-btns .tfbtn) {
    min-height: 20px;
    height: 20px;
    padding: 0 6px;
    font-size: 9px;
    letter-spacing: .25px;
    border-radius: 5px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .market-stats) {
    width: 100%;
    gap: 4px;
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .market-stats .mstat) {
    height: 20px;
    padding: 0 6px;
    gap: 4px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .market-stats .mstat-k) {
    font-size: 8px;
    letter-spacing: .25px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .market-stats .mstat-v) {
    font-size: 9px;
    letter-spacing: .1px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .bar-right) {
    width: auto;
    justify-content: flex-end;
    align-items: center;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .bar-controls) {
    width: auto;
    flex: 0 0 auto;
    min-width: max-content;
    gap: 4px;
    flex-wrap: nowrap;
    white-space: nowrap;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .draw-tools) {
    display: flex;
    flex-wrap: nowrap;
    gap: 2px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .mode-toggle .mode-btn) {
    min-height: 20px;
    padding: 0 6px;
    font-size: 9px;
    letter-spacing: .25px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .draw-tools .draw-btn) {
    width: 20px;
    height: 20px;
    font-size: 8px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .scan-btn) {
    min-height: 20px;
    height: 20px;
    padding: 0 6px;
    font-size: 9px;
    letter-spacing: .2px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .price-info) {
    margin-left: auto;
    width: auto;
    justify-content: flex-end;
    border-left: 1px solid rgba(240, 237, 228, 0.12);
    padding-left: 4px;
    gap: 3px;
    order: initial;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .price-info .cprc) {
    font-size: 11px;
    letter-spacing: .08px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-bar .price-info .pchg) {
    font-size: 9px;
  }
  .terminal-mobile :global(.chart-wrapper .indicator-strip) {
    padding: 3px 5px;
    gap: 3px;
    max-height: none;
    flex-wrap: nowrap;
    white-space: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
  }
  .terminal-mobile :global(.chart-wrapper .ind-chip),
  .terminal-mobile :global(.chart-wrapper .legend-chip),
  .terminal-mobile :global(.chart-wrapper .view-chip) {
    min-height: 18px;
    height: 18px;
    padding: 0 5px;
    font-size: 8px;
  }
  .terminal-mobile :global(.chart-wrapper .chart-footer) {
    gap: 6px;
    font-size: 8px;
    padding: 4px 8px;
  }

  .terminal-mobile :global(.war-room .wr-msgs),
  .terminal-mobile :global(.intel-panel .rp-body),
  .terminal-mobile :global(.intel-panel .hl-scrollable),
  .terminal-mobile :global(.intel-panel .ac-msgs),
  .terminal-mobile :global(.intel-panel .trend-list),
  .terminal-mobile :global(.intel-panel .picks-panel) {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    touch-action: pan-y;
  }

  .terminal-mobile :global(.war-room .ticker-flow),
  .terminal-mobile :global(.war-room .scan-tabs),
  .terminal-mobile :global(.war-room .token-tabs),
  .terminal-mobile :global(.chart-wrapper .indicator-strip),
  .terminal-mobile :global(.chart-wrapper .chart-bar .bar-tools),
  .terminal-mobile :global(.chart-wrapper .chart-bar .tf-btns) {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    touch-action: pan-x;
  }

  .terminal-mobile :global(.chart-wrapper .chart-container),
  .terminal-mobile :global(.chart-wrapper .tv-container) {
    touch-action: pan-y pinch-zoom;
  }

  @media (max-width: 768px) {
    .terminal-shell::before { opacity: 0.2; }
    .term-stars-soft,
    .term-grain { display: none; }
    .term-stars {
      opacity: 0.28;
      animation: none;
      background-size: 420px 420px;
    }
  }

  @media (max-width: 768px) and (max-height: 760px) {
    .terminal-mobile {
      --mob-nav-slot: calc(64px + env(safe-area-inset-bottom));
    }
    .mob-topbar {
      padding: 8px 10px 6px;
    }
    .mob-topline {
      margin-bottom: 6px;
    }
    .mob-desc {
      display: none;
    }
    .mob-content {
      padding: 8px 8px calc(10px + var(--mob-nav-slot));
    }
    .mob-content.chart-only {
      padding: 4px 6px calc(6px + var(--mob-nav-slot));
    }
    .mob-bottom-nav {
      padding: 6px 8px calc(4px + env(safe-area-inset-bottom));
      min-height: calc(54px + env(safe-area-inset-bottom));
      max-height: calc(64px + env(safe-area-inset-bottom));
      grid-auto-rows: minmax(40px, 40px);
    }
    .mob-nav-btn {
      height: 40px;
      min-height: 40px;
      max-height: 40px;
    }
  }

  @media (max-width: 520px) {
    .mob-title {
      font-size: 13px;
    }
    .mob-meta {
      gap: 4px;
    }
    .mob-meta-chip {
      max-width: 36vw;
      padding: 4px 7px;
      font-size: 8px;
    }
    .mob-nav-label {
      font-size: 9px;
      letter-spacing: 0.9px;
    }
  }
</style>
