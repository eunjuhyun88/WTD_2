<!-- ═══════════════════════════════════════════
  DraftPhase.svelte — 포켓몬 스타일 밴/픽 드래프트 UI
  LoL 밴픽 + 포켓몬 선택화면 하이브리드
═══════════════════════════════════════════ -->
<script lang="ts">
  import type { AgentId } from '$lib/engine/types';
  import { getAllCharacters, getAgentCharacter, getTypeBadge, getMatchupSummary, calcTeamTypeAdvantage, getTypeEffectivenessLabel, getTypeEffectivenessColor, type AgentType } from '$lib/engine/agentCharacter';
  import { agentStats, createDefaultLearning, type AgentLearning } from '$lib/stores/agentData';
  import AgentSprite from './AgentSprite.svelte';
  import PokemonFrame from '../shared/PokemonFrame.svelte';
  import HPBar from '../shared/HPBar.svelte';

  // Agent learning data
  let stats = $derived($agentStats);
  function getLearning(id: string): AgentLearning {
    return stats[id]?.learning ?? createDefaultLearning();
  }

  const {
    onDraftComplete,
    agentLevels = {},
    mode = 'pvai',
  }: {
    onDraftComplete: (humanTeam: AgentId[], aiTeam: AgentId[], banned: AgentId[]) => void;
    agentLevels?: Record<string, number>;
    mode?: 'pvai' | 'spectator';
  } = $props();

  const allAgents = getAllCharacters();

  // Draft state
  type DraftStep = 'BAN_HUMAN' | 'BAN_AI' | 'PICK_HUMAN_1' | 'PICK_AI_1' | 'PICK_AI_2' | 'PICK_HUMAN_2' | 'PICK_HUMAN_3' | 'PICK_AI_3' | 'DONE';

  const DRAFT_ORDER: DraftStep[] = [
    'BAN_HUMAN', 'BAN_AI',
    'PICK_HUMAN_1', 'PICK_AI_1', 'PICK_AI_2',
    'PICK_HUMAN_2', 'PICK_HUMAN_3', 'PICK_AI_3',
    'DONE'
  ];

  let currentStepIdx = $state(0);
  let banned = $state<AgentId[]>([]);
  let humanPicks = $state<AgentId[]>([]);
  let aiPicks = $state<AgentId[]>([]);
  let selectedAgent = $state<AgentId | null>(null);

  const currentStep = $derived(DRAFT_ORDER[currentStepIdx]);
  const isHumanTurn = $derived(currentStep?.startsWith('BAN_HUMAN') || currentStep?.startsWith('PICK_HUMAN'));
  const isAITurn = $derived(currentStep?.startsWith('BAN_AI') || currentStep?.startsWith('PICK_AI'));
  const isBanPhase = $derived(currentStep?.startsWith('BAN'));
  const isDone = $derived(currentStep === 'DONE');

  // Available agents (not banned, not picked)
  const availableAgents = $derived(
    allAgents.filter(a => {
      const id = a.id as AgentId;
      return !banned.includes(id) && !humanPicks.includes(id) && !aiPicks.includes(id);
    })
  );

  // Type advantage preview
  const humanTypes: AgentType[] = $derived(humanPicks.map(id => getAgentCharacter(id).type));
  const aiTypes: AgentType[] = $derived(aiPicks.map(id => getAgentCharacter(id).type));
  const typeAdvantage = $derived(
    humanPicks.length > 0 && aiPicks.length > 0
      ? calcTeamTypeAdvantage(humanTypes, aiTypes)
      : 1.0
  );

  // Step label
  const stepLabel = $derived(() => {
    if (isDone) return '드래프트 완료!';
    if (isBanPhase) return isHumanTurn ? '🚫 밴할 에이전트 선택' : '🤖 AI가 밴 중...';
    return isHumanTurn ? '✅ 에이전트를 선택하세요' : '🤖 AI가 선택 중...';
  });

  function selectAgent(id: AgentId) {
    if (!isHumanTurn || isDone) return;
    selectedAgent = id;
  }

  function confirmSelection() {
    if (!selectedAgent || !isHumanTurn) return;

    if (isBanPhase) {
      banned = [...banned, selectedAgent];
    } else {
      humanPicks = [...humanPicks, selectedAgent];
    }

    selectedAgent = null;
    currentStepIdx++;

    // Auto-advance AI turns
    doAITurns();
  }

  function doAITurns() {
    while (currentStepIdx < DRAFT_ORDER.length && DRAFT_ORDER[currentStepIdx]?.startsWith('BAN_AI') || DRAFT_ORDER[currentStepIdx]?.startsWith('PICK_AI')) {
      const step = DRAFT_ORDER[currentStepIdx];
      if (!step || step === 'DONE') break;

      // Simple AI pick: choose best available by type coverage
      const available = allAgents.filter(a => {
        const id = a.id as AgentId;
        return !banned.includes(id) && !humanPicks.includes(id) && !aiPicks.includes(id);
      });

      if (available.length === 0) break;

      // AI strategy: pick complementary types, ban strongest human counter
      const pick = available[Math.floor(Math.random() * available.length)];
      const id = pick.id as AgentId;

      if (step.startsWith('BAN')) {
        banned = [...banned, id];
      } else {
        aiPicks = [...aiPicks, id];
      }

      currentStepIdx++;
    }

    // Check if draft is complete
    if (DRAFT_ORDER[currentStepIdx] === 'DONE') {
      setTimeout(() => {
        onDraftComplete(humanPicks, aiPicks, banned);
      }, 800);
    }
  }

  // Selected agent details
  const selectedChar = $derived(selectedAgent ? getAgentCharacter(selectedAgent) : null);
</script>

<div class="draft-phase">
  <div class="draft-header">
    <h2>AGENT DRAFT</h2>
    <p class="draft-step-label">{stepLabel()}</p>
  </div>

  <!-- Team preview -->
  <div class="teams-preview">
    <!-- Human team -->
    <div class="team-preview human">
      <span class="team-label">{mode === 'spectator' ? 'TEAM A' : 'YOUR TEAM'}</span>
      <div class="team-slots">
        {#each [0, 1, 2] as slot}
          {#if humanPicks[slot]}
            <AgentSprite agentId={humanPicks[slot]} side="left" compact level={agentLevels[humanPicks[slot]] ?? 1} />
          {:else}
            <div class="empty-slot">?</div>
          {/if}
        {/each}
      </div>
      {#if humanPicks.length > 0}
        <div class="type-row">
          {#each humanPicks as id}
            {@const badge = getTypeBadge(getAgentCharacter(id).type)}
            <span class="mini-type" style:color={badge.color}>{badge.icon}{badge.name}</span>
          {/each}
        </div>
      {/if}
    </div>

    <!-- VS + Type advantage -->
    <div class="draft-vs">
      <span class="vs-text">VS</span>
      {#if humanPicks.length > 0 && aiPicks.length > 0}
        <span class="advantage-text" style:color={getTypeEffectivenessColor(typeAdvantage)}>
          {getTypeEffectivenessLabel(typeAdvantage)}
        </span>
      {/if}
    </div>

    <!-- AI team -->
    <div class="team-preview ai">
      <span class="team-label">{mode === 'spectator' ? 'TEAM B' : 'AI TEAM'}</span>
      <div class="team-slots">
        {#each [0, 1, 2] as slot}
          {#if aiPicks[slot]}
            <AgentSprite agentId={aiPicks[slot]} side="right" compact level={agentLevels[aiPicks[slot]] ?? 1} />
          {:else}
            <div class="empty-slot">?</div>
          {/if}
        {/each}
      </div>
      {#if aiPicks.length > 0}
        <div class="type-row">
          {#each aiPicks as id}
            {@const badge = getTypeBadge(getAgentCharacter(id).type)}
            <span class="mini-type" style:color={badge.color}>{badge.icon}{badge.name}</span>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Banned row -->
  {#if banned.length > 0}
    <div class="banned-row">
      <span class="banned-label">🚫 BANNED</span>
      {#each banned as id}
        <span class="banned-agent" style:color={getAgentCharacter(id).color}>
          {getAgentCharacter(id).nameKR}
        </span>
      {/each}
    </div>
  {/if}

  <!-- Agent selection grid -->
  {#if !isDone}
    <div class="agent-grid">
      {#each availableAgents as agent (agent.id)}
        {@const id = agent.id as AgentId}
        {@const badge = getTypeBadge(agent.type)}
        {@const matchup = getMatchupSummary(agent.type)}
        {@const learning = getLearning(id)}
        <button
          class="agent-card"
          class:selected={selectedAgent === id}
          class:ban-mode={isBanPhase}
          onclick={() => selectAgent(id)}
          disabled={!isHumanTurn}
          style:border-color={selectedAgent === id ? agent.color : 'transparent'}
        >
          <div class="card-body" style:background={agent.gradientCSS}>
            <span class="card-initial">{id.charAt(0)}</span>
            {#if learning.learningLevel > 0}
              <span class="learn-badge">Lv{learning.learningLevel}</span>
            {/if}
          </div>
          <span class="card-name">{agent.nameKR}</span>
          <span class="card-type" style:color={badge.color}>{badge.icon} {badge.name}</span>
          <div class="card-stats">
            <HPBar value={agent.baseStats.analysis} max={100} label="AN" size="sm" showValue={false} />
            <HPBar value={agent.baseStats.speed} max={100} label="SP" size="sm" showValue={false} />
          </div>
          <div class="card-matchup">
            <span class="matchup-strong">▲ {matchup.strong}</span>
            <span class="matchup-weak">▼ {matchup.weak}</span>
          </div>
          {#if learning.patternMemory.length > 0}
            <span class="pattern-count">{learning.patternMemory.length} patterns</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Selected agent detail + confirm -->
  {#if selectedChar && isHumanTurn && !isDone}
    <PokemonFrame variant="accent" padding="12px">
      <div class="selected-detail">
        <div class="detail-header">
          <span class="detail-name" style:color={selectedChar.color}>{selectedChar.nameKR}</span>
          <span class="detail-title">{selectedChar.titleKR}</span>
        </div>
        <div class="detail-stats">
          <div class="stat-row"><span>분석</span><HPBar value={selectedChar.baseStats.analysis} max={100} size="sm" showValue /></div>
          <div class="stat-row"><span>정확</span><HPBar value={selectedChar.baseStats.accuracy} max={100} size="sm" showValue /></div>
          <div class="stat-row"><span>속도</span><HPBar value={selectedChar.baseStats.speed} max={100} size="sm" showValue /></div>
          <div class="stat-row"><span>직감</span><HPBar value={selectedChar.baseStats.instinct} max={100} size="sm" showValue /></div>
          <div class="stat-row"><span>시너지</span><HPBar value={selectedChar.baseStats.synergy} max={100} size="sm" showValue /></div>
          <div class="stat-row"><span>회복</span><HPBar value={selectedChar.baseStats.resilience} max={100} size="sm" showValue /></div>
        </div>
        <div class="detail-signature">
          <span class="sig-label">시그니처:</span>
          <span class="sig-name">{selectedChar.signature.nameKR}</span>
          <span class="sig-desc">{selectedChar.signature.descriptionKR}</span>
        </div>
        <button class="confirm-btn" onclick={confirmSelection}>
          {isBanPhase ? '🚫 BAN' : '✅ SELECT'}
        </button>
      </div>
    </PokemonFrame>
  {/if}

  <!-- Done state -->
  {#if isDone}
    <div class="draft-done">
      <span class="done-text">드래프트 완료! 배틀 준비 중...</span>
    </div>
  {/if}
</div>

<style>
  .draft-phase {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    max-width: 520px;
    margin: 0 auto;
  }

  .draft-header {
    text-align: center;
  }
  .draft-header h2 {
    font-family: 'Bebas Neue', 'Orbitron', sans-serif;
    font-size: 2rem;
    color: #e8967d;
    margin: 0;
    letter-spacing: 3px;
  }
  .draft-step-label {
    font-size: 13px;
    color: #f8d030;
    font-family: 'JetBrains Mono', monospace;
    margin-top: 4px;
  }

  /* ── Teams preview ─────────────── */

  .teams-preview {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 12px;
    align-items: center;
  }

  .team-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .team-label {
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 1.5px;
    color: rgba(255,255,255,0.4);
    font-family: 'JetBrains Mono', monospace;
  }
  .team-slots {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .empty-slot {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 2px dashed rgba(255,255,255,0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255,255,255,0.2);
    font-size: 16px;
    font-weight: 900;
  }
  .type-row {
    display: flex;
    gap: 4px;
  }
  .mini-type {
    font-size: 7px;
    font-weight: 800;
    font-family: 'JetBrains Mono', monospace;
  }

  .draft-vs {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .vs-text {
    font-size: 20px;
    font-weight: 900;
    color: #f8d030;
    font-family: 'JetBrains Mono', monospace;
  }
  .advantage-text {
    font-size: 9px;
    font-weight: 800;
    font-family: 'JetBrains Mono', monospace;
  }

  /* ── Banned ────────────────────── */

  .banned-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    background: rgba(248, 88, 88, 0.05);
    border-radius: 4px;
    border: 1px solid rgba(248, 88, 88, 0.1);
  }
  .banned-label {
    font-size: 8px;
    font-weight: 900;
    color: #f85858;
    letter-spacing: 1px;
    font-family: 'JetBrains Mono', monospace;
  }
  .banned-agent {
    font-size: 9px;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    text-decoration: line-through;
    opacity: 0.6;
  }

  /* ── Agent grid ────────────────── */

  .agent-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .agent-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 8px 4px;
    background: rgba(255,255,255,0.02);
    border: 2px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .agent-card:hover:not(:disabled) {
    background: rgba(255,255,255,0.05);
    transform: translateY(-2px);
  }
  .agent-card.selected {
    background: rgba(255,255,255,0.08);
    transform: translateY(-2px);
  }
  .agent-card.ban-mode.selected {
    background: rgba(248, 88, 88, 0.1);
    border-color: #f85858 !important;
  }
  .agent-card:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .card-body {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255,255,255,0.15);
    position: relative;
  }
  .card-initial {
    font-size: 16px;
    font-weight: 900;
    color: white;
    font-family: 'JetBrains Mono', monospace;
  }
  .learn-badge {
    position: absolute;
    bottom: -4px;
    right: -6px;
    font-size: 6px;
    font-weight: 900;
    color: #000;
    background: #f8d030;
    padding: 1px 3px;
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
  }
  .pattern-count {
    font-family: 'JetBrains Mono', monospace;
    font-size: 6px;
    color: var(--arena-text-2, #5a7d6e);
    letter-spacing: 0.3px;
  }

  .card-name {
    font-size: 8px;
    font-weight: 800;
    color: #e0e0e0;
    font-family: 'JetBrains Mono', monospace;
  }
  .card-type {
    font-size: 7px;
    font-weight: 800;
    font-family: 'JetBrains Mono', monospace;
  }
  .card-stats {
    width: 100%;
    padding: 0 2px;
  }
  .card-matchup {
    display: flex;
    gap: 4px;
    font-size: 6px;
    font-family: 'JetBrains Mono', monospace;
  }
  .matchup-strong { color: #48d868; }
  .matchup-weak { color: #f85858; }

  /* ── Selected detail ───────────── */

  .selected-detail {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .detail-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .detail-name {
    font-size: 16px;
    font-weight: 900;
    font-family: 'JetBrains Mono', monospace;
  }
  .detail-title {
    font-size: 10px;
    color: rgba(255,255,255,0.4);
    font-family: 'JetBrains Mono', monospace;
  }
  .detail-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }
  .stat-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .stat-row span:first-child {
    font-size: 8px;
    font-weight: 800;
    color: rgba(255,255,255,0.5);
    width: 30px;
    font-family: 'JetBrains Mono', monospace;
  }
  .detail-signature {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: baseline;
    padding: 6px;
    background: rgba(255, 215, 0, 0.05);
    border-radius: 4px;
    border: 1px solid rgba(255, 215, 0, 0.1);
  }
  .sig-label {
    font-size: 8px;
    font-weight: 800;
    color: #FFD700;
    font-family: 'JetBrains Mono', monospace;
  }
  .sig-name {
    font-size: 10px;
    font-weight: 800;
    color: #FFD700;
    font-family: 'JetBrains Mono', monospace;
  }
  .sig-desc {
    font-size: 8px;
    color: rgba(255,255,255,0.5);
    font-family: 'JetBrains Mono', monospace;
    width: 100%;
  }

  .confirm-btn {
    width: 100%;
    padding: 10px;
    background: #e8967d;
    color: #000;
    border: 2px solid #000;
    border-radius: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 2px;
    cursor: pointer;
    box-shadow: 2px 2px 0 #000;
    transition: all 0.1s;
  }
  .confirm-btn:hover {
    transform: translate(-1px, -1px);
    box-shadow: 3px 3px 0 #000;
  }

  /* ── Done ───────────────────────── */

  .draft-done {
    text-align: center;
    padding: 24px;
  }
  .done-text {
    font-size: 14px;
    font-weight: 800;
    color: #48d868;
    font-family: 'JetBrains Mono', monospace;
    animation: pulse-glow 1s ease-in-out infinite;
  }

  @keyframes pulse-glow {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  @media (max-width: 400px) {
    .agent-grid { grid-template-columns: repeat(3, 1fr); }
  }
</style>
