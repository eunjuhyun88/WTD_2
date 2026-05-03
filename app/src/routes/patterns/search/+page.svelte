<script lang="ts">
  /**
   * /patterns/search — Pattern Similarity Search
   *
   * Research tool: given a pattern_draft, finds the top-k most similar
   * historical windows in the feature_windows store using the 3-layer
   * hybrid ranker (feature + LCS sequence + context).
   */
  import { onMount } from 'svelte';
  import { buildCanonicalHref } from '$lib/seo/site';
  import SearchResultMiniChart from '$lib/components/search/SearchResultMiniChart.svelte';
  import SearchLayerBadge from '$lib/components/search/SearchLayerBadge.svelte';

  // ── Types ──────────────────────────────────────────────────────────────────
  interface SimilarCandidate {
    symbol: string;
    timeframe: string;
    bar_ts_ms: number;
    bar_iso: string;
    feature_score: number;
    sequence_score: number;
    context_score: number;
    final_score: number;
    observed_phase_path: string[];
    matched_phase_path: string[];
    missing_phases: string[];
  }

  interface SearchResult {
    spec_pattern_family: string;
    spec_phase_path: string[];
    reference_timeframe: string;
    total_candidates_found: number;
    top_k: number;
    candidates: SimilarCandidate[];
    search_meta: Record<string, unknown>;
    generated_at: string;
  }

  // ── Default pattern draft ──────────────────────────────────────────────────
  const DEFAULT_DRAFT = JSON.stringify(
    {
      schema_version: 1,
      pattern_family: 'tradoor_ptb_oi_reversal',
      pattern_label: 'Second dump reclaim',
      source_type: 'terminal_capture',
      timeframe: '1h',
      phases: [
        {
          phase_id: 'real_dump',
          label: 'real dump',
          sequence_order: 0,
          signals_required: ['oi_spike', 'short_funding_pressure'],
          signals_preferred: ['volume_breakout'],
        },
        {
          phase_id: 'accumulation',
          label: 'higher lows',
          sequence_order: 1,
          signals_required: ['higher_lows_sequence'],
          signals_forbidden: ['long_funding_pressure'],
          max_gap_bars: 18,
        },
        {
          phase_id: 'breakout',
          label: 'range break',
          sequence_order: 2,
          signals_required: ['range_high_break'],
        },
      ],
    },
    null,
    2
  );

  // ── Catalog picker ─────────────────────────────────────────────────────────
  // Fetched from /search/catalog on mount — unique pattern families for quick-pick
  let catalogPatterns = $state<string[]>([]);
  let selectedPattern = $state('');

  async function loadCatalog() {
    try {
      const res = await fetch('/api/search/catalog?limit=500');
      if (!res.ok) return;
      const body: { windows: Array<{ pattern_slug?: string; source?: string }> } = await res.json();
      const seen = new Set<string>();
      for (const w of body.windows ?? []) {
        const slug = w.pattern_slug ?? w.source ?? '';
        if (slug && !seen.has(slug)) { seen.add(slug); catalogPatterns.push(slug); }
      }
    } catch { /* silent — picker is optional */ }
  }

  function onPatternPick() {
    if (!selectedPattern) return;
    try {
      const draft = JSON.parse(draftJson);
      draft.pattern_family = selectedPattern;
      draft.pattern_label = selectedPattern.replace(/_/g, ' ');
      draftJson = JSON.stringify(draft, null, 2);
    } catch {
      // if JSON is broken, just set a minimal draft
      draftJson = JSON.stringify({ schema_version: 1, pattern_family: selectedPattern, phases: [] }, null, 2);
    }
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let draftJson = $state(DEFAULT_DRAFT);
  let topK = $state(10);
  let sinceDays = $state(180);
  let loading = $state(false);
  let result = $state<SearchResult | null>(null);
  let error = $state<string | null>(null);
  let parseError = $state<string | null>(null);

  // ── Search ─────────────────────────────────────────────────────────────────
  async function runSearch() {
    parseError = null;
    error = null;

    let draft: unknown;
    try {
      draft = JSON.parse(draftJson);
    } catch (e) {
      parseError = `JSON parse error: ${e}`;
      return;
    }

    loading = true;
    result = null;
    try {
      const res = await fetch('/api/search/similar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pattern_draft: draft, top_k: topK, since_days: sinceDays }),
      });
      const body = await res.json();
      if (!res.ok) {
        error = body?.detail?.msg ?? body?.detail ?? `HTTP ${res.status}`;
        return;
      }
      result = body as SearchResult;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  onMount(() => { loadCatalog(); });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function scoreBar(value: number): string {
    const pct = Math.round(value * 100);
    if (pct >= 70) return 'score-high';
    if (pct >= 40) return 'score-mid';
    return 'score-low';
  }

  function fmtScore(v: number): string {
    return (v * 100).toFixed(1);
  }

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
  }

  function symbolTicker(s: string): string {
    return s.replace(/USDT?$/, '');
  }
</script>

<svelte:head>
  <title>Pattern Search — Cogochi</title>
  <meta name="description" content="Find historical bar windows similar to a pattern draft using the 3-layer hybrid ranker." />
  <link rel="canonical" href={buildCanonicalHref('/patterns/search')} />
</svelte:head>

<div class="surface-page chrome-layout search-page">
  <header class="surface-hero surface-fixed-hero">
    <div class="surface-copy">
      <div>
        <span class="surface-kicker">Pattern Research</span>
        <h1 class="surface-title">Similarity Search</h1>
      </div>
      <SearchLayerBadge />
      <p class="surface-subtitle">
        Finds historical windows similar to a pattern draft from the feature_windows store.
        Feature (0.45) + Phase sequence (0.45) + Context (0.10) 3-layer hybrid scoring.
      </p>
    </div>
    {#if result}
      <div class="surface-stats">
        <article class="surface-stat">
          <span class="surface-meta">Candidates</span>
          <strong>{result.total_candidates_found}</strong>
        </article>
        <article class="surface-stat">
          <span class="surface-meta">Returned</span>
          <strong>{result.candidates.length}</strong>
        </article>
        <article class="surface-stat">
          <span class="surface-meta">Timeframe</span>
          <strong>{result.reference_timeframe}</strong>
        </article>
        <article class="surface-stat">
          <span class="surface-meta">Pattern</span>
          <strong>{result.spec_pattern_family.replace(/_/g, ' ')}</strong>
        </article>
      </div>
    {/if}
  </header>

  <div class="surface-scroll-body search-content">
    <!-- Query panel -->
    <section class="surface-grid query-panel">
      <div class="surface-section-head">
        <div>
          <span class="surface-kicker">Query</span>
          <h2>Pattern Draft</h2>
        </div>
      </div>

      <div class="surface-card query-card">
        {#if catalogPatterns.length > 0}
          <div class="catalog-picker">
            <label class="field-label" for="catalog-select">Quick pattern select</label>
            <select
              id="catalog-select"
              class="catalog-select"
              bind:value={selectedPattern}
              onchange={onPatternPick}
            >
              <option value="">— Select pattern —</option>
              {#each catalogPatterns as slug}
                <option value={slug}>{slug.replace(/_/g, ' ')}</option>
              {/each}
            </select>
          </div>
        {/if}

        <label class="field-label" for="draft-input">pattern_draft JSON</label>
        <textarea
          id="draft-input"
          class="draft-textarea"
          class:parse-error={!!parseError}
          bind:value={draftJson}
          rows={20}
          spellcheck={false}
        ></textarea>
        {#if parseError}
          <p class="inline-error">{parseError}</p>
        {/if}

        <div class="query-params">
          <label class="param-field">
            <span class="param-label">top_k</span>
            <input type="number" min="1" max="50" bind:value={topK} />
          </label>
          <label class="param-field">
            <span class="param-label">since_days</span>
            <input type="number" min="1" max="730" bind:value={sinceDays} />
          </label>
          <button
            class="surface-button run-btn"
            onclick={runSearch}
            disabled={loading}
          >
            {loading ? 'Searching…' : 'Run Search'}
          </button>
        </div>
      </div>
    </section>

    <!-- Results -->
    {#if error}
      <section class="surface-card page-error">
        <p>⚠ Search failed</p>
        <p class="error-detail">{error}</p>
      </section>

    {:else if loading}
      <section class="surface-card page-loading">
        <span class="pulse"></span>
        <span>Searching feature_windows store…</span>
      </section>

    {:else if result}
      <section class="surface-grid results-section">
        <div class="surface-section-head">
          <div>
            <span class="surface-kicker">Results</span>
            <h2>Top {result.candidates.length} matches</h2>
          </div>
          {#if result.spec_phase_path.length}
            <span class="surface-chip phase-path">{result.spec_phase_path.join(' → ')}</span>
          {/if}
        </div>

        {#if result.candidates.length === 0}
          <div class="surface-card empty-card">
            <p>No results — the feature_windows store is empty or no matching zones found.</p>
            <p class="empty-hint">
              Local env: run <code>python -m research.feature_windows_builder --all --tf 15m,1h,4h</code> first.
            </p>
          </div>
        {:else}
          <div class="surface-card results-shell">
            <div class="results-table">
              <div class="table-header">
                <span class="col-chart">Chart</span>
                <span>Symbol</span>
                <span>TF</span>
                <span>Date</span>
                <span class="col-score">Feature</span>
                <span class="col-score">Seq</span>
                <span class="col-score">Final</span>
                <span>Phases</span>
              </div>
              {#each result.candidates as c, i}
                <div class="table-row" class:top-result={i === 0}>
                  <span class="col-chart">
                    {#if c.bar_ts_ms}
                      <SearchResultMiniChart
                        symbol={c.symbol}
                        timeframe={c.timeframe}
                        bar_ts_ms={c.bar_ts_ms}
                      />
                    {:else}
                      <div class="no-chart">▤</div>
                    {/if}
                  </span>
                  <span class="row-sym">
                    <a href="/cogochi?symbol={c.symbol}">{symbolTicker(c.symbol)}</a>
                  </span>
                  <span class="row-tf">{c.timeframe}</span>
                  <span class="row-date">{fmtDate(c.bar_iso)}</span>
                  <span class="row-score {scoreBar(c.feature_score)}">{fmtScore(c.feature_score)}</span>
                  <span class="row-score {scoreBar(c.sequence_score)}">{fmtScore(c.sequence_score)}</span>
                  <span class="row-score final {scoreBar(c.final_score)}">{fmtScore(c.final_score)}</span>
                  <span class="row-phases">
                    {#if c.observed_phase_path.length}
                      {c.observed_phase_path.join('→')}
                    {:else}
                      <span class="dim">—</span>
                    {/if}
                    {#if c.missing_phases.length}
                      <span class="missing">−{c.missing_phases.join(',')}</span>
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </section>
    {/if}
  </div>
</div>

<style>
  .search-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-bottom: 40px;
  }

  /* ── Query panel ── */
  .query-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .field-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.35);
    text-transform: uppercase;
  }

  .draft-textarea {
    width: 100%;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.85);
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    line-height: 1.6;
    padding: 12px;
    resize: vertical;
    outline: none;
    transition: border-color 0.15s;
  }
  .draft-textarea:focus {
    border-color: rgba(99, 179, 237, 0.4);
  }
  .draft-textarea.parse-error {
    border-color: rgba(248, 113, 113, 0.5);
  }

  .inline-error {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: #f87171;
    margin: 0;
  }

  .query-params {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
  }

  .param-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .param-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.35);
    text-transform: uppercase;
  }

  .param-field input {
    width: 80px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.85);
    font-family: var(--sc-font-mono, monospace);
    font-size: 13px;
    padding: 6px 10px;
    outline: none;
  }
  .param-field input:focus {
    border-color: rgba(99, 179, 237, 0.4);
  }

  .run-btn {
    align-self: flex-end;
  }

  /* ── State cards ── */
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
    color: rgba(255, 255, 255, 0.55);
    padding: 48px 24px;
    text-align: center;
  }
  .page-error { color: #f87171; }
  .error-detail {
    font-size: var(--ui-text-xs);
    color: rgba(248, 113, 113, 0.6);
    max-width: 500px;
  }
  .empty-hint {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.3);
    max-width: 500px;
  }
  .empty-hint code {
    color: rgba(99, 179, 237, 0.8);
  }
  .pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }

  /* ── Results ── */
  .phase-path {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    letter-spacing: 0.04em;
  }

  .results-shell {
    padding: 0;
    overflow: hidden;
  }

  .results-table {
    display: flex;
    flex-direction: column;
    overflow-x: auto;
  }

  .table-header,
  .table-row {
    display: grid;
    grid-template-columns: 190px 70px 44px 90px 60px 60px 60px 1fr;
    gap: 4px;
    padding: 8px 14px;
    align-items: center;
  }

  /* Mini chart column */
  .col-chart {
    display: flex;
    align-items: center;
  }
  .no-chart {
    width: 180px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d1117;
    border-radius: 6px;
    font-size: 1.4rem;
    opacity: 0.2;
  }

  .table-header {
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.25);
    text-transform: uppercase;
  }

  .table-row {
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    transition: background 0.1s;
  }
  .table-row:hover { background: rgba(255, 255, 255, 0.025); }
  .table-row.top-result { background: rgba(99, 179, 237, 0.04); }

  .row-sym a {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    text-decoration: none;
  }
  .row-sym a:hover { color: #63b3ed; }

  .row-tf,
  .row-date {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }

  .row-score {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    font-weight: 600;
    text-align: right;
  }
  .row-score.score-high { color: #26a69a; }
  .row-score.score-mid  { color: #fbbf24; }
  .row-score.score-low  { color: rgba(255, 255, 255, 0.3); }
  .row-score.final { font-size: 13px; }

  .row-phases {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(255, 255, 255, 0.35);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .missing {
    color: #ef5350;
    margin-left: 4px;
  }
  .dim { color: rgba(255, 255, 255, 0.2); }

  .col-score { text-align: right; }

  /* Catalog picker */
  .catalog-picker {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .catalog-select {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.75);
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    padding: 8px 10px;
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s;
    max-width: 400px;
  }
  .catalog-select:focus {
    border-color: rgba(99, 179, 237, 0.4);
  }
  .catalog-select option {
    background: #1a1f2e;
  }

  @media (max-width: 768px) {
    .table-header,
    .table-row {
      grid-template-columns: 60px 36px 80px 50px 1fr;
    }
    /* Hide chart column + score columns on mobile */
    .table-header span:nth-child(1),
    .table-row span:nth-child(1),
    .table-header span:nth-child(n + 6),
    .table-row span:nth-child(n + 6) {
      display: none;
    }
  }
</style>
