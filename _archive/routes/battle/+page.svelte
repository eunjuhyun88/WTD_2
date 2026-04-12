<script lang="ts">
  import {
    battleStore,
    battlePhase,
    currentPrice,
    revealedCandles,
    currentRoundDecision,
    progressPct,
    roundBarIndex,
    totalPnL,
    startBattle,
    revealNextBar,
    advanceRound,
    placeOrder,
    cancelOrder,
    resetBattle,
    nextBattle,
    endGameEarly,
    setSymbol,
    TOTAL_BARS,
    BARS_PER_ROUND,
    ROUND_TIMER_SECONDS,
    SELECTABLE_SYMBOLS,
    type OrderType,
    type OrderAction,
  } from '$lib/stores/battleStore';
  import { getTodayBattleCount } from '$lib/stores/matchHistoryStore';
  import BattleChart from '../../components/battle/BattleChart.svelte';
  import OrderPanel from '../../components/battle/OrderPanel.svelte';
  import PositionCard from '../../components/battle/PositionCard.svelte';
  import AIAdvisor from '../../components/battle/AIAdvisor.svelte';

  let bs = $derived($battleStore);
  let phase = $derived($battlePhase);
  let price = $derived($currentPrice);
  let revealed = $derived($revealedCandles);
  let roundDec = $derived($currentRoundDecision);
  let progress = $derived($progressPct);
  let barInRound = $derived($roundBarIndex);
  let pnl = $derived($totalPnL);

  let reflection = $state('');
  let simpleMode = $state(true); // Simple Mode by default (like ChartGame)

  const todayCount = $derived(bs.todayCount);
  const hasPosition = $derived(!!bs.position.type);
  const cash = $derived(100000 - (bs.position.type ? bs.position.shares * bs.position.costBasis : 0));
  const realizedPnl = $derived(bs.completedTrades.reduce((s, t) => s + t.gainDollar, 0));

  function handlePlaceOrder(order: { type: OrderType; action: OrderAction; price: number; shares: number; total: number; createdAt: number }): void {
    placeOrder({
      type: order.type,
      action: order.action,
      price: order.price,
      shares: order.shares,
      total: order.total,
      createdAt: bs.revealedBars,
    });
  }

  function handleCancel(orderId: string): void {
    cancelOrder(orderId);
  }

  function formatPrice(p: number): string {
    return p >= 1000
      ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : p.toFixed(2);
  }

  function formatPnl(v: number): string {
    const sign = v >= 0 ? '+' : '';
    return `${sign}$${formatPrice(Math.abs(v))}`;
  }

  function handleStartBattle(): void {
    startBattle();
  }

  function simpleLong(): void {
    const shares = Math.floor(cash / price) || 100;
    placeOrder({ type: 'market', action: 'buy', price, shares, total: shares * price, createdAt: bs.revealedBars });
  }

  function simpleShort(): void {
    const shares = Math.floor(cash / price) || 100;
    placeOrder({ type: 'market', action: 'sell', price, shares, total: shares * price, createdAt: bs.revealedBars });
  }

  function simple5xBuy(): void {
    const addShares = Math.floor(cash / price / 5) || 50;
    placeOrder({ type: 'market', action: 'buy', price, shares: addShares, total: addShares * price, createdAt: bs.revealedBars });
  }

  function simpleSell(): void {
    if (bs.position.type === 'long') {
      placeOrder({ type: 'market', action: 'sell', price, shares: bs.position.shares, total: bs.position.shares * price, createdAt: bs.revealedBars });
    } else if (bs.position.type === 'short') {
      placeOrder({ type: 'market', action: 'buy', price, shares: bs.position.shares, total: bs.position.shares * price, createdAt: bs.revealedBars });
    }
  }
</script>

<svelte:head>
  <title>Battle | CHATBATTLE</title>
</svelte:head>

<div class="battle-page">
  {#if phase === 'ready'}
    <!-- ─── Ready Screen ─── -->
    <div class="ready-screen">
      <div class="ready-card">
        <h1 class="ready-title">CHART BATTLE</h1>
        <p class="ready-sub">3 Rounds x 5 Bars = 15 Bars</p>
        <p class="ready-desc">Trade on real historical charts. Date revealed at End Game!</p>

        <!-- Symbol Selection -->
        <div class="ready-symbols">
          <div class="ready-symbols-label">Select Symbol</div>
          <div class="ready-symbol-btns">
            {#each SELECTABLE_SYMBOLS as sym}
              <button
                class="ready-symbol-btn"
                class:active={bs.selectedSymbol === sym}
                onclick={() => setSymbol(sym)}
              >
                {sym}
              </button>
            {/each}
          </div>
        </div>

        {#if bs.dailyLimitReached}
          <div class="ready-limit">
            Daily limit reached ({todayCount}/{bs.totalBattles})
          </div>
        {:else}
          <div class="ready-today">
            Today {todayCount}/{bs.totalBattles}
          </div>
          <button class="ready-start-btn" onclick={handleStartBattle}>
            START BATTLE
          </button>
        {/if}
      </div>
    </div>

  {:else if phase === 'loading'}
    <!-- ─── Loading Screen ─── -->
    <div class="ready-screen">
      <div class="ready-card">
        <h1 class="ready-title">CHART BATTLE</h1>
        <div class="loading-indicator">
          <div class="loading-spinner"></div>
          <span class="loading-text">Loading {bs.selectedSymbol} chart data...</span>
        </div>
      </div>
    </div>

  {:else if phase === 'playing' || phase === 'round_break'}
    <!-- ─── Main Battle Layout: 60/40 ─── -->
    <div class="battle-layout">
      <!-- Top Bar -->
      <div class="battle-topbar">
        <div class="topbar-left">
          <span class="topbar-round">R{bs.roundNumber} Bar {barInRound}/{BARS_PER_ROUND}</span>
          <span class="topbar-timer" class:urgent={bs.roundTimer <= 10}>
            {Math.floor(bs.roundTimer / 60)}:{String(bs.roundTimer % 60).padStart(2, '0')}
          </span>
        </div>
        <div class="topbar-center">
          <span class="topbar-price">${formatPrice(price)}</span>
        </div>
        <div class="topbar-right">
          <button class="topbar-end-btn" onclick={endGameEarly}>
            End Game
          </button>
        </div>
      </div>

      <!-- Main Content -->
      <div class="battle-content">
        <!-- Left 60% — Chart -->
        <div class="battle-left">
          <div class="chart-area">
            <BattleChart candles={bs.candles} revealedCount={bs.revealedBars} />
          </div>

          <!-- Next Bar + AI Trend -->
          <div class="left-bottom">
            <div class="left-bottom-row">
              {#if phase === 'round_break'}
                <div class="round-break-area">
                  <div class="round-break-msg">
                    Round {bs.roundNumber} complete
                  </div>
                  <button class="next-round-btn" onclick={advanceRound}>
                    Start Round {bs.roundNumber + 1}
                  </button>
                </div>
              {:else}
                <button
                  class="next-bar-btn"
                  onclick={revealNextBar}
                  disabled={barInRound >= BARS_PER_ROUND}
                >
                  Next Bar
                </button>
              {/if}
            </div>

            {#if roundDec}
              <AIAdvisor
                aiCall={roundDec.aiCall}
                aiConfTarget={roundDec.aiConfTarget}
                aiReason={roundDec.aiReason}
              />
            {/if}
          </div>
        </div>

        <!-- Right 40% — Order & Position -->
        <div class="battle-right">
          <div class="right-scroll">
            <!-- Mode Toggle -->
            <div class="mode-toggle">
              <button class="mode-btn" class:active={simpleMode} onclick={() => simpleMode = true}>Simple Mode</button>
              <button class="mode-btn" class:active={!simpleMode} onclick={() => simpleMode = false}>Advanced Mode</button>
            </div>

            <!-- Position Card -->
            <PositionCard
              position={bs.position}
              currentPrice={price}
              completedTrades={bs.completedTrades}
            />

            <div class="right-divider"></div>

            {#if simpleMode}
              <!-- Simple Mode: Next Bar + Long/Short or 5x Buy/Sell -->
              <div class="simple-orders">
                <div class="simple-orders-label">Orders</div>
                <div class="simple-btns">
                  {#if phase === 'round_break'}
                    <button class="simple-btn next-bar" onclick={advanceRound}>
                      Start Round {bs.roundNumber + 1}
                    </button>
                  {:else if !hasPosition}
                    <button class="simple-btn next-bar" onclick={revealNextBar} disabled={barInRound >= BARS_PER_ROUND}>
                      ▶ Next Bar
                    </button>
                    <button class="simple-btn long-btn" onclick={simpleLong}>Long</button>
                    <button class="simple-btn short-btn" onclick={simpleShort}>Short</button>
                  {:else}
                    <button class="simple-btn next-bar" onclick={revealNextBar} disabled={barInRound >= BARS_PER_ROUND}>
                      ▶ Next Bar
                    </button>
                    <button class="simple-btn buy5x-btn" onclick={simple5xBuy}>5x Buy</button>
                    <button class="simple-btn sell-btn" onclick={simpleSell}>Sell</button>
                  {/if}
                </div>
              </div>

              <!-- Trades + Indicators tabs -->
              <div class="simple-tabs">
                <div class="simple-tabs-header">
                  <span class="simple-tab active">Trades</span>
                  <span class="simple-tab">Indicators</span>
                </div>
                <div class="simple-trades">
                  <div class="trades-header">
                    <span>L/S</span><span>Enter $</span><span>Exit $</span><span>Shares</span><span>Gains ($)</span><span>Gains (%)</span>
                  </div>
                  {#each bs.completedTrades as trade}
                    <div class="trade-row">
                      <span class="trade-dir" class:long={trade.direction === 'long'} class:short={trade.direction === 'short'}>
                        {trade.direction === 'long' ? 'L' : 'S'}
                      </span>
                      <span>${trade.entryPrice.toFixed(2)}</span>
                      <span>${trade.exitPrice.toFixed(2)}</span>
                      <span>{trade.shares}</span>
                      <span class:positive={trade.gainDollar > 0} class:negative={trade.gainDollar < 0}>
                        ${trade.gainDollar.toFixed(2)}
                      </span>
                      <span class:positive={trade.gainPercent > 0} class:negative={trade.gainPercent < 0}>
                        {trade.gainPercent.toFixed(2)}%
                      </span>
                    </div>
                  {/each}
                </div>
              </div>

              <!-- Statistics -->
              <div class="statistics">
                <div class="statistics-label">Statistics</div>
                <div class="stat-row"><span>Cash</span><span>$ {(cash / 1000).toFixed(2)} k</span></div>
                <div class="stat-row"><span>Buying Power</span><span>$ {((cash * 5) / 1000).toFixed(2)} k</span></div>
                <div class="stat-row"><span>Realized P/L ($)</span>
                  <span class:positive={realizedPnl > 0} class:negative={realizedPnl < 0}>$ {realizedPnl.toFixed(2)}</span>
                </div>
                <div class="stat-row"><span>Unrealized P/L ($)</span>
                  <span class:positive={bs.position.unrealizedPL > 0} class:negative={bs.position.unrealizedPL < 0}>
                    $ {(bs.position.unrealizedPL || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            {:else}
              <!-- Advanced Mode: Full Order Panel -->
              <OrderPanel
                currentPrice={price}
                position={bs.position}
                pendingOrders={bs.pendingOrders}
                onPlaceOrder={handlePlaceOrder}
                onCancel={handleCancel}
              />
            {/if}
          </div>
        </div>
      </div>

      <!-- Bottom Status Bar -->
      <div class="battle-statusbar">
        <span class="status-pnl" class:positive={pnl > 0} class:negative={pnl < 0}>
          P/L: {formatPnl(pnl)}
        </span>
        <span class="status-sep">|</span>
        <span class="status-trades">Trades: {bs.completedTrades.length}</span>
        <span class="status-sep">|</span>
        <span class="status-round">R{bs.roundNumber}/3 Bar {barInRound}/{BARS_PER_ROUND}</span>
        <span class="status-sep">|</span>
        <span class="status-timer" class:urgent={bs.roundTimer <= 10}>
          {Math.floor(bs.roundTimer / 60)}:{String(bs.roundTimer % 60).padStart(2, '0')}
        </span>
      </div>
    </div>

  {:else if phase === 'result'}
    <!-- ─── End Game / Result Screen ─── -->
    <div class="result-screen">
      <div class="result-card">
        <!-- Symbol + Date Reveal -->
        <div class="result-reveal">
          <div class="result-symbol">{bs.era.symbol}</div>
          <div class="result-dates">
            {bs.era.startDate} &mdash; {bs.era.endDate}
          </div>
          <div class="result-tf">{bs.era.timeframe}</div>
        </div>

        <!-- Total P/L -->
        <div class="result-pnl" class:positive={bs.resultPnl > 0} class:negative={bs.resultPnl < 0}>
          {formatPnl(bs.resultPnl)}
        </div>
        <div class="result-verdict-label">
          {bs.resultWin ? 'PROFIT' : 'LOSS'}
        </div>

        <!-- Trades History -->
        {#if bs.completedTrades.length > 0}
          <div class="result-trades">
            <div class="result-trades-title">Trades</div>
            {#each bs.completedTrades as trade (trade.id)}
              <div class="result-trade-row">
                <span class="rt-dir" class:long={trade.direction === 'long'} class:short={trade.direction === 'short'}>
                  {trade.direction === 'long' ? 'L' : 'S'}
                </span>
                <span class="rt-entry">${formatPrice(trade.entryPrice)}</span>
                <span class="rt-arrow">&rarr;</span>
                <span class="rt-exit">${formatPrice(trade.exitPrice)}</span>
                <span
                  class="rt-gain"
                  class:positive={trade.gainDollar > 0}
                  class:negative={trade.gainDollar < 0}
                >
                  {trade.gainDollar >= 0 ? '+' : ''}${formatPrice(Math.abs(trade.gainDollar))}
                </span>
                <span
                  class="rt-pct"
                  class:positive={trade.gainPercent > 0}
                  class:negative={trade.gainPercent < 0}
                >
                  ({trade.gainPercent > 0 ? '+' : ''}{trade.gainPercent.toFixed(2)}%)
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="result-no-trades">No trades placed</div>
        {/if}

        {#if bs.memoryCard}
          <div class="result-memory">
            Memory: {bs.memoryCard}
          </div>
        {/if}

        <!-- Reflection -->
        <div class="result-reflection">
          <label class="reflection-label" for="reflection-input">Reflection (optional)</label>
          <textarea
            id="reflection-input"
            class="reflection-input"
            placeholder="What did you learn from this battle?"
            rows="2"
            bind:value={reflection}
          ></textarea>
        </div>

        <!-- Actions -->
        <div class="result-actions">
          <button class="result-btn result-btn-lab" onclick={() => window.location.href = '/lab'}>
            Lab
          </button>
          <button class="result-btn result-btn-next" onclick={nextBattle}>
            Play Another
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* ─── Page Container ─── */
  .battle-page {
    width: 100%;
    height: 100vh;
    background: var(--sc-bg-0, #050914);
    color: var(--sc-text-0, #f7f2ea);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ─── Ready Screen ─── */
  .ready-screen {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ready-card {
    text-align: center;
    padding: var(--sc-sp-8, 32px);
    background: var(--sc-bg-1, #0b1220);
    border: 1px solid var(--sc-line, rgba(219,154,159,0.28));
    border-radius: var(--sc-radius-xl, 12px);
    max-width: 440px;
    width: 90%;
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-3, 12px);
    align-items: center;
  }

  .ready-title {
    font-family: var(--sc-font-display, 'Bebas Neue', monospace);
    font-size: var(--sc-fs-4xl, 36px);
    color: var(--sc-accent, #db9a9f);
    margin: 0;
    letter-spacing: 3px;
  }

  .ready-sub {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
    color: var(--sc-text-1, rgba(247,242,234,0.84));
    margin: 0;
  }

  .ready-desc {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    color: var(--sc-text-2, rgba(247,242,234,0.68));
    margin: 0;
  }

  .ready-symbols {
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-2, 8px);
    width: 100%;
  }

  .ready-symbols-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    color: var(--sc-text-2, rgba(247,242,234,0.68));
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .ready-symbol-btns {
    display: flex;
    gap: var(--sc-sp-2, 8px);
    justify-content: center;
  }

  .ready-symbol-btn {
    flex: 1;
    padding: var(--sc-sp-2, 8px) var(--sc-sp-3, 12px);
    background: var(--sc-surface, #0f1828);
    border: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    border-radius: var(--sc-radius-md, 6px);
    color: var(--sc-text-1, rgba(247,242,234,0.84));
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--sc-duration-fast, 120ms) var(--sc-ease);
  }

  .ready-symbol-btn:hover {
    border-color: var(--sc-accent, #db9a9f);
    color: var(--sc-text-0, #f7f2ea);
  }

  .ready-symbol-btn.active {
    background: rgba(219, 154, 159, 0.15);
    border-color: var(--sc-accent, #db9a9f);
    color: var(--sc-accent, #db9a9f);
  }

  .ready-today {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    color: var(--sc-text-2, rgba(247,242,234,0.68));
  }

  .ready-limit {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
    color: var(--sc-bad, #cf7f8f);
    padding: var(--sc-sp-3, 12px);
  }

  .ready-start-btn {
    padding: var(--sc-sp-3, 12px) var(--sc-sp-8, 32px);
    background: var(--sc-accent, #db9a9f);
    color: #0b1220;
    border: none;
    border-radius: var(--sc-radius-md, 6px);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-base, 12px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    cursor: pointer;
    transition: all var(--sc-duration-fast, 120ms) var(--sc-ease);
  }

  .ready-start-btn:hover {
    opacity: 0.85;
    transform: translateY(-2px);
  }

  /* ─── Loading ─── */
  .loading-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sc-sp-3, 12px);
    padding: var(--sc-sp-4, 16px);
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    border-top-color: var(--sc-accent, #db9a9f);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-text {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
    color: var(--sc-text-2, rgba(247,242,234,0.68));
  }

  /* ─── Battle Layout ─── */
  .battle-layout {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .battle-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sc-sp-1_5, 6px) var(--sc-sp-3, 12px);
    background: var(--sc-bg-1, #0b1220);
    border-bottom: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
    min-height: 36px;
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: var(--sc-sp-3, 12px);
  }

  .topbar-round {
    color: var(--sc-text-1, rgba(247,242,234,0.84));
  }

  .topbar-timer {
    color: var(--sc-accent-3, #f2d193);
    font-weight: 700;
  }

  .topbar-timer.urgent {
    color: var(--sc-bad, #cf7f8f);
    animation: sc-pulse 0.5s infinite;
  }

  @keyframes sc-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .topbar-center {
    font-weight: 700;
    color: var(--sc-text-0, #f7f2ea);
    font-size: var(--sc-fs-md, 13px);
  }

  .topbar-price {
    color: var(--sc-text-0, #f7f2ea);
  }

  .topbar-right {
    display: flex;
    align-items: center;
  }

  .topbar-end-btn {
    padding: var(--sc-sp-1, 4px) var(--sc-sp-3, 12px);
    background: var(--sc-surface, #0f1828);
    border: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    border-radius: var(--sc-radius-sm, 4px);
    color: var(--sc-text-2, rgba(247,242,234,0.68));
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    cursor: pointer;
    transition: all var(--sc-duration-fast, 120ms) var(--sc-ease);
  }

  .topbar-end-btn:hover {
    border-color: var(--sc-bad, #cf7f8f);
    color: var(--sc-bad, #cf7f8f);
  }

  .battle-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* Left 60% */
  .battle-left {
    flex: 6;
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-right: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
  }

  .chart-area {
    flex: 1;
    min-height: 200px;
  }

  .left-bottom {
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-2, 8px);
    padding: var(--sc-sp-2, 8px) var(--sc-sp-3, 12px);
    border-top: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
  }

  .left-bottom-row {
    display: flex;
    align-items: center;
    gap: var(--sc-sp-3, 12px);
  }

  .round-break-area {
    display: flex;
    align-items: center;
    gap: var(--sc-sp-3, 12px);
    flex: 1;
  }

  .next-bar-btn,
  .next-round-btn {
    padding: var(--sc-sp-2, 8px) var(--sc-sp-4, 16px);
    border: none;
    border-radius: var(--sc-radius-md, 6px);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    cursor: pointer;
    transition: all var(--sc-duration-fast, 120ms) var(--sc-ease);
  }

  .next-bar-btn {
    flex: 1;
    background: var(--sc-accent, #db9a9f);
    color: #0b1220;
  }

  .next-bar-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .next-bar-btn:hover:not(:disabled) {
    opacity: 0.85;
  }

  .next-round-btn {
    flex: 1;
    background: var(--sc-accent-3, #f2d193);
    color: #0b1220;
  }

  .next-round-btn:hover {
    opacity: 0.85;
  }

  .round-break-msg {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    color: var(--sc-accent-3, #f2d193);
  }

  /* Right 40% */
  .battle-right {
    flex: 4;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .right-scroll {
    flex: 1;
    overflow-y: auto;
    padding: var(--sc-sp-3, 12px);
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-3, 12px);
  }

  .right-divider {
    height: 1px;
    background: var(--sc-line-soft, rgba(219,154,159,0.16));
  }

  /* ─── Bottom Status Bar ─── */
  .battle-statusbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sc-sp-3, 12px);
    padding: var(--sc-sp-1_5, 6px) var(--sc-sp-3, 12px);
    background: var(--sc-bg-1, #0b1220);
    border-top: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    min-height: 32px;
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
  }

  .status-pnl {
    font-weight: 700;
    color: var(--sc-text-0, #f7f2ea);
  }

  .status-pnl.positive { color: var(--sc-good, #adca7c); }
  .status-pnl.negative { color: var(--sc-bad, #cf7f8f); }

  .status-sep {
    color: var(--sc-text-3, rgba(247,242,234,0.52));
  }

  .status-trades,
  .status-round {
    color: var(--sc-text-1, rgba(247,242,234,0.84));
  }

  .status-timer {
    color: var(--sc-accent-3, #f2d193);
    font-weight: 700;
  }

  .status-timer.urgent {
    color: var(--sc-bad, #cf7f8f);
  }

  /* ─── Result Screen ─── */
  .result-screen {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--sc-sp-4, 16px);
    overflow-y: auto;
  }

  .result-card {
    text-align: center;
    padding: var(--sc-sp-6, 24px) var(--sc-sp-8, 32px);
    background: var(--sc-bg-1, #0b1220);
    border: 1px solid var(--sc-line, rgba(219,154,159,0.28));
    border-radius: var(--sc-radius-xl, 12px);
    max-width: 500px;
    width: 90%;
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-3, 12px);
    align-items: center;
  }

  .result-reveal {
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-1, 4px);
  }

  .result-symbol {
    font-family: var(--sc-font-display, 'Bebas Neue', monospace);
    font-size: var(--sc-fs-2xl, 24px);
    color: var(--sc-accent, #db9a9f);
    letter-spacing: 2px;
  }

  .result-dates {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
    color: var(--sc-text-1, rgba(247,242,234,0.84));
  }

  .result-tf {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    color: var(--sc-text-2, rgba(247,242,234,0.68));
    text-transform: uppercase;
  }

  .result-pnl {
    font-family: var(--sc-font-display, 'Bebas Neue', monospace);
    font-size: var(--sc-fs-4xl, 36px);
    color: var(--sc-text-0, #f7f2ea);
    letter-spacing: 1px;
  }

  .result-pnl.positive { color: var(--sc-good, #adca7c); }
  .result-pnl.negative { color: var(--sc-bad, #cf7f8f); }

  .result-verdict-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    color: var(--sc-text-2, rgba(247,242,234,0.68));
    text-transform: uppercase;
    letter-spacing: 2px;
  }

  .result-trades {
    text-align: left;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-1, 4px);
  }

  .result-trades-title {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    color: var(--sc-text-2, rgba(247,242,234,0.68));
    text-transform: uppercase;
    margin-bottom: var(--sc-sp-1, 4px);
  }

  .result-trade-row {
    display: flex;
    align-items: center;
    gap: var(--sc-sp-2, 8px);
    padding: var(--sc-sp-1, 4px) var(--sc-sp-2, 8px);
    background: var(--sc-surface, #0f1828);
    border-radius: var(--sc-radius-sm, 4px);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
  }

  .rt-dir { font-weight: 700; min-width: 14px; }
  .rt-dir.long { color: var(--sc-good, #adca7c); }
  .rt-dir.short { color: var(--sc-bad, #cf7f8f); }
  .rt-entry, .rt-exit { color: var(--sc-text-1, rgba(247,242,234,0.84)); }
  .rt-arrow { color: var(--sc-text-3, rgba(247,242,234,0.52)); }
  .rt-gain { margin-left: auto; font-weight: 600; }
  .rt-gain.positive { color: var(--sc-good, #adca7c); }
  .rt-gain.negative { color: var(--sc-bad, #cf7f8f); }
  .rt-pct { font-size: var(--sc-fs-2xs, 9px); }
  .rt-pct.positive { color: var(--sc-good, #adca7c); }
  .rt-pct.negative { color: var(--sc-bad, #cf7f8f); }

  .result-no-trades {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    color: var(--sc-text-3, rgba(247,242,234,0.52));
    padding: var(--sc-sp-3, 12px);
  }

  .result-memory {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
    color: var(--sc-accent-3, #f2d193);
    padding: var(--sc-sp-2, 8px);
    background: rgba(242, 209, 147, 0.08);
    border-radius: var(--sc-radius-sm, 4px);
  }

  .result-reflection {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--sc-sp-1, 4px);
  }

  .reflection-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-xs, 10px);
    color: var(--sc-text-2, rgba(247,242,234,0.68));
    text-transform: uppercase;
    text-align: left;
  }

  .reflection-input {
    width: 100%;
    padding: var(--sc-sp-2, 8px);
    background: var(--sc-surface, #0f1828);
    border: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    border-radius: var(--sc-radius-sm, 4px);
    color: var(--sc-text-0, #f7f2ea);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
    resize: none;
    outline: none;
    box-sizing: border-box;
  }

  .reflection-input:focus {
    border-color: var(--sc-accent, #db9a9f);
  }

  .result-actions {
    display: flex;
    gap: var(--sc-sp-3, 12px);
    width: 100%;
    margin-top: var(--sc-sp-2, 8px);
  }

  .result-btn {
    flex: 1;
    padding: var(--sc-sp-2, 8px) var(--sc-sp-4, 16px);
    border: none;
    border-radius: var(--sc-radius-md, 6px);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--sc-fs-sm, 11px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    cursor: pointer;
    transition: all var(--sc-duration-fast, 120ms) var(--sc-ease);
  }

  .result-btn-next {
    background: var(--sc-accent, #db9a9f);
    color: #0b1220;
  }

  .result-btn-lab {
    background: var(--sc-surface-2, #152033);
    color: var(--sc-text-0, #f7f2ea);
    border: 1px solid var(--sc-line, rgba(219,154,159,0.28));
  }

  .result-btn:hover {
    opacity: 0.85;
    transform: translateY(-1px);
  }

  /* ─── Responsive: Mobile stack ─── */
  @media (max-width: 768px) {
    .battle-content {
      flex-direction: column;
    }

    .battle-left {
      flex: none;
      border-right: none;
      border-bottom: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    }

    .chart-area {
      height: 40vh;
      min-height: 180px;
    }

    .battle-right {
      flex: 1;
    }

    .right-scroll {
      padding: var(--sc-sp-2, 8px);
    }

    .battle-statusbar {
      flex-wrap: wrap;
      gap: var(--sc-sp-2, 8px);
      font-size: var(--sc-fs-xs, 10px);
    }
  }

  /* ─── Mode Toggle ─── */
  .mode-toggle {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    padding: 0 var(--sc-sp-3, 12px);
  }
  .mode-btn {
    flex: 1;
    padding: 8px 0;
    background: none;
    border: none;
    color: var(--sc-text-2, #5a7d6e);
    font-size: var(--sc-fs-sm, 12px);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
  }
  .mode-btn.active {
    color: var(--sc-text-0, #e0f0e8);
    border-bottom-color: var(--sc-accent, #e8967d);
  }

  /* ─── Simple Mode ─── */
  .simple-orders {
    padding: var(--sc-sp-3, 12px);
  }
  .simple-orders-label {
    font-size: var(--sc-fs-sm, 12px);
    font-weight: 600;
    color: var(--sc-text-0, #e0f0e8);
    margin-bottom: 8px;
  }
  .simple-btns {
    display: flex;
    gap: 8px;
  }
  .simple-btn {
    flex: 1;
    padding: 10px 8px;
    border: none;
    border-radius: 4px;
    font-size: var(--sc-fs-sm, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s;
  }
  .simple-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .simple-btn.next-bar {
    background: #333;
    color: #fff;
  }
  .simple-btn.next-bar:hover:not(:disabled) {
    background: #444;
  }
  .simple-btn.long-btn, .simple-btn.buy5x-btn {
    background: #2563eb;
    color: #fff;
  }
  .simple-btn.long-btn:hover, .simple-btn.buy5x-btn:hover {
    background: #3b82f6;
  }
  .simple-btn.short-btn, .simple-btn.sell-btn {
    background: #5b6a78;
    color: #fff;
  }
  .simple-btn.short-btn:hover, .simple-btn.sell-btn:hover {
    background: #6b7a88;
  }

  /* ─── Simple Trades ─── */
  .simple-tabs {
    padding: 0 var(--sc-sp-3, 12px);
    margin-top: var(--sc-sp-2, 8px);
  }
  .simple-tabs-header {
    display: flex;
    gap: 16px;
    border-bottom: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
    margin-bottom: 8px;
  }
  .simple-tab {
    font-size: var(--sc-fs-sm, 12px);
    padding: 4px 0;
    color: var(--sc-text-2, #5a7d6e);
    cursor: pointer;
  }
  .simple-tab.active {
    color: var(--sc-accent, #e8967d);
    border-bottom: 1px solid var(--sc-accent, #e8967d);
  }
  .trades-header, .trade-row {
    display: grid;
    grid-template-columns: 30px 1fr 1fr 50px 1fr 1fr;
    gap: 4px;
    font-size: 10px;
    padding: 3px 0;
  }
  .trades-header {
    color: var(--sc-text-2, #5a7d6e);
    border-bottom: 1px solid var(--sc-line-soft, rgba(219,154,159,0.12));
    font-weight: 500;
  }
  .trade-row {
    color: var(--sc-text-1, #8ba59e);
  }
  .trade-dir.long { color: #22c55e; }
  .trade-dir.short { color: #ef4444; }

  /* ─── Statistics ─── */
  .statistics {
    padding: var(--sc-sp-3, 12px);
    margin-top: var(--sc-sp-2, 8px);
    border-top: 1px solid var(--sc-line-soft, rgba(219,154,159,0.16));
  }
  .statistics-label {
    font-size: var(--sc-fs-sm, 12px);
    font-weight: 600;
    color: var(--sc-text-0, #e0f0e8);
    margin-bottom: 8px;
  }
  .stat-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    padding: 3px 0;
    color: var(--sc-text-1, #8ba59e);
  }
  .stat-row span:first-child {
    font-weight: 500;
    color: var(--sc-text-0, #e0f0e8);
  }
  .positive { color: #22c55e !important; }
  .negative { color: #ef4444 !important; }
</style>
