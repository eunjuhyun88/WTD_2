<script lang="ts">
  /**
   * Chart War View — "트레이더 뷰"
   * 차트 90% 중심, 에이전트 액션이 차트 위에 오버레이
   * BTC price sparkline + TP/SL lines + agent action markers
   */
  import type { V2BattleState, TickResult, BattleLogEntry } from '$lib/engine/v2BattleTypes';
  import { AGDEFS } from '$lib/data/agents';

  export let battleState: V2BattleState | null = null;

  $: bs = battleState;
  $: tickN = bs?.tickN ?? 0;
  $: maxTicks = bs?.maxTicks ?? 24;
  $: currentPrice = bs?.currentPrice ?? 0;
  $: entryPrice = bs?.config.entryPrice ?? 0;
  $: tpPrice = bs?.config.tpPrice ?? 0;
  $: slPrice = bs?.config.slPrice ?? 0;
  $: direction = bs?.config.direction ?? 'LONG';
  $: priceHistory = bs?.priceHistory ?? [];
  $: vs = bs?.vsMeter.value ?? 50;
  $: combo = bs?.combo.count ?? 0;
  $: log = bs?.log.slice(-4) ?? [];
  $: agentStates = bs ? Object.values(bs.agentStates) : [];

  $: pnl = entryPrice > 0
    ? (direction === 'LONG'
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100)
    : 0;

  // ── Chart SVG calculations ──
  $: chartData = (() => {
    if (priceHistory.length < 2) return { path: '', priceMin: 0, priceMax: 0, candles: [] };

    const prices = priceHistory.map(p => p.price);
    const allPrices = [...prices, tpPrice, slPrice].filter(p => p > 0);
    const min = Math.min(...allPrices) * 0.9999;
    const max = Math.max(...allPrices) * 1.0001;
    const range = max - min || 1;

    const W = 800;
    const H = 300;
    const step = W / Math.max(maxTicks, priceHistory.length);

    const path = priceHistory.map((p, i) => {
      const x = i * step + step / 2;
      const y = H - ((p.price - min) / range) * H;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    // TP/SL/Entry Y positions
    const entryY = H - ((entryPrice - min) / range) * H;
    const tpY = H - ((tpPrice - min) / range) * H;
    const slY = H - ((slPrice - min) / range) * H;

    // Agent action markers on chart
    const markers = (bs?.tickResults ?? []).slice(-8).map(tr => {
      const x = tr.tickN * step + step / 2;
      const price = tr.classifiedTick.currentPrice;
      const y = H - ((price - min) / range) * H;
      const isFav = tr.classifiedTick.isFavorable;
      const actions = tr.agentActions.filter(a => a.action !== 'IDLE' && a.action !== 'RECOVER');
      return { x, y, isFav, actions, tickN: tr.tickN };
    });

    return { path, priceMin: min, priceMax: max, entryY, tpY, slY, W, H, step, markers };
  })();

  function getAgentIcon(agentId: string): string {
    const def = AGDEFS.find(a => a.id === agentId.toLowerCase());
    return def?.icon ?? '🐕';
  }
</script>

<div class="chart-view">
  <!-- Top HUD -->
  <div class="chart-hud-top">
    <div class="hud-price">
      <span class="hud-dir">{direction}</span>
      <span class="hud-val">${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
      <span class="hud-pnl" class:positive={pnl >= 0} class:negative={pnl < 0}>
        {pnl >= 0 ? '+' : ''}{pnl.toFixed(3)}%
      </span>
    </div>
    <div class="hud-stats">
      <span class="hud-stat">VS {vs.toFixed(0)}</span>
      {#if combo >= 2}
        <span class="hud-combo">🔥 {combo}x</span>
      {/if}
      <span class="hud-stat">T{tickN}/{maxTicks}</span>
    </div>
  </div>

  <!-- Main Chart -->
  <div class="chart-main">
    <svg class="chart-svg" viewBox="0 0 {chartData.W ?? 800} {chartData.H ?? 300}" preserveAspectRatio="none">
      <!-- Grid lines -->
      {#each [0.25, 0.5, 0.75] as frac}
        <line x1="0" y1="{(chartData.H ?? 300) * frac}" x2="{chartData.W ?? 800}" y2="{(chartData.H ?? 300) * frac}"
          stroke="rgba(240,237,228,0.04)" stroke-width="0.5" />
      {/each}

      <!-- TP line -->
      {#if chartData.tpY !== undefined}
        <line x1="0" y1={chartData.tpY} x2={chartData.W} y2={chartData.tpY}
          stroke="#00ff88" stroke-width="1" stroke-dasharray="6,4" opacity="0.5" />
        <text x="4" y={chartData.tpY - 4} fill="#00ff88" font-size="9" opacity="0.6">TP</text>
      {/if}

      <!-- SL line -->
      {#if chartData.slY !== undefined}
        <line x1="0" y1={chartData.slY} x2={chartData.W} y2={chartData.slY}
          stroke="#ff2d55" stroke-width="1" stroke-dasharray="6,4" opacity="0.5" />
        <text x="4" y={chartData.slY - 4} fill="#ff2d55" font-size="9" opacity="0.6">SL</text>
      {/if}

      <!-- Entry line -->
      {#if chartData.entryY !== undefined}
        <line x1="0" y1={chartData.entryY} x2={chartData.W} y2={chartData.entryY}
          stroke="rgba(240,237,228,0.2)" stroke-width="0.5" stroke-dasharray="3,3" />
      {/if}

      <!-- Price line -->
      {#if chartData.path}
        <path d={chartData.path} fill="none" stroke={pnl >= 0 ? '#00ff88' : '#ff2d55'} stroke-width="2" />
      {/if}

      <!-- Agent action markers -->
      {#each chartData.markers ?? [] as marker}
        <circle cx={marker.x} cy={marker.y} r="4"
          fill={marker.isFav ? 'rgba(0,255,136,0.3)' : 'rgba(255,45,85,0.3)'}
          stroke={marker.isFav ? '#00ff88' : '#ff2d55'} stroke-width="1" />
      {/each}
    </svg>
  </div>

  <!-- Bottom HUD: Agent status bar -->
  <div class="chart-hud-bottom">
    {#each agentStates as agent (agent.agentId)}
      <div class="agent-chip" class:chip-attacking={agent.animState === 'CAST'} class:chip-shielding={agent.currentAction === 'SHIELD'}>
        <span class="chip-icon">{getAgentIcon(agent.agentId)}</span>
        <span class="chip-action">{agent.currentAction}</span>
        <div class="chip-energy">
          <div class="chip-energy-fill" style:width="{(agent.energy / agent.maxEnergy) * 100}%" />
        </div>
      </div>
    {/each}
  </div>

  <!-- Mini battle log -->
  <div class="chart-log">
    {#each log as entry (entry.timestamp + entry.message)}
      <span class="chart-log-entry" style:color={entry.color ?? '#F0EDE4'}>
        {entry.icon ?? ''} {entry.message}
      </span>
    {/each}
  </div>
</div>

<style>
  .chart-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #0A0908;
    overflow: hidden;
  }

  .chart-hud-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    border-bottom: 1px solid rgba(240,237,228,0.06);
    flex-shrink: 0;
  }
  .hud-price {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .hud-dir {
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 2px;
    color: rgba(240,237,228,0.4);
  }
  .hud-val {
    font-size: 18px;
    font-weight: 900;
    color: #F0EDE4;
    font-variant-numeric: tabular-nums;
  }
  .hud-pnl {
    font-size: 14px;
    font-weight: 800;
  }
  .hud-pnl.positive { color: #00ff88; }
  .hud-pnl.negative { color: #ff2d55; }

  .hud-stats {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .hud-stat {
    font-size: 10px;
    font-weight: 700;
    color: rgba(240,237,228,0.4);
    font-family: var(--fm, 'JetBrains Mono', monospace);
  }
  .hud-combo {
    font-size: 11px;
    font-weight: 900;
    color: #FFD700;
  }

  .chart-main {
    flex: 1;
    padding: 8px;
    min-height: 0;
  }
  .chart-svg {
    width: 100%;
    height: 100%;
  }

  .chart-hud-bottom {
    display: flex;
    gap: 8px;
    padding: 6px 16px;
    border-top: 1px solid rgba(240,237,228,0.06);
    flex-shrink: 0;
    justify-content: center;
  }
  .agent-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 1px solid rgba(240,237,228,0.08);
    border-radius: 6px;
    background: rgba(240,237,228,0.02);
    transition: all 200ms;
  }
  .agent-chip.chip-attacking {
    border-color: rgba(0,255,136,0.3);
    background: rgba(0,255,136,0.04);
  }
  .agent-chip.chip-shielding {
    border-color: rgba(68,136,255,0.3);
    background: rgba(68,136,255,0.04);
  }
  .chip-icon { font-size: 12px; }
  .chip-action {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 1px;
    color: rgba(240,237,228,0.5);
  }
  .chip-energy {
    width: 24px;
    height: 3px;
    background: rgba(240,237,228,0.06);
    border-radius: 2px;
    overflow: hidden;
  }
  .chip-energy-fill {
    height: 100%;
    background: #00ff88;
    transition: width 300ms;
  }

  .chart-log {
    display: flex;
    gap: 12px;
    padding: 4px 16px;
    overflow-x: auto;
    flex-shrink: 0;
    border-top: 1px solid rgba(240,237,228,0.04);
  }
  .chart-log-entry {
    font-size: 8px;
    font-weight: 600;
    white-space: nowrap;
    opacity: 0.7;
  }
</style>
