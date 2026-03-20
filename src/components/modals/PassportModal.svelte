<script lang="ts">
  import { AGDEFS } from '$lib/data/agents';
  import { agentStats, getWinRate } from '$lib/stores/agentData';

  export let agentId: string = AGDEFS[0].id;
  export let onClose: () => void = () => {};

  let stats = $agentStats;
  $: stats = $agentStats;
  $: agent = AGDEFS.find(a => a.id === agentId) || AGDEFS[0];
  $: st = stats[agentId] || { level: 1, xp: 0, xpMax: 100, wins: 0, losses: 0, bestStreak: 0, curStreak: 0, avgConf: 0, bestConf: 0, matches: [], stamps: { win: 0, lose: 0, streak: 0, diamond: 0, crown: 0 } };
  $: wr = getWinRate(st);
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-overlay" on:click={onClose}>
  <div class="passport" on:click|stopPropagation>
    <div class="pass-header" style="background:{agent.color}">
      <div class="pass-close" on:click={onClose}>✕</div>
      <div class="pass-icon">{agent.icon}</div>
      <div class="pass-name">{agent.name}</div>
      <div class="pass-role">{agent.role}</div>
      <div class="pass-lvl">LVL {st.level}</div>
    </div>

    <div class="pass-body">
      <!-- XP Bar -->
      <div class="xp-section">
        <div class="xp-label">EXPERIENCE</div>
        <div class="xp-bar">
          <div class="xp-fill" style="width:{(st.xp / st.xpMax) * 100}%"></div>
        </div>
        <div class="xp-text">{st.xp} / {st.xpMax} XP</div>
      </div>

      <!-- Stats Grid -->
      <div class="stats-grid">
        <div class="sg-item">
          <div class="sg-val">{st.wins + st.losses}</div>
          <div class="sg-label">MATCHES</div>
        </div>
        <div class="sg-item">
          <div class="sg-val" style="color:#00ff88">{st.wins}</div>
          <div class="sg-label">WINS</div>
        </div>
        <div class="sg-item">
          <div class="sg-val" style="color:#ff2d55">{st.losses}</div>
          <div class="sg-label">LOSSES</div>
        </div>
        <div class="sg-item">
          <div class="sg-val">{wr}%</div>
          <div class="sg-label">WIN RATE</div>
        </div>
        <div class="sg-item">
          <div class="sg-val">🔥{st.bestStreak}</div>
          <div class="sg-label">BEST STREAK</div>
        </div>
        <div class="sg-item">
          <div class="sg-val">{st.avgConf}%</div>
          <div class="sg-label">AVG CONF</div>
        </div>
      </div>

      <!-- Abilities -->
      <div class="abilities">
        <div class="ab-title">ABILITIES</div>
        {#each Object.values(agent.abilities ?? {}) as ability}
          <div class="ab-item">{ability}</div>
        {/each}
      </div>

      <!-- Stamps -->
      <div class="stamps">
        <div class="st-title">STAMPS</div>
        <div class="st-row">
          <span class="stamp">🏆 ×{st.stamps.win}</span>
          <span class="stamp">💀 ×{st.stamps.lose}</span>
          <span class="stamp">🔥 ×{st.stamps.streak}</span>
          <span class="stamp">💎 ×{st.stamps.diamond}</span>
          <span class="stamp">👑 ×{st.stamps.crown}</span>
        </div>
      </div>

      <!-- Recent Matches -->
      <div class="recent">
        <div class="rc-title">RECENT MATCHES</div>
        {#if st.matches.length === 0}
          <div class="rc-empty">No matches yet</div>
        {:else}
          {#each st.matches.slice(-5).reverse() as m}
            <div class="rc-row" class:win={m.win} class:lose={!m.win}>
              <span class="rc-n">#{m.matchN}</span>
              <span class="rc-d" class:long={m.dir === 'LONG'} class:short={m.dir === 'SHORT'}>{m.dir}</span>
              <span class="rc-c">{m.conf}%</span>
              <span class="rc-r">{m.win ? '✓ WIN' : '✗ LOSS'}</span>
              <span class="rc-lp">{m.win ? '+' : ''}{m.lp} LP</span>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.7);
    backdrop-filter: blur(4px);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .passport {
    width: 380px;
    max-height: 85vh;
    border: 4px solid #000;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 8px 8px 0 #000;
    background: #0a0a1a;
  }
  .pass-header {
    padding: 20px;
    text-align: center;
    position: relative;
    border-bottom: 4px solid #000;
  }
  .pass-close {
    position: absolute; top: 8px; right: 12px;
    font-size: 16px; cursor: pointer; color: rgba(255,255,255,.6);
    transition: color .15s;
  }
  .pass-close:hover { color: #fff; }
  .pass-icon { font-size: 48px; margin-bottom: 6px; filter: drop-shadow(2px 2px 0 rgba(0,0,0,.3)); }
  .pass-name { font-size: 18px; font-weight: 900; font-family: var(--fd); color: #fff; letter-spacing: 3px; text-shadow: 2px 2px 0 rgba(0,0,0,.3); }
  .pass-role { font-size: 9px; color: rgba(255,255,255,.7); font-family: var(--fm); margin-top: 2px; }
  .pass-lvl {
    display: inline-block; margin-top: 8px;
    padding: 3px 12px; border-radius: 20px;
    background: rgba(0,0,0,.3); border: 2px solid rgba(255,255,255,.3);
    font-size: 10px; font-weight: 900; font-family: var(--fd); color: #E8967D; letter-spacing: 2px;
  }

  .pass-body { padding: 14px; overflow-y: auto; max-height: calc(85vh - 140px); }

  .xp-section { margin-bottom: 14px; }
  .xp-label { font-size: 7px; font-weight: 900; font-family: var(--fd); color: #888; letter-spacing: 2px; margin-bottom: 4px; }
  .xp-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.1); }
  .xp-fill { height: 100%; border-radius: 2px; background: linear-gradient(90deg, #E8967D, #ffaa00); transition: width .5s; }
  .xp-text { font-size: 7px; color: #666; font-family: var(--fm); text-align: right; margin-top: 2px; }

  .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
  .sg-item { text-align: center; padding: 8px; border-radius: 8px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); }
  .sg-val { font-size: 16px; font-weight: 900; font-family: var(--fd); color: #fff; }
  .sg-label { font-size: 6px; color: #666; font-family: var(--fd); letter-spacing: 1px; margin-top: 2px; }

  .abilities { margin-bottom: 14px; }
  .ab-title { font-size: 7px; font-weight: 900; font-family: var(--fd); color: #888; letter-spacing: 2px; margin-bottom: 6px; }
  .ab-item { font-size: 8px; color: #ccc; font-family: var(--fm); padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,.05); }

  .stamps { margin-bottom: 14px; }
  .st-title { font-size: 7px; font-weight: 900; font-family: var(--fd); color: #888; letter-spacing: 2px; margin-bottom: 6px; }
  .st-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .stamp { font-size: 9px; padding: 3px 8px; border-radius: 6px; background: rgba(255,255,255,.05); color: #ccc; font-family: var(--fm); }

  .rc-title { font-size: 7px; font-weight: 900; font-family: var(--fd); color: #888; letter-spacing: 2px; margin-bottom: 6px; }
  .rc-empty { font-size: 8px; color: #555; font-family: var(--fm); }
  .rc-row {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 6px; border-radius: 4px; margin-bottom: 2px;
    font-size: 8px; font-family: var(--fm);
  }
  .rc-row.win { background: rgba(0,255,136,.05); }
  .rc-row.lose { background: rgba(255,45,85,.05); }
  .rc-n { color: #666; }
  .rc-d { font-weight: 700; }
  .rc-d.long { color: #00ff88; }
  .rc-d.short { color: #ff2d55; }
  .rc-c { color: #888; }
  .rc-r { font-weight: 700; }
  .rc-row.win .rc-r { color: #00ff88; }
  .rc-row.lose .rc-r { color: #ff2d55; }
  .rc-lp { margin-left: auto; font-weight: 700; color: #E8967D; }
</style>
