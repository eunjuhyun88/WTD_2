<!-- ═══════════════════════════════════════════
  BattleVisualizer.svelte — 포켓몬 스타일 배틀 전체 화면
  에이전트 3v3 + VS미터 + 액션피드 + 이펙트 통합
═══════════════════════════════════════════ -->
<script lang="ts">
  import type { AgentId, Direction } from '$lib/engine/types';
  import type { AgentAnimState, BattleLogEntry, BattleMilestone, VSMeterState, ComboState } from '$lib/engine/v2BattleTypes';
  import { getAgentCharacter, type AgentType, calcTeamTypeAdvantage, getTypeEffectivenessLabel, getTypeEffectivenessColor } from '$lib/engine/agentCharacter';
  import AgentSprite from './AgentSprite.svelte';
  import VSMeterBar from './VSMeterBar.svelte';
  import ActionFeed from './ActionFeed.svelte';
  import BattleEffects from './BattleEffects.svelte';
  import PokemonFrame from '../shared/PokemonFrame.svelte';

  const {
    // Teams
    humanAgents = [],
    aiAgents = [],
    humanAgentStates = {},
    aiAgentStates = {},

    // VS Meter
    vsMeter = { value: 50, startValue: 50, history: [] },

    // Battle state
    tickN = 0,
    maxTicks = 24,
    currentPrice = 0,
    humanPnl = 0,
    aiPnl = 0,
    humanDirection = 'LONG' as Direction,
    aiDirection = 'LONG' as Direction,

    // Combo
    combo = { count: 0, maxCombo: 0, isProtected: false, lastBreakTick: 0 },

    // Log
    logEntries = [],

    // Effects
    currentMilestone = null,
    screenShake = null,
    isCritical = false,
    signatureActive = false,
    signatureName = '',

    // Agent levels
    agentLevels = {},

    // Mode
    isSpectator = false,
  }: {
    humanAgents: AgentId[];
    aiAgents: AgentId[];
    humanAgentStates: Record<string, { animState: AgentAnimState; energy: number; damageNumber?: { value: number; color: string } | null; speechBubble?: string | null }>;
    aiAgentStates: Record<string, { animState: AgentAnimState; energy: number; damageNumber?: { value: number; color: string } | null; speechBubble?: string | null }>;
    vsMeter: VSMeterState;
    tickN: number;
    maxTicks: number;
    currentPrice: number;
    humanPnl: number;
    aiPnl: number;
    humanDirection: Direction;
    aiDirection: Direction;
    combo: ComboState;
    logEntries: BattleLogEntry[];
    currentMilestone: BattleMilestone | null;
    screenShake: { px: number; ms: number } | null;
    isCritical: boolean;
    signatureActive: boolean;
    signatureName: string;
    agentLevels: Record<string, number>;
    isSpectator: boolean;
  } = $props();

  // Type advantage calculation
  const humanTypes: AgentType[] = $derived(humanAgents.map(id => getAgentCharacter(id).type));
  const aiTypes: AgentType[] = $derived(aiAgents.map(id => getAgentCharacter(id).type));
  const typeAdvantage = $derived(calcTeamTypeAdvantage(humanTypes, aiTypes));

  // Progress bar
  const progressPct = $derived(maxTicks > 0 ? (tickN / maxTicks) * 100 : 0);
</script>

<div class="battle-visualizer">
  <!-- Battle Effects Overlay -->
  <BattleEffects
    comboCount={combo.count}
    maxCombo={combo.maxCombo}
    {isCritical}
    milestone={currentMilestone}
    {screenShake}
    {signatureActive}
    {signatureName}
  />

  <!-- Header: Tick counter + Price -->
  <div class="battle-top-bar">
    <div class="tick-counter">
      <span class="tick-label">TICK</span>
      <span class="tick-value">{tickN}/{maxTicks}</span>
    </div>
    <div class="price-display">
      ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </div>
    <div class="type-advantage" style:color={getTypeEffectivenessColor(typeAdvantage)}>
      {getTypeEffectivenessLabel(typeAdvantage)}
    </div>
  </div>

  <!-- Progress bar -->
  <div class="battle-progress">
    <div class="progress-fill" style:width="{progressPct}%"></div>
  </div>

  <!-- Main arena: 3v3 agents with VS in center -->
  <div class="arena-field">
    <!-- Human team (left) -->
    <div class="team-column human-team">
      <div class="team-header">
        <span class="team-label">{isSpectator ? 'TEAM A' : '👤 YOU'}</span>
        <span class="pnl-badge" class:positive={humanPnl > 0} class:negative={humanPnl < 0}>
          {humanPnl > 0 ? '+' : ''}{(humanPnl * 100).toFixed(2)}%
        </span>
        <span class="dir-badge">{humanDirection}</span>
      </div>
      <div class="agents-column">
        {#each humanAgents as agentId (agentId)}
          {@const state = humanAgentStates[agentId] ?? { animState: 'IDLE', energy: 100 }}
          <AgentSprite
            {agentId}
            animState={state.animState}
            energy={state.energy}
            level={agentLevels[agentId] ?? 1}
            side="left"
            damageNumber={state.damageNumber ?? null}
            speechBubble={state.speechBubble ?? null}
          />
        {/each}
      </div>
    </div>

    <!-- Center: VS + meter -->
    <div class="vs-center">
      <div class="vs-emblem">VS</div>
      <VSMeterBar
        value={vsMeter.value}
        humanLabel={isSpectator ? 'A' : 'YOU'}
        aiLabel={isSpectator ? 'B' : 'AI'}
        showSparkline={true}
        history={vsMeter.history}
      />
    </div>

    <!-- AI team (right) -->
    <div class="team-column ai-team">
      <div class="team-header">
        <span class="dir-badge">{aiDirection}</span>
        <span class="pnl-badge" class:positive={aiPnl > 0} class:negative={aiPnl < 0}>
          {aiPnl > 0 ? '+' : ''}{(aiPnl * 100).toFixed(2)}%
        </span>
        <span class="team-label">{isSpectator ? 'TEAM B' : '🤖 AI'}</span>
      </div>
      <div class="agents-column">
        {#each aiAgents as agentId (agentId)}
          {@const state = aiAgentStates[agentId] ?? { animState: 'IDLE', energy: 100 }}
          <AgentSprite
            {agentId}
            animState={state.animState}
            energy={state.energy}
            level={agentLevels[agentId] ?? 1}
            side="right"
            damageNumber={state.damageNumber ?? null}
            speechBubble={state.speechBubble ?? null}
          />
        {/each}
      </div>
    </div>
  </div>

  <!-- Action Feed (below arena) -->
  <PokemonFrame variant="dark" padding="0">
    <ActionFeed entries={logEntries} maxVisible={5} />
  </PokemonFrame>
</div>

<style>
  .battle-visualizer {
    position: relative;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    background: radial-gradient(ellipse at center, #1a1a2e 0%, #0e0e1a 100%);
    border-radius: 8px;
    border: 2px solid #3a3a5c;
    overflow: hidden;
  }

  /* ── Top bar ─────────────────────── */

  .battle-top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
  }

  .tick-counter {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .tick-label {
    font-size: 7px;
    font-weight: 800;
    color: rgba(255,255,255,0.3);
    letter-spacing: 1px;
    font-family: 'JetBrains Mono', monospace;
  }
  .tick-value {
    font-size: 12px;
    font-weight: 900;
    color: #f8d030;
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
  }

  .price-display {
    font-size: 13px;
    font-weight: 900;
    color: #e0e0e0;
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
  }

  .type-advantage {
    font-size: 9px;
    font-weight: 800;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.5px;
  }

  /* ── Progress ────────────────────── */

  .battle-progress {
    width: 100%;
    height: 3px;
    background: rgba(255,255,255,0.06);
    border-radius: 2px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4FC3F7, #f8d030);
    transition: width 0.5s;
    border-radius: 2px;
  }

  /* ── Arena field ─────────────────── */

  .arena-field {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 8px;
    align-items: center;
    min-height: 200px;
    padding: 8px 0;
  }

  .team-column {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .team-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px;
  }
  .human-team .team-header { justify-content: flex-start; }
  .ai-team .team-header { justify-content: flex-end; }

  .team-label {
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 1px;
    font-family: 'JetBrains Mono', monospace;
    color: rgba(255,255,255,0.6);
  }

  .pnl-badge {
    font-size: 10px;
    font-weight: 800;
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
    padding: 1px 4px;
    border-radius: 3px;
  }
  .pnl-badge.positive { color: #48d868; background: rgba(72, 216, 104, 0.1); }
  .pnl-badge.negative { color: #f85858; background: rgba(248, 88, 88, 0.1); }

  .dir-badge {
    font-size: 8px;
    font-weight: 800;
    color: rgba(255,255,255,0.4);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.5px;
  }

  .agents-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  /* ── VS center ───────────────────── */

  .vs-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-width: 120px;
    padding: 0 8px;
  }

  .vs-emblem {
    font-size: 24px;
    font-weight: 900;
    color: #f8d030;
    font-family: 'JetBrains Mono', monospace;
    text-shadow: 0 0 12px rgba(248, 208, 48, 0.4);
    letter-spacing: 4px;
  }

  /* ── Responsive ──────────────────── */

  @media (max-width: 480px) {
    .arena-field {
      grid-template-columns: 1fr auto 1fr;
      gap: 4px;
    }
    .vs-center { min-width: 80px; }
  }
</style>
