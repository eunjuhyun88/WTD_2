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
  $: tpPrice = battleTick?.tpPrice ?? hypothesis?.tp ?? 0;
  $: slPrice = battleTick?.slPrice ?? hypothesis?.sl ?? 0;
  $: pnl = battleTick?.pnlPercent ?? 0;
  $: pnlPositive = pnl >= 0;
  $: pnlAbs = battleTick?.pnlAbsolute ?? 0;
  $: distToTP = battleTick?.distToTP ?? 0;
  $: distToSL = battleTick?.distToSL ?? 0;
  $: maxRunup = battleTick?.maxRunup ?? 0;
  $: maxDrawdown = battleTick?.maxDrawdown ?? 0;
  $: rr = hypothesis?.rr ?? 0;
  $: dir = hypothesis?.dir ?? 'NEUTRAL';
  $: elapsed = battleTick?.elapsed ?? 0;
  $: timeProgress = battleTick?.timeProgress ?? 0;

  // Amber glow threshold
  $: amberGlow = distToTP > 70 || distToSL > 70;

  // Duration formatted
  $: durationStr = (() => {
    const s = Math.floor(elapsed / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0');
  })();

  // Last 5 ticks for live feed
  $: liveFeed = (() => {
    const recent = battlePriceHistory.slice(-5).reverse();
    return recent.map((tick, i) => {
      const prev = battlePriceHistory[battlePriceHistory.length - 5 + (4 - i) - 1];
      const change = prev ? tick.price - prev.price : 0;
      const pct = prev ? ((change / prev.price) * 100) : 0;
      const time = new Date(tick.ts);
      const timeStr = time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return { price: tick.price, change, pct, timeStr };
    });
  })();

  function fmtPrice(p: number): string {
    if (!p) return '---';
    return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPnl(v: number): string {
    const sign = v >= 0 ? '+' : '';
    return sign + v.toFixed(3) + '%';
  }

  function fmtChange(v: number): string {
    const sign = v >= 0 ? '+' : '';
    return sign + v.toFixed(2);
  }

  function fmtPct(v: number): string {
    const sign = v >= 0 ? '+' : '';
    return sign + v.toFixed(4) + '%';
  }
</script>

<div class="mission-control" class:amber={amberGlow && isBattle}>
  {#if isBattle || isResult}
    <!-- 3-column grid -->
    <div class="mc-grid">

      <!-- Left Column -->
      <div class="col-left">
        <!-- POSITION Panel -->
        <div class="panel" class:panel-amber={amberGlow && isBattle}>
          <div class="panel-header">POSITION</div>
          <div class="panel-body">
            <div class="row">
              <span class="label">DIR</span>
              <span class="value" class:long={dir === 'LONG'} class:short={dir === 'SHORT'}>{dir}</span>
            </div>
            <div class="row">
              <span class="label">ENTRY</span>
              <span class="value">{fmtPrice(entryPrice)}</span>
            </div>
            <div class="row">
              <span class="label">CURRENT</span>
              <span class="value">{fmtPrice(currentPrice)}</span>
            </div>
            <div class="row">
              <span class="label">P&L</span>
              <span class="value" class:positive={pnlPositive} class:negative={!pnlPositive}>{fmtPnl(pnl)}</span>
            </div>
            <div class="row">
              <span class="label">DURATION</span>
              <span class="value">{durationStr}</span>
            </div>
          </div>
        </div>

        <!-- RISK Panel -->
        <div class="panel" class:panel-amber={amberGlow && isBattle}>
          <div class="panel-header">RISK</div>
          <div class="panel-body">
            <div class="row">
              <span class="label">RISK METER</span>
            </div>
            <div class="risk-meter-bar">
              <div class="risk-meter-fill" style="width:{Math.min(100, distToSL)}%"></div>
            </div>
            <div class="row">
              <span class="label">MAX DD</span>
              <span class="value negative">{maxDrawdown.toFixed(3)}%</span>
            </div>
            <div class="row">
              <span class="label">MAX RUN</span>
              <span class="value positive">{maxRunup.toFixed(3)}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Center Column -->
      <div class="col-center">
        <!-- Chart placeholder -->
        <div class="chart-placeholder">
          <span class="chart-label">CHART AREA</span>
          <span class="chart-note">Parent positions ChartPanel here</span>
        </div>

        <!-- Live Ticker Feed -->
        <div class="ticker-feed" class:panel-amber={amberGlow && isBattle}>
          <div class="panel-header">LIVE FEED</div>
          <div class="feed-rows">
            {#each liveFeed as tick}
              <div class="feed-row">
                <span class="feed-time">{tick.timeStr}</span>
                <span class="feed-price">{fmtPrice(tick.price)}</span>
                <span class="feed-change" class:positive={tick.change >= 0} class:negative={tick.change < 0}>
                  {fmtChange(tick.change)}
                </span>
                <span class="feed-pct" class:positive={tick.pct >= 0} class:negative={tick.pct < 0}>
                  {fmtPct(tick.pct)}
                </span>
              </div>
            {:else}
              <div class="feed-empty">Awaiting data...</div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Right Column -->
      <div class="col-right">
        <!-- TARGET Panel -->
        <div class="panel" class:panel-amber={amberGlow && isBattle}>
          <div class="panel-header">TARGET</div>
          <div class="panel-body">
            <div class="row">
              <span class="label">TP</span>
              <span class="value">{fmtPrice(tpPrice)}</span>
            </div>
            <div class="row">
              <span class="label">SL</span>
              <span class="value">{fmtPrice(slPrice)}</span>
            </div>
            <div class="row">
              <span class="label">R:R</span>
              <span class="value accent">{rr.toFixed(2)}</span>
            </div>
            <div class="dist-section">
              <div class="dist-row">
                <span class="dist-label">DIST TP</span>
                <div class="dist-bar">
                  <div class="dist-fill tp" style="width:{distToTP}%"></div>
                </div>
                <span class="dist-val">{distToTP.toFixed(0)}%</span>
              </div>
              <div class="dist-row">
                <span class="dist-label">DIST SL</span>
                <div class="dist-bar">
                  <div class="dist-fill sl" style="width:{distToSL}%"></div>
                </div>
                <span class="dist-val">{distToSL.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- AGENTS Panel -->
        <div class="panel" class:panel-amber={amberGlow && isBattle}>
          <div class="panel-header">AGENTS</div>
          <div class="panel-body">
            {#each activeAgents as agent}
              <div class="agent-row">
                <span class="agent-icon" style="color:{agent.color}">{agent.icon}</span>
                <span class="agent-name">{agent.name}</span>
                <span class="agent-dir" class:long={agent.dir === 'LONG'} class:short={agent.dir === 'SHORT'}>
                  {agent.dir}
                </span>
                <span class="agent-conf">{agent.conf}%</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <!-- Result Footer -->
    {#if isResult && battleResult}
      <div class="result-footer">
        <span class="result-tag" class:win={battleResult === 'tp' || battleResult === 'timeout_win'}>
          {battleResult === 'tp' ? 'TP HIT' : battleResult === 'sl' ? 'SL HIT' : battleResult === 'timeout_win' ? 'TIMEOUT WIN' : 'TIMEOUT LOSS'}
        </span>
        <span class="result-pnl" class:positive={pnlPositive} class:negative={!pnlPositive}>{fmtPnl(pnl)}</span>
        <button on:click={() => dispatch('goLobby')}>LOBBY</button>
        <button class="btn-again" on:click={() => dispatch('playAgain')}>AGAIN</button>
      </div>
    {/if}

  {:else}
    <!-- Non-battle state -->
    <div class="standby">
      <div class="standby-header">MISSION CONTROL</div>
      <div class="standby-phase">{phase}</div>
      <div class="standby-msg">System standby. Awaiting battle parameters.</div>
      <div class="standby-price">BTC ${fmtPrice(prices.BTC)}</div>
    </div>
  {/if}
</div>

<style>
  .mission-control {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: #1a1a2e;
    color: #F0EDE4;
    font-family: var(--fm, 'JetBrains Mono', monospace);
    position: relative;
    overflow: hidden;
  }

  /* ── 3-Column Grid ── */
  .mc-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 200px 1fr 200px;
    gap: 1px;
    background: rgba(240, 237, 228, 0.06);
    overflow: hidden;
  }
  .col-left, .col-center, .col-right {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: #1a1a2e;
  }

  /* ── Panel ── */
  .panel {
    background: rgba(26, 26, 46, 0.98);
    border: 1px solid rgba(240, 237, 228, 0.06);
    padding: 8px 10px;
    transition: border-color 0.4s, box-shadow 0.4s;
  }
  .panel-amber {
    border-color: rgba(255, 170, 50, 0.3);
    box-shadow: inset 0 0 12px rgba(255, 170, 50, 0.04);
  }
  .panel-header {
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 2.5px;
    color: rgba(240, 237, 228, 0.35);
    margin-bottom: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid rgba(240, 237, 228, 0.06);
  }
  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: rgba(240, 237, 228, 0.35);
  }
  .value {
    font-size: 10px;
    font-weight: 700;
    color: #F0EDE4;
    font-variant-numeric: tabular-nums;
    transition: color 0.2s;
  }
  .value.long { color: var(--grn, #00ff88); }
  .value.short { color: var(--red, #ff2d55); }
  .value.positive, .positive { color: var(--grn, #00ff88); }
  .value.negative, .negative { color: var(--red, #ff2d55); }
  .value.accent { color: #E8967D; }

  /* ── Risk Meter ── */
  .risk-meter-bar {
    width: 100%;
    height: 6px;
    background: rgba(240, 237, 228, 0.06);
    border-radius: 3px;
    overflow: hidden;
    margin: 4px 0;
  }
  .risk-meter-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--grn, #00ff88), #ffaa00, var(--red, #ff2d55));
    border-radius: 3px;
    transition: width 0.4s;
  }

  /* ── Chart Placeholder ── */
  .chart-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: rgba(26, 26, 46, 0.98);
    border: 1px solid rgba(240, 237, 228, 0.06);
    opacity: 0.3;
  }
  .chart-label {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 4px;
  }
  .chart-note {
    font-size: 8px;
    color: rgba(240, 237, 228, 0.4);
  }

  /* ── Ticker Feed ── */
  .ticker-feed {
    background: rgba(26, 26, 46, 0.98);
    border: 1px solid rgba(240, 237, 228, 0.06);
    padding: 6px 10px;
    max-height: 120px;
    overflow: hidden;
  }
  .feed-rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .feed-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
    border-bottom: 1px solid rgba(240, 237, 228, 0.03);
  }
  .feed-time {
    font-size: 8px;
    color: rgba(240, 237, 228, 0.3);
    width: 60px;
    font-variant-numeric: tabular-nums;
  }
  .feed-price {
    font-size: 9px;
    font-weight: 700;
    color: #F0EDE4;
    width: 80px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .feed-change {
    font-size: 8px;
    font-weight: 700;
    width: 55px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .feed-pct {
    font-size: 8px;
    font-weight: 700;
    width: 60px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .feed-empty {
    font-size: 9px;
    color: rgba(240, 237, 228, 0.2);
    padding: 8px 0;
  }

  /* ── Distance Bars ── */
  .dist-section {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .dist-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dist-label {
    font-size: 7px;
    font-weight: 800;
    letter-spacing: 1px;
    color: rgba(240, 237, 228, 0.35);
    width: 40px;
  }
  .dist-bar {
    flex: 1;
    height: 5px;
    background: rgba(240, 237, 228, 0.06);
    border-radius: 3px;
    overflow: hidden;
  }
  .dist-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s;
  }
  .dist-fill.tp { background: var(--grn, #00ff88); }
  .dist-fill.sl { background: var(--red, #ff2d55); }
  .dist-val {
    font-size: 8px;
    font-weight: 700;
    color: rgba(240, 237, 228, 0.5);
    width: 24px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* ── Agent Row ── */
  .agent-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0;
    border-bottom: 1px solid rgba(240, 237, 228, 0.04);
  }
  .agent-icon {
    font-size: 10px;
  }
  .agent-name {
    font-size: 8px;
    font-weight: 700;
    color: rgba(240, 237, 228, 0.6);
    flex: 1;
    letter-spacing: 0.5px;
  }
  .agent-dir {
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 1px;
  }
  .agent-dir.long { color: var(--grn, #00ff88); }
  .agent-dir.short { color: var(--red, #ff2d55); }
  .agent-conf {
    font-size: 8px;
    font-weight: 700;
    color: rgba(240, 237, 228, 0.4);
    font-variant-numeric: tabular-nums;
  }

  /* ── Result Footer ── */
  .result-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    height: 48px;
    background: rgba(20, 20, 36, 0.98);
    border-top: 1px solid rgba(240, 237, 228, 0.1);
    flex-shrink: 0;
    z-index: 10;
  }
  .result-tag {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 3px;
    color: var(--red, #ff2d55);
  }
  .result-tag.win {
    color: var(--grn, #00ff88);
  }
  .result-pnl {
    font-size: 16px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }
  .result-footer button {
    padding: 6px 16px;
    border: 1px solid rgba(240, 237, 228, 0.15);
    border-radius: 4px;
    background: rgba(240, 237, 228, 0.04);
    color: #F0EDE4;
    font-family: var(--fm, 'JetBrains Mono', monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 2px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .result-footer button:hover {
    background: rgba(240, 237, 228, 0.08);
  }
  .result-footer .btn-again {
    border-color: rgba(232, 150, 125, 0.4);
    color: #E8967D;
  }

  /* ── Standby State ── */
  .standby {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .standby-header {
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 4px;
    color: rgba(240, 237, 228, 0.2);
    font-family: var(--fb, 'Space Grotesk', sans-serif);
  }
  .standby-phase {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 3px;
    color: #E8967D;
  }
  .standby-msg {
    font-size: 9px;
    color: rgba(240, 237, 228, 0.3);
    animation: blinkStandby 2.5s ease-in-out infinite;
  }
  .standby-price {
    font-size: 13px;
    font-weight: 700;
    color: rgba(240, 237, 228, 0.25);
    font-variant-numeric: tabular-nums;
    margin-top: 4px;
  }

  @keyframes blinkStandby {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.7; }
  }
</style>
