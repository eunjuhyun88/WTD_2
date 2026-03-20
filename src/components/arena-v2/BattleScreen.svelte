<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { AGDEFS } from '$lib/data/agents';
  import type {
    V2BattleState,
    V2BattleConfig,
    V2BattleAgent,
    BattleLogEntry,
    BattleMilestone,
    TickResult,
    AgentBattleState,
    AgentAbilities,
    SpecBonuses,
    ActionType,
  } from '$lib/engine/v2BattleTypes';
  import { V2_BATTLE_CONSTANTS as C, TIER_DIFFICULTY } from '$lib/engine/v2BattleTypes';
  import { initBattle, processTick, applyPlayerAction } from '$lib/engine/v2BattleEngine';
  import { findTeamSynergies } from '$lib/engine/teamSynergy';
  import {
    arenaV2State,
    v2UpdateBattleState,
    v2SetBattleResult,
    v2SetView,
    type V2ArenaView,
  } from '$lib/stores/arenaV2State';

  // Sub-views
  import BattleChartView from './BattleChartView.svelte';
  import BattleMissionView from './BattleMissionView.svelte';
  import BattleCardView from './BattleCardView.svelte';
  import type { Direction, AgentId, AgentRole } from '$lib/engine/types';

  // Pokemon shared components
  import HPBar from '../shared/HPBar.svelte';
  import TypewriterBox from '../shared/TypewriterBox.svelte';
  import PartyTray from '../shared/PartyTray.svelte';

  // ── Props ──
  export let battleState: V2BattleState | null = null;
  export let currentView: V2ArenaView = 'arena';

  // ── Local state ──
  let tickInterval: ReturnType<typeof setInterval> | null = null;
  let resultTimeout: ReturnType<typeof setTimeout> | null = null;
  let initialized = false;

  // Screen shake
  let shakeX = 0;
  let shakeY = 0;
  let shakeTimer: ReturnType<typeof setTimeout> | null = null;

  // Floating damage numbers
  let damageNumbers: Array<{
    id: string;
    value: number;
    color: string;
    agentId: string;
  }> = [];

  // Milestone banner
  let activeMilestone: string | null = null;
  let milestoneColor = '#FFD700';
  let milestoneTimer: ReturnType<typeof setTimeout> | null = null;

  // End overlay
  let endOverlay: { text: string; sub: string; color: string } | null = null;

  // Combo flash
  let comboFlash = false;

  // ── Derived battle data ──
  $: bs = battleState;
  $: tickN = bs?.tickN ?? 0;
  $: maxTicks = bs?.maxTicks ?? 24;
  $: vs = bs?.vsMeter.value ?? 50;
  $: combo = bs?.combo.count ?? 0;
  $: maxCombo = bs?.combo.maxCombo ?? 0;
  $: currentPrice = bs?.currentPrice ?? 0;
  $: entryPrice = bs?.config.entryPrice ?? 0;
  $: direction = bs?.config.direction ?? 'LONG';
  $: agentStates = bs ? Object.values(bs.agentStates) : [];
  $: log = bs?.log.slice(-5) ?? [];
  $: status = bs?.status ?? 'waiting';
  $: pnl = entryPrice > 0
    ? (direction === 'LONG'
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100)
    : 0;

  $: tpPrice = bs?.config.tpPrice ?? 0;
  $: slPrice = bs?.config.slPrice ?? 0;
  $: tpDistPct = entryPrice > 0 ? ((Math.abs(tpPrice - entryPrice) / entryPrice) * 100) : 0;
  $: slDistPct = entryPrice > 0 ? ((Math.abs(slPrice - entryPrice) / entryPrice) * 100) : 0;
  $: tpProgress = tpDistPct > 0 ? Math.min(1, Math.max(0, Math.max(0, pnl) / tpDistPct)) : 0;
  $: slProgress = slDistPct > 0 ? Math.min(1, Math.max(0, Math.abs(Math.min(0, pnl)) / slDistPct)) : 0;

  // Player actions
  $: focusLeft = bs?.playerActions.tacticalFocusUsesLeft ?? 0;
  $: recallLeft = bs?.playerActions.emergencyRecallUsesLeft ?? 0;
  $: focusCooldown = bs ? bs.playerActions.tacticalFocusCooldownTick >= bs.tickN : false;
  $: activeFocusAgent = bs?.playerActions.activeFocusAgentId ?? null;

  // VS sparkline
  $: vsHistory = bs?.vsMeter.history ?? [50];

  // Tick progress as percentage
  $: tickPct = maxTicks > 0 ? (tickN / maxTicks) * 100 : 0;

  // Latest tick info
  $: latestTick = bs?.tickResults[bs.tickResults.length - 1] ?? null;
  $: tickClass = latestTick?.classifiedTick.tickClass ?? 'NEUTRAL';

  // ── Pokemon-style derived state ──
  // Active agent = first non-exhausted agent (for player sprite)
  $: activeAgent = agentStates.find(a => !a.isExhausted) ?? agentStates[0] ?? null;
  $: activeAgentIdx = activeAgent ? agentStates.indexOf(activeAgent) : 0;

  // Market HP = inverse of VS (100 - vs → market's "health")
  $: marketHP = 100 - vs;

  // Party tray data
  $: partyAgents = agentStates.map(a => {
    const def = getAgentDef(a.agentId);
    return {
      agentId: a.agentId,
      name: getAgentName(a.agentId),
      icon: getAgentIcon(a.agentId),
      imgSrc: getAgentImg(a.agentId, a.animState),
      energy: a.energy,
      maxEnergy: a.maxEnergy,
      isActive: a === activeAgent,
      isExhausted: a.isExhausted,
    };
  });

  // Pokemon-style battle messages from log
  $: pokemonMessages = formatPokemonMessages(latestTick);

  function formatPokemonMessages(tick: TickResult | null): string[] {
    if (!tick) return ['Waiting for battle to begin...'];
    const msgs: string[] = [];
    for (const action of tick.agentActions) {
      const name = getAgentName(action.agentId);
      const actionName = action.action.replace(/_/g, ' ');
      msgs.push(`${name} used ${actionName}!`);
      if (action.isCritical) msgs.push("A critical hit!");
      if (action.finalEffect > 8) msgs.push("It's super effective!");
    }
    // Market action
    if (tick.classifiedTick.tickClass === 'STRONG_UNFAVORABLE') {
      msgs.push("MARKET used SELL PRESSURE!");
      msgs.push("It's super effective!");
    } else if (tick.classifiedTick.tickClass === 'UNFAVORABLE') {
      msgs.push("MARKET used PRICE ACTION!");
    }
    return msgs.length > 0 ? msgs.slice(-3) : ['...'];
  }

  // ── Agent lookup helpers ──
  function getAgentDef(agentId: string) {
    return AGDEFS.find(a => a.id === agentId.toLowerCase());
  }

  function getAgentImg(agentId: string, animState: string): string {
    const def = getAgentDef(agentId);
    if (!def) return '/doge/char-structure.png';
    switch (animState) {
      case 'CELEBRATE': return def.img.win;
      case 'PANIC': case 'IMPACT': return def.img.alt;
      default: return def.img.def;
    }
  }

  function getAgentName(agentId: string): string {
    const def = getAgentDef(agentId);
    return def?.name ?? agentId;
  }

  function getAgentIcon(agentId: string): string {
    const def = getAgentDef(agentId);
    return def?.icon ?? '🐕';
  }

  function getRoleColor(role: string): string {
    switch (role) {
      case 'OFFENSE': return '#ff4444';
      case 'DEFENSE': return '#4488ff';
      case 'CONTEXT': return '#aa44ff';
      default: return '#F0EDE4';
    }
  }

  function getActionIcon(action: string): string {
    const icons: Record<string, string> = {
      DASH: '⚡', BURST: '💥', FINISHER: '🌟', SHIELD: '🛡',
      PING: '📡', HOOK: '🪝', ASSIST: '✨', TAUNT: '😤',
      IDLE: '💤', RECOVER: '💚',
    };
    return icons[action] ?? '·';
  }

  function getRole(roleStr: string): AgentRole {
    const roleMap: Record<string, AgentRole> = {
      'Chart Structure': 'OFFENSE', 'Volume Profile': 'OFFENSE',
      'ICT Concepts': 'OFFENSE', 'Smart Money': 'OFFENSE',
      'Derivatives': 'DEFENSE', 'On-Chain Value': 'DEFENSE',
      'Fund Flow': 'DEFENSE', 'Capital Flow': 'DEFENSE',
      'Sentiment': 'CONTEXT', 'Social Sentiment': 'CONTEXT',
      'Macro Global': 'CONTEXT', 'Macro': 'CONTEXT',
    };
    return roleMap[roleStr] ?? 'CONTEXT';
  }

  // ── Spec Bonuses: role-based action specialization ──
  function computeSpecBonuses(role: AgentRole, abilities: AgentAbilities): SpecBonuses {
    switch (role) {
      case 'OFFENSE':
        return {
          primaryActionBonus: 0.05 + (abilities.analysis - 50) / 1000,
          secondaryActionPenalty: -0.05,
          critBonus: abilities.instinct > 70 ? 0.03 : 0,
          targetActions: ['DASH', 'BURST', 'FINISHER'] as ActionType[],
        };
      case 'DEFENSE':
        return {
          primaryActionBonus: 0.05 + (abilities.accuracy - 50) / 1000,
          secondaryActionPenalty: -0.08,
          critBonus: 0,
          targetActions: ['SHIELD', 'HOOK'] as ActionType[],
        };
      case 'CONTEXT':
        return {
          primaryActionBonus: 0.04 + (abilities.speed - 50) / 1000,
          secondaryActionPenalty: -0.05,
          critBonus: abilities.instinct > 75 ? 0.02 : 0,
          targetActions: ['PING', 'ASSIST', 'HOOK'] as ActionType[],
        };
    }
  }

  // ── Dynamic ATR estimate based on findings context ──
  function estimateATR(btcPrice: number, findings: import('$lib/stores/arenaV2State').Finding[]): number {
    const baseATR = btcPrice * 0.0015; // 0.15% — realistic BTC 5m ATR

    const hasHighVol = findings.some(f => {
      const t = f.title.toLowerCase();
      return t.includes('squeeze') || t.includes('breakout') || t.includes('liquidation');
    });
    const hasLowVol = findings.some(f => {
      const t = f.title.toLowerCase();
      return t.includes('range') || t.includes('consolidat');
    });

    const volMult = hasHighVol ? 1.5 : hasLowVol ? 0.7 : 1.0;
    return baseATR * volMult;
  }

  // ── Normalize agent ID to uppercase ──
  const normalizeId = (id: string) => id.toUpperCase() as AgentId;

  // ── VS sparkline SVG path ──
  function vsSparkline(history: number[]): string {
    if (history.length < 2) return '';
    const w = 120;
    const h = 28;
    const step = w / Math.max(history.length - 1, 1);
    return history.map((v, i) => {
      const x = i * step;
      const y = h - (v / 100) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  // ── Initialize battle on mount ──
  function initializeBattle() {
    if (initialized) return;
    const state = $arenaV2State;
    if (!state.hypothesis || state.selectedAgents.length < 3 || state.btcPrice <= 0) return;

    const hyp = state.hypothesis;

    // Build V2BattleAgent array (convert lowercase IDs → uppercase)
    const agents: V2BattleAgent[] = state.selectedAgents.map(lowerId => {
      const upperId = normalizeId(lowerId);
      const def = AGDEFS.find(a => a.id === lowerId);
      const weight = state.weights[lowerId] ?? 33;
      const role: AgentRole = getRole(def?.role ?? '');
      const abilities: AgentAbilities = def?.abilities ?? { analysis: 65, accuracy: 65, speed: 65, instinct: 65 };
      return {
        agentId: upperId,
        role,
        weight,
        abilities,
        specBonuses: computeSpecBonuses(role, abilities),
      };
    });

    const agentIds = agents.map(a => a.agentId);
    const synergies = findTeamSynergies(agentIds);

    // Finding directions from analysis
    const findingDirections: Record<string, Direction> = {};
    for (const f of state.findings) {
      findingDirections[normalizeId(f.agentId)] = f.direction;
    }

    // Dynamic ATR based on findings context
    const atr1m = estimateATR(state.btcPrice, state.findings);
    const tier = TIER_DIFFICULTY[state.squadConfig.tier ?? 'BRONZE'];

    const config: V2BattleConfig = {
      entryPrice: hyp.entry || state.btcPrice,
      tpPrice: hyp.tp,
      slPrice: hyp.sl,
      direction: hyp.dir === 'NEUTRAL' ? 'LONG' : hyp.dir,
      agents,
      synergyIds: synergies.map(s => s.id),
      councilConsensus: state.consensusType ?? 'split',
      hypothesisRR: hyp.rr,
      findingDirections: findingDirections as Record<AgentId, Direction>,
      tierVSStart: tier.vsStart,
      tierTickCount: tier.maxTicks,
      tierAIBonus: tier.aiBonus,
      atr1m,
    };

    const initial = initBattle(config);
    v2UpdateBattleState(initial);
    initialized = true;
    startTickLoop();
  }

  function startTickLoop() {
    if (tickInterval) clearInterval(tickInterval);

    tickInterval = setInterval(() => {
      const state = $arenaV2State;
      if (!state.battleState || state.battleState.status !== 'running') {
        if (tickInterval) clearInterval(tickInterval);
        return;
      }

      const price = state.btcPrice;
      if (price <= 0) return;

      const newState = processTick(state.battleState, price);
      v2UpdateBattleState(newState);

      // Handle visual effects
      const latest = newState.tickResults[newState.tickResults.length - 1];
      if (latest) handleTickEffects(latest);

      // Check battle end
      if (newState.status === 'finished' && newState.result) {
        if (tickInterval) clearInterval(tickInterval);

        // Show end overlay
        const r = newState.result;
        if (r.outcome === 'tp_hit') {
          endOverlay = { text: 'TARGET ACHIEVED', sub: `+${r.finalPnL.toFixed(2)}%`, color: '#00ff88' };
        } else if (r.outcome === 'sl_hit') {
          endOverlay = { text: 'STOPPED OUT', sub: `${r.finalPnL.toFixed(2)}%`, color: '#ff2d55' };
        } else if (r.outcome === 'timeout_win') {
          endOverlay = { text: 'TIME UP — WIN', sub: `+${r.finalPnL.toFixed(2)}%`, color: '#00ff88' };
        } else {
          endOverlay = { text: 'TIME UP — LOSS', sub: `${r.finalPnL.toFixed(2)}%`, color: '#ff2d55' };
        }

        // Transition to RESULT after delay
        resultTimeout = setTimeout(() => {
          v2SetBattleResult(newState.result!);
          resultTimeout = null;
        }, 2500);
      }
    }, C.TICK_INTERVAL_MS);
  }

  // ── Visual effects ──
  function handleTickEffects(tick: TickResult) {
    // Milestones
    for (const ms of tick.milestones) {
      if (ms.screenShakeIntensity > 0) {
        triggerShake(ms.screenShakeIntensity, ms.screenShakeDuration);
      }
      const isRed = ms.type === 'DANGER_ZONE' || ms.type === 'FINDING_CHALLENGED' || ms.type === 'EXHAUSTED';
      showMilestone(ms.detail, isRed ? '#ff2d55' : '#FFD700');
    }

    // Damage numbers
    for (const action of tick.agentActions) {
      if (action.damageNumber !== null) {
        addDamageNumber(action.agentId, action.damageNumber, action.damageColor);
      }
    }

    // Screen shake on strong ticks
    if (tick.classifiedTick.tickClass === 'STRONG_FAVORABLE' || tick.classifiedTick.tickClass === 'STRONG_UNFAVORABLE') {
      triggerShake(5, 200);
    }

    // Combo flash
    if (tick.comboAfter > tick.comboBefore && tick.comboAfter >= 2) {
      comboFlash = true;
      setTimeout(() => { comboFlash = false; }, 600);
    }
  }

  function triggerShake(intensity: number, duration: number) {
    if (shakeTimer) clearTimeout(shakeTimer);
    shakeX = (Math.random() - 0.5) * intensity * 2;
    shakeY = (Math.random() - 0.5) * intensity * 2;
    shakeTimer = setTimeout(() => { shakeX = 0; shakeY = 0; }, duration);
  }

  function addDamageNumber(agentId: string, value: number, color: string) {
    const id = crypto.randomUUID();
    damageNumbers = [...damageNumbers, { id, value, color, agentId }];
    setTimeout(() => {
      damageNumbers = damageNumbers.filter(d => d.id !== id);
    }, 1200);
  }

  function showMilestone(text: string, color: string) {
    activeMilestone = text;
    milestoneColor = color;
    if (milestoneTimer) clearTimeout(milestoneTimer);
    milestoneTimer = setTimeout(() => { activeMilestone = null; }, 2500);
  }

  // ── Player actions ──
  function handleTacticalFocus(agentId: string) {
    if (!bs || focusLeft <= 0 || focusCooldown) return;
    const newState = applyPlayerAction(bs, 'TACTICAL_FOCUS', agentId as AgentId);
    v2UpdateBattleState(newState);
    showMilestone(`FOCUS → ${agentId}!`, '#FFD700');
  }

  function handleEmergencyRecall(agentId: string) {
    if (!bs || recallLeft <= 0) return;
    const newState = applyPlayerAction(bs, 'EMERGENCY_RECALL', agentId as AgentId);
    v2UpdateBattleState(newState);
    showMilestone(`RECALL ${agentId}!`, '#FF6B6B');
  }

  // ── View switching ──
  const views: { key: V2ArenaView; icon: string; label: string }[] = [
    { key: 'arena', icon: '⚔', label: 'Arena' },
    { key: 'chart', icon: '📊', label: 'Chart' },
    { key: 'mission', icon: '🖥', label: 'Mission' },
    { key: 'card', icon: '🃏', label: 'Card' },
  ];

  // ── Reactive init retry (for when btcPrice arrives after mount) ──
  $: if ($arenaV2State.hypothesis && $arenaV2State.btcPrice > 0 && !initialized) {
    initializeBattle();
  }

  // ── Lifecycle ──
  onMount(() => {
    initializeBattle();
  });

  onDestroy(() => {
    if (tickInterval) clearInterval(tickInterval);
    if (resultTimeout) clearTimeout(resultTimeout);
    if (shakeTimer) clearTimeout(shakeTimer);
    if (milestoneTimer) clearTimeout(milestoneTimer);
  });
</script>

<!-- ═══════════════════════════════════════════════ -->
<!-- BATTLE SCREEN — Agent Arena View               -->
<!-- ═══════════════════════════════════════════════ -->

<div class="battle-screen" style:transform="translate({shakeX}px, {shakeY}px)">

  <!-- ── Top Bar ── -->
  <div class="top-bar">
    <div class="top-left">
      <span class="tick-label">TICK</span>
      <span class="tick-val">{tickN}<span class="tick-max">/{maxTicks}</span></span>
      <div class="tick-bar">
        <div class="tick-fill" style:width="{tickPct}%" />
      </div>
    </div>

    <div class="top-center">
      {#if combo >= 2}
        <span class="combo-badge" class:combo-flash={comboFlash}>
          🔥 {combo}-HIT COMBO
        </span>
      {/if}
    </div>

    <div class="top-right">
      <div class="view-picker">
        {#each views as v, i}
          <button
            class="view-btn"
            class:active={currentView === v.key}
            on:click={() => v2SetView(v.key)}
            title="{v.label} ({i + 1})"
          >
            <span class="view-icon">{v.icon}</span>
            <span class="view-key">{i + 1}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- ═══ VIEW CONTENT AREA ═══ -->
  {#if currentView === 'chart'}
    <BattleChartView {battleState} />
  {:else if currentView === 'mission'}
    <BattleMissionView {battleState} />
  {:else if currentView === 'card'}
    <BattleCardView {battleState} />
  {:else}
    <!-- ══ Pokemon Arena View (default) ══ -->

    <!-- VS Meter Bar -->
    <div class="vs-bar">
      <span class="vs-label-left" class:winning={vs > 55}>YOU</span>
      <div class="vs-track">
        <div class="vs-fill" style:width="{vs}%"
          class:vs-winning={vs >= 60}
          class:vs-losing={vs <= 40}
          class:vs-danger={vs <= 25}
        />
        <div class="vs-center-mark" />
        <span class="vs-value">{vs.toFixed(0)}</span>
      </div>
      <span class="vs-label-right" class:winning={vs < 45}>MKT</span>
    </div>

    <!-- Pokemon Battle Arena -->
    <div class="poke-arena">
      <!-- ── Battle Field ── -->
      <div class="poke-field">

        <!-- Enemy: MARKET (top-right) -->
        <div class="poke-enemy"
          class:enemy-attacking={tickClass === 'UNFAVORABLE' || tickClass === 'STRONG_UNFAVORABLE'}
        >
          <div class="poke-enemy-info">
            <span class="poke-name enemy-name">MARKET</span>
            <div class="poke-enemy-hp">
              <HPBar value={marketHP} max={100} label="HP" showValue={true} size="md" />
            </div>
            <!-- Price badge -->
            <div class="price-badge" class:positive={pnl >= 0} class:negative={pnl < 0}>
              ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              <span class="price-pnl-mini">{pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%</span>
            </div>
          </div>
          <div class="poke-enemy-sprite">
            <img src="/doge/trade-bear.png" alt="MARKET" class="enemy-img" />
            <!-- Hit flash on favorable tick -->
            {#if tickClass === 'FAVORABLE' || tickClass === 'STRONG_FAVORABLE'}
              <div class="hit-flash" />
            {/if}
          </div>
        </div>

        <!-- Center: Tick class + effects -->
        <div class="poke-center">
          <div class="tick-class-badge"
            class:fav={tickClass === 'FAVORABLE' || tickClass === 'STRONG_FAVORABLE'}
            class:unfav={tickClass === 'UNFAVORABLE' || tickClass === 'STRONG_UNFAVORABLE'}
            class:neutral={tickClass === 'NEUTRAL'}
          >
            {#if tickClass === 'STRONG_FAVORABLE'}⚡ SUPER EFFECTIVE{:else if tickClass === 'FAVORABLE'}▲ EFFECTIVE{:else if tickClass === 'NEUTRAL'}— STANDBY{:else if tickClass === 'UNFAVORABLE'}▼ RESISTED{:else}⚡ DEVASTATING{/if}
          </div>

          <!-- Floating damage numbers (centered) -->
          {#each damageNumbers as dmg (dmg.id)}
            <div class="damage-number" class:dmg-green={dmg.color === 'green'} class:dmg-red={dmg.color === 'red'} class:dmg-gold={dmg.color === 'gold'}>
              {dmg.color === 'red' ? '-' : '+'}{dmg.value.toFixed(1)}
            </div>
          {/each}
        </div>

        <!-- Player: Active Agent (bottom-left) -->
        {#if activeAgent}
          <div class="poke-player"
            class:player-attacking={activeAgent.animState === 'CAST' || activeAgent.animState === 'WINDUP'}
            class:player-shielding={activeAgent.currentAction === 'SHIELD'}
          >
            <div class="poke-player-sprite">
              <img
                src={getAgentImg(activeAgent.agentId, activeAgent.animState)}
                alt={activeAgent.agentId}
                class="player-img"
                class:img-attacking={activeAgent.animState === 'CAST'}
                class:img-windup={activeAgent.animState === 'WINDUP'}
              />
              {#if activeAgent.currentAction === 'SHIELD'}
                <div class="shield-overlay" />
              {/if}
              <!-- Action badge over sprite -->
              <div class="player-action-icon">
                {getActionIcon(activeAgent.currentAction)}
              </div>
              <!-- Validation badge -->
              {#if activeAgent.findingValidated === true}
                <div class="validated-badge">✓</div>
              {:else if activeAgent.findingValidated === false}
                <div class="challenged-badge">✗</div>
              {/if}
            </div>
            <div class="poke-player-info">
              <span class="poke-name player-name">{getAgentIcon(activeAgent.agentId)} {getAgentName(activeAgent.agentId)}</span>
              <div class="poke-player-hp">
                <HPBar value={activeAgent.energy} max={activeAgent.maxEnergy} label="EN" showValue={true} size="md" />
              </div>
              <!-- TP/SL mini bars -->
              <div class="tp-sl-mini">
                <div class="tp-sl-row">
                  <span class="tp-sl-lbl tp">TP</span>
                  <div class="tp-sl-track"><div class="tp-sl-fill tp" style:width="{tpProgress * 100}%" /></div>
                </div>
                <div class="tp-sl-row">
                  <span class="tp-sl-lbl sl">SL</span>
                  <div class="tp-sl-track"><div class="tp-sl-fill sl" style:width="{slProgress * 100}%" /></div>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Player action buttons (bottom-center) -->
        {#if status === 'running'}
          <div class="poke-actions">
            {#if focusLeft > 0 && !focusCooldown && activeAgent}
              <button class="poke-btn focus" on:click={() => handleTacticalFocus(activeAgent.agentId)}>
                🎯 FOCUS ({focusLeft})
              </button>
            {/if}
            {#if recallLeft > 0 && activeAgent && activeAgent.energy < 40}
              <button class="poke-btn recall" on:click={() => handleEmergencyRecall(activeAgent.agentId)}>
                🚨 RECALL ({recallLeft})
              </button>
            {/if}
          </div>
        {/if}
      </div>

      <!-- ── Party Tray (right side) ── -->
      <div class="poke-party">
        <PartyTray
          agents={partyAgents}
          activeIndex={activeAgentIdx}
          orientation="vertical"
        />
        <!-- VS Sparkline mini -->
        <div class="sparkline-mini">
          <svg class="sparkline-svg" viewBox="0 0 60 20" preserveAspectRatio="none">
            <line x1="0" y1="10" x2="60" y2="10" stroke="rgba(240,237,228,0.08)" stroke-width="0.5" />
            <path d={vsSparkline(vsHistory)} fill="none" stroke={vs >= 50 ? '#48d868' : '#f85858'} stroke-width="1.5" />
          </svg>
        </div>
      </div>
    </div>

    <!-- ── Typewriter Box (bottom) ── -->
    <TypewriterBox messages={pokemonMessages} speed={25} />
  {/if}
  <!-- ═══ END VIEW CONTENT ═══ -->

  <!-- ── Milestone Banner Overlay ── -->
  {#if activeMilestone}
    <div class="milestone-banner" style:color={milestoneColor} style:text-shadow="0 0 20px {milestoneColor}">
      {activeMilestone}
    </div>
  {/if}

  <!-- ── End Overlay ── -->
  {#if endOverlay}
    <div class="end-overlay">
      <div class="end-text" style:color={endOverlay.color}>
        {endOverlay.text}
      </div>
      <div class="end-sub" style:color={endOverlay.color}>
        {endOverlay.sub}
      </div>
    </div>
  {/if}

  <!-- ── Loading state ── -->
  {#if !bs}
    <div class="loading-overlay">
      <span class="loading-text">INITIALIZING BATTLE...</span>
    </div>
  {/if}
</div>

<style>
  .battle-screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #0A0908;
    color: #F0EDE4;
    font-family: var(--fm, 'JetBrains Mono', monospace);
    overflow: hidden;
    position: relative;
    transition: transform 50ms ease-out;
  }

  /* ── Top Bar ── */
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    border-bottom: 1px solid rgba(240,237,228,0.06);
    height: 40px;
    flex-shrink: 0;
  }
  .top-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tick-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 2px;
    color: rgba(240,237,228,0.4);
  }
  .tick-val {
    font-size: 14px;
    font-weight: 900;
    color: #F0EDE4;
  }
  .tick-max {
    font-size: 10px;
    color: rgba(240,237,228,0.3);
  }
  .tick-bar {
    width: 80px;
    height: 4px;
    background: rgba(240,237,228,0.08);
    border-radius: 2px;
    overflow: hidden;
  }
  .tick-fill {
    height: 100%;
    background: linear-gradient(90deg, #E8967D, #cc0033);
    border-radius: 2px;
    transition: width 300ms ease;
  }

  .top-center {
    display: flex;
    align-items: center;
  }
  .combo-badge {
    font-size: 12px;
    font-weight: 900;
    color: #FFD700;
    letter-spacing: 2px;
    padding: 3px 12px;
    border: 1px solid rgba(255,215,0,0.3);
    border-radius: 4px;
    background: rgba(255,215,0,0.06);
    transition: all 200ms;
  }
  .combo-flash {
    background: rgba(255,215,0,0.2);
    box-shadow: 0 0 20px rgba(255,215,0,0.3);
    transform: scale(1.1);
  }

  .top-right { display: flex; }
  .view-picker { display: flex; gap: 4px; }
  .view-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 4px 10px;
    border: 1px solid rgba(240,237,228,0.1);
    border-radius: 6px;
    background: transparent;
    color: rgba(240,237,228,0.3);
    cursor: pointer;
    transition: all 150ms;
    font-family: inherit;
  }
  .view-btn:hover {
    border-color: rgba(240,237,228,0.2);
    color: rgba(240,237,228,0.6);
  }
  .view-btn.active {
    border-color: #E8967D;
    color: #E8967D;
    background: rgba(232,150,125,0.08);
  }
  .view-icon { font-size: 14px; }
  .view-key {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 1px;
    opacity: 0.5;
  }

  /* ── VS Meter ── */
  .vs-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 16px;
    flex-shrink: 0;
  }
  .vs-label-left, .vs-label-right {
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 2px;
    color: rgba(240,237,228,0.3);
    width: 32px;
    text-align: center;
    transition: color 300ms;
  }
  .vs-label-left.winning { color: #00ff88; }
  .vs-label-right.winning { color: #ff2d55; }
  .vs-track {
    flex: 1;
    height: 8px;
    background: rgba(240,237,228,0.06);
    border-radius: 4px;
    position: relative;
    overflow: hidden;
  }
  .vs-fill {
    height: 100%;
    background: linear-gradient(90deg, #00ff88, #00cc66);
    border-radius: 4px;
    transition: width 400ms ease;
  }
  .vs-fill.vs-winning {
    background: linear-gradient(90deg, #00ff88, #44ffaa);
    box-shadow: 0 0 8px rgba(0,255,136,0.3);
  }
  .vs-fill.vs-losing {
    background: linear-gradient(90deg, #ff6644, #cc3300);
  }
  .vs-fill.vs-danger {
    background: linear-gradient(90deg, #ff2d55, #cc0033);
    animation: vsPulse 0.8s ease-in-out infinite;
  }
  .vs-center-mark {
    position: absolute;
    left: 50%;
    top: -1px;
    bottom: -1px;
    width: 2px;
    background: rgba(240,237,228,0.2);
    transform: translateX(-50%);
  }
  .vs-value {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 7px;
    font-weight: 800;
    color: rgba(240,237,228,0.5);
  }

  @keyframes vsPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* ══ Pokemon Arena Layout ══ */
  .poke-arena {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  /* ── Battle Field ── */
  .poke-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    padding: 12px 16px;
    /* Grass-pattern background */
    background:
      radial-gradient(ellipse 120% 30% at 50% 95%, rgba(72,216,104,0.06) 0%, transparent 70%),
      linear-gradient(180deg, #0a0a14 0%, #0e1218 100%);
    min-width: 0;
  }

  /* ── Enemy (MARKET) — top-right ── */
  .poke-enemy {
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    gap: 12px;
    padding: 4px 0;
    transition: all 300ms;
  }
  .poke-enemy.enemy-attacking {
    animation: enemyAttack 400ms ease;
  }
  .poke-enemy-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-end;
    min-width: 160px;
  }
  .poke-enemy-sprite {
    width: 80px;
    height: 80px;
    position: relative;
    flex-shrink: 0;
  }
  .enemy-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 4px 12px rgba(248,88,88,0.3));
    image-rendering: auto;
    transition: all 200ms;
  }
  .poke-enemy.enemy-attacking .enemy-img {
    filter: drop-shadow(0 4px 20px rgba(248,88,88,0.6)) brightness(1.2);
  }

  .poke-name {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 2px;
    font-family: 'JetBrains Mono', monospace;
  }
  .enemy-name { color: #f85858; }
  .player-name { color: #48d868; }

  .poke-enemy-hp, .poke-player-hp {
    width: 100%;
  }

  .price-badge {
    font-size: 10px;
    font-weight: 800;
    color: #e0e0e0;
    font-variant-numeric: tabular-nums;
    font-family: 'JetBrains Mono', monospace;
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .price-pnl-mini {
    font-size: 9px;
    font-weight: 900;
  }
  .price-badge.positive .price-pnl-mini { color: #48d868; }
  .price-badge.negative .price-pnl-mini { color: #f85858; }

  /* Hit flash overlay */
  .hit-flash {
    position: absolute;
    inset: 0;
    background: white;
    border-radius: 50%;
    animation: hitFlash 400ms ease forwards;
    pointer-events: none;
  }

  /* ── Center — tick class ── */
  .poke-center {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .tick-class-badge {
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 2px;
    padding: 4px 16px;
    border-radius: 4px;
    border: 2px solid rgba(240,237,228,0.1);
    background: rgba(10,10,20,0.8);
    transition: all 300ms;
    font-family: 'JetBrains Mono', monospace;
  }
  .tick-class-badge.fav {
    color: #48d868;
    border-color: rgba(72,216,104,0.4);
    background: rgba(72,216,104,0.08);
    text-shadow: 0 0 8px rgba(72,216,104,0.4);
  }
  .tick-class-badge.unfav {
    color: #f85858;
    border-color: rgba(248,88,88,0.4);
    background: rgba(248,88,88,0.08);
    text-shadow: 0 0 8px rgba(248,88,88,0.4);
  }
  .tick-class-badge.neutral {
    color: rgba(240,237,228,0.35);
    border-color: rgba(240,237,228,0.08);
  }

  /* Floating damage numbers */
  .damage-number {
    position: absolute;
    top: 30%;
    left: 50%;
    transform: translateX(-50%);
    font-size: 18px;
    font-weight: 900;
    pointer-events: none;
    animation: dmgFloat 1.2s ease-out forwards;
    z-index: 20;
    text-shadow: 0 0 12px currentColor;
    font-family: 'JetBrains Mono', monospace;
  }
  .dmg-green { color: #48d868; }
  .dmg-red { color: #f85858; }
  .dmg-gold { color: #f8d030; }
  @keyframes dmgFloat {
    0% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1.2); }
    80% { opacity: 0.8; }
    100% { opacity: 0; transform: translateX(-50%) translateY(-50px) scale(0.8); }
  }

  /* ── Player — Active Agent — bottom-left ── */
  .poke-player {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    padding: 4px 0;
    transition: all 300ms;
  }
  .poke-player.player-attacking {
    animation: playerAttack 400ms ease;
  }
  .poke-player.player-shielding .player-img {
    filter: drop-shadow(0 0 16px rgba(68,136,255,0.5)) brightness(0.9) hue-rotate(200deg);
  }
  .poke-player-sprite {
    width: 96px;
    height: 96px;
    position: relative;
    flex-shrink: 0;
  }
  .player-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 4px 12px rgba(72,216,104,0.2));
    image-rendering: auto;
    transition: all 200ms;
  }
  .img-attacking {
    filter: drop-shadow(0 4px 20px rgba(72,216,104,0.5)) brightness(1.3) !important;
    transform: scale(1.05);
  }
  .img-windup {
    animation: windupPulse 400ms ease infinite;
  }
  @keyframes windupPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); filter: brightness(1.3); }
  }

  .player-action-icon {
    position: absolute;
    top: -4px;
    right: -4px;
    font-size: 18px;
    filter: drop-shadow(0 0 6px rgba(0,0,0,0.8));
    animation: actionPop 300ms ease;
  }
  @keyframes actionPop {
    0% { transform: scale(0); }
    60% { transform: scale(1.3); }
    100% { transform: scale(1); }
  }

  .shield-overlay {
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    border: 3px solid rgba(68,136,255,0.6);
    background: rgba(68,136,255,0.08);
    animation: shieldPulse 600ms ease infinite;
  }
  @keyframes shieldPulse {
    0%, 100% { opacity: 0.5; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.05); }
  }

  .validated-badge, .challenged-badge {
    position: absolute;
    bottom: 2px;
    right: 2px;
    font-size: 10px;
    font-weight: 900;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid #0a0a14;
  }
  .validated-badge { background: #48d868; color: #0a0a14; }
  .challenged-badge { background: #f85858; color: #0a0a14; }

  .poke-player-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 160px;
  }

  /* TP/SL mini bars */
  .tp-sl-mini {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 2px;
  }
  .tp-sl-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .tp-sl-lbl {
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 1px;
    width: 14px;
    font-family: 'JetBrains Mono', monospace;
  }
  .tp-sl-lbl.tp { color: #48d868; }
  .tp-sl-lbl.sl { color: #f85858; }
  .tp-sl-track {
    flex: 1;
    height: 4px;
    background: #303030;
    border-radius: 1px;
    overflow: hidden;
  }
  .tp-sl-fill {
    height: 100%;
    border-radius: 1px;
    transition: width 400ms;
  }
  .tp-sl-fill.tp { background: #48d868; }
  .tp-sl-fill.sl { background: #f85858; }

  /* ── Player Action Buttons ── */
  .poke-actions {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
  }
  .poke-btn {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1px;
    padding: 6px 14px;
    border: 2px solid;
    border-radius: 6px;
    cursor: pointer;
    transition: all 150ms;
    background: rgba(10,10,20,0.8);
  }
  .poke-btn.focus {
    color: #f8d030;
    border-color: rgba(248,208,48,0.4);
  }
  .poke-btn.focus:hover {
    background: rgba(248,208,48,0.15);
    border-color: rgba(248,208,48,0.7);
    box-shadow: 0 0 12px rgba(248,208,48,0.2);
  }
  .poke-btn.recall {
    color: #f85858;
    border-color: rgba(248,88,88,0.4);
  }
  .poke-btn.recall:hover {
    background: rgba(248,88,88,0.15);
    border-color: rgba(248,88,88,0.7);
    box-shadow: 0 0 12px rgba(248,88,88,0.2);
  }

  /* ── Party Tray (right sidebar) ── */
  .poke-party {
    width: 80px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 4px;
    border-left: 2px solid #2a2a44;
    background: #0e0e1a;
    flex-shrink: 0;
    align-items: center;
  }

  .sparkline-mini {
    width: 100%;
    padding: 4px;
  }
  .sparkline-svg {
    width: 100%;
    height: 20px;
  }

  /* ══ Pokemon Battle Animations ══ */
  @keyframes playerAttack {
    0% { transform: translateX(0); }
    25% { transform: translateX(40px) scale(1.05); }
    50% { transform: translateX(40px); }
    100% { transform: translateX(0); }
  }
  @keyframes enemyAttack {
    0% { transform: translateX(0); }
    25% { transform: translateX(-30px) scale(1.05); }
    50% { transform: translateX(-30px); }
    100% { transform: translateX(0); }
  }
  @keyframes hitFlash {
    0%, 40%, 80% { opacity: 0; }
    20%, 60% { opacity: 0.5; }
    100% { opacity: 0; }
  }
  @keyframes critFlash {
    0% { opacity: 0; background: white; }
    15% { opacity: 0.7; }
    100% { opacity: 0; }
  }

  /* ── Milestone Banner ── */
  .milestone-banner {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 20px;
    font-weight: 900;
    letter-spacing: 4px;
    font-family: var(--fb, 'Space Grotesk', sans-serif);
    pointer-events: none;
    z-index: 50;
    animation: milestonePop 2.5s ease forwards;
    white-space: nowrap;
  }
  @keyframes milestonePop {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
    15% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
    25% { transform: translate(-50%, -50%) scale(1); }
    75% { opacity: 1; }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
  }

  /* ── End Overlay ── */
  .end-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: rgba(10,9,8,0.85);
    z-index: 100;
    animation: endFade 500ms ease;
  }
  .end-text {
    font-size: 32px;
    font-weight: 900;
    letter-spacing: 6px;
    font-family: var(--fb, 'Space Grotesk', sans-serif);
    text-shadow: 0 0 40px currentColor;
    animation: endPulse 1s ease infinite;
  }
  .end-sub {
    font-size: 24px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  @keyframes endFade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes endPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.03); }
  }

  /* ── Loading Overlay ── */
  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0A0908;
    z-index: 200;
  }
  .loading-text {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 4px;
    color: rgba(240,237,228,0.4);
    animation: loadBlink 1.5s ease infinite;
  }
  @keyframes loadBlink {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
</style>
