<script lang="ts">
  import type { AgentId } from '$lib/engine/types';
  import { AGDEFS } from '$lib/data/agents';
  import {
    v2SelectAgent,
    v2DeselectAgent,
    v2SetWeight,
    v2SetSquadConfig,
    v2SetPhase,
    type V2SquadConfig,
    type V2Tier,
  } from '$lib/stores/arenaV2State';
  import { getSynergyPreview } from '$lib/engine/teamSynergy';

  export let selectedAgents: AgentId[] = [];
  export let weights: Record<string, number> = {};
  export let squadConfig: V2SquadConfig = { riskLevel: 'mid', timeframe: '5m', leverage: 1, tier: 'BRONZE' };

  const TIER_INFO: Record<V2Tier, { icon: string; desc: string }> = {
    BRONZE:  { icon: '🥉', desc: 'VS 55 · 24 ticks' },
    SILVER:  { icon: '🥈', desc: 'VS 50 · 24 ticks' },
    GOLD:    { icon: '🥇', desc: 'VS 50 · 20 ticks · AI +5%' },
    DIAMOND: { icon: '💎', desc: 'VS 45 · 20 ticks · AI +10%' },
    MASTER:  { icon: '👑', desc: 'VS 45 · 16 ticks · AI +15%' },
  };

  const agents = AGDEFS;
  const ROLE_COLORS: Record<string, string> = { OFFENSE: '#ff4466', DEFENSE: '#4488ff', CONTEXT: '#aa66ff' };
  const ROLE_LABELS: Record<string, string> = { OFFENSE: 'ATK', DEFENSE: 'DEF', CONTEXT: 'CTX' };

  $: isReady = selectedAgents.length === 3;
  $: synergies = getSynergyPreview(selectedAgents as AgentId[]);
  $: activeSynergies = synergies.filter(s => s.isActive);

  let hoveredAgent: string | null = null;

  function handleSelect(agentId: string) {
    if (selectedAgents.includes(agentId as AgentId)) {
      v2DeselectAgent(agentId as AgentId);
    } else {
      v2SelectAgent(agentId as AgentId);
    }
  }

  function handleWeightChange(agentId: string, e: Event) {
    const target = e.target as HTMLInputElement;
    v2SetWeight(agentId, parseInt(target.value));
  }

  function handleLockIn() {
    if (!isReady) return;
    v2SetPhase('ANALYSIS', 'SCOUT');
  }

  function getRole(agent: typeof agents[0]): string {
    const map: Record<string, string> = {
      'Chart Structure': 'OFFENSE', 'Volume Profile': 'OFFENSE', 'Smart Money': 'OFFENSE',
      'Derivatives': 'DEFENSE', 'On-Chain Value': 'DEFENSE', 'Capital Flow': 'DEFENSE',
      'Sentiment': 'CONTEXT', 'Macro Events': 'CONTEXT',
    };
    return map[agent.role] || 'CONTEXT';
  }
</script>

<div class="draft">
  <!-- Left: Squad Slots + Config -->
  <div class="draft-left">
    <div class="section-title">YOUR SQUAD</div>
    <div class="slots">
      {#each [0, 1, 2] as idx}
        {@const agentId = selectedAgents[idx]}
        {@const agent = agentId ? agents.find(a => a.id === agentId) : null}
        <div class="slot" class:filled={!!agent}>
          {#if agent}
            <div class="slot-agent">
              <img src={agent.img.def} alt={agent.name} class="slot-img" />
              <div class="slot-info">
                <span class="slot-name">{agent.name}</span>
                <span class="slot-role" style="color:{ROLE_COLORS[getRole(agent)]}">{ROLE_LABELS[getRole(agent)]}</span>
              </div>
              <button class="slot-remove" on:click={() => v2DeselectAgent(agentId)}>✕</button>
            </div>
          {:else}
            <div class="slot-empty">
              <span class="slot-hex">⬡</span>
              <span class="slot-label">SLOT {idx + 1}</span>
            </div>
          {/if}
        </div>
      {/each}
    </div>

    {#if isReady}
      <div class="section-title" style="margin-top:12px">WEIGHT DISTRIBUTION</div>
      {#each selectedAgents as agentId}
        {@const agent = agents.find(a => a.id === agentId)}
        <div class="weight-row">
          <span class="weight-name">{agent?.icon ?? '?'} {agentId}</span>
          <input type="range" min="10" max="80" value={weights[agentId] ?? 33}
            on:input={(e) => handleWeightChange(agentId, e)} class="weight-slider" />
          <span class="weight-val">{weights[agentId] ?? 33}%</span>
        </div>
      {/each}

      <div class="section-title" style="margin-top:12px">SQUAD CONFIG</div>
      <div class="spec-row">
        <span class="spec-label">RISK</span>
        <div class="spec-btns">
          {#each ['low', 'mid', 'aggro'] as risk}
            <button class="spec-btn" class:active={squadConfig.riskLevel === risk}
              on:click={() => v2SetSquadConfig({ riskLevel: risk as V2SquadConfig['riskLevel'] })}>{risk.toUpperCase()}</button>
          {/each}
        </div>
      </div>
      <div class="spec-row">
        <span class="spec-label">TF</span>
        <div class="spec-btns">
          {#each ['1m', '5m', '15m', '1h'] as tf}
            <button class="spec-btn" class:active={squadConfig.timeframe === tf}
              on:click={() => v2SetSquadConfig({ timeframe: tf })}>{tf}</button>
          {/each}
        </div>
      </div>
      <div class="spec-row">
        <span class="spec-label">LEV</span>
        <div class="spec-btns">
          {#each [1, 2, 5, 10] as lev}
            <button class="spec-btn" class:active={squadConfig.leverage === lev}
              on:click={() => v2SetSquadConfig({ leverage: lev })}>{lev}x</button>
          {/each}
        </div>
      </div>
      <div class="spec-row tier-row">
        <span class="spec-label">TIER</span>
        <div class="spec-btns tier-btns">
          {#each (['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'MASTER'] as V2Tier[]) as tier}
            <button class="spec-btn tier-btn" class:active={squadConfig.tier === tier}
              on:click={() => v2SetSquadConfig({ tier })}
              title={TIER_INFO[tier].desc}>
              {TIER_INFO[tier].icon}
            </button>
          {/each}
        </div>
      </div>
      {#if squadConfig.tier}
        <div class="tier-desc">{TIER_INFO[squadConfig.tier].desc}</div>
      {/if}

      {#if activeSynergies.length > 0}
        <div class="synergy-banner">
          {#each activeSynergies as s}
            <span class="synergy-item">{s.synergy.icon} {s.synergy.name}</span>
          {/each}
        </div>
      {/if}

      <button class="btn-lock" on:click={handleLockIn}>⚡ LOCK IN ⚡</button>
    {/if}
  </div>

  <!-- Right: Agent Roster Grid -->
  <div class="draft-right">
    <div class="section-title">AGENT ROSTER</div>
    <div class="roster-grid">
      {#each agents as agent}
        {@const role = getRole(agent)}
        {@const isSelected = selectedAgents.includes(agent.id as AgentId)}
        {@const isDisabled = selectedAgents.length >= 3 && !isSelected}
        <button class="agent-card" class:selected={isSelected} class:disabled={isDisabled}
          on:click={() => handleSelect(agent.id)}
          on:mouseenter={() => hoveredAgent = agent.id}
          on:mouseleave={() => hoveredAgent = null}>

          <div class="ac-header">
            <span class="ac-role" style="background:{ROLE_COLORS[role]}">{ROLE_LABELS[role]}</span>
            {#if isSelected}<span class="ac-check">✓</span>{/if}
          </div>

          <img src={agent.img.def} alt={agent.name} class="ac-img" />
          <div class="ac-name">{agent.icon} {agent.name}</div>

          <div class="ac-stats">
            {#each [
              { label: 'ANL', val: agent.abilities.analysis, color: '#ff4466' },
              { label: 'ACC', val: agent.abilities.accuracy, color: '#4488ff' },
              { label: 'SPD', val: agent.abilities.speed, color: '#00ff88' },
              { label: 'INT', val: agent.abilities.instinct, color: '#ffaa00' },
            ] as stat}
              <div class="stat-bar">
                <span class="stat-lbl">{stat.label}</span>
                <div class="stat-track"><div class="stat-fill" style="width:{stat.val}%;background:{stat.color}"></div></div>
                <span class="stat-val">{stat.val}</span>
              </div>
            {/each}
          </div>

          {#if hoveredAgent === agent.id}
            <div class="ac-tooltip">"{agent.speech.scout}"</div>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .draft { flex:1; display:flex; background:#0A0908; overflow:hidden; }
  .draft-left {
    width:320px; min-width:280px; display:flex; flex-direction:column; gap:8px;
    padding:20px; background:rgba(15,14,12,.95); border-right:1px solid rgba(240,237,228,.06);
    overflow-y:auto;
  }
  .section-title { font-size:9px; font-weight:800; letter-spacing:2px; color:rgba(240,237,228,.4); font-family:var(--fm,'JetBrains Mono',monospace); margin-bottom:4px; }
  .slots { display:flex; flex-direction:column; gap:6px; }
  .slot { height:60px; border-radius:10px; border:1px dashed rgba(240,237,228,.1); display:flex; align-items:center; transition:all .2s; }
  .slot.filled { border-style:solid; border-color:rgba(232,150,125,.3); background:rgba(232,150,125,.05); }
  .slot-agent { display:flex; align-items:center; gap:10px; width:100%; padding:0 12px; }
  .slot-img { width:38px; height:38px; border-radius:8px; object-fit:cover; background:rgba(240,237,228,.05); }
  .slot-info { flex:1; display:flex; flex-direction:column; gap:2px; }
  .slot-name { font-size:11px; font-weight:700; color:#F0EDE4; font-family:var(--fm,'JetBrains Mono',monospace); }
  .slot-role { font-size:8px; font-weight:800; letter-spacing:1px; }
  .slot-remove { width:22px; height:22px; border-radius:5px; border:1px solid rgba(240,237,228,.1); background:rgba(240,237,228,.03); color:rgba(240,237,228,.4); font-size:9px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; }
  .slot-remove:hover { background:rgba(255,68,102,.15); color:#ff4466; }
  .slot-empty { display:flex; align-items:center; gap:8px; padding:0 16px; opacity:.3; }
  .slot-hex { font-size:18px; color:rgba(240,237,228,.3); }
  .slot-label { font-size:9px; letter-spacing:2px; color:rgba(240,237,228,.3); font-family:var(--fm,'JetBrains Mono',monospace); }

  .weight-row { display:flex; align-items:center; gap:6px; }
  .weight-name { font-size:9px; font-weight:700; color:rgba(240,237,228,.7); width:80px; font-family:var(--fm,'JetBrains Mono',monospace); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .weight-slider { flex:1; -webkit-appearance:none; height:4px; border-radius:2px; background:rgba(240,237,228,.1); outline:none; }
  .weight-slider::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:#E8967D; cursor:pointer; }
  .weight-val { font-size:11px; font-weight:800; color:#E8967D; width:32px; text-align:right; font-family:var(--fm,'JetBrains Mono',monospace); }

  .spec-row { display:flex; align-items:center; gap:6px; margin-bottom:4px; }
  .spec-label { font-size:8px; font-weight:700; letter-spacing:1px; color:rgba(240,237,228,.4); width:36px; font-family:var(--fm,'JetBrains Mono',monospace); }
  .spec-btns { display:flex; gap:3px; }
  .spec-btn { padding:3px 8px; border:1px solid rgba(240,237,228,.1); border-radius:4px; background:rgba(240,237,228,.03); color:rgba(240,237,228,.5); font-size:8px; font-weight:700; font-family:var(--fm,'JetBrains Mono',monospace); cursor:pointer; transition:all .15s; }
  .spec-btn:hover { background:rgba(232,150,125,.08); border-color:rgba(232,150,125,.2); }
  .spec-btn.active { background:rgba(232,150,125,.12); border-color:#E8967D; color:#E8967D; }

  .tier-btns { gap:2px !important; }
  .tier-btn { font-size:14px !important; padding:3px 6px !important; }
  .tier-desc { font-size:8px; color:rgba(240,237,228,.4); font-family:var(--fm,'JetBrains Mono',monospace); letter-spacing:0.5px; margin-top:-2px; margin-left:42px; }

  .synergy-banner { padding:8px 12px; background:rgba(0,255,136,.06); border:1px solid rgba(0,255,136,.2); border-radius:8px; display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
  .synergy-item { font-size:10px; font-weight:700; color:#00ff88; font-family:var(--fm,'JetBrains Mono',monospace); }

  .btn-lock {
    width:100%; padding:12px; margin-top:8px;
    border:2px solid #E8967D; border-radius:10px; background:rgba(232,150,125,.1);
    color:#E8967D; font-family:var(--fb,'Space Grotesk',sans-serif); font-size:13px; font-weight:900; letter-spacing:4px;
    cursor:pointer; transition:all .2s; animation:pulse 2s ease-in-out infinite;
  }
  .btn-lock:hover { background:rgba(232,150,125,.2); box-shadow:0 0 30px rgba(232,150,125,.2); transform:scale(1.01); }

  /* Right Panel */
  .draft-right { flex:1; display:flex; flex-direction:column; gap:12px; padding:20px; overflow-y:auto; }
  .roster-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
  .agent-card {
    display:flex; flex-direction:column; align-items:center; gap:5px; padding:10px 6px;
    border-radius:10px; border:1px solid rgba(240,237,228,.06); background:rgba(240,237,228,.02);
    cursor:pointer; transition:all .15s; position:relative; color:#F0EDE4; font-family:var(--fm,'JetBrains Mono',monospace);
  }
  .agent-card:hover { background:rgba(232,150,125,.06); border-color:rgba(232,150,125,.2); }
  .agent-card.selected { background:rgba(232,150,125,.1); border-color:#E8967D; box-shadow:0 0 15px rgba(232,150,125,.1); }
  .agent-card.disabled { opacity:.3; pointer-events:none; }
  .ac-header { display:flex; justify-content:space-between; width:100%; align-items:center; }
  .ac-role { font-size:7px; font-weight:800; letter-spacing:1px; padding:2px 5px; border-radius:3px; color:#fff; }
  .ac-check { font-size:11px; color:#00ff88; font-weight:900; }
  .ac-img { width:52px; height:52px; border-radius:10px; object-fit:cover; background:rgba(240,237,228,.05); transition:transform .2s; }
  .agent-card:hover .ac-img { transform:scale(1.05); }
  .agent-card.selected .ac-img { transform:scale(1.08); }
  .ac-name { font-size:9px; font-weight:700; letter-spacing:1px; text-align:center; }
  .ac-stats { width:100%; display:flex; flex-direction:column; gap:2px; margin-top:3px; }
  .stat-bar { display:flex; align-items:center; gap:3px; }
  .stat-lbl { font-size:6px; font-weight:800; color:rgba(240,237,228,.4); width:20px; letter-spacing:.5px; }
  .stat-track { flex:1; height:3px; background:rgba(240,237,228,.06); border-radius:2px; overflow:hidden; }
  .stat-fill { height:100%; border-radius:2px; transition:width .3s; }
  .stat-val { font-size:7px; font-weight:700; color:rgba(240,237,228,.5); width:16px; text-align:right; }
  .ac-tooltip {
    position:absolute; bottom:-24px; left:50%; transform:translateX(-50%);
    background:rgba(15,14,12,.95); border:1px solid rgba(232,150,125,.3); border-radius:5px;
    padding:3px 8px; z-index:20; white-space:nowrap; font-size:8px; color:rgba(240,237,228,.6);
    font-style:italic; animation:fadeIn .15s ease;
  }

  @keyframes fadeIn { from { opacity:0; transform:translateX(-50%) translateY(4px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
  @keyframes pulse { 0%,100% { box-shadow:0 0 0 0 rgba(232,150,125,0); } 50% { box-shadow:0 0 20px 0 rgba(232,150,125,.15); } }

  @media (max-width:900px) {
    .draft { flex-direction:column; }
    .draft-left { width:100%; min-width:unset; border-right:none; border-bottom:1px solid rgba(240,237,228,.06); }
    .roster-grid { grid-template-columns:repeat(2,1fr); }
  }
</style>
