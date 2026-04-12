<script lang="ts">
  import { AGDEFS, CHARACTER_ART } from '$lib/data/agents';
  import { gameState } from '$lib/stores/gameState';
  import { matchHistoryStore } from '$lib/stores/matchHistoryStore';
  import { openTrades } from '$lib/stores/quickTradeStore';
  import { activeSignals, trackSignal } from '$lib/stores/trackedSignalStore';
  import { incrementTrackedSignals } from '$lib/stores/userProfileStore';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { notifySignalTracked } from '$lib/stores/notificationStore';
  import {
    buildAgentSignals,
    buildArenaSignals,
    buildCommunityIdeas,
    buildTrackedSignals,
    buildTradeSignals,
    type Signal
  } from '$lib/signals/communitySignals';
  import LivePanel from '../../components/live/LivePanel.svelte';
  import EmptyState from '../../components/shared/EmptyState.svelte';
  import ContextBanner from '../../components/shared/ContextBanner.svelte';
  import OracleLeaderboard from '../../components/community/OracleLeaderboard.svelte';

  $: state = $gameState;
  $: records = $matchHistoryStore.records;
  $: opens = $openTrades;
  $: tracked = $activeSignals;

  let filter: string = 'all';
  let signalsView: 'community' | 'signals' | 'oracle' = 'community';
  let communityFilter: 'all' | 'crypto' | 'arena' | 'trade' | 'tracked' = 'all';
  const COMMUNITY_FILTERS: Array<{ key: 'all' | 'crypto' | 'arena' | 'trade' | 'tracked'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'crypto', label: 'Crypto' },
    { key: 'arena', label: 'Arena' },
    { key: 'trade', label: 'Trade' },
    { key: 'tracked', label: 'Tracked' }
  ];
  const SIGNAL_FILTERS: Array<{ key: string; label: string }> = [
    { key: 'all', label: 'ALL' },
    { key: 'active', label: 'ACTIVE' },
    { key: 'arena', label: '⚔️ ARENA' },
    { key: 'trade', label: '📊 TRADE' },
    { key: 'tracked', label: '📌 TRACKED' },
    { key: 'CRITICAL', label: '🔴 CRITICAL' },
    { key: 'HIGH', label: '🟠 HIGH' }
  ];

  // Build signals from real data sources
  $: arenaSignals = buildArenaSignals(records, AGDEFS, state);
  $: tradeSignals = buildTradeSignals(opens);
  $: trackedSignals = buildTrackedSignals(tracked, AGDEFS);
  $: agentSignals = buildAgentSignals(AGDEFS, state);
  $: allSignals = [...arenaSignals, ...tradeSignals, ...trackedSignals, ...agentSignals];
  $: filteredSignals = filter === 'all' ? allSignals
    : filter === 'active' ? allSignals.filter(s => s.active)
    : filter === 'arena' ? arenaSignals
    : filter === 'trade' ? tradeSignals
    : filter === 'tracked' ? trackedSignals
    : allSignals.filter(s => s.priority === filter);
  $: activeSignalCount = allSignals.filter((s) => s.active).length;
  $: highConvictionCount = allSignals.filter((s) => s.conf >= 78).length;
  $: communityIdeas = buildCommunityIdeas(filteredSignals, communityFilter);

  function handleTrack(sig: Signal) {
    trackSignal(sig.pair, sig.dir, sig.entry, sig.agent?.name || 'manual', sig.conf);
    incrementTrackedSignals();
    notifySignalTracked(sig.pair, sig.dir);
  }

  function handleTrade(sig: Signal) {
    const params = new URLSearchParams({
      copyTrade: '1',
      pair: sig.pair,
      dir: sig.dir,
      entry: String(Math.round(sig.entry)),
      tp: String(Math.round(sig.tp)),
      sl: String(Math.round(sig.sl)),
      conf: String(Math.round(sig.conf)),
      source: sig.agent?.name || sig.source.toUpperCase(),
      reason: sig.reason,
    });
    goto(`/terminal?${params.toString()}`);
  }

  function priorityColor(p: string): string {
    return p === 'CRITICAL' ? '#ff2d55' : p === 'HIGH' ? '#ff8c3b' : p === 'MEDIUM' ? '#E8967D' : '#00ff88';
  }

  function sourceLabel(s: string): string {
    return s === 'arena' ? '⚔️ ARENA' : s === 'trade' ? '📊 TRADE' : s === 'tracked' ? '📌 TRACKED' : '🤖 AGENT';
  }

  function sourceColor(s: string): string {
    return s === 'arena' ? '#ff2d9b' : s === 'trade' ? '#3b9eff' : s === 'tracked' ? '#ff8c3b' : '#8b5cf6';
  }

  function setSignalsView(next: 'community' | 'signals' | 'oracle') {
    signalsView = next;
    const query = new URLSearchParams($page.url.searchParams);
    if (next === 'community') query.delete('view');
    else query.set('view', next);
    const qs = query.toString();
    goto(`/signals${qs ? `?${qs}` : ''}`, {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
      invalidateAll: false
    });
  }

  onMount(() => {
    const v = $page.url.searchParams.get('view');
    signalsView = v === 'signals' || v === 'oracle' ? v : 'community';
    if (v === 'live') {
      const query = new URLSearchParams($page.url.searchParams);
      query.delete('view');
      const qs = query.toString();
      void goto(`/signals${qs ? `?${qs}` : ''}`, {
        replaceState: true,
        noScroll: true,
        keepFocus: true,
        invalidateAll: false
      });
    }
  });
</script>

<div class="signals-page">
  <ContextBanner page="signals" />
  <div class="sig-header">
    <div class="sh-bg"></div>
    <div class="sh-content">
      <div class="sh-top-row">
        <h1 class="sh-title">COMMUNITY HUB</h1>
        <div class="sh-live"><span class="sh-live-dot"></span> SIGNALS + LIVE</div>
      </div>
      <p class="sh-sub">AI 시그널과 실시간 활동 피드를 한 화면에서 운영합니다</p>
      <div class="sh-flow">
        <span class="sh-flow-step">🧠 WAR ROOM</span>
        <span class="sh-flow-arrow">→</span>
        <span class="sh-flow-step active">💡 COMMUNITY HUB</span>
        <span class="sh-flow-arrow">→</span>
        <span class="sh-flow-step">🚀 COPY TRADE</span>
      </div>
      <div class="sh-counts">
        <span class="sh-count">{activeSignalCount} ACTIVE</span>
        <span class="sh-count arena">{arenaSignals.length} ARENA</span>
        <span class="sh-count trade">{tradeSignals.length} TRADE</span>
        <span class="sh-count tracked">{trackedSignals.length} TRACKED</span>
      </div>
    </div>
  </div>

  <div class="view-switch">
    <button class="vs-btn" class:active={signalsView === 'community'} on:click={() => setSignalsView('community')}>
      COMMUNITY HUB
    </button>
    <button class="vs-btn" class:active={signalsView === 'signals'} on:click={() => setSignalsView('signals')}>
      SIGNAL LIST
    </button>
    <button class="vs-btn" class:active={signalsView === 'oracle'} on:click={() => setSignalsView('oracle')}>
      ORACLE
    </button>
  </div>

  <div class="hub-summary">
    <button class="hs-card" on:click={() => setSignalsView('signals')}>
      <span class="hs-label">Total Signals</span>
      <span class="hs-value">{allSignals.length}</span>
    </button>
    <button class="hs-card" on:click={() => setSignalsView('signals')}>
      <span class="hs-label">High Conviction</span>
      <span class="hs-value">{highConvictionCount}</span>
    </button>
    <button class="hs-card" on:click={() => setSignalsView('signals')}>
      <span class="hs-label">Open Trades</span>
      <span class="hs-value">{tradeSignals.length}</span>
    </button>
    <button class="hs-card terminal" on:click={() => goto('/terminal')}>
      <span class="hs-label">Quick Action</span>
      <span class="hs-value">OPEN TERMINAL →</span>
    </button>
  </div>

  {#if signalsView === 'community'}
    <div class="community-layout">
      <section class="community-ideas">
        <div class="ci-head">
          <div>
            <div class="ci-title">Community Ideas</div>
            <div class="ci-sub">Signals + Live activity in one flow</div>
          </div>
          <button class="ci-explore" on:click={() => setSignalsView('signals')}>
            Explore {allSignals.length.toLocaleString()}+ Signals →
          </button>
        </div>
        <div class="ci-filters">
          {#each COMMUNITY_FILTERS as item}
            <button class="ci-chip" class:active={communityFilter === item.key} on:click={() => communityFilter = item.key}>{item.label}</button>
          {/each}
        </div>

        {#if communityIdeas.length === 0}
          <EmptyState
            image={CHARACTER_ART.tradeSurge}
            title="NO IDEAS YET"
            subtitle="Open trades or run Arena matches to fill community ideas"
            ctaText="⚔️ GO TO ARENA"
            ctaHref="/arena"
            icon="💡"
            variant="orange"
            compact
          />
        {:else}
          <div class="ci-grid">
            {#each communityIdeas as idea (idea.id)}
              <article class="ci-card">
                <div class="ci-top">
                  <div class="ci-tf">{idea.timeframe}</div>
                  <div class="ci-subs">★ {idea.subscribers.toLocaleString()} subscribers</div>
                </div>
                <div class="ci-strategy">{idea.strategy}</div>
                <div class="ci-bottom">
                  <div class="ci-asset">
                    <div class="ci-pair">{idea.signal.pair}</div>
                    <div class="ci-dir" class:long={idea.signal.dir === 'LONG'} class:short={idea.signal.dir === 'SHORT'}>
                      {idea.signal.dir} · {idea.signal.conf}%
                    </div>
                  </div>
                  <div class="ci-actions">
                    <button class="ci-track" on:click={() => handleTrack(idea.signal)}>Track</button>
                    <button class="ci-view" on:click={() => handleTrade(idea.signal)}>View</button>
                  </div>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </section>

      <aside class="community-live">
        <div class="cl-head">
          <span class="cl-title">⚡ LIVE STREAM</span>
          <a class="cl-link" href="/terminal">OPEN TERMINAL →</a>
        </div>
        <LivePanel embedded={true} variant="stream" />
        <div class="cl-actions">
          <button class="cl-btn signal" on:click={() => setSignalsView('signals')}>📡 Full Signal List</button>
          <button class="cl-btn arena" on:click={() => goto('/arena')}>⚔️ Jump To Arena</button>
        </div>
      </aside>
    </div>

  {:else if signalsView === 'signals'}
    <div class="filter-bar">
      {#each SIGNAL_FILTERS as item}
        <button class="filter-btn" class:active={filter === item.key} on:click={() => filter = item.key}>{item.label}</button>
      {/each}
    </div>

    <div class="signal-list">
      {#if filteredSignals.length === 0}
        <EmptyState
          image={CHARACTER_ART.tradeSurge}
          title="NO SIGNALS YET"
          subtitle="Start an Arena battle or open trades to generate signals"
          ctaText="⚔️ GO TO ARENA"
          ctaHref="/arena"
          icon="🔍"
          variant="orange"
        />
      {:else}
        {#each filteredSignals as sig (sig.id)}
          <div class="signal-card" class:inactive={!sig.active}>
            <div class="sig-strip" style="background:{priorityColor(sig.priority)}"></div>
            <div class="sig-body">
              <div class="sig-top">
                <span class="sig-source" style="color:{sourceColor(sig.source)};border-color:{sourceColor(sig.source)}">{sourceLabel(sig.source)}</span>
                {#if sig.agent}
                  <div class="sig-agent">
                    {#if sig.agent.img?.def}
                      <img src={sig.agent.img.def} alt={sig.agent.name} class="sig-agent-img" loading="lazy" />
                    {/if}
                    <span class="sig-agent-name" style="color:{sig.agent.color}">{sig.agent.name}</span>
                  </div>
                {/if}
                <span class="sig-pair">{sig.pair}</span>
                <span class="sig-priority" style="color:{priorityColor(sig.priority)};border-color:{priorityColor(sig.priority)}">{sig.priority}</span>
                <span class="sig-time">{sig.time}</span>
              </div>

              <div class="sig-direction">
                <span class="sig-dir-badge" class:long={sig.dir === 'LONG'} class:short={sig.dir === 'SHORT'}>
                  {sig.dir === 'LONG' ? '▲' : '▼'} {sig.dir}
                </span>
                <span class="sig-conf">{sig.conf}% CONF</span>
                <span class="sig-rr">R:R {sig.rr}</span>
              </div>

              <div class="sig-levels">
                <div class="sig-level"><span class="sl-label">ENTRY</span><span class="sl-val entry">${sig.entry.toLocaleString()}</span></div>
                <div class="sig-level"><span class="sl-label">TP</span><span class="sl-val tp">${sig.tp.toLocaleString()}</span></div>
                <div class="sig-level"><span class="sl-label">SL</span><span class="sl-val sl">${sig.sl.toLocaleString()}</span></div>
              </div>

              <div class="sig-reason">{sig.reason}</div>

              {#if sig.active}
                <div class="sig-actions">
                  {#if sig.source !== 'tracked'}
                    <button class="sig-btn track" on:click={() => handleTrack(sig)}>📌 TRACK</button>
                  {/if}
                  <button class="sig-btn copy-trade" on:click={() => handleTrade(sig)}>
                    🚀 COPY TRADE
                  </button>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {:else}
    <section class="community-oracle">
      <OracleLeaderboard embedded={true} />
    </section>
  {/if}
</div>

<style>
  .signals-page {
    height: 100%;
    overflow-y: auto;
    background: #00120a;
  }

  .sig-header {
    position: relative;
    padding: 20px 24px;
    border-bottom: 1px solid rgba(232,150,125,.15);
    background: linear-gradient(135deg, rgba(232,150,125,.15), rgba(232,150,125,.05));
    overflow: hidden;
  }
  .sig-header::after {
    content: '';
    position: absolute;
    right: -10px;
    top: -10px;
    width: 110px;
    height: 110px;
    background: url('/doge/trade-expressions.png') center/cover no-repeat;
    opacity: .08;
    border-radius: 50%;
    pointer-events: none;
    filter: blur(1px);
  }
  .sh-bg {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 70% 30%, rgba(232,150,125,.08), transparent 60%);
  }
  .sh-content { position: relative; z-index: 2; }
  .sh-title {
    font-family: var(--fc);
    font-size: 28px;
    color: #E8967D;
    text-shadow: none;
    letter-spacing: 3px;
  }
  .sh-top-row { display: flex; align-items: center; gap: 8px; }
  .sh-live {
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 1.5px;
    color: #00120a;
    background: rgba(0,255,136,.8);
    padding: 2px 7px;
    display: flex;
    align-items: center;
    gap: 3px;
    border-radius: 4px;
  }
  .sh-live-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #00120a;
    animation: sh-blink .9s infinite;
  }
  @keyframes sh-blink { 0%,100%{opacity:1} 50%{opacity:.2} }
  .sh-sub {
    font-family: var(--fm);
    font-size: 9px;
    color: rgba(240,237,228,.5);
    letter-spacing: 1.2px;
    margin-top: 2px;
  }
  .sh-flow {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 7px;
  }
  .sh-flow-step {
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 1px;
    color: rgba(255,255,255,.45);
    padding: 2px 6px;
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 4px;
    background: rgba(255,255,255,.03);
  }
  .sh-flow-step.active {
    color: #E8967D;
    border-color: rgba(232,150,125,.4);
    background: rgba(232,150,125,.15);
  }
  .sh-flow-arrow { font-size: 8px; color: rgba(255,255,255,.2); }
  .sh-counts {
    display: flex;
    gap: 6px;
    margin-top: 9px;
    flex-wrap: wrap;
  }
  .sh-count {
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 1.3px;
    background: #000;
    color: var(--grn);
    padding: 2px 8px;
    border-radius: 4px;
  }
  .sh-count.arena { color: #ff2d9b; }
  .sh-count.trade { color: #3b9eff; }
  .sh-count.tracked { color: #ff8c3b; }

  .view-switch {
    display: flex;
    gap: 6px;
    padding: 10px 16px 8px;
    border-bottom: 1px solid rgba(255,255,255,.06);
    background: rgba(0,0,0,.28);
    position: sticky;
    top: 0;
    z-index: 4;
  }
  .vs-btn {
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 1px;
    border-radius: 8px;
    border: 1.5px solid rgba(255,255,255,.18);
    background: rgba(255,255,255,.04);
    color: rgba(255,255,255,.55);
    padding: 7px 11px;
    cursor: pointer;
    transition: all .12s;
  }
  .vs-btn.active {
    background: rgba(232,150,125,.15);
    color: #E8967D;
    border-color: rgba(232,150,125,.4);
  }
  .hub-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    padding: 8px 16px 12px;
    background: rgba(0,0,0,.22);
    border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .hs-card {
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 10px;
    background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.01));
    padding: 9px 10px;
    text-align: left;
    cursor: pointer;
    transition: transform .12s, border-color .12s, background .12s;
  }
  .hs-card:hover {
    transform: translateY(-1px);
    border-color: rgba(255,255,255,.28);
    background: linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.02));
  }
  .hs-card.terminal {
    background: linear-gradient(135deg, rgba(0,255,136,.12), rgba(43,179,255,.12));
  }
  .hs-label {
    display: block;
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 1px;
    color: rgba(255,255,255,.48);
    margin-bottom: 3px;
  }
  .hs-value {
    display: block;
    font-family: var(--fd);
    font-size: 13px;
    font-weight: 900;
    color: #fff;
    letter-spacing: .5px;
  }

  .community-layout {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
    gap: 0;
    min-height: 560px;
    background: transparent;
  }
  .community-ideas {
    padding: 14px 16px 18px;
    border-right: 1px solid rgba(232,150,125,.1);
  }
  .ci-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .ci-title {
    font-family: var(--fd);
    font-size: 26px;
    color: #F0EDE4;
    letter-spacing: .4px;
    line-height: 1;
  }
  .ci-sub {
    font-family: var(--fm);
    font-size: 11px;
    color: rgba(240,237,228,.45);
    margin-top: 5px;
    letter-spacing: .4px;
  }
  .ci-explore {
    border: 1px solid rgba(232,150,125,.25);
    background: rgba(232,150,125,.12);
    border-radius: 999px;
    padding: 7px 11px;
    font-family: var(--fm);
    font-size: 12px;
    font-weight: 700;
    color: #E8967D;
    white-space: nowrap;
    cursor: pointer;
    transition: background .12s, transform .12s;
  }
  .ci-explore:hover {
    background: rgba(232,150,125,.2);
    transform: translateY(-1px);
  }
  .ci-filters {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .ci-chip {
    font-family: var(--fm);
    font-size: 12px;
    font-weight: 700;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,.1);
    padding: 6px 12px;
    cursor: pointer;
    background: rgba(255,255,255,.05);
    color: rgba(240,237,228,.55);
    transition: all .12s;
  }
  .ci-chip.active {
    background: rgba(232,150,125,.15);
    color: #E8967D;
    box-shadow: none;
    border-color: rgba(232,150,125,.35);
  }
  .ci-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 12px;
  }
  .ci-card {
    background: rgba(255,255,255,.03);
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.08);
    min-height: 168px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: none;
    transition: transform .13s, box-shadow .13s, border-color .13s;
  }
  .ci-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,.3);
    border-color: rgba(232,150,125,.15);
  }
  .ci-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .ci-tf {
    border-radius: 999px;
    padding: 4px 10px;
    font-family: var(--fm);
    font-size: 11px;
    font-weight: 900;
    color: #E8967D;
    background: rgba(232,150,125,.2);
  }
  .ci-subs {
    border-radius: 999px;
    padding: 4px 9px;
    font-family: var(--fm);
    font-size: 10px;
    color: rgba(240,237,228,.4);
    background: rgba(255,255,255,.05);
    white-space: nowrap;
  }
  .ci-strategy {
    align-self: flex-start;
    border-radius: 999px;
    padding: 6px 10px;
    font-family: var(--fm);
    font-size: 11px;
    color: rgba(240,237,228,.55);
    background: rgba(255,255,255,.04);
    box-shadow: none;
    max-width: 100%;
    line-height: 1.2;
  }
  .ci-bottom {
    margin-top: auto;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8px;
  }
  .ci-pair {
    font-family: var(--fd);
    font-size: 18px;
    color: #F0EDE4;
    line-height: 1.1;
  }
  .ci-dir {
    font-family: var(--fm);
    font-size: 10px;
    margin-top: 4px;
    font-weight: 700;
  }
  .ci-dir.long { color: #0d9f59; }
  .ci-dir.short { color: #d64866; }
  .ci-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ci-track,
  .ci-view {
    border: none;
    border-radius: 999px;
    padding: 7px 12px;
    font-family: var(--fm);
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }
  .ci-track {
    background: rgba(232,150,125,.1);
    color: #E8967D;
    border: 1px solid rgba(232,150,125,.25);
  }
  .ci-view {
    color: #000;
    background: var(--grn);
    border: 1.5px solid rgba(0,0,0,.3);
  }
  .ci-track:hover,
  .ci-view:hover {
    filter: brightness(1.04);
  }

  .community-live {
    background: linear-gradient(180deg, #0c1e32 0%, #08111f 100%);
    border-left: 1px solid rgba(255,255,255,.06);
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  .cl-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 11px 12px;
    border-bottom: 1px solid rgba(255,255,255,.08);
    background: rgba(0,0,0,.2);
  }
  .cl-title {
    font-family: var(--fd);
    font-size: 11px;
    letter-spacing: 1px;
    color: var(--yel);
  }
  .cl-link {
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 700;
    color: #86d1ff;
    text-decoration: none;
    letter-spacing: 1px;
  }
  .cl-link:hover { text-decoration: underline; }
  .cl-actions {
    margin-top: auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
    padding: 10px 10px 12px;
    border-top: 1px solid rgba(255,255,255,.07);
    background: rgba(0,0,0,.24);
  }
  .cl-btn {
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,.14);
    background: rgba(255,255,255,.05);
    color: #d7e9ff;
    font-family: var(--fm);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: .9px;
    padding: 8px 9px;
    cursor: pointer;
    transition: all .12s;
  }
  .cl-btn.signal {
    border-color: rgba(59, 158, 255, .4);
    color: #98d4ff;
  }
  .cl-btn.arena {
    border-color: rgba(255, 45, 155, .35);
    color: #ff9acf;
  }
  .cl-btn:hover {
    background: rgba(255,255,255,.11);
  }

  .community-oracle {
    min-height: 560px;
    padding: 12px 16px 20px;
    background: linear-gradient(180deg, #151525 0%, #090914 100%);
  }

  .filter-bar {
    display: flex;
    gap: 4px;
    padding: 8px 16px;
    border-bottom: 2px solid rgba(255,255,255,.05);
    overflow-x: auto;
  }
  .filter-btn {
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
    white-space: nowrap;
  }
  .filter-btn.active {
    background: var(--ora);
    color: #000;
    border-color: var(--ora);
    box-shadow: 0 0 8px rgba(255,140,59,.3);
  }

  .signal-list {
    padding: 10px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .signal-card {
    display: flex;
    border: 2px solid rgba(255,255,255,.06);
    border-radius: 10px;
    background: rgba(255,255,255,.02);
    overflow: hidden;
    transition: all .15s;
  }
  .signal-card:hover { background: rgba(255,255,255,.04); border-color: rgba(255,255,255,.1); }
  .signal-card.inactive { opacity: .5; }
  .sig-strip { width: 3px; flex-shrink: 0; }
  .sig-body { flex: 1; padding: 8px 10px; }
  .sig-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap; }
  .sig-source {
    font-family: var(--fm);
    font-size: 6px;
    font-weight: 900;
    letter-spacing: 1px;
    padding: 1px 5px;
    border: 1px solid;
    border-radius: 3px;
  }
  .sig-agent { display: flex; align-items: center; gap: 3px; }
  .sig-agent-img {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1px solid rgba(255,255,255,.1);
    object-fit: cover;
  }
  .sig-agent-name { font-family: var(--fm); font-size: 7px; font-weight: 900; letter-spacing: .5px; }
  .sig-pair { font-family: var(--fd); font-size: 11px; font-weight: 900; color: #fff; }
  .sig-priority {
    font-family: var(--fm);
    font-size: 6px;
    font-weight: 900;
    letter-spacing: 1px;
    padding: 1px 5px;
    border: 1px solid;
    border-radius: 3px;
  }
  .sig-time { font-family: var(--fm); font-size: 7px; color: rgba(255,255,255,.2); margin-left: auto; }
  .sig-direction { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .sig-dir-badge {
    font-family: var(--fm);
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 1px;
    padding: 2px 6px;
    border: 1.5px solid;
    border-radius: 4px;
  }
  .sig-dir-badge.long { color: var(--grn); border-color: rgba(0,255,136,.4); background: rgba(0,255,136,.08); }
  .sig-dir-badge.short { color: var(--red); border-color: rgba(255,45,85,.4); background: rgba(255,45,85,.08); }
  .sig-conf { font-family: var(--fm); font-size: 8px; font-weight: 700; color: var(--yel); }
  .sig-rr { font-family: var(--fm); font-size: 8px; color: rgba(255,255,255,.4); }
  .sig-levels {
    display: flex;
    gap: 12px;
    margin-bottom: 4px;
    padding: 4px 6px;
    background: rgba(255,255,255,.02);
    border-radius: 4px;
  }
  .sig-level { display: flex; flex-direction: column; }
  .sl-label { font-family: var(--fm); font-size: 6px; color: rgba(255,255,255,.25); }
  .sl-val { font-family: var(--fd); font-size: 11px; font-weight: 900; }
  .sl-val.entry { color: #fff; }
  .sl-val.tp { color: var(--grn); }
  .sl-val.sl { color: var(--red); }
  .sig-reason { font-family: var(--fm); font-size: 7px; color: rgba(255,255,255,.4); line-height: 1.4; margin-bottom: 4px; }
  .sig-actions { display: flex; gap: 4px; }
  .sig-btn {
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 1px;
    padding: 4px 10px;
    border-radius: 5px;
    cursor: pointer;
    transition: all .15s;
  }
  .sig-btn.track {
    background: rgba(255,140,59,.1);
    color: var(--ora);
    border: 1.5px solid rgba(255,140,59,.3);
  }
  .sig-btn.track:hover { background: rgba(255,140,59,.2); }
  .sig-btn.copy-trade {
    background: var(--grn);
    color: #000;
    border: 2px solid #000;
    font-weight: 900;
    letter-spacing: 1.5px;
    padding: 5px 14px;
    border-radius: 6px;
    box-shadow: 2px 2px 0 #000;
    transition: all .12s;
  }
  .sig-btn.copy-trade:hover { transform: translate(-1px,-1px); box-shadow: 3px 3px 0 #000; }

  @media (max-width: 1200px) {
    .hub-summary {
      grid-template-columns: 1fr 1fr;
    }
    .community-layout {
      grid-template-columns: 1fr;
    }
    .community-ideas {
      border-right: none;
      border-bottom: 1px solid rgba(232,150,125,.1);
    }
    .community-live {
      min-height: 420px;
    }
  }

  @media (max-width: 820px) {
    .sig-header {
      padding: 16px 14px;
    }
    .sh-title {
      font-size: 23px;
      letter-spacing: 2px;
    }
    .sh-live {
      letter-spacing: 1px;
    }
    .sh-flow {
      flex-wrap: wrap;
    }
    .view-switch,
    .community-ideas,
    .signal-list {
      padding-left: 12px;
      padding-right: 12px;
    }
    .vs-btn {
      flex: 1;
      text-align: center;
      padding: 8px 10px;
    }
    .hub-summary {
      padding-left: 12px;
      padding-right: 12px;
      grid-template-columns: 1fr;
    }
    .ci-head {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
    .ci-explore {
      white-space: normal;
    }
    .ci-grid {
      grid-template-columns: 1fr;
    }
    .ci-bottom {
      flex-direction: column;
      align-items: flex-start;
      gap: 9px;
    }
    .ci-actions {
      width: 100%;
    }
    .ci-track,
    .ci-view {
      flex: 1;
    }
    .cl-actions {
      grid-template-columns: 1fr;
    }
    .sig-levels {
      gap: 8px;
      justify-content: space-between;
    }
    .sig-actions {
      flex-wrap: wrap;
    }
  }
</style>
