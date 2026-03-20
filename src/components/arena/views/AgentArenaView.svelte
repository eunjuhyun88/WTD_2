<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import type { Phase, Hypothesis } from '$lib/stores/gameState';
  import type { BattleTickState, BattlePriceTick } from '$lib/engine/battleResolver';

  export let phase: Phase = 'DRAFT';
  export let battleTick: BattleTickState | null = null;
  export let hypothesis: Hypothesis | null = null;
  export let prices: { BTC: number } = { BTC: 0 };
  export let battleResult: string | null = null;
  export let battlePriceHistory: BattlePriceTick[] = [];
  export let activeAgents: Array<{ id: string; name: string; icon: string; color: string; dir: string; conf: number }> = [];
  export let battleNarration: string = '';

  const dispatch = createEventDispatcher();

  $: isBattle = phase === 'BATTLE';
  $: isResult = phase === 'RESULT';
  $: currentPrice = battleTick?.currentPrice ?? prices.BTC;
  $: pnl = battleTick?.pnlPercent ?? 0;
  $: pnlPositive = pnl >= 0;
  $: distToTP = battleTick?.distToTP ?? 0;
  $: distToSL = battleTick?.distToSL ?? 0;
  $: rr = hypothesis?.rr ?? 0;
  $: dir = hypothesis?.dir ?? 'NEUTRAL';
  $: timeProgress = battleTick?.timeProgress ?? 0;

  // Boss HP = 100 - distToTP (boss loses health as we approach TP)
  $: bossHP = Math.max(0, Math.min(100, 100 - distToTP));

  // Round counter: divide battle into 8 rounds
  $: roundNum = Math.min(8, Math.max(1, Math.ceil((timeProgress / 100) * 8)));

  // Determine who is "attacking" based on recent price movement
  $: lastTwoTicks = battlePriceHistory.slice(-2);
  $: priceMovingFavorably = (() => {
    if (lastTwoTicks.length < 2) return false;
    const diff = lastTwoTicks[1].price - lastTwoTicks[0].price;
    if (dir === 'LONG') return diff > 0;
    if (dir === 'SHORT') return diff < 0;
    return false;
  })();

  // Pick a random attacking agent index (changes each tick)
  $: attackerIdx = battlePriceHistory.length % activeAgents.length;

  // Compute agent HP: confidence * direction_match_factor
  function agentHP(agent: { dir: string; conf: number }): number {
    const match = agent.dir === dir;
    return Math.round(agent.conf * (match ? 1 : 0.5));
  }

  // Sparkline SVG from price history
  $: sparklinePath = (() => {
    if (battlePriceHistory.length < 2) return '';
    const pts = battlePriceHistory.slice(-60);
    const minP = Math.min(...pts.map(p => p.price));
    const maxP = Math.max(...pts.map(p => p.price));
    const range = maxP - minP || 1;
    const w = 200;
    const h = 28;
    return pts.map((p, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((p.price - minP) / range) * h;
      return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
  })();

  function fmtPrice(p: number): string {
    if (!p) return '---';
    return p.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function fmtPnl(v: number): string {
    const sign = v >= 0 ? '+' : '';
    return sign + v.toFixed(3) + '%';
  }
</script>

<div class="agent-arena">
  <!-- Top Bar -->
  <div class="top-bar">
    <span class="phase-tag">{phase}</span>
    <span class="round">ROUND {roundNum}/8</span>
    <div class="market-hp-wrap">
      <span class="hp-label">MARKET HP</span>
      <div class="hp-bar">
        <div class="hp-fill" style="width:{bossHP}%"></div>
      </div>
      <span class="hp-val">{bossHP.toFixed(0)}</span>
    </div>
  </div>

  <!-- Battle Area -->
  <div class="battle-area">
    {#if isBattle || isResult}
      <!-- Agent Sprites (left side) -->
      <div class="agents-side">
        {#each activeAgents as agent, i}
          {@const isAttacking = priceMovingFavorably && attackerIdx === i && isBattle}
          {@const hp = agentHP(agent)}
          <div
            class="agent-sprite"
            class:attacking={isAttacking}
            class:hurt={!priceMovingFavorably && isBattle}
            style="--agent-color:{agent.color}"
          >
            <div class="sprite-circle" style="border-color:{agent.color}">
              <span class="sprite-letter">{agent.name.charAt(0)}</span>
            </div>
            <div class="agent-name">{agent.name}</div>
            <div class="agent-hp-bar">
              <div class="agent-hp-fill" style="width:{hp}%;background:{agent.color}"></div>
            </div>
            <div class="agent-conf">{agent.conf}%</div>
          </div>
        {/each}
      </div>

      <!-- Boss (center) -->
      <div class="boss-node" class:boss-hurt={priceMovingFavorably && isBattle} class:boss-attack={!priceMovingFavorably && isBattle}>
        <svg class="hp-ring" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(240,237,228,0.08)" stroke-width="6" />
          <circle
            cx="60" cy="60" r="54"
            fill="none"
            stroke={bossHP > 50 ? 'var(--red, #ff2d55)' : bossHP > 20 ? '#ff8800' : 'var(--grn, #00ff88)'}
            stroke-width="6"
            stroke-dasharray={2 * Math.PI * 54}
            stroke-dashoffset={2 * Math.PI * 54 * (1 - bossHP / 100)}
            stroke-linecap="round"
            transform="rotate(-90 60 60)"
            style="transition: stroke-dashoffset 0.4s, stroke 0.4s"
          />
        </svg>
        <div class="boss-inner">
          <div class="boss-label">MARKET</div>
          <div class="boss-price">${fmtPrice(currentPrice)}</div>
          <div class="boss-hp-text">{bossHP.toFixed(0)} HP</div>
        </div>
      </div>

    {:else}
      <!-- Non-battle idle -->
      <div class="idle-state">
        <div class="idle-phase">{phase}</div>
        <div class="idle-label">Assembling squad...</div>
        <div class="idle-agents">
          {#each activeAgents as agent}
            <div class="idle-agent" style="border-color:{agent.color}">
              <span>{agent.name.charAt(0)}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Bottom Bar -->
  <div class="bottom-bar">
    <div class="sparkline-wrap">
      {#if battlePriceHistory.length >= 2}
        <svg viewBox="0 0 200 28" preserveAspectRatio="none" class="sparkline-svg">
          <path d={sparklinePath} fill="none" stroke={pnlPositive ? 'var(--grn, #00ff88)' : 'var(--red, #ff2d55)'} stroke-width="1.5" />
        </svg>
      {:else}
        <div class="spark-empty">---</div>
      {/if}
    </div>

    <div class="pnl-badge" class:positive={pnlPositive} class:negative={!pnlPositive}>
      {fmtPnl(pnl)}
    </div>

    <div class="rr-badge">
      R:R {rr.toFixed(1)}
    </div>

    <div class="narration">{battleNarration || ''}</div>
  </div>

  <!-- Result Overlay -->
  {#if isResult && battleResult}
    <div class="result-overlay">
      <div class="result-icon">{battleResult === 'tp' || battleResult === 'timeout_win' ? 'VICTORY' : 'DEFEAT'}</div>
      <div class="result-pnl" class:positive={pnlPositive}>{fmtPnl(pnl)}</div>
      <div class="result-narration">{battleNarration}</div>
      <div class="result-actions">
        <button on:click={() => dispatch('goLobby')}>LOBBY</button>
        <button class="btn-again" on:click={() => dispatch('playAgain')}>PLAY AGAIN</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .agent-arena {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: #0A0908;
    background-image: radial-gradient(ellipse at 50% 40%, rgba(232, 150, 125, 0.04) 0%, transparent 70%);
    color: #F0EDE4;
    font-family: var(--fm, 'JetBrains Mono', monospace);
    position: relative;
    overflow: hidden;
  }

  /* ── Top Bar ── */
  .top-bar {
    height: 36px;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 14px;
    background: rgba(12, 11, 10, 0.95);
    border-bottom: 1px solid rgba(232, 150, 125, 0.12);
    flex-shrink: 0;
    z-index: 10;
  }
  .phase-tag {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 2px;
    color: #E8967D;
  }
  .round {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: rgba(240, 237, 228, 0.5);
  }
  .market-hp-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }
  .hp-label {
    font-size: 7px;
    font-weight: 800;
    letter-spacing: 1.5px;
    color: rgba(240, 237, 228, 0.4);
  }
  .hp-bar {
    width: 100px;
    height: 8px;
    background: rgba(240, 237, 228, 0.06);
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid rgba(240, 237, 228, 0.1);
  }
  .hp-fill {
    height: 100%;
    background: var(--red, #ff2d55);
    border-radius: 3px;
    transition: width 0.4s ease;
  }
  .hp-val {
    font-size: 10px;
    font-weight: 800;
    color: var(--red, #ff2d55);
    width: 24px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* ── Battle Area ── */
  .battle-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 48px;
    position: relative;
    padding: 24px;
  }

  /* Agent Sprites */
  .agents-side {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .agent-sprite {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    transition: transform 0.2s;
  }
  .agent-sprite.attacking {
    animation: agentAttack 0.4s ease;
  }
  .agent-sprite.hurt {
    animation: agentHurt 0.3s ease;
  }
  .sprite-circle {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: 3px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 9, 8, 0.9);
    box-shadow: 0 0 16px rgba(232, 150, 125, 0.08);
    transition: box-shadow 0.2s;
  }
  .agent-sprite.attacking .sprite-circle {
    box-shadow: 0 0 24px var(--agent-color, #E8967D);
    transform: scale(1.1);
  }
  .sprite-letter {
    font-size: 20px;
    font-weight: 900;
    font-family: var(--fb, 'Space Grotesk', sans-serif);
    color: #F0EDE4;
  }
  .agent-name {
    font-size: 7px;
    font-weight: 800;
    letter-spacing: 1.5px;
    color: rgba(240, 237, 228, 0.6);
  }
  .agent-hp-bar {
    width: 44px;
    height: 4px;
    background: rgba(240, 237, 228, 0.06);
    border-radius: 2px;
    overflow: hidden;
  }
  .agent-hp-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.4s;
  }
  .agent-conf {
    font-size: 8px;
    font-weight: 700;
    color: rgba(240, 237, 228, 0.4);
    font-variant-numeric: tabular-nums;
  }

  @keyframes agentAttack {
    0% { transform: translateX(0); }
    30% { transform: translateX(20px) scale(1.1); }
    100% { transform: translateX(0) scale(1); }
  }
  @keyframes agentHurt {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }

  /* Boss Node */
  .boss-node {
    position: relative;
    width: 120px;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .boss-node.boss-hurt {
    animation: bossHurt 0.3s ease;
  }
  .boss-node.boss-attack {
    animation: bossAttack 0.4s ease;
  }
  .hp-ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .boss-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    z-index: 1;
  }
  .boss-label {
    font-size: 7px;
    font-weight: 800;
    letter-spacing: 2px;
    color: rgba(240, 237, 228, 0.4);
  }
  .boss-price {
    font-size: 14px;
    font-weight: 900;
    color: #F0EDE4;
    font-variant-numeric: tabular-nums;
  }
  .boss-hp-text {
    font-size: 9px;
    font-weight: 700;
    color: var(--red, #ff2d55);
  }

  @keyframes bossHurt {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(0.95); filter: brightness(0.7); }
  }
  @keyframes bossAttack {
    0% { transform: scale(1); }
    40% { transform: scale(1.08); }
    100% { transform: scale(1); }
  }

  /* ── Idle State ── */
  .idle-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    opacity: 0.5;
  }
  .idle-phase {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 3px;
    color: #E8967D;
  }
  .idle-label {
    font-size: 11px;
    color: rgba(240, 237, 228, 0.4);
    animation: idleBlink 2s ease-in-out infinite;
  }
  .idle-agents {
    display: flex;
    gap: 8px;
  }
  .idle-agent {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 9, 8, 0.8);
    font-size: 14px;
    font-weight: 900;
    color: rgba(240, 237, 228, 0.4);
  }

  @keyframes idleBlink {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }

  /* ── Bottom Bar ── */
  .bottom-bar {
    height: 64px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 14px;
    background: rgba(12, 11, 10, 0.95);
    border-top: 1px solid rgba(232, 150, 125, 0.12);
    flex-shrink: 0;
    z-index: 10;
  }
  .sparkline-wrap {
    width: 200px;
    height: 28px;
    flex-shrink: 0;
  }
  .sparkline-svg {
    width: 100%;
    height: 100%;
  }
  .spark-empty {
    font-size: 9px;
    color: rgba(240, 237, 228, 0.2);
    display: flex;
    align-items: center;
    height: 100%;
  }
  .pnl-badge {
    font-size: 13px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    padding: 4px 10px;
    border-radius: 6px;
  }
  .pnl-badge.positive {
    color: var(--grn, #00ff88);
    background: rgba(0, 255, 136, 0.08);
  }
  .pnl-badge.negative {
    color: var(--red, #ff2d55);
    background: rgba(255, 45, 85, 0.08);
  }
  .rr-badge {
    font-size: 10px;
    font-weight: 700;
    color: #E8967D;
    padding: 4px 8px;
    border: 1px solid rgba(232, 150, 125, 0.2);
    border-radius: 6px;
  }
  .narration {
    flex: 1;
    font-size: 9px;
    color: rgba(240, 237, 228, 0.5);
    text-align: right;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* ── Result Overlay ── */
  .result-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: rgba(10, 9, 8, 0.88);
    z-index: 20;
    animation: fadeIn 0.4s ease;
  }
  .result-icon {
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 6px;
    font-family: var(--fb, 'Space Grotesk', sans-serif);
    color: #E8967D;
  }
  .result-pnl {
    font-size: 28px;
    font-weight: 900;
    color: var(--red, #ff2d55);
    font-variant-numeric: tabular-nums;
  }
  .result-pnl.positive {
    color: var(--grn, #00ff88);
  }
  .result-narration {
    font-size: 10px;
    color: rgba(240, 237, 228, 0.5);
    max-width: 300px;
    text-align: center;
  }
  .result-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }
  .result-actions button {
    padding: 8px 24px;
    border: 1px solid rgba(240, 237, 228, 0.2);
    border-radius: 6px;
    background: rgba(240, 237, 228, 0.04);
    color: #F0EDE4;
    font-family: var(--fm, 'JetBrains Mono', monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .result-actions button:hover {
    background: rgba(240, 237, 228, 0.1);
  }
  .btn-again {
    border-color: rgba(232, 150, 125, 0.4) !important;
    color: #E8967D !important;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
