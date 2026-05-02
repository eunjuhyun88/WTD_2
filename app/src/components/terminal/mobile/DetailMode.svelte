<script lang="ts">
  /**
   * DetailMode — full-screen analysis rail equivalent (mobile).
   * Layout per W-0087:
   *   - breadcrumb row back to Chart mode
   *   - horizontally scrollable pill tabs: Verdict / Why / Risk / Sources
   *     (Metrics folds into Sources on mobile)
   *   - scrollable tab body
   *   - sticky conclusion strip: Bias / Action / Invalidation
   */

  import { mobileMode } from '$lib/stores/mobileMode';
  import { activePair } from '$lib/stores/activePairStore';
  import type { TerminalVerdict, TerminalEvidence } from '$lib/types/terminal';
  import MobileEmptyState from './MobileEmptyState.svelte';

  interface Props {
    verdict?: TerminalVerdict | null;
    evidence?: TerminalEvidence[];
    captureId?: string | null;
  }

  let { verdict = null, evidence = [], captureId = null }: Props = $props();

  type TabId = 'verdict' | 'why' | 'risk' | 'sources';

  const TABS: { id: TabId; label: string }[] = [
    { id: 'verdict',  label: 'Verdict' },
    { id: 'why',      label: 'Why' },
    { id: 'risk',     label: 'Risk' },
    { id: 'sources',  label: 'Sources' },
  ];

  let activeTab = $state<TabId>('verdict');

  const biasColor: Record<string, string> = {
    bullish: 'var(--sc-bias-bull)',
    bearish: 'var(--sc-bias-bear)',
    neutral: 'var(--sc-text-2)',
  };

  const biasLabel: Record<string, string> = {
    bullish: '● LONG',
    bearish: '● SHORT',
    neutral: '◎ NEUTRAL',
  };

  function goBackToChart() {
    mobileMode.setActive('chart');
  }
</script>

<div class="detail-mode">
  <!-- Breadcrumb -->
  <div class="breadcrumb">
    <button class="back-btn" onclick={goBackToChart} aria-label="Back to chart">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <span class="breadcrumb-text">
      {$activePair || '—'}
      {#if $mobileMode.lastSymbolContext?.tf}
        <span class="breadcrumb-tf">{$mobileMode.lastSymbolContext.tf}</span>
      {/if}
    </span>
  </div>

  <!-- Pill tabs (horizontally scrollable) -->
  <div class="tab-bar" role="tablist">
    {#each TABS as tab}
      <button
        class="tab-btn"
        class:active={activeTab === tab.id}
        role="tab"
        aria-selected={activeTab === tab.id}
        onclick={() => (activeTab = tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Scrollable body -->
  <div class="tab-body">
    {#if !verdict && activeTab === 'verdict'}
      <!-- No analysis yet — guide user to the chart -->
      <MobileEmptyState
        icon="chart"
        headline="Start from the chart"
        subline="Select a range to see the analysis here."
        primaryCta={{
          label: 'Go to chart',
          onClick: () => mobileMode.setActive('chart'),
        }}
      />
    {:else if activeTab === 'verdict'}
      {#if verdict}
        <div class="verdict-card">
          <div class="verdict-direction">
            <span class="direction-label" style="color: {biasColor[verdict.direction] ?? 'inherit'}">
              {biasLabel[verdict.direction] ?? verdict.direction.toUpperCase()}
            </span>
            <span class="confidence-chip confidence-{verdict.confidence}">
              {verdict.confidence.toUpperCase()}
            </span>
          </div>
          <p class="verdict-reason">{verdict.reason}</p>
        </div>
      {:else}
        <div class="tab-empty">No verdict data</div>
      {/if}

    {:else if activeTab === 'why'}
      {#if verdict}
        <div class="why-section">
          <p class="section-label">Evidence</p>
          <p class="why-text">{verdict.reason}</p>
          {#if verdict.against?.length > 0}
            <p class="section-label against-label">Counter factors</p>
            <ul class="against-list">
              {#each verdict.against as factor}
                <li>{factor}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {:else}
        <div class="tab-empty">No data</div>
      {/if}

    {:else if activeTab === 'risk'}
      {#if verdict}
        <div class="risk-section">
          <div class="risk-block">
            <p class="section-label">Invalidation condition</p>
            <p class="risk-value danger">{verdict.invalidation}</p>
          </div>
          <div class="risk-block">
            <p class="section-label">Action</p>
            <p class="risk-value">{verdict.action}</p>
          </div>
        </div>
      {:else}
        <div class="tab-empty">No risk data</div>
      {/if}

    {:else if activeTab === 'sources'}
      <div class="sources-section">
        {#if evidence.length > 0}
          <p class="section-label">Evidence Indicators</p>
          <div class="evidence-list">
            {#each evidence as ev}
              <div class="evidence-item">
                <span class="ev-metric">{ev.metric}</span>
                <span class="ev-value" class:bull={ev.state === 'bullish'} class:bear={ev.state === 'bearish'}>
                  {ev.value}
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="tab-empty">No sources</div>
        {/if}

        {#if captureId}
          <div class="lab-link-block">
            <p class="section-label">Lab Handoff</p>
            <a class="lab-link" href="/lab?captureId={encodeURIComponent(captureId)}">
              Open capture in Lab →
            </a>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Sticky conclusion strip -->
  {#if verdict}
    <div class="conclusion-strip">
      <div class="conclusion-item">
        <span class="conc-label">Bias</span>
        <span class="conc-value" style="color: {biasColor[verdict.direction] ?? 'inherit'}">
          {verdict.direction.toUpperCase()}
        </span>
      </div>
      <div class="conc-sep"></div>
      <div class="conclusion-item">
        <span class="conc-label">Action</span>
        <span class="conc-value">{verdict.action}</span>
      </div>
      <div class="conc-sep"></div>
      <div class="conclusion-item">
        <span class="conc-label">Invalidation</span>
        <span class="conc-value danger">{verdict.invalidation}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .detail-mode {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--sc-terminal-bg, #0a0c10);
  }

  /* Breadcrumb */
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: none;
    border: none;
    color: var(--sc-text-2, rgba(255,255,255,0.5));
    cursor: pointer;
    padding: 0;
  }

  .breadcrumb-text {
    font-family: var(--sc-font-mono);
    font-size: 13px;
    font-weight: 700;
    color: var(--sc-text-0, rgba(247,242,234,0.98));
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .breadcrumb-tf {
    font-size: 10px;
    color: var(--sc-text-3, rgba(255,255,255,0.3));
    font-weight: 600;
  }

  /* Pill tabs */
  .tab-bar {
    display: flex;
    gap: 0;
    padding: 0 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    flex-shrink: 0;
  }

  .tab-bar::-webkit-scrollbar { display: none; }

  .tab-btn {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 600;
    color: var(--sc-text-2, rgba(255,255,255,0.5));
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 10px 14px;
    cursor: pointer;
    white-space: nowrap;
    /* 44pt touch target */
    min-height: 44px;
    transition: color 0.15s, border-color 0.15s;
  }

  .tab-btn.active {
    color: var(--sc-text-0, rgba(247,242,234,0.98));
    border-bottom-color: rgba(247, 242, 234, 0.6);
  }

  /* Scrollable body */
  .tab-body {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 16px;
    min-height: 0;
  }

  /* Verdict */
  .verdict-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.02);
  }

  .verdict-direction {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .direction-label {
    font-family: var(--sc-font-mono);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.04em;
  }

  .confidence-chip {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 4px;
  }

  .confidence-high   { background: rgba(74,222,128,0.12); color: var(--sc-bias-bull); }
  .confidence-medium { background: rgba(251,191,36,0.12);  color: #fbbf24; }
  .confidence-low    { background: rgba(255,255,255,0.06); color: var(--sc-text-2); }

  .verdict-reason {
    font-size: 13px;
    line-height: 1.55;
    color: var(--sc-text-1, rgba(247,242,234,0.78));
    margin: 0;
  }

  /* Why */
  .why-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .why-text {
    font-size: 13px;
    line-height: 1.55;
    color: var(--sc-text-1, rgba(247,242,234,0.78));
    margin: 0;
  }

  .against-list {
    margin: 0;
    padding: 0 0 0 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .against-list li {
    font-size: 12px;
    color: #fbbf24;
    line-height: 1.4;
  }

  /* Risk */
  .risk-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .risk-block {
    padding: 12px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .risk-value {
    font-family: var(--sc-font-mono);
    font-size: 13px;
    color: var(--sc-text-0, rgba(247,242,234,0.98));
    margin: 0;
  }

  .risk-value.danger { color: var(--sc-bias-bear); }

  /* Sources */
  .sources-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .evidence-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    border-radius: 6px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.04);
  }

  .evidence-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: var(--sc-terminal-surface, #0d1017);
  }

  .ev-metric {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
    color: var(--sc-text-2, rgba(255,255,255,0.5));
    letter-spacing: 0.05em;
  }

  .ev-value {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    color: var(--sc-text-1, rgba(247,242,234,0.78));
  }

  .ev-value.bull { color: var(--sc-bias-bull); }
  .ev-value.bear { color: var(--sc-bias-bear); }

  .lab-link-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .lab-link {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 8px;
    background: rgba(99, 179, 237, 0.1);
    border: 1px solid rgba(99, 179, 237, 0.2);
    color: #d7e8ff;
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 700;
    text-decoration: none;
  }

  /* Shared labels */
  .section-label {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--sc-text-3, rgba(255,255,255,0.3));
    margin: 0 0 6px;
  }

  .against-label {
    margin-top: 12px;
  }

  .tab-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 120px;
    font-family: var(--sc-font-mono);
    font-size: 12px;
    color: var(--sc-text-3, rgba(255,255,255,0.3));
  }

  /* Conclusion strip (sticky above prompt footer) */
  .conclusion-strip {
    display: flex;
    align-items: center;
    gap: 0;
    height: 52px;
    padding: 0 16px;
    background: rgba(10, 12, 16, 0.96);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
    overflow: hidden;
  }

  .conclusion-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .conc-sep {
    width: 1px;
    height: 28px;
    background: rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
    margin: 0 10px;
  }

  .conc-label {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sc-text-3, rgba(255,255,255,0.3));
  }

  .conc-value {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 700;
    color: var(--sc-text-0, rgba(247,242,234,0.98));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conc-value.danger { color: var(--sc-bias-bear); }
</style>
