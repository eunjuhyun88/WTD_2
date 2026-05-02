<script lang="ts">
  import { onMount } from 'svelte';

  type LeaderboardRow = {
    slug: string;
    total: number;
    win_rate: number;
    ev: number | null;
    avg_gain: number | null;
    avg_loss: number | null;
    decay: string | null;
    recent_30d_rate: number | null;
  };

  type Suggestion = {
    pattern_slug: string;
    suggestion: string;
    success_rate: number;
    expected_value: number | null;
    total_instances: number;
    decay_direction: string | null;
  };

  type PanelState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

  let lbState = $state<PanelState>('idle');
  let sgState = $state<PanelState>('idle');
  let leaderboard = $state<LeaderboardRow[]>([]);
  let suggestions = $state<Suggestion[]>([]);
  let lbError = $state<string | null>(null);
  let sgError = $state<string | null>(null);
  let activeTab = $state<'leaderboard' | 'suggestions'>('leaderboard');

  async function loadLeaderboard() {
    lbState = 'loading';
    lbError = null;
    try {
      const res = await fetch('/api/refinement/leaderboard');
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      leaderboard = data.leaderboard ?? [];
      lbState = leaderboard.length === 0 ? 'empty' : 'ready';
    } catch (e) {
      lbError = e instanceof Error ? e.message : 'fetch failed';
      lbState = 'error';
    }
  }

  async function loadSuggestions() {
    sgState = 'loading';
    sgError = null;
    try {
      const res = await fetch('/api/refinement/suggestions');
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      suggestions = data.suggestions ?? [];
      sgState = suggestions.length === 0 ? 'empty' : 'ready';
    } catch (e) {
      sgError = e instanceof Error ? e.message : 'fetch failed';
      sgState = 'error';
    }
  }

  onMount(() => {
    void loadLeaderboard();
    void loadSuggestions();
  });

  function fmtPct(v: number | null): string {
    if (v == null) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${(v * 100).toFixed(1)}%`;
  }

  function fmtRate(v: number | null): string {
    if (v == null) return '—';
    return `${(v * 100).toFixed(0)}%`;
  }

  function evClass(ev: number | null): string {
    if (ev == null) return '';
    return ev >= 0 ? 'positive' : 'negative';
  }

  function decayBadge(decay: string | null): string {
    if (!decay || decay === 'stable') return 'stable';
    if (decay === 'improving') return 'improving';
    return 'decaying';
  }

  function decayLabel(decay: string | null): string {
    if (!decay || decay === 'stable') return 'Stable';
    if (decay === 'improving') return 'Improving';
    return 'Decaying';
  }

  function isLoading(tab: 'leaderboard' | 'suggestions'): boolean {
    return tab === 'leaderboard' ? lbState === 'loading' : sgState === 'loading';
  }
</script>

<div class="refinement-panel">
  <div class="panel-tabs">
    <button
      class="panel-tab"
      class:active={activeTab === 'leaderboard'}
      onclick={() => { activeTab = 'leaderboard'; }}
    >
      Leaderboard
      {#if lbState === 'ready'}
        <span class="tab-badge">{leaderboard.filter(r => r.total > 0).length}</span>
      {/if}
    </button>
    <button
      class="panel-tab"
      class:active={activeTab === 'suggestions'}
      onclick={() => { activeTab = 'suggestions'; }}
    >
      Improvement Suggestions
      {#if sgState === 'ready' && suggestions.length > 0}
        <span class="tab-badge warn">{suggestions.length}</span>
      {/if}
    </button>
  </div>

  <div class="panel-body">
    {#if activeTab === 'leaderboard'}
      {#if lbState === 'loading'}
        <div class="state-empty">
          <div class="spinner"></div>
          <p class="state-text">Loading leaderboard…</p>
        </div>
      {:else if lbState === 'error'}
        <div class="state-empty">
          <p class="state-error">Engine connection failed: {lbError}</p>
          <button class="retry-btn" onclick={loadLeaderboard}>Retry</button>
        </div>
      {:else if lbState === 'empty'}
        <div class="state-empty">
          <div class="empty-icon">📊</div>
          <p class="state-text">No pattern data available.<br/>Accumulate data via JUDGE in the terminal.</p>
        </div>
      {:else if lbState === 'ready'}
        <div class="lb-table">
          <div class="lb-header">
            <span>Pattern</span>
            <span class="right">Count</span>
            <span class="right">Win%</span>
            <span class="right">EV</span>
            <span class="right">Last 30d</span>
            <span class="center">Trend</span>
          </div>
          {#each leaderboard as row (row.slug)}
            <div class="lb-row" class:no-data={row.total === 0}>
              <span class="slug" title={row.slug}>{row.slug.replace(/_/g, ' ')}</span>
              <span class="right dim">{row.total}</span>
              <span class="right">{row.total > 0 ? fmtRate(row.win_rate) : '—'}</span>
              <span class="right {evClass(row.ev)}">{row.total > 0 ? fmtPct(row.ev) : '—'}</span>
              <span class="right dim">{row.total > 0 ? fmtRate(row.recent_30d_rate) : '—'}</span>
              <span class="center">
                {#if row.total > 0}
                  <span class="decay-badge {decayBadge(row.decay)}">{decayLabel(row.decay)}</span>
                {:else}
                  <span class="dim">—</span>
                {/if}
              </span>
            </div>
          {/each}
        </div>
      {/if}

    {:else}
      {#if sgState === 'loading'}
        <div class="state-empty">
          <div class="spinner"></div>
          <p class="state-text">Generating improvement suggestions…</p>
        </div>
      {:else if sgState === 'error'}
        <div class="state-empty">
          <p class="state-error">Engine connection failed: {sgError}</p>
          <button class="retry-btn" onclick={loadSuggestions}>Retry</button>
        </div>
      {:else if sgState === 'empty'}
        <div class="state-empty">
          <div class="empty-icon">✅</div>
          <p class="state-text">No patterns need improvement.<br/>All patterns are performing above threshold.</p>
        </div>
      {:else if sgState === 'ready'}
        <div class="suggestion-list">
          {#each suggestions as sg (sg.pattern_slug)}
            <div class="suggestion-card">
              <div class="sg-head">
                <span class="sg-slug">{sg.pattern_slug.replace(/_/g, ' ')}</span>
                <div class="sg-meta">
                  <span class="sg-rate">{fmtRate(sg.success_rate)} Win Rate</span>
                  {#if sg.expected_value != null}
                    <span class="sg-ev {evClass(sg.expected_value)}">EV {fmtPct(sg.expected_value)}</span>
                  {/if}
                  {#if sg.decay_direction && sg.decay_direction !== 'stable'}
                    <span class="decay-badge {decayBadge(sg.decay_direction)}">{decayLabel(sg.decay_direction)}</span>
                  {/if}
                </div>
              </div>
              <p class="sg-text">{sg.suggestion}</p>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .refinement-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .panel-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-bottom: 12px;
    flex-shrink: 0;
  }

  .panel-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 34px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(250, 247, 235, 0.62);
    font-family: var(--sc-font-body);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--sc-duration-fast), border-color var(--sc-duration-fast), color var(--sc-duration-fast);
  }

  .panel-tab.active {
    background: linear-gradient(180deg, rgba(250, 247, 235, 0.98), rgba(249, 246, 241, 0.96));
    border-color: rgba(219, 154, 159, 0.28);
    color: #0f0f12;
  }

  .tab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.15);
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1;
  }

  .panel-tab.active .tab-badge {
    background: rgba(15, 15, 18, 0.15);
  }

  .tab-badge.warn {
    background: rgba(251, 191, 36, 0.25);
    color: #fbbf24;
  }

  .panel-tab.active .tab-badge.warn {
    background: rgba(217, 119, 6, 0.18);
    color: #b45309;
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  /* States */
  .state-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 32px 16px;
    text-align: center;
  }

  .empty-icon {
    font-size: 1.8rem;
    opacity: 0.5;
  }

  .state-text {
    color: rgba(250, 247, 235, 0.55);
    font-size: 0.84rem;
    line-height: 1.55;
    margin: 0;
  }

  .state-error {
    color: #fca5a5;
    font-size: 0.84rem;
    margin: 0;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.12);
    border-top-color: rgba(250, 247, 235, 0.7);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .retry-btn {
    padding: 6px 14px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(250, 247, 235, 0.78);
    font-size: 0.82rem;
    cursor: pointer;
    font-family: var(--sc-font-body);
  }

  /* Leaderboard */
  .lb-table {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .lb-header,
  .lb-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px 52px 60px 64px 52px;
    gap: 8px;
    align-items: center;
    padding: 6px 8px;
    border-radius: 5px;
    font-size: 0.78rem;
  }

  .lb-header {
    color: rgba(250, 247, 235, 0.4);
    font-weight: 600;
    font-size: 0.72rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding-bottom: 8px;
    margin-bottom: 2px;
  }

  .lb-row {
    border: 1px solid transparent;
    transition: border-color var(--sc-duration-fast), background var(--sc-duration-fast);
  }

  .lb-row:hover {
    background: rgba(255, 255, 255, 0.03);
    border-color: rgba(255, 255, 255, 0.06);
  }

  .lb-row.no-data {
    opacity: 0.4;
  }

  .slug {
    color: rgba(250, 247, 235, 0.88);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-transform: capitalize;
  }

  .right { text-align: right; }
  .center { text-align: center; }

  .dim {
    color: rgba(250, 247, 235, 0.38);
  }

  .positive { color: var(--sc-good, #4ade80); }
  .negative { color: #ff9ca0; }

  /* Decay badges */
  .decay-badge {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 4px;
    font-size: 0.70rem;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  .decay-badge.stable {
    background: rgba(148, 163, 184, 0.1);
    color: rgba(250, 247, 235, 0.55);
  }

  .decay-badge.improving {
    background: rgba(74, 222, 128, 0.1);
    color: #4ade80;
  }

  .decay-badge.decaying {
    background: rgba(248, 113, 113, 0.1);
    color: #ff9ca0;
  }

  /* Suggestions */
  .suggestion-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .suggestion-card {
    padding: 12px 14px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(255, 255, 255, 0.025);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sg-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .sg-slug {
    color: rgba(250, 247, 235, 0.92);
    font-weight: 700;
    font-size: 0.82rem;
    text-transform: capitalize;
  }

  .sg-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .sg-rate,
  .sg-ev {
    font-size: 0.74rem;
    color: rgba(250, 247, 235, 0.5);
  }

  .sg-ev.positive { color: var(--sc-good, #4ade80); }
  .sg-ev.negative { color: #ff9ca0; }

  .sg-text {
    margin: 0;
    color: rgba(250, 247, 235, 0.72);
    font-size: 0.82rem;
    line-height: 1.55;
  }
</style>
