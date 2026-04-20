<script lang="ts">
  import PhaseChart from '../PhaseChart.svelte';
  import type { TabState } from '$lib/cogochi/shell.store';
  import { shellStore } from '$lib/cogochi/shell.store';

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
  let showOI = $state(true);
  let showFunding = $state(true);
  let showCVD = $state(true);

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

  // ── analyzed: shows chart+PEEK only after setup is applied ──────────────
  const analyzed = $derived(!!(tabState.tradePrompt || tabState.rangeSelection));

  // ── JUDGE state (trade_act.jsx ActPanel) ────────────────────────────────
  let judgeVerdict = $state<'agree' | 'disagree' | null>(null);
  let judgeOutcome = $state<'win' | 'loss' | 'flat' | null>(null);
  let judgeRejudged = $state<'right' | 'wrong' | null>(null);

  // ── SCAN state (trade_scan.jsx ScanPanel) ────────────────────────────────
  let scanSelected = $state('a8');
  const scanCandidates = [
    { id: 'a8',  symbol: 'LDOUSDT', tf: '1H', pattern: 'OI +14% · accum',   phase: 4, alpha: 77, age: '08:12', sim: 0.91, dir: 'long' },
    { id: 'a9',  symbol: 'INJUSDT', tf: '4H', pattern: '번지대 4h · CVD 양', phase: 4, alpha: 73, age: '07:48', sim: 0.88, dir: 'long' },
    { id: 'a10', symbol: 'FETUSDT', tf: '1H', pattern: 'Higher lows 6/6',   phase: 4, alpha: 70, age: '07:22', sim: 0.84, dir: 'long' },
    { id: 'a11', symbol: 'SEIUSDT', tf: '1H', pattern: 'Funding flip',      phase: 3, alpha: 64, age: '06:58', sim: 0.79, dir: 'long' },
    { id: 'a12', symbol: 'BNXUSDT', tf: '4H', pattern: 'OI spike accum',   phase: 4, alpha: 61, age: '06:30', sim: 0.75, dir: 'long' },
  ];

  // ── Static evidence data (will be driven by pattern engine later)
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
  {#if !analyzed}
    <!-- Empty canvas — shown until AI panel "RUN →" or SELECT RANGE -->
    <div class="empty-canvas">
      <div class="ec-inner">
        <div class="ec-logo mono">COGOCHI</div>
        <div class="ec-tagline">Core Loop · 트레이딩 사고의 운영체제</div>
        <div class="ec-divider"></div>
        <div class="ec-cta-group">
          <div class="ec-label mono">셋업을 시작하세요</div>
          <div class="ec-options">
            <div class="ec-opt">
              <span class="ec-opt-key">AI ›</span>
              <span class="ec-opt-txt">오른쪽 패널에 셋업을 말로 설명 → RUN</span>
            </div>
            <div class="ec-opt">
              <span class="ec-opt-key">SELECT RANGE</span>
              <span class="ec-opt-txt">상단 커맨드바에서 차트 구간 선택</span>
            </div>
          </div>
        </div>
        <div class="ec-quick-grid">
          {#each [
            { label: 'OI 급증 + 번지대', sub: 'accumulation' },
            { label: 'VWAP reclaim', sub: 'CVD 양전환' },
            { label: 'Funding flip', sub: 'higher-lows' },
            { label: 'BB squeeze 해제', sub: '15m breakout' },
          ] as q}
            <button class="ec-quick" onclick={() => shellStore.toggleAI()}>
              <span class="eq-label">{q.label}</span>
              <span class="eq-sub">{q.sub}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {:else}
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
      <div class="chart-live">
        <PhaseChart
          height="100%"
          highlightPhase={4}
          showEntry={true}
          showRange={tabState.rangeSelection}
          showIndicators={true}
          {showOI}
          {showFunding}
          {showCVD}
        />
      </div>
    </div>

    <!-- PEEK bar — always visible at bottom of chart section -->
    <div class="peek-bar">
      {#each [
        { id: 'analyze', n: '02', label: 'ANALYZE', color: 'var(--pos)',    badge: 'α82', badgeColor: 'var(--pos)' },
        { id: 'scan',    n: '03', label: 'SCAN',    color: '#7aa2e0',       badge: '5',   badgeColor: '#7aa2e0' },
        { id: 'judge',   n: '04', label: 'JUDGE',   color: 'var(--amb)',    badge: 'R:R 4.2×', badgeColor: 'var(--amb)' },
      ] as tab}
        <button
          class="pb-tab"
          class:active={drawerTab === tab.id && peekOpen}
          style:--tc={tab.color}
          onclick={() => {
            if (drawerTab === tab.id) setPeekOpen(!peekOpen);
            else { setDrawerTab(tab.id as any); setPeekOpen(true); }
          }}
        >
          <span class="pb-n">{tab.n}</span>
          <span class="pb-label">{tab.label}</span>
          <span class="pb-sep">·</span>
          {#if tab.id === 'analyze'}
            <span class="pb-val pos">α82</span>
            <span class="pb-sep">·</span>
            <span class="pb-txt">롱 진입 권장</span>
            <span class="pb-sep">·</span>
            <span class="pb-dim">OI +18% · 번지대 3h12m</span>
            <span class="pb-sep">·</span>
            <span class="pb-warn">BTC RANGE⚠</span>
          {:else if tab.id === 'scan'}
            <span class="pb-val" style:color="#7aa2e0">9 candidates</span>
            <span class="pb-sep">·</span>
            <span class="pb-dim">LDO α77 · INJ α73 · FET α70</span>
            <span class="pb-sep">·</span>
            <span class="pb-val pos">past 11W 3L +3.4%</span>
          {:else if tab.id === 'judge'}
            <span class="pb-txt">entry <span class="pb-val">83,700</span></span>
            <span class="pb-sep">·</span>
            <span class="pb-txt">stop <span class="pb-val neg">82,800</span></span>
            <span class="pb-sep">·</span>
            <span class="pb-txt">R:R <span class="pb-val pos">4.2×</span></span>
            <span class="pb-sep">·</span>
            <span class="pb-txt">size <span class="pb-val">1.2%</span></span>
          {/if}
          <span class="spacer"></span>
          <span class="pb-chevron">{(drawerTab === tab.id && peekOpen) ? '▾' : '▸'}</span>
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
            <!-- trade_scan.jsx ScanPanel (WideGridView) -->
            <div class="scan-panel">
              <div class="scan-header">
                <span class="scan-step">03</span>
                <span class="scan-label">SIMILAR NOW</span>
                <span class="scan-title">{scanCandidates.length} candidates</span>
                <span class="spacer"></span>
                <span class="scan-meta">matching hypothesis · 300 sym · 14s</span>
                <span class="scan-sort-label">SORT</span>
                <span class="scan-sort-btn">similarity ▾</span>
              </div>
              <div class="scan-grid">
                {#each scanCandidates as x}
                  {@const sc = x.alpha >= 75 ? 'var(--pos)' : x.alpha >= 60 ? 'var(--amb)' : 'var(--g7)'}
                  <button
                    class="scan-card"
                    class:active={scanSelected === x.id}
                    style:--sc={sc}
                    onclick={() => scanSelected = x.id}
                  >
                    <div class="sc-top">
                      <span class="sc-sym">{x.symbol.replace('USDT', '')}</span>
                      <span class="sc-tf">{x.tf}</span>
                      <span class="spacer"></span>
                      <span class="sc-alpha" style:color={sc}>α{x.alpha}</span>
                    </div>
                    <svg viewBox="0 0 180 48" preserveAspectRatio="none" class="sc-minichart">
                      {@html (() => {
                        const pts: [number,number][] = [[0,14],[8,22],[16,30],[24,38],[32,32],[40,36],[48,40],[56,44],[64,52],[72,48],[80,44],[88,42],[96,40],[104,38],[112,36],[120,34],[128,30],[136,28],[144,26],[152,22],[160,18],[168,14],[176,10],[180,8]];
                        const str = pts.map(([px,py],i) => `${i===0?'M':'L'}${px},${py+4}`).join(' ');
                        const nowX = x.phase===3?72 : x.phase===4?128 : x.phase===5?170 : 40;
                        const nowY = (pts.find(p=>p[0]>=nowX)?.[1]??30)+4;
                        return `<rect x="${nowX-8}" y="0" width="16" height="48" fill="${x.alpha>=75?'var(--pos)':x.alpha>=60?'var(--amb)':'var(--g7)'}" opacity="0.08"/><path d="${str} L180,52 L0,52 Z" fill="${x.alpha>=75?'var(--pos)':x.alpha>=60?'var(--amb)':'var(--g7)'}" opacity="0.05"/><path d="${str}" fill="none" stroke="var(--g6)" stroke-width="1"/><line x1="${nowX}" y1="0" x2="${nowX}" y2="48" stroke="${x.alpha>=75?'var(--pos)':x.alpha>=60?'var(--amb)':'var(--g7)'}" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.7"/><circle cx="${nowX}" cy="${nowY}" r="2.5" fill="${x.alpha>=75?'var(--pos)':x.alpha>=60?'var(--amb)':'var(--g7)'}"/>`;
                      })()}
                    </svg>
                    <div class="sc-sim-row">
                      <div class="sc-sim-bar"><div class="sc-sim-fill" style:width="{x.sim * 100}%" style:background={sc}></div></div>
                      <span class="sc-sim-pct">{Math.round(x.sim * 100)}%</span>
                    </div>
                    <div class="sc-pattern">{x.pattern}</div>
                    <div class="sc-age">{x.age}</div>
                  </button>
                {/each}
              </div>
              <div class="past-strip">
                <div class="past-header">
                  <span class="past-title">★ PAST · 14 similar</span>
                  <span class="past-sep">│</span>
                  <span class="past-win">11W</span>
                  <span class="past-loss">3L</span>
                  <span class="past-avg">avg win +3.4%</span>
                  <span class="spacer"></span>
                  <span class="past-hint">클릭 → 차트로 보기</span>
                </div>
                <div class="past-cards">
                  {#each [
                    { sym:'TRADOOR', when:'2024-11-12', sim:94, pnl:+6.2 },
                    { sym:'PTB',     when:'2025-01-03', sim:91, pnl:+2.1 },
                    { sym:'JUP',     when:'2025-02-18', sim:88, pnl:-1.4 },
                    { sym:'ARB',     when:'2025-03-11', sim:86, pnl:+4.7 },
                    { sym:'AVAX',    when:'2025-04-02', sim:83, pnl:+1.8 },
                    { sym:'SUI',     when:'2025-05-19', sim:80, pnl:+3.3 },
                    { sym:'ONDO',    when:'2025-06-24', sim:78, pnl:-0.6 },
                    { sym:'WIF',     when:'2025-07-08', sim:76, pnl:+2.9 },
                  ] as s}
                    <button class="past-card">
                      <span class="past-sym">{s.sym}</span>
                      <span class="past-pnl" style:color={s.pnl>=0 ? 'var(--pos)' : 'var(--neg)'}>{s.pnl>=0?'+':''}{s.pnl.toFixed(1)}%</span>
                      <span class="past-sim">{s.sim}%</span>
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          {:else if drawerTab === 'judge'}
            <!-- trade_act.jsx ActPanel: A(Plan) + B(Judge Now) + C(After Result) -->
            <div class="act-panel">
              <!-- Header -->
              <div class="act-header">
                <span class="act-step">STEP 04 · ACT & JUDGE</span>
                <span class="act-div"></span>
                <span class="act-sym">{symbol}</span>
                <span class="act-tf">{timeframe.toUpperCase()}</span>
                <span class="act-dir">LONG</span>
                <span class="act-pat">OI reversal · accumulation</span>
                <span class="spacer"></span>
                <span class="act-alpha">α82</span>
              </div>
              <div class="act-cols">
                <!-- A: Trade Plan -->
                <div class="act-col plan-col">
                  <div class="col-label">A · TRADE PLAN</div>
                  <div class="lvl-row">
                    {#each [
                      { label: 'entry',  val: '83,700', color: 'var(--g9)' },
                      { label: 'stop',   val: '82,800', color: 'var(--neg)' },
                      { label: 'target', val: '87,500', color: 'var(--pos)' },
                      { label: 'R:R',    val: '4.2x',   color: 'var(--g9)', hint: 'hist 3.6' },
                    ] as lvl}
                      <div class="lvl-cell">
                        <div class="lvl-label">{lvl.label}</div>
                        <div class="lvl-val" style:color={lvl.color}>{lvl.val}</div>
                        {#if lvl.hint}<div class="lvl-hint">{lvl.hint}</div>{/if}
                      </div>
                    {/each}
                  </div>
                  <div class="rr-size-row">
                    <div class="rr-box">
                      <div class="rr-box-label">RISK:REWARD</div>
                      <div class="rr-bar">
                        <div class="rr-loss" style:width="19%"></div>
                        <div class="rr-gain" style:width="81%"></div>
                      </div>
                      <div class="rr-labels"><span class="rr-r">1R</span><span class="rr-g">4.2R</span></div>
                    </div>
                    <div class="size-box">
                      <div class="size-label">SIZE · 3x lev</div>
                      <div class="size-val">1.2% <span class="size-usd">$1,200</span></div>
                    </div>
                  </div>
                  <button class="exchange-btn">OPEN IN EXCHANGE ↗</button>
                </div>

                <div class="act-divider"></div>

                <!-- B: Judge Now -->
                <div class="act-col judge-col">
                  <div class="judge-head">
                    <span class="col-label">B · JUDGE NOW</span>
                    <span class="judge-q">이 셋업, <strong>내 돈을 걸만한가?</strong></span>
                  </div>
                  <div class="judge-btns">
                    <button
                      class="judge-btn agree"
                      class:active={judgeVerdict === 'agree'}
                      onclick={() => judgeVerdict = 'agree'}
                    >
                      <span class="jb-key">Y</span>
                      <div class="jb-text"><span class="jb-label">AGREE</span><span class="jb-sub">진입</span></div>
                    </button>
                    <button
                      class="judge-btn disagree"
                      class:active={judgeVerdict === 'disagree'}
                      onclick={() => judgeVerdict = 'disagree'}
                    >
                      <span class="jb-key">N</span>
                      <div class="jb-text"><span class="jb-label">DISAGREE</span><span class="jb-sub">패스</span></div>
                    </button>
                  </div>
                  <div class="judge-tags">
                    {#each ['확증부족', 'R:R낮음', 'regime안맞음', 'FOMO', '크기초과'] as tag}
                      <span class="judge-tag">{tag}</span>
                    {/each}
                  </div>
                </div>

                <div class="act-divider"></div>

                <!-- C: After Result -->
                <div class="act-col after-col">
                  <div class="col-label">C · AFTER RESULT</div>
                  <div class="outcome-row">
                    {#each [
                      { k: 'win',  l: 'WIN',  c: 'var(--pos)', bg: 'var(--pos-dd)' },
                      { k: 'loss', l: 'LOSS', c: 'var(--neg)', bg: 'var(--neg-dd)' },
                      { k: 'flat', l: 'FLAT', c: 'var(--g7)',  bg: 'var(--g2)' },
                    ] as o}
                      <button
                        class="outcome-btn"
                        class:active={judgeOutcome === o.k}
                        style:--oc={o.c}
                        style:--obg={o.bg}
                        onclick={() => { judgeOutcome = o.k as any; judgeRejudged = null; }}
                      >{o.l}</button>
                    {/each}
                  </div>
                  {#if judgeOutcome}
                    <div class="result-row">
                      <span class="result-label">RESULT</span>
                      <span class="result-val" style:color={judgeOutcome === 'win' ? 'var(--pos)' : judgeOutcome === 'loss' ? 'var(--neg)' : 'var(--g7)'}>
                        {judgeOutcome === 'win' ? '+3.4%' : judgeOutcome === 'loss' ? '−1.1%' : '+0.1%'}
                      </span>
                      <span class="spacer"></span>
                      <span class="result-hint">
                        {judgeOutcome === 'win' ? 'target · 2h 14m' : judgeOutcome === 'loss' ? 'stop · 42m' : 'flat · 6h'}
                      </span>
                    </div>
                    <div class="rejudge-label">REJUDGE</div>
                    <div class="rejudge-btns">
                      <button class="rj-btn rj-pos" class:active={judgeRejudged === 'right'} onclick={() => judgeRejudged = 'right'}>
                        옳았다 <span class="rj-sub">+보강</span>
                      </button>
                      <button class="rj-btn rj-neg" class:active={judgeRejudged === 'wrong'} onclick={() => judgeRejudged = 'wrong'}>
                        틀렸다 <span class="rj-sub">뒤집기</span>
                      </button>
                    </div>
                    {#if judgeVerdict && judgeRejudged}
                      {@const consistent = (judgeVerdict === 'agree' && judgeRejudged === 'right') || (judgeVerdict === 'disagree' && judgeRejudged === 'wrong')}
                      <div class="bias-box" class:bias-good={consistent} class:bias-warn={!consistent}>
                        {#if consistent}
                          <strong>✓ 일관 판정</strong> <span>· 가중치 +0.04</span>
                        {:else}
                          <strong>⚑ 편향 감지</strong> <span>· Train 권장</span>
                        {/if}
                      </div>
                    {/if}
                  {:else}
                    <div class="after-empty">매매 결과 선택시<br>재판정 가능</div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
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
    gap: 0;
    overflow: hidden;
  }

  /* ── Empty canvas ── */
  .empty-canvas {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--g0);
    min-height: 0;
  }
  .ec-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    width: 440px;
    max-width: 90vw;
  }
  .ec-logo {
    font-size: 13px;
    color: var(--g5);
    letter-spacing: 0.32em;
  }
  .ec-tagline {
    font-size: 11px;
    color: var(--g6);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.08em;
    text-align: center;
  }
  .ec-divider {
    width: 60px;
    height: 0.5px;
    background: var(--g4);
  }
  .ec-cta-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: 100%;
  }
  .ec-label {
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.22em;
  }
  .ec-options {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }
  .ec-opt {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--g1);
    border: 0.5px solid var(--g4);
    border-radius: 4px;
  }
  .ec-opt-key {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--pos);
    font-weight: 600;
    letter-spacing: 0.06em;
    white-space: nowrap;
    min-width: 80px;
  }
  .ec-opt-txt {
    font-size: 10px;
    color: var(--g6);
  }
  .ec-quick-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    width: 100%;
  }
  .ec-quick {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding: 9px 12px;
    background: var(--g1);
    border: 0.5px solid var(--g4);
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.12s, background 0.12s;
  }
  .ec-quick:hover {
    border-color: var(--g4);
    background: var(--g2);
  }
  .eq-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--g8);
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  .eq-sub {
    font-size: 9px;
    color: var(--g6);
  }

  /* Chart section */
  .chart-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--g1);
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    margin: 6px;
    overflow: hidden;
    position: relative;
  }

  .chart-header {
    padding: 8px 16px;
    border-bottom: 0.5px solid var(--g4);
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--g0);
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
  }
  .symbol {
    font-size: 14px;
    color: var(--g9);
    font-weight: 600;
    letter-spacing: -0.02em;
    font-family: 'Space Grotesk', sans-serif;
  }
  .timeframe { color: var(--g6); letter-spacing: 0.04em; }
  .pattern {
    color: var(--g5);
    padding: 2px 8px;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 999px;
    font-size: 8px;
    letter-spacing: 0.06em;
  }
  .spacer { flex: 1; }

  .ind-toggles {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .ind-label-hdr {
    color: var(--g6);
    font-size: 7px;
    letter-spacing: 0.1em;
    margin-right: 2px;
  }
  .ind-tog {
    padding: 2px 8px;
    border: 0.5px solid var(--g4);
    border-radius: 2px;
    background: transparent;
    color: var(--g5);
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: all 0.1s;
  }
  .ind-tog:hover { border-color: var(--g4); color: var(--g7); background: var(--g1); }
  .ind-tog.active {
    background: rgba(122,162,224,0.1);
    border-color: rgba(122,162,224,0.4);
    color: #7aa2e0;
  }

  .evidence-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 999px;
  }
  .ev-label {
    font-size: 7.5px;
    color: var(--g6);
    letter-spacing: 0.14em;
  }
  .ev-pos { font-size: 11px; color: var(--pos); font-weight: 700; }
  .ev-sep { font-size: 9px; color: var(--g4); }
  .ev-neg { font-size: 11px; color: var(--neg); font-weight: 700; }

  .conf-inline {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .conf-label {
    font-size: 8px;
    color: var(--g6);
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
    padding: 0 14px;
    height: 26px;
    border-bottom: 0.5px solid var(--g2);
    flex-shrink: 0;
    align-items: center;
  }
  .phase {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: 'JetBrains Mono', monospace;
    color: var(--g5);
    padding: 0 12px;
    border-right: 0.5px solid var(--g2);
    height: 100%;
    transition: color 0.1s;
  }
  .phase:first-child { padding-left: 0; }
  .phase:last-child { border-right: none; }
  .ph-n { font-size: 7.5px; color: var(--g5); letter-spacing: 0.1em; }
  .ph-label { font-size: 8.5px; letter-spacing: 0.08em; }
  .ph-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--pos);
    box-shadow: 0 0 6px var(--pos);
    flex-shrink: 0;
  }
  .phase.active .ph-n   { color: var(--pos); }
  .phase.active .ph-label { color: var(--pos); font-weight: 600; }
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
    height: 30px;
    flex-shrink: 0;
    background: var(--g0);
    border-top: 0.5px solid var(--g4);
  }
  .pb-tab {
    flex: 1;
    min-width: 0;
    padding: 0 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    border-left: 0.5px solid var(--g4);
    border-bottom: 1.5px solid transparent;
    cursor: pointer;
    overflow: hidden;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.1s;
  }
  .pb-tab:first-child { border-left: none; }
  .pb-tab:hover { background: var(--g1); }
  .pb-tab.active {
    background: var(--g1);
    border-bottom-color: var(--tc);
  }
  .pb-n {
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.18em;
    font-weight: 700;
    flex-shrink: 0;
  }
  .pb-tab.active .pb-n { color: var(--tc); opacity: 0.7; }
  .pb-label {
    font-size: 10px;
    color: var(--g6);
    font-weight: 600;
    letter-spacing: 0.1em;
    flex-shrink: 0;
  }
  .pb-tab.active .pb-label { color: var(--g9); }
  .pb-chevron {
    font-size: 8px;
    color: var(--g5);
    flex-shrink: 0;
  }
  .pb-tab.active .pb-chevron { color: var(--tc); }

  /* PEEK overlay */
  .peek-overlay {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 30px; /* height of peek-bar */
    background: rgba(10,12,16,0.97);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-top: 0.5px solid var(--g4);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 -24px 60px rgba(0,0,0,0.7);
    animation: peekSlide 0.2s cubic-bezier(0.22,1,0.36,1);
    z-index: 10;
    min-height: 200px;
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
    background: var(--g4);
    opacity: 0.7;
    transition: background 0.1s;
  }

  /* Drawer header */
  .drawer-header {
    display: flex;
    align-items: stretch;
    background: var(--g0);
    border-bottom: 0.5px solid var(--g4);
    flex-shrink: 0;
    height: 34px;
  }
  .dh-tab {
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    border-right: 0.5px solid var(--g4);
    border-top: 1.5px solid transparent;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.1s;
  }
  .dh-tab:hover { background: var(--g1); }
  .dh-tab.active {
    background: var(--g1);
    border-top-color: var(--tc);
  }
  .dh-n {
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.2em;
    font-weight: 600;
  }
  .dh-tab.active .dh-n { color: var(--tc); opacity: 0.7; }
  .dh-label {
    font-size: 11px;
    color: var(--g6);
    font-weight: 600;
    letter-spacing: 0.1em;
  }
  .dh-tab.active .dh-label { color: var(--g9); }
  .dh-desc { font-size: 9px; color: var(--g5); font-family: 'Geist', sans-serif; }

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
    border-right: 0.5px solid var(--g4);
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
    border: 0.5px solid var(--g4);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
  }
  .ev-mark { font-size: 11px; font-weight: 700; }
  .ev-chip.pos .ev-mark { color: var(--pos); }
  .ev-chip.neg .ev-mark { color: var(--neg); }
  .ev-key { font-size: 10px; color: var(--g7); width: 80px; }
  .ev-val { font-size: 11px; color: var(--g9); font-weight: 600; }
  .ev-note { font-size: 10px; color: var(--g6); margin-left: auto; font-family: 'Geist', sans-serif; }

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
    border: 0.5px solid var(--g4);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
  }
  .prop-l { font-size: 7px; color: var(--g6); letter-spacing: 0.14em; width: 44px; }
  .prop-v { font-size: 14px; color: var(--g9); font-weight: 600; }
  .prop-cell.tone-neg .prop-v { color: var(--neg); }
  .prop-cell.tone-pos .prop-v { color: var(--pos); }
  .prop-h { font-size: 9px; color: var(--g6); margin-left: auto; }

  /* ── SCAN panel (trade_scan.jsx) ── */
  .scan-panel {
    flex: 1; display: flex; flex-direction: column; overflow: hidden;
    background: var(--g1);
  }
  .scan-header {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-bottom: 0.5px solid var(--g4);
    background: var(--g0); flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
  }
  .scan-step { font-size: 7px; color: #7aa2e0; letter-spacing: 0.22em; font-weight: 600; }
  .scan-label { font-size: 7px; color: #7aa2e0; letter-spacing: 0.14em; }
  .scan-title { font-size: 13px; color: var(--g9); font-weight: 600; }
  .scan-meta { font-size: 9px; color: var(--g6); letter-spacing: 0.04em; }
  .scan-sort-label { font-size: 9px; color: var(--g5); letter-spacing: 0.14em; }
  .scan-sort-btn {
    font-size: 10px; color: var(--g8); font-weight: 500;
    padding: 3px 8px; background: var(--g2); border-radius: 3px; cursor: pointer;
  }
  .scan-grid {
    flex: 1; overflow: auto; padding: 10px 12px;
    display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
    align-content: start;
  }
  .scan-card {
    padding: 10px 12px 9px; border-radius: 8px; cursor: pointer;
    background: var(--g0); border: 0.5px solid var(--g4);
    display: flex; flex-direction: column; gap: 5px;
    transition: all 0.14s; text-align: left;
  }
  .scan-card:hover { background: var(--g2); border-color: var(--g4); }
  .scan-card.active { background: var(--g2); border-color: var(--sc); box-shadow: 0 0 0 0.5px var(--sc); }
  .sc-top { display: flex; align-items: center; gap: 4px; }
  .sc-sym { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--g9); font-weight: 600; }
  .sc-tf {
    font-family: 'JetBrains Mono', monospace; font-size: 7.5px; color: var(--g6);
    padding: 1px 4px; background: var(--g2); border-radius: 2px;
  }
  .sc-alpha { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; }
  .sc-sim-row { display: flex; align-items: center; gap: 4px; }
  .sc-sim-bar { flex: 1; height: 2.5px; background: var(--g3); border-radius: 2px; overflow: hidden; }
  .sc-sim-fill { height: 100%; opacity: 0.85; }
  .sc-sim-pct { font-family: 'JetBrains Mono', monospace; font-size: 8.5px; color: var(--g8); width: 24px; text-align: right; }
  .sc-pattern { font-size: 8.5px; color: var(--g6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sc-age { font-family: 'JetBrains Mono', monospace; font-size: 8px; color: var(--g5); }

  /* ── ACT panel (trade_act.jsx) ── */
  .act-panel {
    flex: 1; display: flex; flex-direction: column; overflow: hidden;
    background: var(--g1);
  }
  .act-header {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 14px; border-bottom: 0.5px solid var(--g4);
    background: var(--g0); flex-shrink: 0; height: 34px;
    font-family: 'JetBrains Mono', monospace;
  }
  .act-step { font-size: 7px; color: var(--amb); letter-spacing: 0.22em; }
  .act-div { width: 1px; height: 12px; background: var(--g4); }
  .act-sym { font-size: 12px; color: var(--g9); font-weight: 600; }
  .act-tf { font-size: 9px; color: var(--g6); }
  .act-dir { font-size: 9px; color: var(--pos); font-weight: 600; }
  .act-pat { font-size: 9px; color: var(--g6); }
  .act-alpha {
    font-size: 10px; color: var(--pos); font-weight: 600;
    padding: 2px 7px; background: var(--g2); border-radius: 3px;
  }
  .act-cols { flex: 1; display: flex; min-height: 0; overflow: hidden; }
  .act-col { padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
  .plan-col { flex: 1.3; min-width: 0; }
  .judge-col { flex: 1.4; min-width: 0; }
  .after-col { flex: 1.2; min-width: 0; }
  .act-divider { width: 0.5px; background: var(--g4); flex-shrink: 0; }
  .col-label { font-family: 'JetBrains Mono', monospace; font-size: 7px; color: var(--g6); letter-spacing: 0.2em; }

  /* Plan col */
  .lvl-row { display: flex; gap: 6px; }
  .lvl-cell {
    flex: 1; padding: 7px 10px; background: var(--g0);
    border: 0.5px solid var(--g4); border-radius: 7px; min-width: 0;
  }
  .lvl-label { font-family: 'JetBrains Mono', monospace; font-size: 7px; color: var(--g6); letter-spacing: 0.14em; }
  .lvl-val { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lvl-hint { font-family: 'JetBrains Mono', monospace; font-size: 7px; color: var(--g6); }
  .rr-size-row { display: flex; gap: 6px; }
  .rr-box, .size-box {
    flex: 1; padding: 8px 10px; background: var(--g0);
    border: 0.5px solid var(--g4); border-radius: 7px; min-width: 0;
  }
  .rr-box-label, .size-label { font-family: 'JetBrains Mono', monospace; font-size: 7px; color: var(--g6); letter-spacing: 0.1em; margin-bottom: 4px; }
  .rr-bar { height: 5px; background: var(--g2); border-radius: 3px; overflow: hidden; display: flex; }
  .rr-loss { background: var(--neg); opacity: 0.9; }
  .rr-gain { background: var(--pos); }
  .rr-labels { display: flex; justify-content: space-between; margin-top: 2px; font-family: 'JetBrains Mono', monospace; font-size: 8px; }
  .rr-r { color: var(--neg); }
  .rr-g { color: var(--pos); }
  .size-val { font-family: 'JetBrains Mono', monospace; font-size: 16px; color: var(--g9); font-weight: 600; display: flex; align-items: baseline; gap: 6px; }
  .size-usd { font-size: 9px; color: var(--g6); }
  .exchange-btn {
    padding: 9px 14px; background: var(--pos-dd); color: var(--pos);
    border: 0.5px solid var(--pos-d); border-radius: 8px;
    font-family: 'Space Grotesk', sans-serif; font-size: 10px; font-weight: 600;
    letter-spacing: 0.06em; cursor: pointer; transition: all 0.12s;
  }
  .exchange-btn:hover { background: var(--pos-d); border-color: var(--pos); }

  /* Judge col */
  .judge-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .judge-q { font-size: 10px; color: var(--g7); }
  .judge-q strong { color: var(--g9); }
  .judge-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; flex: 1; min-height: 80px; }
  .judge-btn {
    padding: 10px 14px; border-radius: 5px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 12px;
    font-family: 'JetBrains Mono', monospace; border: 1px solid;
    transition: all 0.12s; width: 100%;
  }
  .judge-btn.agree {
    background: rgba(52,196,112,0.07); color: var(--pos); border-color: rgba(52,196,112,0.25);
  }
  .judge-btn.agree:hover { background: rgba(52,196,112,0.12); border-color: rgba(52,196,112,0.4); }
  .judge-btn.agree.active { background: rgba(52,196,112,0.18); border-color: var(--pos); box-shadow: inset 0 0 0 0.5px var(--pos); }
  .judge-btn.disagree {
    background: rgba(248,81,73,0.07); color: var(--neg); border-color: rgba(248,81,73,0.25);
  }
  .judge-btn.disagree:hover { background: rgba(248,81,73,0.12); border-color: rgba(248,81,73,0.4); }
  .judge-btn.disagree.active { background: rgba(248,81,73,0.18); border-color: var(--neg); box-shadow: inset 0 0 0 0.5px var(--neg); }
  .jb-key { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
  .jb-text { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.3; }
  .jb-label { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; }
  .jb-sub { font-size: 8.5px; opacity: 0.6; }
  .judge-tags { display: flex; flex-wrap: wrap; gap: 3px; }
  .judge-tag {
    font-family: 'Space Grotesk', sans-serif; font-size: 9px; font-weight: 500;
    padding: 3px 9px; background: var(--g2); color: var(--g6);
    border: 0.5px solid var(--g4); border-radius: 999px; cursor: pointer;
    white-space: nowrap; transition: all 0.1s;
  }
  .judge-tag:hover { color: var(--g8); border-color: var(--amb); background: var(--amb-dd); }

  /* After col */
  .outcome-row { display: flex; gap: 3px; }
  .outcome-btn {
    flex: 1; padding: 6px 4px; font-family: 'Space Grotesk', sans-serif;
    font-size: 9px; font-weight: 600; letter-spacing: 0.06em;
    background: transparent; color: var(--g6);
    border: 0.5px solid var(--g4); border-radius: 7px; cursor: pointer;
    transition: all 0.1s;
  }
  .outcome-btn:hover { border-color: var(--g5); color: var(--g8); }
  .outcome-btn.active { background: var(--obg); color: var(--oc); border-color: var(--oc); }
  .result-row {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 8px; background: var(--g0);
    border: 0.5px solid var(--g4); border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
  }
  .result-label { font-size: 7px; color: var(--g6); letter-spacing: 0.12em; }
  .result-val { font-size: 14px; font-weight: 600; }
  .result-hint { font-size: 8px; color: var(--g6); }
  .rejudge-label { font-family: 'JetBrains Mono', monospace; font-size: 7px; color: var(--amb); letter-spacing: 0.14em; }
  .rejudge-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .rj-btn {
    padding: 7px 6px; border-radius: 3px; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 600;
    letter-spacing: 0.06em; border: 1px solid; transition: all 0.1s;
  }
  .rj-sub { opacity: 0.6; font-size: 8px; }
  .rj-pos { background: var(--pos-dd); color: var(--pos); border-color: var(--pos-d); }
  .rj-pos.active { background: var(--pos-d); border-color: var(--pos); }
  .rj-neg { background: var(--neg-dd); color: var(--neg); border-color: var(--neg-d); }
  .rj-neg.active { background: var(--neg-d); border-color: var(--neg); }
  .bias-box {
    padding: 5px 8px; border-radius: 3px; font-size: 9px; line-height: 1.5;
  }
  .bias-good { background: var(--pos-dd); border: 0.5px solid var(--pos-d); color: var(--pos); }
  .bias-warn { background: var(--amb-dd); border: 0.5px solid var(--amb-d); color: var(--amb); }
  .after-empty {
    flex: 1; display: flex; align-items: center; justify-content: center;
    padding: 10px; border: 0.5px dashed var(--g4); border-radius: 3px;
    font-size: 10px; color: var(--g5); text-align: center; line-height: 1.5;
  }

  /* PeekBar rich summary */
  .pb-sep { font-size: 8px; color: var(--g5); flex-shrink: 0; }
  .pb-val { font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 600; color: var(--g9); flex-shrink: 0; }
  .pb-val.pos { color: var(--pos); }
  .pb-val.neg { color: var(--neg); }
  .pb-txt { font-size: 9px; color: var(--g7); flex-shrink: 0; }
  .pb-dim { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--g6); overflow: hidden; text-overflow: ellipsis; }
  .pb-warn { font-family: 'JetBrains Mono', monospace; font-size: 8px; color: var(--amb); flex-shrink: 0; }

  /* MiniChart */
  .sc-minichart { width: 100%; height: 48px; display: block; }

  /* PastSamplesStrip */
  .past-strip {
    border-top: 0.5px solid var(--g4);
    background: var(--g0);
    padding: 8px 14px 10px;
    flex-shrink: 0;
  }
  .past-header {
    display: flex; align-items: center; gap: 8px;
    font-family: 'JetBrains Mono', monospace; font-size: 8px;
    letter-spacing: 0.14em; margin-bottom: 8px;
  }
  .past-title { color: var(--amb); font-weight: 600; }
  .past-sep { color: var(--g4); }
  .past-win { color: var(--pos); }
  .past-loss { color: var(--neg); }
  .past-avg { color: var(--g6); letter-spacing: 0.04em; }
  .past-hint { font-size: 7.5px; color: var(--g5); letter-spacing: 0.04em; text-transform: none; }
  .past-cards { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
  .past-card {
    padding: 7px 10px; border-radius: 4px; cursor: pointer; min-width: 72px;
    background: var(--g1); border: 0.5px solid var(--g4);
    display: flex; flex-direction: column; gap: 2px; flex-shrink: 0;
    transition: all 0.12s; text-align: left;
  }
  .past-card:hover { background: var(--g2); border-color: var(--g4); }
  .past-sym { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--g9); font-weight: 500; }
  .past-pnl { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 600; }
  .past-sim { font-family: 'JetBrains Mono', monospace; font-size: 8px; color: var(--g5); }
</style>
