<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { AgentId } from '$lib/engine/types';
  import { AGDEFS, type AgentDef } from '$lib/data/agents';
  import {
    v2SetPhase,
    v2AddChatMessage,
    v2AddFinding,
    arenaV2State,
    type V2SubPhase,
    type Finding,
    type ChatMsg,
    type Vote,
  } from '$lib/stores/arenaV2State';

  export let subPhase: V2SubPhase = null;
  export let findings: Finding[] = [];
  export let chatMessages: ChatMsg[] = [];
  export let selectedAgents: AgentId[] = [];
  export let timer: number = 0;
  export let speed: number = 3;

  // ── Data sources (beacons on tactical map) ──
  const SOURCES = [
    { id: 'binance',     label: 'Binance',    color: '#f0b90b', x: 15, y: 20, icon: '📊' },
    { id: 'onchain',     label: 'On-Chain',   color: '#00e68a', x: 85, y: 20, icon: '⛓' },
    { id: 'coinglass',   label: 'CoinGlass',  color: '#ff8c3b', x: 15, y: 80, icon: '📈' },
    { id: 'social',      label: 'Social',     color: '#8b5cf6', x: 85, y: 80, icon: '💬' },
    { id: 'glassnode',   label: 'Glassnode',  color: '#a78bfa', x: 50, y: 10, icon: '🔗' },
    { id: 'tradingview', label: 'TradingView',color: '#f43f5e', x: 50, y: 90, icon: '📉' },
  ];

  // Agent source mapping
  const AGENT_SOURCE: Record<string, string> = {
    STRUCTURE: 'binance', VPA: 'binance', ICT: 'binance',
    DERIV: 'coinglass', VALUATION: 'glassnode', FLOW: 'onchain',
    SENTI: 'social', MACRO: 'tradingview',
  };

  // ── Agent sprite positions ──
  interface Sprite {
    agentId: string;
    agent: AgentDef;
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    state: 'idle' | 'moving' | 'lock' | 'council';
    arrived: boolean;
    source: typeof SOURCES[0] | null;
  }

  let sprites: Sprite[] = [];
  let confidenceMeter = 50; // 0=BEAR, 100=BULL
  let councilVerdict = '';
  let votes: Vote[] = [];
  let timeouts: ReturnType<typeof setTimeout>[] = [];
  let animFrame: number | null = null;
  let elapsedMs = 0;
  let startTime = 0;

  // Phase timing (scaled by speed)
  $: scoutDuration = (5000 / speed);
  $: gatherDuration = (5000 / speed);
  $: councilDuration = (5000 / speed);
  $: totalDuration = scoutDuration + gatherDuration + councilDuration;

  function getAgentDef(id: string): AgentDef {
    return AGDEFS.find(a => a.id === id) ?? AGDEFS[0];
  }

  // ── Initialize sprites ──
  function initSprites() {
    sprites = selectedAgents.map(agentId => {
      const agent = getAgentDef(agentId);
      const sourceId = AGENT_SOURCE[agentId] || 'binance';
      const source = SOURCES.find(s => s.id === sourceId) ?? SOURCES[0];
      return {
        agentId,
        agent,
        x: 50,
        y: 50,
        targetX: source.x,
        targetY: source.y,
        state: 'idle' as const,
        arrived: false,
        source,
      };
    });
  }

  // ── Phase progression ──
  function runAnalysis() {
    startTime = Date.now();
    initSprites();

    // SCOUT phase
    runScout();
  }

  function runScout() {
    v2SetPhase('ANALYSIS', 'SCOUT');

    // Start agent movement
    sprites = sprites.map(s => ({ ...s, state: 'moving' as const }));

    // Add scout messages with delays
    const msgs = selectedAgents.map((agentId, i) => {
      const agent = getAgentDef(agentId);
      return {
        agentId,
        text: agent.speech.scout,
        delay: (i + 1) * (scoutDuration / 4),
      };
    });

    msgs.forEach(m => {
      timeouts.push(setTimeout(() => {
        v2AddChatMessage({ agentId: m.agentId, text: m.text, type: 'scout' });
      }, m.delay));
    });

    // Agents arrive at their data source
    timeouts.push(setTimeout(() => {
      sprites = sprites.map(s => ({ ...s, x: s.targetX, y: s.targetY, arrived: true }));
    }, scoutDuration * 0.6));

    // Transition to GATHER
    timeouts.push(setTimeout(() => {
      runGather();
    }, scoutDuration));
  }

  function runGather() {
    v2SetPhase('ANALYSIS', 'GATHER');
    sprites = sprites.map(s => ({ ...s, state: 'lock' as const }));

    // Generate findings from each agent
    selectedAgents.forEach((agentId, i) => {
      const agent = getAgentDef(agentId);
      const isLong = agent.dir === 'LONG';
      const isBearish = agent.dir === 'SHORT';

      timeouts.push(setTimeout(() => {
        // Add finding
        v2AddFinding({
          agentId,
          title: agent.finding.title,
          detail: agent.finding.detail,
          direction: agent.dir,
          confidence: agent.conf,
          icon: agent.icon,
        });

        // Add chat message
        v2AddChatMessage({
          agentId,
          text: `[FINDING] "${agent.finding.title}" — ${agent.finding.detail}`,
          type: 'finding',
          color: isLong ? '#00ff88' : isBearish ? '#ff2d55' : '#F0EDE4',
        });

        // Update confidence meter
        const shift = isLong ? agent.conf * 0.3 : isBearish ? -agent.conf * 0.3 : 0;
        confidenceMeter = Math.max(0, Math.min(100, confidenceMeter + shift));
      }, (i + 1) * (gatherDuration / 4)));
    });

    // Transition to COUNCIL
    timeouts.push(setTimeout(() => {
      runCouncil();
    }, gatherDuration));
  }

  function runCouncil() {
    v2SetPhase('ANALYSIS', 'COUNCIL');

    // Agents move to center for deliberation
    sprites = sprites.map((s, i) => {
      const angle = (i / selectedAgents.length) * Math.PI * 2 - Math.PI / 2;
      return {
        ...s,
        state: 'council' as const,
        targetX: 50 + Math.cos(angle) * 12,
        targetY: 50 + Math.sin(angle) * 12,
        x: 50 + Math.cos(angle) * 12,
        y: 50 + Math.sin(angle) * 12,
      };
    });

    // Generate votes
    votes = selectedAgents.map(agentId => {
      const agent = getAgentDef(agentId);
      return {
        agentId,
        direction: agent.dir,
        confidence: agent.conf,
        speech: agent.speech.vote,
      };
    });

    // Add deliberation chat messages
    selectedAgents.forEach((agentId, i) => {
      const agent = getAgentDef(agentId);
      timeouts.push(setTimeout(() => {
        v2AddChatMessage({
          agentId,
          text: agent.speech.vote,
          type: 'council',
          color: agent.dir === 'LONG' ? '#00ff88' : agent.dir === 'SHORT' ? '#ff2d55' : '#ffaa00',
        });
      }, (i + 1) * (councilDuration / 5)));
    });

    // Final verdict
    timeouts.push(setTimeout(() => {
      const longVotes = votes.filter(v => v.direction === 'LONG').length;
      const shortVotes = votes.filter(v => v.direction === 'SHORT').length;
      const consensusDir = longVotes > shortVotes ? 'LONG' : shortVotes > longVotes ? 'SHORT' : 'NEUTRAL';
      const consensusConf = votes.length === 0 ? 50 : Math.round(votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length);
      const isUnanimous = longVotes === 3 || shortVotes === 3;
      const consensusType = isUnanimous ? 'unanimous' : (longVotes === 0 || shortVotes === 0) ? 'majority' : 'split';

      councilVerdict = `COUNCIL VERDICT: ${consensusDir} (${
        isUnanimous ? '3-0' : `${Math.max(longVotes, shortVotes)}-${Math.min(longVotes, shortVotes)}`
      })`;

      // Update store
      arenaV2State.update(s => ({
        ...s,
        councilVotes: votes,
        consensusDir: consensusDir as 'LONG' | 'SHORT' | 'NEUTRAL',
        consensusConf,
        consensusType: consensusType as 'unanimous' | 'majority' | 'split',
      }));

      v2AddChatMessage({
        agentId: 'SYSTEM',
        text: councilVerdict,
        type: 'system',
        color: consensusDir === 'LONG' ? '#00ff88' : consensusDir === 'SHORT' ? '#ff2d55' : '#ffaa00',
        icon: '🗳',
      });
    }, councilDuration * 0.8));

    // Transition to HYPOTHESIS
    timeouts.push(setTimeout(() => {
      v2SetPhase('HYPOTHESIS');
    }, councilDuration));
  }

  // ── Animation loop ──
  function animLoop() {
    elapsedMs = Date.now() - startTime;
    animFrame = requestAnimationFrame(animLoop);
  }

  onMount(() => {
    runAnalysis();
    animFrame = requestAnimationFrame(animLoop);
  });

  onDestroy(() => {
    timeouts.forEach(t => clearTimeout(t));
    timeouts = [];
    if (animFrame) cancelAnimationFrame(animFrame);
  });

  // ── Reactive ──
  $: subLabel = subPhase === 'SCOUT' ? 'SCOUTING DATA SOURCES' :
                subPhase === 'GATHER' ? 'GATHERING INTELLIGENCE' :
                subPhase === 'COUNCIL' ? 'COUNCIL DELIBERATION' : '';
  $: confColor = confidenceMeter > 60 ? '#00ff88' : confidenceMeter < 40 ? '#ff2d55' : '#ffaa00';
</script>

<div class="analysis">
  <!-- Left: Tactical Map (70%) -->
  <div class="tac-map">
    <div class="tac-title">{subLabel}</div>

    <!-- Data Source Beacons -->
    {#each SOURCES as src}
      <div class="beacon" style="left:{src.x}%;top:{src.y}%;--bc:{src.color}"
        class:active={sprites.some(s => s.source?.id === src.id && (s.state === 'lock' || s.arrived))}>
        <span class="beacon-icon">{src.icon}</span>
        <span class="beacon-label">{src.label}</span>
        <div class="beacon-ring"></div>
      </div>
    {/each}

    <!-- Agent Sprites -->
    {#each sprites as sprite}
      <div class="sprite"
        style="left:{sprite.x}%;top:{sprite.y}%"
        class:moving={sprite.state === 'moving'}
        class:lock={sprite.state === 'lock'}
        class:council={sprite.state === 'council'}>
        <img src={sprite.agent.img.def} alt={sprite.agentId} class="sprite-img" />
        <span class="sprite-name">{sprite.agent.icon}</span>
        {#if sprite.state === 'lock'}
          <div class="lock-glow" style="background:{sprite.source?.color ?? '#fff'}"></div>
        {/if}
      </div>
    {/each}

    <!-- Council Verdict Banner -->
    {#if councilVerdict}
      <div class="verdict-banner" class:long={councilVerdict.includes('LONG')} class:short={councilVerdict.includes('SHORT')}>
        {councilVerdict}
      </div>
    {/if}

    <!-- Grid lines (tron-style) -->
    <div class="grid-overlay"></div>
  </div>

  <!-- Right: Intel Feed (30%) -->
  <div class="intel-feed">
    <div class="feed-header">
      <span class="feed-title">INTEL FEED</span>
      <div class="conf-meter">
        <span class="conf-label">BULL</span>
        <div class="conf-bar">
          <div class="conf-fill" style="width:{confidenceMeter}%;background:{confColor}"></div>
          <div class="conf-needle" style="left:{confidenceMeter}%"></div>
        </div>
        <span class="conf-label">BEAR</span>
      </div>
    </div>

    <div class="feed-scroll">
      {#each chatMessages as msg}
        <div class="feed-msg" style="--mc:{msg.color ?? 'rgba(240,237,228,.6)'}">
          {#if msg.icon}<span class="msg-icon">{msg.icon}</span>{/if}
          <span class="msg-agent" style="color:{msg.color ?? '#E8967D'}">{msg.agentId}:</span>
          <span class="msg-text">{msg.text}</span>
        </div>
      {/each}
    </div>

    <!-- Findings Cards -->
    {#if findings.length > 0}
      <div class="findings-section">
        <div class="findings-title">FINDINGS ({findings.length})</div>
        {#each findings as f}
          <div class="finding-card" class:long={f.direction === 'LONG'} class:short={f.direction === 'SHORT'}>
            <div class="fc-header">
              <span class="fc-icon">{f.icon}</span>
              <span class="fc-dir" class:long={f.direction === 'LONG'} class:short={f.direction === 'SHORT'}>
                {f.direction === 'LONG' ? '▲' : f.direction === 'SHORT' ? '▼' : '◆'}
              </span>
              <span class="fc-conf">{f.confidence}%</span>
            </div>
            <div class="fc-title">{f.title}</div>
            <div class="fc-detail">{f.detail}</div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .analysis { flex:1; display:flex; background:#0A0908; overflow:hidden; }

  /* ── Tactical Map ── */
  .tac-map {
    flex:7; position:relative; overflow:hidden;
    background: radial-gradient(ellipse at center, rgba(232,150,125,.03) 0%, transparent 70%);
  }
  .tac-title {
    position:absolute; top:16px; left:50%; transform:translateX(-50%);
    font-size:9px; font-weight:800; letter-spacing:3px; color:rgba(240,237,228,.4);
    font-family:var(--fm,'JetBrains Mono',monospace); z-index:10;
  }
  .grid-overlay {
    position:absolute; inset:0; pointer-events:none;
    background-image:
      linear-gradient(rgba(240,237,228,.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(240,237,228,.02) 1px, transparent 1px);
    background-size:40px 40px;
  }

  /* Beacons */
  .beacon {
    position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:3px;
    z-index:5; opacity:.4; transition:opacity .5s;
  }
  .beacon.active { opacity:1; }
  .beacon-icon { font-size:20px; }
  .beacon-label { font-size:7px; font-weight:700; letter-spacing:1px; color:var(--bc); font-family:var(--fm,'JetBrains Mono',monospace); }
  .beacon-ring {
    position:absolute; width:50px; height:50px; border-radius:50%; border:1px solid var(--bc); opacity:.2;
    animation:beaconPulse 3s ease-in-out infinite;
  }
  .beacon.active .beacon-ring { opacity:.5; animation:beaconPulse 1.5s ease-in-out infinite; }

  /* Sprites */
  .sprite {
    position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:2px;
    z-index:8; transition:left 1.5s ease-in-out, top 1.5s ease-in-out;
  }
  .sprite-img { width:40px; height:40px; border-radius:10px; object-fit:cover; background:rgba(240,237,228,.05); }
  .sprite-name { font-size:14px; }
  .sprite.moving .sprite-img { animation:spriteWalk .6s ease-in-out infinite; }
  .sprite.lock .sprite-img { animation:spriteLock 1s ease-in-out infinite; box-shadow:0 0 15px rgba(255,255,255,.2); }
  .sprite.council .sprite-img { animation:spriteCouncil .8s ease-in-out infinite; }
  .lock-glow {
    position:absolute; width:60px; height:60px; border-radius:50%; opacity:.15; filter:blur(10px);
    animation:lockGlow 1.5s ease-in-out infinite;
  }

  /* Verdict Banner */
  .verdict-banner {
    position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
    padding:12px 28px; border-radius:10px; font-size:12px; font-weight:900; letter-spacing:3px;
    font-family:var(--fb,'Space Grotesk',sans-serif); z-index:15;
    background:rgba(10,9,8,.9); border:2px solid rgba(240,237,228,.2); color:#F0EDE4;
    animation:verdictIn .5s ease;
  }
  .verdict-banner.long { border-color:#00ff88; color:#00ff88; }
  .verdict-banner.short { border-color:#ff2d55; color:#ff2d55; }

  /* ── Intel Feed ── */
  .intel-feed {
    flex:3; display:flex; flex-direction:column;
    border-left:1px solid rgba(240,237,228,.06); background:rgba(15,14,12,.95);
  }
  .feed-header { padding:12px; border-bottom:1px solid rgba(240,237,228,.06); }
  .feed-title { font-size:9px; font-weight:800; letter-spacing:2px; color:rgba(240,237,228,.4); font-family:var(--fm,'JetBrains Mono',monospace); }
  .conf-meter { display:flex; align-items:center; gap:4px; margin-top:8px; }
  .conf-label { font-size:7px; font-weight:700; color:rgba(240,237,228,.3); font-family:var(--fm,'JetBrains Mono',monospace); }
  .conf-bar { flex:1; height:6px; background:rgba(240,237,228,.06); border-radius:3px; overflow:hidden; position:relative; }
  .conf-fill { height:100%; border-radius:3px; transition:width .5s, background .5s; }
  .conf-needle {
    position:absolute; top:-2px; width:2px; height:10px; background:#fff; border-radius:1px;
    transition:left .5s; transform:translateX(-50%);
  }

  .feed-scroll { flex:1; overflow-y:auto; padding:8px 12px; display:flex; flex-direction:column; gap:6px; }
  .feed-msg { display:flex; gap:4px; align-items:flex-start; font-size:9px; font-family:var(--fm,'JetBrains Mono',monospace); animation:msgIn .3s ease; }
  .msg-icon { font-size:10px; flex-shrink:0; }
  .msg-agent { font-weight:700; flex-shrink:0; }
  .msg-text { color:rgba(240,237,228,.6); word-break:break-word; }

  /* Findings */
  .findings-section { padding:8px 12px; border-top:1px solid rgba(240,237,228,.06); max-height:200px; overflow-y:auto; }
  .findings-title { font-size:8px; font-weight:700; letter-spacing:1px; color:rgba(240,237,228,.3); margin-bottom:6px; font-family:var(--fm,'JetBrains Mono',monospace); }
  .finding-card {
    padding:6px 8px; margin-bottom:4px; border-radius:6px;
    background:rgba(240,237,228,.03); border:1px solid rgba(240,237,228,.06);
    animation:cardIn .3s ease;
  }
  .finding-card.long { border-left:2px solid #00ff88; }
  .finding-card.short { border-left:2px solid #ff2d55; }
  .fc-header { display:flex; align-items:center; gap:4px; }
  .fc-icon { font-size:12px; }
  .fc-dir { font-size:10px; font-weight:900; }
  .fc-dir.long { color:#00ff88; }
  .fc-dir.short { color:#ff2d55; }
  .fc-conf { font-size:8px; font-weight:700; color:rgba(240,237,228,.4); margin-left:auto; font-family:var(--fm,'JetBrains Mono',monospace); }
  .fc-title { font-size:9px; font-weight:700; color:#F0EDE4; margin-top:3px; font-family:var(--fm,'JetBrains Mono',monospace); }
  .fc-detail { font-size:8px; color:rgba(240,237,228,.4); margin-top:2px; font-family:var(--fm,'JetBrains Mono',monospace); }

  @keyframes beaconPulse { 0%,100% { transform:scale(1); opacity:.2; } 50% { transform:scale(1.3); opacity:.5; } }
  @keyframes spriteWalk { 0%,100% { transform:translate(-50%,-50%) translateY(0); } 50% { transform:translate(-50%,-50%) translateY(-3px); } }
  @keyframes spriteLock { 0%,100% { transform:translate(-50%,-50%) scale(1); } 50% { transform:translate(-50%,-50%) scale(1.05); } }
  @keyframes spriteCouncil { 0%,100% { transform:translate(-50%,-50%) rotate(0deg); } 25% { transform:translate(-50%,-50%) rotate(-2deg); } 75% { transform:translate(-50%,-50%) rotate(2deg); } }
  @keyframes lockGlow { 0%,100% { opacity:.1; transform:scale(.8); } 50% { opacity:.25; transform:scale(1.2); } }
  @keyframes verdictIn { from { opacity:0; transform:translate(-50%,-50%) scale(.8); } to { opacity:1; transform:translate(-50%,-50%) scale(1); } }
  @keyframes msgIn { from { opacity:0; transform:translateX(-5px); } to { opacity:1; transform:translateX(0); } }
  @keyframes cardIn { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
</style>
