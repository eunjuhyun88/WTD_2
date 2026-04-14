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
  import { buildCanonicalHref } from '$lib/seo/site';

  // ── Types ──────────────────────────────────────────────────────────────────
  interface PhaseState {
    symbol:       string;
    pattern_id:   string;
    current_phase: number;
    phase_name:   string;
    entered_at:   string;  // ISO
    candles_in_phase: number;
  }
  interface Candidate {
    symbol:     string;
    pattern_id: string;
    phase:      number;
    phase_name: string;
    since:      string;
    features:   Record<string, number>;
  }
  interface PatternStats {
    pattern_slug:    string;
    total_instances: number;
    success_count:   number;
    failure_count:   number;
    pending_count:   number;
    hit_rate:        number | null;
    avg_gain_pct:    number | null;
    avg_loss_pct:    number | null;
    expected_value:  number | null;
    btc_conditional: { bullish: number | null; bearish: number | null; sideways: number | null } | null;
    decay_direction: string | null;
    recent_30d_count: number;
    recent_30d_success_rate: number | null;
    ml_shadow: {
      total_entries: number;
      decided_entries: number;
      state_counts: Record<string, number>;
      scored_entries: number;
      scored_decided_entries: number;
      score_coverage: number | null;
      avg_p_win: number | null;
      threshold_pass_count: number;
      threshold_pass_rate: number | null;
      above_threshold_success_rate: number | null;
      below_threshold_success_rate: number | null;
      training_usable_count: number;
      training_win_count: number;
      training_loss_count: number;
      ready_to_train: boolean;
      readiness_reason: string;
      last_model_version: string | null;
    } | null;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let candidates   = $state<Candidate[]>([]);
  let states       = $state<PhaseState[]>([]);
  let stats        = $state<PatternStats[]>([]);
  let lastScan     = $state<string | null>(null);
  let loading      = $state(true);
  let scanning     = $state(false);
  let error        = $state<string | null>(null);

  // Phase display config
  const PHASE_META: Record<number, { label: string; color: string }> = {
    0: { label: 'FAKE DUMP',    color: 'rgba(251,191,36,0.7)' },
    1: { label: 'ARCH ZONE',    color: 'rgba(99,179,237,0.7)' },
    2: { label: 'REAL DUMP',    color: 'rgba(239,83,80,0.8)' },
    3: { label: 'ACCUMULATION', color: 'rgba(38,166,154,1)' },
    4: { label: 'BREAKOUT',     color: 'rgba(74,222,128,1)' },
  };

  // ── Data loading ───────────────────────────────────────────────────────────
  async function loadAll() {
    error = null;
    try {
      const [candRes, stateRes, statsRes] = await Promise.allSettled([
        fetch('/api/patterns'),
        fetch('/api/patterns/states'),
        fetch('/api/patterns/stats'),
      ]);

      if (candRes.status === 'fulfilled' && candRes.value.ok) {
        const d = await candRes.value.json();
        candidates = d.candidates ?? [];
        lastScan   = d.last_scan ?? null;
      }
      if (stateRes.status === 'fulfilled' && stateRes.value.ok) {
        const d = await stateRes.value.json();
        // states is { symbol: { pattern_id: { ... } } }
        const flat: PhaseState[] = [];
        for (const [sym, patterns] of Object.entries(d.states ?? {})) {
          for (const [pid, st] of Object.entries(patterns as Record<string, any>)) {
            if (st.current_phase >= 0) flat.push({ symbol: sym, pattern_id: pid, ...st });
          }
        }
        states = flat.sort((a, b) => b.current_phase - a.current_phase);
      }
      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const d = await statsRes.value.json();
        stats = d.stats ?? [];
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

  async function submitVerdict(symbol: string, patternId: string, verdict: 'valid' | 'invalid' | 'missed') {
    try {
      await fetch(`/api/patterns/${patternId}/verdict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, verdict }),
      });
      await loadAll();
    } catch {}
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

  const accumulationCount = $derived(candidates.filter((c) => c.phase === 3).length);
  const breakoutCount = $derived(states.filter((s) => s.current_phase === 4).length);

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
      <button class="surface-button-secondary" onclick={() => goto('/terminal')}>Open Terminal</button>
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
            {#each candidates.filter((c) => c.phase === 3) as cand}
              <div class="surface-card candidate-card">
                <div class="cand-top">
                  <span class="cand-sym">{cand.symbol.replace('USDT','')}</span>
                  <span class="surface-chip accum-chip">Accumulation</span>
                </div>
                <div class="cand-meta">
                  <span>{cand.pattern_id.replace(/_/g,' ')}</span>
                  <span>{sinceHours(cand.since)}</span>
                </div>
                {#if cand.features}
                  <div class="cand-features">
                    {#if cand.features.oi_change_1h != null}
                      <span class="feat">OI {cand.features.oi_change_1h > 0 ? '+' : ''}{(cand.features.oi_change_1h * 100).toFixed(1)}%</span>
                    {/if}
                    {#if cand.features.funding_rate != null}
                      <span class="feat">FR {cand.features.funding_rate > 0 ? '+' : ''}{(cand.features.funding_rate * 100).toFixed(4)}%</span>
                    {/if}
                    {#if cand.features.volume_ratio_1h != null}
                      <span class="feat">Vol {cand.features.volume_ratio_1h.toFixed(1)}x</span>
                    {/if}
                  </div>
                {/if}
                <div class="cand-actions">
                  <a class="surface-button-ghost compact-action" href="/terminal?symbol={cand.symbol}">Open Chart</a>
                  <button class="surface-button-secondary compact-action valid" onclick={() => submitVerdict(cand.symbol, cand.pattern_id, 'valid')}>Valid</button>
                  <button class="surface-button-ghost compact-action invalid" onclick={() => submitVerdict(cand.symbol, cand.pattern_id, 'invalid')}>Skip</button>
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
            <span class="surface-chip">활성 {states.length}개</span>
          </div>

          {#if states.length === 0}
            <div class="surface-card empty-card">
              <p>추적 중인 심볼 없음 — 스캔을 실행하면 상태가 채워집니다</p>
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
                {#each states as s}
                  {@const meta = PHASE_META[s.current_phase] ?? { label: String(s.current_phase), color: 'rgba(255,255,255,0.4)' }}
                  <div class="table-row" class:highlight={s.current_phase === 3}>
                    <span class="row-sym">
                      <a href="/terminal?symbol={s.symbol}">{s.symbol.replace('USDT','')}</a>
                    </span>
                    <span class="row-pattern">{s.pattern_id.replace(/_/g,' ')}</span>
                    <span class="row-phase" style="--phase-color:{meta.color}">{meta.label}</span>
                    <span class="row-time">{sinceHours(s.entered_at)}</span>
                    <span class="row-candles">{s.candles_in_phase}</span>
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
                  <div class="stat-row">
                    <span class="stat-label">ML coverage</span>
                    <span class="stat-value {s.ml_shadow.score_coverage != null && s.ml_shadow.score_coverage >= 0.8 ? 'good' : s.ml_shadow.score_coverage != null && s.ml_shadow.score_coverage >= 0.4 ? 'mid' : 'bad'}">
                      {fmtPct(s.ml_shadow.score_coverage)}
                    </span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">학습 준비</span>
                    <span class="stat-value" class:good={s.ml_shadow.ready_to_train} class:mid={!s.ml_shadow.ready_to_train && s.ml_shadow.training_usable_count >= 10} class:bad={!s.ml_shadow.ready_to_train && s.ml_shadow.training_usable_count < 10}>
                      {s.ml_shadow.ready_to_train ? 'Ready' : 'Shadow'}
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
    {/if}
  </div>
</div>

<style>
  .patterns-copy {
    align-items: flex-start;
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
  .error-detail { font-size: 10px; color: rgba(248,113,113,0.6); max-width: 400px; text-align: center; }
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
  .cand-meta { display: flex; justify-content: space-between; font-size: 10px; color: rgba(255,255,255,0.3); font-family: var(--sc-font-mono, monospace); }
  .cand-features { display: flex; gap: 6px; flex-wrap: wrap; }
  .feat { font-family: var(--sc-font-mono, monospace); font-size: 10px; background: rgba(255,255,255,0.06); border-radius: 3px; padding: 2px 6px; color: rgba(255,255,255,0.6); }
  .cand-actions { display: flex; gap: 6px; align-items: center; margin-top: 2px; }
  .compact-action { min-height: 34px; padding: 0 12px; font-size: 0.8rem; }
  .compact-action.valid { color: #26a69a; border-color: rgba(38,166,154,0.28); }
  .compact-action.invalid { color: #ef5350; border-color: rgba(239,83,80,0.2); }

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
    font-size: 9px;
    letter-spacing: 0.08em;
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
  .row-pattern { font-size: 10px; color: rgba(255,255,255,0.35); font-family: var(--sc-font-mono, monospace); }
  .row-phase { font-family: var(--sc-font-mono, monospace); font-size: 10px; font-weight: 700; color: var(--phase-color); }
  .row-time, .row-candles { font-family: var(--sc-font-mono, monospace); font-size: 10px; color: rgba(255,255,255,0.3); }

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
    .cand-actions {
      flex-wrap: wrap;
    }
    .table-header,
    .table-row {
      grid-template-columns: 72px 1fr;
      gap: 8px;
    }
    .table-header span:nth-child(n + 3),
    .table-row span:nth-child(n + 3) {
      display: none;
    }
  }
</style>
