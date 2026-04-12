<script lang="ts">
  import type { BattlePriceTick } from '$lib/engine/battleResolver';
  import type { FBScore } from '$lib/engine/types';

  export let win = false;
  export let battleResult: string = '';
  export let entryPrice = 0;
  export let exitPrice = 0;
  export let tpPrice = 0;
  export let slPrice = 0;
  export let direction: string = 'LONG';
  export let priceHistory: BattlePriceTick[] = [];
  export let duration = 0;      // ms
  export let maxRunup = 0;
  export let maxDrawdown = 0;
  export let rAchieved = 0;
  export let fbScore: FBScore | null = null;
  export let lpChange = 0;
  export let streak = 0;
  export let agents: Array<{ name: string; icon: string; color: string; dir: string; conf: number }> = [];
  export let actualDirection: string = '';
  export let onPlayAgain: () => void = () => {};
  export let onLobby: () => void = () => {};

  // Computed
  $: pnlAbs = exitPrice - entryPrice;
  $: pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
  $: pnlDir = direction === 'SHORT' ? -pnlPct : pnlPct;
  $: durationStr = duration >= 60000
    ? `${Math.floor(duration / 60000)}m ${Math.round((duration % 60000) / 1000)}s`
    : `${Math.round(duration / 1000)}s`;

  $: resultTag = battleResult === 'tp' ? 'TP HIT'
    : battleResult === 'sl' ? 'SL HIT'
    : battleResult === 'time_win' ? 'TIMED OUT'
    : battleResult === 'time_loss' ? 'TIMED OUT'
    : 'COMPLETE';

  $: narrative = battleResult === 'tp'
    ? `Price reached your $${Math.round(tpPrice).toLocaleString()} target — $${Math.abs(Math.round(pnlAbs)).toLocaleString()} ${pnlAbs > 0 ? 'above' : 'below'} entry in ${durationStr}`
    : battleResult === 'sl'
    ? `Price hit your $${Math.round(slPrice).toLocaleString()} stop — $${Math.abs(Math.round(pnlAbs)).toLocaleString()} ${pnlAbs > 0 ? 'above' : 'below'} entry in ${durationStr}`
    : `Time expired at $${Math.round(exitPrice).toLocaleString()} — ${pnlDir >= 0 ? 'profit' : 'loss'} of ${Math.abs(pnlDir).toFixed(2)}%`;

  // SVG sparkline
  $: sparkPoints = (() => {
    if (priceHistory.length < 2) return '';
    const prices = priceHistory.map(p => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const w = 280;
    const h = 60;
    return prices.map((p, i) => {
      const x = (i / (prices.length - 1)) * w;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  })();

  $: sparkTpY = (() => {
    if (priceHistory.length < 2) return 0;
    const prices = priceHistory.map(p => p.price);
    const min = Math.min(...prices, tpPrice, slPrice);
    const max = Math.max(...prices, tpPrice, slPrice);
    const range = max - min || 1;
    return 60 - ((tpPrice - min) / range) * 60;
  })();

  $: sparkSlY = (() => {
    if (priceHistory.length < 2) return 60;
    const prices = priceHistory.map(p => p.price);
    const min = Math.min(...prices, tpPrice, slPrice);
    const max = Math.max(...prices, tpPrice, slPrice);
    const range = max - min || 1;
    return 60 - ((slPrice - min) / range) * 60;
  })();
</script>

<div class="rp" class:win class:lose={!win}>
  <!-- 1. OUTCOME HEADER -->
  <div class="rp-outcome">
    <div class="rp-icon" class:win class:lose={!win}>
      {win ? '▲' : '▼'}
    </div>
    <div class="rp-tag" class:win class:lose={!win}>{resultTag}</div>
    <div class="rp-narrative">{narrative}</div>
  </div>

  <!-- 2. PRICE PATH SPARKLINE -->
  {#if priceHistory.length > 1}
    <div class="rp-spark">
      <svg viewBox="0 0 280 60" preserveAspectRatio="none">
        <!-- TP/SL lines -->
        <line x1="0" y1={sparkTpY} x2="280" y2={sparkTpY} stroke="var(--grn, #00ff88)" stroke-width="0.5" stroke-dasharray="3 2" opacity="0.5" />
        <line x1="0" y1={sparkSlY} x2="280" y2={sparkSlY} stroke="var(--red, #ff2d55)" stroke-width="0.5" stroke-dasharray="3 2" opacity="0.5" />
        <!-- Price path -->
        <path d={sparkPoints} fill="none" stroke={win ? 'var(--grn, #00ff88)' : 'var(--red, #ff2d55)'} stroke-width="1.5" />
        <!-- Entry dot -->
        <circle cx="0" cy="30" r="3" fill="#E8967D" />
        <!-- Exit dot -->
        <circle cx="280" cy={priceHistory.length > 0 ? (() => {
          const prices = priceHistory.map(p => p.price);
          const min = Math.min(...prices, tpPrice, slPrice);
          const max = Math.max(...prices, tpPrice, slPrice);
          const range = max - min || 1;
          return 60 - ((exitPrice - min) / range) * 60;
        })() : 30} r="3" fill={win ? 'var(--grn, #00ff88)' : 'var(--red, #ff2d55)'} />
      </svg>
    </div>
  {/if}

  <!-- 3. TRADE METRICS -->
  <div class="rp-metrics">
    <div class="rp-m"><span class="rp-ml">Entry</span><span class="rp-mv">${Math.round(entryPrice).toLocaleString()}</span></div>
    <div class="rp-m"><span class="rp-ml">Exit</span><span class="rp-mv">${Math.round(exitPrice).toLocaleString()}</span></div>
    <div class="rp-m"><span class="rp-ml">P&L</span><span class="rp-mv" class:pos={pnlDir >= 0} class:neg={pnlDir < 0}>{pnlDir >= 0 ? '+' : ''}{pnlDir.toFixed(2)}%</span></div>
    <div class="rp-m"><span class="rp-ml">Duration</span><span class="rp-mv">{durationStr}</span></div>
    <div class="rp-m"><span class="rp-ml">Max Run</span><span class="rp-mv pos">+{maxRunup.toFixed(2)}%</span></div>
    <div class="rp-m"><span class="rp-ml">Max DD</span><span class="rp-mv neg">-{maxDrawdown.toFixed(2)}%</span></div>
    <div class="rp-m"><span class="rp-ml">R Achieved</span><span class="rp-mv">{rAchieved.toFixed(1)}R</span></div>
  </div>

  <!-- 4. AGENT ACCURACY -->
  <div class="rp-agents">
    <div class="rp-section-title">AGENT ACCURACY</div>
    {#each agents as ag}
      {@const correct = (actualDirection === 'LONG' && ag.dir === 'LONG') || (actualDirection === 'SHORT' && ag.dir === 'SHORT')}
      <div class="rp-agent" class:correct class:wrong={!correct}>
        <span class="rp-ag-icon" style="color:{ag.color}">{ag.name.charAt(0)}</span>
        <span class="rp-ag-name">{ag.name}</span>
        <span class="rp-ag-dir" class:long={ag.dir === 'LONG'} class:short={ag.dir === 'SHORT'}>{ag.dir === 'LONG' ? '▲' : '▼'} {ag.conf}%</span>
        <span class="rp-ag-badge">{correct ? '✓' : '✗'}</span>
      </div>
    {/each}
  </div>

  <!-- 5. FBS SCORECARD -->
  {#if fbScore}
    <div class="rp-fbs">
      <div class="rp-section-title">FBS SCORECARD</div>
      <div class="rp-fbs-row">
        <span class="rp-fbs-label">DS</span>
        <div class="rp-fbs-bar"><div class="rp-fbs-fill ds" style="width:{fbScore.ds}%"></div></div>
        <span class="rp-fbs-val">{fbScore.ds}</span>
      </div>
      <div class="rp-fbs-row">
        <span class="rp-fbs-label">RE</span>
        <div class="rp-fbs-bar"><div class="rp-fbs-fill re" style="width:{fbScore.re}%"></div></div>
        <span class="rp-fbs-val">{fbScore.re}</span>
      </div>
      <div class="rp-fbs-row">
        <span class="rp-fbs-label">CI</span>
        <div class="rp-fbs-bar"><div class="rp-fbs-fill ci" style="width:{fbScore.ci}%"></div></div>
        <span class="rp-fbs-val">{fbScore.ci}</span>
      </div>
      <div class="rp-fbs-total">
        <span>FBS</span>
        <span class="rp-fbs-total-val" class:good={fbScore.fbs >= 70} class:mid={fbScore.fbs >= 50 && fbScore.fbs < 70} class:low={fbScore.fbs < 50}>{fbScore.fbs}</span>
      </div>
    </div>
  {/if}

  <!-- 6. LP & PROGRESSION -->
  <div class="rp-lp">
    <span class="rp-lp-change" class:pos={lpChange >= 0} class:neg={lpChange < 0}>{lpChange >= 0 ? '+' : ''}{lpChange} LP</span>
    {#if streak >= 2}<span class="rp-streak">STREAK {streak}</span>{/if}
  </div>

  <!-- 7. ACTION BUTTONS -->
  <div class="rp-actions">
    <button class="rp-btn primary" on:click={onPlayAgain}>PLAY AGAIN</button>
    <button class="rp-btn secondary" on:click={onLobby}>LOBBY</button>
  </div>
</div>

<style>
  .rp {
    display: flex; flex-direction: column; gap: 12px;
    padding: 16px; background: rgba(10,9,8,.95); border-radius: 12px;
    border: 1px solid rgba(255,255,255,.08); color: #F0EDE4;
    font-family: var(--fm, 'JetBrains Mono', monospace); max-width: 380px;
    backdrop-filter: blur(12px);
  }

  .rp-outcome { text-align: center; }
  .rp-icon { font-size: 28px; font-weight: 700; }
  .rp-icon.win { color: var(--grn, #00ff88); }
  .rp-icon.lose { color: var(--red, #ff2d55); }
  .rp-tag { font-size: 16px; font-weight: 700; letter-spacing: 2px; margin: 4px 0; }
  .rp-tag.win { color: var(--grn, #00ff88); }
  .rp-tag.lose { color: var(--red, #ff2d55); }
  .rp-narrative { font-size: 10px; color: rgba(240,237,228,.6); line-height: 1.4; }

  .rp-spark { background: rgba(255,255,255,.03); border-radius: 8px; padding: 8px; }
  .rp-spark svg { width: 100%; height: 60px; }

  .rp-metrics {
    display: grid; grid-template-columns: 1fr 1fr; gap: 4px;
    font-size: 10px;
  }
  .rp-m { display: flex; justify-content: space-between; padding: 3px 6px; background: rgba(255,255,255,.03); border-radius: 4px; }
  .rp-ml { color: rgba(240,237,228,.45); }
  .rp-mv { font-weight: 600; }
  .rp-mv.pos { color: var(--grn, #00ff88); }
  .rp-mv.neg { color: var(--red, #ff2d55); }

  .rp-section-title { font-size: 8px; letter-spacing: 2px; color: rgba(240,237,228,.35); text-transform: uppercase; margin-bottom: 4px; }

  .rp-agents { display: flex; flex-direction: column; gap: 3px; }
  .rp-agent {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 6px; border-radius: 4px; font-size: 10px;
    background: rgba(255,255,255,.03);
  }
  .rp-agent.correct { border-left: 2px solid var(--grn, #00ff88); }
  .rp-agent.wrong { border-left: 2px solid var(--red, #ff2d55); opacity: .6; }
  .rp-ag-icon { width: 16px; height: 16px; border-radius: 4px; background: rgba(255,255,255,.08); display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; }
  .rp-ag-name { flex: 1; font-weight: 500; }
  .rp-ag-dir { font-size: 9px; }
  .rp-ag-dir.long { color: var(--grn, #00ff88); }
  .rp-ag-dir.short { color: var(--red, #ff2d55); }
  .rp-ag-badge { font-weight: 700; }
  .rp-agent.correct .rp-ag-badge { color: var(--grn, #00ff88); }
  .rp-agent.wrong .rp-ag-badge { color: var(--red, #ff2d55); }

  .rp-fbs { display: flex; flex-direction: column; gap: 4px; }
  .rp-fbs-row { display: flex; align-items: center; gap: 6px; font-size: 10px; }
  .rp-fbs-label { width: 20px; font-weight: 600; color: rgba(240,237,228,.5); }
  .rp-fbs-bar { flex: 1; height: 6px; background: rgba(255,255,255,.08); border-radius: 3px; overflow: hidden; }
  .rp-fbs-fill { height: 100%; border-radius: 3px; transition: width .6s ease; }
  .rp-fbs-fill.ds { background: #E8967D; }
  .rp-fbs-fill.re { background: #66cce6; }
  .rp-fbs-fill.ci { background: var(--grn, #00ff88); }
  .rp-fbs-val { width: 24px; text-align: right; font-weight: 600; }
  .rp-fbs-total { display: flex; justify-content: space-between; padding-top: 4px; border-top: 1px solid rgba(255,255,255,.08); font-weight: 700; font-size: 12px; }
  .rp-fbs-total-val.good { color: var(--grn, #00ff88); }
  .rp-fbs-total-val.mid { color: #E8967D; }
  .rp-fbs-total-val.low { color: var(--red, #ff2d55); }

  .rp-lp { text-align: center; padding: 8px 0; }
  .rp-lp-change { font-size: 20px; font-weight: 700; }
  .rp-lp-change.pos { color: var(--grn, #00ff88); }
  .rp-lp-change.neg { color: var(--red, #ff2d55); }
  .rp-streak { display: inline-block; margin-left: 8px; font-size: 10px; padding: 2px 8px; border-radius: 4px; background: rgba(232,150,125,.15); color: #E8967D; font-weight: 600; }

  .rp-actions { display: flex; gap: 8px; }
  .rp-btn {
    flex: 1; padding: 10px 0; border: none; border-radius: 8px; font-family: inherit;
    font-size: 12px; font-weight: 700; letter-spacing: 1px; cursor: pointer; transition: opacity .15s;
  }
  .rp-btn:hover { opacity: .85; }
  .rp-btn.primary { background: #E8967D; color: #0A0908; }
  .rp-btn.secondary { background: rgba(255,255,255,.08); color: #F0EDE4; }
</style>
