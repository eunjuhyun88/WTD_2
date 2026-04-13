<script lang="ts">
  import type { TerminalAsset, TerminalVerdict, TerminalEvidence } from '$lib/types/terminal';
  import FreshnessBadge from '../workspace/FreshnessBadge.svelte';
  import ActionStrip from '../workspace/ActionStrip.svelte';
  import EvidenceGrid from '../workspace/EvidenceGrid.svelte';
  import SourceRow from '../workspace/SourceRow.svelte';

  interface Props {
    asset?: TerminalAsset | null;
    verdict?: TerminalVerdict | null;
    evidence?: TerminalEvidence[];
    loading?: boolean;
    onViewDetail?: () => void;
  }

  let {
    asset = null,
    verdict = null,
    evidence = [],
    loading = false,
    onViewDetail,
  }: Props = $props();

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

  function fmtPct(v: number) {
    const s = v >= 0 ? '+' : '';
    return `${s}${v.toFixed(2)}%`;
  }

  function fmtPrice(v: number) {
    if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (v >= 100) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return v.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }
</script>

<div class="mobile-board">
  {#if loading && !asset}
    <div class="board-loading">
      <span class="loading-ring"></span>
      <span class="loading-label">Analyzing…</span>
    </div>

  {:else if !asset}
    <div class="board-empty">
      <p class="empty-icon">◈</p>
      <p class="empty-text">No active asset</p>
      <p class="empty-hint">Type a query below to get started</p>
    </div>

  {:else}
    <!-- ── Asset Header ── -->
    <div class="asset-header">
      <div class="asset-main">
        <div class="asset-left">
          <span class="asset-symbol">{asset.symbol.replace('USDT', '')}</span>
          <span class="asset-venue">{asset.venue}</span>
        </div>
        <div class="asset-right">
          <span class="asset-price">{fmtPrice(asset.lastPrice)}</span>
          <span
            class="asset-change"
            class:positive={asset.changePct1h >= 0}
            class:negative={asset.changePct1h < 0}
          >
            {fmtPct(asset.changePct1h)}
          </span>
        </div>
      </div>

      <!-- TF alignment strip -->
      <div class="tf-strip">
        <span class="tf-item">
          <span class="tf-label">15m</span>
          <span class="tf-arrow">{asset.tf15m}</span>
        </span>
        <span class="tf-sep">·</span>
        <span class="tf-item">
          <span class="tf-label">1H</span>
          <span class="tf-arrow">{asset.tf1h}</span>
        </span>
        <span class="tf-sep">·</span>
        <span class="tf-item">
          <span class="tf-label">4H</span>
          <span class="tf-arrow">{asset.tf4h}</span>
        </span>
        <span class="tf-sep">·</span>
        <span class="vol-ratio">{asset.volumeRatio1h.toFixed(1)}x vol</span>
        <span class="tf-sep">·</span>
        <span
          class="oi-change"
          class:positive={asset.oiChangePct1h >= 0}
          class:negative={asset.oiChangePct1h < 0}
        >
          OI {fmtPct(asset.oiChangePct1h)}
        </span>
      </div>
    </div>

    <!-- ── Verdict Block ── -->
    {#if verdict}
      <div class="verdict-block">
        <div class="verdict-top">
          <span class="bias-label" style="color: {biasColor[verdict.direction]}">
            {biasLabel[verdict.direction]}
          </span>
          <span class="confidence-badge confidence-{verdict.confidence}">
            {verdict.confidence.toUpperCase()}
          </span>
          <FreshnessBadge status={asset.freshnessStatus} />
        </div>

        <p class="verdict-reason">{verdict.reason}</p>

        <ActionStrip
          action={verdict.action}
          avoid=""
          invalidation={verdict.invalidation}
        />
      </div>

      <!-- ── Evidence ── -->
      {#if evidence.length > 0}
        <div class="evidence-section">
          <p class="section-label">EVIDENCE</p>
          <EvidenceGrid {evidence} columns={2} />
        </div>
      {/if}

      <!-- ── Sources ── -->
      {#if asset.sources?.length > 0}
        <div class="sources-section">
          <SourceRow sources={asset.sources} />
        </div>
      {/if}

      <!-- ── Detail CTA ── -->
      <button class="detail-cta" onclick={onViewDetail}>
        View Full Analysis →
      </button>

    {:else if loading}
      <div class="verdict-loading">
        <span class="loading-label">Fetching verdict…</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .mobile-board {
    flex: 1;
    overflow-y: auto;
    background: var(--sc-terminal-bg);
    -webkit-overflow-scrolling: touch;
  }

  /* ── Loading / Empty ── */
  .board-loading,
  .board-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 60vh;
    gap: 12px;
  }

  .loading-ring {
    display: block;
    width: 32px;
    height: 32px;
    border: 2px solid rgba(255, 255, 255, 0.08);
    border-top-color: rgba(255, 255, 255, 0.4);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .loading-label {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    color: var(--sc-text-2);
  }

  .empty-icon {
    font-size: 28px;
    color: var(--sc-text-3);
    margin: 0;
  }

  .empty-text {
    font-family: var(--sc-font-mono);
    font-size: 13px;
    color: var(--sc-text-2);
    margin: 0;
  }

  .empty-hint {
    font-size: 12px;
    color: var(--sc-text-3);
    margin: 0;
    text-align: center;
  }

  /* ── Asset Header ── */
  .asset-header {
    padding: 16px 16px 12px;
    border-bottom: 1px solid var(--sc-terminal-border);
  }

  .asset-main {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .asset-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .asset-symbol {
    font-family: var(--sc-font-mono);
    font-size: 22px;
    font-weight: 800;
    color: var(--sc-text-0);
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .asset-venue {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    color: var(--sc-text-3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .asset-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .asset-price {
    font-family: var(--sc-font-mono);
    font-size: 20px;
    font-weight: 700;
    color: var(--sc-text-0);
    line-height: 1;
  }

  .asset-change {
    font-family: var(--sc-font-mono);
    font-size: 12px;
    font-weight: 600;
  }

  .asset-change.positive { color: var(--sc-bias-bull); }
  .asset-change.negative { color: var(--sc-bias-bear); }

  .tf-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .tf-item {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .tf-label {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    color: var(--sc-text-3);
    text-transform: uppercase;
  }

  .tf-arrow {
    font-size: 11px;
    color: var(--sc-text-1);
  }

  .tf-sep {
    color: var(--sc-text-3);
    font-size: 9px;
  }

  .vol-ratio {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    color: var(--sc-text-2);
  }

  .oi-change {
    font-family: var(--sc-font-mono);
    font-size: 10px;
  }

  .oi-change.positive { color: var(--sc-bias-bull); }
  .oi-change.negative { color: var(--sc-bias-bear); }

  /* ── Verdict ── */
  .verdict-block {
    padding: 14px 16px;
    border-bottom: 1px solid var(--sc-terminal-border);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .verdict-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bias-label {
    font-family: var(--sc-font-mono);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .confidence-badge {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .confidence-high   { background: rgba(74,222,128,0.12); color: var(--sc-bias-bull); }
  .confidence-medium { background: rgba(251,191,36,0.12);  color: #fbbf24; }
  .confidence-low    { background: rgba(255,255,255,0.06); color: var(--sc-text-2); }

  .verdict-reason {
    font-size: 13px;
    line-height: 1.5;
    color: var(--sc-text-1);
    margin: 0;
  }

  .verdict-loading {
    padding: 16px;
    text-align: center;
  }

  /* ── Evidence ── */
  .evidence-section {
    padding: 14px 16px;
    border-bottom: 1px solid var(--sc-terminal-border);
  }

  .section-label {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--sc-text-3);
    margin: 0 0 10px;
  }

  /* ── Sources ── */
  .sources-section {
    padding: 10px 16px;
    border-bottom: 1px solid var(--sc-terminal-border);
  }

  /* ── CTA ── */
  .detail-cta {
    display: block;
    width: calc(100% - 32px);
    margin: 14px 16px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    font-family: var(--sc-font-mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--sc-text-1);
    cursor: pointer;
    text-align: center;
    transition: all 0.15s;
  }

  .detail-cta:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--sc-text-0);
  }
</style>
