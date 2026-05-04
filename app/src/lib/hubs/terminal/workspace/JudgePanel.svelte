<script lang="ts">
  import ConfluenceBanner from '$lib/components/confluence/ConfluenceBanner.svelte';
  import '../../../../styles/panel-base.css';
  import '../../../../styles/JudgePanel.css';

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

  interface AiAskEvent {
    intent: string;
    query: string;
    ts: number;
  }

  interface Props {
    data: JudgeData;
    actions: JudgeActions;
    aiAsk?: AiAskEvent | null;
    onClearAiAsk?: () => void;
  }

  let { data, actions, aiAsk = null, onClearAiAsk }: Props = $props();

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

  const AI_ASK_TTL_MS = 30_000;
  const showAiAskBanner = $derived(
    aiAsk !== null && Date.now() - aiAsk.ts < AI_ASK_TTL_MS
  );
</script>

<div class="tm-act-panel">
  {#if showAiAskBanner && aiAsk}
    <div class="ai-ask-banner">
      <span class="ai-ask-text">🤖 AI ask · "{aiAsk.query}"</span>
      <button class="ai-ask-clear" onclick={() => onClearAiAsk?.()} aria-label="Clear AI ask">✕</button>
    </div>
  {/if}
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
        <span class="judge-q">Is this setup <strong>worth my money?</strong></span>
      </div>
      <div class="judge-btns">
        <button
          class="judge-btn agree"
          class:active={judgeVerdict === 'agree'}
          onclick={() => onSetJudgeVerdict('agree')}
        >
          <span class="jb-key">Y</span>
          <div class="jb-text"><span class="jb-label">AGREE</span><span class="jb-sub">Enter</span></div>
        </button>
        <button
          class="judge-btn disagree"
          class:active={judgeVerdict === 'disagree'}
          onclick={() => onSetJudgeVerdict('disagree')}
        >
          <span class="jb-key">N</span>
          <div class="jb-text"><span class="jb-label">DISAGREE</span><span class="jb-sub">Pass</span></div>
        </button>
      </div>
      <div class="judge-tags">
        {#each ['Insufficient evidence', 'Low R:R', 'Wrong regime', 'FOMO', 'Oversized'] as tag}
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
            <span class="result-hint">Saving…</span>
          {:else if judgeSubmitResult?.saved}
            <span class="result-hint" style:color="var(--pos)">
              Saved {judgeSubmitResult.training_triggered ? '· Training started' : `· ${judgeSubmitResult.count} records`}
            </span>
          {:else}
            <span class="result-hint">Connecting to flywheel</span>
          {/if}
        </div>
        <div class="rejudge-label">REJUDGE</div>
        <div class="rejudge-btns">
          <button class="rj-btn rj-pos" class:active={judgeRejudged === 'right'} onclick={() => onSetJudgeRejudged('right')}>
            Correct <span class="rj-sub">+reinforce</span>
          </button>
          <button class="rj-btn rj-neg" class:active={judgeRejudged === 'wrong'} onclick={() => onSetJudgeRejudged('wrong')}>
            Wrong <span class="rj-sub">flip</span>
          </button>
        </div>
        {#if judgeVerdict && judgeRejudged}
          {@const consistent = (judgeVerdict === 'agree' && judgeRejudged === 'right') || (judgeVerdict === 'disagree' && judgeRejudged === 'wrong')}
          <div class="tm-bias-box" class:tm-bias-good={consistent} class:tm-bias-warn={!consistent}>
            {#if consistent}
              <strong>✓ Consistent judgment</strong> <span>· weight +0.04</span>
            {:else}
              <strong>⚑ Bias detected</strong> <span>· Training recommended</span>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="tm-after-empty">Select a trade outcome<br>to re-judge</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .ai-ask-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 24px;
    padding: 0 8px;
    background: var(--g2);
    border-bottom: 1px solid var(--g4);
    color: var(--g7);
    font-family: monospace;
    font-size: 11px;
    flex-shrink: 0;
  }
  .ai-ask-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ai-ask-clear {
    background: none;
    border: none;
    color: var(--g7);
    cursor: pointer;
    font-size: 11px;
    padding: 0 0 0 8px;
    flex-shrink: 0;
    line-height: 1;
  }
</style>

