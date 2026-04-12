<script lang="ts">
  import { timeSince } from '$lib/utils/time';
  import { CHARACTER_ART } from '$lib/data/agents';
  import { AGENT_POOL } from '$lib/engine/agents';
  import type { AgentId } from '$lib/engine/types';
  import { agentStats, hydrateAgentStats } from '$lib/stores/agentData';
  import { matchHistoryStore } from '$lib/stores/matchHistoryStore';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import EmptyState from '../shared/EmptyState.svelte';

  export let embedded = false;

  type SortBy = 'wilson' | 'accuracy' | 'sample' | 'calibration';
  type Period = '7d' | '30d' | 'all';
  type VoteSnapshot = {
    matchN: number;
    dir: string;
    conf: number;
    win: boolean;
    timestamp: number;
    pair: string;
  };
  type OracleRow = {
    agentId: string;
    engineId: AgentId;
    name: string;
    nameKR: string;
    icon: string;
    color: string;
    role: string;
    specialty: string[];
    finding: { title: string; detail: string };
    abilities: Record<string, number>;
    level: number;
    xp: number;
    sample: number;
    wins: number;
    losses: number;
    accuracy: number;
    wilson: number;
    ciLow: number;
    ciHigh: number;
    calibration: number;
    spec: string;
    recentVotes: VoteSnapshot[];
  };

  $: stats = $agentStats;
  $: records = $matchHistoryStore.records;

  let sortBy: SortBy = 'wilson';
  let period: Period = 'all';
  let selectedAgent: OracleRow | null = null;

  function inferMarketDirection(record: (typeof records)[number]): 'LONG' | 'SHORT' | null {
    const userDir = String(record.hypothesis?.dir || '').toUpperCase();
    if (userDir !== 'LONG' && userDir !== 'SHORT') return null;
    if (record.win) return userDir as 'LONG' | 'SHORT';
    return userDir === 'LONG' ? 'SHORT' : 'LONG';
  }

  function wilsonInterval(wins: number, total: number, z = 1.96) {
    if (total <= 0) return { lower: 0, upper: 0 };
    const p = wins / total;
    const z2 = z * z;
    const denom = 1 + z2 / total;
    const center = (p + z2 / (2 * total)) / denom;
    const margin = (z / denom) * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
    return {
      lower: Math.max(0, center - margin),
      upper: Math.min(1, center + margin)
    };
  }

  $: filteredRecords = (() => {
    const now = Date.now();
    if (period === '7d') return records.filter((r) => now - r.timestamp < 7 * 86400000);
    if (period === '30d') return records.filter((r) => now - r.timestamp < 30 * 86400000);
    return records;
  })();

  $: oracleData = (Object.values(AGENT_POOL) as Array<(typeof AGENT_POOL)[AgentId]>).map((agent) => {
    const statKey = agent.id.toLowerCase();
    const s = stats[statKey] || { level: 1, xp: 0 };
    let wins = 0;
    let total = 0;
    let calibrationErrorSum = 0;
    let recentVotes: VoteSnapshot[] = [];

    for (const r of filteredRecords) {
      if (!r.agentVotes || r.agentVotes.length === 0) continue;
      const vote = r.agentVotes.find((v) => String(v.agentId).toUpperCase() === agent.id);
      if (!vote) continue;

      const marketDir = inferMarketDirection(r);
      if (!marketDir) continue;

      total++;
      const voteDir = String(vote.dir).toUpperCase();
      const agentWon = voteDir === marketDir;
      if (agentWon) wins++;

      const conf = Number(vote.conf || 0);
      const p = Math.max(0, Math.min(1, conf / 100));
      calibrationErrorSum += Math.abs(p - (agentWon ? 1 : 0));

      recentVotes.push({
        matchN: r.matchN,
        dir: voteDir,
        conf,
        win: agentWon,
        timestamp: r.timestamp,
        pair: String((r as any).pair || '—')
      });
    }

    const accuracy = total > 0 ? Math.round((wins / total) * 100) : 0;
    const ci = wilsonInterval(wins, total);
    const calibration = total > 0 ? Math.round((1 - calibrationErrorSum / total) * 100) : 0;

    return {
      agentId: statKey,
      engineId: agent.id,
      name: agent.name,
      nameKR: agent.nameKR,
      icon: agent.icon,
      color: agent.color,
      role: agent.role,
      specialty: agent.factors.slice(0, 3).map((f) => f.name),
      finding: {
        title: `${agent.name} Signal Model`,
        detail: agent.descriptionKR
      },
      abilities: {
        analysis: 70,
        accuracy: Math.max(35, accuracy),
        speed: 65,
        instinct: 60
      },
      level: s.level || 1,
      xp: s.xp || 0,
      sample: total,
      wins,
      losses: total - wins,
      accuracy,
      wilson: Math.round(ci.lower * 100),
      ciLow: Math.round(ci.lower * 100),
      ciHigh: Math.round(ci.upper * 100),
      calibration,
      spec: 'BASE',
      recentVotes: recentVotes.slice(0, 8),
    } satisfies OracleRow;
  }).sort((a, b) => {
    if (sortBy === 'wilson') return b.wilson - a.wilson;
    if (sortBy === 'accuracy') return b.accuracy - a.accuracy;
    if (sortBy === 'sample') return b.sample - a.sample;
    if (sortBy === 'calibration') return b.calibration - a.calibration;
    return b.wilson - a.wilson;
  });

  $: consistentRows = oracleData.filter((row) => row.sample >= 5 && row.wilson >= 55);

  function selectAgent(ag: OracleRow) {
    selectedAgent = ag;
  }

  function triggerArena() {
    goto('/arena');
  }

  onMount(() => {
    hydrateAgentStats();
  });
</script>

<div class="oracle-board" class:embedded>
  {#if !embedded}
    <div class="oracle-header">
      <div class="oh-bg"></div>
      <div class="oh-content">
        <h1 class="oh-title">ORACLE</h1>
        <p class="oh-sub">8-agent Wilson leaderboard from Arena match outcomes</p>
        <div class="oh-stats">
          <span class="oh-stat">{filteredRecords.length} MATCHES</span>
          <span class="oh-stat">{consistentRows.length} CONSISTENT (N≥5)</span>
        </div>
      </div>
    </div>
  {:else}
    <div class="oracle-embedded-head">
      <div>
        <div class="oe-title">ORACLE LEADERBOARD</div>
        <div class="oe-sub">Arena results based Wilson ranking</div>
      </div>
      <div class="oe-stats">
        <span class="oe-pill">{filteredRecords.length} MATCHES</span>
        <span class="oe-pill">{consistentRows.length} CONSISTENT</span>
      </div>
    </div>
  {/if}

  <div class="control-bar">
    <div class="control-group">
      <span class="ctrl-label">PERIOD:</span>
      {#each [['7d', '7D'], ['30d', '30D'], ['all', 'ALL']] as [key, label]}
        <button class="ctrl-btn" class:active={period === key} on:click={() => period = key as typeof period}>{label}</button>
      {/each}
    </div>
    <div class="control-group">
      <span class="ctrl-label">SORT:</span>
      {#each [['wilson', 'WILSON'], ['accuracy', 'ACCURACY'], ['sample', 'SAMPLE'], ['calibration', 'CALIBRATION']] as [key, label]}
        <button class="ctrl-btn" class:active={sortBy === key} on:click={() => sortBy = key as SortBy}>{label}</button>
      {/each}
    </div>
  </div>

  {#if filteredRecords.length === 0 && records.length === 0}
    <EmptyState
      image={CHARACTER_ART.spriteActions}
      title="NO MATCH DATA YET"
      subtitle="Agent accuracy is calculated from Arena battles. Start your first match!"
      ctaText="⚔️ START ARENA BATTLE"
      ctaHref="/arena"
      icon="🔮"
      variant="purple"
    />
  {:else}
    <div class="oracle-table">
      <div class="ot-header">
        <span class="ot-rank">#</span>
        <span class="ot-agent">AGENT</span>
        <span class="ot-col">WILSON</span>
        <span class="ot-col">ACCURACY</span>
        <span class="ot-col">95% CI</span>
        <span class="ot-col">SAMPLE</span>
        <span class="ot-col">LEVEL</span>
        <span class="ot-col">SPECIALTY</span>
        <span class="ot-col">CALIBRATION</span>
      </div>
      {#each oracleData as ag, i}
        <button class="ot-row" on:click={() => selectAgent(ag)}>
          <span class="ot-rank rank-{i+1}">{i+1}</span>
          <div class="ot-agent">
            <span class="ot-icon">{ag.icon}</span>
            <div>
              <div class="ot-name" style="color:{ag.color}">{ag.name} [{ag.spec}]</div>
              <div class="ot-role">{ag.nameKR} · {ag.role}</div>
            </div>
          </div>
          <span class="ot-col ot-accuracy" style="color:{ag.wilson >= 60 ? 'var(--grn)' : ag.wilson >= 50 ? 'var(--yel)' : 'var(--red)'}">
            {ag.wilson}%
          </span>
          <span class="ot-col ot-accuracy" style="color:{ag.accuracy >= 70 ? 'var(--grn)' : ag.accuracy >= 50 ? 'var(--yel)' : 'var(--red)'}">
            {ag.accuracy}%
          </span>
          <span class="ot-col ot-wl">{ag.ciLow}-{ag.ciHigh}</span>
          <span class="ot-col ot-wl">{ag.sample}</span>
          <span class="ot-col ot-level">Lv.{ag.level}</span>
          <span class="ot-col ot-spec">{ag.specialty[0]}</span>
          <div class="ot-col ot-cal-wrap">
            <div class="cal-bar"><div class="cal-fill" style="width:{ag.calibration}%"></div></div>
            <span class="cal-num">{ag.calibration}%</span>
          </div>
        </button>
      {/each}
    </div>
  {/if}

  {#if selectedAgent}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="agent-detail-overlay" on:click={() => selectedAgent = null}>
      <div class="agent-detail" on:click|stopPropagation>
        <button class="close-btn" on:click={() => selectedAgent = null}>✕</button>
        <div class="ad-header" style="border-color:{selectedAgent.color}">
          <div class="ot-icon" style="font-size:32px">{selectedAgent.icon}</div>
          <div class="ad-info">
            <div class="ad-name" style="color:{selectedAgent.color}">{selectedAgent.name} [{selectedAgent.spec}]</div>
            <div class="ad-role">{selectedAgent.nameKR} · {selectedAgent.role}</div>
            <div class="ad-accuracy" style="color:{selectedAgent.accuracy >= 70 ? 'var(--grn)' : 'var(--yel)'}">
              Wilson {selectedAgent.wilson}% · Accuracy {selectedAgent.accuracy}% · {selectedAgent.sample} matches
            </div>
          </div>
        </div>

        {#if selectedAgent.recentVotes.length > 0}
          <div class="ad-section">
            <div class="ab-title">RECENT VOTES ({selectedAgent.recentVotes.length})</div>
            {#each selectedAgent.recentVotes as vote}
              <div class="vote-row" class:win={vote.win} class:loss={!vote.win}>
                <span class="vr-match">#{vote.matchN}</span>
                <span class="vr-dir" class:long={vote.dir === 'LONG'} class:short={vote.dir === 'SHORT'}>{vote.dir}</span>
                <span class="vr-conf">{vote.conf}%</span>
                <span class="vr-result" class:win={vote.win}>{vote.win ? '✓ WIN' : '✗ LOSS'}</span>
                <span class="vr-time">{timeSince(vote.timestamp)}</span>
              </div>
            {/each}
          </div>
        {/if}

        <div class="ad-abilities">
          <div class="ab-title">ABILITIES</div>
          {#each Object.entries(selectedAgent.abilities) as [key, val]}
            <div class="ab-row">
              <span class="ab-label">{key.toUpperCase()}</span>
              <div class="ab-bar"><div class="ab-fill" style="width:{val}%;background:{selectedAgent.color}"></div></div>
              <span class="ab-val">{val}</span>
            </div>
          {/each}
        </div>

        <div class="ad-finding">
          <div class="ab-title">LATEST FINDING</div>
          <div class="finding-card" style="border-color:{selectedAgent.color}">
            <div class="fc-title">{selectedAgent.finding.title}</div>
            <div class="fc-detail">{selectedAgent.finding.detail}</div>
          </div>
        </div>

        <div class="ad-specialties">
          <div class="ab-title">SPECIALTIES</div>
          <div class="spec-tags">
            {#each selectedAgent.specialty as spec}
              <span class="spec-tag" style="border-color:{selectedAgent.color};color:{selectedAgent.color}">{spec}</span>
            {/each}
          </div>
        </div>

        <button class="ad-arena-btn" on:click={triggerArena}>
          DEPLOY TO ARENA
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .oracle-board {
    background: linear-gradient(180deg, #1a0a2e, #0a0a1a);
  }
  .oracle-board.embedded {
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.08);
    overflow: hidden;
    margin: 10px 16px 16px;
    background: linear-gradient(180deg, #150b26, #090914);
    box-shadow: 0 12px 28px rgba(0,0,0,.28);
  }

  .oracle-header {
    position: relative;
    padding: 20px 24px;
    border-bottom: 4px solid #000;
    background: linear-gradient(135deg, #8b5cf6, #c840ff);
    overflow: hidden;
  }
  .oracle-header::after {
    content: '';
    position: absolute;
    right: -5px;
    bottom: -5px;
    width: 100px;
    height: 100px;
    background: url('/doge/action-portal.png') center/cover no-repeat;
    opacity: .15;
    border-radius: 12px 0 0 0;
    pointer-events: none;
  }
  .oh-bg { position: absolute; inset: 0; background: radial-gradient(circle at 20% 50%, rgba(255,255,255,.15), transparent 60%); }
  .oh-content { position: relative; z-index: 2; }
  .oh-title {
    font-family: var(--fc);
    font-size: 28px;
    color: #fff;
    -webkit-text-stroke: 1px #000;
    text-shadow: 3px 3px 0 rgba(0,0,0,.3);
    letter-spacing: 3px;
  }
  .oh-sub {
    font-family: var(--fm);
    font-size: 9px;
    color: rgba(255,255,255,.7);
    letter-spacing: 2px;
    margin-top: 2px;
  }
  .oh-stats { display: flex; gap: 8px; margin-top: 6px; }
  .oh-stat {
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 1.5px;
    background: rgba(0,0,0,.4);
    color: #fff;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .oracle-embedded-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 10px;
    padding: 12px 14px 10px;
    border-bottom: 1px solid rgba(255,255,255,.08);
    background: linear-gradient(120deg, rgba(139,92,246,.22), rgba(47,22,73,.8));
  }
  .oe-title {
    font-family: var(--fd);
    font-size: 14px;
    letter-spacing: 1.5px;
    color: #f0e5ff;
  }
  .oe-sub {
    font-family: var(--fm);
    font-size: 8px;
    color: rgba(255,255,255,.62);
    margin-top: 3px;
    letter-spacing: .8px;
  }
  .oe-stats {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .oe-pill {
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: .9px;
    padding: 2px 6px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,.2);
    color: rgba(255,255,255,.85);
    background: rgba(0,0,0,.28);
  }

  .control-bar {
    display: flex;
    gap: 16px;
    padding: 8px 16px;
    border-bottom: 2px solid rgba(255,255,255,.05);
    flex-wrap: wrap;
  }
  .control-group { display: flex; align-items: center; gap: 4px; }
  .ctrl-label {
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 2px;
    color: rgba(255,255,255,.3);
  }
  .ctrl-btn {
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 1px;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1.5px solid rgba(255,255,255,.1);
    background: rgba(255,255,255,.03);
    color: rgba(255,255,255,.4);
    cursor: pointer;
    transition: all .15s;
  }
  .ctrl-btn.active {
    background: var(--pk);
    color: #fff;
    border-color: var(--pk);
    box-shadow: 0 0 8px rgba(255,45,155,.3);
  }

  .oracle-table { padding: 0 16px 16px; }
  .ot-header {
    display: grid;
    grid-template-columns: 30px 1.5fr .75fr .75fr .75fr .6fr .6fr 1.2fr 1fr;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 2px solid rgba(139,92,246,.3);
    font-family: var(--fd);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 2px;
    color: rgba(255,255,255,.3);
  }
  .ot-row {
    display: grid;
    grid-template-columns: 30px 1.5fr .75fr .75fr .75fr .6fr .6fr 1.2fr 1fr;
    gap: 6px;
    align-items: center;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255,255,255,.04);
    cursor: pointer;
    transition: background .15s;
    background: none;
    border-left: none;
    border-right: none;
    border-top: none;
    width: 100%;
    text-align: left;
  }
  .ot-row:hover { background: rgba(139,92,246,.06); }
  .ot-rank { font-family: var(--fd); font-size: 14px; font-weight: 900; color: rgba(255,255,255,.3); text-align: center; }
  .rank-1 { color: #ffd060; }
  .rank-2 { color: #c0c0c0; }
  .rank-3 { color: #cd7f32; }
  .ot-agent { display: flex; align-items: center; gap: 6px; }
  .ot-icon { font-size: 18px; }
  .ot-name { font-family: var(--fm); font-size: 9px; font-weight: 900; letter-spacing: 1px; }
  .ot-role { font-family: var(--fm); font-size: 6px; color: rgba(255,255,255,.3); }
  .ot-col { font-family: var(--fm); font-size: 9px; color: rgba(255,255,255,.6); }
  .ot-accuracy { font-weight: 900; font-family: var(--fd); }
  .ot-wl { font-family: var(--fd); font-size: 10px; font-weight: 900; }
  .ot-level { color: var(--pk); font-weight: 700; }
  .ot-spec { font-size: 7px; color: rgba(255,255,255,.3); }
  .ot-cal-wrap { display: flex; align-items: center; gap: 4px; }
  .cal-bar { flex: 1; height: 4px; background: rgba(255,255,255,.06); border-radius: 2px; }
  .cal-fill { height: 100%; background: var(--pur); border-radius: 2px; transition: width .5s; }
  .cal-num { font-size: 8px; font-weight: 700; color: var(--pur); min-width: 28px; }

  .agent-detail-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0,0,0,.6);
    display: flex;
    justify-content: flex-end;
  }
  .agent-detail {
    width: 380px;
    background: #111;
    border-left: 4px solid #000;
    padding: 16px;
    overflow-y: auto;
    animation: slideInRight .3s ease;
    position: relative;
  }
  @keyframes slideInRight {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  .close-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,.2);
    background: rgba(255,255,255,.05);
    color: #fff;
    font-size: 11px;
    cursor: pointer;
  }
  .ad-header { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; border-bottom: 3px solid; margin-bottom: 12px; }
  .ad-info { flex: 1; }
  .ad-name { font-family: var(--fc); font-size: 18px; letter-spacing: 2px; }
  .ad-role { font-family: var(--fm); font-size: 8px; color: rgba(255,255,255,.4); }
  .ad-accuracy { font-family: var(--fd); font-size: 10px; font-weight: 900; margin-top: 2px; }

  .ad-section { margin-bottom: 12px; }
  .vote-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 4px;
    border-bottom: 1px solid rgba(255,255,255,.04);
    font-family: var(--fm);
    font-size: 8px;
  }
  .vote-row.win { border-left: 2px solid var(--grn); }
  .vote-row.loss { border-left: 2px solid var(--red); }
  .vr-match { color: rgba(255,255,255,.4); font-weight: 700; }
  .vr-dir { font-weight: 900; padding: 1px 4px; border: 1px solid; border-radius: 3px; font-size: 7px; }
  .vr-dir.long { color: var(--grn); border-color: rgba(0,255,136,.3); }
  .vr-dir.short { color: var(--red); border-color: rgba(255,45,85,.3); }
  .vr-conf { color: var(--yel); font-weight: 700; }
  .vr-result { font-weight: 900; }
  .vr-result.win { color: var(--grn); }
  .vr-result:not(.win) { color: var(--red); }
  .vr-time { color: rgba(255,255,255,.2); margin-left: auto; font-size: 7px; }

  .ab-title { font-family: var(--fd); font-size: 8px; font-weight: 900; letter-spacing: 2px; color: rgba(255,255,255,.4); margin-bottom: 4px; }
  .ad-abilities { margin-bottom: 12px; }
  .ab-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
  .ab-label { font-family: var(--fm); font-size: 7px; font-weight: 700; color: rgba(255,255,255,.3); width: 55px; letter-spacing: 1px; }
  .ab-bar { flex: 1; height: 4px; background: rgba(255,255,255,.06); border-radius: 2px; }
  .ab-fill { height: 100%; border-radius: 2px; transition: width .5s; }
  .ab-val { font-family: var(--fm); font-size: 8px; font-weight: 900; color: rgba(255,255,255,.5); width: 22px; text-align: right; }

  .ad-finding { margin-bottom: 12px; }
  .finding-card { border: 2px solid; border-radius: 8px; padding: 8px; background: rgba(255,255,255,.03); }
  .fc-title { font-family: var(--fm); font-size: 9px; font-weight: 900; color: #fff; margin-bottom: 2px; }
  .fc-detail { font-family: var(--fm); font-size: 7px; color: rgba(255,255,255,.5); line-height: 1.4; }

  .ad-specialties { margin-bottom: 14px; }
  .spec-tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .spec-tag { font-family: var(--fm); font-size: 7px; font-weight: 700; padding: 2px 6px; border: 1.5px solid; border-radius: 6px; background: rgba(255,255,255,.03); }

  .ad-arena-btn {
    width: 100%;
    padding: 10px;
    font-family: var(--fc);
    font-size: 14px;
    letter-spacing: 3px;
    color: #fff;
    background: linear-gradient(135deg, #ff2d9b, #ff0066);
    border: 3px solid #000;
    border-radius: 10px;
    box-shadow: 3px 3px 0 #000;
    cursor: pointer;
    transition: all .15s;
    -webkit-text-stroke: .5px #000;
  }
  .ad-arena-btn:hover { transform: translate(-2px, -2px); box-shadow: 5px 5px 0 #000; }

  @media (max-width: 1024px) {
    .ot-header,
    .ot-row {
      grid-template-columns: 26px 1.4fr .9fr .9fr .95fr .65fr;
    }
    .ot-header .ot-col:nth-child(8),
    .ot-header .ot-col:nth-child(9),
    .ot-row .ot-col:nth-child(8),
    .ot-row .ot-col:nth-child(9) {
      display: none;
    }
  }

  @media (max-width: 768px) {
    .oracle-board.embedded {
      margin: 8px 12px 14px;
    }
    .control-bar {
      padding: 8px 10px;
      gap: 10px;
    }
    .oracle-table {
      padding: 0 10px 12px;
      overflow-x: auto;
    }
    .ot-header,
    .ot-row {
      min-width: 620px;
    }
    .agent-detail {
      width: min(100%, 390px);
    }
  }
</style>
