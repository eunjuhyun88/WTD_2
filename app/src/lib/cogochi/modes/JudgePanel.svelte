<script lang="ts">
  import ConfluenceBanner from '$lib/components/confluence/ConfluenceBanner.svelte';

  type Verdict = 'agree' | 'disagree' | null;
  type Outcome = 'win' | 'loss' | 'flat' | null;
  type Rejudged = 'right' | 'wrong' | null;

  interface JudgeLevel { label: string; val: string; color: string }

  interface JudgeSubmitResult {
    saved?: boolean;
    training_triggered?: boolean;
    count?: number;
  }

  interface Props {
    confluence: any;
    confluenceHistory: any;
    symbol: string;
    timeframe: string;
    confidenceAlpha: string | number;
    judgePlan: JudgeLevel[];
    rrLossPct: string;
    rrGainPct: string;
    judgeVerdict: Verdict;
    onSetJudgeVerdict: (v: 'agree' | 'disagree') => void;
    judgeOutcome: Outcome;
    onSetJudgeOutcome: (o: 'win' | 'loss' | 'flat') => void;
    judgeRejudged: Rejudged;
    onSetJudgeRejudged: (r: 'right' | 'wrong') => void;
    judgeSubmitting: boolean;
    judgeSubmitResult: JudgeSubmitResult | null;
  }

  let {
    confluence,
    confluenceHistory,
    symbol,
    timeframe,
    confidenceAlpha,
    judgePlan,
    rrLossPct,
    rrGainPct,
    judgeVerdict,
    onSetJudgeVerdict,
    judgeOutcome,
    onSetJudgeOutcome,
    judgeRejudged,
    onSetJudgeRejudged,
    judgeSubmitting,
    judgeSubmitResult,
  }: Props = $props();
</script>

<div class="tm-act-panel">
  {#if confluence}
    <div style="padding: 6px 10px 0;">
      <ConfluenceBanner value={confluence} history={confluenceHistory} compact />
    </div>
  {/if}
  <div class="tm-act-header">
    <span class="tm-act-step">STEP 04 · ACT & JUDGE</span>
    <span class="tm-act-div"></span>
    <span class="tm-act-sym">{symbol}</span>
    <span class="tm-act-tf">{timeframe.toUpperCase()}</span>
    <span class="tm-act-dir">LONG</span>
    <span class="tm-act-pat">OI reversal · accumulation</span>
    <span class="spacer"></span>
    <span class="tm-act-alpha">{confidenceAlpha}</span>
  </div>
  <div class="tm-act-cols">
    <div class="tm-act-col plan-col">
      <div class="col-label">A · TRADE PLAN</div>
      <div class="lvl-row">
        {#each judgePlan as lvl}
          <div class="lvl-cell">
            <div class="lvl-label">{lvl.label}</div>
            <div class="lvl-val" style:color={lvl.color}>{lvl.val}</div>
          </div>
        {/each}
      </div>
      <div class="rr-size-row">
        <div class="rr-box">
          <div class="rr-box-label">RISK:REWARD</div>
          <div class="rr-bar">
            <div class="rr-loss" style:width={rrLossPct}></div>
            <div class="rr-gain" style:width={rrGainPct}></div>
          </div>
          <div class="rr-labels"><span class="rr-r">1R</span><span class="rr-g">{judgePlan[3]?.val ?? ''}</span></div>
        </div>
        <div class="size-box">
          <div class="size-label">SIZE · 3x lev</div>
          <div class="size-val">1.2% <span class="size-usd">$1,200</span></div>
        </div>
      </div>
      <button class="exchange-btn">OPEN IN EXCHANGE ↗</button>
    </div>

    <div class="tm-act-divider"></div>

    <div class="tm-act-col judge-col">
      <div class="judge-head">
        <span class="col-label">B · JUDGE NOW</span>
        <span class="judge-q">이 셋업, <strong>내 돈을 걸만한가?</strong></span>
      </div>
      <div class="judge-btns">
        <button
          class="judge-btn agree"
          class:active={judgeVerdict === 'agree'}
          onclick={() => onSetJudgeVerdict('agree')}
        >
          <span class="jb-key">Y</span>
          <div class="jb-text"><span class="jb-label">AGREE</span><span class="jb-sub">진입</span></div>
        </button>
        <button
          class="judge-btn disagree"
          class:active={judgeVerdict === 'disagree'}
          onclick={() => onSetJudgeVerdict('disagree')}
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

    <div class="tm-act-divider"></div>

    <div class="tm-act-col tm-after-col">
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
            onclick={() => onSetJudgeOutcome(o.k as 'win' | 'loss' | 'flat')}
          >{o.l}</button>
        {/each}
      </div>
      {#if judgeOutcome}
        <div class="result-row">
          <span class="result-label">RESULT</span>
          <span class="result-val" style:color={judgeOutcome === 'win' ? 'var(--pos)' : judgeOutcome === 'loss' ? 'var(--neg)' : 'var(--g7)'}>
            {judgeOutcome.toUpperCase()}
          </span>
          <span class="spacer"></span>
          {#if judgeSubmitting}
            <span class="result-hint">저장 중…</span>
          {:else if judgeSubmitResult?.saved}
            <span class="result-hint" style:color="var(--pos)">
              저장됨 {judgeSubmitResult.training_triggered ? '· 학습 시작' : `· ${judgeSubmitResult.count}건`}
            </span>
          {:else}
            <span class="result-hint">flywheel 연결 중</span>
          {/if}
        </div>
        <div class="rejudge-label">REJUDGE</div>
        <div class="rejudge-btns">
          <button class="rj-btn rj-pos" class:active={judgeRejudged === 'right'} onclick={() => onSetJudgeRejudged('right')}>
            옳았다 <span class="rj-sub">+보강</span>
          </button>
          <button class="rj-btn rj-neg" class:active={judgeRejudged === 'wrong'} onclick={() => onSetJudgeRejudged('wrong')}>
            틀렸다 <span class="rj-sub">뒤집기</span>
          </button>
        </div>
        {#if judgeVerdict && judgeRejudged}
          {@const consistent = (judgeVerdict === 'agree' && judgeRejudged === 'right') || (judgeVerdict === 'disagree' && judgeRejudged === 'wrong')}
          <div class="tm-bias-box" class:tm-bias-good={consistent} class:tm-bias-warn={!consistent}>
            {#if consistent}
              <strong>✓ 일관 판정</strong> <span>· 가중치 +0.04</span>
            {:else}
              <strong>⚑ 편향 감지</strong> <span>· Train 권장</span>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="tm-after-empty">매매 결과 선택시<br>재판정 가능</div>
      {/if}
    </div>
  </div>
</div>

<style>

  /* Fix 1: 모바일에서 ChartBoard 데스크탑 툴바 숨김 (+98px 확보) */
  :global(.mobile-chart-section .chart-toolbar) { display: none; }
  :global(.mobile-chart-section .chart-header--tv) { display: none; }
  /* Fix 2: ChartBoard min-height 420px 오버라이드 → 42vh 컨테이너에 맞춤 */
  :global(.mobile-chart-section .chart-board) { min-height: 0 !important; }

  .trade-mode {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--g0);
    gap: 0;
    overflow: hidden;
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

  .chart-controls-bar {
    height: 28px;
    padding: 0 12px;
    border-bottom: 0.5px solid var(--g4);
    display: flex;
    align-items: center;
    gap: 8px;
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
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: 3px;
    transition: color 0.15s;
  }
  .symbol:hover { color: var(--brand); }
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

  .hd-sep { width: 1px; height: 14px; background: var(--g3); flex-shrink: 0; }
  .hd-price {
    font-size: 13px; color: var(--g9); font-weight: 600;
    letter-spacing: -0.01em; font-family: 'JetBrains Mono', monospace;
  }
  .hd-chip {
    padding: 2px 7px; border-radius: 3px;
    background: var(--g2); border: 0.5px solid var(--g4);
    font-size: 8px; color: var(--g6); letter-spacing: 0.06em;
  }
  .hd-chip.neg { color: var(--neg); border-color: color-mix(in srgb, var(--neg) 25%, transparent); }
  .hd-chip.pos { color: var(--pos); border-color: color-mix(in srgb, var(--pos) 25%, transparent); }

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
  .micro-toggle {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border: 0.5px solid var(--g4);
    border-radius: 5px;
    background: color-mix(in srgb, var(--g1) 84%, transparent);
  }
  .micro-toggle-btn {
    padding: 3px 7px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--g5);
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    font-weight: 800;
    letter-spacing: 0.11em;
    cursor: pointer;
  }
  .micro-toggle-btn:hover {
    color: var(--g8);
    background: var(--g2);
  }
  .micro-toggle-btn.active {
    color: #d9edf8;
    background: linear-gradient(135deg, rgba(74,187,142,0.22), rgba(122,162,224,0.18));
    box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--pos) 38%, var(--g4));
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
  .ev-pos { font-size: 11px; color: var(--amb); font-weight: 700; }
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
  .conf-fill { height: 100%; background: var(--amb); border-radius: 2px; }
  .conf-val {
    font-size: 11px;
    color: var(--amb);
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
  .chart-live {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .microstructure-belt {
    min-height: 54px;
    flex-shrink: 0;
    display: grid;
    grid-template-columns: 150px minmax(300px, 0.8fr) minmax(180px, 0.55fr) minmax(220px, 0.65fr);
    gap: 8px;
    align-items: stretch;
    padding: 6px 10px;
    border-top: 0.5px solid rgba(255,255,255,0.05);
    border-bottom: 0.5px solid var(--g4);
    background:
      linear-gradient(90deg, rgba(74,187,142,0.055), transparent 36%),
      radial-gradient(circle at 86% 50%, rgba(122,162,224,0.09), transparent 34%),
      var(--g0);
    font-family: 'JetBrains Mono', monospace;
  }
  .micro-belt-title {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    padding: 0 10px;
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    background: rgba(255,255,255,0.018);
  }
  .micro-kicker {
    color: var(--g5);
    font-size: 7px;
    letter-spacing: 0.18em;
  }
  .micro-belt-title strong {
    color: var(--g9);
    font-size: 11px;
    letter-spacing: 0.12em;
  }
  .micro-belt-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 5px;
  }
  .micro-stat {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    padding: 6px 7px;
    border: 0.5px solid var(--g4);
    border-radius: 5px;
    color: var(--g8);
    background: rgba(0,0,0,0.18);
    font-size: 10px;
    font-weight: 800;
  }
  .micro-stat b {
    color: var(--g5);
    font-size: 7px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .micro-stat.buy { color: var(--pos); }
  .micro-stat.sell { color: var(--neg); }
  .micro-heat-strip,
  .micro-depth-strip {
    min-width: 0;
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    background: rgba(0,0,0,0.22);
    overflow: hidden;
  }
  .micro-heat-strip {
    display: grid;
    grid-template-columns: repeat(16, minmax(4px, 1fr));
    gap: 2px;
    padding: 7px;
  }
  .micro-heat-cell {
    border-radius: 2px;
    background: #7aa2e0;
    box-shadow: 0 0 16px currentColor;
  }
  .micro-heat-cell.buy { color: var(--pos); background: var(--pos); }
  .micro-heat-cell.sell { color: var(--neg); background: var(--neg); }
  .micro-depth-strip {
    display: grid;
    grid-template-rows: repeat(5, 1fr);
    gap: 2px;
    padding: 5px;
  }
  .micro-depth-row {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 70px 1fr;
    align-items: center;
    gap: 5px;
    min-height: 7px;
    color: var(--g5);
    font-size: 7px;
  }
  .micro-depth-row.mid {
    color: var(--g9);
    font-weight: 800;
  }
  .depth-bid,
  .depth-ask {
    height: 5px;
    border-radius: 999px;
    opacity: 0.8;
  }
  .depth-bid {
    justify-self: end;
    background: linear-gradient(90deg, transparent, rgba(74,187,142,0.72));
  }
  .depth-ask {
    justify-self: start;
    background: linear-gradient(90deg, rgba(226,91,91,0.72), transparent);
  }
  .depth-price {
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .micro-heat-strip.active,
  .micro-depth-strip.active {
    border-color: color-mix(in srgb, var(--amb) 48%, var(--g4));
    box-shadow: inset 0 0 0 1px rgba(232,184,106,0.08);
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
  /* W-0122-Phase3: small confluence chip appended to peek-bar */
  .pb-confluence-slot {
    display: flex;
    align-items: center;
    padding: 0 8px;
    border-left: 0.5px solid var(--g4);
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
    white-space: nowrap;
    flex-shrink: 0;
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
  .dh-desc { font-size: 9px; color: var(--g5); font-family: 'Geist', sans-serif; white-space: nowrap; }

  /* Drawer content */
  .drawer-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    min-height: 0;
  }

  /* ANALYZE workspace shared primitives */
  .narrative {
    font-family: 'Geist', sans-serif;
    font-size: 12px;
    color: var(--g8);
    line-height: 1.7;
  }
  .narrative .bull { color: var(--pos); font-weight: 600; }
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
  .analyze-action-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: 4px;
    border: 0.5px solid var(--g4);
    background: var(--g1);
    color: var(--g8);
    cursor: pointer;
  }
  .analyze-action-btn.ai {
    border-color: color-mix(in srgb, var(--amb) 34%, var(--g4));
    background: color-mix(in srgb, var(--amb) 10%, var(--g1));
  }
  .analyze-action-btn:hover {
    border-color: var(--g5);
    background: var(--g2);
    color: var(--g9);
  }
  .analyze-action-btn.ai:hover {
    border-color: color-mix(in srgb, var(--amb) 52%, var(--g4));
    background: color-mix(in srgb, var(--amb) 14%, var(--g2));
  }
  .analyze-action-k {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 0.14em;
    color: var(--brand);
    flex-shrink: 0;
  }
  .analyze-action-t {
    font-size: 10px;
    font-weight: 600;
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
  .scan-label.scanning { animation: scan-pulse 1.1s ease-in-out infinite; }
  @keyframes scan-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  .scan-title { font-size: 13px; color: var(--g9); font-weight: 600; }
  .scan-meta { font-size: 9px; color: var(--g6); letter-spacing: 0.04em; }
  .scan-meta.anim { animation: scan-pulse 1.6s ease-in-out infinite; }
  .scan-prog-track {
    width: 100%; height: 3px; background: var(--g3); border-radius: 2px; overflow: hidden;
    margin: 4px 0;
  }
  .scan-prog-fill {
    height: 100%; background: #7aa2e0; border-radius: 2px;
    transition: width 0.18s ease-out;
  }
  .sc-open {
    padding: 2px 7px; border-radius: 3px;
    background: transparent; border: 0.5px solid var(--g4);
    color: var(--g6); font-size: 9px; cursor: pointer;
    flex-shrink: 0; transition: all 0.1s;
  }
  .sc-open:hover { background: var(--g2); border-color: var(--g5); color: var(--g8); }
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
  .scan-card.skeleton {
    min-height: 100px; background: var(--g2); border-color: var(--g3);
    animation: skeleton-fade 1.4s ease-in-out infinite;
  }
  @keyframes skeleton-fade { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
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
  .plan-col { flex: 1.3; min-width: 0; }
  .judge-col { flex: 1.4; min-width: 0; }
  .col-label { font-family: 'JetBrains Mono', monospace; font-size: 7px; color: var(--g6); letter-spacing: 0.2em; }

  /* Plan col */
  .lvl-row { display: flex; gap: 6px; }
  .lvl-cell {
    flex: 1; padding: 7px 10px; background: var(--g0);
    border: 0.5px solid var(--g4); border-radius: 7px; min-width: 0;
  }
  .lvl-label { font-family: 'JetBrains Mono', monospace; font-size: 7px; color: var(--g6); letter-spacing: 0.14em; }
  .lvl-val { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
  .outcome-save-hint { margin-top: 4px; font-size: 10px; color: var(--g6); text-align: right; }
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

  /* ── Layout switcher strip ─────────────────────────────────────────────── */
  .layout-strip {
    display: flex;
    align-items: center;
    gap: 0;
    height: 28px;
    padding: 0 10px;
    background: var(--g0);
    border-bottom: 0.5px solid var(--g3);
    flex-shrink: 0;
    overflow: hidden;
  }
  .ls-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.2em;
    margin-right: 10px;
    white-space: nowrap;
  }
  .ls-static {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-right: 10px;
    margin-right: 10px;
    border-right: 0.5px solid var(--g3);
    white-space: nowrap;
  }
  .ls-id {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 700;
    color: var(--amb);
    letter-spacing: 0.1em;
  }
  .ls-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--g9);
    letter-spacing: 0.06em;
    font-weight: 500;
    white-space: nowrap;
  }
  .ls-desc { color: var(--g5); font-size: 8px; }
  .ls-hint {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  /* scan-row: compact horizontal scan item for C sidebar */
  .scan-empty { padding: 12px 0; font-size: 11px; color: var(--g6); text-align: center; }
  .scan-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 0;
    width: 100%;
    border-bottom: 0.5px solid var(--g2);
    cursor: pointer;
    background: none;
  }
  .scan-row:hover { background: var(--g2); }
  .scan-row.active { background: var(--g2); }
  .sr-sym {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--g9);
    font-weight: 500;
    width: 50px;
    flex-shrink: 0;
  }
  .sr-tf { font-size: 8px; color: var(--g5); width: 22px; flex-shrink: 0; }
  .sr-bar { flex: 1; height: 3px; background: var(--g3); border-radius: 2px; overflow: hidden; }
  .sr-fill { height: 100%; border-radius: 2px; }
  .sr-alpha { font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 600; width: 30px; text-align: right; flex-shrink: 0; }

  /* ── Layout C — chart + peek bar + sidebar (merged C+D) ─────────────────── */
  .layout-c {
    flex: 1;
    display: flex;
    flex-direction: row;
    overflow: hidden;
    min-height: 0;
  }
  /* merged layout: chart-section.lc-main = left pane (chart + peek) */
  .layout-c .chart-section.lc-main {
    margin: 6px 0 6px 6px;
    border-right: none;
    border-radius: 6px 0 0 6px;
  }
  .lc-sidebar {
    width: 260px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--g1);
    border: 0.5px solid var(--g4);
    border-left: none;
    border-radius: 0 6px 6px 0;
    margin: 6px 6px 6px 0;
    overflow-y: auto;
    transition: width 0.16s ease, margin 0.16s ease;
  }
  .lc-sidebar.collapsed {
    width: 56px;
    overflow: hidden;
    align-items: center;
  }
  .lc-sidebar-rail {
    width: 100%;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 6px;
    background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.12));
  }
  .lc-rail-chip,
  .lc-rail-handle {
    width: 42px;
    border: 0.5px solid var(--g4);
    background: var(--g0);
    color: var(--g7);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: border-color 0.12s, color 0.12s, background 0.12s;
  }
  .lc-rail-chip:hover,
  .lc-rail-handle:hover {
    border-color: var(--g5);
    color: var(--g9);
    background: var(--g1);
  }
  .lc-rail-chip {
    height: 42px;
    position: relative;
    border-radius: 4px;
    overflow: hidden;
  }
  .lc-rail-accent {
    position: absolute;
    inset: 0 auto auto 0;
    width: 2px;
    height: 100%;
    background: var(--brand);
    opacity: 0.9;
  }
  .lc-rail-step {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.16em;
    color: var(--g8);
    transform: translateX(2px);
  }
  .lc-rail-phase {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 0.16em;
    color: var(--g6);
    text-transform: uppercase;
    margin: 4px 0;
  }
  .lc-rail-handle {
    height: 42px;
    border-radius: 4px;
    font-size: 13px;
  }
  /* Responsive: hide sidebar below 860px, chart-section goes full width */
  @media (max-width: 860px) {
    .layout-c .lc-sidebar { display: none; }
    .layout-c .chart-section.lc-main {
      margin: 6px;
      border-right: 0.5px solid var(--g4);
      border-radius: 6px;
    }
  }
  .lcs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    background: var(--g0);
    border-bottom: 0.5px solid var(--g3);
    flex-shrink: 0;
  }
  .lcs-headline {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .lcs-step {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.18em;
    font-weight: 600;
  }
  .lcs-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 600;
    color: var(--g9);
    letter-spacing: 0.1em;
  }
  .lcs-meta { font-size: 8px; color: var(--g5); }
  .lcs-toggle {
    width: 20px;
    height: 20px;
    border: 0.5px solid var(--g4);
    border-radius: 4px;
    background: var(--g1);
    color: var(--g7);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }
  .lcs-toggle:hover { color: var(--g9); border-color: var(--g5); }

  /* ── Decision HUD: right rail owns conclusions only ───────────────────── */
  .decision-hud {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 100%;
    padding-bottom: 10px;
  }
  .decision-hud-header {
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .hud-card {
    margin: 0 10px;
    padding: 10px;
    border: 0.5px solid var(--g4);
    border-radius: 8px;
    background: linear-gradient(180deg, var(--g1), rgba(0,0,0,0.14));
  }
  .hud-current-state {
    border-color: color-mix(in srgb, var(--amb) 30%, var(--g4));
    background:
      radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--amb) 12%, transparent), transparent 36%),
      linear-gradient(180deg, var(--g1), rgba(0,0,0,0.16));
  }
  .hud-card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .hud-card-kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    letter-spacing: 0.18em;
    color: var(--g6);
    font-weight: 700;
  }
  .hud-card-count,
  .hud-card-note,
  .hud-confidence {
    margin-left: auto;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--amb);
  }
  .hud-confidence {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.04em;
  }
  .hud-state-grid {
    display: grid;
    gap: 5px;
    margin-bottom: 8px;
  }
  .hud-state-row {
    display: grid;
    grid-template-columns: 64px 1fr;
    gap: 8px;
    align-items: baseline;
    font-family: 'JetBrains Mono', monospace;
  }
  .hud-state-row span {
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .hud-state-row strong {
    min-width: 0;
    font-size: 10px;
    color: var(--g9);
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
  }
  .hud-evidence-list,
  .hud-risk-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .hud-evidence-item {
    display: grid;
    grid-template-columns: 16px 1fr auto;
    gap: 7px;
    align-items: center;
    padding: 7px 8px;
    border-radius: 5px;
    background: var(--g0);
    border: 0.5px solid var(--g4);
    font-family: 'JetBrains Mono', monospace;
  }
  .hud-evidence-item.pos { border-color: color-mix(in srgb, var(--pos) 28%, var(--g4)); }
  .hud-evidence-item.neg { border-color: color-mix(in srgb, var(--neg) 28%, var(--g4)); }
  .hud-evidence-mark {
    font-size: 10px;
    font-weight: 800;
    color: var(--pos);
  }
  .hud-evidence-item.neg .hud-evidence-mark { color: var(--neg); }
  .hud-evidence-copy {
    min-width: 0;
    font-size: 9px;
    color: var(--g7);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hud-evidence-item strong {
    font-size: 9px;
    color: var(--g9);
  }
  .hud-risk-item {
    padding: 7px 8px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--amb) 8%, var(--g0));
    border: 0.5px solid color-mix(in srgb, var(--amb) 22%, var(--g4));
    color: var(--g8);
    font-size: 9px;
    line-height: 1.45;
  }
  .hud-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .hud-action {
    min-height: 30px;
    border: 0.5px solid var(--g4);
    border-radius: 5px;
    background: var(--g0);
    color: var(--g8);
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  .hud-action:hover,
  .hud-action.active {
    background: var(--g2);
    border-color: var(--brand);
    color: var(--g9);
  }
  .hud-action.primary {
    grid-column: 1 / -1;
    background: color-mix(in srgb, var(--pos) 12%, var(--g0));
    border-color: color-mix(in srgb, var(--pos) 38%, var(--g4));
    color: var(--pos);
    font-weight: 700;
  }
  .hud-action.ai {
    border-color: color-mix(in srgb, var(--amb) 34%, var(--g4));
    color: var(--amb);
  }
  .hud-routing-note {
    margin: 0 12px;
    font-size: 8px;
    line-height: 1.55;
    color: var(--g5);
  }

  /* ── Analyze workspace: bottom owns verification/comparison/refinement ── */
  .workspace-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 10px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background:
      radial-gradient(circle at 12% 0%, rgba(122,162,224,0.08), transparent 28%),
      linear-gradient(180deg, rgba(255,255,255,0.015), rgba(0,0,0,0.12));
  }
  .workspace-hero,
  .workspace-panel {
    border: 0.5px solid var(--g4);
    border-radius: 8px;
    background: rgba(10,12,16,0.72);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.025);
  }
  .workspace-hero {
    display: grid;
    grid-template-columns: minmax(210px, 0.75fr) minmax(420px, 1.25fr);
    gap: 14px;
    align-items: center;
    padding: 12px 14px;
    flex-shrink: 0;
  }
  .workspace-hero-copy {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
  }
  .workspace-kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    color: var(--brand);
    letter-spacing: 0.2em;
    font-weight: 800;
  }
  .workspace-thesis {
    font-size: 12px;
    line-height: 1.55;
    color: var(--g8);
    min-width: 0;
  }
  .workspace-thesis .bull { color: var(--pos); font-weight: 700; }
  .phase-timeline {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    align-items: stretch;
    gap: 4px;
  }
  .phase-node {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    min-height: 48px;
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    background: var(--g0);
  }
  .phase-node.done {
    border-color: color-mix(in srgb, var(--brand) 28%, var(--g4));
    background: color-mix(in srgb, var(--brand) 7%, var(--g0));
  }
  .phase-node.active {
    border-color: color-mix(in srgb, var(--amb) 55%, var(--g4));
    background: color-mix(in srgb, var(--amb) 11%, var(--g0));
  }
  .phase-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--g5);
  }
  .phase-node.done .phase-dot { background: var(--brand); }
  .phase-node.active .phase-dot { background: var(--amb); box-shadow: 0 0 0 4px var(--amb-dd); }
  .phase-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g7);
    letter-spacing: 0.07em;
  }
  .phase-node.active .phase-label { color: var(--g9); font-weight: 700; }
  .workspace-grid {
    display: grid;
    grid-template-columns: minmax(460px, 1.6fr) minmax(240px, 0.8fr);
    gap: 10px;
    min-height: 0;
  }
  .workspace-bottom-grid {
    display: grid;
    grid-template-columns: 0.8fr 1.25fr 1fr;
    gap: 10px;
    flex-shrink: 0;
  }
  .workspace-panel {
    padding: 10px;
    min-width: 0;
  }
  .workspace-panel-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
  }
  .workspace-panel-copy {
    font-size: 9px;
    color: var(--g6);
    line-height: 1.4;
    text-align: right;
  }
  .market-depth-grid {
    display: grid;
    grid-template-columns: minmax(210px, 0.82fr) minmax(250px, 1fr) minmax(260px, 1.1fr) minmax(280px, 1.2fr);
    gap: 10px;
    flex-shrink: 0;
  }
  .depth-panel {
    min-height: 212px;
    border-color: color-mix(in srgb, var(--g4) 72%, #7aa2e0);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.02), transparent),
      rgba(5,7,10,0.82);
  }
  .depth-panel.selected {
    border-color: color-mix(in srgb, var(--amb) 58%, var(--g4));
    box-shadow: inset 0 0 0 1px rgba(232,184,106,0.075), 0 0 22px rgba(232,184,106,0.035);
  }
  .dom-ladder,
  .tm-tape-list,
  .footprint-table,
  .heatmap-grid {
    font-family: 'JetBrains Mono', monospace;
  }
  .dom-ladder {
    display: grid;
    gap: 2px;
  }
  .dom-row {
    display: grid;
    grid-template-columns: minmax(58px, 1fr) 72px minmax(58px, 1fr);
    align-items: center;
    min-height: 12px;
    gap: 5px;
    color: var(--g7);
    font-size: 8px;
  }
  .dom-head {
    color: var(--g5);
    font-size: 7px;
    letter-spacing: 0.14em;
  }
  .dom-row.mid {
    min-height: 16px;
    border-block: 0.5px solid color-mix(in srgb, var(--amb) 32%, var(--g4));
    color: var(--g9);
    background: rgba(232,184,106,0.055);
  }
  .dom-side {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    height: 12px;
    border-radius: 3px;
    overflow: hidden;
    background: rgba(255,255,255,0.018);
  }
  .dom-side.bid { justify-content: flex-end; }
  .dom-side.ask { justify-content: flex-start; }
  .dom-bar {
    position: absolute;
    top: 1px;
    bottom: 1px;
    border-radius: 3px;
    opacity: 0.76;
  }
  .dom-bar.bid {
    right: 0;
    background: linear-gradient(90deg, rgba(74,187,142,0.05), rgba(74,187,142,0.72));
  }
  .dom-bar.ask {
    left: 0;
    background: linear-gradient(90deg, rgba(226,91,91,0.72), rgba(226,91,91,0.05));
  }
  .dom-val {
    position: relative;
    z-index: 1;
    padding: 0 4px;
    font-variant-numeric: tabular-nums;
  }
  .dom-price {
    text-align: center;
    color: var(--g8);
    font-variant-numeric: tabular-nums;
  }
  .dom-row.bid-heavy .dom-price { color: var(--pos); }
  .dom-row.ask-heavy .dom-price { color: var(--neg); }
  .footprint-table {
    display: grid;
    gap: 3px;
  }
  .footprint-row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(44px, 0.8fr) minmax(64px, 1fr) minmax(44px, 0.8fr) minmax(48px, 0.8fr);
    align-items: center;
    gap: 6px;
    min-height: 14px;
    padding: 2px 5px;
    border-radius: 3px;
    overflow: hidden;
    color: var(--g7);
    font-size: 8px;
    background: rgba(255,255,255,0.014);
  }
  .footprint-head {
    color: var(--g5);
    font-size: 7px;
    letter-spacing: 0.12em;
    background: transparent;
  }
  .footprint-row.buy span:nth-child(4) { color: var(--pos); font-weight: 900; }
  .footprint-row.sell span:nth-child(4) { color: var(--neg); font-weight: 900; }
  .footprint-row span {
    position: relative;
    z-index: 1;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .footprint-row span:nth-child(2) { color: var(--g8); text-align: center; }
  .footprint-volume {
    position: absolute !important;
    left: 0;
    top: 1px;
    bottom: 1px;
    z-index: 0 !important;
    border-radius: 3px;
    background: linear-gradient(90deg, rgba(122,162,224,0.18), transparent);
  }
  .heatmap-grid {
    display: grid;
    gap: 4px;
  }
  .heatmap-row {
    display: grid;
    grid-template-columns: 62px 1fr;
    align-items: center;
    gap: 6px;
  }
  .heat-price {
    color: var(--g5);
    font-size: 8px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .heat-cells {
    display: grid;
    grid-template-columns: repeat(18, minmax(4px, 1fr));
    gap: 2px;
    min-height: 16px;
  }
  .heat-cell {
    min-height: 16px;
    border-radius: 2px;
    background: #7aa2e0;
    box-shadow: 0 0 18px currentColor;
  }
  .heat-cell.buy {
    color: var(--pos);
    background: linear-gradient(180deg, rgba(74,187,142,0.95), rgba(74,187,142,0.32));
  }
  .heat-cell.sell {
    color: var(--neg);
    background: linear-gradient(180deg, rgba(226,91,91,0.95), rgba(226,91,91,0.3));
  }
  .depth-empty {
    padding: 18px 8px;
    border: 0.5px dashed var(--g4);
    border-radius: 6px;
    color: var(--g5);
    font-size: 8px;
    letter-spacing: 0.1em;
    text-align: center;
    text-transform: uppercase;
  }
  .evidence-table {
    display: grid;
    gap: 3px;
    font-family: 'JetBrains Mono', monospace;
  }
  .evidence-table-row {
    display: grid;
    grid-template-columns: minmax(84px, 1.2fr) minmax(58px, 0.75fr) minmax(72px, 0.85fr) 56px minmax(120px, 1.4fr);
    gap: 8px;
    align-items: center;
    min-height: 28px;
    padding: 5px 7px;
    border: 0.5px solid var(--g3);
    border-radius: 4px;
    background: var(--g0);
    color: var(--g7);
    font-size: 8px;
  }
  .evidence-table-row.header {
    min-height: 22px;
    color: var(--g5);
    background: transparent;
    border-color: transparent;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .evidence-table-row.pass span:nth-child(4) { color: var(--pos); font-weight: 800; }
  .evidence-table-row.fail span:nth-child(4) { color: var(--neg); font-weight: 800; }
  .evidence-table-row span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .compare-card-stack {
    display: grid;
    gap: 7px;
  }
  .compare-card {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "label value"
      "note note";
    gap: 3px 8px;
    padding: 9px 10px;
    text-align: left;
    border: 0.5px solid var(--g4);
    border-radius: 6px;
    background: var(--g0);
    color: var(--g8);
    cursor: pointer;
  }
  .compare-card:hover { border-color: #7aa2e0; background: var(--g2); }
  .compare-label {
    grid-area: label;
    font-size: 10px;
    font-weight: 700;
  }
  .compare-value {
    grid-area: value;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: #7aa2e0;
  }
  .compare-note {
    grid-area: note;
    font-size: 9px;
    color: var(--g6);
  }
  .workspace-primary-action {
    width: 100%;
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 5px;
    border: 0.5px solid color-mix(in srgb, #7aa2e0 42%, var(--g4));
    background: color-mix(in srgb, #7aa2e0 10%, var(--g0));
    color: #9bbcf0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .execution-mini-grid {
    display: grid;
    gap: 6px;
  }
  .judgment-options {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }
  .judgment-option {
    min-height: 34px;
    padding: 6px 5px;
    border-radius: 6px;
    border: 0.5px solid var(--g4);
    background: var(--g0);
    color: var(--g8);
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    letter-spacing: 0.05em;
    cursor: pointer;
  }
  .judgment-option:hover { background: var(--g2); color: var(--g9); }
  .judgment-option.tone-pos { border-color: color-mix(in srgb, var(--pos) 40%, var(--g4)); color: var(--pos); }
  .judgment-option.tone-neg { border-color: color-mix(in srgb, var(--neg) 40%, var(--g4)); color: var(--neg); }
  .judgment-option.tone-warn { border-color: color-mix(in srgb, var(--amb) 40%, var(--g4)); color: var(--amb); }
  .workspace-action-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    flex-shrink: 0;
  }

  /* Visual salvage pass: less card noise, more trading-terminal density. */
  .trade-mode {
    background:
      radial-gradient(circle at 50% -18%, rgba(232,184,106,0.055), transparent 34%),
      linear-gradient(180deg, #050608 0%, #030405 100%);
  }
  .layout-c {
    background:
      linear-gradient(90deg, rgba(232,184,106,0.04), transparent 18%, transparent 82%, rgba(122,162,224,0.025)),
      #050608;
  }
  .layout-c .chart-section.lc-main {
    margin: 4px 0 4px 4px;
    border: 1px solid rgba(255,255,255,0.07);
    border-right: none;
    border-radius: 10px 0 0 10px;
    background: #06080b;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.025), 0 20px 60px rgba(0,0,0,0.28);
  }
  .lc-sidebar {
    width: 232px;
    margin: 4px 4px 4px 0;
    border: 1px solid rgba(255,255,255,0.07);
    border-left: 1px solid rgba(255,255,255,0.045);
    border-radius: 0 10px 10px 0;
    background:
      radial-gradient(circle at 100% 0%, rgba(232,184,106,0.08), transparent 30%),
      rgba(5,7,10,0.94);
    box-shadow: inset 1px 0 0 rgba(255,255,255,0.02);
  }
  .chart-controls-bar {
    height: 28px;
    padding: 0 12px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    background: var(--g0);
  }
  .symbol {
    font-size: 15px;
    letter-spacing: 0.005em;
  }
  .timeframe {
    color: var(--g7);
  }
  .pattern,
  .hd-chip,
  .evidence-badge,
  .micro-toggle {
    border-color: rgba(255,255,255,0.065);
    background: rgba(255,255,255,0.026);
  }
  .micro-toggle-btn {
    color: var(--g5);
  }
  .micro-toggle-btn.active {
    color: #f3d58d;
    background: rgba(232,184,106,0.105);
    box-shadow: inset 0 0 0 1px rgba(232,184,106,0.22);
  }
  .chart-body {
    background:
      linear-gradient(180deg, rgba(122,162,224,0.025), transparent 16%),
      #080b11;
  }
  .microstructure-belt {
    min-height: 38px;
    grid-template-columns: 120px minmax(260px, 0.78fr) minmax(280px, 1fr);
    gap: 7px;
    padding: 5px 9px;
    border-top: 1px solid rgba(255,255,255,0.052);
    border-bottom: 1px solid rgba(255,255,255,0.052);
    background:
      linear-gradient(90deg, rgba(74,187,142,0.045), transparent 28%),
      rgba(3,5,8,0.96);
  }
  .micro-belt-title,
  .micro-stat,
  .micro-heat-strip,
  .micro-depth-strip {
    border-color: rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.018);
    border-radius: 5px;
  }
  .micro-belt-title {
    padding: 0 8px;
  }
  .micro-kicker {
    color: #6f7a89;
    letter-spacing: 0.14em;
  }
  .micro-belt-title strong {
    font-size: 10px;
    color: #dbe4ee;
  }
  .micro-belt-stats {
    gap: 4px;
  }
  .micro-stat {
    padding: 5px 7px;
    font-size: 9px;
    box-shadow: none;
  }
  .micro-stat b {
    font-size: 6.5px;
    color: #68717c;
  }
  .micro-heat-strip {
    padding: 6px;
  }
  .micro-depth-strip {
    display: none;
  }
  .peek-bar {
    height: 28px;
    border-top: 1px solid rgba(255,255,255,0.055);
    background: #050608;
  }
  .pb-tab {
    border-left-color: rgba(255,255,255,0.045);
    border-bottom-width: 1px;
  }
  .pb-tab:hover,
  .pb-tab.active {
    background: rgba(255,255,255,0.028);
  }
  .peek-overlay {
    bottom: 28px;
    background:
      linear-gradient(180deg, rgba(9,12,17,0.965), rgba(4,6,9,0.985)),
      #050608;
    border-top: 1px solid rgba(232,184,106,0.20);
    box-shadow: 0 -30px 80px rgba(0,0,0,0.82);
  }
  .drawer-header {
    height: 30px;
    border-bottom-color: rgba(255,255,255,0.055);
    background: rgba(4,5,7,0.95);
  }
  .dh-tab {
    border-right-color: rgba(255,255,255,0.045);
  }
  .dh-tab:hover,
  .dh-tab.active {
    background: rgba(255,255,255,0.026);
  }
  .workspace-body {
    padding: 8px;
    gap: 8px;
    background:
      radial-gradient(circle at 12% -6%, rgba(232,184,106,0.045), transparent 28%),
      #05070a;
  }
  .workspace-hero,
  .workspace-panel {
    border-color: rgba(255,255,255,0.065);
    background: rgba(255,255,255,0.018);
    box-shadow: none;
  }
  .workspace-hero {
    grid-template-columns: minmax(190px, 0.58fr) minmax(420px, 1.42fr);
    padding: 8px 10px;
  }
  .phase-node {
    min-height: 34px;
    padding: 6px 7px;
    border-color: rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.018);
  }
  .phase-node.active {
    background: rgba(232,184,106,0.105);
  }
  .market-depth-grid {
    grid-template-columns: minmax(190px, 0.84fr) minmax(230px, 1fr) minmax(230px, 1.02fr) minmax(250px, 1.1fr);
    gap: 8px;
  }
  .workspace-panel {
    padding: 8px;
    border-radius: 7px;
  }
  .workspace-panel-head {
    margin-bottom: 6px;
  }
  .depth-panel {
    min-height: 178px;
    background: rgba(3,5,8,0.70);
    border-color: rgba(122,162,224,0.10);
  }
  .dom-row,
  .tm-tape-row,
  .footprint-row {
    min-height: 13px;
  }
  .hud-card {
    margin: 0 8px;
    padding: 8px;
    border-color: rgba(255,255,255,0.065);
    background: rgba(255,255,255,0.018);
    border-radius: 7px;
    box-shadow: none;
  }
  .hud-current-state {
    border-color: rgba(232,184,106,0.24);
    background:
      radial-gradient(circle at 100% 0%, rgba(232,184,106,0.105), transparent 40%),
      rgba(255,255,255,0.018);
  }
  .hud-evidence-item,
  .hud-risk-item,
  .hud-action {
    border-color: rgba(255,255,255,0.06);
    background: rgba(0,0,0,0.22);
  }
  .hud-evidence-item.pos {
    border-left: 2px solid rgba(74,187,142,0.65);
  }
  .hud-evidence-item.neg {
    border-left: 2px solid rgba(226,91,91,0.65);
  }
  .hud-risk-item {
    color: var(--g7);
    border-left: 2px solid rgba(232,184,106,0.52);
  }
  .hud-action.primary {
    background: rgba(74,187,142,0.09);
  }

  .chart-save-compact {
    height: 24px;
    padding: 0 10px;
    border: 1px solid rgba(74,187,142,0.28);
    border-radius: 5px;
    background: rgba(74,187,142,0.075);
    color: #76d8ba;
    font-family: 'JetBrains Mono', monospace;
    font-size: 7px;
    font-weight: 800;
    letter-spacing: 0.12em;
    cursor: pointer;
  }

  .chart-save-compact:hover {
    border-color: rgba(74,187,142,0.56);
    background: rgba(74,187,142,0.13);
    color: #a8f1dc;
  }

  .multichart-toggle {
    font-size: 13px;
    padding: 2px 7px;
  }
  .multichart-toggle.active {
    border-color: rgba(59,130,246,0.5);
    background: rgba(59,130,246,0.12);
    color: #93c5fd;
  }
  .multichart-toggle.active:hover {
    border-color: rgba(59,130,246,0.7);
    background: rgba(59,130,246,0.2);
    color: #bfdbfe;
  }

  .observe-mode .layout-c .chart-section.lc-main {
    margin: 3px 0 3px 3px;
    border-color: rgba(255,255,255,0.045);
    border-radius: 8px 0 0 8px;
  }

  .observe-mode .chart-controls-bar {
    height: 28px;
    padding: 0 12px;
    gap: 8px;
  }

  .observe-mode .pattern {
    opacity: 0.52;
  }

  .observe-mode .ind-label-hdr {
    display: none;
  }

  .observe-mode .evidence-badge,
  .observe-mode .conf-inline {
    opacity: 0.62;
  }

  .observe-mode .micro-toggle {
    margin-left: 4px;
  }

  .observe-mode :global(.chart-live .chart-toolbar),
  .observe-mode :global(.chart-live .chart-header--tv) {
    display: none !important;
  }

  .observe-mode :global(.chart-live .chart-board) {
    border: none !important;
    border-radius: 0 !important;
    background: #0f131d !important;
  }

  .observe-mode .microstructure-belt {
    min-height: 32px;
    grid-template-columns: 126px minmax(300px, 0.72fr) minmax(360px, 1fr);
    padding: 4px 8px;
  }

  .observe-mode .micro-belt-title {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .observe-mode .micro-belt-title strong {
    font-size: 8px;
  }

  .observe-mode .micro-stat {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 7px;
  }

  .observe-mode .micro-stat b {
    font-size: 6px;
  }

  .observe-mode .peek-bar {
    height: 24px;
  }

  .observe-mode .peek-overlay {
    bottom: 24px;
  }

  .observe-mode .pb-tab {
    padding: 0 12px;
  }

  .observe-mode .pb-label {
    font-size: 9px;
  }
  @media (max-width: 1120px) {
    .microstructure-belt {
      grid-template-columns: 1fr;
      min-height: auto;
    }
    .micro-belt-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .workspace-hero,
    .market-depth-grid,
    .workspace-grid,
    .workspace-bottom-grid {
      grid-template-columns: 1fr;
    }
    .phase-timeline {
      grid-template-columns: repeat(5, minmax(96px, 1fr));
      overflow-x: auto;
    }
    .judgment-options {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .workspace-action-strip {
      grid-template-columns: 1fr;
    }
  }

  /* ── Mobile layout ── */
  .mobile-chart-section {
    height: 42vh;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  .mobile-chart-section.mobile-chart-fullscreen {
    flex: 1;
    height: auto;
  }

  .chart-expand-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    border: 0.5px solid var(--g5);
    border-radius: 4px;
    color: var(--g7);
    font-size: 14px;
    cursor: pointer;
    z-index: 10;
    line-height: 1;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    transition: background 0.12s;
  }

  .chart-expand-btn:active {
    background: rgba(0, 0, 0, 0.8);
    color: var(--brand);
  }

  .mobile-tab-strip {
    height: 28px;
    flex-shrink: 0;
    display: flex;
    background: var(--g2);
    border-top: 1px solid var(--g4);
    border-bottom: 1px solid var(--g4);
  }

  .mts-tab {
    flex: 1;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 0.06em;
    white-space: nowrap;
    color: var(--g6);
    background: transparent;
    border: none;
    border-right: 1px solid var(--g4);
    cursor: pointer;
    transition: color 0.12s, background 0.12s;
  }
  .mts-tab:last-child { border-right: none; }
  .mts-tab.active {
    color: var(--brand);
    background: var(--g1);
    border-top: 1.5px solid var(--brand);
  }

  .mobile-panel {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 10px 14px;
    padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .mp-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 0;
    border-bottom: 0.5px solid var(--g3);
  }
  .mp-section:last-child { border-bottom: none; }
  .mp-header {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.14em;
  }

  /* ── Accessibility: Screen reader only text ── */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  /* ── Mobile loading ── */
  .mobile-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--g5);
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
  }
  .ml-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--g3);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Proposal AI CTA (mobile) ── */
  .proposal-ai-cta {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    background: var(--g2);
    border: 0.5px dashed var(--brand-d);
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.12s;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--brand);
  }
  .proposal-ai-cta:active { background: var(--brand-dd); }
  .pcta-icon { font-size: 11px; flex-shrink: 0; }
  .pcta-text { flex: 1; }

  /* ── JUDGE context header ── */
  .judge-ctx {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 0 10px;
    border-bottom: 0.5px solid var(--g3);
    margin-bottom: 4px;
    font-family: 'JetBrains Mono', monospace;
  }
  .jc-sym { font-size: 14px; font-weight: 600; color: var(--g9); }
  .jc-sep { font-size: 10px; color: var(--g4); }
  .jc-tf { font-size: 10px; color: var(--g6); letter-spacing: 0.06em; }
  .jc-spacer { flex: 1; }
  .jc-bias {
    font-size: 9px;
    color: var(--brand);
    background: var(--brand-dd);
    padding: 2px 6px;
    border-radius: 3px;
    letter-spacing: 0.06em;
  }
</style>
