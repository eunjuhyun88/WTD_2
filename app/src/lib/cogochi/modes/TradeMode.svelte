<script lang="ts">
  import ChartBoard from '../../../components/terminal/workspace/ChartBoard.svelte';
  import Splitter from '../Splitter.svelte';
  import ScanGrid from '../../../components/terminal/peek/ScanGrid.svelte';
  import JudgePanel from '../../../components/terminal/peek/JudgePanel.svelte';
  import { fetchTerminalBundle } from '$lib/api/terminalBackend';
  import type { ChartSeriesPayload } from '$lib/api/terminalBackend';

  interface TabState {
    tradePrompt: string;
    rangeSelection: boolean;
    setupTokens: any;
    verdicts: Record<string, 'agree' | 'disagree'>;
    selectedScan: string;
    scanView: 'grid' | 'list';
    expandedSample: string | null;
    chat: Array<any>;
    peekOpen?: boolean;
    peekHeight?: number;
    drawerTab?: 'analyze' | 'scan' | 'judge';
    layoutMode?: 'A' | 'B' | 'C' | 'D';
    splitY?: number;
  }

  interface Props {
    mode: 'trade' | 'train' | 'flywheel';
    tabState: TabState;
    updateTabState: (updater: (ts: TabState) => TabState) => void;
    symbol?: string;
    timeframe?: string;
  }

  let { mode, tabState, updateTabState, symbol = 'BTCUSDT', timeframe = '4h' }: Props = $props();

  // ── derived from tabState ──
  const layoutMode = $derived(tabState.layoutMode ?? 'D');
  const peekOpen   = $derived(tabState.peekOpen ?? false);
  const drawerTab  = $derived(tabState.drawerTab ?? 'analyze');
  const peekHeight = $derived(tabState.peekHeight ?? 42);
  const splitY     = $derived(tabState.splitY ?? 50);
  const analyzed   = true;

  // ── live chart data ──
  let chartPayload = $state<ChartSeriesPayload | null>(null);
  let change24hPct = $state<number | null>(null);

  $effect(() => {
    const sym = symbol;
    const tf = timeframe;
    let cancelled = false;
    fetchTerminalBundle({ symbol: sym, tf }).then(bundle => {
      if (cancelled) return;
      chartPayload = bundle.chartPayload;
      change24hPct = bundle.analyze?.change24h ?? null;
    }).catch(() => {});
    return () => { cancelled = true; };
  });

  function setLayout(m: 'A' | 'B' | 'C' | 'D') {
    updateTabState(s => ({ ...s, layoutMode: m }));
  }
  function setPeekOpen(v: boolean) {
    updateTabState(s => ({ ...s, peekOpen: v }));
  }
  function setDrawerTab(tab: 'analyze' | 'scan' | 'judge') {
    updateTabState(s => ({ ...s, drawerTab: tab }));
  }
  function setPeekHeight(v: number) {
    updateTabState(s => ({ ...s, peekHeight: Math.max(20, Math.min(82, v)) }));
  }
  function setSplitY(v: number) {
    updateTabState(s => ({ ...s, splitY: Math.max(30, Math.min(72, v)) }));
  }

  // ── peek drag resize ──
  let containerEl: HTMLDivElement | undefined = $state();
  let dragging = $state(false);

  function onResizerDown(e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    const startY = e.clientY;
    const startPct = peekHeight;
    const containerH = containerEl?.getBoundingClientRect().height || 600;

    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY;
      setPeekHeight(startPct + (dy / containerH) * 100);
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

  // ── static evidence / proposal data ──
  const evidenceItems = [
    { k: 'OI 4H',       v: '+18.2%',          note: 'real_dump 확증', pos: true },
    { k: 'Funding',     v: '+0.018 → −0.004', note: '플립 완료',      pos: true },
    { k: 'CVD 15m',     v: '양전환',           note: '기관 매집',      pos: true },
    { k: '번지대',       v: '3h 12m',           note: '기준 만족',      pos: true },
    { k: 'Higher-lows', v: '5/5 bars',         note: 'accum 무결',     pos: true },
    { k: 'BTC regime',  v: 'RANGE',            note: 'ADX 낮음',       pos: false },
  ];

  const proposal = [
    { label: 'ENTRY',  val: '83,700', hint: 'VWAP reclaim', tone: '' },
    { label: 'STOP',   val: '82,800', hint: '−1.08%',       tone: 'neg' },
    { label: 'TARGET', val: '87,500', hint: '+4.54%',        tone: 'pos' },
    { label: 'R:R',    val: '4.2x',   hint: 'hist 3.6',     tone: '' },
  ];

  // ── peek bar tab definitions ──
  const peekTabs = [
    { id: 'analyze', n: '02', label: 'ANALYZE', color: 'var(--pos)',
      summary: 'α82 · 롱 진입 권장 · OI +18% · 번지대 3h12m · BTC RANGE⚠' },
    { id: 'scan',    n: '03', label: 'SCAN',    color: '#7aa2e0',
      summary: '9 candidates · LDO α77 · INJ α73 · FET α70 · past 11W 3L' },
    { id: 'judge',   n: '04', label: 'JUDGE',   color: 'var(--amb)',
      summary: 'entry 83,700 · stop 82,800 · R:R 4.2x · size 1.2%' },
  ] as const;

  const drawerTabs = [
    { id: 'analyze', n: '02', label: 'ANALYZE', color: 'var(--pos)',  desc: '가설·근거' },
    { id: 'scan',    n: '03', label: 'SCAN',    color: '#7aa2e0',     desc: '유사 셋업' },
    { id: 'judge',   n: '04', label: 'JUDGE',   color: 'var(--amb)',  desc: '매매·판정' },
  ] as const;
</script>

<div class="trade-mode">
  <!-- ── Layout tabs ── -->
  <div class="layout-bar">
    <span class="lbl">LAYOUT</span>
    {#each ([
      { id: 'A', name: 'STACK',   desc: '세로 3단',              badge: '' },
      { id: 'B', name: 'DRAWER',  desc: '차트 + 하단 탭',        badge: '' },
      { id: 'C', name: 'SIDEBAR', desc: '차트 + AI 통합',        badge: '' },
      { id: 'D', name: 'PEEK',    desc: '차트 hero + 접이식 peek', badge: 'new' },
    ] as { id: 'A'|'B'|'C'|'D'; name: string; desc: string; badge: string }[]) as lt}
      <button
        class="lt-btn"
        class:active={layoutMode === lt.id}
        onclick={() => setLayout(lt.id)}
      >
        <span class="lt-id">{lt.id}</span>
        <span class="lt-name">{lt.name}</span>
        <span class="lt-desc">· {lt.desc}</span>
        {#if lt.badge}<span class="lt-badge">{lt.badge}</span>{/if}

      </button>
    {/each}
    <span class="spacer"></span>
    <span class="lt-hint">탭 전환해서 비교</span>
  </div>

  <!-- ── Canvas area ── -->
  {#if !analyzed}
    <!-- EMPTY CANVAS -->
    <div class="empty-canvas">
      <div class="empty-inner">
        <div class="empty-step">TRADE CANVAS · EMPTY</div>
        <div class="empty-msg">
          우측 <em class="pos">AI 패널</em>에 셋업을 말로 쓰거나<br/>
          상단 <em class="amb">SELECT RANGE</em>로 차트 구간을 지정하세요.
        </div>
      </div>
    </div>

  {:else if layoutMode === 'A'}
    <!-- ── LAYOUT A · Vertical stack ── -->
    <div class="la-wrap">
      <div class="la-analyze" style:height="{splitY}%">
        <ChartBoard symbol={symbol} tf={timeframe} initialData={chartPayload} contextMode="chart" change24hPct={change24hPct}/>
      </div>
      <Splitter orientation="horizontal" onDrag={(dy) => {
        const h = containerEl?.getBoundingClientRect().height || 700;
        setSplitY(splitY + (dy / h) * 100);
      }}/>
      <div class="la-bottom">
        <div class="la-scan">
          <div class="panel-hd">
            <span class="step-lbl" style:color="#7aa2e0">03</span>
            <span class="panel-title">SIMILAR NOW</span>
            <span class="panel-sub">9 candidates</span>
          </div>
          <div class="panel-body">
            <ScanGrid activeSymbol={symbol} onOpenCapture={(_r: unknown) => {}}/>
          </div>
        </div>
        <div class="la-act">
          <div class="panel-hd">
            <span class="step-lbl" style:color="var(--amb)">04</span>
            <span class="panel-title">ACT & JUDGE</span>
          </div>
          <div class="panel-body">
            <JudgePanel {symbol} {timeframe} entry={83700} stop={82800} target={87500}/>
          </div>
        </div>
      </div>
    </div>

  {:else if layoutMode === 'B'}
    <!-- ── LAYOUT B · Chart + bottom drawer ── -->
    <div class="lb-wrap">
      <div class="lb-chart">
        <div class="chart-hdr">
          <span class="sym">{symbol}</span>
          <span class="tf">{timeframe.toUpperCase()}</span>
          <span class="pat">Tradoor v2</span>
          <span class="spacer"></span>
          {#each ['OI','Funding','CVD','VWAP'] as ind}
            <span class="ind-chip">{ind}</span>
          {/each}
        </div>
        <div class="chart-body-fill">
          <ChartBoard symbol={symbol} tf={timeframe} initialData={chartPayload} contextMode="chart" change24hPct={change24hPct}/>
        </div>
      </div>
      <div class="lb-drawer">
        <div class="drawer-hdr">
          {#each drawerTabs as t}
            <button
              class="dh-tab"
              class:active={drawerTab === t.id}
              style:--tc={t.color}
              onclick={() => setDrawerTab(t.id)}
            >
              <span class="dh-n">{t.n}</span>
              <span class="dh-label">{t.label}</span>
              <span class="dh-desc">· {t.desc}</span>
            </button>
          {/each}
          <span class="spacer"></span>
          <div class="conf-row">
            <span class="conf-lbl">CONFIDENCE</span>
            <div class="conf-bar"><div class="conf-fill" style:width="82%"></div></div>
            <span class="conf-val">82</span>
          </div>
        </div>
        <div class="drawer-content">
          {#if drawerTab === 'analyze'}
            {@render analyzeBody()}
          {:else if drawerTab === 'scan'}
            <ScanGrid activeSymbol={symbol} onOpenCapture={(_r: unknown) => {}}/>
          {:else}
            <JudgePanel {symbol} {timeframe} entry={83700} stop={82800} target={87500}/>
          {/if}
        </div>
      </div>
    </div>

  {:else if layoutMode === 'C'}
    <!-- ── LAYOUT C · Chart + info bar ── -->
    <div class="lc-wrap">
      <div class="lc-chart">
        <div class="chart-hdr">
          <span class="sym">{symbol}</span>
          <span class="tf">{timeframe.toUpperCase()}</span>
          <span class="pat">Tradoor v2</span>
          <span class="spacer"></span>
          {#each ['OI','Funding','CVD','VWAP'] as ind}
            <span class="ind-chip">{ind}</span>
          {/each}
        </div>
        <div class="chart-body-fill">
          <ChartBoard symbol={symbol} tf={timeframe} initialData={chartPayload} contextMode="chart" change24hPct={change24hPct}/>
        </div>
      </div>
      <div class="lc-info">
        <span class="info-tag">ℹ INFO</span>
        <span class="info-msg">
          이 레이아웃은 <strong>우측 AI 패널</strong>에 분석·후보·판정이 모두 들어갑니다.
          AI에 말하면 결과 카드가 AI 패널에 쌓이고, 카드를 클릭하면 차트 위에 오버레이됩니다.
        </span>
        <span class="spacer"></span>
        <span class="info-hint">⌘L toggle AI</span>
      </div>
    </div>

  {:else}
    <!-- ── LAYOUT D · Chart hero + expandable peek ── -->
    <div bind:this={containerEl} class="ld-wrap">
      <div class="ld-chart">
        <!-- chart header -->
        <div class="chart-hdr">
          <span class="sym">{symbol}</span>
          <span class="tf">{timeframe.toUpperCase()}</span>
          <span class="pat">Tradoor v2</span>
          <span class="spacer"></span>
          <div class="ev-badge">
            <span class="ev-lbl">EVIDENCE</span>
            <span class="ev-pos">5</span>
            <span class="ev-sep">/</span>
            <span class="ev-neg">1</span>
          </div>
          <div class="conf-row">
            <span class="conf-lbl">CONFIDENCE</span>
            <div class="conf-bar"><div class="conf-fill" style:width="82%"></div></div>
            <span class="conf-val">82</span>
          </div>
        </div>
        <!-- phase strip -->
        <div class="phase-strip">
          {#each [
            { n: '1', label: 'FAKE' },
            { n: '2', label: 'ARCH' },
            { n: '3', label: 'REAL_DUMP' },
            { n: '4', label: 'ACCUM', active: true },
            { n: '5', label: 'BREAKOUT' },
          ] as p}
            <span class="phase-item" class:active={p.active}>
              {p.n} {p.label}{p.active ? ' ★' : ''}
            </span>
          {/each}
        </div>
        <!-- chart canvas -->
        <div class="chart-body-fill">
          <ChartBoard symbol={symbol} tf={timeframe} initialData={chartPayload} contextMode="chart" change24hPct={change24hPct}/>
        </div>
      </div>

      <!-- PEEK bar -->
      <div class="peek-bar">
        {#each peekTabs as tab}
          <button
            class="pb-tab"
            class:active={drawerTab === tab.id}
            style:--tc={tab.color}
            onclick={() => {
              if (drawerTab === tab.id) setPeekOpen(!peekOpen);
              else { setDrawerTab(tab.id); setPeekOpen(true); }
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

      <!-- PEEK overlay -->
      {#if peekOpen}
        <div class="peek-overlay" style:height="{peekHeight}%">
          <div class="resizer" onmousedown={onResizerDown}>
            <div class="resizer-pill"></div>
          </div>
          <div class="drawer-hdr">
            {#each drawerTabs as t}
              <button
                class="dh-tab"
                class:active={drawerTab === t.id}
                style:--tc={t.color}
                onclick={() => setDrawerTab(t.id)}
              >
                <span class="dh-n">{t.n}</span>
                <span class="dh-label">{t.label}</span>
                <span class="dh-desc">· {t.desc}</span>
              </button>
            {/each}
            <span class="spacer"></span>
            <div class="conf-row small">
              <span class="conf-lbl">CONFIDENCE</span>
              <div class="conf-bar"><div class="conf-fill" style:width="82%"></div></div>
              <span class="conf-val">82</span>
            </div>
          </div>
          <div class="drawer-content">
            {#if drawerTab === 'analyze'}
              {@render analyzeBody()}
            {:else if drawerTab === 'scan'}
              <ScanGrid activeSymbol={symbol} onOpenCapture={(_r: unknown) => {}}/>
            {:else}
              <JudgePanel {symbol} {timeframe} entry={83700} stop={82800} target={87500}/>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- ── shared ANALYZE body snippet ── -->
{#snippet analyzeBody()}
  <div class="analyze-body">
    <div class="analyze-left">
      <p class="narrative">
        <span class="bull">롱 진입 권장 ·</span>
        <code>real_dump</code> 후 <strong>OI +18%</strong>, <strong>번지대 3h 12m</strong> 소화하고
        <strong>accumulation</strong> 진입. Funding 플립 완료, 15m CVD 양전환.
        <span class="warn">BTC RANGE 주의</span> · 과거 같은 조건 <strong>11/14</strong> +3% 이상.
      </p>
      <div class="ev-grid">
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
    <div class="analyze-right">
      <div class="prop-lbl">PROPOSAL</div>
      {#each proposal as p}
        <div class="prop-cell" class:tone-pos={p.tone === 'pos'} class:tone-neg={p.tone === 'neg'}>
          <span class="prop-l">{p.label}</span>
          <span class="prop-v">{p.val}</span>
          <span class="prop-h">{p.hint}</span>
        </div>
      {/each}
    </div>
  </div>
{/snippet}

<style>
  /* ── root ── */
  .trade-mode {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--g0);
    overflow: hidden;
  }

  /* ── layout bar ── */
  .layout-bar {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 4px 10px 0;
    background: var(--g0);
    border-bottom: 1px solid var(--g4);
    flex-shrink: 0;
  }
  .lbl {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    color: var(--g6);
    letter-spacing: 0.2em;
    margin-right: 8px;
  }
  .lt-btn {
    padding: 5px 10px 6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px 3px 0 0;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    margin-right: 1px;
    transition: background 0.1s;
  }
  .lt-btn:hover { background: var(--g2); }
  .lt-btn.active { background: var(--g2); border-color: var(--g4); }
  .lt-id {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    color: var(--g7);
    letter-spacing: 0.1em;
  }
  .lt-btn.active .lt-id { color: var(--amb); }
  .lt-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--g7);
    letter-spacing: 0.08em;
    font-weight: 500;
  }
  .lt-btn.active .lt-name { color: var(--g9); }
  .lt-desc { font-size: 9px; color: var(--g6); font-family: 'Geist', sans-serif; }
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
  .lt-hint { font-family: 'JetBrains Mono', monospace; font-size: 8px; color: var(--g6); }

  /* ── shared ── */
  .spacer { flex: 1; }

  /* ── empty canvas ── */
  .empty-canvas {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--g0);
  }
  .empty-inner { text-align: center; max-width: 520px; padding: 20px; }
  .empty-step {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--g6);
    letter-spacing: 0.24em;
    margin-bottom: 14px;
  }
  .empty-msg {
    font-size: 16px;
    color: var(--g8);
    font-weight: 500;
    line-height: 1.6;
  }
  .empty-msg em.pos { color: var(--pos); font-style: normal; font-family: 'JetBrains Mono', monospace; }
  .empty-msg em.amb { color: var(--amb); font-style: normal; font-family: 'JetBrains Mono', monospace; }

  /* ── shared chart header ── */
  .chart-hdr {
    padding: 8px 14px;
    border-bottom: 1px solid var(--g4);
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--g1);
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
  }
  .sym { font-size: 13px; color: var(--g9); font-weight: 600; }
  .tf  { color: var(--g7); }
  .pat { color: var(--g6); padding: 2px 7px; background: var(--g3); border-radius: 10px; }
  .ind-chip {
    font-size: 9px; color: var(--g8); padding: 2px 7px;
    background: var(--g3); border: 1px solid var(--g4); border-radius: 10px;
  }

  /* evidence badge */
  .ev-badge {
    display: flex; align-items: center; gap: 5px;
    padding: 3px 8px; background: var(--g2); border: 1px solid var(--g4); border-radius: 3px;
  }
  .ev-lbl { font-size: 8px; color: var(--g6); letter-spacing: 0.12em; }
  .ev-pos { font-size: 10px; color: var(--pos); font-weight: 600; }
  .ev-sep { font-size: 9px; color: var(--g5); }
  .ev-neg { font-size: 10px; color: var(--neg); font-weight: 600; }

  /* confidence */
  .conf-row {
    display: flex; align-items: center; gap: 6px;
  }
  .conf-lbl { font-size: 8px; color: var(--g6); letter-spacing: 0.12em; }
  .conf-bar {
    width: 72px; height: 5px; background: var(--g4); border-radius: 2px; overflow: hidden;
  }
  .conf-row.small .conf-bar { width: 52px; height: 4px; }
  .conf-fill { height: 100%; background: var(--pos); border-radius: 2px; }
  .conf-val { font-size: 11px; color: var(--pos); font-weight: 600; width: 22px; text-align: right; }
  .conf-row.small .conf-val { font-size: 10px; }

  /* phase strip */
  .phase-strip {
    display: flex;
    border-bottom: 1px solid var(--g3);
    flex-shrink: 0;
  }
  .phase-item {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g6);
    letter-spacing: 0.1em;
    padding: 5px 12px;
    border-right: 1px solid var(--g3);
    background: transparent;
  }
  .phase-item:last-child { border-right: none; }
  .phase-item.active { color: var(--pos); background: rgba(52, 196, 112, 0.06); }

  /* shared chart body fill */
  .chart-body-fill {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ── Layout A ── */
  .la-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 6px;
    gap: 0;
    overflow: hidden;
    background: var(--g0);
  }
  .la-analyze {
    flex-shrink: 0;
    min-height: 200px;
    background: var(--g1);
    border: 1px solid var(--g4);
    border-radius: 5px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .la-bottom {
    flex: 1;
    display: flex;
    min-height: 0;
    gap: 6px;
    padding-top: 6px;
    overflow: hidden;
  }
  .la-scan, .la-act {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--g1);
    border: 1px solid var(--g4);
    border-radius: 5px;
    overflow: hidden;
  }
  .panel-hd {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border-bottom: 1px solid var(--g4);
    background: var(--g0);
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
  }
  .step-lbl { font-size: 8px; font-weight: 700; letter-spacing: 0.2em; }
  .panel-title { font-size: 10px; color: var(--g9); font-weight: 600; letter-spacing: 0.08em; }
  .panel-sub { font-size: 9px; color: var(--g6); margin-left: 2px; }
  .panel-body { flex: 1; min-height: 0; overflow: hidden; display: flex; }

  /* ── Layout B ── */
  .lb-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 6px;
    gap: 6px;
    overflow: hidden;
    background: var(--g0);
  }
  .lb-chart {
    flex: 2;
    display: flex;
    flex-direction: column;
    min-height: 220px;
    background: var(--g1);
    border: 1px solid var(--g4);
    border-radius: 5px;
    overflow: hidden;
  }
  .lb-drawer {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 200px;
    background: var(--g1);
    border: 1px solid var(--g4);
    border-radius: 5px;
    overflow: hidden;
  }

  /* ── Layout C ── */
  .lc-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 6px;
    gap: 6px;
    overflow: hidden;
    background: var(--g0);
  }
  .lc-chart {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--g1);
    border: 1px solid var(--g4);
    border-radius: 5px;
    overflow: hidden;
  }
  .lc-info {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 14px;
    background: var(--g1);
    border: 1px solid var(--g4);
    border-radius: 4px;
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
  }
  .info-tag { font-size: 9px; color: var(--amb); letter-spacing: 0.18em; }
  .info-msg { font-size: 11px; color: var(--g8); font-family: 'Geist', sans-serif; }
  .info-msg strong { color: var(--g9); }
  .info-hint { font-size: 9px; color: var(--g6); }

  /* ── Layout D ── */
  .ld-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 6px;
    gap: 0;
    overflow: hidden;
    background: var(--g0);
    position: relative;
  }
  .ld-chart {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--g1);
    border: 1px solid var(--g4);
    border-radius: 5px;
    overflow: hidden;
  }

  /* PEEK bar */
  .peek-bar {
    display: flex;
    align-items: stretch;
    height: 28px;
    flex-shrink: 0;
    margin-top: 4px;
    background: var(--g1);
    border: 1px solid var(--g4);
    border-radius: 4px;
    overflow: hidden;
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
    border-left: 1px solid var(--g4);
    border-top: 2px solid transparent;
    cursor: pointer;
    overflow: hidden;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.1s;
  }
  .pb-tab:first-child { border-left: none; }
  .pb-tab.active { background: var(--g2); border-top-color: var(--tc); }
  .pb-n { font-size: 7px; color: var(--g6); letter-spacing: 0.16em; font-weight: 700; flex-shrink: 0; }
  .pb-tab.active .pb-n { color: var(--tc); }
  .pb-label { font-size: 10px; color: var(--g7); font-weight: 600; letter-spacing: 0.08em; flex-shrink: 0; }
  .pb-tab.active .pb-label { color: var(--g9); }
  .pb-summary { font-size: 9px; color: var(--g6); overflow: hidden; text-overflow: ellipsis; }
  .pb-toggle { font-size: 9px; color: var(--g6); flex-shrink: 0; }

  /* PEEK overlay */
  .peek-overlay {
    position: absolute;
    left: 6px;
    right: 6px;
    bottom: 36px;
    background: var(--g1);
    border: 1px solid var(--g4);
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.55);
    animation: peekSlide 0.18s ease-out;
    z-index: 10;
  }
  @keyframes peekSlide {
    from { transform: translateY(16px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  .resizer {
    height: 8px; cursor: ns-resize; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .resizer:hover .resizer-pill { background: var(--g5); }
  .resizer-pill {
    width: 32px; height: 3px; border-radius: 2px; background: var(--g4); transition: background 0.1s;
  }

  /* drawer header (shared by B + D) */
  .drawer-hdr {
    display: flex;
    align-items: stretch;
    background: var(--g0);
    border-bottom: 1px solid var(--g4);
    flex-shrink: 0;
  }
  .dh-tab {
    padding: 7px 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    border-right: 1px solid var(--g4);
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.1s;
  }
  .dh-tab:hover { background: var(--g2); }
  .dh-tab.active { background: var(--g1); border-bottom-color: var(--tc); }
  .dh-n { font-size: 8px; color: var(--g6); letter-spacing: 0.18em; font-weight: 600; }
  .dh-tab.active .dh-n { color: var(--tc); }
  .dh-label { font-size: 11px; color: var(--g7); font-weight: 600; letter-spacing: 0.1em; }
  .dh-tab.active .dh-label { color: var(--g9); }
  .dh-desc { font-size: 10px; color: var(--g6); font-family: 'Geist', sans-serif; }

  /* drawer content */
  .drawer-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    min-height: 0;
  }

  /* ── ANALYZE body ── */
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
    padding: 14px;
    overflow: auto;
    min-width: 0;
    border-right: 1px solid var(--g4);
  }
  .narrative {
    font-family: 'Geist', sans-serif;
    font-size: 12px;
    color: var(--g8);
    line-height: 1.75;
  }
  .narrative .bull { color: var(--pos); font-weight: 600; }
  .narrative code {
    font-family: 'JetBrains Mono', monospace;
    color: var(--g9);
    font-size: 11px;
    padding: 0 4px;
    background: var(--g3);
    border-radius: 2px;
  }
  .narrative strong { color: var(--g9); }
  .narrative .warn {
    color: var(--amb);
    background: var(--amb-dd);
    padding: 1px 6px;
    border-radius: 2px;
    border: 1px solid var(--amb-d);
    font-size: 11px;
  }
  .ev-grid {
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
    border: 1px solid var(--g4);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
  }
  .ev-mark { font-size: 11px; font-weight: 700; }
  .ev-chip.pos .ev-mark { color: var(--pos); }
  .ev-chip.neg .ev-mark { color: var(--neg); }
  .ev-key { font-size: 10px; color: var(--g8); width: 80px; }
  .ev-val { font-size: 11px; color: var(--g9); font-weight: 600; }
  .ev-note { font-size: 10px; color: var(--g6); margin-left: auto; font-family: 'Geist', sans-serif; }

  .analyze-right {
    width: 220px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 14px;
    overflow: hidden;
  }
  .prop-lbl {
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
    padding: 7px 10px;
    background: var(--g0);
    border: 1px solid var(--g4);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
  }
  .prop-l { font-size: 7px; color: var(--g6); letter-spacing: 0.14em; width: 44px; }
  .prop-v { font-size: 14px; color: var(--g9); font-weight: 600; }
  .prop-cell.tone-neg .prop-v { color: var(--neg); }
  .prop-cell.tone-pos .prop-v { color: var(--pos); }
  .prop-h { font-size: 9px; color: var(--g7); margin-left: auto; }
</style>
