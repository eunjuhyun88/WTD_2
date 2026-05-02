<script lang="ts">
  /**
   * /patterns — Pattern Engine Dashboard
   *
   * Shows:
   * 1. ACCUMULATION alerts (entry candidates — act now)
   * 2. All active symbol states (phase timeline per pattern)
   * 3. Pattern stats (hit rate, avg gain)
   * 4. Pending ledger records — VALID / INVALID override buttons
   */
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import {
    adaptPatternCandidates,
    flattenPatternStates,
    patternCapturePayload,
    phaseMetaFor,
  } from '$lib/contracts';
  import type { PatternCandidateView, PatternStateView } from '$lib/contracts';
  import { buildCanonicalHref } from '$lib/seo/site';
  import type { PatternStats } from '$lib/types/patternStats';
  import VerdictInboxSection from '$lib/components/patterns/VerdictInboxSection.svelte';
  import PatternCard from '$lib/components/patterns/PatternCard.svelte';
  import TransitionRow from '$lib/components/patterns/TransitionRow.svelte';
  import FeedbackButton from '$lib/components/FeedbackButton.svelte';

  // ── Types ──────────────────────────────────────────────────────────────────
  interface Transition {
    transition_id: string;
    symbol: string;
    pattern_slug: string;
    from_phase: string | null;
    to_phase: string;
    confidence: number | null;
    transitioned_at: string | null;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let candidates   = $state<PatternCandidateView[]>([]);
  let states       = $state<PatternStateView[]>([]);
  let stats        = $state<PatternStats[]>([]);
  let transitions  = $state<Transition[]>([]);
  let lastScan     = $state<string | null>(null);
  let loading      = $state(true);
  let scanning     = $state(false);
  let savingCandidateIds = $state(new Set<string>());
  let error        = $state<string | null>(null);

  // Symbol filter — driven by ?symbol= URL param
  let symbolFilter = $state($page.url.searchParams.get('symbol') ?? '');

  const symbolOptions = $derived(
    [...new Set(states.map((s) => s.symbol))].sort()
  );
  const filteredStates = $derived(
    symbolFilter ? states.filter((s) => s.symbol === symbolFilter) : states
  );

  function setSymbolFilter(sym: string) {
    symbolFilter = sym;
    const url = new URL($page.url);
    if (sym) url.searchParams.set('symbol', sym);
    else url.searchParams.delete('symbol');
    goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
  }

  // ── Data loading ───────────────────────────────────────────────────────────
  async function loadAll() {
    error = null;
    try {
      const [candRes, stateRes, statsRes, transRes] = await Promise.allSettled([
        fetch('/api/patterns'),
        fetch('/api/patterns/states'),
        fetch('/api/patterns/stats'),
        fetch('/api/patterns/transitions?limit=30'),
      ]);

      if (candRes.status === 'fulfilled' && candRes.value.ok) {
        const d = await candRes.value.json();
        candidates = adaptPatternCandidates(d);
        lastScan = null;
      }
      if (stateRes.status === 'fulfilled' && stateRes.value.ok) {
        const d = await stateRes.value.json();
        states = flattenPatternStates(d).sort((a, b) => b.phaseIdx - a.phaseIdx);
      }
      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const d = await statsRes.value.json();
        stats = d.stats ?? [];
      }
      if (transRes.status === 'fulfilled' && transRes.value.ok) {
        const d = await transRes.value.json();
        transitions = (d.transitions ?? []) as Transition[];
      }
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  async function triggerScan() {
    if (scanning) return;
    scanning = true;
    try {
      const res = await fetch('/api/patterns/scan', { method: 'POST' });
      if (res.ok) await loadAll();
    } finally {
      scanning = false;
    }
  }

  async function saveCandidate(candidate: PatternCandidateView) {
    const candidateKey = `${candidate.patternSlug}:${candidate.symbol}`;
    savingCandidateIds = new Set([...savingCandidateIds, candidateKey]);
    error = null;
    try {
      const res = await fetch('/api/captures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patternCapturePayload(candidate)),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string; error?: string }).detail ?? (body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      error = `Save setup failed: ${e}`;
    } finally {
      savingCandidateIds = new Set([...savingCandidateIds].filter((id) => id !== candidateKey));
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function sinceHours(iso: string): string {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000 / 60;
    if (diff < 60)  return `${Math.round(diff)}m 전`;
    if (diff < 1440) return `${Math.round(diff / 60)}h 전`;
    return `${Math.round(diff / 1440)}d 전`;
  }

  function fmtPct(value: number | null | undefined, digits = 0): string {
    if (value == null) return '—';
    return `${(value * 100).toFixed(digits)}%`;
  }

  const accumulationCount = $derived(candidates.filter((c) => c.phaseId === 'ACCUMULATION').length);
  const breakoutCount = $derived(states.filter((s) => s.phaseId === 'BREAKOUT').length);
  const filteredTransitions = $derived(
    symbolFilter ? transitions.filter((t) => t.symbol === symbolFilter) : transitions
  );

  let verdictInboxOpen = $state(false);

  let refreshInterval: ReturnType<typeof setInterval>;
  onMount(() => {
    loadAll();
    refreshInterval = setInterval(loadAll, 60_000);
  });
  onDestroy(() => clearInterval(refreshInterval));
</script>

<svelte:head>
  <title>Pattern Dashboard — Cogochi</title>
  <meta
    name="description"
    content="Track active pattern states, accumulation candidates, and evaluation stats from the Cogochi pattern engine."
  />
  <link rel="canonical" href={buildCanonicalHref('/patterns')} />
</svelte:head>

<div class="surface-page chrome-layout patterns-page">
  <header class="surface-hero surface-fixed-hero">
    <div class="surface-copy patterns-copy">
      <div>
        <span class="surface-kicker">Patterns</span>
        <h1 class="surface-title">Pattern Engine</h1>
      </div>
      <p class="surface-subtitle">
        Track accumulation candidates, live phase transitions, and model readiness in the same product shell as Dashboard.
      </p>
    </div>
    <div class="surface-stats">
      <article class="surface-stat">
        <span class="surface-meta">Candidates</span>
        <strong>{accumulationCount}</strong>
      </article>
      <article class="surface-stat">
        <span class="surface-meta">Active</span>
        <strong>{states.length}</strong>
      </article>
      <article class="surface-stat">
        <span class="surface-meta">Breakout</span>
        <strong>{breakoutCount}</strong>
      </article>
      <article class="surface-stat">
        <span class="surface-meta">Last Scan</span>
        <strong>{lastScan ? sinceHours(lastScan) : '—'}</strong>
      </article>
    </div>
    <div class="topbar-actions">
      <button class="surface-button" onclick={triggerScan} disabled={scanning}>
        {scanning ? 'Scanning…' : 'Run Scan'}
      </button>
      <button class="surface-button-secondary" onclick={() => goto('/patterns/lifecycle')}>Lifecycle</button>
      <button class="surface-button-secondary" onclick={() => goto('/cogochi')}>Terminal</button>
      <div class="topbar-tertiary">
        <a class="tertiary-link" href="/patterns/filter-drag" data-testid="patterns-filter-drag-link">Filter Drag</a>
        <a class="tertiary-link" href="/patterns/formula" data-testid="patterns-formula-link">Formula</a>
      </div>
    </div>
  </header>

  <div class="surface-scroll-body patterns-content">
    {#if loading}
      <section class="surface-card page-loading">
        <span class="pulse"></span>
        <span>패턴 데이터 로딩 중…</span>
      </section>

    {:else if error}
      <section class="surface-card page-error">
        <p>⚠ 엔진 연결 실패 — Python 엔진이 실행 중인지 확인하세요</p>
        <p class="error-detail">{error}</p>
        <button class="surface-button-secondary" onclick={loadAll}>재시도</button>
      </section>

    {:else}
      <section class="surface-grid">
        <div class="surface-section-head">
          <div>
            <span class="surface-kicker">Entry Candidates</span>
            <h2>Accumulation alerts</h2>
          </div>
          <span class="surface-chip">{accumulationCount} active</span>
        </div>

        {#if accumulationCount === 0}
          <div class="surface-card empty-card">
            <p>현재 ACCUMULATION 진입 후보 없음 — 15분마다 스캔</p>
          </div>
        {:else}
          <div class="candidate-grid">
            {#each candidates.filter((c) => c.phaseId === 'ACCUMULATION') as cand}
              {@const candidateKey = `${cand.patternSlug}:${cand.symbol}`}
              <div class="surface-card candidate-card">
                <div class="cand-top">
                  <span class="cand-sym">{cand.symbol.replace('USDT','')}</span>
                  <span class="surface-chip accum-chip">Accumulation</span>
                </div>
                <div class="cand-meta">
                  <span>{cand.patternId.replace(/_/g,' ')}</span>
                  <span>{cand.enteredAt ? sinceHours(cand.enteredAt) : '진입 시간 미상'}</span>
                </div>
                <div class="cand-actions">
                  <a class="surface-button-ghost compact-action" href="/cogochi?symbol={cand.symbol}">Open Chart</a>
                  <button
                    class="surface-button-secondary compact-action valid"
                    onclick={() => saveCandidate(cand)}
                    disabled={!cand.candidateTransitionId || savingCandidateIds.has(candidateKey)}
                  >
                    {savingCandidateIds.has(candidateKey) ? 'Saving…' : 'Save Setup'}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="surface-grid cols-2 patterns-lower">
        <div class="surface-grid">
          <div class="surface-section-head">
            <div>
              <span class="surface-kicker">Live States</span>
              <h2>전체 심볼 상태</h2>
            </div>
            <div class="section-head-right">
              <select
                class="sym-filter"
                value={symbolFilter}
                onchange={(e) => setSymbolFilter((e.target as HTMLSelectElement).value)}
                aria-label="Filter by symbol"
              >
                <option value="">전체 심볼</option>
                {#each symbolOptions as sym}
                  <option value={sym}>{sym.replace('USDT', '')}</option>
                {/each}
              </select>
              <span class="surface-chip">활성 {filteredStates.length}개</span>
            </div>
          </div>

          {#if states.length === 0}
            <div class="surface-card empty-card">
              <p>추적 중인 심볼 없음 — 스캔을 실행하면 상태가 채워집니다</p>
            </div>
          {:else if filteredStates.length === 0}
            <div class="surface-card empty-card">
              <p>{symbolFilter} — 활성 상태 없음</p>
            </div>
          {:else}
            <div class="surface-card states-shell">
              <div class="states-table">
                <div class="table-header">
                  <span>심볼</span>
                  <span>패턴</span>
                  <span>현재 페이즈</span>
                  <span>진입 시간</span>
                  <span>캔들 수</span>
                </div>
                {#each filteredStates as s}
                  {@const meta = phaseMetaFor(s.phaseId, s.phaseLabel, s.phaseIdx)}
                  <div class="table-row" class:highlight={s.phaseId === 'ACCUMULATION'}>
                    <span class="row-sym">
                      <a href="/cogochi?symbol={s.symbol}">{s.symbol.replace('USDT','')}</a>
                    </span>
                    <span class="row-pattern">{s.patternId.replace(/_/g,' ')}</span>
                    <span class="row-phase" style="--phase-color:{meta.color}">{meta.label}</span>
                    <span class="row-time">{s.enteredAt ? sinceHours(s.enteredAt) : '—'}</span>
                    <span class="row-candles">{s.barsInPhase}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <div class="surface-grid">
          <div class="surface-section-head">
            <div>
              <span class="surface-kicker">Pattern Stats</span>
              <h2>성과와 준비도</h2>
            </div>
            <span class="surface-chip">{stats.length} patterns</span>
          </div>

          <div class="stats-grid">
            {#each stats as s}
              <div class="surface-card stat-card">
                <span class="stat-name">{s.pattern_slug.replace(/_/g,' ')}</span>
                <div class="stat-row">
                  <span class="stat-label">적중률</span>
                  <span class="stat-value {(s.hit_rate ?? 0) >= 0.6 ? 'good' : (s.hit_rate ?? 0) >= 0.4 ? 'mid' : 'bad'}">
                    {fmtPct(s.hit_rate)}
                  </span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">평균 수익 / 손실</span>
                  <span class="stat-value">
                    {s.avg_gain_pct != null ? `+${fmtPct(s.avg_gain_pct, 1)}` : '—'}
                    {#if s.avg_loss_pct != null}
                      <span class="stat-loss"> / {fmtPct(s.avg_loss_pct, 1)}</span>
                    {/if}
                  </span>
                </div>
                {#if s.expected_value != null}
                  <div class="stat-row">
                    <span class="stat-label">기대값</span>
                    <span class="stat-value {s.expected_value >= 0 ? 'good' : 'bad'}">
                      {s.expected_value >= 0 ? '+' : ''}{fmtPct(s.expected_value, 2)}
                    </span>
                  </div>
                {/if}
                <div class="stat-row">
                  <span class="stat-label">총 인스턴스</span>
                  <span class="stat-value">{s.total_instances}</span>
                </div>
                {#if s.ml_shadow}
                  {@const mlReady = s.ml_shadow.ready_to_train ?? false}
                  {@const mlUsable = s.ml_shadow.training_usable_count ?? 0}
                  <div class="stat-row">
                    <span class="stat-label">ML coverage</span>
                    <span class="stat-value {s.ml_shadow.score_coverage != null && s.ml_shadow.score_coverage >= 0.8 ? 'good' : s.ml_shadow.score_coverage != null && s.ml_shadow.score_coverage >= 0.4 ? 'mid' : 'bad'}">
                      {fmtPct(s.ml_shadow.score_coverage)}
                    </span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">학습 준비</span>
                    <span class="stat-value" class:good={mlReady} class:mid={!mlReady && mlUsable >= 10} class:bad={!mlReady && mlUsable < 10}>
                      {mlReady ? 'Ready' : 'Shadow'}
                    </span>
                  </div>
                  <p class="stat-footnote">{s.ml_shadow.readiness_reason}</p>
                {/if}
              </div>
            {/each}
            {#if stats.length === 0}
              <div class="surface-card empty-card">
                <p>아직 판정 데이터 없음 — VALID/INVALID 판정이 쌓이면 통계가 생성됩니다</p>
              </div>
            {/if}
          </div>
        </div>
      </section>

      <!-- Recent Transitions panel -->
      <section class="surface-grid">
        <div class="surface-section-head">
          <div>
            <span class="surface-kicker">Transitions</span>
            <h2>최근 페이즈 전이</h2>
          </div>
          <span class="surface-chip">{filteredTransitions.length} records</span>
        </div>
        {#if filteredTransitions.length === 0}
          <div class="surface-card empty-card">
            <p>아직 기록된 전이 없음</p>
          </div>
        {:else}
          <div class="surface-card transitions-shell">
            <table class="transitions-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th class="hide-sm">Pattern</th>
                  <th>From</th>
                  <th class="arrow-th"></th>
                  <th>To</th>
                  <th class="hide-sm">Conf</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {#each filteredTransitions as t}
                  <TransitionRow
                    symbol={t.symbol}
                    slug={t.pattern_slug}
                    fromPhase={t.from_phase}
                    toPhase={t.to_phase}
                    confidence={t.confidence}
                    transitionedAt={t.transitioned_at}
                  />
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>

      <!-- Verdict Inbox — collapsible, default closed -->
      <section class="surface-grid">
        <button class="verdict-inbox-toggle" onclick={() => (verdictInboxOpen = !verdictInboxOpen)}>
          <span class="surface-kicker">Flywheel</span>
          <span class="verdict-inbox-label">Verdict Inbox</span>
          <span class="verdict-inbox-arrow">{verdictInboxOpen ? '▲' : '▼'}</span>
        </button>
        {#if verdictInboxOpen}
          <VerdictInboxSection />
        {/if}
      </section>
    {/if}
  </div>
</div>

<FeedbackButton />

<style>
  .patterns-copy {
    align-items: flex-start;
  }

  .topbar-tertiary {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: 4px;
  }
  .tertiary-link {
    padding: 3px 8px;
    color: rgba(250, 247, 235, 0.35);
    font-size: 11px;
    text-decoration: none;
    letter-spacing: 0.04em;
    border: 0.5px solid rgba(250, 247, 235, 0.12);
    border-radius: 2px;
    font-family: var(--font-mono, monospace);
    transition: color 0.1s, border-color 0.1s;
  }
  .tertiary-link:hover { color: rgba(250, 247, 235, 0.7); border-color: rgba(250, 247, 235, 0.3); }

  .verdict-inbox-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(249, 216, 194, 0.06);
    padding: 10px 0;
    cursor: pointer;
    text-align: left;
    transition: background 0.08s;
  }
  .verdict-inbox-toggle:hover { background: rgba(255,255,255,0.02); }
  .verdict-inbox-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: rgba(250, 247, 235, 0.65);
    flex: 1;
  }
  .verdict-inbox-arrow {
    font-size: var(--ui-text-xs);
    color: rgba(250, 247, 235, 0.3);
  }

  .page-loading,
  .page-error,
  .empty-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    color: rgba(255,255,255,0.55);
    padding: 48px 24px;
    text-align: center;
  }
  .pulse { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.3); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:.2} 50%{opacity:1} }
  .page-error { color: #f87171; }
  .error-detail { font-size: var(--ui-text-xs); color: rgba(248,113,113,0.6); max-width: 400px; text-align: center; }
  .patterns-lower {
    align-items: start;
  }

  .candidate-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
  .candidate-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .cand-top { display: flex; align-items: center; justify-content: space-between; }
  .cand-sym { font-family: var(--sc-font-mono, monospace); font-size: 16px; font-weight: 700; color: #fff; }
  .accum-chip { color: #26a69a; border-color: rgba(38,166,154,0.28); background: rgba(38,166,154,0.08); }
  .cand-meta { display: flex; justify-content: space-between; font-size: var(--ui-text-xs); color: rgba(255,255,255,0.3); font-family: var(--sc-font-mono, monospace); }
  .cand-actions { display: flex; gap: 6px; align-items: center; margin-top: 2px; }
  .compact-action { min-height: 34px; padding: 0 12px; font-size: 0.8rem; }
  .compact-action.valid { color: #26a69a; border-color: rgba(38,166,154,0.28); }

  .states-shell {
    padding: 0;
    overflow: hidden;
  }
  .states-table { display: flex; flex-direction: column; overflow: hidden; }
  .table-header {
    display: grid;
    grid-template-columns: 80px 1fr 140px 80px 60px;
    padding: 6px 12px;
    background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    letter-spacing: 0.06em;
    color: rgba(255,255,255,0.25);
  }
  .table-row {
    display: grid;
    grid-template-columns: 80px 1fr 140px 80px 60px;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    align-items: center;
    transition: background 0.1s;
  }
  .table-row:hover { background: rgba(255,255,255,0.03); }
  .table-row.highlight { background: rgba(38,166,154,0.04); }
  .row-sym a { font-family: var(--sc-font-mono, monospace); font-size: 12px; font-weight: 700; color: #fff; text-decoration: none; }
  .row-sym a:hover { color: #63b3ed; }
  .row-pattern { font-size: 11px; color: rgba(255,255,255,0.35); font-family: var(--sc-font-mono, monospace); }
  .row-phase { font-family: var(--sc-font-mono, monospace); font-size: 11px; font-weight: 700; color: var(--phase-color); }
  .row-time, .row-candles { font-family: var(--sc-font-mono, monospace); font-size: 11px; color: rgba(255,255,255,0.3); }

  .section-head-right { display: flex; align-items: center; gap: 8px; }

  .sym-filter {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    color: rgba(255,255,255,0.7);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    padding: 3px 6px;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  }
  .sym-filter:focus { outline: none; border-color: rgba(255,255,255,0.25); }

  .transitions-shell { padding: 0; overflow: hidden; overflow-x: auto; }
  .transitions-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
  }
  .transitions-table th {
    padding: 6px 8px;
    text-align: left;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.08em;
    color: rgba(255,255,255,0.25);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.03);
    text-transform: uppercase;
    white-space: nowrap;
  }
  .arrow-th { width: 16px; padding: 6px 2px; }

  .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
  .stat-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .stat-name { font-family: var(--sc-font-mono, monospace); font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.06em; }
  .stat-row { display: flex; justify-content: space-between; align-items: center; }
  .stat-label { font-size: 11px; color: rgba(255,255,255,0.3); }
  .stat-value { font-family: var(--sc-font-mono, monospace); font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.7); }
  .stat-value.good { color: #26a69a; }
  .stat-loss { color: #ef5350; opacity: 0.7; }
  .stat-value.mid  { color: #fbbf24; }
  .stat-value.bad  { color: #ef5350; }
  .stat-footnote {
    margin: 0;
    color: var(--sc-text-1);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  @media (max-width: 960px) {
    .table-header,
    .table-row {
      grid-template-columns: 70px 1fr 120px 70px 56px;
    }
  }

  @media (max-width: 640px) {
    .cand-actions { flex-wrap: wrap; }
    .hide-sm { display: none; }
    .transitions-table { font-size: var(--ui-text-xs); }
    .table-header, .table-row { grid-template-columns: 64px 1fr 100px 60px 44px; }
  }
</style>
