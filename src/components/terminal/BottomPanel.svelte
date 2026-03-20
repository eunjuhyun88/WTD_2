<script lang="ts">
  import { timeSince } from '$lib/utils/time';
  import { quickTradeStore, openTrades, closedTrades, totalQuickPnL, closeQuickTrade, clearClosedTrades } from '$lib/stores/quickTradeStore';
  import { trackedSignalStore, activeSignals, activeSignalCount, convertToTrade, removeTracked, clearExpired } from '$lib/stores/trackedSignalStore';
  import { gameState } from '$lib/stores/gameState';

  // ── Activity log ──
  interface Activity {
    id: string;
    icon: string;
    text: string;
    time: number;
    color: string;
  }

  let activities: Activity[] = [];

  export function addActivity(icon: string, text: string, color: string = '#fff') {
    activities = [{ id: crypto.randomUUID(), icon, text, time: Date.now(), color }, ...activities].slice(0, 50);
  }

  // ── Tab state ──
  type Tab = 'positions' | 'tracked' | 'activity';
  let activeTab: Tab = 'positions';
  let collapsed = false;

  export function activateTab(tab: Tab) {
    activeTab = tab;
    collapsed = false;
  }

  // ── Reactive ──
  $: state = $gameState;
  $: opens = $openTrades;
  $: closed = $closedTrades;
  $: totalPnl = $totalQuickPnL;
  $: tracked = $activeSignals;
  $: trackedCount = $activeSignalCount;

  // ── Trade actions ──
  function handleCloseTrade(tradeId: string) {
    const trade = opens.find(t => t.id === tradeId);
    if (!trade) return;
    const token = trade.pair.split('/')[0] as keyof typeof state.prices;
    const currentPrice = state.prices[token] || state.prices.BTC;
    closeQuickTrade(tradeId, currentPrice);
    const pnl = trade.pnlPercent;
    addActivity(pnl >= 0 ? '🟢' : '🔴', `Closed ${trade.dir} ${trade.pair} · ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`, pnl >= 0 ? 'var(--grn)' : 'var(--red)');
  }

  function handleConvert(signalId: string) {
    const sig = tracked.find(s => s.id === signalId);
    if (!sig) return;
    const token = sig.pair.split('/')[0] as keyof typeof state.prices;
    const price = state.prices[token] || state.prices.BTC;
    convertToTrade(signalId, price);
    addActivity('📊', `Converted ${sig.dir} ${sig.pair} to trade`, 'var(--yel)');
    activeTab = 'positions';
  }

  // ── Helpers ──
  function pnlColor(n: number) { return n >= 0 ? 'var(--grn)' : 'var(--red)'; }
  function pnlPfx(n: number) { return n >= 0 ? '+' : ''; }
  function timeLeft(ts: number) {
    const ms = ts - Date.now();
    if (ms <= 0) return 'expired';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

</script>

<div class="bp" class:collapsed>
  <!-- Tab Bar -->
  <div class="bp-tabs">
    <button class="bp-tab" class:active={activeTab === 'positions'} on:click={() => { activeTab = 'positions'; collapsed = false; }}>
      POSITIONS
      {#if opens.length > 0}<span class="bp-badge">{opens.length}</span>{/if}
    </button>
    <button class="bp-tab" class:active={activeTab === 'tracked'} on:click={() => { activeTab = 'tracked'; collapsed = false; }}>
      TRACKED
      {#if trackedCount > 0}<span class="bp-badge bp-badge-cyan">{trackedCount}</span>{/if}
    </button>
    <button class="bp-tab" class:active={activeTab === 'activity'} on:click={() => { activeTab = 'activity'; collapsed = false; }}>
      ACTIVITY
      {#if activities.length > 0}<span class="bp-badge bp-badge-dim">{activities.length}</span>{/if}
    </button>
    <div class="bp-tabs-right">
      <span class="bp-pnl" style="color:{pnlColor(totalPnl)}">{pnlPfx(totalPnl)}{totalPnl.toFixed(2)}%</span>
      <button class="bp-collapse" on:click={() => collapsed = !collapsed}>{collapsed ? '▲' : '▼'}</button>
    </div>
  </div>

  <!-- Content Area -->
  {#if !collapsed}
  <div class="bp-content">
    <!-- POSITIONS (open only) -->
    {#if activeTab === 'positions'}
      <div class="bp-body">
        {#if opens.length > 0}
          {#each opens as trade (trade.id)}
            <div class="bp-row">
              <span class="bp-dir" class:long={trade.dir === 'LONG'} class:short={trade.dir === 'SHORT'}>
                {trade.dir === 'LONG' ? '▲' : '▼'}{trade.dir}
              </span>
              <span class="bp-pair">{trade.pair}</span>
              <span class="bp-src">{trade.source}</span>
              <span class="bp-entry">${Math.round(trade.entry).toLocaleString()}</span>
              <span class="bp-pnl-val" style="color:{pnlColor(trade.pnlPercent)}">
                {pnlPfx(trade.pnlPercent)}{trade.pnlPercent}%
              </span>
              <span class="bp-time">{timeSince(trade.openedAt, false)}</span>
              <button class="bp-action-btn bp-close-btn" on:click={() => handleCloseTrade(trade.id)}>CLOSE</button>
            </div>
          {/each}
        {:else}
          <div class="bp-empty">No open positions. Use QUICK LONG/SHORT in War Room.</div>
        {/if}
      </div>

    <!-- TRACKED -->
    {:else if activeTab === 'tracked'}
      <div class="bp-body">
        {#if tracked.length > 0}
          {#each tracked as sig (sig.id)}
            <div class="bp-row">
              <span class="bp-dir" class:long={sig.dir === 'LONG'} class:short={sig.dir === 'SHORT'}>
                {sig.dir === 'LONG' ? '▲' : '▼'}{sig.dir}
              </span>
              <span class="bp-pair">{sig.pair}</span>
              <span class="bp-src">{sig.source}</span>
              <span class="bp-conf">{sig.confidence}%</span>
              <span class="bp-pnl-val" style="color:{pnlColor(sig.pnlPercent)}">
                {pnlPfx(sig.pnlPercent)}{sig.pnlPercent}%
              </span>
              <span class="bp-time bp-expire">⏱{timeLeft(sig.expiresAt)}</span>
              <button class="bp-action-btn bp-trade-btn" on:click={() => handleConvert(sig.id)}>TRADE</button>
              <button class="bp-action-btn bp-rm-btn" on:click={() => removeTracked(sig.id)}>✕</button>
            </div>
          {/each}
        {:else}
          <div class="bp-empty">No tracked signals. Use TRACK in War Room to watch signals.</div>
        {/if}
        {#if $trackedSignalStore.signals.filter(s => s.status === 'expired').length > 0}
          <button class="bp-clear" on:click={clearExpired}>CLEAR EXPIRED</button>
        {/if}
      </div>

    <!-- ACTIVITY (includes closed trades + all events) -->
    {:else if activeTab === 'activity'}
      <div class="bp-body">
        <!-- Closed Trades History -->
        {#if closed.length > 0}
          <div class="bp-section-lbl">TRADE HISTORY</div>
          {#each closed.slice(0, 8) as trade (trade.id)}
            <div class="bp-row bp-row-closed">
              <span class="bp-dir" class:long={trade.dir === 'LONG'} class:short={trade.dir === 'SHORT'}>
                {trade.dir === 'LONG' ? '▲' : '▼'}
              </span>
              <span class="bp-pair">{trade.pair}</span>
              <span class="bp-src">{trade.source}</span>
              <span class="bp-pnl-val" style="color:{pnlColor(trade.closePnl || 0)}">
                {pnlPfx(trade.closePnl || 0)}{(trade.closePnl || 0).toFixed(2)}%
              </span>
            </div>
          {/each}
          <button class="bp-clear" on:click={clearClosedTrades}>CLEAR HISTORY</button>
        {/if}

        <!-- Activity Log -->
        {#if activities.length > 0}
          <div class="bp-section-lbl">ACTIVITY LOG</div>
          {#each activities as act (act.id)}
            <div class="bp-row bp-act-row">
              <span class="bp-act-icon">{act.icon}</span>
              <span class="bp-act-text" style="color:{act.color}">{act.text}</span>
              <span class="bp-time">{timeSince(act.time, false)}</span>
            </div>
          {/each}
        {/if}

        {#if closed.length === 0 && activities.length === 0}
          <div class="bp-empty">No activity yet. Start trading!</div>
        {/if}
      </div>
    {/if}
  </div>
  {/if}
</div>

<style>
  .bp {
    flex-shrink: 0;
    background: #0a0a1a;
    border-top: 3px solid var(--yel);
    display: flex;
    flex-direction: column;
    max-height: 240px;
    transition: max-height .2s ease;
  }
  .bp.collapsed { max-height: 30px; }

  /* Tabs */
  .bp-tabs {
    display: flex;
    align-items: center;
    gap: 0;
    flex-shrink: 0;
    background: linear-gradient(90deg, #0f0f28, #1a0f28);
    border-bottom: 1px solid rgba(232,150,125,.1);
  }
  .bp-tab {
    padding: 6px 12px;
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 1.5px;
    color: rgba(255,255,255,.3);
    background: none;
    border: none;
    cursor: pointer;
    transition: all .15s;
    display: flex;
    align-items: center;
    gap: 4px;
    border-bottom: 2px solid transparent;
  }
  .bp-tab:hover { color: rgba(255,255,255,.6); }
  .bp-tab.active {
    color: var(--yel);
    border-bottom-color: var(--yel);
    background: rgba(232,150,125,.04);
  }
  .bp-badge {
    font-size: 7px;
    background: var(--yel);
    color: #000;
    padding: 1px 4px;
    border-radius: 8px;
    font-weight: 900;
  }
  .bp-badge-cyan { background: var(--cyan); }
  .bp-badge-dim { background: rgba(255,255,255,.2); color: #fff; }
  .bp-tabs-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding-right: 8px;
  }
  .bp-pnl {
    font-family: var(--fd);
    font-size: 11px;
    font-weight: 900;
  }
  .bp-collapse {
    font-size: 10px;
    background: none;
    border: none;
    color: rgba(255,255,255,.3);
    cursor: pointer;
    padding: 2px;
  }
  .bp-collapse:hover { color: #fff; }

  /* Content */
  .bp-content {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }
  .bp-body {
    height: 100%;
    overflow-y: auto;
    padding: 4px 8px;
  }
  .bp-body::-webkit-scrollbar { width: 3px; }
  .bp-body::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }

  /* Rows */
  .bp-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px;
    border-bottom: 1px solid rgba(255,255,255,.04);
    font-family: var(--fm);
  }
  .bp-row:hover { background: rgba(255,255,255,.02); }
  .bp-row-closed { opacity: .4; }

  .bp-dir {
    font-size: 7px;
    font-weight: 900;
    padding: 2px 5px;
    border-radius: 3px;
    border: 1px solid;
    letter-spacing: .5px;
    white-space: nowrap;
  }
  .bp-dir.long { color: var(--grn); border-color: rgba(0,255,136,.3); background: rgba(0,255,136,.08); }
  .bp-dir.short { color: var(--red); border-color: rgba(255,45,85,.3); background: rgba(255,45,85,.08); }

  .bp-pair { font-size: 9px; font-weight: 700; color: rgba(255,255,255,.7); }
  .bp-src {
    font-size: 6px;
    color: rgba(255,255,255,.25);
    background: rgba(255,255,255,.04);
    padding: 1px 4px;
    border-radius: 3px;
  }
  .bp-conf {
    font-size: 8px;
    color: var(--cyan);
    font-weight: 700;
  }
  .bp-entry { font-size: 8px; color: rgba(255,255,255,.4); }
  .bp-pnl-val {
    font-family: var(--fd);
    font-size: 10px;
    font-weight: 900;
    min-width: 45px;
    text-align: right;
  }
  .bp-time { font-size: 7px; color: rgba(255,255,255,.2); }
  .bp-expire { color: var(--ora); }

  .bp-action-btn {
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: .5px;
    padding: 3px 6px;
    border-radius: 3px;
    cursor: pointer;
    transition: all .12s;
    border: 1px solid;
  }
  .bp-close-btn {
    background: rgba(255,45,85,.1);
    color: var(--red);
    border-color: rgba(255,45,85,.3);
  }
  .bp-close-btn:hover { background: rgba(255,45,85,.3); }
  .bp-trade-btn {
    background: rgba(0,255,136,.1);
    color: var(--grn);
    border-color: rgba(0,255,136,.3);
  }
  .bp-trade-btn:hover { background: rgba(0,255,136,.3); }
  .bp-rm-btn {
    background: rgba(255,255,255,.05);
    color: rgba(255,255,255,.3);
    border-color: rgba(255,255,255,.1);
    padding: 3px 5px;
  }
  .bp-rm-btn:hover { color: var(--red); border-color: var(--red); }

  .bp-empty {
    padding: 20px;
    text-align: center;
    font-size: 8px;
    color: rgba(255,255,255,.2);
    letter-spacing: 1px;
  }
  .bp-section-lbl {
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 2px;
    color: rgba(255,255,255,.25);
    padding: 6px 4px 3px;
    border-bottom: 1px solid rgba(255,255,255,.06);
    margin-bottom: 2px;
  }
  .bp-section-lbl:not(:first-child) {
    margin-top: 6px;
    border-top: 1px solid rgba(255,255,255,.06);
    padding-top: 8px;
  }
  .bp-clear {
    width: 100%;
    padding: 4px;
    font-family: var(--fm);
    font-size: 7px;
    color: rgba(255,255,255,.2);
    background: none;
    border: none;
    cursor: pointer;
    text-align: center;
  }
  .bp-clear:hover { color: var(--red); }

  /* Activity */
  .bp-act-row { gap: 8px; }
  .bp-act-icon { font-size: 11px; }
  .bp-act-text { font-size: 8px; flex: 1; }

</style>
