<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { flattenPatternStates } from '$lib/contracts';
  import type { PatternStateView } from '$lib/contracts';
  import type { PatternStats } from '$lib/types/patternStats';
  import type { PnLStats } from '$lib/types/pnlStats';
  import PatternLifecycleCard from '$lib/components/patterns/PatternLifecycleCard.svelte';
  import PatternStatsCard from '$lib/components/patterns/PatternStatsCard.svelte';
  import PatternEquityCurve from '$lib/components/patterns/PatternEquityCurve.svelte';
  import TradeHistoryTab from '$lib/components/patterns/TradeHistoryTab.svelte';

  const slug = $derived($page.params.slug ?? '');

  interface Transition {
    transition_id: string;
    symbol: string;
    pattern_slug: string;
    from_phase: string | null;
    to_phase: string;
    transition_kind: string;
    reason: string;
    transitioned_at: string | null;
    confidence: number;
  }
  let states = $state<PatternStateView[]>([]);
  let transitions = $state<Transition[]>([]);
  let stats = $state<PatternStats | null>(null);
  let pnlStats = $state<PnLStats | null>(null);
  let pnlLoading = $state(true);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Phase distribution: count symbols per phase_id
  let phaseCounts = $derived(
    states.reduce((acc: Record<string, number>, s) => {
      acc[s.phaseId] = (acc[s.phaseId] ?? 0) + 1;
      return acc;
    }, {})
  );

  async function loadAll() {
    loading = true;
    pnlLoading = true;
    error = null;
    try {
      const [statesRes, transRes, statsRes, pnlRes] = await Promise.allSettled([
        fetch(`/api/patterns/states`),
        fetch(`/api/patterns/transitions?slug=${encodeURIComponent(slug)}&limit=30`),
        fetch(`/api/patterns/${encodeURIComponent(slug)}/stats`),
        fetch(`/api/patterns/${encodeURIComponent(slug)}/pnl-stats`),
      ]);

      if (statesRes.status === 'fulfilled' && statesRes.value.ok) {
        const d = await statesRes.value.json();
        states = flattenPatternStates(d)
          .filter((state) => state.patternSlug === slug)
          .sort((a, b) => b.phaseIdx - a.phaseIdx);
      }

      if (transRes.status === 'fulfilled' && transRes.value.ok) {
        const d = await transRes.value.json();
        transitions = (d.transitions ?? []) as Transition[];
      }

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const d = await statsRes.value.json();
        stats = d ?? null;
      }

      if (pnlRes.status === 'fulfilled' && pnlRes.value.ok) {
        const d = await pnlRes.value.json();
        pnlStats = d ?? null;
      }
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
      pnlLoading = false;
    }
  }

  onMount(loadAll);

  function fmt(iso: string | null): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }
</script>

<svelte:head>
  <title>{slug} — Pattern Detail</title>
</svelte:head>

<main>
  <header>
    <a href="/patterns" class="back">← Patterns</a>
    <h1>{slug}</h1>
  </header>

  {#if loading}
    <p class="loading">Loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <section class="section">
      <PatternLifecycleCard slug={slug} ontransition={loadAll} />
    </section>

    <!-- Stats strip -->
    {#if stats}
      <section class="stats-strip">
        <div class="stat">
          <span class="stat-val">{stats.total_instances}</span>
          <span class="stat-label">Total entries</span>
        </div>
        <div class="stat">
          <span class="stat-val">{stats.hit_rate != null ? (stats.hit_rate * 100).toFixed(0) + '%' : '—'}</span>
          <span class="stat-label">Hit rate</span>
        </div>
        <div class="stat">
          <span class="stat-val">{stats.avg_gain_pct != null ? '+' + stats.avg_gain_pct.toFixed(1) + '%' : '—'}</span>
          <span class="stat-label">Avg gain</span>
        </div>
        <div class="stat">
          <span class="stat-val">{stats.recent_30d_count}</span>
          <span class="stat-label">Last 30d</span>
        </div>
      </section>
    {/if}

    <!-- P&L Stats -->
    <section class="section">
      <div class="pnl-row">
        <div class="pnl-card-wrap">
          <PatternStatsCard stats={pnlStats} loading={pnlLoading} />
        </div>
        {#if pnlStats && pnlStats.equity_curve.length >= 2}
          <div class="equity-wrap">
            <PatternEquityCurve points={pnlStats.equity_curve} width={160} height={48} />
          </div>
        {/if}
      </div>
    </section>

    <!-- Trade History -->
    <section class="section">
      <h2>Trade History</h2>
      <TradeHistoryTab stats={pnlStats} />
    </section>

    <!-- Phase distribution -->
    {#if Object.keys(phaseCounts).length > 0}
      <section class="section">
        <h2>Phase distribution</h2>
        <div class="phase-dist">
          {#each Object.entries(phaseCounts).sort((a, b) => Number(b[1]) - Number(a[1])) as [phaseId, count]}
            <div class="phase-pill">
              <span class="phase-label">{phaseId}</span>
              <span class="phase-count">{count}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Active states -->
    <section class="section">
      <h2>Active symbols ({states.length})</h2>
      {#if states.length === 0}
        <p class="empty">No active symbols for this pattern.</p>
      {:else}
        <div class="states-grid">
          {#each states as s}
            <div class="state-card">
              <div class="state-symbol">{s.symbol}</div>
              <div class="state-phase">{s.phaseLabel}</div>
              <div class="state-meta">
                <span>{s.barsInPhase} / {s.maxBars} bars</span>
                <span>{s.progressPct}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width:{Math.min(s.progressPct, 100)}%"></div>
              </div>
              {#if s.enteredAt}
                <div class="state-entered">{fmt(s.enteredAt)}</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Recent transitions -->
    <section class="section">
      <h2>Recent transitions</h2>
      {#if transitions.length === 0}
        <p class="empty">No transitions recorded yet.</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>From</th>
              <th>To</th>
              <th>Conf</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {#each transitions as t}
              <tr>
                <td class="symbol">{t.symbol}</td>
                <td class="phase from">{t.from_phase ?? '—'}</td>
                <td class="phase to">{t.to_phase}</td>
                <td>{t.confidence != null ? (t.confidence * 100).toFixed(0) + '%' : '—'}</td>
                <td class="time">{fmt(t.transitioned_at)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

  {/if}
</main>

<style>
  main {
    max-width: 900px;
    margin: 0 auto;
    padding: 32px 24px 80px;
    font-family: 'JetBrains Mono', monospace;
    color: #e8ede4;
  }
  header { margin-bottom: 24px; }
  .back {
    display: inline-block;
    font-size: 0.75rem;
    color: #a0a8a4;
    text-decoration: none;
    margin-bottom: 8px;
  }
  .back:hover { color: #e8ede4; }
  h1 {
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin: 0;
  }
  h2 {
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #6b7280;
    margin: 0 0 12px;
  }
  .loading, .empty { color: #6b7280; font-size: 0.85rem; }
  .error { color: #f87171; font-size: 0.85rem; }

  .stats-strip {
    display: flex;
    gap: 24px;
    margin-bottom: 32px;
    flex-wrap: wrap;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stat-val { font-size: 1.25rem; font-weight: 600; }
  .stat-label { font-size: 0.7rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; }

  .section { margin-bottom: 40px; }
  .pnl-row { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
  .pnl-card-wrap { flex: 1; min-width: 220px; }
  .equity-wrap { display: flex; align-items: center; padding-top: 12px; }

  .phase-dist { display: flex; flex-wrap: wrap; gap: 8px; }
  .phase-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    font-size: 0.75rem;
  }
  .phase-label { color: #a0a8a4; }
  .phase-count { font-weight: 600; }

  .states-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }
  .state-card {
    padding: 12px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    background: rgba(255,255,255,0.02);
  }
  .state-symbol { font-size: 0.9rem; font-weight: 600; margin-bottom: 4px; }
  .state-phase { font-size: 0.7rem; color: #4ade80; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px; }
  .state-meta { display: flex; justify-content: space-between; font-size: 0.65rem; color: #6b7280; margin-bottom: 4px; }
  .progress-bar { height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; margin-bottom: 6px; }
  .progress-fill { height: 100%; background: #4ade80; border-radius: 2px; }
  .state-entered { font-size: 0.65rem; color: #6b7280; }

  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  th {
    text-align: left;
    padding: 6px 8px;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #6b7280;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  td { padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,0.04); }
  td.symbol { font-weight: 600; }
  td.phase { font-size: 0.7rem; letter-spacing: 0.05em; }
  td.from { color: #94a3b8; }
  td.to { color: #4ade80; }
  td.time { color: #6b7280; font-size: 0.7rem; }

  @media (max-width: 600px) {
    .states-grid { grid-template-columns: 1fr 1fr; }
    .stats-strip { gap: 16px; }
  }
</style>
