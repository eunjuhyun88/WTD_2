<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { matchRecords, winRate, avgLP, bestStreak } from '$lib/stores/matchHistoryStore';

  interface Props {
    visible?: boolean;
    onclose?: () => void;
  }
  let {
    visible = false,
    onclose,
  }: Props = $props();

  // Expanded row tracking
  let expandedId: string | null = $state(null);

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="mh-overlay" onclick={() => onclose?.()}>
    <div class="mh-panel" onclick={(e) => e.stopPropagation()}>
      <div class="mh-header">
        <span class="mh-title">MATCH HISTORY</span>
        <span class="mh-stats">{$gameState.wins}W - {$gameState.losses}L</span>
        <button class="mh-close" onclick={() => onclose?.()}>✕</button>
      </div>

      <!-- Summary Stats -->
      <div class="mh-summary">
        <div class="sum-stat">
          <span class="sum-val" style="color:{$winRate >= 50 ? '#00cc66' : '#ff2d55'}">{$winRate}%</span>
          <span class="sum-label">WIN RATE</span>
        </div>
        <div class="sum-stat">
          <span class="sum-val" style="color:{$avgLP >= 0 ? '#00cc66' : '#ff2d55'}">{$avgLP >= 0 ? '+' : ''}{$avgLP}</span>
          <span class="sum-label">AVG LP</span>
        </div>
        <div class="sum-stat">
          <span class="sum-val" style="color:#e8967d">{$bestStreak}</span>
          <span class="sum-label">BEST STREAK</span>
        </div>
      </div>

      <div class="mh-list">
        {#if $matchRecords.length === 0}
          <div class="mh-empty">No matches yet. Start your first battle!</div>
        {:else}
          {#each $matchRecords as match (match.id)}
            <button class="mh-row" class:win={match.win} class:loss={!match.win} onclick={() => toggleExpand(match.id)}>
              <span class="mh-id">M{match.matchN}</span>
              <span class="mh-result-badge" class:w={match.win} class:l={!match.win}>{match.win ? 'WIN' : 'LOSE'}</span>
              <span class="mh-lp" class:pos={match.lp > 0} class:neg={match.lp < 0}>
                {match.lp > 0 ? '+' : ''}{match.lp} LP
              </span>
              {#if match.streak >= 3}<span class="mh-streak">🔥{match.streak}</span>{/if}
              <span class="mh-time">{timeAgo(match.timestamp)}</span>
              <span class="mh-arrow">{expandedId === match.id ? '▲' : '▼'}</span>
            </button>

            <!-- Expanded Details -->
            {#if expandedId === match.id}
              <div class="mh-detail">
                <!-- Hypothesis -->
                {#if match.hypothesis}
                  <div class="mhd-section">
                    <span class="mhd-label">YOUR CALL</span>
                    <div class="mhd-hypo">
                      <span class="mhd-dir {match.hypothesis.dir.toLowerCase()}">{match.hypothesis.dir}</span>
                      <span class="mhd-levels">
                        Entry ${Math.round(match.hypothesis.entry).toLocaleString()} ·
                        TP ${Math.round(match.hypothesis.tp).toLocaleString()} ·
                        SL ${Math.round(match.hypothesis.sl).toLocaleString()}
                      </span>
                      <span class="mhd-rr">R:R 1:{match.hypothesis.rr.toFixed(1)}</span>
                    </div>
                  </div>
                {/if}

                <!-- Agent Votes -->
                <div class="mhd-section">
                  <span class="mhd-label">AGENT COUNCIL</span>
                  <div class="mhd-votes">
                    {#each match.agentVotes as vote}
                      <div class="mhd-vote">
                        <span class="mhd-vote-icon" style="color:{vote.color}">{vote.icon}</span>
                        <span class="mhd-vote-name">{vote.name}</span>
                        <span class="mhd-vote-dir {vote.dir.toLowerCase()}">{vote.dir}</span>
                        <span class="mhd-vote-conf">{vote.conf}%</span>
                      </div>
                    {/each}
                  </div>
                </div>

                <!-- Consensus -->
                {#if match.consensusType}
                  <div class="mhd-consensus">
                    <span class="mhd-cons-badge {match.consensusType}">{match.consensusType.toUpperCase()}</span>
                    <span class="mhd-cons-mult">x{match.lpMult}</span>
                  </div>
                {/if}

                <!-- Result tag -->
                {#if match.battleResult}
                  <div class="mhd-result-tag">{match.battleResult.toUpperCase()}</div>
                {/if}
              </div>
            {/if}
          {/each}
        {/if}
      </div>

      <div class="mh-footer">
        <span>Total LP: <b>{$gameState.lp.toLocaleString()}</b></span>
        <span>🔥 Streak: <b>{$gameState.streak}</b></span>
        <span>Matches: <b>{$matchRecords.length}</b></span>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ═══ MatchHistory — Dark Arena Theme ═══ */
  .mh-overlay {
    position: absolute;
    inset: 0;
    z-index: 60;
    background: rgba(0,0,0,.55);
    display: flex;
    justify-content: flex-end;
  }

  .mh-panel {
    width: 340px;
    height: 100%;
    background: #08130d;
    border-left: 1px solid rgba(232,150,125,.3);
    display: flex;
    flex-direction: column;
    animation: mhSlideIn .25s ease;
    color: #f0ede4;
  }
  @keyframes mhSlideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .mh-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    background: linear-gradient(90deg, rgba(232,150,125,.15), rgba(232,150,125,.06));
    border-bottom: 1px solid rgba(232,150,125,.25);
    color: #f0ede4;
    flex-shrink: 0;
  }
  .mh-title {
    font-family: var(--fd);
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 2px;
    color: #e8967d;
  }
  .mh-stats {
    font-family: var(--fm);
    font-size: 9px;
    font-weight: 700;
    margin-left: auto;
    color: rgba(240,237,228,.6);
  }
  .mh-close {
    width: 22px; height: 22px;
    border: 1px solid rgba(240,237,228,.2);
    border-radius: 6px;
    background: rgba(10,26,18,.6);
    cursor: pointer;
    font-size: 10px;
    color: #f0ede4;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mh-close:hover { background: rgba(255,94,122,.2); border-color: rgba(255,94,122,.4); color: #ff5e7a; }

  /* Summary Stats */
  .mh-summary {
    display: flex;
    padding: 10px 14px;
    gap: 8px;
    border-bottom: 1px solid rgba(232,150,125,.12);
    flex-shrink: 0;
  }
  .sum-stat {
    flex: 1;
    text-align: center;
    padding: 6px 4px;
    background: rgba(10,26,18,.6);
    border-radius: 8px;
    border: 1px solid rgba(240,237,228,.08);
  }
  .sum-val {
    font-family: var(--fd);
    font-size: 14px;
    font-weight: 900;
    display: block;
  }
  .sum-label {
    font-family: var(--fm);
    font-size: 6px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: rgba(240,237,228,.4);
    display: block;
    margin-top: 2px;
  }

  .mh-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  .mh-list::-webkit-scrollbar { width: 3px; }
  .mh-list::-webkit-scrollbar-thumb { background: rgba(232,150,125,.2); border-radius: 3px; }

  .mh-empty {
    text-align: center;
    padding: 30px;
    color: rgba(240,237,228,.35);
    font-family: var(--fm);
    font-size: 10px;
  }

  .mh-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 8px;
    margin-bottom: 2px;
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 600;
    transition: background .15s;
    cursor: pointer;
    width: 100%;
    background: none;
    border: none;
    color: #f0ede4;
    text-align: left;
  }
  .mh-row:hover { background: rgba(232,150,125,.06); }
  .mh-row.win { border-left: 2px solid #00cc88; }
  .mh-row.loss { border-left: 2px solid #ff5e7a; }

  .mh-id { color: rgba(240,237,228,.35); font-size: 7px; width: 28px; font-weight: 700; }
  .mh-result-badge {
    font-size: 6px; font-weight: 900; padding: 1px 6px;
    border-radius: 4px; letter-spacing: 1px;
  }
  .mh-result-badge.w { background: rgba(0,204,136,.2); color: #00cc88; }
  .mh-result-badge.l { background: rgba(255,94,122,.2); color: #ff5e7a; }
  .mh-lp { font-weight: 800; }
  .mh-lp.pos { color: #00cc88; }
  .mh-lp.neg { color: #ff5e7a; }
  .mh-streak { font-size: 7px; }
  .mh-time { color: rgba(240,237,228,.35); font-size: 7px; margin-left: auto; }
  .mh-arrow { color: rgba(240,237,228,.35); font-size: 7px; }

  /* Expanded Detail */
  .mh-detail {
    background: rgba(10,26,18,.7);
    border: 1px solid rgba(232,150,125,.1);
    border-radius: 8px;
    padding: 8px 10px;
    margin-bottom: 4px;
    animation: detailSlide .2s ease;
  }
  @keyframes detailSlide {
    from { opacity: 0; max-height: 0; }
    to { opacity: 1; max-height: 200px; }
  }

  .mhd-section { margin-bottom: 6px; }
  .mhd-label {
    font-family: var(--fd);
    font-size: 6px;
    font-weight: 900;
    letter-spacing: 2px;
    color: rgba(240,237,228,.4);
    display: block;
    margin-bottom: 3px;
  }
  .mhd-hypo {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .mhd-dir {
    font-family: var(--fd);
    font-size: 9px;
    font-weight: 900;
    padding: 1px 6px;
    border-radius: 4px;
    letter-spacing: 1px;
  }
  .mhd-dir.long { background: rgba(0,204,136,.15); color: #00cc88; }
  .mhd-dir.short { background: rgba(255,94,122,.15); color: #ff5e7a; }
  .mhd-dir.neutral { background: rgba(232,150,125,.15); color: #e8967d; }
  .mhd-levels {
    font-family: var(--fm);
    font-size: 7px;
    color: rgba(240,237,228,.5);
  }
  .mhd-rr {
    font-family: var(--fd);
    font-size: 7px;
    font-weight: 900;
    color: #e8967d;
    background: rgba(232,150,125,.1);
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid rgba(232,150,125,.2);
  }

  .mhd-votes {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .mhd-vote {
    display: flex;
    align-items: center;
    gap: 3px;
    background: rgba(240,237,228,.04);
    border-radius: 4px;
    padding: 2px 5px;
    font-size: 7px;
    font-family: var(--fm);
  }
  .mhd-vote-icon { font-size: 8px; }
  .mhd-vote-name { font-weight: 700; color: rgba(240,237,228,.6); }
  .mhd-vote-dir {
    font-weight: 900;
    font-size: 6px;
    padding: 0 3px;
    border-radius: 3px;
  }
  .mhd-vote-dir.long { background: rgba(0,204,136,.15); color: #00cc88; }
  .mhd-vote-dir.short { background: rgba(255,94,122,.15); color: #ff5e7a; }
  .mhd-vote-conf { color: rgba(240,237,228,.35); font-size: 6px; }

  .mhd-consensus {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .mhd-cons-badge {
    font-family: var(--fd);
    font-size: 7px;
    font-weight: 900;
    padding: 2px 8px;
    border-radius: 4px;
    letter-spacing: 1px;
  }
  .mhd-cons-badge.consensus { background: rgba(0,204,136,.2); color: #00cc88; }
  .mhd-cons-badge.partial { background: rgba(232,150,125,.2); color: #e8967d; }
  .mhd-cons-badge.dissent { background: rgba(255,94,122,.2); color: #ff5e7a; }
  .mhd-cons-badge.override { background: rgba(168,64,255,.2); color: #c880ff; }
  .mhd-cons-mult {
    font-family: var(--fd);
    font-size: 8px;
    font-weight: 900;
    color: #e8967d;
  }

  .mhd-result-tag {
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 700;
    color: rgba(240,237,228,.4);
    text-align: center;
    letter-spacing: 1px;
  }

  .mh-footer {
    padding: 8px 14px;
    border-top: 1px solid rgba(232,150,125,.15);
    display: flex;
    gap: 16px;
    font-family: var(--fm);
    font-size: 9px;
    color: rgba(240,237,228,.5);
    flex-shrink: 0;
  }
  .mh-footer b { color: #e8967d; }
</style>
