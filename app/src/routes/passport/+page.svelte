<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { buildCanonicalHref } from '$lib/seo/site';
  import { walletStore } from '$lib/stores/walletStore';
  import { openWalletModal } from '$lib/stores/walletModalStore';

  interface PassportPayload {
    tier: string;
    totalMatches: number;
    wins: number;
    losses: number;
    streak: number;
    bestStreak: number;
    totalLp: number;
    totalPnl: number;
    badges: string[];
    openTrades: number;
    trackedSignals: number;
    winRate: number;
    agentSummary: {
      totalAgents: number;
      avgLevel: number;
    };
  }

  const wallet = $derived($walletStore);

  let passport = $state<PassportPayload | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const response = await fetch('/api/profile/passport');
      if (!response.ok) {
        if (response.status === 401) {
          error = '지갑 연결 또는 로그인 후 Passport를 읽을 수 있습니다.';
          return;
        }
        throw new Error('Failed to load passport');
      }

      const data = await response.json();
      passport = data.passport ?? null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load passport';
    } finally {
      loading = false;
    }
  });

  function fmtNum(value: number | null | undefined) {
    if (value == null) return '—';
    return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }

  function fmtPct(value: number | null | undefined) {
    if (value == null) return '—';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  }
</script>

<svelte:head>
  <title>Passport — Cogochi</title>
  <meta name="robots" content="noindex, nofollow" />
  <link rel="canonical" href={buildCanonicalHref('/passport')} />
</svelte:head>

<div class="surface-page passport">
  <!-- Compact Topbar -->
  <header class="surface-hero">
    <div class="surface-copy">
      <span class="surface-kicker">Passport</span>
      <h1 class="surface-title">My Profile</h1>
    </div>
    <div class="surface-stats">
      <article class="surface-stat">
        <span class="surface-meta">Wallet</span>
        <strong>{wallet.connected ? wallet.shortAddr : 'Not connected'}</strong>
      </article>
      <article class="surface-stat">
        <span class="surface-meta">Tier</span>
        <strong>{wallet.tier.toUpperCase()}</strong>
      </article>
      <article class="surface-stat">
        <span class="surface-meta">Phase</span>
        <strong>P{wallet.phase}</strong>
      </article>
    </div>
    <div class="topbar-actions">
      {#if wallet.connected}
        <button class="surface-button" onclick={openWalletModal}>Wallet</button>
      {:else}
        <button class="surface-button" onclick={openWalletModal}>Connect</button>
      {/if}
      <button class="surface-button-secondary" onclick={() => goto('/dashboard')}>Dashboard</button>
    </div>
  </header>

  {#if loading}
    <section class="surface-card">
      <span class="surface-meta">Loading</span>
      <p class="body-copy">Passport 데이터를 불러오는 중입니다.</p>
    </section>
  {:else if error}
    <section class="surface-card error-card">
      <span class="surface-meta">Access</span>
      <h2>{error}</h2>
      <div class="surface-inline-actions">
        <button class="surface-button" onclick={openWalletModal}>지갑 연결 열기</button>
        <button class="surface-button-secondary" onclick={() => goto('/terminal')}>Open Terminal</button>
      </div>
    </section>
  {:else if passport}
    <section class="surface-grid cols-2">
      <article class="surface-card">
        <div class="surface-section-head">
          <div>
            <span class="surface-kicker">Identity</span>
            <h2>계정과 지갑 상태</h2>
          </div>
          <span class="surface-chip">{passport.tier}</span>
        </div>

        <div class="info-list">
          <div><span class="surface-meta">Email</span><strong>{wallet.email ?? '—'}</strong></div>
          <div><span class="surface-meta">Nickname</span><strong>{wallet.nickname ?? '—'}</strong></div>
          <div><span class="surface-meta">Wallet</span><strong>{wallet.shortAddr ?? '—'}</strong></div>
          <div><span class="surface-meta">Chain</span><strong>{wallet.chain}</strong></div>
        </div>
      </article>

      <article class="surface-card">
        <div class="surface-section-head">
          <div>
            <span class="surface-kicker">Performance</span>
            <h2>누적 결과</h2>
          </div>
          <span class="surface-chip">{passport.totalMatches} matches</span>
        </div>

        <div class="metric-grid">
          <div><span class="surface-meta">Win Rate</span><strong>{fmtPct(passport.winRate)}</strong></div>
          <div><span class="surface-meta">Total PnL</span><strong class={passport.totalPnl >= 0 ? 'surface-value-positive' : 'surface-value-negative'}>{fmtPct(passport.totalPnl)}</strong></div>
          <div><span class="surface-meta">LP</span><strong>{fmtNum(passport.totalLp)}</strong></div>
          <div><span class="surface-meta">Best Streak</span><strong>{fmtNum(passport.bestStreak)}</strong></div>
        </div>
      </article>
    </section>

    <section class="surface-grid cols-2">
      <article class="surface-card soft">
        <div class="surface-section-head">
          <div>
            <span class="surface-kicker">Activity</span>
            <h2>현재 열려 있는 상태</h2>
          </div>
        </div>

        <div class="metric-grid">
          <div><span class="surface-meta">Open Trades</span><strong>{fmtNum(passport.openTrades)}</strong></div>
          <div><span class="surface-meta">Tracked Signals</span><strong>{fmtNum(passport.trackedSignals)}</strong></div>
          <div><span class="surface-meta">Wins</span><strong>{fmtNum(passport.wins)}</strong></div>
          <div><span class="surface-meta">Losses</span><strong>{fmtNum(passport.losses)}</strong></div>
        </div>
      </article>

      <article class="surface-card soft">
        <div class="surface-section-head">
          <div>
            <span class="surface-kicker">Agents</span>
            <h2>학습 요약</h2>
          </div>
        </div>

        <div class="metric-grid">
          <div><span class="surface-meta">Total Agents</span><strong>{fmtNum(passport.agentSummary.totalAgents)}</strong></div>
          <div><span class="surface-meta">Average Level</span><strong>{fmtNum(passport.agentSummary.avgLevel)}</strong></div>
          <div><span class="surface-meta">Current Streak</span><strong>{fmtNum(passport.streak)}</strong></div>
          <div><span class="surface-meta">Badges</span><strong>{passport.badges.length}</strong></div>
        </div>
      </article>
    </section>

    <section class="surface-card">
      <div class="surface-section-head">
        <div>
          <span class="surface-kicker">Badges</span>
          <h2>획득 기록</h2>
        </div>
      </div>

      {#if passport.badges.length > 0}
        <div class="badge-row">
          {#each passport.badges as badge}
            <span class="surface-chip badge-chip">{badge}</span>
          {/each}
        </div>
      {:else}
        <p class="body-copy">아직 배지가 없습니다. 검증 기록이 쌓이면 이곳에 누적됩니다.</p>
      {/if}
    </section>
  {/if}
</div>

<style>
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

  .body-copy,
  .error-card h2 {
    margin: 0;
    color: var(--sc-text-1);
    line-height: 1.5;
    font-size: 0.92rem;
  }

  .error-card {
    display: grid;
    gap: 12px;
  }

  .error-card h2 {
    font-size: clamp(1rem, 2vw, 1.3rem);
    letter-spacing: -0.03em;
    color: rgba(250, 247, 235, 0.92);
  }

  .metric-grid,
  .info-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 14px;
  }

  .metric-grid > div,
  .info-list > div {
    display: grid;
    gap: 4px;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
  }

  .metric-grid strong,
  .info-list strong {
    color: var(--sc-text-0);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.1;
  }

  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .badge-chip {
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(250, 247, 235, 0.82);
  }

  @media (max-width: 640px) {
    .metric-grid,
    .info-list {
      gap: 8px;
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
