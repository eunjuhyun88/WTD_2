<script lang="ts">
  import { goto } from '$app/navigation';
  import { buildCanonicalHref } from '$lib/seo/site';
  import { allStrategies, setActiveStrategy } from '$lib/stores/strategyStore';
  import type { StrategyEntry } from '$lib/stores/strategyStore';
  import { MARKET_CYCLES } from '$lib/data/cycles';
  import { priceStore } from '$lib/stores/priceStore';
  import AdapterDiffPanel from '../../components/dashboard/AdapterDiffPanel.svelte';
  import type { CaptureRow, FlywheelHealth } from './+page.server';

  const { data } = $props();

  let pendingVerdicts = $state<CaptureRow[]>(data.pendingVerdicts ?? []);
  const flywheel = data.flywheelHealth as FlywheelHealth | null;

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

  async function submitVerdict(captureId: string, verdict: 'valid' | 'invalid' | 'missed', note?: string) {
    labellingId = captureId;
    labelError = null;
    try {
      const resp = await fetch(`/api/engine/captures/${captureId}/verdict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_verdict: verdict, user_note: note ?? null }),
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

  const WATCHING_QUERIES = [
    {
      title: 'BTC momentum watch',
      query: 'btc 4h recent_rally 10% bollinger_expansion',
      note: '저장해둔 리듬을 다시 확인하는 빠른 진입점입니다.'
    },
    {
      title: 'ETH compression watch',
      query: 'eth 1d squeeze expansion cvd uptick',
      note: '느린 타임프레임에서 다시 볼 세팅을 바로 엽니다.'
    }
  ] as const;

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

  function openWatching(query: string) {
    goto(`/terminal?q=${encodeURIComponent(query)}`);
  }
</script>

<svelte:head>
  <title>Dashboard — Cogochi</title>
  <meta name="robots" content="noindex, nofollow" />
  <link rel="canonical" href={buildCanonicalHref('/dashboard')} />
</svelte:head>

<div class="surface-page chrome-layout dash">
  <header class="surface-hero surface-fixed-hero dashboard-workbar">
    <div class="surface-copy dashboard-workbar-copy">
      <span class="surface-kicker">Dashboard</span>
      <div class="dashboard-title-stack">
        <h1 class="surface-title">My Workspace</h1>
        <span class="dashboard-workbar-note">Inbox for saved setups, live watches, and next actions</span>
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
      <button class="surface-button" onclick={() => goto('/terminal')}>Open Terminal</button>
      <button class="surface-button-secondary" onclick={() => goto('/lab')}>Open Lab</button>
    </div>
  </header>

  <div class="surface-scroll-body">
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
        <button class="surface-button" onclick={() => goto('/terminal')}>Terminal에서 시작</button>
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
            >Valid</button>
            <button
              class="verdict-btn verdict-btn--invalid"
              disabled={busy}
              onclick={() => submitVerdict(capture.capture_id, 'invalid')}
            >Invalid</button>
            <button
              class="verdict-btn verdict-btn--missed"
              disabled={busy}
              onclick={() => submitVerdict(capture.capture_id, 'missed')}
            >Missed</button>
          </div>
        </div>
      {/each}
    </div>
  </section>
  {/if}

  <!-- Watching + Adapters -->
  <section class="surface-grid cols-2">
    <div class="surface-grid">
      <div class="surface-section-head">
        <div>
          <span class="surface-kicker">Watching</span>
          <h2>다시 볼 검색</h2>
        </div>
        <span class="surface-chip">{WATCHING_QUERIES.length} saved</span>
      </div>

      {#each WATCHING_QUERIES as item}
        <button class="surface-card watcher-card" onclick={() => openWatching(item.query)}>
          <div class="watcher-top">
            <span class="surface-meta">Terminal Query</span>
            <span class="surface-chip">Open</span>
          </div>
          <strong>{item.title}</strong>
          <p>{item.note}</p>
          <code class="surface-code">{item.query}</code>
        </button>
      {/each}
    </div>

    <div class="surface-grid">
      <AdapterDiffPanel />
    </div>
  </section>
  </div>
</div>

<style>
  .dashboard-workbar {
    padding: 12px 16px;
    gap: 12px;
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
    gap: 14px;
  }

  .challenge-card,
  .watcher-card {
    display: grid;
    gap: 14px;
    text-align: left;
    cursor: pointer;
    transition: transform var(--sc-duration-fast), border-color var(--sc-duration-fast);
  }

  .challenge-card:hover,
  .watcher-card:hover {
    transform: translateY(-2px);
    border-color: var(--home-ref-border-strong);
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

  .verdict-btn--missed:hover:not(:disabled) {
    background: rgba(251, 191, 36, 0.18);
    border-color: rgba(251, 191, 36, 0.35);
    color: #fbbf24;
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
