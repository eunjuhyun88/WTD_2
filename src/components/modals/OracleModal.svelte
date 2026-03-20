<script lang="ts">
  import { AGDEFS } from '$lib/data/agents';
  import { agentStats, getWinRate } from '$lib/stores/agentData';

  export let onClose: () => void = () => {};

  let stats = $agentStats;
  $: stats = $agentStats;

  let activeTab = 'leaderboard';

  $: leaderboard = AGDEFS.map(ag => {
    const st = stats[ag.id];
    return {
      ...ag,
      level: st?.level || 1,
      wins: st?.wins || 0,
      losses: st?.losses || 0,
      winRate: st ? getWinRate(st) : 0,
      streak: st?.bestStreak || 0,
    };
  }).sort((a, b) => b.wins - a.wins);
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-overlay" on:click={onClose}>
  <div class="oracle-panel" on:click|stopPropagation>
    <div class="oh">
      <span class="ohi">🏆</span>
      <span class="oht">ORACLE / LEADERBOARD</span>
      <div class="ohc" on:click={onClose}>✕</div>
    </div>

    <div class="otabs">
      <button class="otab" class:active={activeTab === 'leaderboard'} on:click={() => activeTab = 'leaderboard'}>LEADERBOARD</button>
      <button class="otab" class:active={activeTab === 'history'} on:click={() => activeTab = 'history'}>HISTORY</button>
    </div>

    <div class="ob">
      {#if activeTab === 'leaderboard'}
        <div class="lb-list">
          {#each leaderboard as ag, i}
            <div class="lb-row" class:top3={i < 3}>
              <span class="lb-rank" style="color:{i===0?'#E8967D':i===1?'#ccc':i===2?'#cd7f32':'#555'}">
                {i < 3 ? ['🥇','🥈','🥉'][i] : `#${i+1}`}
              </span>
              <span class="lb-icon">{ag.icon}</span>
              <div class="lb-info">
                <div class="lb-name" style="color:{ag.color}">{ag.name}</div>
                <div class="lb-meta">LVL {ag.level} · {ag.wins}W {ag.losses}L</div>
              </div>
              <div class="lb-wr">
                <div class="lb-wrv">{ag.winRate}%</div>
                <div class="lb-wrl">WIN RATE</div>
              </div>
              <div class="lb-str">🔥{ag.streak}</div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="history-empty">
          <div class="he-icon">📜</div>
          <div class="he-text">Match history will appear here after battles.</div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.7);
    backdrop-filter: blur(4px);
    z-index: 200;
    display: flex; align-items: center; justify-content: center;
  }
  .oracle-panel {
    width: 480px; max-height: 80vh;
    border: 4px solid #000; border-radius: 16px;
    overflow: hidden; box-shadow: 8px 8px 0 #000;
    background: #0a0a1a;
  }
  .oh {
    padding: 12px 16px;
    background: linear-gradient(90deg, #E8967D, #d07a64);
    border-bottom: 4px solid #000;
    display: flex; align-items: center; gap: 8px;
    color: #000;
  }
  .ohi { font-size: 18px; }
  .oht { font-size: 12px; font-weight: 900; font-family: var(--fd); letter-spacing: 2px; }
  .ohc { margin-left: auto; font-size: 16px; cursor: pointer; }

  .otabs {
    display: flex; border-bottom: 2px solid rgba(255,255,255,.05);
  }
  .otab {
    flex: 1; padding: 8px;
    background: transparent; border: none; border-bottom: 2px solid transparent;
    color: #555; font-size: 8px; font-weight: 900; font-family: var(--fd);
    letter-spacing: 2px; cursor: pointer; transition: all .15s;
  }
  .otab:hover { color: #fff; }
  .otab.active { color: #E8967D; border-bottom-color: #E8967D; }

  .ob { padding: 10px; overflow-y: auto; max-height: calc(80vh - 100px); }

  .lb-list { display: flex; flex-direction: column; gap: 4px; }
  .lb-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; border-radius: 8px;
    background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.05);
    transition: background .15s;
  }
  .lb-row:hover { background: rgba(255,255,255,.05); }
  .lb-row.top3 { border-color: rgba(232,150,125,.15); }
  .lb-rank { font-size: 12px; width: 28px; text-align: center; font-weight: 900; }
  .lb-icon { font-size: 18px; }
  .lb-info { flex: 1; }
  .lb-name { font-size: 10px; font-weight: 900; font-family: var(--fd); letter-spacing: 1px; }
  .lb-meta { font-size: 7px; color: #666; font-family: var(--fm); }
  .lb-wr { text-align: right; }
  .lb-wrv { font-size: 14px; font-weight: 900; font-family: var(--fd); color: #00ff88; }
  .lb-wrl { font-size: 6px; color: #555; font-family: var(--fd); letter-spacing: 1px; }
  .lb-str { font-size: 10px; font-weight: 700; width: 36px; text-align: right; }

  .history-empty { text-align: center; padding: 40px 20px; }
  .he-icon { font-size: 36px; margin-bottom: 8px; }
  .he-text { font-size: 10px; color: #555; font-family: var(--fm); }
</style>
