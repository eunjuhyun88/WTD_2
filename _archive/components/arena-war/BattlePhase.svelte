<!-- ═══════════════════════════════════════════
  BattlePhase.svelte — v3 배틀: PixiJS + 차트 리딩 챌린지
  HP 시스템 + 세미 오토 배틀 + 플레이어 개입
═══════════════════════════════════════════ -->
<script lang="ts">
  import {
    arenaWarStore,
    arenaWarTimer,
    addBattleAction,
    submitBattleChallengeAnswer,
    switchBattleLead,
    activateBattleGuard,
  } from '$lib/stores/arenaWarStore';
  import type { AgentId } from '$lib/engine/types';
  import type { V3BattleState, ChartChallenge } from '$lib/engine/v3BattleTypes';
  import { getAgentCharacter } from '$lib/engine/agentCharacter';
  import { getTeamHPPercent } from '$lib/engine/v3BattleEngine';
  import BattleCanvas from './BattleCanvas.svelte';
  import ChallengeOverlay from './ChallengeOverlay.svelte';

  let ws = $derived($arenaWarStore);
  let timer = $derived($arenaWarTimer);

  // ── v3 State (from store or simulated) ──
  let v3State = $derived(ws.v3BattleState);

  // ── Current candle data ──
  let currentCandle = $derived(ws.battleKlines[ws.battleCurrentIndex]);
  let prevCandles = $derived(ws.battleKlines.slice(0, ws.battleCurrentIndex + 1));

  // ── HP percentages ──
  let humanHPPct = $derived(v3State ? getTeamHPPercent(v3State.humanAgents) : 100);
  let aiHPPct = $derived(v3State ? getTeamHPPercent(v3State.aiAgents) : 100);

  // ── Active challenge ──
  let activeChallenge = $derived(v3State?.activeChallenge ?? null);
  let challengeScore = $derived(v3State?.challengeScore ?? { correct: 0, wrong: 0, timeout: 0, total: 0 });

  // ── VS Meter ──
  let vsValue = $derived(v3State?.v2State.vsMeter.value ?? 50);
  let comboCount = $derived(v3State?.v2State.combo.count ?? 0);

  // ── Screen shake ──
  let screenShake = $derived(() => {
    if (!v3State) return { px: 0, ms: 0 };
    const milestones = v3State.v2State.milestones;
    if (milestones.length === 0) return { px: 0, ms: 0 };
    const last = milestones[milestones.length - 1];
    return { px: last.screenShakeIntensity, ms: last.screenShakeDuration };
  });

  // ── PnL ──
  let humanPnl = $derived(() => {
    if (!currentCandle || !ws.humanEntryPrice) return 0;
    const dir = ws.humanDirection;
    if (dir === 'LONG') return (currentCandle.close - ws.humanEntryPrice) / ws.humanEntryPrice;
    if (dir === 'SHORT') return (ws.humanEntryPrice - currentCandle.close) / ws.humanEntryPrice;
    return 0;
  });

  // ── Battle log (latest 5) ──
  let battleLog = $derived(() => {
    if (!v3State) return [];
    return v3State.v2State.log.slice(-5);
  });

  // ── Decision point check ──
  let isDecisionPoint = $derived(ws.battleCurrentIndex > 0 && ws.battleCurrentIndex % 8 === 0);

  // ── Handlers ──
  function handleChallengeAnswer(answer: string) {
    submitBattleChallengeAnswer(answer);
  }

  function handleSwitchLead(idx: number) {
    switchBattleLead(idx);
  }

  function handleGuard() {
    activateBattleGuard();
  }

  // Mini chart SVG
  let chartPath = $derived(() => {
    if (prevCandles.length < 2) return '';
    const prices = prevCandles.map(c => c.close);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const w = 300;
    const h = 50;

    return prices.map((p, i) => {
      const x = (i / (prices.length - 1)) * w;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  });
</script>

<div class="battle-phase">
  <!-- ── Header ── -->
  <div class="battle-header">
    <div class="header-left">
      <span class="battle-title">BATTLE</span>
      <span class="tick-counter">
        TICK {v3State?.v2State.tickN ?? ws.battleCurrentIndex}/{v3State?.v2State.maxTicks ?? ws.battleKlines.length}
      </span>
    </div>
    <div class="header-center">
      <div class="vs-meter-mini">
        <div class="vs-fill" style="width: {vsValue}%"
             class:winning={vsValue > 55}
             class:losing={vsValue < 45}></div>
        <span class="vs-value">{Math.round(vsValue)}</span>
      </div>
      {#if comboCount >= 2}
        <span class="combo-badge">{comboCount}-HIT COMBO!</span>
      {/if}
    </div>
    <div class="header-right">
      <div class="challenge-score">
        <span class="score-label">CHALLENGE</span>
        <span class="score-value">{challengeScore.correct}/{challengeScore.total}</span>
      </div>
      <span class="timer">{timer}s</span>
    </div>
  </div>

  <!-- ── Battle Canvas (PixiJS or CSS fallback) ── -->
  <div class="canvas-area">
    {#if v3State}
      <BattleCanvas {v3State} screenShake={screenShake()} />

      <!-- Challenge Overlay -->
      {#if activeChallenge && activeChallenge.result === 'pending'}
        <ChallengeOverlay
          challenge={activeChallenge}
          onAnswer={handleChallengeAnswer}
        />
      {/if}
    {:else}
      <!-- Fallback: simple battle display when v3 not initialized -->
      <div class="fallback-display">
        <p>Battle loading...</p>
      </div>
    {/if}
  </div>

  <!-- ── Team HP Summary ── -->
  <div class="team-hp-summary">
    <div class="hp-side human">
      <span class="hp-label">{ws.selectedMode === 'spectator' ? 'TEAM A' : 'YOUR TEAM'}</span>
      <div class="hp-bar-bg">
        <div class="hp-bar-fill human-fill" style="width: {humanHPPct}%"></div>
      </div>
      <span class="hp-pct">{Math.round(humanHPPct)}%</span>
    </div>
    <div class="hp-side ai">
      <span class="hp-label">{ws.selectedMode === 'spectator' ? 'TEAM B' : 'AI TEAM'}</span>
      <div class="hp-bar-bg">
        <div class="hp-bar-fill ai-fill" style="width: {aiHPPct}%"></div>
      </div>
      <span class="hp-pct">{Math.round(aiHPPct)}%</span>
    </div>
  </div>

  <!-- ── Agent Switch Buttons ── -->
  {#if v3State && ws.selectedMode !== 'spectator'}
    <div class="switch-panel">
      <span class="switch-label">SWITCH LEAD:</span>
      {#each v3State.humanAgents as agent, i}
        {@const char = getAgentCharacter(agent.agentId)}
        <button
          class="switch-btn"
          class:active={i === v3State.humanLeadIdx}
          class:ko={agent.isKO}
          disabled={agent.isKO || i === v3State.humanLeadIdx || v3State.switchCooldown > 0}
          onclick={() => handleSwitchLead(i)}
          style:--btn-color={char.color}
        >
          <span class="switch-initial" style:background={char.gradientCSS}>
            {agent.agentId.charAt(0)}
          </span>
          <span class="switch-hp">{Math.ceil(agent.hp)}</span>
        </button>
      {/each}
      {#if v3State.switchCooldown > 0}
        <span class="cooldown-text">CD: {v3State.switchCooldown}</span>
      {/if}
    </div>
  {/if}

  <!-- ── Mini Chart + PnL ── -->
  <div class="bottom-panel">
    <div class="mini-chart">
      <svg viewBox="0 0 300 50" preserveAspectRatio="none">
        <path d={chartPath()} fill="none" stroke-width="1.5"
              stroke={humanPnl() >= 0 ? '#48d868' : '#f85858'} />
        <!-- TP line -->
        {#if currentCandle && ws.humanTp}
          {@const prices = prevCandles.map(c => c.close)}
          {@const min = Math.min(...prices)}
          {@const max = Math.max(...prices)}
          {@const range = max - min || 1}
          {@const tpY = 50 - ((ws.humanTp - min) / range) * 50}
          <line x1="0" y1={tpY} x2="300" y2={tpY}
                stroke="#48d868" stroke-width="0.5" stroke-dasharray="4,4" />
        {/if}
        <!-- SL line -->
        {#if currentCandle && ws.humanSl}
          {@const prices = prevCandles.map(c => c.close)}
          {@const min = Math.min(...prices)}
          {@const max = Math.max(...prices)}
          {@const range = max - min || 1}
          {@const slY = 50 - ((ws.humanSl - min) / range) * 50}
          <line x1="0" y1={slY} x2="300" y2={slY}
                stroke="#f85858" stroke-width="0.5" stroke-dasharray="4,4" />
        {/if}
      </svg>
    </div>

    <div class="pnl-display">
      <span class="pnl-label">PnL</span>
      <span class="pnl-value" class:positive={humanPnl() >= 0} class:negative={humanPnl() < 0}>
        {humanPnl() >= 0 ? '+' : ''}{(humanPnl() * 100).toFixed(3)}%
      </span>
    </div>

    <!-- Decision Point Actions -->
    {#if isDecisionPoint && ws.selectedMode !== 'spectator'}
      <div class="decision-actions">
        <button class="action-btn hold" onclick={() => addBattleAction('HOLD')}>HOLD</button>
        <button class="action-btn" onclick={() => addBattleAction('ADJUST_TP', currentCandle?.close)}>TP</button>
        <button class="action-btn" onclick={() => addBattleAction('ADJUST_SL', currentCandle?.close)}>SL</button>
        <button class="action-btn cut" onclick={() => addBattleAction('CUT')}>CUT</button>
      </div>
    {/if}
  </div>

  <!-- ── Battle Log ── -->
  <div class="battle-log">
    {#each battleLog() as entry}
      <div class="log-entry" style:color={entry.color ?? '#8ba59e'}>
        {#if entry.icon}<span class="log-icon">{entry.icon}</span>{/if}
        <span class="log-msg">{entry.message}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .battle-phase {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    max-width: 800px;
    margin: 0 auto;
  }

  /* ── Header ── */
  .battle-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    border: 1px solid var(--arena-line, #1a3d2e);
  }

  .header-left, .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .battle-title {
    font-family: 'Bebas Neue', 'Orbitron', sans-serif;
    font-size: 1.2rem;
    color: var(--arena-accent, #e8967d);
    letter-spacing: 3px;
  }

  .tick-counter {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: var(--arena-text-2, #5a7d6e);
    letter-spacing: 1px;
  }

  .vs-meter-mini {
    width: 120px;
    height: 8px;
    background: rgba(248, 88, 88, 0.3);
    border-radius: 4px;
    position: relative;
    overflow: hidden;
  }

  .vs-fill {
    height: 100%;
    background: rgba(72, 216, 104, 0.4);
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  .vs-fill.winning { background: rgba(72, 216, 104, 0.6); }
  .vs-fill.losing { background: rgba(248, 88, 88, 0.2); }

  .vs-value {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-family: 'JetBrains Mono', monospace;
    font-size: 6px;
    font-weight: 900;
    color: white;
  }

  .combo-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    font-weight: 900;
    color: #f8d030;
    letter-spacing: 1px;
    animation: pulseCombo 0.5s ease-in-out infinite;
  }

  @keyframes pulseCombo {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .challenge-score {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }

  .score-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.45rem;
    font-weight: 900;
    color: var(--arena-text-2, #5a7d6e);
    letter-spacing: 1px;
  }

  .score-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    font-weight: 900;
    color: #48d868;
  }

  .timer {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    font-weight: 900;
    color: var(--arena-accent, #e8967d);
  }

  /* ── Canvas Area ── */
  .canvas-area {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
  }

  .fallback-display {
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--arena-text-2, #5a7d6e);
  }

  /* ── Team HP Summary ── */
  .team-hp-summary {
    display: flex;
    gap: 12px;
  }

  .hp-side {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .hp-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.5rem;
    font-weight: 900;
    letter-spacing: 1px;
    color: var(--arena-text-2, #5a7d6e);
    width: 60px;
    text-align: right;
  }

  .hp-bar-bg {
    flex: 1;
    height: 6px;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 3px;
    overflow: hidden;
  }

  .hp-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  .human-fill { background: linear-gradient(90deg, #48d868, #00cc88); }
  .ai-fill { background: linear-gradient(90deg, #f85858, #ff2d55); }

  .hp-pct {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--arena-text-1, #8ba59e);
    width: 35px;
  }

  /* ── Switch Panel ── */
  .switch-panel {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
  }

  .switch-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.5rem;
    font-weight: 900;
    color: var(--arena-text-2, #5a7d6e);
    letter-spacing: 1px;
  }

  .switch-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: var(--arena-text-0, #e0f0e8);
  }

  .switch-btn.active {
    border-color: var(--btn-color, #4FC3F7);
    background: rgba(255, 255, 255, 0.08);
  }

  .switch-btn.ko {
    opacity: 0.3;
    filter: grayscale(1);
  }

  .switch-btn:hover:not(:disabled) {
    border-color: var(--btn-color, #4FC3F7);
    transform: scale(1.05);
  }

  .switch-btn:disabled {
    cursor: not-allowed;
  }

  .switch-initial {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 900;
    color: white;
    font-family: 'JetBrains Mono', monospace;
  }

  .switch-hp {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    color: var(--arena-text-1, #8ba59e);
  }

  .cooldown-text {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    color: #f8d030;
    margin-left: auto;
  }

  /* ── Bottom Panel ── */
  .bottom-panel {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
  }

  .mini-chart {
    flex: 1;
    height: 50px;
    border: 1px solid var(--arena-line, #1a3d2e);
    border-radius: 4px;
    overflow: hidden;
    padding: 4px;
    background: var(--arena-bg-1, #0d2118);
  }

  .mini-chart svg {
    width: 100%;
    height: 100%;
  }

  .pnl-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 70px;
  }

  .pnl-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.5rem;
    font-weight: 900;
    color: var(--arena-text-2, #5a7d6e);
    letter-spacing: 1px;
  }

  .pnl-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.9rem;
    font-weight: 900;
  }
  .pnl-value.positive { color: #48d868; }
  .pnl-value.negative { color: #f85858; }

  .decision-actions {
    display: flex;
    gap: 4px;
  }

  .action-btn {
    padding: 6px 10px;
    border: 1px solid var(--arena-line, #1a3d2e);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--arena-text-0, #e0f0e8);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    font-weight: 900;
    letter-spacing: 1px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn:hover {
    border-color: var(--arena-accent, #e8967d);
    background: rgba(232, 150, 125, 0.1);
  }

  .action-btn.hold { border-color: #48d868; }
  .action-btn.cut { border-color: #f85858; color: #f85858; }

  /* ── Battle Log ── */
  .battle-log {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
    max-height: 80px;
    overflow-y: auto;
  }

  .log-entry {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
  }

  .log-icon {
    font-size: 0.7rem;
  }

  .log-msg {
    opacity: 0.8;
  }
</style>
