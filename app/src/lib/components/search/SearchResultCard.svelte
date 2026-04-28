<script lang="ts">
  /**
   * SearchResultCard — displays a single similarity search result.
   *
   * Handles:
   * - Similarity score display (final_score → %)
   * - Watch 1-click via POST /api/captures/{id}/watch (optimistic update)
   * - Optional mini chart placeholder
   */

  export interface SearchResultCardProps {
    capture_id?: string;
    pattern_name: string;
    similarity: number;
    phase: string;
    outcome?: string | null;
    timestamp: string;
    mini_chart_url?: string;
    symbol?: string;
    timeframe?: string;
    rank?: number;
  }

  let {
    capture_id,
    pattern_name,
    similarity,
    phase,
    outcome,
    timestamp,
    mini_chart_url,
    symbol,
    timeframe,
    rank,
  }: SearchResultCardProps = $props();

  // ── Watch state ────────────────────────────────────────────────────────────
  let isWatching = $state(false);
  let watchLoading = $state(false);
  let watchError = $state<string | null>(null);

  async function handleWatch() {
    if (!capture_id || isWatching || watchLoading) return;
    watchLoading = true;
    watchError = null;
    // Optimistic update
    isWatching = true;
    try {
      const res = await fetch(`/api/captures/${capture_id}/watch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        isWatching = false;
        const body = await res.json().catch(() => ({}));
        watchError = body?.message ?? `HTTP ${res.status}`;
      }
    } catch (e) {
      isWatching = false;
      watchError = String(e);
    } finally {
      watchLoading = false;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function scoreClass(v: number): string {
    const pct = v * 100;
    if (pct >= 70) return 'score-high';
    if (pct >= 40) return 'score-mid';
    return 'score-low';
  }

  function fmtSimilarity(v: number): string {
    return (v * 100).toFixed(1) + '%';
  }

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  function symbolTicker(s: string): string {
    return s.replace(/USDT?$/, '');
  }
</script>

<article class="src-card" class:top-result={rank === 0}>
  <!-- Rank badge -->
  {#if rank !== undefined}
    <span class="rank-badge">#{rank + 1}</span>
  {/if}

  <!-- Mini chart or placeholder -->
  <div class="chart-preview">
    {#if mini_chart_url}
      <img src={mini_chart_url} alt="mini chart for {pattern_name}" class="chart-img" />
    {:else}
      <div class="chart-placeholder">
        <span class="chart-icon">▤</span>
      </div>
    {/if}
  </div>

  <!-- Main content -->
  <div class="card-body">
    <div class="card-top">
      <div class="card-meta">
        {#if symbol}
          <a href="/cogochi?symbol={symbol}" class="sym-link">{symbolTicker(symbol)}</a>
        {/if}
        {#if timeframe}
          <span class="tf-chip">{timeframe}</span>
        {/if}
        <span class="pattern-name">{pattern_name}</span>
      </div>

      <!-- Similarity score — prominent -->
      <div class="similarity-badge {scoreClass(similarity)}">
        <span class="sim-label">Similarity</span>
        <strong class="sim-value">{fmtSimilarity(similarity)}</strong>
      </div>
    </div>

    <div class="card-mid">
      <span class="phase-chip">{phase}</span>
      {#if outcome}
        <span class="outcome-chip outcome-{outcome.toLowerCase()}">{outcome}</span>
      {/if}
      <span class="ts-label">{fmtDate(timestamp)}</span>
    </div>

    <div class="card-actions">
      {#if watchError}
        <span class="watch-error">{watchError}</span>
      {/if}
      {#if capture_id}
        <button
          class="watch-btn"
          class:watching={isWatching}
          disabled={isWatching || watchLoading}
          onclick={handleWatch}
          title={isWatching ? 'Watching' : 'Add to Watch'}
        >
          {#if isWatching}
            <span class="watch-icon">★</span> Watching
          {:else}
            <span class="watch-icon">☆</span> Watch
          {/if}
        </button>
      {:else}
        <span class="no-watch-hint">Watch N/A</span>
      {/if}
    </div>
  </div>
</article>

<style>
  .src-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    position: relative;
    transition: background 0.1s;
  }
  .src-card:hover {
    background: rgba(255, 255, 255, 0.025);
  }
  .src-card.top-result {
    background: rgba(99, 179, 237, 0.04);
  }

  /* Rank badge */
  .rank-badge {
    position: absolute;
    top: 8px;
    left: 4px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(255, 255, 255, 0.2);
    width: 22px;
    text-align: center;
  }

  /* Chart preview */
  .chart-preview {
    flex-shrink: 0;
    width: 64px;
    height: 40px;
    border-radius: 4px;
    overflow: hidden;
    margin-left: 20px;
  }
  .chart-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .chart-placeholder {
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .chart-icon {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.15);
  }

  /* Card body */
  .card-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .sym-link {
    font-family: var(--sc-font-mono, monospace);
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    text-decoration: none;
  }
  .sym-link:hover {
    color: #63b3ed;
  }

  .tf-chip {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    background: rgba(255, 255, 255, 0.06);
    border-radius: 3px;
    padding: 1px 5px;
  }

  .pattern-name {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: rgba(255, 255, 255, 0.45);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
  }

  /* Similarity badge */
  .similarity-badge {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }
  .sim-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.25);
  }
  .sim-value {
    font-family: var(--sc-font-mono, monospace);
    font-size: 15px;
    font-weight: 700;
  }
  .similarity-badge.score-high .sim-value {
    color: #26a69a;
  }
  .similarity-badge.score-mid .sim-value {
    color: #fbbf24;
  }
  .similarity-badge.score-low .sim-value {
    color: rgba(255, 255, 255, 0.35);
  }

  /* Mid row */
  .card-mid {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .phase-chip {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    background: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
    padding: 1px 6px;
  }

  .outcome-chip {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 600;
    border-radius: 3px;
    padding: 1px 6px;
  }
  .outcome-hit {
    background: rgba(38, 166, 154, 0.15);
    color: #26a69a;
  }
  .outcome-miss {
    background: rgba(239, 83, 80, 0.15);
    color: #ef5350;
  }

  .ts-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.25);
    margin-left: auto;
  }

  /* Actions */
  .card-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .watch-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  .watch-btn:hover:not(:disabled) {
    background: rgba(99, 179, 237, 0.1);
    border-color: rgba(99, 179, 237, 0.3);
    color: #63b3ed;
  }
  .watch-btn.watching {
    background: rgba(38, 166, 154, 0.1);
    border-color: rgba(38, 166, 154, 0.3);
    color: #26a69a;
    cursor: default;
  }
  .watch-btn:disabled:not(.watching) {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .watch-icon {
    font-size: 12px;
  }

  .no-watch-hint {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.15);
  }

  .watch-error {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: #f87171;
  }
</style>
