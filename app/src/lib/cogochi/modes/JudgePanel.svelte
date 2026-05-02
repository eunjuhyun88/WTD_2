<script lang="ts">
  import ConfluenceBanner from '$lib/components/confluence/ConfluenceBanner.svelte';
  import '../../../styles/panel-base.css';
  import '../../../styles/JudgePanel.css';

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

