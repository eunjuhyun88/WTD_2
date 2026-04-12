<script lang="ts">
  import { arenaWarStore, arenaWarTimer } from '$lib/stores/arenaWarStore';
  import type { Direction } from '$lib/engine/types';

  let ws = $derived($arenaWarStore);
  let timer = $derived($arenaWarTimer);

  function dirColor(dir: Direction): string {
    if (dir === 'LONG') return 'var(--arena-good, #00cc88)';
    if (dir === 'SHORT') return 'var(--arena-bad, #ff5e7a)';
    return 'var(--arena-text-2, #5a7d6e)';
  }

  let consensusLabel = $derived(
    ws.consensusType === 'consensus' ? 'CONSENSUS' :
    ws.consensusType === 'dissent' ? 'DISSENT' :
    ws.consensusType === 'partial' ? 'PARTIAL' :
    'OVERRIDE'
  );

  let consensusColor = $derived(
    ws.consensusType === 'consensus' ? '#00cc88' :
    ws.consensusType === 'dissent' ? '#ff5e7a' :
    ws.consensusType === 'partial' ? '#f59e0b' :
    '#a78bfa'
  );
</script>

<div class="reveal-phase">
  <div class="reveal-badge" style="border-color: {consensusColor}; color: {consensusColor}">
    {consensusLabel}
  </div>

  <div class="reveal-grid">
    <!-- Human -->
    <div class="reveal-card human">
      <div class="card-header">👤 YOU</div>
      <div class="card-direction" style="color: {dirColor(ws.humanDirection ?? 'NEUTRAL')}">
        {ws.humanDirection ?? 'NEUTRAL'}
      </div>
      <div class="card-conf">{ws.humanConfidence}%</div>
      <div class="card-levels">
        TP {ws.humanTp.toLocaleString()} | SL {ws.humanSl.toLocaleString()}
      </div>
      {#if ws.humanReasonTags.length > 0}
        <div class="card-tags">
          {#each ws.humanReasonTags.slice(0, 3) as tag}
            <span class="tag">{tag.replace(/_/g, ' ')}</span>
          {/each}
        </div>
      {/if}
    </div>

    <!-- VS -->
    <div class="vs-divider">
      <span class="vs-text">VS</span>
      <div class="vs-timer">{timer}s</div>
    </div>

    <!-- AI -->
    <div class="reveal-card ai">
      <div class="card-header">🤖 AI</div>
      <div class="card-direction" style="color: {dirColor(ws.aiDecision?.direction ?? 'NEUTRAL')}">
        {ws.aiDecision?.direction ?? 'NEUTRAL'}
      </div>
      <div class="card-conf">{ws.aiDecision?.confidence ?? 50}%</div>
      <div class="card-levels">
        TP {ws.aiDecision?.tp?.toLocaleString()} | SL {ws.aiDecision?.sl?.toLocaleString()}
      </div>
    </div>
  </div>

  {#if ws.delta}
    <div class="delta-info">
      {#if !ws.delta.sameDirection}
        <span class="delta-badge dissent">반대 방향 — DISSENT WIN 가능!</span>
      {:else}
        <span class="delta-badge same">같은 방향</span>
      {/if}
      <span class="delta-detail">
        확신도 차이: {ws.delta.confidenceDiff > 0 ? '+' : ''}{ws.delta.confidenceDiff}%
      </span>
    </div>
  {/if}

  <div class="reveal-msg">배틀이 곧 시작됩니다...</div>
</div>

<style>
  .reveal-phase {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    padding: 2rem;
    min-height: 400px;
    animation: fadeIn 0.4s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }

  .reveal-badge {
    font-family: 'Bebas Neue', 'Orbitron', sans-serif;
    font-size: 2rem;
    letter-spacing: 5px;
    border: 3px solid;
    padding: 0.3rem 1.5rem;
    border-radius: 8px;
    animation: pulseBorder 1s ease-in-out infinite;
  }

  @keyframes pulseBorder {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .reveal-grid {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    width: 100%;
    max-width: 600px;
  }

  .reveal-card {
    flex: 1;
    padding: 1.2rem;
    background: var(--arena-bg-1, #0d2118);
    border: 2px solid var(--arena-line, #1a3d2e);
    border-radius: 8px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .card-header {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    color: var(--arena-text-2, #5a7d6e);
    letter-spacing: 2px;
  }

  .card-direction {
    font-family: 'Bebas Neue', 'Orbitron', sans-serif;
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: 3px;
  }

  .card-conf {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.2rem;
    color: var(--arena-text-0, #e0f0e8);
  }

  .card-levels {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: var(--arena-text-2, #5a7d6e);
  }

  .card-tags {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.2rem;
    margin-top: 0.3rem;
  }

  .tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.5rem;
    padding: 1px 4px;
    border: 1px solid var(--arena-accent, #e8967d);
    color: var(--arena-accent, #e8967d);
    border-radius: 8px;
  }

  .vs-divider {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .vs-text {
    font-family: 'Bebas Neue', 'Orbitron', sans-serif;
    font-size: 1.8rem;
    color: var(--arena-accent, #e8967d);
    letter-spacing: 3px;
  }

  .vs-timer {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    color: var(--arena-text-2, #5a7d6e);
  }

  .delta-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
  }

  .delta-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    padding: 0.2rem 0.8rem;
    border-radius: 12px;
    font-weight: 600;
  }

  .delta-badge.dissent {
    background: rgba(255, 94, 122, 0.15);
    color: var(--arena-bad, #ff5e7a);
    border: 1px solid rgba(255, 94, 122, 0.3);
  }

  .delta-badge.same {
    background: rgba(0, 204, 136, 0.15);
    color: var(--arena-good, #00cc88);
    border: 1px solid rgba(0, 204, 136, 0.3);
  }

  .delta-detail {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: var(--arena-text-2, #5a7d6e);
  }

  .reveal-msg {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    color: var(--arena-text-2, #5a7d6e);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
