<!-- ═══════════════════════════════════════════
  AnalyzePhase.svelte — AI 분석 + 에이전트 스프라이트 애니메이션
  C02 파이프라인 실행 중 에이전트들이 분석하는 연출
═══════════════════════════════════════════ -->
<script lang="ts">
  import { arenaWarStore } from '$lib/stores/arenaWarStore';
  import type { AgentId } from '$lib/engine/types';
  import { getAgentCharacter, getTypeBadge } from '$lib/engine/agentCharacter';
  import AgentSprite from './AgentSprite.svelte';

  let progress = $derived($arenaWarStore.analyzeProgress);
  let humanTeam = $derived($arenaWarStore.humanTeam);
  let aiTeam = $derived($arenaWarStore.aiTeam);
  let mode = $derived($arenaWarStore.selectedMode);

  const agents: { id: AgentId; icon: string; name: string; role: string }[] = [
    { id: 'STRUCTURE', icon: '📊', name: '차트구조', role: 'OFFENSE' },
    { id: 'VPA',       icon: '📈', name: '볼륨분석', role: 'OFFENSE' },
    { id: 'ICT',       icon: '⚡', name: '스마트머니', role: 'OFFENSE' },
    { id: 'DERIV',     icon: '💰', name: '파생상품', role: 'DEFENSE' },
    { id: 'VALUATION', icon: '💎', name: '밸류에이션', role: 'DEFENSE' },
    { id: 'FLOW',      icon: '🐋', name: '자금흐름', role: 'DEFENSE' },
    { id: 'SENTI',     icon: '🧠', name: '센티먼트', role: 'CONTEXT' },
    { id: 'MACRO',     icon: '🌍', name: '매크로', role: 'CONTEXT' },
  ];

  let activeAgent = $derived(Math.floor(progress / 12.5));

  const isOnHumanTeam = (id: AgentId) => humanTeam.includes(id);
  const isOnAiTeam = (id: AgentId) => aiTeam.includes(id);
</script>

<div class="analyze-phase">
  <div class="analyze-header">
    <h3>AI ANALYZING</h3>
    <p class="pair">{$arenaWarStore.setup.pair} · {$arenaWarStore.setup.timeframe}</p>
    {#if mode !== 'pvai'}
      <span class="mode-badge">{mode === 'draft' ? 'DRAFT MODE' : 'SPECTATOR MODE'}</span>
    {/if}
  </div>

  <!-- Team sprites (show which agents are on your team) -->
  {#if humanTeam.length > 0}
    <div class="team-display">
      <div class="team-side">
        <span class="team-label-top">{mode === 'spectator' ? 'TEAM A' : 'YOUR TEAM'}</span>
        <div class="team-sprites">
          {#each humanTeam as id (id)}
            {@const agentIdx = agents.findIndex(a => a.id === id)}
            <AgentSprite
              agentId={id}
              animState={agentIdx === activeAgent ? 'LOCK' : agentIdx < activeAgent ? 'CELEBRATE' : 'IDLE'}
              side="left"
              compact
              showHPBar={false}
              level={1}
            />
          {/each}
        </div>
      </div>
      <span class="vs-divider">VS</span>
      <div class="team-side">
        <span class="team-label-top">{mode === 'spectator' ? 'TEAM B' : 'AI TEAM'}</span>
        <div class="team-sprites">
          {#each aiTeam as id (id)}
            {@const agentIdx = agents.findIndex(a => a.id === id)}
            <AgentSprite
              agentId={id}
              animState={agentIdx === activeAgent ? 'LOCK' : agentIdx < activeAgent ? 'CELEBRATE' : 'IDLE'}
              side="right"
              compact
              showHPBar={false}
              level={1}
            />
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Agent analysis grid -->
  <div class="agent-grid">
    {#each agents as agent, i}
      {@const char = getAgentCharacter(agent.id)}
      {@const typeBadge = getTypeBadge(char.type)}
      {@const onHuman = isOnHumanTeam(agent.id)}
      {@const onAi = isOnAiTeam(agent.id)}
      <div
        class="agent-card"
        class:active={i === activeAgent}
        class:done={i < activeAgent}
        class:human-team={onHuman}
        class:ai-team={onAi}
      >
        <div class="agent-left">
          <div class="agent-avatar" style:background={char.gradientCSS}>
            <span class="avatar-initial">{agent.id.charAt(0)}</span>
          </div>
          <div class="agent-info-block">
            <span class="agent-name">{agent.name}</span>
            <span class="agent-type-label" style:color={typeBadge.color}>
              {typeBadge.icon} {typeBadge.name}
            </span>
          </div>
        </div>
        <div class="agent-right">
          {#if onHuman}
            <span class="team-tag human-tag">YOU</span>
          {:else if onAi}
            <span class="team-tag ai-tag">AI</span>
          {/if}
          {#if i < activeAgent}
            <span class="checkmark">✓</span>
          {:else if i === activeAgent}
            <span class="spinner"></span>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <div class="progress-bar">
    <div class="progress-fill" style="width: {progress}%"></div>
  </div>

  <div class="analyze-status">
    {#if progress < 25}
      C02 Pipeline: ORPO 분석 시작...
    {:else if progress < 50}
      에이전트 팩터 분석 중... ({Math.floor(progress / 12.5)}/8)
    {:else if progress < 75}
      Guardian 체크 + CTX 검증 중...
    {:else if progress < 100}
      Commander 최종 판정 중...
    {:else}
      분석 완료! 배틀 준비 중...
    {/if}
  </div>
</div>

<style>
  .analyze-phase {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    padding: 1.5rem;
    max-width: 520px;
    margin: 0 auto;
  }

  .analyze-header {
    text-align: center;
  }

  .analyze-header h3 {
    font-family: 'Bebas Neue', 'Orbitron', sans-serif;
    font-size: 1.8rem;
    color: var(--arena-accent, #e8967d);
    margin: 0;
    letter-spacing: 3px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .pair {
    color: var(--arena-text-1, #8ba59e);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    margin: 0.25rem 0 0;
  }

  .mode-badge {
    display: inline-block;
    font-size: 0.6rem;
    font-weight: 900;
    letter-spacing: 1.5px;
    color: #f8d030;
    padding: 2px 8px;
    border: 1px solid rgba(248, 208, 48, 0.3);
    border-radius: 3px;
    margin-top: 6px;
    font-family: 'JetBrains Mono', monospace;
  }

  /* ── Team Display ──────────────── */

  .team-display {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    justify-content: center;
    padding: 10px;
    background: rgba(0,0,0,0.2);
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.05);
  }

  .team-side {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .team-label-top {
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 1.5px;
    color: rgba(255,255,255,0.4);
    font-family: 'JetBrains Mono', monospace;
  }

  .team-sprites {
    display: flex;
    gap: 4px;
  }

  .vs-divider {
    font-size: 18px;
    font-weight: 900;
    color: #f8d030;
    font-family: 'JetBrains Mono', monospace;
    text-shadow: 0 0 8px rgba(248, 208, 48, 0.3);
  }

  /* ── Agent Grid ────────────────── */

  .agent-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    width: 100%;
  }

  .agent-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: var(--arena-bg-1, #0d2118);
    border: 1px solid var(--arena-line, #1a3d2e);
    border-radius: 6px;
    opacity: 0.4;
    transition: all 0.3s ease;
  }

  .agent-card.active {
    opacity: 1;
    border-color: var(--arena-accent, #e8967d);
    background: rgba(232, 150, 125, 0.08);
    box-shadow: 0 0 8px rgba(232, 150, 125, 0.15);
  }

  .agent-card.done {
    opacity: 0.85;
    border-color: var(--arena-good, #00cc88);
  }

  .agent-card.human-team {
    border-left: 3px solid #48d868;
  }
  .agent-card.ai-team {
    border-left: 3px solid #f85858;
  }

  .agent-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .agent-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255,255,255,0.15);
    flex-shrink: 0;
  }

  .avatar-initial {
    font-size: 12px;
    font-weight: 900;
    color: white;
    font-family: 'JetBrains Mono', monospace;
  }

  .agent-info-block {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .agent-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--arena-text-0, #e0f0e8);
  }

  .agent-type-label {
    font-size: 0.55rem;
    font-weight: 800;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.5px;
  }

  .agent-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .team-tag {
    font-size: 6px;
    font-weight: 900;
    padding: 1px 4px;
    border-radius: 2px;
    letter-spacing: 1px;
    font-family: 'JetBrains Mono', monospace;
  }
  .human-tag { color: #48d868; border: 1px solid rgba(72, 216, 104, 0.3); }
  .ai-tag { color: #f85858; border: 1px solid rgba(248, 88, 88, 0.3); }

  .checkmark {
    color: var(--arena-good, #00cc88);
    font-weight: bold;
    font-size: 0.85rem;
  }

  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--arena-accent, #e8967d);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .progress-bar {
    width: 100%;
    height: 4px;
    background: var(--arena-bg-1, #0d2118);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--arena-accent, #e8967d), var(--arena-good, #00cc88));
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .analyze-status {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    color: var(--arena-text-2, #5a7d6e);
    letter-spacing: 1px;
  }
</style>
