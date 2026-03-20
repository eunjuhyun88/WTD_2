<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { AGDEFS } from '$lib/data/agents';
  import type { V2BattleResult, AgentBattleReport } from '$lib/engine/v2BattleTypes';
  import type { FBScore, Badge } from '$lib/engine/types';
  import { arenaV2State } from '$lib/stores/arenaV2State';
  import { saveV2ToRAG } from '$lib/engine/v2RagBridge';

  export let battleResult: V2BattleResult | null = null;
  export let lpDelta: number = 0;
  export let lpBreakdown: string[] = [];
  export let fbsScore: FBScore | null = null;
  export let badges: Badge[] = [];

  const dispatch = createEventDispatcher();

  // ── 5-Stage reveal system ──
  let stage = 0;
  let stageTimer: ReturnType<typeof setTimeout> | null = null;
  let skipEnabled = false;

  // Animated LP counter
  let displayedLP = 0;
  let lpInterval: ReturnType<typeof setInterval> | null = null;

  // Animated FBS bars
  let dsWidth = 0;
  let reWidth = 0;
  let ciWidth = 0;

  // Stage timings (ms)
  const STAGE_DELAYS = [0, 1500, 2000, 2000, 2000, 1500];

  $: isWin = battleResult?.outcome === 'tp_hit' || battleResult?.outcome === 'timeout_win';
  $: outcomeText = battleResult
    ? battleResult.outcome === 'tp_hit' ? 'TARGET ACHIEVED'
    : battleResult.outcome === 'sl_hit' ? 'STOPPED OUT'
    : battleResult.outcome === 'timeout_win' ? 'TIME UP — WIN'
    : 'TIME UP — LOSS'
    : '---';

  // ── Agent data helpers ──
  function getAgentDef(agentId: string) {
    return AGDEFS.find(a => a.id === agentId.toLowerCase());
  }

  function getAgentImg(agentId: string): string {
    const def = getAgentDef(agentId);
    return def?.img.def ?? '/doge/char-structure.png';
  }

  function getAgentWinImg(agentId: string): string {
    const def = getAgentDef(agentId);
    return def?.img.win ?? '/doge/state-win-arrow.png';
  }

  function getAgentLoseImg(agentId: string): string {
    const def = getAgentDef(agentId);
    return def?.img.alt ?? '/doge/state-bear-down.png';
  }

  function getAgentSpeech(agentId: string, won: boolean): string {
    const def = getAgentDef(agentId);
    if (!def) return won ? 'such wow!' : 'much learn...';
    return won ? def.speech.win : def.speech.lose;
  }

  // ── Computed battle LP (simple simulation) ──
  $: computedLP = (() => {
    if (!battleResult) return { base: 0, bonuses: [] as Array<{ label: string; val: number }>, total: 0 };

    const base = isWin ? 8 : -3;
    const bonuses: Array<{ label: string; val: number }> = [];

    if (isWin) {
      // Bonus for max combo
      if (battleResult.maxCombo >= 4) {
        bonuses.push({ label: 'Combo Master', val: 3 });
      } else if (battleResult.maxCombo >= 2) {
        bonuses.push({ label: 'Combo Bonus', val: 1 });
      }

      // Bonus for crits
      if (battleResult.totalCrits >= 3) {
        bonuses.push({ label: 'Critical Striker', val: 2 });
      }

      // Bonus for VS dominance
      if (battleResult.finalVS >= 75) {
        bonuses.push({ label: 'Dominance', val: 2 });
      }

      // TP hit precision bonus
      if (battleResult.outcome === 'tp_hit') {
        bonuses.push({ label: 'Sniper', val: 3 });
      }
    }

    const total = base + bonuses.reduce((s, b) => s + b.val, 0);
    return { base, bonuses, total };
  })();

  // ── Computed FBS scores ──
  $: computedFBS = (() => {
    if (!battleResult) return { ds: 0, re: 0, ci: 0, total: 0 };

    // Direction Score (did we pick the right direction?)
    const ds = isWin ? 85 : 35;

    // Risk/Execution (was the R:R good and did we handle SL well?)
    const re = Math.min(100, Math.max(20, 50 + battleResult.finalVS - 50 + battleResult.maxCombo * 3));

    // Confidence Index
    const ci = Math.min(100, Math.max(20, 40 + (isWin ? 30 : 0) + battleResult.totalCrits * 5));

    const total = Math.round((ds + re + ci) / 3);
    return { ds, re, ci, total };
  })();

  // ── Sorted agent reports ──
  $: sortedReports = battleResult?.agentReports
    .slice()
    .sort((a, b) => b.mvpScore - a.mvpScore) ?? [];

  // ── Stage progression ──
  function advanceStage() {
    if (stage < 5) {
      stage++;
      if (stage === 2) animateLP();
      if (stage === 3) animateFBS();

      // Auto-advance to next stage
      if (stage < 5 && STAGE_DELAYS[stage + 1]) {
        stageTimer = setTimeout(advanceStage, STAGE_DELAYS[stage + 1]);
      }
    }
  }

  function skipToEnd() {
    if (stageTimer) clearTimeout(stageTimer);
    if (lpInterval) clearInterval(lpInterval);
    stage = 5;
    displayedLP = computedLP.total;
    dsWidth = computedFBS.ds;
    reWidth = computedFBS.re;
    ciWidth = computedFBS.ci;
    skipEnabled = true;
  }

  function animateLP() {
    displayedLP = 0;
    let step = 0;
    const target = computedLP.total;
    const dir = target >= 0 ? 1 : -1;
    const abs = Math.abs(target);
    const stepCount = Math.max(8, abs * 2);
    let current = 0;

    lpInterval = setInterval(() => {
      step++;
      current = Math.round((step / stepCount) * target);
      displayedLP = current;
      if (step >= stepCount) {
        displayedLP = target;
        if (lpInterval) clearInterval(lpInterval);
      }
    }, 60);
  }

  function animateFBS() {
    dsWidth = 0; reWidth = 0; ciWidth = 0;
    setTimeout(() => { dsWidth = computedFBS.ds; }, 200);
    setTimeout(() => { reWidth = computedFBS.re; }, 400);
    setTimeout(() => { ciWidth = computedFBS.ci; }, 600);
  }

  onMount(() => {
    // Start stage 1 after brief pause
    stageTimer = setTimeout(advanceStage, 500);

    // Enable skip after 1s
    setTimeout(() => { skipEnabled = true; }, 1000);

    // Fire-and-forget RAG save
    if (battleResult) {
      const state = $arenaV2State;
      if (state.hypothesis && state.matchId && !state.ragSaved) {
        saveV2ToRAG(
          {
            selectedAgents: state.selectedAgents,
            findings: state.findings,
            hypothesis: { dir: state.hypothesis.dir, conf: state.hypothesis.conf },
            btcPrice: state.btcPrice,
            tier: state.squadConfig.tier,
            timeframe: state.squadConfig.timeframe,
            consensusType: state.consensusType,
          },
          battleResult,
          state.matchId,
        ).then(() => {
          arenaV2State.update(s => ({ ...s, ragSaved: true }));
        });
      }
    }
  });

  onDestroy(() => {
    if (stageTimer) clearTimeout(stageTimer);
    if (lpInterval) clearInterval(lpInterval);
  });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="result-screen" on:click={() => { if (skipEnabled && stage < 5) skipToEnd(); }}>

  {#if stage === 0}
    <!-- Pre-reveal black -->
    <div class="pre-reveal" />
  {/if}

  <!-- Stage 1: OUTCOME -->
  {#if stage >= 1}
    <div class="stage stage-outcome" class:active={stage === 1}>
      <div class="outcome-text" class:win={isWin} class:loss={!isWin}>
        {outcomeText}
      </div>
      {#if battleResult}
        <div class="outcome-pnl" class:positive={battleResult.finalPnL >= 0}>
          {battleResult.finalPnL >= 0 ? '+' : ''}{battleResult.finalPnL.toFixed(3)}%
        </div>
      {/if}
    </div>
  {/if}

  <!-- Stage 2: LP DELTA -->
  {#if stage >= 2}
    <div class="stage stage-lp" class:active={stage === 2}>
      <div class="lp-header">LEAGUE POINTS</div>
      <div class="lp-counter" class:positive={computedLP.total >= 0} class:negative={computedLP.total < 0}>
        {displayedLP >= 0 ? '+' : ''}{displayedLP}
      </div>
      <div class="lp-breakdown">
        <div class="lp-line">
          <span>Base</span>
          <span class:positive={computedLP.base >= 0}>{computedLP.base >= 0 ? '+' : ''}{computedLP.base}</span>
        </div>
        {#each computedLP.bonuses as bonus}
          <div class="lp-line bonus">
            <span>{bonus.label}</span>
            <span class="positive">+{bonus.val}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Stage 3: FBS SCORECARD -->
  {#if stage >= 3}
    <div class="stage stage-fbs" class:active={stage === 3}>
      <div class="fbs-header">
        <span class="fbs-label">FBS</span>
        <span class="fbs-total">{computedFBS.total}</span>
        <span class="fbs-max">/100</span>
      </div>
      <div class="fbs-bars">
        <div class="fbs-row">
          <span class="fbs-cat">DS</span>
          <div class="fbs-track">
            <div class="fbs-fill ds" style:width="{dsWidth}%" />
          </div>
          <span class="fbs-val">{computedFBS.ds}</span>
          <span class="fbs-desc">{computedFBS.ds >= 70 ? 'Direction correct' : 'Direction missed'}</span>
        </div>
        <div class="fbs-row">
          <span class="fbs-cat">RE</span>
          <div class="fbs-track">
            <div class="fbs-fill re" style:width="{reWidth}%" />
          </div>
          <span class="fbs-val">{computedFBS.re}</span>
          <span class="fbs-desc">{computedFBS.re >= 70 ? 'Clean execution' : 'Execution needs work'}</span>
        </div>
        <div class="fbs-row">
          <span class="fbs-cat">CI</span>
          <div class="fbs-track">
            <div class="fbs-fill ci" style:width="{ciWidth}%" />
          </div>
          <span class="fbs-val">{computedFBS.ci}</span>
          <span class="fbs-desc">{computedFBS.ci >= 70 ? 'Confidence matched' : 'Over/under confident'}</span>
        </div>
      </div>
    </div>
  {/if}

  <!-- Stage 4: AGENT REPORT -->
  {#if stage >= 4}
    <div class="stage stage-agents" class:active={stage === 4}>
      <div class="agents-header">AGENT REPORT</div>
      <div class="agent-reports">
        {#each sortedReports as report, i (report.agentId)}
          {@const def = getAgentDef(report.agentId)}
          {@const isMVP = i === 0}
          <div class="report-card" class:mvp={isMVP} style:animation-delay="{i * 200}ms">
            <div class="report-img-wrap">
              <img
                src={isWin ? getAgentWinImg(report.agentId) : getAgentLoseImg(report.agentId)}
                alt={report.agentId}
                class="report-img"
              />
              {#if isMVP}
                <div class="mvp-badge">MVP</div>
              {/if}
              {#if report.findingValidated === true}
                <div class="finding-badge valid">✓</div>
              {:else if report.findingValidated === false}
                <div class="finding-badge invalid">✗</div>
              {/if}
            </div>
            <div class="report-info">
              <div class="report-name">{report.agentId}</div>
              <div class="report-stats">
                <span>DMG: {report.totalDamage.toFixed(1)}</span>
                <span>BLK: {report.totalBlocked.toFixed(1)}</span>
                <span>CRIT: {report.criticalHits}</span>
              </div>
              <div class="report-speech">
                "{getAgentSpeech(report.agentId, isWin)}"
              </div>
            </div>
            <div class="report-stars">
              {#each Array(5) as _, s}
                <span class="star" class:filled={s < Math.ceil(report.mvpScore / 10)}>★</span>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Stage 5: BADGES + ACTIONS -->
  {#if stage >= 5}
    <div class="stage stage-final" class:active={stage === 5}>
      <!-- Quick stats row -->
      {#if battleResult}
        <div class="final-stats">
          <div class="fstat">
            <span class="fstat-val">{battleResult.finalVS.toFixed(0)}</span>
            <span class="fstat-label">VS</span>
          </div>
          <div class="fstat">
            <span class="fstat-val">{battleResult.maxCombo}</span>
            <span class="fstat-label">COMBO</span>
          </div>
          <div class="fstat">
            <span class="fstat-val">{battleResult.totalCrits}</span>
            <span class="fstat-label">CRITS</span>
          </div>
          <div class="fstat">
            <span class="fstat-val">{battleResult.totalTicks}</span>
            <span class="fstat-label">TICKS</span>
          </div>
        </div>
      {/if}

      <!-- Action buttons -->
      <div class="result-actions">
        <button class="btn-lobby" on:click={() => dispatch('goLobby')}>
          LOBBY
        </button>
        <button class="btn-again" on:click={() => dispatch('playAgain')}>
          ⚔ PLAY AGAIN
        </button>
      </div>
    </div>
  {/if}

  <!-- Skip hint -->
  {#if stage > 0 && stage < 5 && skipEnabled}
    <div class="skip-hint">click to skip</div>
  {/if}
</div>

<style>
  .result-screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #0A0908;
    color: #F0EDE4;
    font-family: var(--fm, 'JetBrains Mono', monospace);
    gap: 20px;
    padding: 24px;
    cursor: pointer;
    overflow-y: auto;
    position: relative;
  }

  .pre-reveal {
    position: absolute;
    inset: 0;
    background: #0A0908;
    z-index: 100;
    animation: preRevealFade 500ms ease 400ms forwards;
  }
  @keyframes preRevealFade {
    to { opacity: 0; pointer-events: none; }
  }

  /* ── Stage base ── */
  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    animation: stageReveal 500ms ease forwards;
    opacity: 0;
    width: 100%;
    max-width: 480px;
  }
  .stage.active {
    animation: stageRevealActive 600ms ease forwards;
  }
  @keyframes stageReveal {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 0.6; transform: translateY(0); }
  }
  @keyframes stageRevealActive {
    from { opacity: 0; transform: translateY(12px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* ── Stage 1: Outcome ── */
  .outcome-text {
    font-size: 28px;
    font-weight: 900;
    letter-spacing: 6px;
    font-family: var(--fb, 'Space Grotesk', sans-serif);
    text-align: center;
  }
  .outcome-text.win {
    color: #00ff88;
    text-shadow: 0 0 40px rgba(0,255,136,0.3);
  }
  .outcome-text.loss {
    color: #ff2d55;
    text-shadow: 0 0 40px rgba(255,45,85,0.3);
  }
  .outcome-pnl {
    font-size: 22px;
    font-weight: 900;
    color: #ff2d55;
    font-variant-numeric: tabular-nums;
  }
  .outcome-pnl.positive { color: #00ff88; }

  /* ── Stage 2: LP Delta ── */
  .lp-header {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 4px;
    color: rgba(240,237,228,0.3);
  }
  .lp-counter {
    font-size: 40px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    transition: color 300ms;
  }
  .lp-counter.positive { color: #00ff88; }
  .lp-counter.negative { color: #ff2d55; }
  .lp-breakdown {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    max-width: 240px;
  }
  .lp-line {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: rgba(240,237,228,0.4);
  }
  .lp-line.bonus {
    color: #FFD700;
    animation: bonusPop 400ms ease;
  }
  .positive { color: #00ff88 !important; }
  @keyframes bonusPop {
    from { opacity: 0; transform: translateX(-8px); }
    to { opacity: 1; transform: translateX(0); }
  }

  /* ── Stage 3: FBS ── */
  .fbs-header {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 4px;
  }
  .fbs-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 3px;
    color: rgba(240,237,228,0.3);
  }
  .fbs-total {
    font-size: 24px;
    font-weight: 900;
    color: #E8967D;
  }
  .fbs-max {
    font-size: 12px;
    color: rgba(240,237,228,0.2);
  }
  .fbs-bars {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }
  .fbs-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .fbs-cat {
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 1px;
    color: rgba(240,237,228,0.5);
    width: 22px;
  }
  .fbs-track {
    flex: 1;
    height: 8px;
    background: rgba(240,237,228,0.06);
    border-radius: 4px;
    overflow: hidden;
  }
  .fbs-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 800ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .fbs-fill.ds { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }
  .fbs-fill.re { background: linear-gradient(90deg, #E8967D, #f0b090); }
  .fbs-fill.ci { background: linear-gradient(90deg, #00cc66, #00ff88); }
  .fbs-val {
    font-size: 11px;
    font-weight: 800;
    color: rgba(240,237,228,0.7);
    width: 28px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .fbs-desc {
    font-size: 8px;
    color: rgba(240,237,228,0.25);
    width: 120px;
  }

  /* ── Stage 4: Agent Reports ── */
  .agents-header {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 4px;
    color: rgba(240,237,228,0.3);
    margin-bottom: 4px;
  }
  .agent-reports {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }
  .report-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border: 1px solid rgba(240,237,228,0.06);
    border-radius: 8px;
    background: rgba(240,237,228,0.02);
    animation: reportSlide 400ms ease forwards;
    opacity: 0;
  }
  .report-card.mvp {
    border-color: rgba(255,215,0,0.25);
    background: rgba(255,215,0,0.03);
  }
  @keyframes reportSlide {
    from { opacity: 0; transform: translateX(-12px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .report-img-wrap {
    position: relative;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
  }
  .report-img {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(240,237,228,0.1);
  }
  .mvp-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    font-size: 7px;
    font-weight: 900;
    color: #0A0908;
    background: #FFD700;
    padding: 1px 4px;
    border-radius: 3px;
    letter-spacing: 1px;
  }
  .finding-badge {
    position: absolute;
    bottom: -2px;
    right: -2px;
    font-size: 8px;
    font-weight: 900;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .finding-badge.valid {
    background: #00ff88;
    color: #0A0908;
  }
  .finding-badge.invalid {
    background: #ff2d55;
    color: #0A0908;
  }

  .report-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .report-name {
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 2px;
    color: rgba(240,237,228,0.7);
  }
  .report-stats {
    display: flex;
    gap: 10px;
    font-size: 8px;
    color: rgba(240,237,228,0.4);
  }
  .report-speech {
    font-size: 8px;
    color: rgba(240,237,228,0.3);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .report-stars {
    display: flex;
    gap: 1px;
    flex-shrink: 0;
  }
  .star {
    font-size: 10px;
    color: rgba(240,237,228,0.1);
  }
  .star.filled { color: #FFD700; }

  /* ── Stage 5: Final ── */
  .final-stats {
    display: flex;
    gap: 24px;
    margin-bottom: 8px;
  }
  .fstat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .fstat-val {
    font-size: 18px;
    font-weight: 900;
    color: #F0EDE4;
    font-variant-numeric: tabular-nums;
  }
  .fstat-label {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 2px;
    color: rgba(240,237,228,0.3);
  }

  .result-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }
  .result-actions button {
    padding: 12px 32px;
    border: 1px solid rgba(240,237,228,0.2);
    border-radius: 10px;
    background: rgba(240,237,228,0.04);
    color: #F0EDE4;
    font-family: var(--fm, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 3px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .result-actions button:hover {
    background: rgba(240,237,228,0.08);
    border-color: rgba(240,237,228,0.4);
    transform: scale(1.02);
  }
  .btn-again {
    border-color: rgba(232,150,125,0.4) !important;
    color: #E8967D !important;
    background: rgba(232,150,125,0.06) !important;
  }
  .btn-again:hover {
    background: rgba(232,150,125,0.12) !important;
    box-shadow: 0 0 20px rgba(232,150,125,0.15);
  }

  /* ── Skip hint ── */
  .skip-hint {
    position: absolute;
    bottom: 16px;
    right: 20px;
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 2px;
    color: rgba(240,237,228,0.15);
    animation: hintBlink 2s ease infinite;
  }
  @keyframes hintBlink {
    0%, 100% { opacity: 0.15; }
    50% { opacity: 0.35; }
  }
</style>
