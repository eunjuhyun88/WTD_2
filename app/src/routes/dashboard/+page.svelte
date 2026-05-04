<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { buildCanonicalHref } from '$lib/seo/site';
  import { allStrategies } from '$lib/stores/strategyStore';
  import { priceStore } from '$lib/stores/priceStore';
  import { walletStore, openWalletModal } from '$lib/stores/walletStore';
  import KimchiPremiumBadge from '$lib/components/market/KimchiPremiumBadge.svelte';
  import DashActivityGrid from '$lib/components/dashboard/DashActivityGrid.svelte';
  import { AlertStrip, OpportunityCard, StatsZone, SystemStatusZone } from '$lib/hubs/dashboard';
  import F60ProgressCard from '$lib/components/ai/F60ProgressCard.svelte';
  import StreakBadgeCard from '$lib/components/passport/StreakBadgeCard.svelte';
  import { streakSnapshot, startStreakPolling } from '$lib/stores/streak.store';
  import VerdictInboxSection from '$lib/components/patterns/VerdictInboxSection.svelte';
  import { track } from '$lib/analytics';
  import type { CaptureRow, OpportunityScore } from './+page.server';

  interface PassportSummary {
    tier: string;
    winRate: number;
    totalLp: number;
    streak: number;
    wins: number;
    losses: number;
  }

  let { data } = $props();

  const wallet = $derived($walletStore);
  let passport = $state<PassportSummary | null>(null);

  onMount(() => {
    const stopStreak = startStreakPolling();

    (async () => {
      try {
        const r = await fetch('/api/profile/passport');
        if (r.ok) {
          const d = (await r.json()) as { passport?: PassportSummary };
          if (d.passport) passport = d.passport;
        }
      } catch { /* silent */ }

      track('dashboard_view', {
        opportunities_count: topOpportunities.length,
        streak: passport?.streak ?? 0,
      });
    })();

    return () => stopStreak();
  });

  const sourcePendingVerdicts = $derived(data.pendingVerdicts ?? []);
  const topOpportunities = $derived((data.topOpportunities ?? []) as OpportunityScore[]);
  const macroRegime = $derived(data.macroRegime ?? 'neutral');
  const opportunityPersonalized = $derived(data.opportunityPersonalized ?? false);
  const userStats = $derived(data.userStats ?? null);
  const flywheelHealth = $derived(data.flywheelHealth ?? null);
  const top3Opportunities = $derived(topOpportunities.slice(0, 3));

  let pendingVerdicts = $state<CaptureRow[]>([]);
  $effect(() => {
    pendingVerdicts = [...sourcePendingVerdicts];
  });

  let labellingId = $state<string | null>(null);
  let labelError = $state<string | null>(null);

  async function submitVerdict(captureId: string, verdict: 'valid' | 'invalid' | 'near_miss' | 'too_early' | 'too_late', note?: string) {
    labellingId = captureId;
    labelError = null;
    try {
      const resp = await fetch(`/api/captures/${captureId}/verdict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ verdict, user_note: note ?? null }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        labelError = (err as { detail?: string }).detail ?? `Error ${resp.status}`;
        return;
      }
      pendingVerdicts = pendingVerdicts.filter(c => c.capture_id !== captureId);
    } catch (e) {
      labelError = (e as Error).message;
    } finally {
      labellingId = null;
    }
  }

  interface WatchingCapture {
    capture_id: string;
    symbol: string;
    pattern_slug: string;
    status: string;
    captured_at_ms: number;
    pnl_pct: number | null;
  }

  let watchingCaptures = $state<WatchingCapture[]>([]);
  let watchingLoading = $state(true);

  async function loadWatching() {
    try {
      const res = await fetch('/api/captures?watching=true&limit=8');
      if (res.ok) {
        const data = await res.json();
        watchingCaptures = (data.captures ?? []).map((c: Record<string, unknown>) => ({
          capture_id: c.capture_id as string,
          symbol: (c.symbol as string) || '—',
          pattern_slug: (c.pattern_slug as string) || '',
          status: (c.status as string) || 'watching',
          captured_at_ms: (c.captured_at_ms as number) || 0,
          pnl_pct: (c.exit_return_pct as number | null) ?? null,
        }));
      }
    } catch { /* silent */ } finally {
      watchingLoading = false;
    }
  }

  $effect(() => {
    loadWatching();
    const interval = setInterval(loadWatching, 30_000);
    return () => clearInterval(interval);
  });

  const strategies = $derived($allStrategies);
  const prices = $derived($priceStore);
  const btcEntry = $derived(prices?.BTC);
  const btcPrice = $derived(typeof btcEntry === 'object' && btcEntry ? btcEntry.price : 0);
  const testedChallengeCount = $derived(strategies.filter((entry) => entry.lastResult).length);
  const latestActivityText = $derived(
    strategies.length > 0
      ? timeSince(Math.max(...strategies.map((entry) => entry.lastModified)))
      : '—'
  );

  function fmtPct(v: number | null | undefined): string {
    if (v == null) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}%`;
  }

  function fmtPrice(v: number): string {
    if (!v) return '—';
    return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function timeSince(ms: number): string {
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }


</script>

<svelte:head>
  <title>Dashboard — Cogotchi</title>
  <meta name="robots" content="noindex, nofollow" />
  <link rel="canonical" href={buildCanonicalHref('/dashboard')} />
</svelte:head>

<div class="surface-page chrome-layout dash">
  <header class="surface-hero surface-fixed-hero dashboard-workbar">
    <div class="surface-copy dashboard-workbar-copy">
      <span class="surface-kicker">Home</span>
      <div class="dashboard-title-stack">
        <h1 class="surface-title">My Workspace</h1>
        <span class="dashboard-workbar-note">Wallet · Passport · Active positions at a glance</span>
      </div>
    </div>
    <div class="surface-stats dashboard-workbar-stats">
      <article class="surface-stat dashboard-stat">
        <span class="surface-meta">BTC</span>
        <strong>{fmtPrice(btcPrice)}</strong>
      </article>
      <article class="surface-stat dashboard-stat">
        <span class="surface-meta">Setups</span>
        <strong>{strategies.length}</strong>
      </article>
      <article class="surface-stat dashboard-stat">
        <span class="surface-meta">Tested</span>
        <strong>{testedChallengeCount}</strong>
      </article>
      <article class="surface-stat dashboard-stat">
        <span class="surface-meta">Activity</span>
        <strong>{latestActivityText}</strong>
      </article>
    </div>
    <div class="topbar-actions">
      <KimchiPremiumBadge />
      <button class="surface-button" onclick={() => goto('/cogochi')}>Open Terminal</button>
      <button class="surface-button-secondary" onclick={() => goto('/lab')}>Open Lab</button>
    </div>
  </header>

  <div class="surface-scroll-body">

  <!-- ── Alert Strip ── -->
  <AlertStrip />

  <!-- ── Zone A: 오늘의 기회 ── -->
  {#if top3Opportunities.length > 0}
    <section class="dash-opportunity-zone">
      <div class="dash-zone-header">
        <h2 class="dash-zone-title">오늘의 기회</h2>
        <a href="/patterns/search" class="dash-zone-more">전체보기 →</a>
      </div>
      <div class="opp-cards-row">
        {#each top3Opportunities as opp, i}
          <OpportunityCard {opp} rank={i} />
        {/each}
      </div>
    </section>
  {/if}

  <!-- ── Zone B+C: 내 통계 / 시스템 상태 ── -->
  <div class="dash-meta-row">
    <StatsZone {passport} {userStats} />
    <SystemStatusZone {flywheelHealth} />
    <F60ProgressCard />
  </div>

  <!-- ── Section 1: Portfolio Strip (64px) ── -->
  <div class="trader-strip portfolio-strip">
    <div class="ts-item">
      <span class="ts-label">Day P&L</span>
      <span class="ts-value" class:pos={passport && passport.winRate >= 50} class:neg={passport && passport.winRate < 50}>
        {passport ? (passport.winRate >= 50 ? '+' : '') + passport.winRate.toFixed(1) + '%' : '—'}
      </span>
    </div>
    <span class="ts-sep">│</span>
    <div class="ts-item">
      <span class="ts-label">Win</span>
      <span class="ts-value" class:pos={passport && passport.winRate >= 55}>
        {passport ? `${passport.wins}/${passport.wins + passport.losses} (${passport.winRate.toFixed(0)}%)` : '—'}
      </span>
    </div>
    <span class="ts-sep">│</span>
    <div class="ts-item">
      <span class="ts-label">Max DD</span>
      <span class="ts-value neg">—</span>
    </div>
  </div>

  <!-- ── Section 2: Today KPIs (80px) ── -->
  <div class="trader-strip kpi-strip">
    <div class="kpi-item">
      <span class="kpi-num">{watchingCaptures.length + pendingVerdicts.length}</span>
      <span class="kpi-label">Captures</span>
    </div>
    <div class="kpi-item">
      <span class="kpi-num">{pendingVerdicts.length}</span>
      <span class="kpi-label">Pending</span>
    </div>
    <div class="kpi-item">
      <span class="kpi-num" class:pos={passport && passport.winRate >= 55}>{passport ? passport.winRate.toFixed(0) + '%' : '—'}</span>
      <span class="kpi-label">Win Rate</span>
    </div>
    <div class="kpi-item">
      <span class="kpi-num">{passport ? passport.totalLp.toLocaleString() : '—'}</span>
      <span class="kpi-label">LP</span>
    </div>
  </div>

  <!-- ── Section 3+4: Watching | Scanner 50/50 ── -->
  <div class="trader-split-row">
    <div class="split-pane">
      <div class="split-pane-header">Watching</div>
      {#if watchingLoading}
        <p class="split-empty">Loading…</p>
      {:else if watchingCaptures.length === 0}
        <p class="split-empty">No active watches</p>
      {:else}
        {#each watchingCaptures.slice(0, 6) as cap}
          <div class="split-row-item">
            <span class="split-sym">{cap.symbol}</span>
            <span class="split-slug">{cap.pattern_slug || '—'}</span>
            <span class="split-pnl" class:pos={cap.pnl_pct != null && cap.pnl_pct >= 0} class:neg={cap.pnl_pct != null && cap.pnl_pct < 0}>
              {cap.pnl_pct != null ? (cap.pnl_pct >= 0 ? '+' : '') + cap.pnl_pct.toFixed(1) + '%' : 'watching'}
            </span>
          </div>
        {/each}
      {/if}
    </div>
    <div class="split-divider"></div>
    <div class="split-pane">
      <div class="split-pane-header">Scanner</div>
      {#if topOpportunities.length === 0}
        <p class="split-empty">No signals</p>
      {:else}
        {#each topOpportunities.slice(0, 6) as opp}
          <div class="split-row-item">
            <span class="split-sym">{opp.symbol}</span>
            <span class="split-score">{opp.totalScore.toFixed(2)}</span>
            <span class="split-tier" class:pos={opp.direction === 'long'} class:neg={opp.direction === 'short'}>
              {opp.direction}
            </span>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <!-- ── Hero Zone (W-0402 PR12): Streak 60% top / Wallet·Tier·Verdicts 40% sub-row ── -->
  <section class="dash-hero-zone" data-testid="dashboard-hero-zone">
    <!-- Top hero row: StreakBadgeCard at 60% prominence -->
    <div class="dash-hero-streak" data-testid="dashboard-streak-hero">
      <div class="dash-hero-streak-header">
        <span class="dash-hero-label">Streak</span>
        <a href="/passport" class="dash-hero-link">Passport →</a>
      </div>
      <div class="dash-hero-streak-body">
        <span class="dash-hero-streak-num" style="color: var(--accent-amb, #f5a623);">
          {$streakSnapshot.streak_days}
        </span>
        <span class="dash-hero-streak-unit">days 🔥</span>
      </div>
      {#if $streakSnapshot.streak_next_threshold !== null}
        <p class="dash-hero-streak-sub">
          → next: {$streakSnapshot.streak_next_threshold} ({$streakSnapshot.streak_next_threshold - $streakSnapshot.streak_days} more)
        </p>
      {:else}
        <p class="dash-hero-streak-sub dash-hero-streak-sub--complete">All badges earned</p>
      {/if}
      <div class="dash-hero-streak-badge">
        <StreakBadgeCard
          streak_days={$streakSnapshot.streak_days}
          streak_next_threshold={$streakSnapshot.streak_next_threshold}
        />
      </div>
    </div>

    <!-- Bottom sub-row: Wallet | Tier | Verdicts (3-column) -->
    <div class="dash-hero-sub-row">
      <!-- Wallet sub-card -->
      <div class="dash-sub-card dash-sub-card--wallet">
        <span class="dash-sub-label">Wallet</span>
        {#if wallet.connected && wallet.address}
          <div class="dash-sub-content">
            <span class="home-wallet-dot home-wallet-dot--on"></span>
            <span class="dash-sub-value">{wallet.shortAddr ?? wallet.address.slice(0, 6) + '…' + wallet.address.slice(-4)}</span>
          </div>
          {#if wallet.balance > 0}
            <span class="dash-sub-meta">{wallet.balance.toFixed(4)} ETH · {wallet.chain ?? 'ARB'}</span>
          {:else}
            <span class="dash-sub-meta">{wallet.chain ?? 'ARB'}</span>
          {/if}
        {:else}
          <div class="dash-sub-content">
            <span class="home-wallet-dot home-wallet-dot--off"></span>
            <button class="home-wallet-connect" onclick={() => openWalletModal()}>Connect</button>
          </div>
          <span class="dash-sub-meta">Not connected</span>
        {/if}
      </div>

      <!-- Tier sub-card -->
      <div class="dash-sub-card dash-sub-card--tier">
        <span class="dash-sub-label">Tier</span>
        {#if passport}
          <div class="dash-sub-content">
            <span class="home-pp-tier" data-tier={passport.tier.toLowerCase()}>{passport.tier}</span>
          </div>
          <span class="dash-sub-meta">
            {passport.winRate.toFixed(1)}% win · {passport.totalLp.toLocaleString()} LP
          </span>
        {:else if wallet.connected}
          <div class="dash-sub-content dash-sub-loading">Loading…</div>
          <span class="dash-sub-meta">—</span>
        {:else}
          <div class="dash-sub-content dash-sub-empty">—</div>
          <span class="dash-sub-meta">Connect wallet</span>
        {/if}
      </div>

      <!-- Verdicts sub-card -->
      <div class="dash-sub-card dash-sub-card--verdicts">
        <span class="dash-sub-label">Verdicts</span>
        <div class="dash-sub-content">
          <span class="dash-sub-value" class:pos={pendingVerdicts.length === 0}>{pendingVerdicts.length}</span>
        </div>
        <span class="dash-sub-meta">pending · {passport ? passport.wins + passport.losses : '—'} total</span>
      </div>
    </div>
  </section>

  <!-- Verdict inbox (W-0403 PR12) -->
  <section class="dash-verdict-inbox" data-testid="dashboard-verdict-inbox">
    <VerdictInboxSection />
  </section>

  <DashActivityGrid
    {topOpportunities}
    {opportunityPersonalized}
    {macroRegime}
    {pendingVerdicts}
    {labellingId}
    {labelError}
    {watchingCaptures}
    {watchingLoading}
    onVerdict={submitVerdict}
  />

  </div>
</div>

<style>
  /* ── Hero Zone (W-0402 PR12): Streak 60% top / Wallet·Tier·Verdicts sub-row ── */
  .dash-hero-zone {
    padding: var(--sp-3, 12px) var(--sp-4, 16px) 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3, 12px);
  }

  /* Top hero row — StreakBadgeCard + big number */
  .dash-hero-streak {
    background: var(--surface-2, rgba(255, 255, 255, 0.03));
    border: 1px solid rgba(245, 166, 35, 0.18);
    border-radius: 10px;
    padding: var(--sp-4, 16px);
    display: flex;
    flex-direction: column;
    gap: var(--sp-3, 10px);
  }

  .dash-hero-streak-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .dash-hero-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-primary, rgba(250, 247, 235, 0.55));
  }

  .dash-hero-link {
    font-size: 10px;
    color: rgba(249, 216, 194, 0.4);
    text-decoration: none;
    transition: color 0.15s;
  }
  .dash-hero-link:hover { color: rgba(249, 216, 194, 0.8); }

  .dash-hero-streak-body {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .dash-hero-streak-num {
    font-size: var(--type-xl, 2.5rem);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: var(--accent-amb, #f5a623);
  }

  .dash-hero-streak-unit {
    font-size: 1rem;
    color: var(--text-primary, rgba(250, 247, 235, 0.7));
  }

  .dash-hero-streak-sub {
    margin: 0;
    font-size: 11px;
    color: var(--text-primary, rgba(250, 247, 235, 0.5));
    font-family: 'JetBrains Mono', monospace;
  }

  .dash-hero-streak-sub--complete {
    color: var(--accent-amb, #f5a623);
  }

  .dash-hero-streak-badge {
    margin-top: 4px;
  }

  /* Bottom sub-row: 3-column cards */
  .dash-hero-sub-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-3, 10px);
  }

  .dash-sub-card {
    background: var(--surface-1, rgba(255, 255, 255, 0.02));
    border: 1px solid rgba(249, 216, 194, 0.07);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .dash-sub-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-primary, rgba(250, 247, 235, 0.35));
  }

  .dash-sub-content {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .dash-sub-value {
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: rgba(250, 247, 235, 0.85);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dash-sub-value.pos { color: var(--pos, #22AB94); }

  .dash-sub-meta {
    font-size: 10px;
    color: rgba(250, 247, 235, 0.3);
    font-family: 'JetBrains Mono', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dash-sub-loading, .dash-sub-empty {
    font-size: 11px;
    color: rgba(250, 247, 235, 0.25);
    font-style: italic;
  }

  /* Mobile: hero stacks above sub-row; sub-row becomes 1-col */
  @media (max-width: 768px) {
    .dash-hero-sub-row {
      grid-template-columns: 1fr;
    }
  }

  /* ── Zone A: 오늘의 기회 ── */
  .dash-opportunity-zone {
    padding: 12px 16px 0;
  }
  .dash-zone-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .dash-zone-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--g9);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }
  .dash-zone-more {
    font-size: 9px;
    color: var(--g7);
    text-decoration: none;
  }
  .dash-zone-more:hover { color: var(--g9); }
  .opp-cards-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  /* ── Zone B+C: 내 통계 / 시스템 상태 ── */
  .dash-meta-row {
    display: flex;
    gap: 8px;
    padding: 8px 16px 0;
  }

  /* ── Trader Strips ── */
  .trader-strip {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 20px;
    background: var(--g1, #0c0a09);
    border-bottom: 1px solid var(--g3, #1c1918);
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
  }

  .portfolio-strip { height: 64px; }

  .ts-item {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .ts-label {
    font-size: var(--ui-text-xs);
    color: var(--g5, #3d3830);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .ts-value {
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--g8, #cec9c4);
  }
  .ts-value.pos { color: var(--pos, #22AB94); }
  .ts-value.neg { color: var(--neg, #F23645); }
  .ts-sep { color: var(--g4, #272320); font-size: 14px; }

  .kpi-strip { height: 80px; gap: 24px; }
  .kpi-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .kpi-num {
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--g9, #eceae8);
  }
  .kpi-num.pos { color: var(--pos, #22AB94); }
  .kpi-label {
    font-size: var(--ui-text-xs);
    color: var(--g5, #3d3830);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .trader-split-row {
    display: flex;
    min-height: 160px;
    max-height: 240px;
    border-bottom: 1px solid var(--g3, #1c1918);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
  }
  .split-pane {
    flex: 1;
    min-width: 0;
    padding: 8px 12px;
    overflow-y: auto;
  }
  .split-pane-header {
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--g6, #6b6460);
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .split-divider {
    width: 1px;
    background: var(--g3, #1c1918);
    flex-shrink: 0;
  }
  .split-row-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
    border-bottom: 1px solid var(--g2, #131110);
  }
  .split-sym {
    font-weight: 700;
    color: var(--g8, #cec9c4);
    min-width: 60px;
  }
  .split-slug {
    flex: 1;
    color: var(--g5, #3d3830);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .split-score {
    color: var(--amb, #f5a623);
    font-variant-numeric: tabular-nums;
  }
  .split-tier, .split-pnl {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    min-width: 50px;
    text-align: right;
  }
  .split-tier.pos, .split-pnl.pos { color: var(--pos, #22AB94); }
  .split-tier.neg, .split-pnl.neg { color: var(--neg, #F23645); }
  .split-empty {
    color: var(--g5, #3d3830);
    font-size: var(--ui-text-xs);
    margin: 0;
    padding: 8px 0;
  }

  .dash-verdict-inbox {
    padding: 8px 16px 0;
  }

  /* Wallet dot + connect button (reused in hero sub-card) */
  .home-wallet-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .home-wallet-dot--on  { background: #22AB94; }
  .home-wallet-dot--off { background: rgba(250, 247, 235, 0.2); }

  .home-wallet-connect {
    background: none;
    border: 1px solid rgba(249, 216, 194, 0.2);
    color: rgba(249, 216, 194, 0.6);
    font-size: var(--ui-text-xs);
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }
  .home-wallet-connect:hover {
    border-color: rgba(249, 216, 194, 0.5);
    color: rgba(249, 216, 194, 0.9);
  }

  .home-pp-tier {
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(249, 216, 194, 0.08);
    color: rgba(249, 216, 194, 0.7);
  }
  .home-pp-tier[data-tier="gold"]     { background: rgba(255, 193, 7, 0.12);  color: #FFC107; }
  .home-pp-tier[data-tier="silver"]   { background: rgba(176, 196, 222, 0.12); color: #B0C4DE; }
  .home-pp-tier[data-tier="platinum"] { background: rgba(147, 112, 219, 0.12); color: #9370DB; }

  .dashboard-workbar {
    padding: 16px 20px;
    gap: 16px;
    border-radius: 8px;
    align-items: center;
  }

  .dashboard-workbar-copy {
    gap: 10px;
    min-width: 0;
  }

  .dashboard-title-stack {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .dashboard-workbar-note {
    font-family: var(--sc-font-mono);
    font-size: 0.68rem;
    color: rgba(250, 247, 235, 0.36);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dashboard-workbar-stats {
    gap: 6px;
    flex-wrap: nowrap;
    overflow-x: auto;
  }

  .dashboard-stat {
    min-width: 108px;
    padding: 8px 10px;
    border-radius: 6px;
  }

  .dashboard-stat strong {
    font-size: 0.92rem;
    line-height: 1;
  }

  .topbar-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
  .topbar-actions .surface-button,
  .topbar-actions .surface-button-secondary {
    min-height: 34px;
    padding: 0 14px;
    font-size: 0.82rem;
  }

  @media (max-width: 640px) {
    .dashboard-title-stack {
      align-items: flex-start;
      flex-direction: column;
      gap: 4px;
    }
    .dashboard-workbar-note {
      white-space: normal;
    }
    .topbar-actions {
      width: 100%;
    }
    .topbar-actions .surface-button,
    .topbar-actions .surface-button-secondary {
      flex: 1;
    }
  }
</style>
