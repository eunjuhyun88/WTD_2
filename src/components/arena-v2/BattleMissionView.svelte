<script lang="ts">
  /**
   * Mission Control View — "분석가 뷰"
   * Bloomberg terminal aesthetic, 3-column grid
   * Maximum data density, minimal character presence
   */
  import type { V2BattleState, AgentBattleState } from '$lib/engine/v2BattleTypes';

  export let battleState: V2BattleState | null = null;

  $: bs = battleState;
  $: tickN = bs?.tickN ?? 0;
  $: maxTicks = bs?.maxTicks ?? 24;
  $: currentPrice = bs?.currentPrice ?? 0;
  $: entryPrice = bs?.config.entryPrice ?? 0;
  $: tpPrice = bs?.config.tpPrice ?? 0;
  $: slPrice = bs?.config.slPrice ?? 0;
  $: direction = bs?.config.direction ?? 'LONG';
  $: vs = bs?.vsMeter.value ?? 50;
  $: combo = bs?.combo.count ?? 0;
  $: maxCombo = bs?.combo.maxCombo ?? 0;
  $: agentStates = bs ? Object.values(bs.agentStates) : [];
  $: log = bs?.log.slice(-10) ?? [];
  $: tickResults = bs?.tickResults.slice(-5) ?? [];

  $: pnl = entryPrice > 0
    ? (direction === 'LONG'
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100)
    : 0;

  $: tpDistPct = entryPrice > 0 ? ((Math.abs(tpPrice - entryPrice) / entryPrice) * 100) : 0;
  $: slDistPct = entryPrice > 0 ? ((Math.abs(slPrice - entryPrice) / entryPrice) * 100) : 0;
  $: tpProgress = tpDistPct > 0 ? Math.min(100, Math.max(0, (Math.max(0, pnl) / tpDistPct) * 100)) : 0;
  $: slProgress = slDistPct > 0 ? Math.min(100, Math.max(0, (Math.abs(Math.min(0, pnl)) / slDistPct) * 100)) : 0;

  // Latest 5 tick feed
  $: tickFeed = tickResults.map(tr => ({
    tick: tr.tickN,
    cls: tr.classifiedTick.tickClass,
    delta: tr.classifiedTick.deltaPct,
    vs: tr.vsAfter,
    combo: tr.comboAfter,
  }));

  function getTickColor(cls: string): string {
    if (cls.includes('FAVORABLE') && !cls.includes('UN')) return '#00ff88';
    if (cls.includes('UNFAVORABLE')) return '#ff2d55';
    return 'rgba(240,237,228,0.4)';
  }

  function getTickSymbol(cls: string): string {
    if (cls === 'STRONG_FAVORABLE') return '▲▲';
    if (cls === 'FAVORABLE') return '▲';
    if (cls === 'NEUTRAL') return '—';
    if (cls === 'UNFAVORABLE') return '▼';
    return '▼▼';
  }
</script>

<div class="mission-view">
  <!-- Header -->
  <div class="mission-header">
    <span class="mh-title">MISSION CONTROL</span>
    <span class="mh-tick">T{tickN}/{maxTicks}</span>
    <span class="mh-time">{new Date().toLocaleTimeString()}</span>
  </div>

  <!-- 3-Column Grid -->
  <div class="mission-grid">
    <!-- Col 1: Position -->
    <div class="mission-col">
      <div class="col-header">POSITION</div>

      <div class="data-row">
        <span class="data-label">DIR</span>
        <span class="data-value" class:positive={direction === 'LONG'} class:negative={direction === 'SHORT'}>{direction}</span>
      </div>
      <div class="data-row">
        <span class="data-label">ENTRY</span>
        <span class="data-value">${entryPrice.toLocaleString('en-US', { maximumFractionDigits: 1 })}</span>
      </div>
      <div class="data-row">
        <span class="data-label">CURRENT</span>
        <span class="data-value highlight">${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 1 })}</span>
      </div>
      <div class="data-row">
        <span class="data-label">PnL</span>
        <span class="data-value" class:positive={pnl >= 0} class:negative={pnl < 0}>
          {pnl >= 0 ? '+' : ''}{pnl.toFixed(4)}%
        </span>
      </div>

      <div class="divider" />

      <div class="data-row">
        <span class="data-label">TP</span>
        <span class="data-value tp">${tpPrice.toLocaleString('en-US', { maximumFractionDigits: 1 })}</span>
      </div>
      <div class="progress-row">
        <div class="progress-track">
          <div class="progress-fill tp" style:width="{tpProgress}%" />
        </div>
        <span class="progress-pct">{tpProgress.toFixed(0)}%</span>
      </div>

      <div class="data-row">
        <span class="data-label">SL</span>
        <span class="data-value sl">${slPrice.toLocaleString('en-US', { maximumFractionDigits: 1 })}</span>
      </div>
      <div class="progress-row">
        <div class="progress-track">
          <div class="progress-fill sl" style:width="{slProgress}%" />
        </div>
        <span class="progress-pct">{slProgress.toFixed(0)}%</span>
      </div>

      <div class="divider" />

      <div class="data-row">
        <span class="data-label">VS</span>
        <span class="data-value" class:positive={vs >= 55} class:negative={vs <= 45}>{vs.toFixed(1)}</span>
      </div>
      <div class="data-row">
        <span class="data-label">COMBO</span>
        <span class="data-value combo">{combo} <span class="dim">(max {maxCombo})</span></span>
      </div>
    </div>

    <!-- Col 2: Agents -->
    <div class="mission-col">
      <div class="col-header">AGENTS</div>

      {#each agentStates as agent (agent.agentId)}
        <div class="agent-block" class:exhausted={agent.isExhausted}>
          <div class="agent-header-row">
            <span class="agent-id" style:color={agent.role === 'OFFENSE' ? '#ff4444' : agent.role === 'DEFENSE' ? '#4488ff' : '#aa44ff'}>
              {agent.agentId}
            </span>
            <span class="agent-action-tag">{agent.currentAction}</span>
          </div>
          <div class="agent-data-grid">
            <div class="agent-stat">
              <span class="as-label">NRG</span>
              <div class="as-bar">
                <div class="as-fill" style:width="{(agent.energy / agent.maxEnergy) * 100}%"
                  class:low={agent.energy < 25} />
              </div>
              <span class="as-val">{Math.round(agent.energy)}</span>
            </div>
            <div class="agent-stat">
              <span class="as-label">DMG</span>
              <span class="as-val">{agent.totalDamageDealt.toFixed(1)}</span>
            </div>
            <div class="agent-stat">
              <span class="as-label">BLK</span>
              <span class="as-val">{agent.totalDamageBlocked.toFixed(1)}</span>
            </div>
            <div class="agent-stat">
              <span class="as-label">ACT</span>
              <span class="as-val">{agent.actionsPerformed}</span>
            </div>
            <div class="agent-stat">
              <span class="as-label">CRT</span>
              <span class="as-val crit">{agent.criticalHits}</span>
            </div>
          </div>
          {#if agent.findingValidated === true}
            <span class="finding-tag valid">VALIDATED</span>
          {:else if agent.findingValidated === false}
            <span class="finding-tag invalid">CHALLENGED</span>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Col 3: Market Pulse (Tick Feed + Log) -->
    <div class="mission-col">
      <div class="col-header">TICK FEED</div>

      <div class="tick-table">
        <div class="tick-header-row">
          <span>T</span><span>CLASS</span><span>Δ%</span><span>VS</span><span>CMB</span>
        </div>
        {#each tickFeed as t}
          <div class="tick-data-row">
            <span>{t.tick}</span>
            <span style:color={getTickColor(t.cls)}>{getTickSymbol(t.cls)}</span>
            <span style:color={getTickColor(t.cls)}>{t.delta >= 0 ? '+' : ''}{t.delta.toFixed(3)}</span>
            <span>{t.vs.toFixed(0)}</span>
            <span>{t.combo}</span>
          </div>
        {/each}
      </div>

      <div class="divider" />

      <div class="col-header">LOG</div>
      <div class="mission-log">
        {#each log as entry (entry.timestamp + entry.message)}
          <div class="mlog-entry" style:color={entry.color ?? 'rgba(240,237,228,0.5)'}>
            <span class="mlog-tick">T{entry.tickN}</span>
            {entry.icon ?? ''} {entry.message}
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .mission-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #080706;
    color: #F0EDE4;
    font-family: var(--fm, 'JetBrains Mono', monospace);
    font-size: 9px;
    overflow: hidden;
  }

  .mission-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    border-bottom: 1px solid rgba(240,237,228,0.08);
    background: rgba(240,237,228,0.02);
    flex-shrink: 0;
  }
  .mh-title {
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 3px;
    color: #00ff88;
  }
  .mh-tick {
    font-size: 10px;
    font-weight: 800;
    color: rgba(240,237,228,0.6);
  }
  .mh-time {
    font-size: 8px;
    color: rgba(240,237,228,0.25);
  }

  .mission-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0;
    min-height: 0;
    overflow: hidden;
  }
  .mission-col {
    padding: 8px 10px;
    border-right: 1px solid rgba(240,237,228,0.06);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .mission-col:last-child { border-right: none; }

  .col-header {
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 3px;
    color: rgba(240,237,228,0.25);
    margin-bottom: 4px;
  }
  .divider {
    height: 1px;
    background: rgba(240,237,228,0.06);
    margin: 4px 0;
  }

  .data-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 0;
  }
  .data-label {
    font-size: 8px;
    font-weight: 700;
    color: rgba(240,237,228,0.35);
    letter-spacing: 1px;
  }
  .data-value {
    font-size: 10px;
    font-weight: 800;
    color: rgba(240,237,228,0.7);
    font-variant-numeric: tabular-nums;
  }
  .data-value.highlight { color: #F0EDE4; }
  .data-value.tp { color: #00ff88; }
  .data-value.sl { color: #ff2d55; }
  .data-value.combo { color: #FFD700; }
  .positive { color: #00ff88 !important; }
  .negative { color: #ff2d55 !important; }
  .dim { font-size: 7px; color: rgba(240,237,228,0.25); }

  .progress-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .progress-track {
    flex: 1;
    height: 4px;
    background: rgba(240,237,228,0.06);
    border-radius: 2px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 400ms;
  }
  .progress-fill.tp { background: #00ff88; }
  .progress-fill.sl { background: #ff2d55; }
  .progress-pct {
    font-size: 8px;
    color: rgba(240,237,228,0.3);
    width: 24px;
    text-align: right;
  }

  /* Agents col */
  .agent-block {
    padding: 6px;
    border: 1px solid rgba(240,237,228,0.06);
    border-radius: 4px;
    background: rgba(240,237,228,0.01);
    margin-bottom: 4px;
  }
  .agent-block.exhausted {
    opacity: 0.4;
    border-color: rgba(255,45,85,0.15);
  }
  .agent-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .agent-id {
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 1px;
  }
  .agent-action-tag {
    font-size: 7px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 2px;
    background: rgba(240,237,228,0.04);
    color: rgba(240,237,228,0.5);
    letter-spacing: 1px;
  }
  .agent-data-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 3px;
  }
  .agent-stat {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .as-label {
    font-size: 6px;
    font-weight: 700;
    color: rgba(240,237,228,0.25);
    letter-spacing: 1px;
    width: 18px;
  }
  .as-bar {
    flex: 1;
    height: 3px;
    background: rgba(240,237,228,0.06);
    border-radius: 2px;
    overflow: hidden;
  }
  .as-fill {
    height: 100%;
    background: #00ff88;
    transition: width 300ms;
  }
  .as-fill.low { background: #ffaa00; }
  .as-val {
    font-size: 8px;
    font-weight: 700;
    color: rgba(240,237,228,0.5);
    min-width: 16px;
    text-align: right;
  }
  .as-val.crit { color: #FFD700; }
  .finding-tag {
    font-size: 6px;
    font-weight: 900;
    letter-spacing: 2px;
    margin-top: 3px;
    padding: 1px 4px;
    border-radius: 2px;
    display: inline-block;
  }
  .finding-tag.valid { background: rgba(0,255,136,0.15); color: #00ff88; }
  .finding-tag.invalid { background: rgba(255,45,85,0.15); color: #ff2d55; }

  /* Tick feed */
  .tick-table {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tick-header-row, .tick-data-row {
    display: grid;
    grid-template-columns: 20px 36px 48px 28px 28px;
    gap: 4px;
    font-size: 8px;
    align-items: center;
  }
  .tick-header-row {
    font-weight: 700;
    color: rgba(240,237,228,0.2);
    letter-spacing: 1px;
    border-bottom: 1px solid rgba(240,237,228,0.04);
    padding-bottom: 2px;
  }
  .tick-data-row {
    font-weight: 600;
    color: rgba(240,237,228,0.5);
    font-variant-numeric: tabular-nums;
  }

  /* Log */
  .mission-log {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    flex: 1;
  }
  .mlog-entry {
    font-size: 8px;
    font-weight: 600;
    line-height: 1.4;
  }
  .mlog-tick {
    font-weight: 800;
    color: rgba(240,237,228,0.25);
    margin-right: 4px;
  }
</style>
