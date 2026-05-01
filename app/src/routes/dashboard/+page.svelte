<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { buildCanonicalHref } from '$lib/seo/site';
  import { allStrategies, setActiveStrategy } from '$lib/stores/strategyStore';
  import type { StrategyEntry } from '$lib/stores/strategyStore';
  import { MARKET_CYCLES } from '$lib/data/cycles';
  import { priceStore } from '$lib/stores/priceStore';
  import { walletStore, openWalletModal } from '$lib/stores/walletStore';
  import AdapterDiffPanel from '../../components/dashboard/AdapterDiffPanel.svelte';
  import KimchiPremiumBadge from '$lib/components/market/KimchiPremiumBadge.svelte';
  import type { CaptureRow, FlywheelHealth, OpportunityScore } from './+page.server';

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
  const flywheel = $derived(data.flywheelHealth as FlywheelHealth | null);
  const topOpportunities = $derived((data.topOpportunities ?? []) as OpportunityScore[]);
  const macroRegime = $derived(data.macroRegime ?? 'neutral');
  const opportunityPersonalized = $derived(data.opportunityPersonalized ?? false);

  let pendingVerdicts = $state<CaptureRow[]>([]);
  $effect(() => {
    pendingVerdicts = [...sourcePendingVerdicts];
  });

  // Gate specs — 6 business gate KPIs (fmtPct defined below alongside other fmt helpers)
  const GATE_SPECS = [
    { key: 'captures_per_day_7d',            label: 'Captures / day (7d)', fmt: (v: number) => v.toFixed(2) },
    { key: 'captures_to_outcome_rate',        label: 'Capture → Outcome',   fmt: (v: number) => gatePct(v) },
    { key: 'outcomes_to_verdict_rate',        label: 'Outcome → Verdict',   fmt: (v: number) => gatePct(v) },
    { key: 'verdicts_to_refinement_count_7d', label: 'Refinements (7d)',    fmt: (v: number) => String(v) },
    { key: 'promotion_gate_pass_rate_30d',    label: 'Promotion rate (30d)',fmt: (v: number) => gatePct(v) },
  ] as const;

  function gatePct(v: number): string { return (v * 100).toFixed(1) + '%'; }

  type GateKey = keyof Omit<FlywheelHealth, 'ok' | 'active_models_per_pattern'>;

  function gateValue(key: GateKey): number {
    if (!flywheel) return 0;
    return (flywheel[key] as number) ?? 0;
  }

  const activeModels = $derived.by(() => {
    if (!flywheel?.active_models_per_pattern) return { total: 0, active: 0 };
    const entries = Object.values(flywheel.active_models_per_pattern);
    return { total: entries.length, active: entries.filter(v => v > 0).length };
  });

  const gatesOpen = $derived.by(() => {
    if (!flywheel) return 0;
    const kpiOpen = GATE_SPECS.filter(s => gateValue(s.key as GateKey) > 0).length;
    const modelOpen = activeModels.active >= 1 ? 1 : 0;
    return kpiOpen + modelOpen;
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

  function fmtDate(ms: number): string {
    return new Date(ms).toLocaleDateString('ko-KR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function fmtSlug(slug: string): string {
    return slug.replace(/-v\d+$/, '').replace(/-/g, ' ');
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

  function opScoreColor(s: number): string {
    if (s >= 56) return '#4ade80';
    if (s >= 40) return '#fbbf24';
    return '#f87171';
  }
  function opDirColor(d: string): string {
    if (d === 'long') return '#4ade80';
    if (d === 'short') return '#f87171';
    return '#94a3b8';
  }
  function opDirIcon(d: string): string {
    if (d === 'long') return '↑';
    if (d === 'short') return '↓';
    return '→';
  }
  function fmtOpPrice(p: number): string {
    if (!p) return '—';
    if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 1) return '$' + p.toFixed(2);
    return '$' + p.toPrecision(3);
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

  <!-- Home: Wallet + Passport Summary -->
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

  <!-- Flywheel Gate Panel -->
  <section class="surface-grid">
    <div class="surface-section-head">
      <div>
        <span class="surface-kicker">Business Gate</span>
        <h2>Flywheel Health</h2>
      </div>
      {#if flywheel?.ok}
        <span class="surface-chip gate-chip" class:gate-chip--open={gatesOpen === 6}>{gatesOpen}/6 open</span>
      {:else}
        <span class="surface-chip gate-chip--offline">engine offline</span>
      {/if}
    </div>

    {#if flywheel?.ok}
    <div class="gate-grid">
      {#each GATE_SPECS as spec}
        {@const val = gateValue(spec.key as GateKey)}
        {@const open = val > 0}
        <div class="gate-card" class:gate-card--open={open}>
          <span class="gate-label">{spec.label}</span>
          <span class="gate-value">{spec.fmt(val)}</span>
          <span class="gate-dot">{open ? '●' : '○'}</span>
        </div>
      {/each}
      <!-- active_models gate -->
      <div class="gate-card" class:gate-card--open={activeModels.active >= 1}>
        <span class="gate-label">Active models</span>
        <span class="gate-value">{activeModels.active}/{activeModels.total}</span>
        <span class="gate-dot">{activeModels.active >= 1 ? '●' : '○'}</span>
      </div>
    </div>

    {#if gatesOpen === 0}
      <p class="gate-hint">플라이휠이 아직 시작되지 않았습니다. 터미널에서 Save Setup으로 캡처를 시작하세요.</p>
    {:else if gatesOpen < 6}
      <p class="gate-hint">{6 - gatesOpen}개 게이트가 아직 닫혀 있습니다. 캡처 → 판정 → 보정 순서로 채워주세요.</p>
    {:else}
      <p class="gate-hint gate-hint--success">모든 게이트 통과. 사업화 준비 완료.</p>
    {/if}
    {:else}
      <p class="gate-hint">엔진 연결 없음 — 로컬 엔진을 실행하면 KPI가 여기에 표시됩니다.</p>
    {/if}
  </section>

  <!-- Verdict Inbox -->
  {#if pendingVerdicts.length > 0}
  <section class="surface-grid">
    <div class="surface-section-head">
      <div>
        <span class="surface-kicker">Flywheel</span>
        <h2>Verdict Inbox</h2>
      </div>
      <span class="surface-chip">{pendingVerdicts.length} pending</span>
    </div>

    {#if labelError}
      <p class="verdict-error">{labelError}</p>
    {/if}

    <div class="verdict-grid">
      {#each pendingVerdicts as capture (capture.capture_id)}
        {@const busy = labellingId === capture.capture_id}
        <div class="surface-card verdict-card" class:verdict-card--busy={busy}>
          <div class="verdict-card-top">
            <div class="verdict-card-meta">
              <strong class="verdict-symbol">{capture.symbol}</strong>
              <span class="surface-chip verdict-tf">{capture.timeframe}</span>
            </div>
            <span class="surface-meta">{fmtDate(capture.captured_at_ms)}</span>
          </div>

          {#if capture.pattern_slug}
            <span class="surface-meta verdict-slug">{fmtSlug(capture.pattern_slug)}</span>
          {/if}
          {#if capture.user_note}
            <p class="verdict-note">{capture.user_note}</p>
          {/if}

          <div class="verdict-actions">
            <button
              class="verdict-btn verdict-btn--valid"
              disabled={busy}
              onclick={() => submitVerdict(capture.capture_id, 'valid')}
            >성공</button>
            <button
              class="verdict-btn verdict-btn--invalid"
              disabled={busy}
              onclick={() => submitVerdict(capture.capture_id, 'invalid')}
            >실패</button>
            <button
              class="verdict-btn verdict-btn--near-miss"
              disabled={busy}
              onclick={() => submitVerdict(capture.capture_id, 'near_miss')}
            >니어미스</button>
            <button
              class="verdict-btn verdict-btn--too-late"
              disabled={busy}
              onclick={() => submitVerdict(capture.capture_id, 'too_late')}
            >늦은진입</button>
            <button
              class="verdict-btn verdict-btn--too-early"
              disabled={busy}
              onclick={() => submitVerdict(capture.capture_id, 'too_early')}
            >너무이름</button>
          </div>
        </div>
      {/each}
    </div>
  </section>
  {/if}

  <!-- Opportunity Scanner -->
  <section class="surface-grid">
    <div class="surface-section-head">
      <div>
        <span class="surface-kicker">기회 스캐너</span>
        <h2>Top Opportunities</h2>
      </div>
      <div class="op-header-right">
        {#if opportunityPersonalized}
          <span class="surface-chip op-chip--personal">개인화됨</span>
        {/if}
        <span class="surface-chip op-chip--regime" class:op-chip--risk-on={macroRegime === 'risk-on'} class:op-chip--risk-off={macroRegime === 'risk-off'}>
          {macroRegime}
        </span>
        {#if topOpportunities.length > 0}
          <span class="surface-chip">{topOpportunities.length} coins</span>
        {/if}
      </div>
    </div>

    {#if topOpportunities.length === 0}
      <div class="op-empty">엔진 연결 중… 잠시 후 새로고침하세요.</div>
    {:else}
      <div class="op-grid">
        {#each topOpportunities as pick, i (pick.symbol)}
          <div class="surface-card op-card">
            <div class="op-head">
              <span class="op-rank" style="color:{opScoreColor(pick.totalScore)}">#{i + 1}</span>
              <span class="op-sym">{pick.symbol}</span>
              <span class="op-dir" style="color:{opDirColor(pick.direction)}">{opDirIcon(pick.direction)} {pick.direction}</span>
              <span class="op-score" style="color:{opScoreColor(pick.totalScore)}">{pick.totalScore}</span>
            </div>
            <div class="op-price">
              {fmtOpPrice(pick.price)}
              <span class="op-chg" class:op-chg--up={pick.change24h >= 0} class:op-chg--dn={pick.change24h < 0}>
                {pick.change24h >= 0 ? '+' : ''}{pick.change24h.toFixed(1)}%
              </span>
            </div>
            <div class="op-bar">
              <div class="op-seg op-seg--mom" style="width:{pick.momentumScore}px" title="Momentum {pick.momentumScore}/25"></div>
              <div class="op-seg op-seg--vol" style="width:{pick.volumeScore}px" title="Volume {pick.volumeScore}/20"></div>
              <div class="op-seg op-seg--soc" style="width:{pick.socialScore}px" title="Social {pick.socialScore}/20"></div>
              <div class="op-seg op-seg--mac" style="width:{pick.macroScore}px" title="Macro {pick.macroScore}/15"></div>
              <div class="op-seg op-seg--onc" style="width:{pick.onchainScore}px" title="OnChain {pick.onchainScore}/20"></div>
            </div>
            <div class="op-tags">
              {#each pick.reasons as r}
                <span class="op-tag">{r}</span>
              {/each}
              {#if pick.compositeScore != null}
                <span class="op-tag op-tag--cs" title="Perp composite: funding + LS ratio">
                  CS {Math.round(pick.compositeScore * 100)}%
                </span>
              {/if}
            </div>
            {#if pick.alerts.length > 0}
              <div class="op-alerts">
                {#each pick.alerts.slice(0, 2) as a}
                  <span class="op-alert">{a}</span>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Watching + Adapters -->
  <section class="surface-grid cols-2">
    <div class="surface-grid">
      <div class="surface-section-head">
        <div>
          <span class="surface-kicker">Watching</span>
          <h2>지켜보는 패턴</h2>
        </div>
        {#if !watchingLoading}
          <span class="surface-chip">{watchingCaptures.length} active</span>
        {/if}
      </div>

      {#if watchingLoading}
        <div class="watcher-loading">불러오는 중...</div>
      {:else if watchingCaptures.length === 0}
        <div class="watcher-empty">
          <span class="watcher-empty-icon">👁</span>
          <p>패턴 검색 후 Watch를 누르면 여기에 표시됩니다</p>
          <button class="surface-btn-secondary" onclick={() => goto('/cogochi')}>
            패턴 탐색하기
          </button>
        </div>
      {:else}
        {#each watchingCaptures as cap}
          <button
            class="surface-card watcher-card"
            onclick={() => goto(`/cogochi?capture=${cap.capture_id}`)}
          >
            <div class="watcher-top">
              <span class="surface-meta">{cap.pattern_slug.replace(/-v\d+$/, '').replace(/-/g, ' ')}</span>
              <span class="surface-chip watcher-status-{cap.status}">{cap.status}</span>
            </div>
            <strong class="watcher-symbol">{cap.symbol}</strong>
            <div class="watcher-meta-row">
              <span class="surface-meta">{fmtDate(cap.captured_at_ms)}</span>
              {#if cap.pnl_pct != null}
                <span class={pnlClass(cap.pnl_pct)}>{fmtPct(cap.pnl_pct)}</span>
              {/if}
            </div>
          </button>
        {/each}
      {/if}
    </div>

    <div class="surface-grid">
      <AdapterDiffPanel />
    </div>
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
    font-size: 9px;
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
    font-size: 10px;
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
    font-size: 10px;
    font-style: italic;
  }

  .home-pp-tier {
    font-size: 10px;
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
    font-size: 8px;
    color: rgba(250, 247, 235, 0.3);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .home-pp-stat strong { font-size: 12px; font-variant-numeric: tabular-nums; color: rgba(250, 247, 235, 0.85); }
  .home-pp-stat strong.pos { color: #22AB94; }
  .home-pp-stat strong.neg { color: #F23645; }

  .home-pp-link {
    font-size: 10px;
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

  .challenge-card,
  .watcher-card {
    display: grid;
    gap: 16px;
    text-align: left;
    cursor: pointer;
    transition: transform var(--sc-duration-fast), border-color var(--sc-duration-fast);
  }

  .challenge-card:hover,
  .watcher-card:hover {
    transform: translateY(-2px);
    border-color: rgba(249, 216, 194, 0.2);
  }

  .challenge-top,
  .watcher-top,
  .challenge-footer {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 10px;
  }

  .challenge-top strong,
  .watcher-card strong {
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

  .watcher-loading {
    padding: 24px;
    color: var(--sc-text-2);
    font-size: 0.88rem;
    text-align: center;
  }

  .watcher-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 32px 16px;
    text-align: center;
  }
  .watcher-empty-icon { font-size: 2rem; }
  .watcher-empty p { margin: 0; color: var(--sc-text-1); font-size: 0.88rem; }

  .watcher-symbol {
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--sc-text-0);
  }

  .watcher-meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 0.82rem;
  }

  .watcher-status-watching { background: rgba(59,130,246,0.15); color: #93c5fd; }
  .watcher-status-pending_outcome { background: rgba(234,179,8,0.15); color: #fde047; }
  .watcher-status-outcome_ready { background: rgba(34,197,94,0.15); color: #86efac; }

  .untested-copy,
  .watcher-card p,
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

  /* ── Flywheel Gate Panel ────────────────────────────────────────────── */
  .gate-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 4px;
  }
  @media (max-width: 640px) {
    .gate-grid { grid-template-columns: repeat(2, 1fr); }
  }

  .gate-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    background: rgba(19, 23, 34, 0.6);
    border: 1px solid rgba(42, 46, 57, 0.8);
    border-radius: 6px;
    position: relative;
  }
  .gate-card--open {
    border-color: rgba(0, 188, 139, 0.4);
    background: rgba(0, 188, 139, 0.05);
  }
  .gate-label {
    font-size: 10px;
    color: rgba(177, 181, 189, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-family: var(--sc-font-mono, monospace);
  }
  .gate-value {
    font-size: 18px;
    font-weight: 600;
    color: var(--sc-text-primary, #e8e9ed);
    font-family: var(--sc-font-mono, monospace);
  }
  .gate-dot {
    position: absolute;
    top: 10px;
    right: 12px;
    font-size: 8px;
    color: rgba(177, 181, 189, 0.3);
  }
  .gate-card--open .gate-dot { color: rgb(0, 188, 139); }
  .gate-chip { background: rgba(42, 46, 57, 0.8); }
  .gate-chip--open { background: rgba(0, 188, 139, 0.15); color: rgb(0, 188, 139); }
  .gate-chip--offline { background: rgba(239, 83, 80, 0.1); color: rgba(239, 83, 80, 0.7); font-size: 11px; padding: 2px 8px; border-radius: 4px; }
  .gate-hint {
    margin-top: 8px;
    font-size: 11px;
    color: rgba(177, 181, 189, 0.5);
    font-family: var(--sc-font-mono, monospace);
  }
  .gate-hint--success { color: rgb(0, 188, 139); }

  /* ── Verdict Inbox ─────────────────────────────────────────────────── */

  .verdict-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }

  .verdict-card {
    display: grid;
    gap: 10px;
    transition: opacity var(--sc-duration-fast);
  }

  .verdict-card--busy {
    opacity: 0.5;
    pointer-events: none;
  }

  .verdict-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .verdict-card-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .verdict-symbol {
    font-size: 1rem;
    font-weight: 700;
    color: var(--sc-text-0);
    letter-spacing: -0.02em;
  }

  .verdict-tf {
    font-size: 0.72rem;
  }

  .verdict-slug {
    font-size: 0.78rem;
    text-transform: capitalize;
    color: var(--sc-text-2);
  }

  .verdict-note {
    margin: 0;
    font-size: 0.84rem;
    color: var(--sc-text-1);
    line-height: 1.45;
  }

  .verdict-actions {
    display: flex;
    gap: 6px;
  }

  .verdict-btn {
    flex: 1;
    padding: 6px 0;
    border-radius: 6px;
    border: 1px solid transparent;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity var(--sc-duration-fast), background var(--sc-duration-fast);
    background: rgba(255, 255, 255, 0.06);
    color: var(--sc-text-1);
  }

  .verdict-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .verdict-btn:hover:not(:disabled) { opacity: 0.85; }

  .verdict-btn--valid:hover:not(:disabled) {
    background: rgba(74, 222, 128, 0.18);
    border-color: rgba(74, 222, 128, 0.35);
    color: #4ade80;
  }

  .verdict-btn--invalid:hover:not(:disabled) {
    background: rgba(248, 113, 113, 0.18);
    border-color: rgba(248, 113, 113, 0.35);
    color: #f87171;
  }

  .verdict-btn--near-miss:hover:not(:disabled) {
    background: rgba(251, 191, 36, 0.18);
    border-color: rgba(251, 191, 36, 0.35);
    color: #fbbf24;
  }

  .verdict-btn--too-late:hover:not(:disabled) {
    background: rgba(251, 146, 60, 0.18);
    border-color: rgba(251, 146, 60, 0.35);
    color: #fb923c;
  }

  .verdict-btn--too-early:hover:not(:disabled) {
    background: rgba(147, 51, 234, 0.18);
    border-color: rgba(147, 51, 234, 0.35);
    color: #a78bfa;
  }

  .verdict-error {
    margin: 0;
    padding: 8px 12px;
    border-radius: 6px;
    background: rgba(248, 113, 113, 0.12);
    border: 1px solid rgba(248, 113, 113, 0.25);
    font-size: 0.82rem;
    color: #f87171;
  }

  /* ── Opportunity Scanner ───────────────────────────────────────────── */
  .op-header-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .op-chip--personal {
    background: rgba(99, 179, 237, 0.15);
    color: #63b3ed;
  }
  .op-chip--regime {
    background: rgba(255, 255, 255, 0.06);
    color: var(--sc-text-2);
    text-transform: capitalize;
  }
  .op-chip--risk-on { background: rgba(74, 222, 128, 0.12); color: #4ade80; }
  .op-chip--risk-off { background: rgba(248, 113, 113, 0.12); color: #f87171; }

  .op-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
  }

  .op-card {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 11px 13px;
  }

  .op-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    font-family: var(--sc-font-mono, monospace);
  }
  .op-rank { font-weight: 700; flex-shrink: 0; }
  .op-sym  { font-weight: 700; color: var(--sc-text-0); font-size: 0.88rem; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .op-dir  { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; flex-shrink: 0; }
  .op-score { font-weight: 700; font-size: 0.82rem; flex-shrink: 0; }

  .op-price {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.82rem;
    font-family: var(--sc-font-mono, monospace);
    color: var(--sc-text-1);
  }
  .op-chg { font-size: 0.75rem; font-weight: 600; }
  .op-chg--up { color: #4ade80; }
  .op-chg--dn { color: #f87171; }

  .op-bar {
    display: flex;
    height: 4px;
    gap: 2px;
    border-radius: 2px;
    overflow: hidden;
  }
  .op-seg { height: 100%; border-radius: 1px; min-width: 2px; }
  .op-seg--mom { background: #f59e0b; }
  .op-seg--vol { background: #3b82f6; }
  .op-seg--soc { background: #a855f7; }
  .op-seg--mac { background: #14b8a6; }
  .op-seg--onc { background: #06b6d4; }

  .op-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .op-tag {
    font-size: 0.68rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.07);
    color: var(--sc-text-2);
    font-family: var(--sc-font-mono, monospace);
    white-space: nowrap;
  }
  .op-tag--cs {
    background: rgba(99, 179, 237, 0.12);
    color: #63b3ed;
  }

  .op-alerts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .op-alert {
    font-size: 0.68rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(251, 191, 36, 0.1);
    color: #fbbf24;
    font-family: var(--sc-font-mono, monospace);
  }

  .op-empty {
    padding: 24px;
    text-align: center;
    color: var(--sc-text-2);
    font-size: 0.88rem;
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
    .challenge-card,
    .watcher-card {
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
