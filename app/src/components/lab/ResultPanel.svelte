<script lang="ts">
  import type { BacktestResult, CycleResult } from '$lib/lab/backtest';
  import { getCycle } from '$lib/data/cycles';

  const { result, isRunning, onSave, onViewChart } = $props<{
    result: BacktestResult | null;
    isRunning: boolean;
    onSave: () => void;
    onViewChart: () => void;
  }>();

  function fmtPct(v: number): string {
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}%`;
  }

  function fmtNum(v: number): string {
    return v.toFixed(2);
  }

  function cycleLabel(cycleId: string): string {
    return getCycle(cycleId)?.label ?? cycleId;
  }

  function pnlClass(v: number): string {
    return v >= 0 ? 'positive' : 'negative';
  }
</script>

<div class="result-panel">
  {#if isRunning}
    <!-- Running state -->
    <div class="state-empty">
      <div class="spinner-lg"></div>
      <p class="state-text">Running backtest...</p>
    </div>

  {:else if !result}
    <!-- Empty state -->
    <div class="state-empty">
      <div class="empty-icon">⚗</div>
      <p class="state-text">Set strategy conditions,<br/>select cycles, then press<br/><strong>▶ Run</strong></p>
    </div>

  {:else if result.totalTrades === 0}
    <!-- No trades -->
    <div class="state-empty">
      <div class="empty-icon">📊</div>
      <p class="state-text">No entries matched the conditions.<br/>Try relaxing the conditions or adding more cycles.</p>
      <p class="state-hint">Tip: Raise the RSI threshold or reduce the number of conditions.</p>
    </div>

  {:else}
    <!-- Results -->
    <div class="results">
      <!-- Summary cards -->
      <div class="summary-grid">
        <div class="stat-card">
          <span class="stat-label">Win Rate</span>
          <span class="stat-value" class:positive={result.winRate >= 55} class:negative={result.winRate < 45}>
            {result.winRate.toFixed(1)}%
          </span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Sharpe</span>
          <span class="stat-value" class:positive={result.sharpeRatio >= 1} class:negative={result.sharpeRatio < 0}>
            {fmtNum(result.sharpeRatio)}
          </span>
        </div>
        <div class="stat-card">
          <span class="stat-label">MDD</span>
          <span class="stat-value negative">
            -{result.maxDrawdownPercent.toFixed(1)}%
          </span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Total PnL</span>
          <span class="stat-value {pnlClass(result.totalPnlPercent)}">
            {fmtPct(result.totalPnlPercent)}
          </span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Trades</span>
          <span class="stat-value">{result.totalTrades}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Avg R</span>
          <span class="stat-value {pnlClass(result.avgRMultiple)}">
            {fmtNum(result.avgRMultiple)}R
          </span>
        </div>
        <div class="stat-card">
          <span class="stat-label">PF</span>
          <span class="stat-value" class:positive={result.profitFactor >= 1.5}>
            {fmtNum(result.profitFactor)}
          </span>
        </div>
      </div>

      <!-- Walk-forward -->
      {#if result.inSample && result.outOfSample}
        <div class="wf-section">
          <div class="wf-header">
            <span class="wf-title">Walk-Forward Validation</span>
            <span class="wf-ratio" class:warn={result.overfitRatio > 1.3} class:danger={result.overfitRatio > 1.5}>
              Overfit Ratio: {fmtNum(result.overfitRatio)}
            </span>
          </div>
          <div class="wf-compare">
            <div class="wf-col">
              <span class="wf-col-label">In-Sample (70%)</span>
              <span class="wf-col-val">{result.inSample.winRate.toFixed(1)}% / {fmtNum(result.inSample.sharpeRatio)}</span>
            </div>
            <div class="wf-col">
              <span class="wf-col-label">Out-of-Sample (30%)</span>
              <span class="wf-col-val">{result.outOfSample.winRate.toFixed(1)}% / {fmtNum(result.outOfSample.sharpeRatio)}</span>
            </div>
          </div>
          {#if result.overfitRatio > 1.5}
            <div class="wf-warn">⚠ High overfitting risk. Simplify the conditions.</div>
          {/if}
        </div>
      {/if}

      <!-- Cycle breakdown -->
      {#if result.cycleBreakdown.length > 0}
        <div class="cycle-section">
          <div class="cycle-header">Performance by Cycle</div>
          <div class="cycle-table">
            <div class="ct-head">
              <span class="ct-h-name">Cycle</span>
              <span class="ct-h">Win%</span>
              <span class="ct-h">PnL</span>
              <span class="ct-h">MDD</span>
              <span class="ct-h">#</span>
            </div>
            {#each result.cycleBreakdown as cb}
              <div class="ct-row">
                <span class="ct-name">{cycleLabel(cb.cycleId)}</span>
                <span class="ct-val" class:positive={cb.winRate >= 55} class:negative={cb.winRate < 45}>{cb.winRate.toFixed(0)}%</span>
                <span class="ct-val {pnlClass(cb.totalPnlPercent)}">{fmtPct(cb.totalPnlPercent)}</span>
                <span class="ct-val negative">-{cb.maxDrawdownPercent.toFixed(1)}%</span>
                <span class="ct-val dim">{cb.totalTrades}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Actions -->
      <div class="action-bar">
        <button class="action-btn secondary" onclick={onViewChart}>View Chart</button>
        <button class="action-btn primary" onclick={onSave}>Save Version</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .result-panel {
    min-height: 300px;
    display: flex;
    flex-direction: column;
  }

  /* ── Empty / Running state ── */
  .state-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 40px 20px;
  }

  .empty-icon {
    font-size: 36px;
    opacity: 0.15;
  }

  .state-text {
    font-family: var(--sc-font-body);
    font-size: 13px;
    color: rgba(255 255 255 / 0.25);
    text-align: center;
    line-height: 1.6;
  }

  .state-text strong {
    color: var(--lis-accent);
  }

  .state-hint {
    font-size: 11px;
    color: rgba(255 255 255 / 0.2);
    margin: 0;
  }

  .spinner-lg {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(var(--lis-rgb-pink), 0.15);
    border-top-color: var(--lis-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Results ── */
  .results {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* ── Summary grid ── */
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 6px;
  }

  .stat-card {
    background: var(--lis-surface-0);
    border: 1px solid var(--lis-border-soft);
    border-radius: 6px;
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .stat-label {
    font-family: var(--sc-font-body);
    font-size: var(--ui-text-xs);
    color: rgba(255 255 255 / 0.35);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .stat-value {
    font-family: var(--sc-font-mono);
    font-size: 16px;
    font-weight: 600;
    color: rgba(255 255 255 / 0.85);
  }

  .stat-value.positive { color: var(--lis-positive); }
  .stat-value.negative { color: var(--sc-bad); }

  /* ── Walk-forward ── */
  .wf-section {
    background: var(--lis-surface-0);
    border: 1px solid var(--lis-border-soft);
    border-radius: 8px;
    padding: 12px;
  }

  .wf-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .wf-title {
    font-family: var(--sc-font-body);
    font-size: 11px;
    font-weight: 600;
    color: rgba(255 255 255 / 0.5);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .wf-ratio {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    color: var(--lis-positive);
  }

  .wf-ratio.warn { color: var(--lis-highlight); }
  .wf-ratio.danger { color: var(--sc-bad); }

  .wf-compare {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .wf-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .wf-col-label {
    font-size: var(--ui-text-xs);
    color: rgba(255 255 255 / 0.35);
  }

  .wf-col-val {
    font-family: var(--sc-font-mono);
    font-size: 13px;
    color: rgba(255 255 255 / 0.8);
  }

  .wf-warn {
    margin-top: 8px;
    font-size: 11px;
    color: var(--sc-bad);
    background: rgba(var(--lis-rgb-pink), 0.08);
    padding: 6px 10px;
    border-radius: 4px;
  }

  /* ── Cycle table ── */
  .cycle-section {
    background: var(--lis-surface-0);
    border: 1px solid var(--lis-border-soft);
    border-radius: 8px;
    padding: 12px;
  }

  .cycle-header {
    font-family: var(--sc-font-body);
    font-size: 11px;
    font-weight: 600;
    color: rgba(255 255 255 / 0.5);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 8px;
  }

  .cycle-table {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .ct-head {
    display: grid;
    grid-template-columns: 1fr 52px 60px 56px 32px;
    gap: 4px;
    padding: 4px 0;
    border-bottom: 1px solid rgba(255 255 255 / 0.06);
  }

  .ct-h-name, .ct-h {
    font-family: var(--sc-font-body);
    font-size: var(--ui-text-xs);
    color: rgba(255 255 255 / 0.25);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .ct-h { text-align: right; }

  .ct-row {
    display: grid;
    grid-template-columns: 1fr 52px 60px 56px 32px;
    gap: 4px;
    padding: 5px 0;
    border-bottom: 1px solid rgba(255 255 255 / 0.03);
    transition: background 0.15s;
  }

  .ct-row:hover {
    background: rgba(var(--lis-rgb-pink), 0.04);
  }

  .ct-name {
    font-family: var(--sc-font-body);
    font-size: 12px;
    color: rgba(255 255 255 / 0.7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ct-val {
    font-family: var(--sc-font-mono);
    font-size: 12px;
    color: rgba(255 255 255 / 0.75);
    text-align: right;
  }

  .ct-val.positive { color: var(--lis-positive); }
  .ct-val.negative { color: var(--sc-bad); }
  .ct-val.dim { color: rgba(255 255 255 / 0.3); }

  /* ── Actions ── */
  .action-bar {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 4px;
  }

  .action-btn {
    font-family: var(--sc-font-body);
    font-size: 12px;
    font-weight: 500;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid;
  }

  .action-btn.secondary {
    background: transparent;
    border-color: var(--lis-border);
    color: rgba(255 255 255 / 0.6);
  }

  .action-btn.secondary:hover {
    border-color: var(--lis-border-strong);
    color: rgba(255 255 255 / 0.85);
    background: rgba(var(--lis-rgb-pink), 0.05);
  }

  .action-btn.primary {
    background: rgba(var(--lis-rgb-pink), 0.15);
    border-color: rgba(var(--lis-rgb-pink), 0.3);
    color: var(--lis-accent);
  }

  .action-btn.primary:hover {
    background: rgba(var(--lis-rgb-pink), 0.25);
    border-color: rgba(var(--lis-rgb-pink), 0.45);
    box-shadow: var(--lis-glow-pink);
  }

  @media (max-width: 768px) {
    .summary-grid {
      grid-template-columns: repeat(3, 1fr);
    }

    .ct-head, .ct-row {
      grid-template-columns: 1fr 48px 56px 48px 28px;
      font-size: 11px;
    }
  }
</style>
