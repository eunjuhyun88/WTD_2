<script lang="ts">
  import ScanGrid from '../../../components/terminal/peek/ScanGrid.svelte';
  import JudgePanel from '../../../components/terminal/peek/JudgePanel.svelte';
  import ChartCanvas from '../../../components/terminal/workspace/ChartCanvas.svelte';
  import { fetchTerminalBundle } from '$lib/api/terminalBackend';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
  import type { TabState } from '$lib/cogochi/shell.store';

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
  let chartData = $state<ChartSeriesPayload | null>(null);
  let chartLoading = $state(false);
  let showOI = $state(true);
  let showFunding = $state(true);
  let showCVD = $state(false);
  let showVWAP = $state(false);

  async function loadChart(sym: string, tf: string) {
    chartLoading = true;
    try {
      const bundle = await fetchTerminalBundle({ symbol: sym, tf });
      chartData = bundle.chartPayload;
    } catch {
      chartData = null;
    } finally {
      chartLoading = false;
    }
  }

  $effect(() => { loadChart(symbol, timeframe); });

  const peekOpen = $derived(tabState.peekOpen);
  const drawerTab = $derived(tabState.drawerTab);
  const peekHeight = $derived(tabState.peekHeight);

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
    const startY = e.clientY;
    const startPct = peekHeight;
    const containerH = containerEl?.getBoundingClientRect().height || 600;

    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY;
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

  // Static evidence data (will be driven by pattern engine later)
  const evidenceItems = [
    { k: 'OI 4H', v: '+18.2%', note: 'real_dump 확증', pos: true },
    { k: 'Funding', v: '+0.018 → −0.004', note: '플립 완료', pos: true },
    { k: 'CVD 15m', v: '양전환', note: '기관 매집', pos: true },
    { k: '번지대', v: '3h 12m', note: '기준 만족', pos: true },
    { k: 'Higher-lows', v: '5/5 bars', note: 'accum 무결', pos: true },
    { k: 'BTC regime', v: 'RANGE', note: 'ADX 낮음', pos: false },
  ];

  const proposal = [
    { label: 'ENTRY',  val: '83,700', hint: 'VWAP reclaim', tone: '' },
    { label: 'STOP',   val: '82,800', hint: '−1.08%', tone: 'neg' },
    { label: 'TARGET', val: '87,500', hint: '+4.54%', tone: 'pos' },
    { label: 'R:R',    val: '4.2x',   hint: 'hist 3.6', tone: '' },
  ];
</script>

<div bind:this={containerEl} class="trade-mode">
  <!-- Layout selector -->
  <div class="layout-bar">
    <span class="layout-label">LAYOUT</span>
    {#each [
      { id: 'A', label: 'STACK', desc: '세로 3단' },
      { id: 'B', label: 'DRAWER', desc: '차트 + 하단 탭' },
      { id: 'C', label: 'SIDEBAR', desc: '차트 + AI 통합' },
      { id: 'D', label: 'PEEK', desc: '차트 hero + 접이식 peek', badge: 'new' },
    ] as lt}
      <button class="lt-btn" class:active={lt.id === 'D'}>
        <span class="lt-id">{lt.id}</span>
        <span class="lt-name">{lt.label}</span>
        <span class="lt-desc">· {lt.desc}</span>
        {#if lt.badge}
          <span class="lt-badge">{lt.badge}</span>
        {/if}
      </button>
    {/each}
    <span class="spacer"></span>
    <span class="lt-hint">탭 전환해서 비교</span>
  </div>

  <!-- Chart Hero — fills available space, position:relative for overlay -->
  <div class="chart-section">
    <div class="chart-header">
      <span class="symbol">{symbol}</span>
      <span class="timeframe">{timeframe.toUpperCase()}</span>
      <span class="pattern">Tradoor v2</span>
      <span class="spacer"></span>
      <div class="ind-toggles">
        <span class="ind-label-hdr">INDICATORS</span>
        {#each [
          { id: 'oi',      label: 'OI',      get: () => showOI,      set: (v: boolean) => showOI = v },
          { id: 'funding', label: 'Funding', get: () => showFunding, set: (v: boolean) => showFunding = v },
          { id: 'cvd',     label: 'CVD',     get: () => showCVD,     set: (v: boolean) => showCVD = v },
          { id: 'vwap',    label: 'VWAP',    get: () => showVWAP,    set: (v: boolean) => showVWAP = v },
        ] as tog}
          <button
            class="ind-tog"
            class:active={tog.get()}
            onclick={() => tog.set(!tog.get())}
          >{tog.label}</button>
        {/each}
      </div>
      <div class="evidence-badge">
        <span class="ev-label">EVIDENCE</span>
        <span class="ev-pos">5</span>
        <span class="ev-sep">/</span>
        <span class="ev-neg">1</span>
      </div>
      <div class="conf-inline">
        <span class="conf-label">CONFIDENCE</span>
        <div class="conf-bar">
          <div class="conf-fill" style:width="82%"></div>
        </div>
        <span class="conf-val">82</span>
      </div>
    </div>
    <div class="chart-body">
      <!-- Phase markers -->
      <div class="phase-markers">
        {#each [
          { n: '1', label: 'FAKE' },
          { n: '2', label: 'ARCH' },
          { n: '3', label: 'REAL_DUMP' },
          { n: '4', label: 'ACCUM', active: true },
          { n: '5', label: 'BREAKOUT' },
        ] as phase}
          <span class="phase" class:active={phase.active}>
            {phase.n} {phase.label}{phase.active ? ' ★' : ''}
          </span>
        {/each}
      </div>
      <div class="chart-live">
        {#if chartLoading}
          <div class="chart-loading">loading chart…</div>
        {:else}
          <ChartCanvas {symbol} tf={timeframe} data={chartData} showVolumePane={true} {showOI} {showFunding} {showCVD} />
        {/if}
      </div>
    </div>

    <!-- PEEK bar — always visible at bottom of chart section -->
    <div class="peek-bar">
      {#each [
        { id: 'analyze', n: '02', label: 'ANALYZE', color: 'var(--pos)',
          summary: `α82 · 롱 진입 권장 · OI +18% · 번지대 3h12m` },
        { id: 'scan', n: '03', label: 'SCAN', color: '#7aa2e0',
          summary: `9 candidates · LDO α77 · INJ α73 · FET α70` },
        { id: 'judge', n: '04', label: 'JUDGE', color: 'var(--amb)',
          summary: `entry 83,700 · stop 82,800 · R:R 4.2x · size 1.2%` },
      ] as tab}
        <button
          class="pb-tab"
          class:active={drawerTab === tab.id}
          style:--tc={tab.color}
          onclick={() => {
            if (drawerTab === tab.id) setPeekOpen(!peekOpen);
            else { setDrawerTab(tab.id as any); setPeekOpen(true); }
          }}
        >
          <span class="pb-n">{tab.n}</span>
          <span class="pb-label">{tab.label}</span>
          <span class="pb-summary">{tab.summary}</span>
          <span class="spacer"></span>
          {#if drawerTab === tab.id}
            <span class="pb-toggle">{peekOpen ? '▾ 접기' : '▴ 펼치기'}</span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- PEEK Drawer overlay -->
    {#if peekOpen}
      <div class="peek-overlay" style:height="{peekHeight}%">
        <!-- Resize handle -->
        <div class="resizer" onmousedown={onResizerDown}>
          <div class="resizer-pill"></div>
        </div>

        <!-- Drawer header (tabs) -->
        <div class="drawer-header">
          {#each [
            { id: 'analyze', n: '02', label: 'ANALYZE', color: 'var(--pos)', desc: '가설·근거' },
            { id: 'scan', n: '03', label: 'SCAN', color: '#7aa2e0', desc: '유사 셋업' },
            { id: 'judge', n: '04', label: 'JUDGE', color: 'var(--amb)', desc: '매매·판정' },
          ] as tab}
            <button
              class="dh-tab"
              class:active={drawerTab === tab.id}
              style:--tc={tab.color}
              onclick={() => setDrawerTab(tab.id as any)}
            >
              <span class="dh-n">{tab.n}</span>
              <span class="dh-label">{tab.label}</span>
              <span class="dh-desc">· {tab.desc}</span>
            </button>
          {/each}
          <span class="spacer"></span>
          <div class="conf-inline small">
            <span class="conf-label">CONFIDENCE</span>
            <div class="conf-bar"><div class="conf-fill" style:width="82%"></div></div>
            <span class="conf-val">82</span>
          </div>
        </div>

        <!-- Drawer content -->
        <div class="drawer-content">
          {#if drawerTab === 'analyze'}
            <div class="analyze-body">
              <!-- Left: narrative + evidence chips -->
              <div class="analyze-left">
                <div class="narrative">
                  <span class="bull">롱 진입 권장 ·</span>
                  {' '}<code>real_dump</code> 후 <strong>OI +18%</strong>, <strong>번지대 3h 12m</strong> 소화하고 <strong>accumulation</strong> 진입.
                  {' '}Funding 플립 완료, 15m CVD 양전환.
                  {' '}<span class="warn">BTC RANGE 주의</span> · 과거 같은 조건 <strong>11/14</strong> +3% 이상.
                </div>
                <div class="evidence-grid">
                  {#each evidenceItems as item}
                    <div class="ev-chip" class:pos={item.pos} class:neg={!item.pos}>
                      <span class="ev-mark">{item.pos ? '✓' : '✗'}</span>
                      <span class="ev-key">{item.k}</span>
                      <span class="ev-val">{item.v}</span>
                      <span class="ev-note">{item.note}</span>
                    </div>
                  {/each}
                </div>
              </div>
              <!-- Right: proposal -->
              <div class="analyze-right">
                <div class="proposal-label">PROPOSAL</div>
                {#each proposal as p}
                  <div class="prop-cell" class:tone-pos={p.tone === 'pos'} class:tone-neg={p.tone === 'neg'}>
                    <span class="prop-l">{p.label}</span>
                    <span class="prop-v">{p.val}</span>
                    <span class="prop-h">{p.hint}</span>
                  </div>
                {/each}
              </div>
            </div>
          {:else if drawerTab === 'scan'}
            <ScanGrid
              activeSymbol={symbol}
              onOpenCapture={(_r: unknown) => {}}
            />
          {:else if drawerTab === 'judge'}
            <JudgePanel
              {symbol}
              {timeframe}
              entry={83700}
              stop={82800}
              target={87500}
            />
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .trade-mode {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--g0);
    gap: 0;
    overflow: hidden;
  }

  /* Layout bar */
  .layout-bar {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 4px 10px 0;
    background: var(--g0);
    border-bottom: 0.5px solid var(--g2);
    flex-shrink: 0;
  }
  .layout-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.2em;
    margin-right: 8px;
  }
  .lt-btn {
    padding: 5px 10px 6px;
    background: transparent;
    border: 0.5px solid transparent;
    border-radius: 3px 3px 0 0;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    margin-right: 1px;
  }
  .lt-btn.active {
    background: var(--g1);
    border-color: var(--g3);
  }
  .lt-id {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    color: var(--g6);
    letter-spacing: 0.1em;
  }
  .lt-btn.active .lt-id { color: var(--amb); }
  .lt-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--g6);
    letter-spacing: 0.08em;
    font-weight: 500;
  }
  .lt-btn.active .lt-name { color: var(--g9); }
  .lt-desc { font-size: 9px; color: var(--g5); }
  .lt-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    padding: 1px 5px;
    background: var(--amb);
    color: var(--g0);
    border-radius: 2px;
    letter-spacing: 0.12em;
    font-weight: 700;
  }
  .lt-hint {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.06em;
  }

  /* Chart section */
  .chart-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--g1);
    border: 0.5px solid var(--g3);
    border-radius: 6px;
    margin: 6px;
    overflow: hidden;
    position: relative;
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
    letter-spacing: -0.01em;
  }
  .timeframe { color: var(--g6); }
  .pattern {
    color: var(--g5);
    padding: 2px 6px;
    background: var(--g2);
    border-radius: 10px;
  }
  .spacer { flex: 1; }

  .ind-toggles {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .ind-label-hdr {
    color: var(--g4);
    font-size: 7px;
    letter-spacing: 0.1em;
    margin-right: 2px;
  }
  .ind-tog {
    padding: 2px 7px;
    border: 0.5px solid var(--g3);
    border-radius: 3px;
    background: transparent;
    color: var(--g5);
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .ind-tog:hover { border-color: var(--g5); color: var(--g7); }
  .ind-tog.active {
    background: rgba(122,162,224,0.12);
    border-color: #7aa2e0;
    color: #7aa2e0;
  }

  .evidence-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    background: var(--g2);
    border-radius: 3px;
  }
  .ev-label {
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.12em;
  }
  .ev-pos { font-size: 10px; color: var(--pos); font-weight: 600; }
  .ev-sep { font-size: 9px; color: var(--g4); }
  .ev-neg { font-size: 10px; color: var(--neg); font-weight: 600; }

  .conf-inline {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .conf-label {
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.12em;
  }
  .conf-bar {
    width: 72px;
    height: 5px;
    background: var(--g3);
    border-radius: 2px;
    overflow: hidden;
  }
  .conf-inline.small .conf-bar { width: 60px; height: 4px; }
  .conf-fill { height: 100%; background: var(--pos); border-radius: 2px; }
  .conf-val {
    font-size: 11px;
    color: var(--pos);
    font-weight: 600;
    width: 22px;
    text-align: right;
  }
  .conf-inline.small .conf-val { font-size: 10px; }

  .chart-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .phase-markers {
    display: flex;
    gap: 0;
    padding: 6px 14px;
    border-bottom: 0.5px solid var(--g2);
    flex-shrink: 0;
  }
  .phase {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.1em;
    padding: 2px 10px;
    border-right: 0.5px solid var(--g2);
  }
  .phase:last-child { border-right: none; }
  .phase.active {
    color: var(--pos);
    background: rgba(52, 196, 112, 0.06);
  }
  .chart-live {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .chart-loading {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--g4);
    font-size: 11px;
  }

  /* PEEK bar */
  .peek-bar {
    display: flex;
    align-items: stretch;
    height: 26px;
    flex-shrink: 0;
    background: var(--g1);
    border-top: 0.5px solid var(--g3);
  }
  .pb-tab {
    flex: 1;
    min-width: 0;
    padding: 0 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    border-left: 0.5px solid var(--g3);
    border-top: 1.5px solid transparent;
    cursor: pointer;
    overflow: hidden;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.1s;
  }
  .pb-tab:first-child { border-left: none; }
  .pb-tab.active {
    background: var(--g2);
    border-top-color: var(--tc);
  }
  .pb-n {
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.16em;
    font-weight: 700;
    flex-shrink: 0;
  }
  .pb-tab.active .pb-n { color: var(--tc); }
  .pb-label {
    font-size: 10px;
    color: var(--g7);
    font-weight: 600;
    letter-spacing: 0.08em;
    flex-shrink: 0;
  }
  .pb-tab.active .pb-label { color: var(--g9); }
  .pb-summary {
    font-size: 9px;
    color: var(--g6);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pb-toggle {
    font-size: 9px;
    color: var(--g5);
    flex-shrink: 0;
  }

  /* PEEK overlay */
  .peek-overlay {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 26px; /* height of peek-bar */
    background: var(--g1);
    border-top: 0.5px solid var(--g3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 -12px 40px rgba(0,0,0,0.5);
    animation: peekSlide 0.18s ease-out;
    z-index: 10;
  }

  @keyframes peekSlide {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .resizer {
    height: 8px;
    cursor: ns-resize;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
  }
  .resizer:hover .resizer-pill { background: var(--g4); }
  .resizer-pill {
    width: 32px;
    height: 3px;
    border-radius: 2px;
    background: var(--g3);
    opacity: 0.7;
    transition: background 0.1s;
  }

  /* Drawer header */
  .drawer-header {
    display: flex;
    align-items: stretch;
    background: var(--g0);
    border-bottom: 0.5px solid var(--g3);
    flex-shrink: 0;
  }
  .dh-tab {
    padding: 7px 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    border-right: 0.5px solid var(--g3);
    border-bottom: 1.5px solid transparent;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
  }
  .dh-tab.active {
    background: var(--g1);
    border-bottom-color: var(--tc);
  }
  .dh-n {
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.18em;
    font-weight: 600;
  }
  .dh-tab.active .dh-n { color: var(--tc); }
  .dh-label {
    font-size: 11px;
    color: var(--g7);
    font-weight: 600;
    letter-spacing: 0.1em;
  }
  .dh-tab.active .dh-label { color: var(--g9); }
  .dh-desc { font-size: 10px; color: var(--g5); font-family: 'Geist', sans-serif; }

  /* Drawer content */
  .drawer-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    min-height: 0;
  }

  /* ANALYZE body */
  .analyze-body {
    flex: 1;
    display: flex;
    gap: 0;
    overflow: hidden;
    min-height: 0;
  }
  .analyze-left {
    flex: 1.3;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    overflow: auto;
    min-width: 0;
    border-right: 0.5px solid var(--g3);
  }
  .narrative {
    font-family: 'Geist', sans-serif;
    font-size: 12px;
    color: var(--g8);
    line-height: 1.7;
  }
  .narrative .bull { color: var(--pos); font-weight: 600; }
  .narrative code {
    font-family: 'JetBrains Mono', monospace;
    color: var(--g9);
    font-size: 11px;
    padding: 0 3px;
    background: var(--g2);
    border-radius: 2px;
  }
  .narrative strong { color: var(--g9); }
  .narrative .warn {
    color: var(--amb);
    background: var(--amb-dd);
    padding: 1px 6px;
    border-radius: 2px;
    border: 0.5px solid var(--amb-d);
    font-size: 11px;
  }
  .evidence-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
  }
  .ev-chip {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 5px 10px;
    background: var(--g0);
    border: 0.5px solid var(--g3);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
  }
  .ev-mark { font-size: 11px; font-weight: 700; }
  .ev-chip.pos .ev-mark { color: var(--pos); }
  .ev-chip.neg .ev-mark { color: var(--neg); }
  .ev-key { font-size: 10px; color: var(--g7); width: 80px; }
  .ev-val { font-size: 11px; color: var(--g9); font-weight: 600; }
  .ev-note { font-size: 10px; color: var(--g5); margin-left: auto; font-family: 'Geist', sans-serif; }

  .analyze-right {
    width: 240px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 12px 14px;
    overflow: hidden;
  }
  .proposal-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    color: var(--amb);
    letter-spacing: 0.2em;
    margin-bottom: 2px;
  }
  .prop-cell {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 10px;
    background: var(--g0);
    border: 0.5px solid var(--g3);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
  }
  .prop-l { font-size: 7px; color: var(--g5); letter-spacing: 0.14em; width: 44px; }
  .prop-v { font-size: 14px; color: var(--g9); font-weight: 600; }
  .prop-cell.tone-neg .prop-v { color: var(--neg); }
  .prop-cell.tone-pos .prop-v { color: var(--pos); }
  .prop-h { font-size: 9px; color: var(--g6); margin-left: auto; }
</style>
