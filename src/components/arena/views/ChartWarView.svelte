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
  $: pnl = battleTick?.pnlPercent ?? 0;
  $: pnlPositive = pnl >= 0;
  $: distToTP = battleTick?.distToTP ?? 0;
  $: distToSL = battleTick?.distToSL ?? 0;
  $: rr = hypothesis?.rr ?? 0;
  $: dir = hypothesis?.dir ?? 'NEUTRAL';
  $: timeProgress = battleTick?.timeProgress ?? 0;

  $: tpGlow = distToTP > 80;
  $: slGlow = distToSL > 80;
  $: topBarClass = tpGlow ? 'top-bar glow-green' : slGlow ? 'top-bar glow-red' : 'top-bar';

  // Format price
  function fmtPrice(p: number): string {
    if (!p) return '---';
    return p.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function fmtPnl(v: number): string {
    const sign = v >= 0 ? '+' : '';
    return sign + v.toFixed(3) + '%';
  }

  // Timer display
  $: timerSec = battleTick ? Math.max(0, Math.ceil((battleTick.duration - battleTick.elapsed) / 1000)) : 0;
</script>

<div class="chart-war" class:battle={isBattle}>
  {#if isBattle || isResult}
    <!-- Top HUD Bar -->
    <div class={topBarClass}>
      <div class="tb-left">
        <span class="phase-tag">{phase}</span>
        <span class="sep">|</span>
        <span class="btc-price">${fmtPrice(currentPrice)}</span>
      </div>

      <div class="tb-center">
        <div class="dist-group">
          <span class="dist-label tp-label">TP</span>
          <div class="dist-bar">
            <div class="dist-fill tp-fill" style="width:{distToTP}%"></div>
          </div>
          <span class="dist-val">{distToTP.toFixed(0)}%</span>
        </div>
        <div class="dist-group">
          <span class="dist-label sl-label">SL</span>
          <div class="dist-bar">
            <div class="dist-fill sl-fill" style="width:{distToSL}%"></div>
          </div>
          <span class="dist-val">{distToSL.toFixed(0)}%</span>
        </div>
      </div>

      <div class="tb-right">
        <span class="timer">{timerSec}s</span>
      </div>
    </div>

    <!-- Chart Area Placeholder -->
    <div class="chart-area">
      <div class="chart-placeholder">
        <span class="chart-label">CHART AREA</span>
        <span class="chart-note">Parent positions ChartPanel here</span>
      </div>
    </div>

    <!-- Bottom HUD Bar -->
    <div class="bottom-bar">
      <div class="agent-row">
        {#each activeAgents.slice(0, 3) as agent}
          <div class="agent-card" style="--ac:{agent.color}">
            <span class="agent-icon">{agent.icon}</span>
            <span class="agent-dir" class:long={agent.dir === 'LONG'} class:short={agent.dir === 'SHORT'}>
              {agent.dir === 'LONG' ? 'L' : agent.dir === 'SHORT' ? 'S' : 'N'}
            </span>
            <div class="conf-mini">
              <div class="conf-mini-fill" style="width:{agent.conf}%;background:{agent.color}"></div>
            </div>
          </div>
        {/each}
      </div>

      <div class="pnl-block" class:positive={pnlPositive} class:negative={!pnlPositive} class:pulsing={isBattle}>
        <span class="pnl-value">{fmtPnl(pnl)}</span>
      </div>

      <div class="rr-badge">
        <span class="rr-label">R:R</span>
        <span class="rr-value">{rr.toFixed(1)}</span>
      </div>
    </div>

    <!-- Result Overlay -->
    {#if isResult && battleResult}
      <div class="result-overlay">
        <div class="result-tag" class:win={battleResult === 'tp' || battleResult === 'timeout_win'}>
          {battleResult === 'tp' ? 'TP HIT' : battleResult === 'sl' ? 'SL HIT' : battleResult === 'timeout_win' ? 'TIME WIN' : 'TIME LOSS'}
        </div>
        <div class="result-pnl" class:positive={pnlPositive}>{fmtPnl(pnl)}</div>
        <div class="result-actions">
          <button class="btn-lobby" on:click={() => dispatch('goLobby')}>LOBBY</button>
          <button class="btn-again" on:click={() => dispatch('playAgain')}>AGAIN</button>
        </div>
      </div>
    {/if}

  {:else}
    <!-- Non-battle waiting state -->
    <div class="waiting">
      <div class="waiting-phase">{phase}</div>
      <div class="waiting-msg">Waiting for battle...</div>
      <div class="waiting-price">${fmtPrice(prices.BTC)}</div>
    </div>
  {/if}
</div>

<style>
  .chart-war {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: #0A0908;
    color: #F0EDE4;
    font-family: var(--fm, 'JetBrains Mono', monospace);
    position: relative;
    overflow: hidden;
  }

  /* ── Top Bar ── */
  .top-bar {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    background: rgba(15, 14, 12, 0.95);
    border-bottom: 1px solid rgba(240, 237, 228, 0.08);
    flex-shrink: 0;
    z-index: 10;
    transition: box-shadow 0.3s, border-color 0.3s;
  }
  .top-bar.glow-green {
    border-bottom-color: var(--grn, #00ff88);
    box-shadow: 0 2px 20px rgba(0, 255, 136, 0.15);
  }
  .top-bar.glow-red {
    border-bottom-color: var(--red, #ff2d55);
    box-shadow: 0 2px 20px rgba(255, 45, 85, 0.15);
  }

  .tb-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .phase-tag {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 2px;
    color: #E8967D;
  }
  .sep {
    color: rgba(240, 237, 228, 0.15);
    font-size: 10px;
  }
  .btc-price {
    font-size: 13px;
    font-weight: 700;
    color: #F0EDE4;
    letter-spacing: 0.5px;
  }

  .tb-center {
    display: flex;
    gap: 16px;
    align-items: center;
  }
  .dist-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dist-label {
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 1px;
    width: 16px;
  }
  .tp-label { color: var(--grn, #00ff88); }
  .sl-label { color: var(--red, #ff2d55); }
  .dist-bar {
    width: 80px;
    height: 6px;
    background: rgba(240, 237, 228, 0.06);
    border-radius: 3px;
    overflow: hidden;
  }
  .dist-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  .tp-fill { background: var(--grn, #00ff88); }
  .sl-fill { background: var(--red, #ff2d55); }
  .dist-val {
    font-size: 8px;
    color: rgba(240, 237, 228, 0.5);
    width: 28px;
    text-align: right;
  }

  .tb-right {
    display: flex;
    align-items: center;
  }
  .timer {
    font-size: 12px;
    font-weight: 700;
    color: rgba(240, 237, 228, 0.6);
    font-variant-numeric: tabular-nums;
  }

  /* ── Chart Area ── */
  .chart-area {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .chart-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    opacity: 0.2;
  }
  .chart-label {
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 4px;
  }
  .chart-note {
    font-size: 9px;
    color: rgba(240, 237, 228, 0.4);
  }

  /* ── Bottom Bar ── */
  .bottom-bar {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    background: rgba(15, 14, 12, 0.95);
    border-top: 1px solid rgba(240, 237, 228, 0.08);
    flex-shrink: 0;
    z-index: 10;
  }

  .agent-row {
    display: flex;
    gap: 6px;
  }
  .agent-card {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: rgba(240, 237, 228, 0.04);
    border: 1px solid rgba(240, 237, 228, 0.08);
    border-radius: 6px;
  }
  .agent-icon {
    font-size: 12px;
  }
  .agent-dir {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1px;
  }
  .agent-dir.long { color: var(--grn, #00ff88); }
  .agent-dir.short { color: var(--red, #ff2d55); }
  .conf-mini {
    width: 24px;
    height: 3px;
    background: rgba(240, 237, 228, 0.08);
    border-radius: 2px;
    overflow: hidden;
  }
  .conf-mini-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s;
  }

  .pnl-block {
    padding: 4px 14px;
    border-radius: 6px;
    transition: color 0.2s;
  }
  .pnl-block.positive { color: var(--grn, #00ff88); }
  .pnl-block.negative { color: var(--red, #ff2d55); }
  .pnl-block.pulsing {
    animation: pnlPulse 1s ease-in-out infinite;
  }
  .pnl-value {
    font-size: 16px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  @keyframes pnlPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .rr-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: rgba(232, 150, 125, 0.08);
    border: 1px solid rgba(232, 150, 125, 0.2);
    border-radius: 6px;
  }
  .rr-label {
    font-size: 8px;
    font-weight: 700;
    color: rgba(240, 237, 228, 0.5);
    letter-spacing: 1px;
  }
  .rr-value {
    font-size: 12px;
    font-weight: 800;
    color: #E8967D;
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
    background: rgba(10, 9, 8, 0.85);
    z-index: 20;
    animation: fadeIn 0.3s ease;
  }
  .result-tag {
    font-size: 20px;
    font-weight: 900;
    letter-spacing: 4px;
    color: var(--red, #ff2d55);
    font-family: var(--fb, 'Space Grotesk', sans-serif);
  }
  .result-tag.win {
    color: var(--grn, #00ff88);
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
  .result-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }
  .result-actions button {
    padding: 8px 24px;
    border: 1px solid rgba(240, 237, 228, 0.2);
    border-radius: 6px;
    background: rgba(240, 237, 228, 0.05);
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
    border-color: rgba(240, 237, 228, 0.4);
  }
  .btn-again {
    border-color: rgba(232, 150, 125, 0.4) !important;
    color: #E8967D !important;
  }
  .btn-again:hover {
    background: rgba(232, 150, 125, 0.1) !important;
  }

  /* ── Waiting State ── */
  .waiting {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    opacity: 0.5;
  }
  .waiting-phase {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 3px;
    color: #E8967D;
  }
  .waiting-msg {
    font-size: 12px;
    color: rgba(240, 237, 228, 0.4);
    animation: blink 2s ease-in-out infinite;
  }
  .waiting-price {
    font-size: 16px;
    font-weight: 700;
    color: rgba(240, 237, 228, 0.3);
    font-variant-numeric: tabular-nums;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes blink {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }
</style>
