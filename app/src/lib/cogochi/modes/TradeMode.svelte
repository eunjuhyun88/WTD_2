<script lang="ts">
  import ScanGrid from '$lib/components/terminal/peek/ScanGrid.svelte';
  import JudgePanel from '$lib/components/terminal/peek/JudgePanel.svelte';
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';

  interface TabState {
    tradePrompt: string;
    rangeSelection: boolean;
    setupTokens: any;
    verdicts: Record<string, string>;
    selectedScan: string;
    scanView: 'grid' | 'list';
    expandedSample: string | null;
    chat: Array<any>;
    peekOpen?: boolean;
    peekHeight?: number;
    drawerTab?: 'analyze' | 'scan' | 'judge';
  }

  interface Props {
    mode: 'trade' | 'train' | 'flywheel';
    tabState: TabState;
    updateTabState: (updater: (ts: TabState) => TabState) => void;
    symbol?: string;
    timeframe?: string;
  }

  let { mode, tabState, updateTabState, symbol = 'BTCUSDT', timeframe = '4h' }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let dragging = $state(false);
  let dragStart = $state(0);

  const peekOpen = $derived(tabState.peekOpen ?? false);
  const drawerTab = $derived(tabState.drawerTab || 'analyze');
  const peekHeight = $derived(tabState.peekHeight ?? 42);

  function setPeekOpen(v: boolean) {
    updateTabState(s => ({ ...s, peekOpen: v }));
  }

  function setDrawerTab(tab: 'analyze' | 'scan' | 'judge') {
    updateTabState(s => ({ ...s, drawerTab: tab }));
  }

  function setPeekHeight(v: number) {
    const clamped = Math.max(20, Math.min(82, v));
    updateTabState(s => ({ ...s, peekHeight: clamped }));
  }

  function onResizerDown(e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    dragStart = e.clientY;
    const startPct = peekHeight;
    const containerH = containerEl?.getBoundingClientRect().height || 600;

    const onMove = (ev: MouseEvent) => {
      const dy = dragStart - ev.clientY;
      const dPct = (dy / containerH) * 100;
      setPeekHeight(startPct + dPct);
    };

    const onUp = () => {
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }
</script>

<div bind:this={containerEl} class="trade-mode">
  <!-- Chart Hero — fills available space -->
  <div class="chart-section">
    <div class="chart-header">
      <span class="symbol">{symbol}</span>
      <span class="timeframe">{timeframe.toUpperCase()}</span>
      <span class="pattern">Tradoor v2</span>
      <span class="spacer"></span>
      <span class="indicators-label">INDICATORS</span>
      {#each ['OI', 'Funding', 'CVD', 'VWAP'] as ind}
        <span class="indicator">{ind}</span>
      {/each}
    </div>
    <div class="chart-body">
      <div style="flex:1; display:flex; align-items:center; justify-content:center; color:var(--g5)">
        Chart content (integration ready)
      </div>
    </div>
  </div>

  <!-- PEEK Bar — always visible, shows current drawerTab and peek state -->
  <div class="peek-bar">
    <div class="peek-tabs">
      {#each [
        { id: 'analyze', n: '02', label: 'ANALYZE', color: 'var(--pos)', desc: '가설·근거' },
        { id: 'scan', n: '03', label: 'SCAN', color: '#7aa2e0', desc: '유사 셋업' },
        { id: 'judge', n: '04', label: 'JUDGE', color: 'var(--amb)', desc: '매매·판정' },
      ] as tab}
        <button
          class="peek-tab"
          class:active={drawerTab === tab.id}
          style:--tab-color={tab.color}
          onclick={() => setDrawerTab(tab.id)}
        >
          <span class="tab-n">{tab.n}</span>
          <span class="tab-label">{tab.label}</span>
          <span class="tab-desc">· {tab.desc}</span>
        </button>
      {/each}
      <span class="spacer"></span>
      <div class="confidence">
        <span class="conf-label">CONFIDENCE</span>
        <div class="conf-bar">
          <div class="conf-fill" style:width="82%"></div>
        </div>
        <span class="conf-value">82</span>
      </div>
    </div>
    <button class="peek-toggle" onclick={() => setPeekOpen(!peekOpen)}>
      {peekOpen ? '▾' : '▴'} {peekOpen ? 'CLOSE' : 'OPEN'}
    </button>
  </div>

  <!-- PEEK Drawer — expandable, contains Analyze/Scan/Judge tabs -->
  {#if peekOpen}
    <div class="peek-drawer" style:height={`${peekHeight}%`}>
      <div class="resizer" onmousedown={onResizerDown}></div>
      <div class="drawer-content">
        {#if drawerTab === 'analyze'}
          <div class="drawer-section">
            <div class="analysis-text">
              <span class="accent-bull">롱 진입 권장 ·</span>
              <span class="code">real_dump</span> 후 <strong>OI +18%</strong>, <strong>번지대 3h 12m</strong> 소화하고 <strong>accumulation</strong> 진입.
              Funding 플립 완료, 15m CVD 양전환.
            </div>
          </div>
        {:else if drawerTab === 'scan'}
          <ScanGrid
            activeSymbol={symbol}
            onOpenCapture={(r) => {}}
          />
        {:else if drawerTab === 'judge'}
          <JudgePanel
            {symbol}
            {timeframe}
          />
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .trade-mode {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--g0);
    padding: 6px;
    gap: 6px;
    overflow: hidden;
  }

  .chart-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--g1);
    border: 0.5px solid var(--g3);
    border-radius: 6px;
    overflow: hidden;
  }

  .chart-header {
    padding: 8px 14px;
    border-bottom: 0.5px solid var(--g3);
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--g0);
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
  }

  .symbol {
    font-size: 13px;
    color: var(--g9);
    font-weight: 600;
  }

  .timeframe {
    color: var(--g6);
  }

  .pattern {
    color: var(--g5);
    padding: 2px 6px;
    background: var(--g2);
    border-radius: 10px;
  }

  .spacer {
    flex: 1;
  }

  .indicators-label {
    color: var(--g5);
    letter-spacing: 0.14em;
  }

  .indicator {
    color: var(--g8);
    padding: 2px 7px;
    background: var(--g2);
    border: 0.5px solid var(--g3);
    border-radius: 10px;
    letter-spacing: 0.06em;
  }

  .chart-body {
    flex: 1;
    padding: 10px 14px;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }

  .peek-bar {
    display: flex;
    align-items: stretch;
    background: var(--g0);
    border-bottom: 0.5px solid var(--g2);
    gap: 10px;
    padding: 0 10px;
    flex-shrink: 0;
  }

  .peek-tabs {
    display: flex;
    align-items: stretch;
    flex: 1;
    gap: 0;
  }

  .peek-tab {
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    background: transparent;
    border: none;
    border-right: 0.5px solid var(--g3);
    border-bottom: 1.5px solid transparent;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
  }

  .peek-tab.active {
    background: var(--g1);
    border-bottom-color: var(--tab-color);
  }

  .tab-n {
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.18em;
    color: var(--g5);
  }

  .peek-tab.active .tab-n {
    color: var(--tab-color);
  }

  .tab-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: var(--g7);
  }

  .peek-tab.active .tab-label {
    color: var(--g9);
  }

  .tab-desc {
    font-size: 10px;
    color: var(--g5);
    font-family: 'Geist', sans-serif;
  }

  .confidence {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-bottom: 0.5px solid var(--g3);
  }

  .conf-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.12em;
  }

  .conf-bar {
    width: 60px;
    height: 4px;
    background: var(--g3);
    border-radius: 2px;
    overflow: hidden;
  }

  .conf-fill {
    height: 100%;
    background: var(--pos);
  }

  .conf-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--pos);
    font-weight: 600;
  }

  .peek-toggle {
    padding: 6px 12px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g6);
    background: transparent;
    border: none;
    cursor: pointer;
    letter-spacing: 0.1em;
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .peek-drawer {
    display: flex;
    flex-direction: column;
    background: var(--g1);
    border: 0.5px solid var(--g3);
    border-radius: 6px;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  .resizer {
    height: 2px;
    background: transparent;
    cursor: ns-resize;
    flex-shrink: 0;
  }

  .resizer:hover {
    background: var(--g3);
  }

  .drawer-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    font-size: 12px;
    color: var(--g8);
  }

  .drawer-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px;
    overflow: auto;
    flex: 1;
  }

  .analysis-text {
    font-family: 'Geist', sans-serif;
    line-height: 1.7;
  }

  .accent-bull {
    color: var(--pos);
    font-weight: 600;
  }

  .code {
    font-family: 'JetBrains Mono', monospace;
    color: var(--g9);
    font-size: 11px;
    padding: 0 3px;
    background: var(--g2);
    border-radius: 2px;
  }
</style>
