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

  interface JudgeData {
    confluence: any;
    confluenceHistory: any;
    symbol: string;
    timeframe: string;
    confidenceAlpha: string | number;
    judgePlan: JudgeLevel[];
    rrLossPct: string;
    rrGainPct: string;
    judgeVerdict: Verdict;
    judgeOutcome: Outcome;
    judgeRejudged: Rejudged;
    judgeSubmitting: boolean;
    judgeSubmitResult: JudgeSubmitResult | null;
  }

  interface JudgeActions {
    onSetJudgeVerdict: (v: 'agree' | 'disagree') => void;
    onSetJudgeOutcome: (o: 'win' | 'loss' | 'flat') => void;
    onSetJudgeRejudged: (r: 'right' | 'wrong') => void;
  }

  interface Props {
    data: JudgeData;
    actions: JudgeActions;
  }

  let { data, actions }: Props = $props();

  // Convenience destructuring for template
  const {
    confluence,
    confluenceHistory,
    symbol,
    timeframe,
    confidenceAlpha,
    judgePlan,
    rrLossPct,
    rrGainPct,
    judgeVerdict,
    judgeOutcome,
    judgeRejudged,
    judgeSubmitting,
    judgeSubmitResult,
  } = data;
  const { onSetJudgeVerdict, onSetJudgeOutcome, onSetJudgeRejudged } = actions;
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

  /* Chart section */

  .spacer { flex: 1; }

  .ind-tog.active {
    background: rgba(122,162,224,0.1);
    border-color: rgba(122,162,224,0.4);
    color: #7aa2e0;
  }

  .micro-toggle-btn.active {
    color: #d9edf8;
    background: linear-gradient(135deg, rgba(74,187,142,0.22), rgba(122,162,224,0.18));
    box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--pos) 38%, var(--g4));
  }

  .micro-heat-strip.active, .micro-depth-strip.active {
    border-color: color-mix(in srgb, var(--amb) 48%, var(--g4));
    box-shadow: inset 0 0 0 1px rgba(232,184,106,0.08);
  }

  /* PEEK bar */

  /* W-0122-Phase3: small confluence chip appended to peek-bar */

  .pb-tab.active {
    background: var(--g1);
    border-bottom-color: var(--tc);
  }

  .pb-tab.active .pb-n { color: var(--tc); opacity: 0.7; }

  .pb-tab.active .pb-label { color: var(--g9); }

  .pb-tab.active .pb-chevron { color: var(--tc); }

  /* PEEK overlay */

  @keyframes peekSlide {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  /* Drawer header */

  .dh-tab.active {
    background: var(--g1);
    border-top-color: var(--tc);
  }

  .dh-tab.active .dh-n { color: var(--tc); opacity: 0.7; }

  .dh-tab.active .dh-label { color: var(--g9); }

  /* Drawer content */

  /* ANALYZE workspace shared primitives */

  /* ── SCAN panel (trade_scan.jsx) ── */

  @keyframes scan-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

  .scan-card.active { background: var(--g2); border-color: var(--sc); box-shadow: 0 0 0 0.5px var(--sc); }

  @keyframes skeleton-fade { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }

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

  /* MiniChart */

  /* ── Layout switcher strip ─────────────────────────────────────────────── */

  /* scan-row: compact horizontal scan item for C sidebar */

  .scan-row.active { background: var(--g2); }

  /* ── Layout C — chart + peek bar + sidebar (merged C+D) ─────────────────── */

  /* merged layout: chart-section.lc-main = left pane (chart + peek) */

  /* Responsive: hide sidebar below 860px, chart-section goes full width */
  

  /* ── Decision HUD: right rail owns conclusions only ───────────────────── */

  .hud-action.active {
    background: var(--g2);
    border-color: var(--brand);
    color: var(--g9);
  }

  /* ── Analyze workspace: bottom owns verification/comparison/refinement ── */

  .phase-node.active {
    border-color: color-mix(in srgb, var(--amb) 55%, var(--g4));
    background: color-mix(in srgb, var(--amb) 11%, var(--g0));
  }

  .phase-node.active .phase-dot { background: var(--amb); box-shadow: 0 0 0 4px var(--amb-dd); }

  .phase-node.active .phase-label { color: var(--g9); font-weight: 700; }

  /* Visual salvage pass: less card noise, more trading-terminal density. */

  .micro-toggle-btn.active {
    color: #f3d58d;
    background: rgba(232,184,106,0.105);
    box-shadow: inset 0 0 0 1px rgba(232,184,106,0.22);
  }

  .pb-tab.active {
    background: rgba(255,255,255,0.028);
  }

  .dh-tab.active {
    background: rgba(255,255,255,0.026);
  }

  .phase-node.active {
    background: rgba(232,184,106,0.105);
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

  .observe-mode :global(.chart-live .chart-toolbar), .observe-mode :global(.chart-live .chart-header--tv) {
    display: none !important;
  }

  .observe-mode :global(.chart-live .chart-board) {
    border: none !important;
    border-radius: 0 !important;
    background: #0f131d !important;
  }

  

  /* ── Mobile layout ── */

  .mts-tab.active {
    color: var(--brand);
    background: var(--g1);
    border-top: 1.5px solid var(--brand);
  }

  /* ── Accessibility: Screen reader only text ── */

  /* ── Mobile loading ── */

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Proposal AI CTA (mobile) ── */

  /* ── JUDGE context header ── */

</style>
