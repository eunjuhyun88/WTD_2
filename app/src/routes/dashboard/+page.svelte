<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { buildCanonicalHref } from '$lib/seo/site';
  import { allStrategies, setActiveStrategy } from '$lib/stores/strategyStore';
  import type { StrategyEntry } from '$lib/stores/strategyStore';
  import { MARKET_CYCLES } from '$lib/data/cycles';
  import { priceStore } from '$lib/stores/priceStore';
  import { walletStore, openWalletModal } from '$lib/stores/walletStore';
  import KimchiPremiumBadge from '$lib/components/market/KimchiPremiumBadge.svelte';
  import DashActivityGrid from '$lib/components/dashboard/DashActivityGrid.svelte';
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

  onMount(async () => {
    try {
      const r = await fetch('/api/profile/passport');
      if (r.ok) {
        const d = (await r.json()) as { passport?: PassportSummary };
        if (d.passport) passport = d.passport;
      }
    } catch { /* silent */ }
  });

  const sourcePendingVerdicts = $derived(data.pendingVerdicts ?? []);
  const topOpportunities = $derived((data.topOpportunities ?? []) as OpportunityScore[]);
  const macroRegime = $derived(data.macroRegime ?? 'neutral');
  const opportunityPersonalized = $derived(data.opportunityPersonalized ?? false);

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

  function fmtNum(v: number | null | undefined): string {
    if (v == null) return '—';
    return v.toFixed(2);
  }

  function fmtPrice(v: number): string {
    if (!v) return '—';
    return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function pnlClass(v: number | null | undefined): string {
    if (v == null) return '';
    return v >= 0 ? 'surface-value-positive' : 'surface-value-negative';
  }

  function cyclesTested(entry: StrategyEntry): number {
    return entry.lastResult?.cycleBreakdown.length ?? 0;
  }

  function timeSince(ms: number): string {
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '방금';
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    return `${days}일 전`;
  }

  function goToLab(strategyId: string) {
    setActiveStrategy(strategyId);
    goto('/lab');
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
        <span class="dashboard-workbar-note">지갑 · 패스포트 · 활성 포지션 한눈에</span>
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

  <!-- Wallet + Passport strip -->
  <section class="home-profile-strip">
    <div class="home-wallet">
      {#if wallet.connected && wallet.address}
        <span class="home-wallet-dot home-wallet-dot--on"></span>
        <span class="home-wallet-addr">{wallet.shortAddr ?? wallet.address.slice(0, 6) + '…' + wallet.address.slice(-4)}</span>
        {#if wallet.balance > 0}
          <span class="home-wallet-bal">{wallet.balance.toFixed(4)} ETH</span>
        {/if}
        <span class="home-wallet-chain">{wallet.chain ?? 'ARB'}</span>
      {:else}
        <span class="home-wallet-dot home-wallet-dot--off"></span>
        <button class="home-wallet-connect" onclick={() => openWalletModal()}>지갑 연결</button>
      {/if}
    </div>

    {#if passport}
      <div class="home-passport">
        <span class="home-pp-tier" data-tier={passport.tier.toLowerCase()}>{passport.tier}</span>
        <div class="home-pp-stat">
          <span class="home-pp-label">Win</span>
          <strong class:pos={passport.winRate >= 55} class:neg={passport.winRate < 45}>{passport.winRate.toFixed(1)}%</strong>
        </div>
        <div class="home-pp-stat">
          <span class="home-pp-label">LP</span>
          <strong>{passport.totalLp.toLocaleString()}</strong>
        </div>
        <div class="home-pp-stat">
          <span class="home-pp-label">Streak</span>
          <strong class:pos={passport.streak > 0} class:neg={passport.streak < 0}>{passport.streak > 0 ? '+' : ''}{passport.streak}</strong>
        </div>
        <div class="home-pp-stat">
          <span class="home-pp-label">W/L</span>
          <strong>{passport.wins}/{passport.losses}</strong>
        </div>
        <a href="/passport" class="home-pp-link">상세 →</a>
      </div>
    {:else if wallet.connected}
      <div class="home-passport home-passport--loading">Passport 로딩 중…</div>
    {:else}
      <div class="home-passport home-passport--empty">지갑 연결 후 Passport 표시</div>
    {/if}
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

  <!-- My Challenges -->
  <section class="surface-grid">
    <div class="surface-section-head">
      <div>
        <span class="surface-kicker">My Challenges</span>
        <h2>저장된 세팅</h2>
      </div>
      <span class="surface-chip">{strategies.length} saved</span>
    </div>

    {#if strategies.length === 0}
      <div class="surface-card empty-card">
        <p>아직 저장된 챌린지가 없습니다.</p>
        <button class="surface-button" onclick={() => goto('/cogochi')}>Terminal에서 시작</button>
      </div>
    {:else}
      <div class="challenge-grid">
        {#each strategies as entry (entry.strategy.id)}
          {@const s = entry.strategy}
          {@const r = entry.lastResult}
          <button class="surface-card challenge-card" onclick={() => goToLab(s.id)}>
            <div class="challenge-top">
              <div>
                <span class="surface-meta">Challenge</span>
                <strong>{s.name}</strong>
              </div>
              <span class="surface-chip">v{s.version}</span>
            </div>

            {#if r}
              <div class="challenge-stats">
                <div>
                  <span class="surface-meta">Win</span>
                  <strong class={pnlClass(r.winRate >= 55 ? 1 : r.winRate < 45 ? -1 : 0)}>{r.winRate.toFixed(0)}%</strong>
                </div>
                <div>
                  <span class="surface-meta">Sharpe</span>
                  <strong class={pnlClass(r.sharpeRatio)}>{fmtNum(r.sharpeRatio)}</strong>
                </div>
                <div>
                  <span class="surface-meta">MDD</span>
                  <strong class="surface-value-negative">-{r.maxDrawdownPercent.toFixed(1)}%</strong>
                </div>
                <div>
                  <span class="surface-meta">PnL</span>
                  <strong class={pnlClass(r.totalPnlPercent)}>{fmtPct(r.totalPnlPercent)}</strong>
                </div>
              </div>

              <div class="progress-block">
                <div class="progress-track">
                  <div class="progress-fill" style:width={`${(cyclesTested(entry) / MARKET_CYCLES.length) * 100}%`}></div>
                </div>
                <span class="surface-meta">{cyclesTested(entry)}/{MARKET_CYCLES.length} cycles</span>
              </div>
            {:else}
              <p class="untested-copy">아직 첫 검증 전입니다. Lab에서 실행하세요.</p>
            {/if}

            <div class="challenge-footer">
              <span class="surface-meta">{timeSince(entry.lastModified)}</span>
              <span class="surface-chip">Open Lab</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </section>
  </div>
</div>

<style>
  /* Home Profile Strip */
  .home-profile-strip {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 20px;
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid rgba(249, 216, 194, 0.06);
    flex-wrap: wrap;
  }

  .home-wallet {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
  }

  .home-wallet-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .home-wallet-dot--on  { background: #22AB94; }
  .home-wallet-dot--off { background: rgba(250, 247, 235, 0.2); }

  .home-wallet-addr { color: rgba(250, 247, 235, 0.7); letter-spacing: 0.02em; }
  .home-wallet-bal  { color: rgba(250, 247, 235, 0.45); }
  .home-wallet-chain {
    font-size: var(--ui-text-xs);
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(249, 216, 194, 0.08);
    color: rgba(249, 216, 194, 0.5);
    letter-spacing: 0.06em;
  }

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

  .home-passport {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
    font-size: 11px;
  }

  .home-passport--loading,
  .home-passport--empty {
    color: rgba(250, 247, 235, 0.25);
    font-size: var(--ui-text-xs);
    font-style: italic;
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

  .home-pp-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }

  .home-pp-label {
    font-size: var(--ui-text-xs);
    color: rgba(250, 247, 235, 0.3);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .home-pp-stat strong { font-size: 12px; font-variant-numeric: tabular-nums; color: rgba(250, 247, 235, 0.85); }
  .home-pp-stat strong.pos { color: #22AB94; }
  .home-pp-stat strong.neg { color: #F23645; }

  .home-pp-link {
    font-size: var(--ui-text-xs);
    color: rgba(249, 216, 194, 0.4);
    text-decoration: none;
    transition: color 0.15s;
  }
  .home-pp-link:hover { color: rgba(249, 216, 194, 0.8); }

  @media (max-width: 768px) {
    .home-passport { margin-left: 0; }
  }

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

  .challenge-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .challenge-card {
    display: grid;
    gap: 16px;
    text-align: left;
    cursor: pointer;
    transition: transform var(--sc-duration-fast), border-color var(--sc-duration-fast);
  }

  .challenge-card:hover {
    transform: translateY(-2px);
    border-color: rgba(249, 216, 194, 0.2);
  }

  .challenge-top,
  .challenge-footer {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 10px;
  }

  .challenge-top strong {
    display: block;
    margin-top: 2px;
    color: var(--sc-text-0);
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .challenge-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .challenge-stats strong {
    display: block;
    margin-top: 3px;
    font-size: 1rem;
    font-weight: 700;
    color: var(--sc-text-0);
  }

  .progress-block {
    display: grid;
    gap: 6px;
  }

  .progress-track {
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
  }

  .progress-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(255, 127, 133, 0.92), rgba(249, 216, 194, 0.84));
  }

  .untested-copy,
  .empty-card p {
    margin: 0;
    color: var(--sc-text-1);
    font-size: 0.88rem;
    line-height: 1.5;
  }

  .surface-code {
    display: inline-flex;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 8px 10px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: var(--sc-text-1);
    font-size: 0.82rem;
  }

  .empty-card {
    display: grid;
    gap: 12px;
    justify-items: start;
  }

  @media (max-width: 960px) {
    .challenge-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
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
    .challenge-grid {
      grid-template-columns: 1fr;
    }
    .challenge-card {
      gap: 12px;
    }
    .surface-code {
      white-space: normal;
      word-break: break-word;
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
