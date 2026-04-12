<script lang="ts">
  import { timeSince } from '$lib/utils/time';

  export let embedded = false;
  export let variant: 'full' | 'stream' = 'full';

  import { AGDEFS, CHARACTER_ART } from '$lib/data/agents';
  import { gameState } from '$lib/stores/gameState';
  import { matchHistoryStore } from '$lib/stores/matchHistoryStore';
  import { openTrades } from '$lib/stores/quickTradeStore';
  import { activeSignals } from '$lib/stores/trackedSignalStore';
  import { userProfileStore } from '$lib/stores/userProfileStore';
  import { livePrices, priceChanges } from '$lib/stores/priceStore';
  import { goto } from '$app/navigation';
  import EmptyState from '../shared/EmptyState.svelte';
  import ContextBanner from '../shared/ContextBanner.svelte';

  $: state = $gameState;
  $: records = $matchHistoryStore.records;
  $: trades = $openTrades;
  $: tracked = $activeSignals;
  $: profile = $userProfileStore;
  $: isStream = embedded && variant === 'stream';
  $: liveP = $livePrices;
  $: changes = $priceChanges;

  function fmtChange(pct: number): string {
    if (!Number.isFinite(pct) || pct === 0) return '+0.00%';
    return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
  }

  // S-03: priceStore에서 실시간 가격 + 24h% 구독
  $: prices = [
    { symbol: 'BTC', price: `$${Math.round(liveP.BTC || 97420).toLocaleString()}`, change: fmtChange(changes.BTC), up: (changes.BTC || 0) >= 0 },
    { symbol: 'ETH', price: `$${Math.round(liveP.ETH || 3481).toLocaleString()}`, change: fmtChange(changes.ETH), up: (changes.ETH || 0) >= 0 },
    { symbol: 'SOL', price: `$${(liveP.SOL || 198).toFixed(2)}`, change: fmtChange(changes.SOL), up: (changes.SOL || 0) >= 0 },
  ];

  // Build activity timeline from all sources
  interface ActivityItem {
    id: string;
    icon: string;
    text: string;
    detail: string;
    color: string;
    timestamp: number;
    type: 'match' | 'trade' | 'signal' | 'agent';
  }

  $: activityFeed = buildActivityFeed();

  function buildActivityFeed(): ActivityItem[] {
    const items: ActivityItem[] = [];

    // Recent matches
    for (const r of records.slice(0, 5)) {
      items.push({
        id: `match-${r.id}`,
        icon: r.win ? '🏆' : '💀',
        text: `Arena #${r.matchN}: ${r.win ? 'WIN' : 'LOSS'}`,
        detail: `+${r.lp} LP · ${r.agentVotes?.length || 0} agents voted`,
        color: r.win ? '#00ff88' : '#ff2d55',
        timestamp: r.timestamp,
        type: 'match',
      });
    }

    // Open trades
    for (const t of trades) {
      items.push({
        id: `trade-${t.id}`,
        icon: t.dir === 'LONG' ? '📈' : '📉',
        text: `${t.dir} ${t.pair}`,
        detail: `Entry $${Math.round(t.entry).toLocaleString()} · PnL: ${t.pnlPercent >= 0 ? '+' : ''}${t.pnlPercent.toFixed(2)}%`,
        color: t.pnlPercent >= 0 ? '#00ff88' : '#ff2d55',
        timestamp: t.openedAt,
        type: 'trade',
      });
    }

    // Tracked signals
    for (const s of tracked) {
      items.push({
        id: `sig-${s.id}`,
        icon: '📌',
        text: `Tracking ${s.dir} ${s.pair}`,
        detail: `Source: ${s.source} · PnL: ${s.pnlPercent >= 0 ? '+' : ''}${s.pnlPercent.toFixed(2)}%`,
        color: '#ff8c3b',
        timestamp: s.trackedAt,
        type: 'signal',
      });
    }

    // Agent signals (simulated recent activity)
    for (const ag of AGDEFS.slice(0, 3)) {
      items.push({
        id: `agent-${ag.id}`,
        icon: ag.icon,
        text: `${ag.name}: ${ag.dir} signal`,
        detail: `${ag.finding.title} · ${ag.conf}% confidence`,
        color: ag.color,
        timestamp: Date.now() - Math.random() * 3600000,
        type: 'agent',
      });
    }

    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  }

  // Reaction system
  let reactions: Array<{ emoji: string; x: number; y: number; id: number }> = [];
  let nextReaction = 0;

  function sendReaction(emoji: string) {
    reactions = [...reactions, { emoji, x: 20 + Math.random() * 60, y: 80, id: nextReaction++ }];
    setTimeout(() => {
      reactions = reactions.filter(r => r.id !== nextReaction - 1);
    }, 2000);
  }

</script>

<div class="live-page" class:stream={isStream}>
  {#if !embedded}
    <ContextBanner page="live" />
  {/if}
  {#if !isStream}
    <div class="live-header">
      <div class="lh-bg"></div>
      <div class="lh-content">
        <h1 class="lh-title">LIVE</h1>
        <p class="lh-sub">Your arena sessions, trades & agent activity</p>
        <div class="lh-stats">
          <span class="lh-stat"><span class="lh-dot"></span> {trades.length} OPEN TRADES</span>
          <span class="lh-stat">📌 {tracked.length} TRACKED</span>
          <span class="lh-stat">⚔️ {records.length} MATCHES</span>
        </div>
      </div>
    </div>
    <div class="price-ticker">
      {#each prices as p}
        <div class="pt-item">
          <span class="pt-symbol">{p.symbol}</span>
          <span class="pt-price">{p.price}</span>
          <span class="pt-change" class:up={p.up} class:down={!p.up}>{p.change}</span>
        </div>
      {/each}
    </div>
  {:else}
    <div class="stream-price-row">
      {#each prices as p}
        <div class="spr-item">
          <span class="spr-symbol">{p.symbol}</span>
          <span class="spr-price">{p.price}</span>
          <span class="spr-change" class:up={p.up} class:down={!p.up}>{p.change}</span>
        </div>
      {/each}
    </div>
  {/if}

  <div class="live-body" class:stream={isStream}>
    <!-- Recent Sessions -->
    <div class="live-section">
      <div class="ls-header">
        <span class="ls-title">⚔️ RECENT ARENA SESSIONS</span>
        {#if !isStream}
          <a href="/arena" class="ls-link">VIEW ALL →</a>
        {/if}
      </div>
      {#if records.length > 0}
        <div class="session-grid">
          {#each records.slice(0, isStream ? 2 : 3) as match (match.id)}
            <div class="session-card" class:win={match.win} class:loss={!match.win}>
              <div class="sc-header">
                <span class="sc-result" class:win={match.win}>{match.win ? '🏆 WIN' : '💀 LOSS'}</span>
                <span class="sc-match">#{match.matchN}</span>
                <span class="sc-time">{timeSince(match.timestamp)}</span>
              </div>
              <div class="sc-lp" class:plus={match.lp >= 0}>{match.lp >= 0 ? '+' : ''}{match.lp} LP</div>
              {#if match.hypothesis}
                <div class="sc-hyp">
                  Your call: <span class:long={match.hypothesis.dir === 'LONG'} class:short={match.hypothesis.dir === 'SHORT'}>{match.hypothesis.dir}</span>
                  · {match.hypothesis.conf}% conf
                </div>
              {/if}
              <div class="sc-agents">
                {#each (match.agentVotes || []).slice(0, 5) as vote}
                  {@const ag = AGDEFS.find(a => a.id === vote.agentId)}
                  {#if ag?.img?.def}
                    <img src={ag.img.def} alt={vote.name} class="sc-agent-img" title="{vote.name}: {vote.dir}" loading="lazy" />
                  {:else}
                    <span class="sc-agent-icon" style="color:{vote.color}" title="{vote.name}: {vote.dir}">{ag?.icon || '🤖'}</span>
                  {/if}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <EmptyState
          image={CHARACTER_ART.actionCharge}
          title="NO ARENA MATCHES YET"
          subtitle="Start your first Arena battle to see sessions here"
          ctaText="START BATTLE →"
          ctaHref="/arena"
          icon="⚔️"
          variant="pink"
          compact
        />
      {/if}
    </div>

    <!-- Activity Feed -->
    <div class="live-section">
      <div class="ls-header">
        <span class="ls-title">📡 ACTIVITY FEED</span>
      </div>
      {#if activityFeed.length > 0}
        <div class="activity-feed">
          {#each (isStream ? activityFeed.slice(0, 10) : activityFeed) as item (item.id)}
            <div class="af-item">
              <span class="af-icon">{item.icon}</span>
              <div class="af-content">
                <div class="af-text" style="color:{item.color}">{item.text}</div>
                <div class="af-detail">{item.detail}</div>
              </div>
              <span class="af-time">{timeSince(item.timestamp)}</span>
            </div>
          {/each}
        </div>
      {:else}
        <EmptyState
          image={CHARACTER_ART.tradeActions}
          title="NO ACTIVITY YET"
          subtitle="Start trading or enter the Arena to see your activity feed"
          ctaText="GO TO TERMINAL →"
          ctaHref="/terminal"
          icon="📡"
          variant="cyan"
          compact
        />
      {/if}
    </div>
  </div>

  {#if !isStream}
    <div class="reaction-bar">
      {#each ['🔥', '🐕', '💎', '🚀', '😂', '👑', '⚡', '💀'] as emoji}
        <button class="reaction-btn" on:click={() => sendReaction(emoji)}>{emoji}</button>
      {/each}
      <button class="join-arena-btn" on:click={() => goto('/arena')}>⚔️ JOIN ARENA</button>
    </div>

    {#each reactions as r (r.id)}
      <div class="floating-reaction" style="left:{r.x}%;bottom:{r.y}%">{r.emoji}</div>
    {/each}
  {/if}
</div>

<style>
  .live-page {
    height: 100%;
    overflow-y: auto;
    background: linear-gradient(180deg, #0a1a2e, #0a0a1a);
    position: relative;
  }
  .live-page.stream {
    height: auto;
    min-height: 100%;
    overflow: visible;
    background: transparent;
  }

  .live-header {
    position: relative;
    padding: 20px 24px;
    border-bottom: 4px solid #000;
    background: linear-gradient(135deg, #00d4ff, #0088cc);
    overflow: hidden;
  }
  .live-header::after {
    content: '';
    position: absolute;
    right: -5px; bottom: -5px;
    width: 100px; height: 100px;
    background: url('/doge/action-celebrate.png') center/cover no-repeat;
    opacity: .15;
    border-radius: 12px 0 0 0;
    pointer-events: none;
  }
  .lh-bg { position: absolute; inset: 0; background: radial-gradient(circle at 80% 50%, rgba(255,255,255,.15), transparent 60%); }
  .lh-content { position: relative; z-index: 2; }
  .lh-title {
    font-family: var(--fc); font-size: 28px; color: #fff;
    -webkit-text-stroke: 1px #000; text-shadow: 3px 3px 0 rgba(0,0,0,.3); letter-spacing: 3px;
  }
  .lh-sub { font-family: var(--fm); font-size: 9px; color: rgba(255,255,255,.7); letter-spacing: 2px; margin-top: 2px; }
  .lh-stats { display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap; }
  .lh-stat { font-family: var(--fm); font-size: 8px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 4px; }
  .lh-dot { width: 6px; height: 6px; border-radius: 50%; background: #ff2d55; animation: blink 1s infinite; }
  @keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: .3 } }

  /* Price Ticker */
  .price-ticker {
    display: flex; gap: 0;
    border-bottom: 2px solid rgba(255,255,255,.06);
    background: rgba(0,0,0,.3);
  }
  .pt-item {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
    padding: 6px 10px;
    border-right: 1px solid rgba(255,255,255,.04);
  }
  .pt-item:last-child { border-right: none; }
  .pt-symbol { font-family: var(--fd); font-size: 10px; font-weight: 900; color: var(--yel); letter-spacing: 1px; }
  .pt-price { font-family: var(--fm); font-size: 10px; font-weight: 700; color: #fff; }
  .pt-change { font-family: var(--fm); font-size: 8px; font-weight: 700; }
  .pt-change.up { color: var(--grn); }
  .pt-change.down { color: var(--red); }
  .stream-price-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    padding: 8px 10px 2px;
  }
  .spr-item {
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,.08);
    background: rgba(255,255,255,.03);
    padding: 5px 7px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px;
  }
  .spr-symbol {
    font-family: var(--fd);
    font-size: 8px;
    font-weight: 900;
    letter-spacing: .8px;
    color: var(--yel);
  }
  .spr-price {
    font-family: var(--fm);
    font-size: 8px;
    color: #fff;
    font-weight: 700;
  }
  .spr-change {
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 700;
  }
  .spr-change.up { color: var(--grn); }
  .spr-change.down { color: var(--red); }

  /* Body */
  .live-body { padding: 12px 16px; }
  .live-body.stream { padding: 10px 10px 12px; }

  .live-section { margin-bottom: 16px; }
  .live-page.stream .live-section { margin-bottom: 12px; }
  .ls-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px;
  }
  .ls-title {
    font-family: var(--fd); font-size: 10px; font-weight: 900;
    letter-spacing: 2px; color: rgba(255,255,255,.5);
  }
  .ls-link {
    font-family: var(--fm); font-size: 7px; font-weight: 700;
    color: var(--blu); text-decoration: none; letter-spacing: 1px;
  }
  .ls-link:hover { text-decoration: underline; }

  /* Session Cards */
  .session-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
  .live-page.stream .session-grid { grid-template-columns: 1fr; gap: 6px; }
  .session-card {
    background: rgba(255,255,255,.03);
    border: 2px solid rgba(255,255,255,.06);
    border-radius: 10px;
    padding: 10px 12px;
    transition: all .15s;
  }
  .live-page.stream .session-card { padding: 8px 10px; }
  .session-card:hover { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.1); }
  .session-card.win { border-left: 3px solid var(--grn); }
  .session-card.loss { border-left: 3px solid var(--red); }

  .sc-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .sc-result { font-family: var(--fm); font-size: 9px; font-weight: 900; }
  .sc-result.win { color: var(--grn); }
  .sc-result:not(.win) { color: var(--red); }
  .sc-match { font-family: var(--fd); font-size: 10px; color: rgba(255,255,255,.4); }
  .sc-time { font-family: var(--fm); font-size: 7px; color: rgba(255,255,255,.2); margin-left: auto; }
  .sc-lp { font-family: var(--fd); font-size: 16px; font-weight: 900; color: var(--yel); }
  .sc-lp.plus { color: var(--grn); }
  .sc-hyp { font-family: var(--fm); font-size: 7px; color: rgba(255,255,255,.35); margin-top: 2px; }
  .sc-hyp .long { color: var(--grn); font-weight: 900; }
  .sc-hyp .short { color: var(--red); font-weight: 900; }
  .sc-agents { display: flex; gap: 3px; margin-top: 6px; }
  .sc-agent-img { width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid rgba(255,255,255,.1); object-fit: cover; }
  .sc-agent-icon { font-size: 14px; }

  /* Activity Feed */
  .activity-feed { display: flex; flex-direction: column; gap: 2px; }
  .af-item {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    transition: background .1s;
  }
  .live-page.stream .af-item { padding: 5px 6px; }
  .af-item:hover { background: rgba(255,255,255,.03); }
  .af-icon { font-size: 14px; flex-shrink: 0; }
  .af-content { flex: 1; min-width: 0; }
  .af-text { font-family: var(--fm); font-size: 9px; font-weight: 700; }
  .af-detail { font-family: var(--fm); font-size: 7px; color: rgba(255,255,255,.3); }
  .af-time { font-family: var(--fm); font-size: 7px; color: rgba(255,255,255,.15); flex-shrink: 0; }
  .live-page.stream .af-time { font-size: 6px; }

  /* Empty states handled by EmptyState component */

  /* Reaction Bar */
  .reaction-bar {
    display: flex; align-items: center; gap: 4px;
    padding: 8px 16px;
    border-top: 2px solid rgba(0,212,255,.15);
    background: rgba(0,0,0,.3);
    position: sticky;
    bottom: 0;
  }
  .reaction-btn {
    width: 32px; height: 32px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,.1); background: rgba(255,255,255,.03);
    font-size: 16px; cursor: pointer; transition: all .15s;
  }
  .reaction-btn:hover { transform: scale(1.2); border-color: rgba(255,255,255,.3); background: rgba(255,255,255,.08); }
  .join-arena-btn {
    margin-left: auto; padding: 6px 16px;
    font-family: var(--fc); font-size: 12px; letter-spacing: 2px; color: #fff;
    background: linear-gradient(135deg, #ff2d9b, #ff0066);
    border: 3px solid #000; border-radius: 8px;
    box-shadow: 3px 3px 0 #000; cursor: pointer; transition: all .15s;
    -webkit-text-stroke: .5px #000;
  }
  .join-arena-btn:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 #000; }

  .floating-reaction {
    position: fixed; font-size: 24px;
    animation: floatUp 2s ease forwards; pointer-events: none;
    z-index: 100;
  }
  @keyframes floatUp { 0% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-100px) scale(1.5); } }

  @media (max-width: 980px) {
    .stream-price-row {
      grid-template-columns: 1fr;
      padding-bottom: 6px;
    }
  }
</style>
