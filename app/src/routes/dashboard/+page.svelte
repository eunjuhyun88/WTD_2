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
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function goToLab(strategyId: string) {
    setActiveStrategy(strategyId);
    goto('/lab');
  }

  // ── Phase 5: Alert Strip + Kimchi bar ──────────────────────────────
  interface AlertItem { sym: string; kind: 'OI' | 'FR'; label: string; value: number; }

  const ALERT_SYMS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  const OI_SPIKE_THRESH  = 0.10;  // +10%/30m
  const FR_HIGH_THRESH   = 0.0005; // +0.05%
  const FR_LOW_THRESH    = -0.0003; // -0.03%

  let alertItems    = $state<AlertItem[]>([]);
  let dashKimchi    = $state<number | null>(null);
  let dashKimchiUp  = $state<boolean | null>(null);

  async function loadAlerts() {
    const next: AlertItem[] = [];
    await Promise.allSettled(ALERT_SYMS.map(async (sym) => {
      const [oiRes, frRes] = await Promise.allSettled([
        fetch(`/api/market/oi?symbol=${sym}&period=30m&limit=4`),
        fetch(`/api/market/funding?symbol=${sym}&limit=1`),
      ]);
      if (oiRes.status === 'fulfilled' && oiRes.value.ok) {
        const d = (await oiRes.value.json()) as { bars?: { c: number }[] };
        const bars = d.bars ?? [];
        if (bars.length >= 2) {
          const cur = bars[bars.length - 1].c, prev = bars[0].c;
          const delta = prev > 0 ? (cur - prev) / prev : 0;
          if (Math.abs(delta) >= OI_SPIKE_THRESH) {
            next.push({ sym: sym.replace('USDT', ''), kind: 'OI', label: `OI ${delta > 0 ? '+' : ''}${(delta * 100).toFixed(0)}%/30m`, value: delta });
          }
        }
      }
      if (frRes.status === 'fulfilled' && frRes.value.ok) {
        const d = (await frRes.value.json()) as { bars?: { delta: number }[] };
        const bars = d.bars ?? [];
        if (bars.length > 0) {
          const fr = bars[bars.length - 1].delta;
          if (fr > FR_HIGH_THRESH || fr < FR_LOW_THRESH) {
            next.push({ sym: sym.replace('USDT', ''), kind: 'FR', label: `FR ${fr > 0 ? '+' : ''}${(fr * 100).toFixed(3)}%`, value: fr });
          }
        }
      }
    }));
    alertItems = next;
  }

  async function loadDashKimchi() {
    try {
      const r = await fetch('/api/market/kimchi-premium');
      if (!r.ok) return;
      const d = (await r.json()) as { ok: boolean; data: { premium_pct: number } };
      if (d.ok) {
        const prev = dashKimchi;
        dashKimchi = d.data.premium_pct;
        if (prev !== null) dashKimchiUp = dashKimchi > prev;
      }
    } catch { /* silent */ }
  }

  $effect(() => {
    void loadAlerts();
    void loadDashKimchi();
    const t1 = setInterval(loadAlerts, 60_000);
    const t2 = setInterval(loadDashKimchi, 30_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  });

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

  <!-- ── Alert Strip (AC10) ── -->
  {#if alertItems.length > 0}
    <div class="dash-alert-strip">
      {#each alertItems as a (a.sym + a.kind)}
        <span class="dash-alert-item" class:oi-up={a.kind === 'OI' && a.value > 0} class:oi-dn={a.kind === 'OI' && a.value < 0} class:fr-hi={a.kind === 'FR' && a.value > FR_HIGH_THRESH} class:fr-lo={a.kind === 'FR' && a.value < FR_LOW_THRESH}>
          ⚡ <strong>{a.sym}</strong> {a.label}
        </span>
      {/each}
    </div>
  {/if}

  <!-- ── Kimchi Premium Bar (AC11) ── -->
  {#if dashKimchi !== null}
    <div class="dash-kimchi-bar">
      <span class="kimchi-label">Kimchi Premium</span>
      <span class="kimchi-value" class:kim-hot={dashKimchi > 1.5} class:kim-cold={dashKimchi < -0.5}>
        {dashKimchi > 0 ? '+' : ''}{dashKimchi.toFixed(2)}%
        {#if dashKimchiUp !== null}<span class="kimchi-arrow">{dashKimchiUp ? '▲' : '▼'}</span>{/if}
      </span>
      <span class="kimchi-hint">Upbit / Binance BTC spread</span>
    </div>
  {/if}

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
        <button class="home-wallet-connect" onclick={() => openWalletModal()}>Connect Wallet</button>
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
        <a href="/passport" class="home-pp-link">Details →</a>
      </div>
    {:else if wallet.connected}
      <div class="home-passport home-passport--loading">Loading Passport…</div>
    {:else}
      <div class="home-passport home-passport--empty">Connect wallet to view Passport</div>
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
        <h2>Saved Setups</h2>
      </div>
      <span class="surface-chip">{strategies.length} saved</span>
    </div>

    {#if strategies.length === 0}
      <div class="surface-card empty-card">
        <p>No saved setups yet.</p>
        <button class="surface-button" onclick={() => goto('/cogochi')}>Start from Terminal</button>
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
              <p class="untested-copy">Not yet validated. Run from Lab.</p>
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
  /* ── Alert Strip (W-0390 Phase 5) ── */
  .dash-alert-strip {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    height: 48px;
    background: var(--g0, #080706);
    border-bottom: 1px solid var(--g3, #1c1918);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .dash-alert-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    color: var(--g7);
    padding: 3px 8px;
    border: 0.5px solid var(--g4);
    border-radius: 3px;
    background: var(--g1);
  }
  .dash-alert-item.oi-up { color: #22AB94; border-color: rgba(34,171,148,.3); }
  .dash-alert-item.oi-dn { color: #F23645; border-color: rgba(242,54,69,.3); }
  .dash-alert-item.fr-hi { color: var(--amb, #d6a347); border-color: rgba(214,163,71,.3); }
  .dash-alert-item.fr-lo { color: #38bdf8; border-color: rgba(56,189,248,.3); }

  /* ── Kimchi Bar (W-0390 Phase 5) ── */
  .dash-kimchi-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    height: 48px;
    background: var(--g1, #0c0a09);
    border-bottom: 1px solid var(--g3, #1c1918);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs, 11px);
    flex-shrink: 0;
  }

  .kimchi-label {
    color: var(--g5);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-size: var(--ui-text-xs);
  }

  .kimchi-value {
    font-size: 14px;
    font-weight: 600;
    color: var(--g8);
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
  }
  .kimchi-value.kim-hot { color: var(--amb, #d6a347); }
  .kimchi-value.kim-cold { color: #38bdf8; }

  .kimchi-arrow { font-size: var(--ui-text-xs); margin-left: 2px; }

  .kimchi-hint {
    color: var(--g5);
    font-size: var(--ui-text-xs);
    margin-left: 4px;
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
