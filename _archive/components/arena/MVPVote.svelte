<!--
  STOCKCLAW — MVP / Traitor Vote (Post-Match Agent Review)
  After a match concludes, user votes on:
    - MVP: Which agent was most helpful? (+20 XP)
    - Traitor: Which agent gave bad advice? (-5 XP)
    - Skip: No vote (neutral)
-->
<script lang="ts">
  import type { AgentTier } from '$lib/engine/types';

  interface AgentResult {
    agentId: string;
    name: string;
    nameKR: string;
    icon: string;
    color: string;
    direction: string;
    confidence: number;
    wasCorrect: boolean;
    level: number;
    tier: AgentTier;
  }

  interface Props {
    agents: AgentResult[];
    visible: boolean;
    onVote: (mvpId: string | null, traitorId: string | null) => void;
  }

  let { agents, visible, onVote }: Props = $props();

  let selectedMVP: string | null = $state(null);
  let selectedTraitor: string | null = $state(null);
  let phase: 'mvp' | 'traitor' | 'done' = $state('mvp');

  function selectMVP(agentId: string) {
    selectedMVP = selectedMVP === agentId ? null : agentId;
  }

  function selectTraitor(agentId: string) {
    if (agentId === selectedMVP) return; // Can't be both
    selectedTraitor = selectedTraitor === agentId ? null : agentId;
  }

  function confirmMVP() {
    phase = 'traitor';
  }

  function confirmVote() {
    phase = 'done';
    onVote(selectedMVP, selectedTraitor);
  }

  function skipAll() {
    phase = 'done';
    onVote(null, null);
  }

  const tierColors: Record<AgentTier, string> = {
    ROOKIE: '#8e8e93',
    VETERAN: '#ffcc00',
    EXPERT: '#af52de',
    LEGEND: '#ff2d55',
  };

  const tierLabels: Record<AgentTier, string> = {
    ROOKIE: '루키',
    VETERAN: '베테랑',
    EXPERT: '전문가',
    LEGEND: '레전드',
  };
</script>

{#if visible && phase !== 'done'}
  <div class="mvp-overlay">
    <div class="mvp-card">
      {#if phase === 'mvp'}
        <div class="mvp-header">
          <span class="mvp-icon">⭐</span>
          <h3 class="mvp-title">MVP 투표</h3>
          <p class="mvp-desc">이번 매치에서 가장 도움이 된 에이전트는?</p>
        </div>

        <div class="agent-grid">
          {#each agents as agent}
            <button
              class="agent-card"
              class:selected={selectedMVP === agent.agentId}
              class:correct={agent.wasCorrect}
              class:wrong={!agent.wasCorrect}
              onclick={() => selectMVP(agent.agentId)}
            >
              <div class="agent-icon">{agent.icon}</div>
              <div class="agent-name">{agent.nameKR}</div>
              <div class="agent-tier" style="color: {tierColors[agent.tier]}">
                {tierLabels[agent.tier]} Lv.{agent.level}
              </div>
              <div class="agent-dir" class:long={agent.direction === 'LONG'} class:short={agent.direction === 'SHORT'}>
                {agent.direction} {agent.confidence}%
              </div>
              <div class="agent-result" class:correct={agent.wasCorrect} class:wrong={!agent.wasCorrect}>
                {agent.wasCorrect ? '✅ 맞음' : '❌ 틀림'}
              </div>
              {#if selectedMVP === agent.agentId}
                <div class="selected-badge mvp-badge">⭐ MVP</div>
              {/if}
            </button>
          {/each}
        </div>

        <div class="mvp-actions">
          <button class="btn-confirm" onclick={confirmMVP} disabled={!selectedMVP}>
            {selectedMVP ? '다음 →' : 'MVP 선택하세요'}
          </button>
          <button class="btn-skip" onclick={skipAll}>건너뛰기</button>
        </div>

      {:else if phase === 'traitor'}
        <div class="mvp-header">
          <span class="mvp-icon">🗡️</span>
          <h3 class="mvp-title">배신자 지목</h3>
          <p class="mvp-desc">가장 잘못된 조언을 한 에이전트는? (선택사항)</p>
        </div>

        <div class="agent-grid">
          {#each agents as agent}
            <button
              class="agent-card"
              class:selected={selectedTraitor === agent.agentId}
              class:disabled-card={agent.agentId === selectedMVP}
              onclick={() => selectTraitor(agent.agentId)}
              disabled={agent.agentId === selectedMVP}
            >
              <div class="agent-icon">{agent.icon}</div>
              <div class="agent-name">{agent.nameKR}</div>
              <div class="agent-tier" style="color: {tierColors[agent.tier]}">
                {tierLabels[agent.tier]} Lv.{agent.level}
              </div>
              <div class="agent-dir" class:long={agent.direction === 'LONG'} class:short={agent.direction === 'SHORT'}>
                {agent.direction} {agent.confidence}%
              </div>
              <div class="agent-result" class:correct={agent.wasCorrect} class:wrong={!agent.wasCorrect}>
                {agent.wasCorrect ? '✅ 맞음' : '❌ 틀림'}
              </div>
              {#if agent.agentId === selectedMVP}
                <div class="selected-badge mvp-badge">⭐ MVP</div>
              {/if}
              {#if selectedTraitor === agent.agentId}
                <div class="selected-badge traitor-badge">🗡️ 배신자</div>
              {/if}
            </button>
          {/each}
        </div>

        <div class="mvp-actions">
          <button class="btn-confirm" onclick={confirmVote}>
            {selectedTraitor ? '투표 완료' : '배신자 없이 완료'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .mvp-overlay {
    position: fixed;
    inset: 0;
    z-index: 850;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(6px);
    animation: mvpFadeIn 0.3s ease-out;
  }
  @keyframes mvpFadeIn { from { opacity: 0; } to { opacity: 1; } }

  .mvp-card {
    background: linear-gradient(135deg, #1a1c2e 0%, #12131f 100%);
    border: 1px solid rgba(255, 204, 0, 0.25);
    border-radius: 20px;
    padding: 28px;
    width: 440px;
    max-width: 95vw;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.7);
    animation: mvpSlideUp 0.35s ease-out;
  }
  @keyframes mvpSlideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  .mvp-header {
    text-align: center;
    margin-bottom: 20px;
  }
  .mvp-icon {
    font-size: 32px;
    display: block;
    margin-bottom: 8px;
  }
  .mvp-title {
    font-size: 18px;
    font-weight: 700;
    color: #fff;
    margin: 0 0 6px;
    letter-spacing: 0.5px;
  }
  .mvp-desc {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    margin: 0;
  }

  .agent-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 20px;
  }

  .agent-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 14px 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 130px;
  }
  .agent-card:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.07);
  }
  .agent-card.selected {
    border-color: rgba(255, 204, 0, 0.6);
    background: rgba(255, 204, 0, 0.1);
    box-shadow: 0 0 20px rgba(255, 204, 0, 0.15);
  }
  .agent-card.disabled-card {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .agent-icon { font-size: 24px; }
  .agent-name {
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.5px;
  }
  .agent-tier {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .agent-dir {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 6px;
  }
  .agent-dir.long {
    color: #4cd964;
    background: rgba(76, 217, 100, 0.1);
  }
  .agent-dir.short {
    color: #ff3b30;
    background: rgba(255, 59, 48, 0.1);
  }
  .agent-result {
    font-size: 10px;
    font-weight: 600;
  }
  .agent-result.correct { color: #4cd964; }
  .agent-result.wrong { color: #ff3b30; }

  .selected-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    font-size: 9px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 8px;
    letter-spacing: 0.5px;
    animation: badgePop 0.2s ease-out;
  }
  @keyframes badgePop { from { transform: scale(0.5); } to { transform: scale(1); } }

  .mvp-badge {
    background: rgba(255, 204, 0, 0.9);
    color: #000;
  }
  .traitor-badge {
    background: rgba(255, 59, 48, 0.9);
    color: #fff;
  }

  .mvp-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .btn-confirm {
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, #ffcc00, #ff9500);
    color: #000;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .btn-confirm:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(255, 204, 0, 0.4);
  }
  .btn-confirm:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-skip {
    width: 100%;
    padding: 10px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    background: transparent;
    color: rgba(255, 255, 255, 0.4);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .btn-skip:hover {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.6);
  }
</style>
