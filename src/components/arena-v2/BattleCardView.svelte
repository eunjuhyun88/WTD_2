<script lang="ts">
  /**
   * Card Duel View — "겜블러 뷰"
   * Card table aesthetic, each tick = a card played
   * Agent cards vs Market cards, score-based
   */
  import type { V2BattleState, TickResult } from '$lib/engine/v2BattleTypes';
  import { AGDEFS } from '$lib/data/agents';

  export let battleState: V2BattleState | null = null;

  $: bs = battleState;
  $: tickN = bs?.tickN ?? 0;
  $: maxTicks = bs?.maxTicks ?? 24;
  $: vs = bs?.vsMeter.value ?? 50;
  $: combo = bs?.combo.count ?? 0;
  $: agentStates = bs ? Object.values(bs.agentStates) : [];
  $: currentPrice = bs?.currentPrice ?? 0;
  $: entryPrice = bs?.config.entryPrice ?? 0;
  $: direction = bs?.config.direction ?? 'LONG';
  $: pnl = entryPrice > 0
    ? (direction === 'LONG'
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100)
    : 0;

  // Card history (last 8 ticks as "played cards")
  $: cards = (bs?.tickResults ?? []).slice(-8).map(tr => {
    const isFav = tr.classifiedTick.isFavorable;
    const isNeutral = tr.classifiedTick.tickClass === 'NEUTRAL';
    const delta = tr.classifiedTick.deltaPct;
    const mainAction = tr.agentActions.find(a => a.action !== 'IDLE' && a.action !== 'RECOVER');
    return {
      tickN: tr.tickN,
      isFav,
      isNeutral,
      delta,
      action: mainAction?.action ?? 'IDLE',
      agentId: mainAction?.agentId ?? '',
      isCrit: mainAction?.isCritical ?? false,
      vsChange: tr.vsChange,
    };
  });

  // Score: count favorable vs unfavorable ticks
  $: favCount = (bs?.tickResults ?? []).filter(t => t.classifiedTick.isFavorable).length;
  $: unfavCount = (bs?.tickResults ?? []).filter(t =>
    t.classifiedTick.tickClass === 'UNFAVORABLE' || t.classifiedTick.tickClass === 'STRONG_UNFAVORABLE'
  ).length;

  // Latest card for flip animation
  $: latestCard = cards.length > 0 ? cards[cards.length - 1] : null;

  function getAgentImg(agentId: string): string {
    const def = AGDEFS.find(a => a.id === agentId.toLowerCase());
    return def?.img.def ?? '/doge/char-structure.png';
  }

  function getActionEmoji(action: string): string {
    const map: Record<string, string> = {
      DASH: '⚡', BURST: '💥', FINISHER: '🌟', SHIELD: '🛡',
      PING: '📡', HOOK: '🪝', ASSIST: '✨', TAUNT: '😤',
      IDLE: '💤', RECOVER: '💚',
    };
    return map[action] ?? '·';
  }
</script>

<div class="card-view">
  <!-- Score Header -->
  <div class="card-score-bar">
    <div class="score-side you">
      <span class="score-label">YOU</span>
      <span class="score-num">{favCount}</span>
    </div>
    <div class="score-center">
      <span class="score-vs">VS</span>
      <span class="score-tick">T{tickN}/{maxTicks}</span>
    </div>
    <div class="score-side market">
      <span class="score-num">{unfavCount}</span>
      <span class="score-label">MKT</span>
    </div>
  </div>

  <!-- Card Table -->
  <div class="card-table">
    <!-- Latest card (big, center) -->
    {#if latestCard}
      <div class="latest-card-area">
        <div
          class="big-card"
          class:card-fav={latestCard.isFav}
          class:card-unfav={!latestCard.isFav && !latestCard.isNeutral}
          class:card-neutral={latestCard.isNeutral}
          class:card-crit={latestCard.isCrit}
        >
          <div class="card-top">
            <span class="card-tick">T{latestCard.tickN}</span>
            <span class="card-delta" class:positive={latestCard.delta >= 0} class:negative={latestCard.delta < 0}>
              {latestCard.delta >= 0 ? '+' : ''}{latestCard.delta.toFixed(3)}%
            </span>
          </div>

          <div class="card-icon">
            {#if latestCard.isFav}
              {getActionEmoji(latestCard.action)}
            {:else if latestCard.isNeutral}
              ⏸
            {:else}
              📉
            {/if}
          </div>

          <div class="card-action">
            {#if latestCard.isFav}
              <span class="card-agent">{latestCard.agentId}</span>
              <span class="card-action-name">{latestCard.action}</span>
            {:else if latestCard.isNeutral}
              <span class="card-action-name">HOLD</span>
            {:else}
              <span class="card-action-name">MARKET STRIKES</span>
            {/if}
          </div>

          <div class="card-bottom">
            <span class="card-vs-change" class:positive={latestCard.vsChange >= 0} class:negative={latestCard.vsChange < 0}>
              VS {latestCard.vsChange >= 0 ? '+' : ''}{latestCard.vsChange.toFixed(1)}
            </span>
          </div>

          {#if latestCard.isCrit}
            <div class="crit-badge">CRIT!</div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Card history (smaller, in a row) -->
    <div class="card-history">
      {#each cards.slice(0, -1) as card (card.tickN)}
        <div
          class="mini-card"
          class:mini-fav={card.isFav}
          class:mini-unfav={!card.isFav && !card.isNeutral}
          class:mini-neutral={card.isNeutral}
        >
          <span class="mini-tick">T{card.tickN}</span>
          <span class="mini-icon">{card.isFav ? '▲' : card.isNeutral ? '—' : '▼'}</span>
          <span class="mini-vs">{card.vsChange >= 0 ? '+' : ''}{card.vsChange.toFixed(0)}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- Bottom: Agent Cards + PnL chips -->
  <div class="card-bottom-bar">
    <!-- Agent hand -->
    <div class="agent-hand">
      {#each agentStates as agent (agent.agentId)}
        <div class="hand-card" class:hand-active={agent.animState === 'CAST'}>
          <img src={getAgentImg(agent.agentId)} alt={agent.agentId} class="hand-img" />
          <span class="hand-name">{agent.agentId}</span>
          <div class="hand-energy">
            <div class="hand-energy-fill" style:width="{(agent.energy / agent.maxEnergy) * 100}%" />
          </div>
        </div>
      {/each}
    </div>

    <!-- PnL chip -->
    <div class="pnl-chip" class:positive={pnl >= 0} class:negative={pnl < 0}>
      <span class="chip-label">PnL</span>
      <span class="chip-val">{pnl >= 0 ? '+' : ''}{pnl.toFixed(3)}%</span>
    </div>

    <!-- Combo indicator -->
    {#if combo >= 2}
      <div class="combo-chip">🔥 {combo}x COMBO</div>
    {/if}
  </div>
</div>

<style>
  .card-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, #0d0b08, #0A0908);
    color: #F0EDE4;
    font-family: var(--fm, 'JetBrains Mono', monospace);
    overflow: hidden;
  }

  /* Score bar */
  .card-score-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(240,237,228,0.06);
    flex-shrink: 0;
  }
  .score-side {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .score-label {
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 3px;
    color: rgba(240,237,228,0.3);
  }
  .score-num {
    font-size: 28px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }
  .score-side.you .score-num { color: #00ff88; }
  .score-side.market .score-num { color: #ff2d55; }
  .score-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .score-vs {
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 4px;
    color: rgba(240,237,228,0.2);
  }
  .score-tick {
    font-size: 8px;
    color: rgba(240,237,228,0.15);
  }

  /* Card table */
  .card-table {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 16px;
    min-height: 0;
  }

  .latest-card-area {
    perspective: 800px;
  }
  .big-card {
    width: 160px;
    height: 220px;
    border-radius: 12px;
    border: 2px solid rgba(240,237,228,0.15);
    background: rgba(240,237,228,0.03);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    position: relative;
    animation: cardFlip 400ms ease;
    transition: all 300ms;
  }
  .big-card.card-fav {
    border-color: rgba(0,255,136,0.4);
    background: linear-gradient(180deg, rgba(0,255,136,0.06), rgba(0,255,136,0.02));
    box-shadow: 0 0 20px rgba(0,255,136,0.1);
  }
  .big-card.card-unfav {
    border-color: rgba(255,45,85,0.4);
    background: linear-gradient(180deg, rgba(255,45,85,0.06), rgba(255,45,85,0.02));
    box-shadow: 0 0 20px rgba(255,45,85,0.1);
  }
  .big-card.card-neutral {
    border-color: rgba(240,237,228,0.1);
  }
  .big-card.card-crit {
    border-color: rgba(255,215,0,0.6);
    box-shadow: 0 0 30px rgba(255,215,0,0.2);
  }

  @keyframes cardFlip {
    0% { transform: rotateY(-90deg) scale(0.8); opacity: 0; }
    50% { transform: rotateY(0deg) scale(1.05); }
    100% { transform: rotateY(0deg) scale(1); opacity: 1; }
  }

  .card-top {
    display: flex;
    justify-content: space-between;
    width: 100%;
  }
  .card-tick {
    font-size: 9px;
    font-weight: 700;
    color: rgba(240,237,228,0.3);
  }
  .card-delta {
    font-size: 10px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .card-icon {
    font-size: 40px;
    margin: 4px 0;
  }

  .card-action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .card-agent {
    font-size: 8px;
    font-weight: 700;
    color: rgba(240,237,228,0.4);
    letter-spacing: 1px;
  }
  .card-action-name {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 2px;
    color: rgba(240,237,228,0.7);
  }

  .card-bottom { width: 100%; text-align: center; }
  .card-vs-change {
    font-size: 11px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .positive { color: #00ff88 !important; }
  .negative { color: #ff2d55 !important; }

  .crit-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    font-size: 9px;
    font-weight: 900;
    color: #0A0908;
    background: #FFD700;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 1px;
    animation: critPop 400ms ease;
  }
  @keyframes critPop {
    0% { transform: scale(0); }
    60% { transform: scale(1.3); }
    100% { transform: scale(1); }
  }

  /* Card history */
  .card-history {
    display: flex;
    gap: 6px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .mini-card {
    width: 44px;
    height: 56px;
    border-radius: 6px;
    border: 1px solid rgba(240,237,228,0.08);
    background: rgba(240,237,228,0.02);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 8px;
    transition: all 200ms;
  }
  .mini-card.mini-fav {
    border-color: rgba(0,255,136,0.2);
    background: rgba(0,255,136,0.03);
  }
  .mini-card.mini-unfav {
    border-color: rgba(255,45,85,0.2);
    background: rgba(255,45,85,0.03);
  }
  .mini-tick {
    font-size: 6px;
    color: rgba(240,237,228,0.2);
  }
  .mini-icon {
    font-size: 12px;
    font-weight: 900;
  }
  .mini-fav .mini-icon { color: #00ff88; }
  .mini-unfav .mini-icon { color: #ff2d55; }
  .mini-neutral .mini-icon { color: rgba(240,237,228,0.3); }
  .mini-vs {
    font-size: 7px;
    font-weight: 700;
    color: rgba(240,237,228,0.4);
  }

  /* Bottom bar */
  .card-bottom-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    border-top: 1px solid rgba(240,237,228,0.06);
    flex-shrink: 0;
    justify-content: center;
  }

  .agent-hand {
    display: flex;
    gap: 8px;
  }
  .hand-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    border: 1px solid rgba(240,237,228,0.08);
    border-radius: 8px;
    background: rgba(240,237,228,0.02);
    transition: all 200ms;
  }
  .hand-card.hand-active {
    border-color: rgba(0,255,136,0.3);
    background: rgba(0,255,136,0.04);
    transform: translateY(-4px);
  }
  .hand-img {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid rgba(240,237,228,0.1);
  }
  .hand-name {
    font-size: 6px;
    font-weight: 700;
    letter-spacing: 1px;
    color: rgba(240,237,228,0.4);
  }
  .hand-energy {
    width: 28px;
    height: 3px;
    background: rgba(240,237,228,0.06);
    border-radius: 2px;
    overflow: hidden;
  }
  .hand-energy-fill {
    height: 100%;
    background: #00ff88;
    transition: width 300ms;
  }

  .pnl-chip {
    padding: 6px 12px;
    border: 1px solid rgba(240,237,228,0.1);
    border-radius: 8px;
    background: rgba(240,237,228,0.02);
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .chip-label {
    font-size: 7px;
    font-weight: 700;
    color: rgba(240,237,228,0.3);
    letter-spacing: 1px;
  }
  .chip-val {
    font-size: 14px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  .combo-chip {
    font-size: 10px;
    font-weight: 900;
    color: #FFD700;
    padding: 4px 10px;
    border: 1px solid rgba(255,215,0,0.2);
    border-radius: 6px;
    background: rgba(255,215,0,0.04);
  }
</style>
