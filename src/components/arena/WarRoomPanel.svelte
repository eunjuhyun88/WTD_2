<!--
  STOCKCLAW — War Room Panel (3-Round Agent LLM Debate)
  Replaces the static Emergency Meeting with interactive debate.

  Phase Flow:
    ROUND_1 (loading) → ROUND_1_INTERACT (user picks agree/challenge/question)
    → ROUND_2 (loading) → ROUND_2_INTERACT
    → ROUND_3 (loading) → VOTING (MVP/Traitor) → COMPLETE
-->
<script lang="ts">
  import {
    warRoom,
    warRoomPhase,
    warRoomLoading,
    currentRoundDialogues,
    allDialogues,
    allConfidenceShifts,
    canInteract,
    startWarRoom,
    addUserInteraction,
    advanceWarRoom,
    submitVote,
    resetWarRoom,
  } from '$lib/stores/warRoomStore';
  import type {
    WarRoomDialogue,
    WarRoomConfidenceShift,
    UserInteractionType,
  } from '$lib/engine/types';

  interface Props {
    matchId: string | null;
    visible: boolean;
    onComplete?: () => void;
  }

  let { matchId, visible, onComplete }: Props = $props();

  // Local state
  let selectedVoteMvp: string | null = $state(null);
  let selectedVoteTraitor: string | null = $state(null);

  // Round display
  let displayRound = $derived(
    $warRoom.phase === 'ROUND_1' || $warRoom.phase === 'ROUND_1_INTERACT' ? 1 :
    $warRoom.phase === 'ROUND_2' || $warRoom.phase === 'ROUND_2_INTERACT' ? 2 :
    $warRoom.phase === 'ROUND_3' || $warRoom.phase === 'VOTING' || $warRoom.phase === 'COMPLETE' ? 3 : 0
  );

  // User interactions for current round
  let currentInteractions = $derived(
    $warRoom.userInteractions.filter(i =>
      i.round === (displayRound <= 2 ? displayRound : 2)
    )
  );

  function getInteractionForAgent(agentId: string): UserInteractionType | null {
    const round = displayRound <= 2 ? displayRound : 2;
    const interaction = $warRoom.userInteractions.find(
      i => i.agentId === agentId && i.round === round
    );
    return interaction?.type ?? null;
  }

  function handleInteraction(agentId: string, type: UserInteractionType) {
    addUserInteraction(agentId, type);
  }

  async function handleAdvance() {
    await advanceWarRoom();
  }

  function handleVote() {
    submitVote(selectedVoteMvp, selectedVoteTraitor);
    onComplete?.();
  }

  async function handleStart() {
    if (matchId) {
      await startWarRoom(matchId);
    }
  }

  // Get confidence change indicator
  function getConfChange(agentId: string): WarRoomConfidenceShift | null {
    return $allConfidenceShifts.find(s => s.agentId === agentId) ?? null;
  }

  // Direction color
  function dirColor(dir: string): string {
    return dir === 'LONG' ? '#00cc88' : dir === 'SHORT' ? '#ff5e7a' : '#ffcc00';
  }
</script>

{#if visible}
  <div class="wr-panel">
    <div class="wr-header">
      <span class="wr-icon">⚔️</span>
      <span class="wr-title">WAR ROOM</span>
      <span class="wr-round">ROUND {displayRound}/3</span>
      <div class="wr-progress">
        {#each [1, 2, 3] as r}
          <div class="wr-dot" class:active={r <= displayRound} class:current={r === displayRound}></div>
        {/each}
      </div>
    </div>

    <!-- Loading State -->
    {#if $warRoomLoading}
      <div class="wr-loading">
        <div class="wr-spinner"></div>
        <span>에이전트들이 토론 중...</span>
      </div>
    {/if}

    <!-- Idle — Start Button -->
    {#if $warRoom.phase === 'IDLE'}
      <div class="wr-start">
        <p class="wr-desc">에이전트 3명이 서로 공격하며 3라운드 토론을 벌입니다.</p>
        <p class="wr-desc-sub">당신의 반응(동의/도전/질문)이 토론 결과에 영향을 줍니다!</p>
        <button class="wr-start-btn" onclick={handleStart} disabled={!matchId}>
          🗡️ WAR ROOM 시작
        </button>
      </div>
    {/if}

    <!-- Error -->
    {#if $warRoom.error}
      <div class="wr-error">{$warRoom.error}</div>
    {/if}

    <!-- Dialogue Cards -->
    {#if !$warRoomLoading && $warRoom.rounds.length > 0}
      <div class="wr-dialogues">
        {#each $currentRoundDialogues as dialogue (dialogue.agentId)}
          {@const confChange = getConfChange(dialogue.agentId)}
          {@const myInteraction = getInteractionForAgent(dialogue.agentId)}
          <div class="wr-card" class:referenced={dialogue.referencedAgent}>
            <div class="wr-card-header">
              <span class="wr-agent-name">{dialogue.personaName}</span>
              <span class="wr-dir" style="color:{dirColor(dialogue.direction)}">{dialogue.direction}</span>
              <span class="wr-conf">
                {dialogue.confidence}%
                {#if confChange}
                  <span class="wr-conf-delta" class:up={confChange.newConf > confChange.oldConf} class:down={confChange.newConf < confChange.oldConf}>
                    {confChange.newConf > confChange.oldConf ? '▲' : '▼'}{Math.abs(confChange.newConf - confChange.oldConf)}
                  </span>
                {/if}
              </span>
            </div>

            <div class="wr-card-text">
              {dialogue.text}
            </div>

            {#if dialogue.referencedAgent}
              <div class="wr-card-ref">
                → 반박 대상: {dialogue.referencedAgent}
              </div>
            {/if}

            <!-- User Interaction Buttons -->
            {#if $canInteract}
              <div class="wr-card-actions">
                <button
                  class="wr-action-btn agree"
                  class:selected={myInteraction === 'agree'}
                  onclick={() => handleInteraction(dialogue.agentId, 'agree')}
                >
                  👍 동의
                </button>
                <button
                  class="wr-action-btn challenge"
                  class:selected={myInteraction === 'challenge'}
                  onclick={() => handleInteraction(dialogue.agentId, 'challenge')}
                >
                  ⚡ 도전
                </button>
                <button
                  class="wr-action-btn question"
                  class:selected={myInteraction === 'question'}
                  onclick={() => handleInteraction(dialogue.agentId, 'question')}
                >
                  ❓ 질문
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Advance Button -->
      {#if $canInteract}
        <button class="wr-advance-btn" onclick={handleAdvance}>
          {displayRound === 1 ? '2라운드 → 반박' : '3라운드 → 최종 확신'}
        </button>
      {/if}

      <!-- Voting Phase -->
      {#if $warRoom.phase === 'VOTING'}
        <div class="wr-voting">
          <div class="wr-vote-header">🗳️ MVP & TRAITOR 투표</div>

          <div class="wr-vote-section">
            <span class="wr-vote-label">🏆 MVP (가장 도움된 에이전트)</span>
            <div class="wr-vote-options">
              {#each $currentRoundDialogues as d (d.agentId)}
                <button
                  class="wr-vote-btn mvp"
                  class:selected={selectedVoteMvp === d.agentId}
                  onclick={() => selectedVoteMvp = d.agentId}
                >
                  {d.personaName}
                </button>
              {/each}
            </div>
          </div>

          <div class="wr-vote-section">
            <span class="wr-vote-label">🔪 TRAITOR (가장 틀린 에이전트)</span>
            <div class="wr-vote-options">
              {#each $currentRoundDialogues as d (d.agentId)}
                <button
                  class="wr-vote-btn traitor"
                  class:selected={selectedVoteTraitor === d.agentId}
                  onclick={() => selectedVoteTraitor = d.agentId}
                >
                  {d.personaName}
                </button>
              {/each}
            </div>
          </div>

          <button class="wr-submit-vote" onclick={handleVote} disabled={!selectedVoteMvp}>
            투표 확인
          </button>
        </div>
      {/if}

      <!-- Complete -->
      {#if $warRoom.phase === 'COMPLETE'}
        <div class="wr-complete">
          <span class="wr-complete-text">✅ War Room 토론 완료!</span>
          {#if $warRoom.vote?.mvpAgentId}
            <span class="wr-complete-mvp">🏆 MVP: {$currentRoundDialogues.find(d => d.agentId === $warRoom.vote?.mvpAgentId)?.personaName}</span>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .wr-panel {
    background: linear-gradient(135deg, rgba(15,18,30,.95) 0%, rgba(10,14,25,.95) 100%);
    border: 1px solid rgba(232,150,125,.25);
    border-radius: 16px;
    padding: 16px;
    max-height: 70vh;
    overflow-y: auto;
    width: 100%;
    max-width: 480px;
    animation: wrSlideIn 0.3s ease;
  }
  @keyframes wrSlideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  .wr-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(232,150,125,.2);
  }
  .wr-icon { font-size: 20px; }
  .wr-title { font-size: 13px; font-weight: 900; letter-spacing: 3px; color: #e8967d; }
  .wr-round { font-size: 10px; font-weight: 700; color: rgba(255,255,255,.4); margin-left: auto; }

  .wr-progress { display: flex; gap: 6px; margin-left: 8px; }
  .wr-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.15); transition: all .3s; }
  .wr-dot.active { background: #e8967d; }
  .wr-dot.current { background: #ff5e7a; box-shadow: 0 0 8px rgba(255,94,122,.5); animation: wrPulse .8s ease infinite; }
  @keyframes wrPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.3); } }

  .wr-loading {
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    padding: 32px 0; color: rgba(255,255,255,.5); font-size: 12px;
  }
  .wr-spinner {
    width: 28px; height: 28px; border: 3px solid rgba(232,150,125,.2);
    border-top-color: #e8967d; border-radius: 50%;
    animation: wrSpin .8s linear infinite;
  }
  @keyframes wrSpin { to { transform: rotate(360deg); } }

  .wr-start { text-align: center; padding: 24px 0; }
  .wr-desc { font-size: 12px; color: rgba(255,255,255,.6); margin-bottom: 8px; }
  .wr-desc-sub { font-size: 10px; color: rgba(232,150,125,.6); margin-bottom: 16px; }
  .wr-start-btn {
    padding: 12px 28px; border: 1px solid rgba(232,150,125,.4); border-radius: 12px;
    background: linear-gradient(135deg, rgba(232,150,125,.2), rgba(232,150,125,.08));
    color: #e8967d; font-size: 13px; font-weight: 900; letter-spacing: 2px;
    cursor: pointer; transition: all .15s;
  }
  .wr-start-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(232,150,125,.3); }
  .wr-start-btn:disabled { opacity: .4; cursor: not-allowed; }

  .wr-error {
    background: rgba(255,59,48,.15); color: #ff3b30; font-size: 11px;
    padding: 8px 12px; border-radius: 8px; margin-bottom: 12px;
    border: 1px solid rgba(255,59,48,.3);
  }

  .wr-dialogues { display: flex; flex-direction: column; gap: 10px; }

  .wr-card {
    background: rgba(255,255,255,.03);
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 12px; padding: 12px;
    animation: wrCardIn .3s ease;
  }
  @keyframes wrCardIn { from { transform: translateX(-10px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  .wr-card.referenced { border-left: 3px solid rgba(255,94,122,.4); }

  .wr-card-header {
    display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
  }
  .wr-agent-name { font-size: 11px; font-weight: 900; color: #e8967d; letter-spacing: 1px; }
  .wr-dir { font-size: 10px; font-weight: 800; letter-spacing: 1px; }
  .wr-conf { font-size: 10px; color: rgba(255,255,255,.5); margin-left: auto; }
  .wr-conf-delta { margin-left: 4px; font-size: 9px; font-weight: 800; }
  .wr-conf-delta.up { color: #00cc88; }
  .wr-conf-delta.down { color: #ff3b30; }

  .wr-card-text {
    font-size: 12px; color: rgba(255,255,255,.8); line-height: 1.5;
    word-break: keep-all;
  }

  .wr-card-ref {
    margin-top: 6px; font-size: 9px; color: rgba(255,94,122,.6);
    font-style: italic;
  }

  .wr-card-actions {
    display: flex; gap: 6px; margin-top: 10px; padding-top: 8px;
    border-top: 1px solid rgba(255,255,255,.06);
  }
  .wr-action-btn {
    flex: 1; padding: 6px 4px; border: 1px solid rgba(255,255,255,.1);
    border-radius: 8px; font-size: 10px; font-weight: 700;
    background: rgba(255,255,255,.03); color: rgba(255,255,255,.5);
    cursor: pointer; transition: all .15s;
  }
  .wr-action-btn:hover { border-color: rgba(255,255,255,.25); }
  .wr-action-btn.agree.selected { border-color: rgba(0,204,136,.5); background: rgba(0,204,136,.15); color: #00cc88; }
  .wr-action-btn.challenge.selected { border-color: rgba(255,94,122,.5); background: rgba(255,94,122,.15); color: #ff5e7a; }
  .wr-action-btn.question.selected { border-color: rgba(100,149,237,.5); background: rgba(100,149,237,.15); color: #6495ed; }

  .wr-advance-btn {
    width: 100%; padding: 12px; margin-top: 12px;
    border: 1px solid rgba(232,150,125,.3); border-radius: 12px;
    background: linear-gradient(135deg, rgba(232,150,125,.15), rgba(232,150,125,.05));
    color: #e8967d; font-size: 12px; font-weight: 800; letter-spacing: 1.5px;
    cursor: pointer; transition: all .15s;
  }
  .wr-advance-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(232,150,125,.2); }

  .wr-voting {
    margin-top: 16px; padding-top: 16px;
    border-top: 1px solid rgba(232,150,125,.2);
  }
  .wr-vote-header {
    font-size: 13px; font-weight: 900; color: #e8967d;
    letter-spacing: 2px; margin-bottom: 12px; text-align: center;
  }
  .wr-vote-section { margin-bottom: 12px; }
  .wr-vote-label { font-size: 10px; font-weight: 700; color: rgba(255,255,255,.5); display: block; margin-bottom: 6px; }
  .wr-vote-options { display: flex; gap: 6px; }
  .wr-vote-btn {
    flex: 1; padding: 8px 4px; border: 1px solid rgba(255,255,255,.1);
    border-radius: 8px; font-size: 10px; font-weight: 700;
    background: rgba(255,255,255,.03); color: rgba(255,255,255,.5);
    cursor: pointer; transition: all .15s;
  }
  .wr-vote-btn.mvp.selected { border-color: rgba(255,204,0,.5); background: rgba(255,204,0,.15); color: #ffcc00; }
  .wr-vote-btn.traitor.selected { border-color: rgba(255,59,48,.5); background: rgba(255,59,48,.15); color: #ff3b30; }

  .wr-submit-vote {
    width: 100%; padding: 10px; margin-top: 8px;
    border: 1px solid rgba(232,150,125,.4); border-radius: 10px;
    background: rgba(232,150,125,.15); color: #e8967d;
    font-size: 11px; font-weight: 800; letter-spacing: 1.5px;
    cursor: pointer; transition: all .15s;
  }
  .wr-submit-vote:disabled { opacity: .4; cursor: not-allowed; }
  .wr-submit-vote:hover:not(:disabled) { background: rgba(232,150,125,.25); }

  .wr-complete {
    text-align: center; padding: 16px 0;
    display: flex; flex-direction: column; gap: 4px;
  }
  .wr-complete-text { font-size: 13px; font-weight: 800; color: #00cc88; }
  .wr-complete-mvp { font-size: 11px; color: #ffcc00; }
</style>
