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

<div class="patterns-shell">

  <!-- ── Top bar ── -->
  <div class="top-bar">
    <div class="top-left">
      <span class="page-title">PATTERN ENGINE</span>
      {#if lastScan}
        <span class="scan-time">마지막 스캔 {sinceHours(lastScan)}</span>
      {/if}
    </div>
    <button class="scan-btn" onclick={triggerScan} disabled={scanning}>
      {scanning ? '스캔 중…' : '▶ 지금 스캔'}
    </button>
  </div>

  {#if loading}
    <div class="page-loading">
      <span class="pulse"></span>
      <span>패턴 데이터 로딩 중…</span>
    </div>

  {:else if error}
    <div class="page-error">
      <p>⚠ 엔진 연결 실패 — Python 엔진이 실행 중인지 확인하세요</p>
      <p class="error-detail">{error}</p>
      <button onclick={loadAll}>재시도</button>
    </div>

  {:else}

    <!-- ── Section 1: ACCUMULATION alerts (act now) ── -->
    <section class="section">
      <div class="section-header">
        <span class="section-title">⚡ 진입 후보 — ACCUMULATION</span>
        <span class="section-count">{candidates.filter(c => c.phase === 3).length}개</span>
      </div>

      {#if candidates.filter(c => c.phase === 3).length === 0}
        <p class="empty-hint">현재 ACCUMULATION 진입 후보 없음 — 15분마다 스캔</p>
      {:else}
        <div class="candidate-grid">
          {#each candidates.filter(c => c.phase === 3) as cand}
            <div class="candidate-card">
              <div class="cand-top">
                <span class="cand-sym">{cand.symbol.replace('USDT','')}</span>
                <span class="cand-badge accum">ACCUMULATION</span>
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
                <a class="cand-chart-link" href="/terminal?symbol={cand.symbol}">차트 →</a>
                <button class="verdict-btn valid" onclick={() => submitVerdict(cand.symbol, cand.pattern_id, 'valid')}>✓ VALID</button>
                <button class="verdict-btn invalid" onclick={() => submitVerdict(cand.symbol, cand.pattern_id, 'invalid')}>✗ SKIP</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- ── Section 2: All active states ── -->
    <section class="section">
      <div class="section-header">
        <span class="section-title">📊 전체 심볼 상태</span>
        <span class="section-count">활성 {states.length}개</span>
      </div>

      {#if states.length === 0}
        <p class="empty-hint">추적 중인 심볼 없음 — 스캔을 실행하면 상태가 채워집니다</p>
      {:else}
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
      {/if}
    </section>

    <!-- ── Section 3: Pattern stats ── -->
    <section class="section">
      <div class="section-header">
        <span class="section-title">📈 패턴 통계</span>
      </div>
      <div class="stats-grid">
        {#each stats as s}
          <div class="stat-card">
            <span class="stat-name">{s.pattern_slug.replace(/_/g,' ')}</span>
            <div class="stat-row">
              <span class="stat-label">적중률</span>
              <span class="stat-value {(s.hit_rate ?? 0) >= 0.6 ? 'good' : (s.hit_rate ?? 0) >= 0.4 ? 'mid' : 'bad'}">
                {s.hit_rate != null ? `${(s.hit_rate * 100).toFixed(0)}%` : '—'}
              </span>
            </div>
            <div class="stat-row">
              <span class="stat-label">평균 수익 / 손실</span>
              <span class="stat-value">
                {s.avg_gain_pct != null ? `+${(s.avg_gain_pct * 100).toFixed(1)}%` : '—'}
                {#if s.avg_loss_pct != null}
                  <span class="stat-loss"> / {(s.avg_loss_pct * 100).toFixed(1)}%</span>
                {/if}
              </span>
            </div>
            {#if s.expected_value != null}
            <div class="stat-row">
              <span class="stat-label">기대값 (EV)</span>
              <span class="stat-value {s.expected_value >= 0 ? 'good' : 'bad'}">
                {s.expected_value >= 0 ? '+' : ''}{(s.expected_value * 100).toFixed(2)}%
              </span>
            </div>
            {/if}
            <div class="stat-row">
              <span class="stat-label">총 인스턴스</span>
              <span class="stat-value">{s.total_instances} <span class="stat-sub">(성공 {s.success_count} / 실패 {s.failure_count} / 대기 {s.pending_count})</span></span>
            </div>
            {#if s.btc_conditional}
            <div class="stat-row">
              <span class="stat-label">BTC 시장별</span>
              <span class="stat-value stat-sub">
                상승 {s.btc_conditional.bullish != null ? `${(s.btc_conditional.bullish * 100).toFixed(0)}%` : '—'}
                · 횡보 {s.btc_conditional.sideways != null ? `${(s.btc_conditional.sideways * 100).toFixed(0)}%` : '—'}
                · 하락 {s.btc_conditional.bearish != null ? `${(s.btc_conditional.bearish * 100).toFixed(0)}%` : '—'}
              </span>
            </div>
            {/if}
            {#if s.decay_direction}
            <div class="stat-row">
              <span class="stat-label">Edge 추세</span>
              <span class="stat-value" class:good={s.decay_direction === 'improving'} class:bad={s.decay_direction === 'decaying'}>
                {s.decay_direction === 'improving' ? '개선 중' : s.decay_direction === 'decaying' ? '약화 중' : '안정'}
              </span>
            </div>
            {/if}
            {#if s.ml_shadow}
            <div class="stat-row">
              <span class="stat-label">ML shadow</span>
              <span class="stat-value {s.ml_shadow.score_coverage != null && s.ml_shadow.score_coverage >= 0.8 ? 'good' : s.ml_shadow.score_coverage != null && s.ml_shadow.score_coverage >= 0.4 ? 'mid' : 'bad'}">
                {s.ml_shadow.score_coverage != null ? `${(s.ml_shadow.score_coverage * 100).toFixed(0)}%` : '—'}
                <span class="stat-sub"> ({s.ml_shadow.scored_entries}/{s.ml_shadow.total_entries})</span>
              </span>
            </div>
            <div class="stat-row">
              <span class="stat-label">P(win) / 통과율</span>
              <span class="stat-value stat-sub">
                평균 {s.ml_shadow.avg_p_win != null ? `${(s.ml_shadow.avg_p_win * 100).toFixed(0)}%` : '—'}
                · 통과 {s.ml_shadow.threshold_pass_rate != null ? `${(s.ml_shadow.threshold_pass_rate * 100).toFixed(0)}%` : '—'}
              </span>
            </div>
            <div class="stat-row">
              <span class="stat-label">임계값 위/아래 적중</span>
              <span class="stat-value stat-sub">
                위 {s.ml_shadow.above_threshold_success_rate != null ? `${(s.ml_shadow.above_threshold_success_rate * 100).toFixed(0)}%` : '—'}
                · 아래 {s.ml_shadow.below_threshold_success_rate != null ? `${(s.ml_shadow.below_threshold_success_rate * 100).toFixed(0)}%` : '—'}
              </span>
            </div>
            <div class="stat-row">
              <span class="stat-label">학습 준비</span>
              <span class="stat-value" class:good={s.ml_shadow.ready_to_train} class:mid={!s.ml_shadow.ready_to_train && s.ml_shadow.training_usable_count >= 10} class:bad={!s.ml_shadow.ready_to_train && s.ml_shadow.training_usable_count < 10}>
                {s.ml_shadow.ready_to_train ? 'READY' : 'SHADOW'}
                <span class="stat-sub"> ({s.ml_shadow.training_usable_count}건 / 승 {s.ml_shadow.training_win_count} / 패 {s.ml_shadow.training_loss_count})</span>
              </span>
            </div>
            <div class="stat-row">
              <span class="stat-label">준비 상태</span>
              <span class="stat-value stat-sub">
                {s.ml_shadow.readiness_reason}
                {#if s.ml_shadow.last_model_version}
                  <span class="stat-sub"> · 모델 {s.ml_shadow.last_model_version}</span>
                {/if}
              </span>
            </div>
            {/if}
          </div>
        {/each}
        {#if stats.length === 0}
          <p class="empty-hint">아직 판정 데이터 없음 — VALID/INVALID 판정이 쌓이면 통계가 생성됩니다</p>
        {/if}
      </div>
    </section>

  {/if}
</div>

<style>
  .patterns-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    background: #000;
    color: rgba(255,255,255,0.85);
    font-family: var(--sc-font-body, sans-serif);
    padding: 0 0 60px;
  }

  /* Top bar */
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 24px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    position: sticky;
    top: 0;
    background: #000;
    z-index: 10;
  }
  .top-left { display: flex; align-items: center; gap: 14px; }
  .page-title {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #fff;
  }
  .scan-time {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255,255,255,0.3);
  }
  .scan-btn {
    padding: 6px 14px;
    background: rgba(38,166,154,0.12);
    border: 1px solid rgba(38,166,154,0.4);
    color: #26a69a;
    border-radius: 4px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.1s;
  }
  .scan-btn:hover:not(:disabled) { background: rgba(38,166,154,0.25); }
  .scan-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Loading / Error */
  .page-loading, .page-error {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    color: rgba(255,255,255,0.3);
    padding: 60px;
  }
  .pulse { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.3); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:.2} 50%{opacity:1} }
  .page-error { color: #f87171; }
  .error-detail { font-size: 10px; color: rgba(248,113,113,0.6); max-width: 400px; text-align: center; }
  .page-error button { padding: 6px 14px; background: transparent; border: 1px solid rgba(248,113,113,0.3); color: #f87171; border-radius: 4px; cursor: pointer; font-size: 11px; }

  /* Sections */
  .section { padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .section-title { font-family: var(--sc-font-mono, monospace); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: rgba(255,255,255,0.7); }
  .section-count { font-family: var(--sc-font-mono, monospace); font-size: 10px; color: rgba(255,255,255,0.3); margin-left: auto; }
  .empty-hint { font-size: 11px; color: rgba(255,255,255,0.2); font-family: var(--sc-font-mono, monospace); margin: 0; }

  /* Candidate cards */
  .candidate-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
  .candidate-card {
    background: rgba(38,166,154,0.05);
    border: 1px solid rgba(38,166,154,0.2);
    border-radius: 6px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cand-top { display: flex; align-items: center; justify-content: space-between; }
  .cand-sym { font-family: var(--sc-font-mono, monospace); font-size: 16px; font-weight: 700; color: #fff; }
  .cand-badge { font-family: var(--sc-font-mono, monospace); font-size: 9px; font-weight: 700; letter-spacing: 0.08em; padding: 2px 7px; border-radius: 3px; }
  .cand-badge.accum { background: rgba(38,166,154,0.2); color: #26a69a; border: 1px solid rgba(38,166,154,0.4); }
  .cand-meta { display: flex; justify-content: space-between; font-size: 10px; color: rgba(255,255,255,0.3); font-family: var(--sc-font-mono, monospace); }
  .cand-features { display: flex; gap: 6px; flex-wrap: wrap; }
  .feat { font-family: var(--sc-font-mono, monospace); font-size: 10px; background: rgba(255,255,255,0.06); border-radius: 3px; padding: 2px 6px; color: rgba(255,255,255,0.6); }
  .cand-actions { display: flex; gap: 6px; align-items: center; margin-top: 2px; }
  .cand-chart-link { font-family: var(--sc-font-mono, monospace); font-size: 10px; color: #63b3ed; text-decoration: none; margin-right: auto; }
  .cand-chart-link:hover { text-decoration: underline; }
  .verdict-btn { padding: 4px 10px; border-radius: 3px; font-family: var(--sc-font-mono, monospace); font-size: 10px; font-weight: 600; cursor: pointer; transition: all 0.1s; border: 1px solid; }
  .verdict-btn.valid { background: rgba(38,166,154,0.1); border-color: rgba(38,166,154,0.4); color: #26a69a; }
  .verdict-btn.valid:hover { background: rgba(38,166,154,0.25); }
  .verdict-btn.invalid { background: rgba(239,83,80,0.08); border-color: rgba(239,83,80,0.3); color: #ef5350; }
  .verdict-btn.invalid:hover { background: rgba(239,83,80,0.2); }

  /* States table */
  .states-table { display: flex; flex-direction: column; border: 1px solid rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; }
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

  /* Stats */
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
  .stat-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 6px;
    padding: 14px;
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
  .stat-sub { font-size: 9px; color: rgba(255,255,255,0.25); font-weight: 400; }
</style>
