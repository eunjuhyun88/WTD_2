<script lang="ts">
  import type { TerminalAsset, TerminalVerdict, TerminalEvidence, TerminalSource } from '$lib/types/terminal';
  import FreshnessBadge from '../workspace/FreshnessBadge.svelte';
  import VerdictHeader from '../workspace/VerdictHeader.svelte';
  import ActionStrip from '../workspace/ActionStrip.svelte';
  import EvidenceGrid from '../workspace/EvidenceGrid.svelte';
  import WhyPanel from '../workspace/WhyPanel.svelte';
  import SourceRow from '../workspace/SourceRow.svelte';

  interface Props {
    open?: boolean;
    asset?: TerminalAsset | null;
    verdict?: TerminalVerdict | null;
    evidence?: TerminalEvidence[];
    newsItems?: Array<{ title: string; source: string; time: string; url?: string }>;
    onClose?: () => void;
  }

  let {
    open = false,
    asset = null,
    verdict = null,
    evidence = [],
    newsItems = [],
    onClose,
  }: Props = $props();

  type TabId = 'summary' | 'entry' | 'risk' | 'catalysts' | 'metrics';
  let activeTab = $state<TabId>('summary');

  const TABS: { id: TabId; label: string }[] = [
    { id: 'summary',   label: 'Summary' },
    { id: 'entry',     label: 'Entry' },
    { id: 'risk',      label: 'Risk' },
    { id: 'catalysts', label: 'News' },
    { id: 'metrics',   label: 'Metrics' },
  ];

  function fmtTime(ts: number) {
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as Element).classList.contains('sheet-backdrop')) {
      onClose?.();
    }
  }

  // Metric groups for metrics tab
  let fundingMetrics = $derived(
    evidence.filter(e => ['Funding Rate', 'Funding Pct'].includes(e.metric))
  );
  let oiMetrics = $derived(
    evidence.filter(e => ['OI Change', 'OI Momentum'].includes(e.metric))
  );
  let structureMetrics = $derived(
    evidence.filter(e => !['Funding Rate', 'Funding Pct', 'OI Change', 'OI Momentum'].includes(e.metric))
  );
</script>

<!-- Backdrop + Sheet -->
<div
  class="sheet-backdrop"
  class:open
  role="dialog"
  aria-modal="true"
  aria-label="Asset detail"
  onclick={handleBackdropClick}
>
  <div class="detail-sheet" class:open>
    <!-- Handle bar -->
    <div class="sheet-handle" role="button" tabindex="0" onclick={onClose} onkeydown={(e) => e.key === 'Enter' && onClose?.()}>
      <span class="handle-bar"></span>
    </div>

    {#if asset}
      <!-- Header -->
      <div class="sheet-header">
        <div class="header-left">
          <span class="sym">{asset.symbol.replace('USDT', '')}</span>
          <span class="venue">{asset.venue}</span>
        </div>
        <div class="header-right">
          <FreshnessBadge status={asset.freshnessStatus} />
          <button class="close-btn" onclick={onClose} aria-label="Close">✕</button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tab-bar" role="tablist">
        {#each TABS as tab}
          <button
            class="tab-btn"
            class:active={activeTab === tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onclick={() => activeTab = tab.id}
          >
            {tab.label}
          </button>
        {/each}
      </div>

      <!-- Tab Content -->
      <div class="tab-content">

        {#if activeTab === 'summary'}
          {#if verdict}
            <VerdictHeader
              symbol={asset.symbol}
              direction={verdict.direction}
              timeframe="4H"
              updatedAt={verdict.updatedAt}
            />
            <ActionStrip
              action={verdict.action}
              avoid=""
              invalidation={verdict.invalidation}
            />
            <div class="section-gap">
              <WhyPanel reason={verdict.reason} against={verdict.against} />
            </div>
            {#if evidence.length > 0}
              <div class="section-gap">
                <p class="section-label">EVIDENCE</p>
                <EvidenceGrid {evidence} columns={2} />
              </div>
            {/if}
            <div class="section-gap">
              <SourceRow sources={asset.sources} />
            </div>
          {:else}
            <div class="tab-empty">No verdict available</div>
          {/if}

        {:else if activeTab === 'entry'}
          {#if verdict}
            <div class="entry-panel">
              <div class="entry-row">
                <span class="entry-label">ACTION</span>
                <span class="entry-value accent">{verdict.action}</span>
              </div>
              <div class="entry-row">
                <span class="entry-label">INVALIDATION</span>
                <span class="entry-value danger">{verdict.invalidation}</span>
              </div>
              <div class="entry-row">
                <span class="entry-label">DIRECTION</span>
                <span class="entry-value" class:bull={verdict.direction === 'bullish'} class:bear={verdict.direction === 'bearish'}>
                  {verdict.direction.toUpperCase()}
                </span>
              </div>
              <div class="entry-row">
                <span class="entry-label">CONFIDENCE</span>
                <span class="entry-value">{verdict.confidence.toUpperCase()}</span>
              </div>
            </div>
          {:else}
            <div class="tab-empty">No entry data available</div>
          {/if}

        {:else if activeTab === 'risk'}
          {#if verdict}
            <div class="risk-panel">
              <div class="risk-item danger-bg">
                <p class="risk-label">INVALIDATION</p>
                <p class="risk-value">{verdict.invalidation}</p>
              </div>
              {#if verdict.against.length > 0}
                <div class="risk-bearish">
                  <p class="risk-label">BEARISH FACTORS</p>
                  <ul class="against-list">
                    {#each verdict.against as factor}
                      <li>{factor}</li>
                    {/each}
                  </ul>
                </div>
              {/if}
              <div class="risk-stats">
                <div class="risk-stat">
                  <span class="rs-label">SPREAD</span>
                  <span class="rs-value">{asset.spreadBps.toFixed(1)} bps</span>
                </div>
                <div class="risk-stat">
                  <span class="rs-label">FUNDING</span>
                  <span class="rs-value">{(asset.fundingRate * 100).toFixed(4)}%</span>
                </div>
                <div class="risk-stat">
                  <span class="rs-label">FUNDING PCT</span>
                  <span class="rs-value">{asset.fundingPercentile7d.toFixed(0)}th pct</span>
                </div>
              </div>
            </div>
          {:else}
            <div class="tab-empty">No risk data available</div>
          {/if}

        {:else if activeTab === 'catalysts'}
          {#if newsItems.length > 0}
            <div class="news-list">
              {#each newsItems as item}
                <a class="news-item" href={item.url ?? '#'} target="_blank" rel="noopener">
                  <span class="news-title">{item.title}</span>
                  <span class="news-meta">{item.source} · {item.time}</span>
                </a>
              {/each}
            </div>
          {:else}
            <div class="tab-empty">No recent news</div>
          {/if}

        {:else if activeTab === 'metrics'}
          <div class="metrics-content">
            {#if structureMetrics.length > 0}
              <p class="section-label">STRUCTURE</p>
              <EvidenceGrid evidence={structureMetrics} columns={2} />
            {/if}
            {#if oiMetrics.length > 0}
              <div class="metrics-group">
                <p class="section-label">OPEN INTEREST</p>
                <EvidenceGrid evidence={oiMetrics} columns={2} />
              </div>
            {/if}
            {#if fundingMetrics.length > 0}
              <div class="metrics-group">
                <p class="section-label">FUNDING</p>
                <EvidenceGrid evidence={fundingMetrics} columns={2} />
              </div>
            {/if}
            {#if evidence.length === 0}
              <div class="tab-empty">No metrics available</div>
            {/if}
          </div>
        {/if}

      </div>
    {:else}
      <div class="sheet-empty">No asset selected</div>
    {/if}
  </div>
</div>

<style>
  /* ── Backdrop ── */
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0);
    pointer-events: none;
    transition: background 0.25s ease;
  }

  .sheet-backdrop.open {
    background: rgba(0, 0, 0, 0.6);
    pointer-events: all;
  }

  /* ── Sheet ── */
  .detail-sheet {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 90vh;
    background: var(--sc-bg-1);
    border-top: 1px solid var(--sc-terminal-border);
    border-radius: 12px 12px 0 0;
    display: flex;
    flex-direction: column;
    transform: translateY(100%);
    transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
    overflow: hidden;
  }

  .detail-sheet.open {
    transform: translateY(0);
  }

  /* ── Handle ── */
  .sheet-handle {
    display: flex;
    justify-content: center;
    padding: 10px 0 6px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .handle-bar {
    display: block;
    width: 36px;
    height: 4px;
    background: rgba(255, 255, 255, 0.16);
    border-radius: 2px;
  }

  /* ── Header ── */
  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px 12px;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .sym {
    font-family: var(--sc-font-mono);
    font-size: 18px;
    font-weight: 800;
    color: var(--sc-text-0);
  }

  .venue {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 14px;
    color: var(--sc-text-2);
    cursor: pointer;
    padding: 4px;
    line-height: 1;
  }

  /* ── Tabs ── */
  .tab-bar {
    display: flex;
    border-bottom: 1px solid var(--sc-terminal-border);
    padding: 0 8px;
    flex-shrink: 0;
    overflow-x: auto;
    gap: 0;
  }

  .tab-btn {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 600;
    color: var(--sc-text-2);
    background: none;
    border: none;
    padding: 10px 12px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .tab-btn.active {
    color: var(--sc-text-0);
    border-bottom-color: rgba(247, 242, 234, 0.6);
  }

  /* ── Content ── */
  .tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    -webkit-overflow-scrolling: touch;
  }

  .section-gap {
    margin-top: 14px;
  }

  .section-label {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--sc-text-3);
    margin: 0 0 8px;
  }

  .tab-empty {
    font-size: 13px;
    color: var(--sc-text-3);
    text-align: center;
    padding: 40px 0;
    font-family: var(--sc-font-mono);
  }

  /* Entry Tab */
  .entry-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .entry-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 10px 12px;
    background: rgba(255,255,255,0.03);
    border-radius: 6px;
    gap: 12px;
  }

  .entry-label {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--sc-text-3);
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .entry-value {
    font-family: var(--sc-font-mono);
    font-size: 12px;
    color: var(--sc-text-1);
    text-align: right;
  }

  .entry-value.accent { color: var(--sc-text-0); }
  .entry-value.danger { color: var(--sc-bias-bear); }
  .entry-value.bull   { color: var(--sc-bias-bull); }
  .entry-value.bear   { color: var(--sc-bias-bear); }

  /* Risk Tab */
  .risk-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .risk-item {
    padding: 12px;
    border-radius: 6px;
    background: rgba(248, 113, 113, 0.06);
    border: 1px solid rgba(248, 113, 113, 0.15);
  }

  .risk-label {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--sc-text-3);
    margin: 0 0 4px;
  }

  .risk-value {
    font-family: var(--sc-font-mono);
    font-size: 13px;
    color: var(--sc-bias-bear);
    margin: 0;
  }

  .risk-bearish {
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
  }

  .against-list {
    margin: 0;
    padding: 0 0 0 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .against-list li {
    font-size: 12px;
    color: #fbbf24;
    line-height: 1.4;
  }

  .risk-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .risk-stat {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 8px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 5px;
    text-align: center;
  }

  .rs-label {
    font-family: var(--sc-font-mono);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--sc-text-3);
  }

  .rs-value {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    color: var(--sc-text-1);
  }

  /* News Tab */
  .news-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--sc-terminal-border);
    border-radius: 6px;
    overflow: hidden;
  }

  .news-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    background: var(--sc-terminal-surface);
    text-decoration: none;
    transition: background 0.1s;
  }

  .news-item:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .news-title {
    font-size: 13px;
    color: var(--sc-text-0);
    line-height: 1.4;
  }

  .news-meta {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    color: var(--sc-text-3);
  }

  /* Metrics Tab */
  .metrics-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .metrics-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Empty sheet */
  .sheet-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--sc-font-mono);
    font-size: 12px;
    color: var(--sc-text-3);
  }
</style>
