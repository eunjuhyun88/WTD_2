<!-- ═══════════════════════════════════════════
  agents/+page.svelte — Agent Collection (Pokedex-style)
  AI 학습 기반 에이전트 컬렉션 페이지
═══════════════════════════════════════════ -->
<script lang="ts">
  import { agentStats, getWinRate, type AgentStats, type AgentLearning, createDefaultLearning } from '$lib/stores/agentData';
  import { getAgentCharacter, getTierForLevel, getTierInfo, getTypeBadge } from '$lib/engine/agentCharacter';
  import type { AgentId } from '$lib/engine/types';
  import { AGENT_IDS } from '$lib/engine/types';
  import PokemonFrame from '../../components/shared/PokemonFrame.svelte';

  let stats = $derived($agentStats);
  let selectedAgent = $state<AgentId | null>(null);

  // Get all agents in display order
  const agentOrder: AgentId[] = AGENT_IDS as unknown as AgentId[];

  // Helper to safely get learning data
  function getLearning(agentId: string): AgentLearning {
    return stats[agentId]?.learning ?? createDefaultLearning();
  }

  function getAgentStat(agentId: string): AgentStats | null {
    return stats[agentId] ?? null;
  }

  function selectAgent(id: AgentId) {
    selectedAgent = selectedAgent === id ? null : id;
  }
</script>

<svelte:head>
  <title>STOCKCLAW — Agent Collection</title>
</svelte:head>

<div class="agents-page">
  <div class="page-header">
    <h1>AGENT COLLECTION</h1>
    <p class="subtitle">AI 에이전트 학습 현황 & 성장 기록</p>
  </div>

  <!-- Agent Grid -->
  <div class="agent-grid">
    {#each agentOrder as agentId}
      {@const char = getAgentCharacter(agentId)}
      {@const stat = getAgentStat(agentId)}
      {@const learning = getLearning(agentId)}
      {@const tier = getTierForLevel(stat?.level ?? 1)}
      {@const tierInfo = getTierInfo(tier)}
      {@const typeBadge = getTypeBadge(char.type)}
      {@const winRate = stat ? getWinRate(stat) : 0}
      {@const isSelected = selectedAgent === agentId}

      <button
        class="agent-card"
        class:selected={isSelected}
        onclick={() => selectAgent(agentId)}
        style:--agent-color={char.color}
        style:--agent-color-secondary={char.colorSecondary}
      >
        <PokemonFrame variant={isSelected ? 'accent' : 'default'} padding="8px">
          <!-- Top: Avatar + Info -->
          <div class="card-top">
            <div class="avatar" style:background={char.gradientCSS}>
              <span class="avatar-initial">{agentId.charAt(0)}</span>
              {#if tier >= 2}
                <span class="tier-badge" style:background={tierInfo.glowColor}>
                  T{tier}
                </span>
              {/if}
            </div>
            <div class="card-info">
              <span class="card-name">{char.nameKR}</span>
              <span class="card-title">{char.titleKR}</span>
              <span class="card-type" style:color={typeBadge.color}>
                {typeBadge.icon} {typeBadge.name}
              </span>
            </div>
          </div>

          <!-- Stats Row -->
          <div class="stats-row">
            <div class="stat-chip">
              <span class="stat-label">LV</span>
              <span class="stat-value">{learning.learningLevel || stat?.level || 1}</span>
            </div>
            <div class="stat-chip">
              <span class="stat-label">WIN</span>
              <span class="stat-value">{winRate}%</span>
            </div>
            <div class="stat-chip">
              <span class="stat-label">EXP</span>
              <span class="stat-value">{learning.totalRAGEntries}</span>
            </div>
            <div class="stat-chip">
              <span class="stat-label">PAT</span>
              <span class="stat-value">{learning.patternMemory.length}</span>
            </div>
          </div>

          <!-- Learning bar -->
          <div class="learning-bar">
            <div class="learning-fill" style="width: {Math.min(100, (learning.learningLevel / 50) * 100)}%"></div>
          </div>
        </PokemonFrame>
      </button>
    {/each}
  </div>

  <!-- Selected Agent Detail Panel -->
  {#if selectedAgent}
    {@const char = getAgentCharacter(selectedAgent)}
    {@const stat = getAgentStat(selectedAgent)}
    {@const learning = getLearning(selectedAgent)}
    {@const tier = getTierForLevel(stat?.level ?? 1)}
    {@const tierInfo = getTierInfo(tier)}
    {@const typeBadge = getTypeBadge(char.type)}

    <div class="detail-panel">
      <PokemonFrame variant="accent" padding="16px">
        <div class="detail-header">
          <div class="detail-avatar" style:background={char.gradientCSS}>
            <span class="detail-initial">{selectedAgent.charAt(0)}</span>
          </div>
          <div class="detail-info">
            <h2>{char.nameKR} <span class="detail-eng">{char.name}</span></h2>
            <p class="detail-title">{char.titleKR} · {char.title}</p>
            <span class="detail-type" style:color={typeBadge.color}>
              {typeBadge.icon} {typeBadge.name}
            </span>
            <span class="detail-tier" style:color={tierInfo.glowColor || '#888'}>
              {tierInfo.nameKR} (Tier {tier})
            </span>
          </div>
        </div>

        <!-- Base Stats -->
        <div class="detail-section">
          <h3>BASE STATS</h3>
          <div class="stat-bars">
            {#each [
              { label: 'Analysis', value: char.baseStats.analysis },
              { label: 'Accuracy', value: char.baseStats.accuracy },
              { label: 'Speed', value: char.baseStats.speed },
              { label: 'Instinct', value: char.baseStats.instinct },
              { label: 'Synergy', value: char.baseStats.synergy },
              { label: 'Resilience', value: char.baseStats.resilience },
            ] as bar}
              <div class="stat-bar-row">
                <span class="bar-label">{bar.label}</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width: {bar.value}%; background: {char.color}"></div>
                </div>
                <span class="bar-value">{bar.value}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Learning Progress -->
        <div class="detail-section">
          <h3>AI LEARNING</h3>
          <div class="learning-stats">
            <div class="learn-stat">
              <span class="learn-label">Learning Level</span>
              <span class="learn-value">{learning.learningLevel}/50</span>
            </div>
            <div class="learn-stat">
              <span class="learn-label">RAG Entries</span>
              <span class="learn-value">{learning.totalRAGEntries}</span>
            </div>
            <div class="learn-stat">
              <span class="learn-label">Challenge Accuracy</span>
              <span class="learn-value">{(learning.challengeStats.accuracy * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        <!-- Pattern Memory -->
        {#if learning.patternMemory.length > 0}
          <div class="detail-section">
            <h3>PATTERN MEMORY ({learning.patternMemory.length})</h3>
            <div class="pattern-list">
              {#each learning.patternMemory.sort((a, b) => b.encounters - a.encounters).slice(0, 8) as pattern}
                <div class="pattern-item">
                  <span class="pattern-name">{pattern.patternId}</span>
                  <span class="pattern-count">{pattern.encounters}x</span>
                  <span class="pattern-rate"
                    class:good={pattern.successRate >= 0.6}
                    class:bad={pattern.successRate < 0.4}
                  >
                    {(pattern.successRate * 100).toFixed(0)}%
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Regime Adaptation -->
        {#if learning.regimeAdaptation.length > 0}
          <div class="detail-section">
            <h3>REGIME ADAPTATION</h3>
            <div class="regime-list">
              {#each learning.regimeAdaptation as regime}
                <div class="regime-item">
                  <span class="regime-name">{regime.regime}</span>
                  <span class="regime-battles">{regime.battles} battles</span>
                  <span class="regime-rate"
                    class:good={regime.winRate >= 0.55}
                    class:bad={regime.winRate < 0.45}
                  >
                    {(regime.winRate * 100).toFixed(0)}%
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Matchup Experience -->
        {#if learning.matchupExperience.length > 0}
          <div class="detail-section">
            <h3>MATCHUP EXPERIENCE</h3>
            <div class="matchup-list">
              {#each learning.matchupExperience as matchup}
                {@const oppBadge = getTypeBadge(matchup.opposingType as any)}
                <div class="matchup-item">
                  <span class="matchup-type" style:color={oppBadge.color}>
                    {oppBadge.icon} vs {oppBadge.name}
                  </span>
                  <span class="matchup-battles">{matchup.battles}</span>
                  <span class="matchup-rate"
                    class:good={matchup.winRate >= 0.55}
                    class:bad={matchup.winRate < 0.45}
                  >
                    {(matchup.winRate * 100).toFixed(0)}%
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Battle Record -->
        {#if stat && stat.matches.length > 0}
          <div class="detail-section">
            <h3>RECENT BATTLES</h3>
            <div class="match-list">
              {#each stat.matches.slice(-5).reverse() as match}
                <div class="match-item" class:win={match.win} class:loss={!match.win}>
                  <span class="match-result">{match.win ? 'W' : 'L'}</span>
                  <span class="match-dir">{match.dir}</span>
                  <span class="match-conf">{match.conf}%</span>
                  <span class="match-lp" class:positive={match.lp > 0} class:negative={match.lp < 0}>
                    {match.lp > 0 ? '+' : ''}{match.lp} LP
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Signature Move -->
        <div class="detail-section">
          <h3>SIGNATURE MOVE</h3>
          <div class="signature-card">
            <span class="sig-name">{char.signature.nameKR}</span>
            <span class="sig-desc">{char.signature.descriptionKR}</span>
            <span class="sig-trigger">{char.signature.trigger}</span>
            <span class="sig-effect">{char.signature.effect}</span>
            {#if tier < char.signature.minTier}
              <span class="sig-locked">Tier {char.signature.minTier}에서 해금</span>
            {:else}
              <span class="sig-unlocked">해금됨!</span>
            {/if}
          </div>
        </div>
      </PokemonFrame>
    </div>
  {/if}
</div>

<style>
  .agents-page {
    width: 100%;
    min-height: 100vh;
    background: var(--arena-bg-0, #07130d);
    color: var(--arena-text-0, #e0f0e8);
    font-family: 'Space Grotesk', 'Pretendard', sans-serif;
    padding: 24px 16px;
    max-width: 900px;
    margin: 0 auto;
  }

  .page-header {
    text-align: center;
    margin-bottom: 24px;
  }

  .page-header h1 {
    font-family: 'Bebas Neue', 'Orbitron', sans-serif;
    font-size: 2rem;
    color: var(--arena-accent, #e8967d);
    margin: 0;
    letter-spacing: 4px;
  }

  .subtitle {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    color: var(--arena-text-2, #5a7d6e);
    margin: 4px 0 0;
    letter-spacing: 1px;
  }

  /* ── Agent Grid ── */
  .agent-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
    margin-bottom: 20px;
  }

  .agent-card {
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
    text-align: left;
    transition: transform 0.15s ease;
    color: inherit;
  }

  .agent-card:hover {
    transform: translateY(-2px);
  }

  .agent-card.selected {
    transform: scale(1.02);
  }

  .card-top {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid rgba(255,255,255,0.15);
    position: relative;
    flex-shrink: 0;
  }

  .avatar-initial {
    font-size: 18px;
    font-weight: 900;
    color: white;
    font-family: 'JetBrains Mono', monospace;
  }

  .tier-badge {
    position: absolute;
    bottom: -4px;
    right: -4px;
    font-size: 7px;
    font-weight: 900;
    color: #111;
    padding: 1px 3px;
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
  }

  .card-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow: hidden;
  }

  .card-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .card-title {
    font-size: 0.55rem;
    color: var(--arena-text-2, #5a7d6e);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-type {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    font-weight: 800;
    letter-spacing: 0.5px;
  }

  .stats-row {
    display: flex;
    gap: 4px;
    margin: 6px 0;
  }

  .stat-chip {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 3px;
    background: rgba(0,0,0,0.3);
    border-radius: 3px;
  }

  .stat-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.45rem;
    font-weight: 900;
    color: var(--arena-text-2, #5a7d6e);
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    font-weight: 900;
    color: var(--arena-text-0, #e0f0e8);
  }

  .learning-bar {
    width: 100%;
    height: 3px;
    background: rgba(0,0,0,0.3);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 4px;
  }

  .learning-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--arena-accent, #e8967d), #f8d030);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  /* ── Detail Panel ── */
  .detail-panel {
    margin-top: 12px;
  }

  .detail-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
  }

  .detail-avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 3px solid rgba(255,255,255,0.2);
    flex-shrink: 0;
  }

  .detail-initial {
    font-size: 28px;
    font-weight: 900;
    color: white;
    font-family: 'JetBrains Mono', monospace;
  }

  .detail-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .detail-info h2 {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.1rem;
    margin: 0;
    color: var(--arena-text-0, #e0f0e8);
  }

  .detail-eng {
    font-size: 0.7rem;
    color: var(--arena-text-2, #5a7d6e);
    font-weight: 400;
  }

  .detail-title {
    font-size: 0.7rem;
    color: var(--arena-text-2, #5a7d6e);
    margin: 0;
  }

  .detail-type, .detail-tier {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    font-weight: 800;
    letter-spacing: 0.5px;
  }

  .detail-section {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid rgba(255,255,255,0.05);
  }

  .detail-section h3 {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    font-weight: 900;
    color: var(--arena-accent, #e8967d);
    letter-spacing: 2px;
    margin: 0 0 8px;
  }

  /* Stat bars */
  .stat-bars {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .stat-bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bar-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    color: var(--arena-text-2, #5a7d6e);
    width: 65px;
    text-align: right;
  }

  .bar-track {
    flex: 1;
    height: 6px;
    background: rgba(0,0,0,0.4);
    border-radius: 3px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .bar-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--arena-text-0, #e0f0e8);
    width: 24px;
    text-align: right;
  }

  /* Learning stats */
  .learning-stats {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
  }

  .learn-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    background: rgba(0,0,0,0.2);
    border-radius: 6px;
    text-align: center;
  }

  .learn-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.5rem;
    color: var(--arena-text-2, #5a7d6e);
    font-weight: 900;
    letter-spacing: 0.5px;
  }

  .learn-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.9rem;
    font-weight: 900;
    color: var(--arena-text-0, #e0f0e8);
  }

  /* Pattern list */
  .pattern-list, .regime-list, .matchup-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .pattern-item, .regime-item, .matchup-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    background: rgba(0,0,0,0.2);
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
  }

  .pattern-name, .regime-name {
    flex: 1;
    font-weight: 700;
    color: var(--arena-text-0, #e0f0e8);
  }

  .pattern-count, .regime-battles, .matchup-battles {
    color: var(--arena-text-2, #5a7d6e);
    font-size: 0.55rem;
  }

  .pattern-rate, .regime-rate, .matchup-rate {
    font-weight: 900;
    min-width: 30px;
    text-align: right;
  }

  .good { color: #48d868; }
  .bad { color: #f85858; }

  .matchup-type {
    flex: 1;
    font-weight: 800;
  }

  /* Match list */
  .match-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .match-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
  }

  .match-item.win { background: rgba(72, 216, 104, 0.08); }
  .match-item.loss { background: rgba(248, 88, 88, 0.08); }

  .match-result {
    font-weight: 900;
    width: 16px;
  }

  .match-item.win .match-result { color: #48d868; }
  .match-item.loss .match-result { color: #f85858; }

  .match-dir {
    color: var(--arena-text-1, #8ba59e);
    width: 55px;
  }

  .match-conf {
    color: var(--arena-text-2, #5a7d6e);
  }

  .match-lp {
    margin-left: auto;
    font-weight: 700;
  }

  .positive { color: #48d868; }
  .negative { color: #f85858; }

  /* Signature card */
  .signature-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px;
    background: rgba(0,0,0,0.2);
    border-radius: 6px;
    border-left: 3px solid var(--arena-accent, #e8967d);
  }

  .sig-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    font-weight: 900;
    color: var(--arena-accent, #e8967d);
  }

  .sig-desc, .sig-trigger, .sig-effect {
    font-size: 0.6rem;
    color: var(--arena-text-2, #5a7d6e);
    line-height: 1.4;
  }

  .sig-trigger {
    color: var(--arena-text-1, #8ba59e);
  }

  .sig-effect {
    color: #f8d030;
    font-weight: 700;
  }

  .sig-locked {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    color: #f85858;
    font-weight: 900;
    letter-spacing: 0.5px;
  }

  .sig-unlocked {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    color: #48d868;
    font-weight: 900;
    letter-spacing: 0.5px;
  }
</style>
