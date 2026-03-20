<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Phase, Hypothesis } from '$lib/stores/gameState';
  import type { BattleTickState, BattlePriceTick } from '$lib/engine/battleResolver';

  export let phase: Phase = 'DRAFT';
  export let battleTick: BattleTickState | null = null;
  export let hypothesis: Hypothesis | null = null;
  export let prices: { BTC: number } = { BTC: 0 };
  export let battleResult: string | null = null;
  export let battlePriceHistory: BattlePriceTick[] = [];
  export let activeAgents: Array<{ id: string; name: string; icon: string; color: string; dir: string; conf: number }> = [];

  const dispatch = createEventDispatcher();

  $: isBattle = phase === 'BATTLE';
  $: isResult = phase === 'RESULT';
  $: currentPrice = battleTick?.currentPrice ?? prices.BTC;
  $: entryPrice = battleTick?.entryPrice ?? hypothesis?.entry ?? 0;
  $: pnl = battleTick?.pnlPercent ?? 0;
  $: pnlPositive = pnl >= 0;
  $: distToTP = battleTick?.distToTP ?? 0;
  $: distToSL = battleTick?.distToSL ?? 0;
  $: rr = hypothesis?.rr ?? 0;
  $: dir = hypothesis?.dir ?? 'NEUTRAL';
  $: tpPrice = hypothesis?.tp ?? 0;
  $: slPrice = hypothesis?.sl ?? 0;

  // Generate tick cards from price history (relative to previous tick)
  interface TickCard {
    id: number;
    pctChange: number;
    favorable: boolean;
    flipped: boolean;
    price: number;
  }

  $: tickCards = (() => {
    const cards: TickCard[] = [];
    const history = battlePriceHistory;
    // Sample every few ticks to keep max ~20 visible cards
    const step = Math.max(1, Math.floor(history.length / 20));
    for (let i = step; i < history.length; i += step) {
      const prev = history[i - step];
      const curr = history[i];
      const change = ((curr.price - prev.price) / prev.price) * 100;
      const favorable = dir === 'LONG' ? change > 0 : dir === 'SHORT' ? change < 0 : change > 0;
      cards.push({
        id: i,
        pctChange: change,
        favorable,
        flipped: true,
        price: curr.price,
      });
    }
    return cards.slice(-20);
  })();

  // Tally of green vs red
  $: greenCount = tickCards.filter(c => c.favorable).length;
  $: redCount = tickCards.filter(c => !c.favorable).length;

  // Market card pulsing during battle
  $: marketPulsing = isBattle && battlePriceHistory.length > 0;

  // Sparkline SVG from price history
  $: sparklinePath = (() => {
    if (battlePriceHistory.length < 2) return '';
    const pts = battlePriceHistory.slice(-80);
    const minP = Math.min(...pts.map(p => p.price));
    const maxP = Math.max(...pts.map(p => p.price));
    const range = maxP - minP || 1;
    const w = 300;
    const h = 40;
    return pts.map((p, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((p.price - minP) / range) * (h - 4) - 2;
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

  function fmtCardPct(v: number): string {
    const sign = v >= 0 ? '+' : '';
    return sign + v.toFixed(3) + '%';
  }
</script>

<div class="card-duel">
  <!-- Title Bar -->
  <div class="title-bar">
    <span class="title">CARD DUEL</span>
  </div>

  <!-- Agent Cards Row -->
  <div class="cards-row">
    <div class="team-cards">
      {#each activeAgents.slice(0, 3) as agent}
        <div class="agent-card" style="--card-color:{agent.color}">
          <div class="card-top">
            <span class="card-initial" style="color:{agent.color}">{agent.name.charAt(0)}</span>
          </div>
          <div class="card-body">
            <div class="card-dir" class:long={agent.dir === 'LONG'} class:short={agent.dir === 'SHORT'}>
              {#if agent.dir === 'LONG'}
                <span class="arrow">&#9650;</span>
              {:else if agent.dir === 'SHORT'}
                <span class="arrow">&#9660;</span>
              {:else}
                <span class="arrow">&#9644;</span>
              {/if}
            </div>
            <div class="card-conf">{agent.conf}%</div>
          </div>
          <div class="card-name">{agent.name}</div>
        </div>
      {/each}
    </div>

    <div class="vs-divider">VS</div>

    <div class="market-card" class:pulsing={marketPulsing}>
      <div class="card-top">
        <span class="card-initial market-initial">M</span>
      </div>
      <div class="card-body">
        {#if isBattle || isResult}
          <div class="market-price">${fmtPrice(currentPrice)}</div>
        {:else}
          <div class="market-mystery">?</div>
        {/if}
      </div>
      <div class="card-name">MARKET</div>
    </div>
  </div>

  <!-- Revealed Cards Area -->
  <div class="revealed-area">
    {#if isBattle || isResult}
      <div class="tally">
        <span class="tally-green">{greenCount} favorable</span>
        <span class="tally-sep">|</span>
        <span class="tally-red">{redCount} unfavorable</span>
      </div>

      <div class="tick-grid">
        {#each tickCards as card, i (card.id)}
          {@const isOld = i < tickCards.length - 12}
          <div
            class="tick-card"
            class:favorable={card.favorable}
            class:unfavorable={!card.favorable}
            class:old={isOld}
            class:flipped={card.flipped}
            style="animation-delay:{i * 0.05}s"
          >
            <div class="tick-card-inner">
              <div class="tick-front">
                <div class="tick-pct">{fmtCardPct(card.pctChange)}</div>
              </div>
              <div class="tick-back">
                <span class="tick-q">?</span>
              </div>
            </div>
          </div>
        {:else}
          <div class="no-ticks">Waiting for price ticks...</div>
        {/each}
      </div>

      <!-- Result state: all cards revealed -->
      {#if isResult && battleResult}
        <div class="result-banner">
          <div class="result-label" class:win={battleResult === 'tp' || battleResult === 'timeout_win'}>
            {battleResult === 'tp' ? 'TP HIT' : battleResult === 'sl' ? 'SL HIT' : battleResult === 'timeout_win' ? 'TIME WIN' : 'TIME LOSS'}
          </div>
          <div class="result-actions">
            <button on:click={() => dispatch('goLobby')}>LOBBY</button>
            <button class="btn-again" on:click={() => dispatch('playAgain')}>AGAIN</button>
          </div>
        </div>
      {/if}

    {:else}
      <div class="waiting-cards">
        <div class="placeholder-card">?</div>
        <div class="placeholder-card">?</div>
        <div class="placeholder-card">?</div>
        <div class="waiting-text">Cards will be revealed during battle</div>
      </div>
    {/if}
  </div>

  <!-- Status Bar -->
  <div class="status-bar">
    <div class="status-item">
      <span class="status-label">BET</span>
      <span class="status-value" class:long={dir === 'LONG'} class:short={dir === 'SHORT'}>{dir}</span>
    </div>
    <div class="status-item">
      <span class="status-label">TP</span>
      <span class="status-value">{fmtPrice(tpPrice)}</span>
    </div>
    <div class="status-item">
      <span class="status-label">SL</span>
      <span class="status-value">{fmtPrice(slPrice)}</span>
    </div>
    <div class="status-item">
      <span class="status-label">P&L</span>
      <span class="status-value" class:positive={pnlPositive} class:negative={!pnlPositive}>{fmtPnl(pnl)}</span>
    </div>
  </div>

  <!-- Mini Sparkline Chart -->
  <div class="mini-chart">
    {#if battlePriceHistory.length >= 2}
      <svg viewBox="0 0 300 40" preserveAspectRatio="none" class="spark-svg">
        <path d={sparklinePath} fill="none" stroke={pnlPositive ? 'var(--grn, #00ff88)' : 'var(--red, #ff2d55)'} stroke-width="1.5" />
      </svg>
    {:else}
      <div class="spark-empty">---</div>
    {/if}
  </div>
</div>

<style>
  .card-duel {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: #0c0b0a;
    color: #F0EDE4;
    font-family: var(--fm, 'JetBrains Mono', monospace);
    position: relative;
    overflow: hidden;
    perspective: 1000px;
  }

  /* ── Title Bar ── */
  .title-bar {
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(14, 13, 12, 0.95);
    border-bottom: 1px solid rgba(240, 237, 228, 0.06);
    flex-shrink: 0;
  }
  .title {
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 4px;
    color: #E8967D;
    font-family: var(--fb, 'Space Grotesk', sans-serif);
  }

  /* ── Cards Row ── */
  .cards-row {
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 8px 16px;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(240, 237, 228, 0.04);
  }
  .team-cards {
    display: flex;
    gap: 8px;
  }

  /* Agent card */
  .agent-card {
    width: 72px;
    height: 96px;
    border-radius: 10px;
    border: 2px solid var(--card-color, rgba(240, 237, 228, 0.15));
    background: rgba(20, 19, 18, 0.95);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 4px;
    gap: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s, box-shadow 0.2s;
    cursor: default;
  }
  .agent-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5), 0 0 12px color-mix(in srgb, var(--card-color) 20%, transparent);
  }
  .card-top {
    flex-shrink: 0;
  }
  .card-initial {
    font-size: 20px;
    font-weight: 900;
    font-family: var(--fb, 'Space Grotesk', sans-serif);
  }
  .card-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }
  .card-dir {
    font-size: 14px;
    line-height: 1;
  }
  .card-dir.long { color: var(--grn, #00ff88); }
  .card-dir.short { color: var(--red, #ff2d55); }
  .arrow { font-size: 14px; }
  .card-conf {
    font-size: 9px;
    font-weight: 800;
    color: rgba(240, 237, 228, 0.5);
    font-variant-numeric: tabular-nums;
  }
  .card-name {
    font-size: 6px;
    font-weight: 800;
    letter-spacing: 1.5px;
    color: rgba(240, 237, 228, 0.4);
    text-align: center;
  }

  /* VS Divider */
  .vs-divider {
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 2px;
    color: rgba(240, 237, 228, 0.2);
    font-family: var(--fb, 'Space Grotesk', sans-serif);
    padding: 0 8px;
  }

  /* Market card */
  .market-card {
    width: 72px;
    height: 96px;
    border-radius: 10px;
    border: 2px solid rgba(232, 150, 125, 0.3);
    background: rgba(20, 19, 18, 0.95);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 4px;
    gap: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .market-card.pulsing {
    animation: cardPulse 1.5s ease-in-out infinite;
  }
  .market-initial {
    color: #E8967D;
    font-size: 20px;
    font-weight: 900;
    font-family: var(--fb, 'Space Grotesk', sans-serif);
  }
  .market-price {
    font-size: 8px;
    font-weight: 700;
    color: #F0EDE4;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  .market-mystery {
    font-size: 24px;
    font-weight: 900;
    color: rgba(240, 237, 228, 0.15);
    font-family: var(--fb, 'Space Grotesk', sans-serif);
  }

  @keyframes cardPulse {
    0%, 100% { box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4); }
    50% { box-shadow: 0 4px 24px rgba(232, 150, 125, 0.2), 0 0 16px rgba(232, 150, 125, 0.1); }
  }

  /* ── Revealed Cards Area ── */
  .revealed-area {
    flex: 1;
    padding: 8px 16px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tally {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 9px;
    font-weight: 700;
  }
  .tally-green { color: var(--grn, #00ff88); }
  .tally-sep { color: rgba(240, 237, 228, 0.15); }
  .tally-red { color: var(--red, #ff2d55); }

  .tick-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-content: flex-start;
  }

  /* Tick Card with flip animation */
  .tick-card {
    width: 52px;
    height: 36px;
    perspective: 400px;
    animation: cardAppear 0.4s ease backwards;
  }
  .tick-card.old {
    transform: scale(0.85);
    opacity: 0.5;
  }
  .tick-card-inner {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.5s ease;
  }
  .tick-card.flipped .tick-card-inner {
    transform: rotateY(0deg);
  }
  .tick-card:not(.flipped) .tick-card-inner {
    transform: rotateY(180deg);
  }

  .tick-front, .tick-back {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
  .tick-front {
    border: 1px solid rgba(240, 237, 228, 0.1);
  }
  .tick-card.favorable .tick-front {
    background: rgba(0, 255, 136, 0.08);
    border-color: rgba(0, 255, 136, 0.2);
  }
  .tick-card.unfavorable .tick-front {
    background: rgba(255, 45, 85, 0.08);
    border-color: rgba(255, 45, 85, 0.2);
  }
  .tick-back {
    background: rgba(30, 28, 26, 0.95);
    border: 1px solid rgba(232, 150, 125, 0.15);
    transform: rotateY(180deg);
  }
  .tick-pct {
    font-size: 8px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .tick-card.favorable .tick-pct { color: var(--grn, #00ff88); }
  .tick-card.unfavorable .tick-pct { color: var(--red, #ff2d55); }
  .tick-q {
    font-size: 14px;
    font-weight: 900;
    color: rgba(232, 150, 125, 0.3);
  }

  @keyframes cardAppear {
    from { opacity: 0; transform: scale(0.5) rotateY(-90deg); }
    to { opacity: 1; transform: scale(1) rotateY(0deg); }
  }

  /* Waiting / placeholder cards */
  .waiting-cards {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex-wrap: wrap;
    opacity: 0.3;
  }
  .placeholder-card {
    width: 52px;
    height: 36px;
    border-radius: 6px;
    border: 1px dashed rgba(240, 237, 228, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 900;
    color: rgba(240, 237, 228, 0.15);
  }
  .waiting-text {
    width: 100%;
    text-align: center;
    font-size: 9px;
    color: rgba(240, 237, 228, 0.3);
    animation: blink 2s ease-in-out infinite;
  }
  .no-ticks {
    font-size: 9px;
    color: rgba(240, 237, 228, 0.2);
    padding: 12px 0;
  }

  /* Result banner */
  .result-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 12px;
    margin-top: auto;
    background: rgba(14, 13, 12, 0.9);
    border-radius: 8px;
    border: 1px solid rgba(240, 237, 228, 0.08);
  }
  .result-label {
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 3px;
    color: var(--red, #ff2d55);
    font-family: var(--fb, 'Space Grotesk', sans-serif);
  }
  .result-label.win {
    color: var(--grn, #00ff88);
  }
  .result-actions {
    display: flex;
    gap: 8px;
  }
  .result-actions button {
    padding: 6px 16px;
    border: 1px solid rgba(240, 237, 228, 0.15);
    border-radius: 6px;
    background: rgba(240, 237, 228, 0.04);
    color: #F0EDE4;
    font-family: var(--fm, 'JetBrains Mono', monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 2px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .result-actions button:hover {
    background: rgba(240, 237, 228, 0.08);
  }
  .result-actions .btn-again {
    border-color: rgba(232, 150, 125, 0.4);
    color: #E8967D;
  }

  /* ── Status Bar ── */
  .status-bar {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
    padding: 0 16px;
    background: rgba(14, 13, 12, 0.95);
    border-top: 1px solid rgba(240, 237, 228, 0.06);
    flex-shrink: 0;
  }
  .status-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .status-label {
    font-size: 7px;
    font-weight: 800;
    letter-spacing: 1.5px;
    color: rgba(240, 237, 228, 0.35);
  }
  .status-value {
    font-size: 10px;
    font-weight: 700;
    color: #F0EDE4;
    font-variant-numeric: tabular-nums;
  }
  .status-value.long { color: var(--grn, #00ff88); }
  .status-value.short { color: var(--red, #ff2d55); }
  .status-value.positive { color: var(--grn, #00ff88); }
  .status-value.negative { color: var(--red, #ff2d55); }

  /* ── Mini Chart ── */
  .mini-chart {
    height: 60px;
    padding: 4px 8px;
    background: rgba(14, 13, 12, 0.95);
    border-top: 1px solid rgba(240, 237, 228, 0.04);
    flex-shrink: 0;
  }
  .spark-svg {
    width: 100%;
    height: 100%;
  }
  .spark-empty {
    font-size: 9px;
    color: rgba(240, 237, 228, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  @keyframes blink {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.7; }
  }
</style>
