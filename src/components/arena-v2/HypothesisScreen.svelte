<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Direction, AgentId } from '$lib/engine/types';
  import { AGDEFS, type AgentDef } from '$lib/data/agents';
  import {
    arenaV2State,
    v2SetHypothesis,
    v2SetPhase,
    type V2Hypothesis,
    type Finding,
    type Vote,
  } from '$lib/stores/arenaV2State';
  import { searchV2SimilarGames, recallToHint, type V2RAGHint } from '$lib/engine/v2RagBridge';

  export let hypothesis: V2Hypothesis | null = null;
  export let btcPrice: number = 0;
  export let timer: number = 0;
  export let consensusDir: Direction = 'NEUTRAL';
  export let consensusConf: number = 0;
  export let findings: Finding[] = [];
  export let councilVotes: Vote[] = [];
  export let selectedAgents: AgentId[] = [];

  // ── RAG hint ──
  let ragHint: V2RAGHint | null = null;
  let ragLoading = false;

  // Search for similar games on mount
  async function loadRAGHint() {
    ragLoading = true;
    try {
      const state = $arenaV2State;
      const recall = await searchV2SimilarGames({
        selectedAgents: state.selectedAgents,
        findings: state.findings,
        hypothesis: { dir: consensusDir, conf: consensusConf },
        btcPrice,
        tier: state.squadConfig.tier,
        timeframe: state.squadConfig.timeframe,
        consensusType: state.consensusType,
      });
      ragHint = recallToHint(recall);
      if (recall) {
        arenaV2State.update(s => ({ ...s, ragRecall: recall }));
      }
    } catch {
      // Graceful — no hint if search fails
    }
    ragLoading = false;
  }

  // Fire on component init
  loadRAGHint();

  // ── Local state ──
  let dir: Direction = consensusDir;
  let conf: number = consensusConf || 70;
  let tpPct: number = 0.5;
  let slPct: number = 0.3;

  // Execute transition
  let executing = false;
  let executePhase = -1; // -1=not started, 0-4=phases
  let transitionTimeouts: ReturnType<typeof setTimeout>[] = [];

  // Agent reactions
  let agentReactions: Record<string, 'idle' | 'agree' | 'disagree' | 'neutral' | 'panic' | 'happy' | 'windup' | 'dash'> = {};
  let reactionTimeouts: Record<string, ReturnType<typeof setTimeout>> = {};

  // Initialize from consensus
  $: if (consensusDir !== 'NEUTRAL' && dir === 'NEUTRAL') dir = consensusDir;
  $: if (consensusConf > 0 && conf === 70) conf = consensusConf;

  $: entry = btcPrice;
  $: tp = dir === 'LONG' ? entry * (1 + tpPct / 100) : entry * (1 - tpPct / 100);
  $: sl = dir === 'LONG' ? entry * (1 - slPct / 100) : entry * (1 + slPct / 100);
  $: rr = slPct > 0 ? tpPct / slPct : 0;
  $: rrColor = rr >= 3 ? '#FFD700' : rr >= 2 ? '#00ff88' : rr >= 1.5 ? '#ffaa00' : '#ff2d55';
  $: rrLabel = rr >= 3 ? 'EXCELLENT' : rr >= 2 ? 'GOOD' : rr >= 1.5 ? 'FAIR' : 'RISKY';

  // Screen color tint based on direction
  $: screenTint = dir === 'LONG' ? 'rgba(0,255,136,.03)' : dir === 'SHORT' ? 'rgba(255,45,85,.03)' : 'transparent';

  // ── Agent helpers ──
  function getAgentDef(id: string): AgentDef {
    return AGDEFS.find(a => a.id === id) ?? AGDEFS[0];
  }

  function getVote(agentId: string): Vote | undefined {
    return councilVotes.find(v => v.agentId === agentId);
  }

  // ── Agent reactions ──
  function updateReactions(userDir: Direction) {
    // Clear previous reaction timeouts
    Object.values(reactionTimeouts).forEach(t => clearTimeout(t));
    reactionTimeouts = {};

    selectedAgents.forEach((agentId, i) => {
      const agent = getAgentDef(agentId);
      let reaction: typeof agentReactions[string] = 'idle';

      if (userDir === 'NEUTRAL') {
        reaction = 'neutral';
      } else {
        reaction = agent.dir === userDir ? 'agree' : 'disagree';
      }

      // Staggered reaction
      const t = setTimeout(() => {
        agentReactions = { ...agentReactions, [agentId]: reaction };
        // Return to idle after animation
        const t2 = setTimeout(() => {
          agentReactions = { ...agentReactions, [agentId]: 'idle' };
        }, 800);
        reactionTimeouts[agentId + '_idle'] = t2;
      }, i * 150);
      reactionTimeouts[agentId] = t;
    });
  }

  // React to direction changes
  $: updateReactions(dir);

  // React to TP/SL changes
  $: {
    if (slPct < 0.15 && dir !== 'NEUTRAL') {
      selectedAgents.forEach(id => {
        agentReactions = { ...agentReactions, [id]: 'panic' };
      });
    } else if (rr >= 3 && dir !== 'NEUTRAL') {
      selectedAgents.forEach(id => {
        agentReactions = { ...agentReactions, [id]: 'happy' };
      });
    }
  }

  // ── Agent speech ──
  function getAgentSpeech(agentId: string): string {
    const agent = getAgentDef(agentId);
    const vote = getVote(agentId);
    if (vote) return vote.speech;
    return agent.speech.vote;
  }

  function getReactionSpeech(agentId: string, reaction: string): string {
    const agent = getAgentDef(agentId);
    if (reaction === 'agree') return `${agent.dir}! such conviction. wow`;
    if (reaction === 'disagree') return 'hmm... not so sure about this...';
    if (reaction === 'panic') return 'SL too tight! much danger! wow!';
    if (reaction === 'happy') return 'very nice R:R! such profit potential!';
    return getAgentSpeech(agentId);
  }

  // ── Execute transition ──
  function wait(ms: number): Promise<void> {
    return new Promise(r => {
      const t = setTimeout(r, ms);
      transitionTimeouts.push(t);
    });
  }

  async function handleExecute() {
    if (dir === 'NEUTRAL' || btcPrice <= 0 || executing) return;
    executing = true;

    // Phase 0: Agents windup
    executePhase = 0;
    selectedAgents.forEach(id => {
      agentReactions = { ...agentReactions, [id]: 'windup' };
    });
    await wait(500);

    // Phase 1: Flash
    executePhase = 1;
    await wait(400);

    // Phase 2: "BATTLE STATIONS" text
    executePhase = 2;
    await wait(600);

    // Phase 3: Agent dash forward
    executePhase = 3;
    selectedAgents.forEach(id => {
      agentReactions = { ...agentReactions, [id]: 'dash' };
    });
    await wait(400);

    // Phase 4: Fade to black
    executePhase = 4;
    await wait(500);

    // Transition to BATTLE
    const hyp: V2Hypothesis = { dir, conf, entry, tp, sl, rr };
    v2SetHypothesis(hyp);
    v2SetPhase('BATTLE');
  }

  function fmtPrice(p: number): string {
    return p.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  onDestroy(() => {
    transitionTimeouts.forEach(t => clearTimeout(t));
    Object.values(reactionTimeouts).forEach(t => clearTimeout(t));
  });
</script>

<div class="hypo-screen" style="background-image:radial-gradient(ellipse at center bottom, {screenTint} 0%, transparent 70%)">

  <!-- ═══ TOP: Order Bar ═══ -->
  <div class="order-bar">
    <span class="bar-title">BATTLE ORDERS</span>
    <div class="bar-price">
      {#if btcPrice > 0}
        <span class="bar-sym">BTC</span>
        <span class="bar-val">${fmtPrice(btcPrice)}</span>
      {:else}
        <span class="bar-loading">connecting...</span>
      {/if}
    </div>
    {#if consensusDir !== 'NEUTRAL'}
      <div class="bar-verdict" class:long={consensusDir === 'LONG'} class:short={consensusDir === 'SHORT'}>
        COUNCIL: {consensusDir}
      </div>
    {/if}
  </div>

  <!-- ═══ MIDDLE: Price Ladder + Command Panel ═══ -->
  <div class="order-content">

    <!-- Left: Price Ladder -->
    <div class="price-ladder">
      {#if dir !== 'NEUTRAL' && btcPrice > 0}
        <!-- TP Level -->
        <div class="level-row tp-row" style="top:15%">
          <div class="level-marker tp-marker">
            <span class="lm-tag">TP</span>
            <span class="lm-price">${fmtPrice(tp)}</span>
            <span class="lm-pct tp-pct">+{tpPct.toFixed(2)}%</span>
          </div>
          <div class="level-line tp-line"></div>
        </div>

        <!-- Entry Level -->
        <div class="level-row entry-row" style="top:50%">
          <div class="level-marker entry-marker">
            <span class="lm-tag">ENTRY</span>
            <span class="lm-price">${fmtPrice(entry)}</span>
          </div>
          <div class="level-line entry-line"></div>
        </div>

        <!-- SL Level -->
        <div class="level-row sl-row" style="top:85%">
          <div class="level-marker sl-marker">
            <span class="lm-tag">SL</span>
            <span class="lm-price">${fmtPrice(sl)}</span>
            <span class="lm-pct sl-pct">-{slPct.toFixed(2)}%</span>
          </div>
          <div class="level-line sl-line"></div>
        </div>

        <!-- Direction Arrow -->
        <div class="dir-arrow-big" class:long={dir === 'LONG'} class:short={dir === 'SHORT'}>
          {dir === 'LONG' ? '▲' : '▼'}
        </div>

        <!-- Agent Level Markers from findings -->
        {#each findings.slice(0, 4) as f, i}
          <div class="finding-marker" style="top:{25 + i * 15}%">
            <span class="fm-icon">{f.icon}</span>
            <span class="fm-text">{f.title}</span>
          </div>
        {/each}
      {:else}
        <div class="ladder-empty">
          <span class="ladder-msg">{btcPrice <= 0 ? 'Waiting for price...' : 'Select direction'}</span>
        </div>
      {/if}

      <!-- TP/SL Sliders (overlay at bottom of ladder) -->
      {#if dir !== 'NEUTRAL'}
        <div class="tpsl-controls">
          <div class="tpsl-row">
            <span class="tpsl-label tp-c">TP</span>
            <input type="range" min="0.1" max="3.0" step="0.05" bind:value={tpPct} class="tpsl-slider tp-slider" />
            <span class="tpsl-val tp-c">+{tpPct.toFixed(2)}%</span>
          </div>
          <div class="tpsl-row">
            <span class="tpsl-label sl-c">SL</span>
            <input type="range" min="0.1" max="2.0" step="0.05" bind:value={slPct} class="tpsl-slider sl-slider" />
            <span class="tpsl-val sl-c">-{slPct.toFixed(2)}%</span>
          </div>
        </div>
      {/if}
    </div>

    <!-- Right: Command Panel -->
    <div class="command-panel">
      <!-- Direction Commands (RPG style) -->
      <div class="cmd-section">
        <div class="cmd-header">DIRECTION</div>
        <div class="cmd-buttons">
          {#each [['LONG', '▲', '#00ff88'], ['NEUTRAL', '◆', '#ffaa00'], ['SHORT', '▼', '#ff2d55']] as [d, icon, color]}
            <button class="cmd-btn"
              class:active={dir === d}
              class:recommended={consensusDir === d && d !== 'NEUTRAL'}
              style="--cmd-color:{color}"
              on:click={() => dir = d as Direction}>
              <span class="cmd-icon">{icon}</span>
              <span class="cmd-label">{d}</span>
              {#if consensusDir === d && d !== 'NEUTRAL'}
                <span class="cmd-star">✦</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <!-- R:R Gauge -->
      {#if dir !== 'NEUTRAL'}
        <div class="rr-section">
          <div class="rr-header">RISK : REWARD</div>
          <div class="rr-gauge">
            <div class="rr-fill" style="width:{Math.min(rr / 4 * 100, 100)}%;background:{rrColor}"></div>
            <span class="rr-value" style="color:{rrColor}">{rr.toFixed(1)}</span>
          </div>
          <span class="rr-label" style="color:{rrColor}">{rrLabel}</span>
        </div>

        <!-- Confidence -->
        <div class="conf-section">
          <div class="conf-header">CONFIDENCE</div>
          <div class="conf-row">
            <input type="range" min="10" max="100" bind:value={conf} class="conf-slider" />
            <span class="conf-val">{conf}%</span>
          </div>
        </div>

        <!-- Risk Summary Mini -->
        <div class="risk-mini">
          <div class="rm-row"><span>Entry</span><span>${fmtPrice(entry)}</span></div>
          <div class="rm-row"><span class="tp-c">TP</span><span class="tp-c">${fmtPrice(tp)}</span></div>
          <div class="rm-row"><span class="sl-c">SL</span><span class="sl-c">${fmtPrice(sl)}</span></div>
        </div>
      {/if}

      <!-- RAG Hint -->
      {#if ragHint}
        <div class="rag-hint">
          <span class="rag-icon">🔮</span>
          <div class="rag-info">
            <span class="rag-count">{ragHint.similarCount} similar found</span>
            <span class="rag-rate">{ragHint.suggestedDir === 'LONG' ? '▲' : '▼'} {ragHint.suggestedDir} {Math.round(ragHint.winRate * 100)}% win</span>
          </div>
        </div>
      {:else if ragLoading}
        <div class="rag-hint rag-loading">
          <span class="rag-icon">🔮</span>
          <span class="rag-text">searching past games...</span>
        </div>
      {/if}

      <!-- EXECUTE Button -->
      <button class="btn-execute"
        class:disabled={dir === 'NEUTRAL' || btcPrice <= 0 || executing}
        disabled={dir === 'NEUTRAL' || btcPrice <= 0 || executing}
        on:click={handleExecute}
        class:long={dir === 'LONG'} class:short={dir === 'SHORT'}>
        {#if btcPrice <= 0}
          ⏳ WAITING FOR PRICE...
        {:else if dir === 'NEUTRAL'}
          SELECT DIRECTION
        {:else if executing}
          INITIATING...
        {:else}
          ⚡ EXECUTE ⚡
        {/if}
      </button>
    </div>
  </div>

  <!-- ═══ BOTTOM: Agent Sprite Row ═══ -->
  <div class="agent-row">
    {#each selectedAgents as agentId}
      {@const agent = getAgentDef(agentId)}
      {@const vote = getVote(agentId)}
      {@const reaction = agentReactions[agentId] || 'idle'}
      <div class="agent-slot">
        <!-- Speech Bubble -->
        <div class="speech-bubble" class:visible={reaction !== 'idle' || dir !== 'NEUTRAL'}>
          <span class="sb-text">{getReactionSpeech(agentId, reaction)}</span>
          <div class="sb-tail"></div>
        </div>

        <!-- Sprite -->
        <div class="sprite-container"
          class:agree={reaction === 'agree'}
          class:disagree={reaction === 'disagree'}
          class:panic={reaction === 'panic'}
          class:happy={reaction === 'happy'}
          class:windup={reaction === 'windup'}
          class:dash={reaction === 'dash'}>
          <img
            src={reaction === 'agree' || reaction === 'happy' ? agent.img.win : reaction === 'disagree' || reaction === 'panic' ? agent.img.alt : agent.img.def}
            alt={agentId}
            class="agent-sprite"
          />
          <!-- Glow effect -->
          {#if reaction === 'agree' || reaction === 'happy'}
            <div class="sprite-glow" style="background:{agent.color}"></div>
          {/if}
          {#if reaction === 'windup'}
            <div class="charge-glow"></div>
          {/if}
        </div>

        <!-- Agent Label -->
        <div class="agent-label">
          <span class="al-icon">{agent.icon}</span>
          <span class="al-name">{agentId}</span>
          {#if vote}
            <span class="al-dir" class:long={vote.direction === 'LONG'} class:short={vote.direction === 'SHORT'}>
              {vote.direction === 'LONG' ? '▲' : vote.direction === 'SHORT' ? '▼' : '◆'}
            </span>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- ═══ EXECUTE TRANSITION OVERLAY ═══ -->
  {#if executing}
    <div class="execute-overlay" class:phase0={executePhase === 0} class:phase1={executePhase === 1} class:phase2={executePhase === 2} class:phase3={executePhase === 3} class:phase4={executePhase === 4}>
      {#if executePhase === 1}
        <div class="flash"></div>
      {/if}
      {#if executePhase === 2}
        <div class="battle-stations">BATTLE STATIONS</div>
      {/if}
      {#if executePhase === 4}
        <div class="blackout">
          <div class="bo-price">${fmtPrice(entry)}</div>
          <div class="bo-dir" class:long={dir === 'LONG'} class:short={dir === 'SHORT'}>
            {dir === 'LONG' ? '▲ LONG' : '▼ SHORT'}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .hypo-screen {
    flex:1; display:flex; flex-direction:column; background:#0A0908;
    overflow:hidden; position:relative;
    transition: background-image .3s;
  }

  /* ═══ ORDER BAR ═══ */
  .order-bar {
    display:flex; align-items:center; gap:12px; padding:8px 16px;
    border-bottom:1px solid rgba(240,237,228,.06);
    background:rgba(10,9,8,.95); z-index:5;
  }
  .bar-title { font-size:9px; font-weight:900; letter-spacing:3px; color:#E8967D; font-family:var(--fb,'Space Grotesk',sans-serif); }
  .bar-price { display:flex; align-items:baseline; gap:4px; margin-left:auto; }
  .bar-sym { font-size:8px; font-weight:700; letter-spacing:1px; color:rgba(240,237,228,.4); font-family:var(--fm,'JetBrains Mono',monospace); }
  .bar-val { font-size:14px; font-weight:800; color:#F0EDE4; font-variant-numeric:tabular-nums; font-family:var(--fm,'JetBrains Mono',monospace); }
  .bar-loading { font-size:9px; color:rgba(240,237,228,.3); animation:blink 2s ease-in-out infinite; }
  .bar-verdict {
    font-size:8px; font-weight:800; letter-spacing:2px; padding:3px 10px; border-radius:4px;
    font-family:var(--fm,'JetBrains Mono',monospace);
  }
  .bar-verdict.long { background:rgba(0,255,136,.1); color:#00ff88; border:1px solid rgba(0,255,136,.2); }
  .bar-verdict.short { background:rgba(255,45,85,.1); color:#ff2d55; border:1px solid rgba(255,45,85,.2); }

  /* ═══ ORDER CONTENT ═══ */
  .order-content { flex:1; display:flex; overflow:hidden; min-height:0; }

  /* ── Price Ladder ── */
  .price-ladder {
    flex:6; position:relative; padding:20px;
    background:radial-gradient(ellipse at center, rgba(232,150,125,.02) 0%, transparent 70%);
    /* Grid lines */
    background-image:
      radial-gradient(ellipse at center, rgba(232,150,125,.02) 0%, transparent 70%),
      linear-gradient(rgba(240,237,228,.015) 1px, transparent 1px),
      linear-gradient(90deg, rgba(240,237,228,.015) 1px, transparent 1px);
    background-size: 100% 100%, 40px 40px, 40px 40px;
  }

  .level-row { position:absolute; left:0; right:0; display:flex; align-items:center; transform:translateY(-50%); padding:0 20px; }
  .level-marker { display:flex; align-items:center; gap:8px; z-index:3; }
  .lm-tag { font-size:8px; font-weight:900; letter-spacing:1px; padding:2px 8px; border-radius:3px; font-family:var(--fm,'JetBrains Mono',monospace); }
  .tp-row .lm-tag { background:rgba(0,255,136,.12); color:#00ff88; }
  .entry-row .lm-tag { background:rgba(240,237,228,.08); color:#F0EDE4; }
  .sl-row .lm-tag { background:rgba(255,45,85,.12); color:#ff2d55; }
  .lm-price { font-size:13px; font-weight:800; color:#F0EDE4; font-variant-numeric:tabular-nums; font-family:var(--fm,'JetBrains Mono',monospace); }
  .lm-pct { font-size:9px; font-weight:700; font-family:var(--fm,'JetBrains Mono',monospace); }
  .tp-pct { color:#00ff88; }
  .sl-pct { color:#ff2d55; }

  .level-line { position:absolute; left:0; right:0; height:1px; }
  .tp-line { background:linear-gradient(90deg, rgba(0,255,136,.3), rgba(0,255,136,.05)); }
  .entry-line { background:rgba(240,237,228,.1); border-top:1px dashed rgba(240,237,228,.15); }
  .sl-line { background:linear-gradient(90deg, rgba(255,45,85,.3), rgba(255,45,85,.05)); }

  .dir-arrow-big {
    position:absolute; top:35%; left:50%; transform:translate(-50%,-50%);
    font-size:64px; font-weight:900; opacity:.08; pointer-events:none;
  }
  .dir-arrow-big.long { color:#00ff88; }
  .dir-arrow-big.short { color:#ff2d55; }

  .finding-marker {
    position:absolute; right:20px; transform:translateY(-50%); display:flex; align-items:center; gap:4px;
    font-size:8px; color:rgba(240,237,228,.35); font-family:var(--fm,'JetBrains Mono',monospace);
    padding:2px 6px; background:rgba(240,237,228,.02); border-radius:3px; border:1px solid rgba(240,237,228,.04);
  }
  .fm-icon { font-size:10px; }

  .ladder-empty {
    position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
    font-size:11px; color:rgba(240,237,228,.25); font-family:var(--fm,'JetBrains Mono',monospace);
  }

  .tpsl-controls {
    position:absolute; bottom:12px; left:20px; right:20px;
    display:flex; flex-direction:column; gap:6px;
    padding:8px 10px; background:rgba(10,9,8,.8); border-radius:8px;
    border:1px solid rgba(240,237,228,.06);
  }
  .tpsl-row { display:flex; align-items:center; gap:6px; }
  .tpsl-label { font-size:9px; font-weight:800; width:18px; font-family:var(--fm,'JetBrains Mono',monospace); }
  .tp-c { color:#00ff88; }
  .sl-c { color:#ff2d55; }
  .tpsl-slider { flex:1; -webkit-appearance:none; height:3px; border-radius:2px; background:rgba(240,237,228,.08); outline:none; }
  .tp-slider::-webkit-slider-thumb { -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:#00ff88; cursor:pointer; }
  .sl-slider::-webkit-slider-thumb { -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:#ff2d55; cursor:pointer; }
  .tpsl-val { font-size:9px; font-weight:700; width:48px; text-align:right; font-family:var(--fm,'JetBrains Mono',monospace); }

  /* ── Command Panel ── */
  .command-panel {
    flex:4; display:flex; flex-direction:column; gap:14px;
    padding:16px; border-left:1px solid rgba(240,237,228,.06);
    background:rgba(12,11,9,.95); overflow-y:auto;
  }

  .cmd-section { display:flex; flex-direction:column; gap:8px; }
  .cmd-header { font-size:8px; font-weight:800; letter-spacing:2px; color:rgba(240,237,228,.3); font-family:var(--fm,'JetBrains Mono',monospace); }

  .cmd-buttons { display:flex; flex-direction:column; gap:6px; }
  .cmd-btn {
    display:flex; align-items:center; gap:10px; padding:12px 16px;
    border:2px solid rgba(240,237,228,.08); border-radius:10px;
    background:rgba(240,237,228,.02); color:rgba(240,237,228,.5);
    font-family:var(--fb,'Space Grotesk',sans-serif); font-size:13px; font-weight:800;
    letter-spacing:3px; cursor:pointer; transition:all .2s; position:relative;
  }
  .cmd-btn:hover { background:rgba(240,237,228,.05); border-color:rgba(240,237,228,.15); }
  .cmd-btn.active { border-color:var(--cmd-color); color:var(--cmd-color); background:color-mix(in srgb, var(--cmd-color) 8%, transparent); box-shadow:0 0 20px color-mix(in srgb, var(--cmd-color) 15%, transparent); }
  .cmd-btn.recommended::before {
    content:''; position:absolute; inset:-2px; border-radius:12px;
    border:1px solid var(--cmd-color); opacity:.3;
    animation:recommendPulse 2s ease-in-out infinite;
  }
  .cmd-icon { font-size:18px; }
  .cmd-star { position:absolute; right:12px; font-size:12px; color:var(--cmd-color); animation:starSpin 3s linear infinite; }

  .rr-section { display:flex; flex-direction:column; gap:4px; }
  .rr-header { font-size:8px; font-weight:800; letter-spacing:2px; color:rgba(240,237,228,.3); font-family:var(--fm,'JetBrains Mono',monospace); }
  .rr-gauge {
    height:8px; background:rgba(240,237,228,.06); border-radius:4px; overflow:hidden;
    position:relative;
  }
  .rr-fill { height:100%; border-radius:4px; transition:width .3s, background .3s; }
  .rr-value {
    position:absolute; right:8px; top:50%; transform:translateY(-50%);
    font-size:14px; font-weight:900; font-family:var(--fm,'JetBrains Mono',monospace);
  }
  .rr-label { font-size:8px; font-weight:700; letter-spacing:1px; font-family:var(--fm,'JetBrains Mono',monospace); }

  .conf-section { display:flex; flex-direction:column; gap:4px; }
  .conf-header { font-size:8px; font-weight:800; letter-spacing:2px; color:rgba(240,237,228,.3); font-family:var(--fm,'JetBrains Mono',monospace); }
  .conf-row { display:flex; align-items:center; gap:8px; }
  .conf-slider { flex:1; -webkit-appearance:none; height:4px; border-radius:2px; background:rgba(240,237,228,.08); outline:none; }
  .conf-slider::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:#E8967D; cursor:pointer; }
  .conf-val { font-size:13px; font-weight:900; color:#E8967D; width:38px; text-align:right; font-family:var(--fm,'JetBrains Mono',monospace); }

  .risk-mini {
    display:flex; flex-direction:column; gap:3px; padding:8px 10px;
    background:rgba(240,237,228,.02); border-radius:6px; border:1px solid rgba(240,237,228,.04);
  }
  .rm-row { display:flex; justify-content:space-between; font-size:9px; font-weight:700; color:rgba(240,237,228,.5); font-family:var(--fm,'JetBrains Mono',monospace); }

  /* ── RAG Hint ── */
  .rag-hint {
    display:flex; align-items:center; gap:8px;
    padding:6px 10px; margin-bottom:6px;
    background:rgba(170,102,255,.06); border:1px solid rgba(170,102,255,.2);
    border-radius:6px; font-family:var(--fm,'JetBrains Mono',monospace);
  }
  .rag-hint.rag-loading { opacity:.5; }
  .rag-icon { font-size:14px; }
  .rag-info { display:flex; flex-direction:column; gap:1px; }
  .rag-count { font-size:8px; color:rgba(240,237,228,.5); letter-spacing:0.5px; }
  .rag-rate { font-size:10px; font-weight:700; color:#aa66ff; }
  .rag-text { font-size:8px; color:rgba(240,237,228,.4); animation:blink 2s ease-in-out infinite; }
  @keyframes blink { 0%,100% { opacity:.3; } 50% { opacity:.8; } }

  .btn-execute {
    width:100%; padding:16px; border:2px solid rgba(240,237,228,.15); border-radius:12px;
    background:rgba(240,237,228,.04); color:#F0EDE4;
    font-family:var(--fb,'Space Grotesk',sans-serif); font-size:15px; font-weight:900;
    letter-spacing:5px; cursor:pointer; transition:all .2s; margin-top:auto;
  }
  .btn-execute.long { border-color:#00ff88; color:#00ff88; background:rgba(0,255,136,.06); }
  .btn-execute.long:hover { background:rgba(0,255,136,.12); box-shadow:0 0 30px rgba(0,255,136,.15); }
  .btn-execute.short { border-color:#ff2d55; color:#ff2d55; background:rgba(255,45,85,.06); }
  .btn-execute.short:hover { background:rgba(255,45,85,.12); box-shadow:0 0 30px rgba(255,45,85,.15); }
  .btn-execute.disabled { opacity:.3; pointer-events:none; }

  /* ═══ AGENT ROW ═══ */
  .agent-row {
    display:flex; justify-content:center; gap:24px; padding:12px 20px 16px;
    border-top:1px solid rgba(240,237,228,.06);
    background:rgba(8,7,5,.95);
    min-height:120px;
  }
  .agent-slot {
    display:flex; flex-direction:column; align-items:center; gap:4px;
    position:relative; width:100px;
  }

  /* Speech Bubble */
  .speech-bubble {
    position:absolute; bottom:calc(100% + 4px); left:50%; transform:translateX(-50%);
    background:rgba(10,9,8,.92); border:1px solid rgba(240,237,228,.12);
    border-radius:8px; padding:5px 8px; max-width:130px; min-width:80px;
    opacity:0; transform:translateX(-50%) translateY(5px) scale(.9);
    transition:all .3s ease; pointer-events:none; z-index:10;
  }
  .speech-bubble.visible {
    opacity:1; transform:translateX(-50%) translateY(0) scale(1);
  }
  .sb-text { font-size:8px; color:rgba(240,237,228,.6); font-family:var(--fm,'JetBrains Mono',monospace); font-style:italic; line-height:1.3; }
  .sb-tail {
    position:absolute; bottom:-5px; left:50%; transform:translateX(-50%);
    width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent;
    border-top:5px solid rgba(240,237,228,.12);
  }

  /* Sprite Container */
  .sprite-container {
    width:56px; height:56px; position:relative; transition:transform .3s;
  }
  .agent-sprite {
    width:56px; height:56px; border-radius:12px; object-fit:cover;
    background:rgba(240,237,228,.04);
    animation:spriteIdle 2.5s ease-in-out infinite;
    transition:box-shadow .3s;
  }

  /* Reactions */
  .sprite-container.agree { animation:celebrate .6s ease; }
  .sprite-container.agree .agent-sprite { box-shadow:0 0 20px rgba(0,255,136,.3); }
  .sprite-container.disagree { animation:disagree .5s ease; }
  .sprite-container.disagree .agent-sprite { box-shadow:0 0 15px rgba(255,45,85,.2); }
  .sprite-container.panic { animation:panic .3s ease infinite; }
  .sprite-container.panic .agent-sprite { box-shadow:0 0 15px rgba(255,45,85,.3); }
  .sprite-container.happy { animation:happy .5s ease; }
  .sprite-container.happy .agent-sprite { box-shadow:0 0 25px rgba(255,215,0,.3); }
  .sprite-container.windup {
    animation:windup .5s ease forwards;
  }
  .sprite-container.dash {
    animation:dashForward .4s ease forwards;
  }

  .sprite-glow {
    position:absolute; inset:-8px; border-radius:20px; opacity:.15; filter:blur(12px);
    animation:glowPulse 1s ease-in-out infinite;
  }
  .charge-glow {
    position:absolute; inset:-10px; border-radius:50%;
    background:radial-gradient(circle, rgba(232,150,125,.3) 0%, transparent 70%);
    animation:chargePulse .4s ease-in-out infinite;
  }

  .agent-label {
    display:flex; align-items:center; gap:3px;
  }
  .al-icon { font-size:12px; }
  .al-name { font-size:8px; font-weight:800; letter-spacing:1px; color:rgba(240,237,228,.5); font-family:var(--fm,'JetBrains Mono',monospace); }
  .al-dir { font-size:10px; font-weight:900; }
  .al-dir.long { color:#00ff88; }
  .al-dir.short { color:#ff2d55; }

  /* ═══ EXECUTE OVERLAY ═══ */
  .execute-overlay {
    position:absolute; inset:0; z-index:100;
    display:flex; align-items:center; justify-content:center;
    pointer-events:none;
  }
  .flash {
    position:absolute; inset:0;
    background:white;
    animation:flashBang .4s ease forwards;
  }
  .battle-stations {
    font-size:42px; font-weight:900; letter-spacing:10px; color:#E8967D;
    font-family:var(--fb,'Space Grotesk',sans-serif);
    text-shadow:0 0 40px rgba(232,150,125,.5);
    animation:stationsIn .5s ease forwards;
  }
  .blackout {
    position:absolute; inset:0;
    background:#000;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px;
    animation:blackoutIn .4s ease forwards;
  }
  .bo-price { font-size:28px; font-weight:900; color:#F0EDE4; font-family:var(--fm,'JetBrains Mono',monospace); font-variant-numeric:tabular-nums; }
  .bo-dir { font-size:16px; font-weight:900; letter-spacing:6px; font-family:var(--fb,'Space Grotesk',sans-serif); }
  .bo-dir.long { color:#00ff88; }
  .bo-dir.short { color:#ff2d55; }

  /* ═══ ANIMATIONS ═══ */
  @keyframes spriteIdle {
    0%,100% { transform:translateY(0) scale(1); }
    50% { transform:translateY(-2px) scale(1.01); }
  }
  @keyframes celebrate {
    0% { transform:translateY(0) scale(1); }
    30% { transform:translateY(-18px) scale(1.12); }
    60% { transform:translateY(-5px) scale(1.05); }
    100% { transform:translateY(0) scale(1); }
  }
  @keyframes disagree {
    0%,100% { transform:rotate(0deg); }
    20% { transform:rotate(-10deg); }
    40% { transform:rotate(10deg); }
    60% { transform:rotate(-6deg); }
    80% { transform:rotate(6deg); }
  }
  @keyframes panic {
    0%,100% { transform:translateX(0); }
    25% { transform:translateX(-3px) translateY(-1px); }
    75% { transform:translateX(3px) translateY(-1px); }
  }
  @keyframes happy {
    0% { transform:scale(1); }
    30% { transform:scale(1.15) rotate(3deg); }
    60% { transform:scale(1.08) rotate(-2deg); }
    100% { transform:scale(1) rotate(0deg); }
  }
  @keyframes windup {
    0% { transform:scale(1) translateY(0); }
    100% { transform:scale(.85) translateY(8px); }
  }
  @keyframes dashForward {
    0% { transform:scale(.85) translateY(8px); }
    40% { transform:scale(1.2) translateY(-20px); }
    100% { transform:scale(1) translateY(-40px); opacity:0; }
  }
  @keyframes glowPulse {
    0%,100% { opacity:.1; }
    50% { opacity:.25; }
  }
  @keyframes chargePulse {
    0%,100% { transform:scale(.8); opacity:.3; }
    50% { transform:scale(1.3); opacity:.6; }
  }
  @keyframes flashBang {
    0% { opacity:0; }
    20% { opacity:.9; }
    100% { opacity:0; }
  }
  @keyframes stationsIn {
    from { transform:scale(3); opacity:0; }
    to { transform:scale(1); opacity:1; }
  }
  @keyframes blackoutIn {
    from { opacity:0; }
    to { opacity:1; }
  }
  @keyframes recommendPulse {
    0%,100% { opacity:.2; transform:scale(1); }
    50% { opacity:.5; transform:scale(1.02); }
  }
  @keyframes starSpin {
    from { transform:rotate(0deg); }
    to { transform:rotate(360deg); }
  }
  @keyframes blink {
    0%,100% { opacity:.3; }
    50% { opacity:.8; }
  }
</style>
