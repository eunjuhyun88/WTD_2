<script lang="ts">
  import {
    ADAPTER_MODE,
    PLACEHOLDER_ADAPTER_VERSIONS,
    PLACEHOLDER_CASE_DIFFS,
    type AdapterVersion,
    type AdapterCaseDiff,
  } from '$lib/config/personalization';

  interface Props {
    versions?: AdapterVersion[];
    caseDiffs?: AdapterCaseDiff[];
  }

  const {
    versions = ADAPTER_MODE === 'placeholder' ? PLACEHOLDER_ADAPTER_VERSIONS : [],
    caseDiffs = ADAPTER_MODE === 'placeholder' ? PLACEHOLDER_CASE_DIFFS : [],
  }: Props = $props();

  let showCaseDiffs = $state(false);

  function fmtHitRate(v: number): string {
    return `${v}%`;
  }

  function fmtDelta(v: number): string {
    if (v === 0) return 'baseline';
    return `Δ +${v}%p ✓`;
  }

  function fmtCost(v: number): string {
    if (v === 0) return '—';
    return `$${v.toFixed(3)}`;
  }

  function fmtTrainedAt(iso: string): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    } catch {
      return iso;
    }
  }

  const baseline = $derived(versions.find((v) => v.deltaPct === 0));
  const evolved = $derived(versions.filter((v) => v.deltaPct > 0));
</script>

<div class="adp-panel">
  <div class="adp-header">
    <span class="adp-kicker">My Adapters</span>
    <h2 class="adp-title">My Model Evolution</h2>
  </div>

  <!-- Version table -->
  <div class="adp-version-grid" style="--col-count: {versions.length}">
    {#each versions as ver}
      <div class="adp-version-col" class:adp-version-baseline={ver.deltaPct === 0}>
        <div class="adp-version-label">{ver.version}</div>
        {#if ver.deltaPct === 0}
          <div class="adp-version-sublabel">(baseline)</div>
        {:else}
          <div class="adp-version-sublabel">Feedback {ver.feedbackCount}</div>
        {/if}
        <div class="adp-divider"></div>
        <div class="adp-stat-label">Hit Rate</div>
        <div class="adp-stat-value">{fmtHitRate(ver.hitRate)}</div>
        {#if ver.deltaPct > 0}
          <div class="adp-delta adp-delta-pos">{fmtDelta(ver.deltaPct)}</div>
        {:else}
          <div class="adp-delta adp-delta-neutral">{fmtDelta(ver.deltaPct)}</div>
        {/if}
        <div class="adp-stat-cost">{fmtCost(ver.cost)}</div>
      </div>
    {/each}
  </div>

  <!-- Compare button -->
  {#if baseline && evolved.length > 0}
    <button
      class="adp-compare-btn"
      onclick={() => (showCaseDiffs = !showCaseDiffs)}
    >
      {showCaseDiffs ? '▲ Close comparison' : `[${baseline.version} vs ${evolved[0].version} Compare]`}
    </button>
  {/if}

  <!-- Case diffs -->
  {#if showCaseDiffs && caseDiffs.length > 0}
    <div class="adp-cases">
      <p class="adp-cases-summary">
        Found {caseDiffs.length} cases where {baseline?.version} and {evolved[0]?.version} responded differently to the same pattern
      </p>
      {#each caseDiffs as c, i}
        <div class="adp-case-card">
          <div class="adp-case-head">
            <span class="adp-case-num">[Example {i + 1}]</span>
            <span class="adp-case-scenario">{c.scenario}</span>
          </div>
          <div class="adp-case-rows">
            <div class="adp-case-row">
              <span class="adp-case-label">before</span>
              <span class="adp-case-pred adp-neg">{c.beforePrediction}</span>
              <span class="adp-case-outcome adp-neg">{c.beforeOutcome}</span>
            </div>
            <div class="adp-case-row">
              <span class="adp-case-label">after</span>
              <span class="adp-case-pred adp-pos">{c.afterPrediction}</span>
              <span class="adp-case-outcome adp-pos">{c.afterOutcome}</span>
            </div>
          </div>
          {#if c.note}
            <p class="adp-case-note">→ {c.note}</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Preview strip -->
  <div class="adp-preview-strip">
    Preview (mock data) · requires H1 verification
  </div>
</div>

<style>
  .adp-panel {
    display: grid;
    gap: 16px;
    background: var(--sc-terminal-bg, #0d0d0f);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 20px;
    font-family: var(--sc-font-mono, 'JetBrains Mono', monospace);
  }

  .adp-header {
    display: grid;
    gap: 4px;
  }

  .adp-kicker {
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(250, 247, 235, 0.36);
  }

  .adp-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: rgba(250, 247, 235, 0.92);
  }

  .adp-version-grid {
    display: grid;
    grid-template-columns: repeat(var(--col-count, 3), minmax(0, 1fr));
    gap: 12px;
  }

  .adp-version-col {
    display: grid;
    gap: 4px;
    padding: 12px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .adp-version-baseline {
    border-color: rgba(255, 255, 255, 0.04);
    opacity: 0.7;
  }

  .adp-version-label {
    font-size: 0.82rem;
    font-weight: 700;
    color: rgba(250, 247, 235, 0.92);
    letter-spacing: 0.04em;
  }

  .adp-version-sublabel {
    font-size: 0.72rem;
    color: rgba(250, 247, 235, 0.36);
    margin-bottom: 4px;
  }

  .adp-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 4px 0;
  }

  .adp-stat-label {
    font-size: 0.68rem;
    color: rgba(250, 247, 235, 0.36);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .adp-stat-value {
    font-size: 1.1rem;
    font-weight: 700;
    color: rgba(250, 247, 235, 0.92);
    line-height: 1.1;
  }

  .adp-delta {
    font-size: 0.78rem;
    font-weight: 600;
    margin-top: 2px;
  }

  .adp-delta-pos {
    color: #4ade80;
  }

  .adp-delta-neutral {
    color: rgba(250, 247, 235, 0.36);
  }

  .adp-stat-cost {
    font-size: 0.7rem;
    color: rgba(250, 247, 235, 0.28);
    margin-top: 2px;
  }

  .adp-compare-btn {
    align-self: start;
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    color: rgba(250, 247, 235, 0.7);
    font-family: var(--sc-font-mono, monospace);
    font-size: 0.78rem;
    padding: 6px 12px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }

  .adp-compare-btn:hover {
    border-color: rgba(255, 255, 255, 0.3);
    color: rgba(250, 247, 235, 0.92);
  }

  .adp-cases {
    display: grid;
    gap: 10px;
  }

  .adp-cases-summary {
    margin: 0;
    font-size: 0.78rem;
    color: rgba(250, 247, 235, 0.5);
  }

  .adp-case-card {
    display: grid;
    gap: 8px;
    padding: 12px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .adp-case-head {
    display: flex;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
  }

  .adp-case-num {
    font-size: 0.7rem;
    color: rgba(250, 247, 235, 0.36);
    flex-shrink: 0;
  }

  .adp-case-scenario {
    font-size: 0.82rem;
    font-weight: 600;
    color: rgba(250, 247, 235, 0.82);
  }

  .adp-case-rows {
    display: grid;
    gap: 4px;
  }

  .adp-case-row {
    display: grid;
    grid-template-columns: 52px 1fr 1fr;
    gap: 8px;
    align-items: center;
    font-size: 0.76rem;
  }

  .adp-case-label {
    color: rgba(250, 247, 235, 0.36);
    text-transform: uppercase;
    font-size: 0.66rem;
    letter-spacing: 0.06em;
  }

  .adp-case-pred {
    font-weight: 600;
  }

  .adp-case-outcome {
    font-size: 0.72rem;
  }

  .adp-pos {
    color: #4ade80;
  }

  .adp-neg {
    color: #f87171;
  }

  .adp-case-note {
    margin: 0;
    font-size: 0.74rem;
    color: rgba(250, 247, 235, 0.5);
    border-left: 2px solid rgba(255, 255, 255, 0.1);
    padding-left: 8px;
  }

  .adp-preview-strip {
    font-size: 0.68rem;
    color: rgba(250, 247, 235, 0.28);
    letter-spacing: 0.04em;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    text-align: center;
  }

  @media (max-width: 640px) {
    .adp-version-grid {
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    }

    .adp-case-row {
      grid-template-columns: 44px 1fr;
    }

    .adp-case-outcome {
      grid-column: 2;
    }
  }
</style>
