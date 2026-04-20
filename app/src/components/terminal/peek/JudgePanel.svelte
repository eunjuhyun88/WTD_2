<script lang="ts">
  /**
   * JudgePanel — JUDGE tab content.
   * 3-column horizontal layout:
   *   A · TRADE PLAN (price levels + R:R bar + size + exchange CTA)
   *   B · JUDGE NOW (Y/N hero buttons + tag chips)
   *   C · AFTER RESULT (WIN/LOSS/FLAT + rejudge)
   */
  import type { PatternCaptureRecord } from '$lib/contracts/terminalPersistence';
  import type { TerminalVerdict } from '$lib/types/terminal';

  type JudgmentVerdict = 'bullish' | 'bearish' | 'neutral';
  type OutcomeLabel = 'correct' | 'wrong' | 'partial' | 'timeout';
  type Outcome = 'win' | 'loss' | 'flat' | null;
  type Rejudged = 'right' | 'wrong' | null;

  interface Props {
    symbol?: string;
    timeframe?: string;
    verdict?: TerminalVerdict | null;
    entry?: number | null;
    stop?: number | null;
    target?: number | null;
    pWin?: number | null;
    lastPrice?: number | null;
    captures?: PatternCaptureRecord[];
    saving?: boolean;
    onSaveJudgment?: (input: { verdict: JudgmentVerdict; note: string }) => void;
    onRejudge?: (input: { captureId: string; outcome: OutcomeLabel; note: string }) => void;
    onOpenCapture?: (record: PatternCaptureRecord) => void;
  }

  let {
    symbol = 'BTCUSDT',
    timeframe = '4h',
    verdict = null,
    entry = null,
    stop = null,
    target = null,
    pWin = null,
    lastPrice = null,
    captures = [],
    saving = false,
    onSaveJudgment,
    onRejudge,
    onOpenCapture,
  }: Props = $props();

  let judgeVerdict = $state<'agree' | 'disagree' | null>(null);
  let outcome = $state<Outcome>(null);
  let rejudged = $state<Rejudged>(null);

  function fmt(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return '—';
    return v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v.toFixed(4);
  }

  function pct(a: number | null, b: number | null): string {
    if (a == null || b == null || b === 0) return '';
    const p = ((a - b) / b) * 100;
    return `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;
  }

  const rr = $derived.by(() => {
    if (entry == null || stop == null || target == null) return null;
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    if (risk === 0) return null;
    return reward / risk;
  });

  const rrPct = $derived(rr != null ? rr / (1 + rr) : 0.8);

  // Static pattern info (will come from store later)
  const pattern = 'OI reversal';
  let dir = $state<'long' | 'short'>('long');
  const alpha = 82;
  const entryVal = entry ?? 83700;
  const stopVal = stop ?? 82800;
  const targetVal = target ?? 87500;
  const rrVal = rr ?? 4.2;
</script>

<div class="judge">
  <!-- Header -->
  <div class="header">
    <span class="step">STEP 04 · ACT & JUDGE</span>
    <span class="div"></span>
    <span class="sym">{symbol.replace(/USDT$/, '') + 'USDT'}</span>
    <span class="tf">{timeframe.toUpperCase()}</span>
    <span class="dir" class:long={dir === 'long'} class:short={dir === 'short'}>{dir.toUpperCase()}</span>
    <span class="pat">{pattern}</span>
    <span class="spacer"></span>
    <span class="alpha" class:hi={alpha >= 75}>α{alpha}</span>
  </div>

  <!-- 3-column body -->
  <div class="body">
    <!-- A · TRADE PLAN -->
    <section class="plan">
      <div class="sec-label">A · TRADE PLAN</div>

      <!-- Price levels -->
      <div class="lvl-row">
        <div class="lvl">
          <span class="lk">entry</span>
          <span class="lv">{fmt(entryVal)}</span>
        </div>
        <div class="lvl neg">
          <span class="lk">stop</span>
          <span class="lv">{fmt(stopVal)}</span>
          <span class="lh">{pct(stopVal, entryVal)}</span>
        </div>
        <div class="lvl pos">
          <span class="lk">target</span>
          <span class="lv">{fmt(targetVal)}</span>
          <span class="lh">{pct(targetVal, entryVal)}</span>
        </div>
        <div class="lvl">
          <span class="lk">R:R</span>
          <span class="lv">{rrVal.toFixed(1)}x</span>
          <span class="lh">hist 3.6</span>
        </div>
      </div>

      <!-- R:R visual + size -->
      <div class="metrics-row">
        <div class="rr-box">
          <div class="rr-title">RISK:REWARD</div>
          <div class="rr-bar">
            <div class="rr-risk" style:width="{100 / (1 + rrVal)}%"></div>
            <div class="rr-reward" style:width="{rrVal * 100 / (1 + rrVal)}%"></div>
          </div>
          <div class="rr-labels">
            <span class="rr-l-neg">1R</span>
            <span class="rr-l-pos">{rrVal.toFixed(1)}R</span>
          </div>
        </div>
        <div class="size-box">
          <div class="size-title">SIZE · 3x lev</div>
          <div class="size-val">
            <span class="size-pct">1.2%</span>
            <span class="size-usd">$1,200</span>
          </div>
        </div>
      </div>

      <button class="exchange-btn">OPEN IN EXCHANGE ↗</button>
    </section>

    <div class="col-div"></div>

    <!-- B · JUDGE NOW -->
    <section class="judge-now">
      <div class="sec-label amber">B · JUDGE NOW</div>
      <div class="judge-q">이 셋업, <strong>내 돈을 걸만한가?</strong></div>

      <div class="judge-btns">
        <button
          class="jbtn agree"
          class:active={judgeVerdict === 'agree'}
          onclick={() => judgeVerdict = judgeVerdict === 'agree' ? null : 'agree'}
        >
          <span class="jbtn-k">Y</span>
          <div class="jbtn-text">
            <span class="jbtn-label">AGREE</span>
            <span class="jbtn-sub">진입</span>
          </div>
        </button>
        <button
          class="jbtn disagree"
          class:active={judgeVerdict === 'disagree'}
          onclick={() => judgeVerdict = judgeVerdict === 'disagree' ? null : 'disagree'}
        >
          <span class="jbtn-k">N</span>
          <div class="jbtn-text">
            <span class="jbtn-label">DISAGREE</span>
            <span class="jbtn-sub">패스</span>
          </div>
        </button>
      </div>

      <!-- Tag chips -->
      <div class="tags">
        {#each ['확증부족', 'R:R낮음', 'regime안맞음', 'FOMO', '크기초과'] as tag}
          <span class="tag">{tag}</span>
        {/each}
      </div>
    </section>

    <div class="col-div"></div>

    <!-- C · AFTER RESULT -->
    <section class="after">
      <div class="sec-label blue">C · AFTER RESULT</div>

      <div class="outcome-row">
        {#each [
          { k: 'win', l: 'WIN', c: 'pos' },
          { k: 'loss', l: 'LOSS', c: 'neg' },
          { k: 'flat', l: 'FLAT', c: 'neu' },
        ] as o}
          <button
            class="out-btn"
            class:selected={outcome === o.k}
            data-tone={o.c}
            onclick={() => outcome = outcome === (o.k as Outcome) ? null : (o.k as Outcome)}
          >{o.l}</button>
        {/each}
      </div>

      {#if outcome}
        <div class="result-row">
          <span class="result-label">RESULT</span>
          <span class="result-val" class:pos={outcome === 'win'} class:neg={outcome === 'loss'}>
            {outcome === 'win' ? '+3.4%' : outcome === 'loss' ? '−1.1%' : '+0.1%'}
          </span>
          <span class="spacer"></span>
          <span class="result-meta">
            {outcome === 'win' ? 'target · 2h 14m' : outcome === 'loss' ? 'stop · 42m' : 'flat · 6h'}
          </span>
        </div>

        <div class="rejudge-label">REJUDGE</div>
        <div class="rejudge-btns">
          <button
            class="rjbtn pos"
            class:active={rejudged === 'right'}
            onclick={() => rejudged = rejudged === 'right' ? null : 'right'}
          >옳았다 <span class="rj-sub">+보강</span></button>
          <button
            class="rjbtn neg"
            class:active={rejudged === 'wrong'}
            onclick={() => rejudged = rejudged === 'wrong' ? null : 'wrong'}
          >틀렸다 <span class="rj-sub">뒤집기</span></button>
        </div>

        {#if judgeVerdict && rejudged}
          {@const consistent = (judgeVerdict === 'agree' && rejudged === 'right') || (judgeVerdict === 'disagree' && rejudged === 'wrong')}
          <div class="feedback" class:consistent>
            {#if consistent}
              <strong>✓ 일관 판정</strong> <span class="fb-sub">· 가중치 +0.04</span>
            {:else}
              <strong>⚑ 편향 감지</strong> <span class="fb-sub">· Train 권장</span>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="after-empty">매매 결과 선택시<br/>재판정 가능</div>
      {/if}
    </section>
  </div>
</div>

<style>
  .judge {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--g1);
    overflow: hidden;
    min-height: 0;
    font-family: 'JetBrains Mono', monospace;
  }

  .header {
    padding: 6px 14px;
    border-bottom: 0.5px solid var(--g3);
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--g0);
    flex-shrink: 0;
    height: 34px;
    font-size: 9px;
  }
  .step { font-size: 7px; color: var(--amb); letter-spacing: 0.22em; }
  .div { width: 1px; height: 12px; background: var(--g3); }
  .sym { font-size: 12px; color: var(--g9); font-weight: 600; }
  .tf { color: var(--g6); }
  .dir { font-weight: 600; letter-spacing: 0.06em; }
  .dir.long { color: var(--pos); }
  .dir.short { color: var(--neg); }
  .pat { color: var(--g5); }
  .spacer { flex: 1; }
  .alpha {
    padding: 2px 7px;
    background: var(--g2);
    border-radius: 3px;
    font-size: 10px;
    color: var(--amb);
    font-weight: 600;
  }
  .alpha.hi { color: var(--pos); }

  /* 3-column body */
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }
  .col-div { width: 0.5px; background: var(--g3); flex-shrink: 0; }

  section {
    flex: 1.2;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
  }
  section.judge-now { flex: 1.4; }
  section.after { flex: 1.2; }

  .sec-label {
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.2em;
    flex-shrink: 0;
  }
  .sec-label.amber { color: var(--amb); }
  .sec-label.blue { color: #7aa2e0; }

  /* Plan section */
  .lvl-row {
    display: flex;
    gap: 5px;
  }
  .lvl {
    flex: 1;
    padding: 5px 7px;
    background: var(--g0);
    border: 0.5px solid var(--g3);
    border-radius: 3px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .lk {
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.14em;
  }
  .lv {
    font-size: 12px;
    color: var(--g9);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lvl.neg .lv { color: var(--neg); }
  .lvl.pos .lv { color: var(--pos); }
  .lh { font-size: 7px; color: var(--g6); }

  .metrics-row {
    display: flex;
    gap: 6px;
  }
  .rr-box, .size-box {
    flex: 1;
    padding: 6px 9px;
    background: var(--g0);
    border: 0.5px solid var(--g3);
    border-radius: 3px;
    min-width: 0;
  }
  .rr-title, .size-title {
    font-size: 7px;
    color: var(--g5);
    letter-spacing: 0.1em;
    margin-bottom: 4px;
  }
  .rr-bar {
    height: 5px;
    background: var(--g2);
    border-radius: 3px;
    overflow: hidden;
    display: flex;
  }
  .rr-risk { background: var(--neg); opacity: 0.9; }
  .rr-reward { background: var(--pos); }
  .rr-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 3px;
    font-size: 8px;
  }
  .rr-l-neg { color: var(--neg); }
  .rr-l-pos { color: var(--pos); }
  .size-val {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .size-pct { font-size: 16px; color: var(--g9); font-weight: 600; }
  .size-usd { font-size: 9px; color: var(--g6); }

  .exchange-btn {
    padding: 7px 12px;
    background: var(--pos-dd);
    color: var(--pos);
    border: 0.5px solid var(--pos-d);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.1em;
    cursor: pointer;
    text-align: center;
  }
  .exchange-btn:hover { background: var(--pos-d); }

  /* Judge now */
  .judge-q {
    font-size: 10px;
    color: var(--g7);
    flex-shrink: 0;
  }
  .judge-q strong { color: var(--g9); }

  .judge-btns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
    flex: 1;
    min-height: 70px;
  }
  .jbtn {
    padding: 8px 10px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    cursor: pointer;
    transition: all 0.12s;
    font-family: 'JetBrains Mono', monospace;
  }
  .jbtn.agree {
    background: var(--pos-dd);
    color: var(--pos);
    border: 1.5px solid var(--pos-d);
  }
  .jbtn.agree.active {
    background: var(--pos-d);
    border-color: var(--pos);
  }
  .jbtn.disagree {
    background: var(--neg-dd);
    color: var(--neg);
    border: 1.5px solid var(--neg-d);
  }
  .jbtn.disagree.active {
    background: var(--neg-d);
    border-color: var(--neg);
  }
  .jbtn-k { font-size: 22px; font-weight: 700; letter-spacing: 0.04em; }
  .jbtn-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.2;
  }
  .jbtn-label { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; }
  .jbtn-sub { font-size: 8px; opacity: 0.75; }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    flex-shrink: 0;
  }
  .tag {
    font-size: 8px;
    padding: 2px 6px;
    background: var(--g2);
    color: var(--g6);
    border: 0.5px solid var(--g3);
    border-radius: 10px;
    cursor: pointer;
    white-space: nowrap;
  }
  .tag:hover { background: var(--g3); color: var(--g8); }

  /* After result */
  .outcome-row {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
  }
  .out-btn {
    flex: 1;
    padding: 5px 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.08em;
    background: transparent;
    color: var(--g6);
    border: 0.5px solid var(--g3);
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .out-btn.selected[data-tone='pos'] { background: var(--pos-dd); color: var(--pos); border-color: var(--pos); }
  .out-btn.selected[data-tone='neg'] { background: var(--neg-dd); color: var(--neg); border-color: var(--neg); }
  .out-btn.selected[data-tone='neu'] { background: var(--g2); color: var(--g7); border-color: var(--g5); }

  .result-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    background: var(--g0);
    border: 0.5px solid var(--g3);
    border-radius: 3px;
    font-size: 7px;
    flex-shrink: 0;
  }
  .result-label { color: var(--g5); letter-spacing: 0.12em; }
  .result-val { font-size: 13px; color: var(--g7); font-weight: 600; }
  .result-val.pos { color: var(--pos); }
  .result-val.neg { color: var(--neg); }
  .result-meta { color: var(--g6); }

  .rejudge-label {
    font-size: 7px;
    color: var(--amb);
    letter-spacing: 0.14em;
    flex-shrink: 0;
  }
  .rejudge-btns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    flex-shrink: 0;
  }
  .rjbtn {
    padding: 7px 6px;
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: all 0.12s;
  }
  .rjbtn.pos {
    background: var(--pos-dd);
    color: var(--pos);
    border: 1px solid var(--pos-d);
  }
  .rjbtn.pos.active { background: var(--pos-d); border-color: var(--pos); }
  .rjbtn.neg {
    background: var(--neg-dd);
    color: var(--neg);
    border: 1px solid var(--neg-d);
  }
  .rjbtn.neg.active { background: var(--neg-d); border-color: var(--neg); }
  .rj-sub { opacity: 0.6; font-size: 8px; }

  .feedback {
    padding: 5px 8px;
    border-radius: 3px;
    font-size: 9px;
    line-height: 1.5;
    background: var(--amb-dd);
    border: 0.5px solid var(--amb-d);
    color: var(--amb);
    flex-shrink: 0;
  }
  .feedback.consistent {
    background: var(--pos-dd);
    border-color: var(--pos-d);
    color: var(--pos);
  }
  .fb-sub { color: var(--g8); }

  .after-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    border: 0.5px dashed var(--g3);
    border-radius: 3px;
    font-size: 10px;
    color: var(--g5);
    text-align: center;
    line-height: 1.6;
  }
</style>
