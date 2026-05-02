<script lang="ts">
  import type { BacktestResult, TradeRecord } from '$lib/lab/backtest';

  const {
    mode,
    backtestResult,
    selectedTradeIndex,
    onPrevTrade,
    onNextTrade,
    // Manual mode
    position,
    revealedBars,
    totalBars,
    onClose,
  } = $props<{
    mode: 'auto' | 'manual';
    backtestResult: BacktestResult | null;
    selectedTradeIndex: number;
    onPrevTrade: () => void;
    onNextTrade: () => void;
    position: { direction: string; entryPrice: number; currentPrice: number; pnlPercent: number; slPrice: number; tpPrice: number } | null;
    revealedBars: number;
    totalBars: number;
    onClose: () => void;
  }>();

  function fmtPct(v: number): string {
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}%`;
  }

  function fmtPrice(v: number): string {
    return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
</script>

<div class="position-bar">
  {#if mode === 'auto' && backtestResult}
    <span class="pb-stat">{backtestResult.totalTrades} trades</span>
    <span class="pb-sep">│</span>
    <span class="pb-stat">Win <span class:positive={backtestResult.winRate >= 55} class:negative={backtestResult.winRate < 45}>{backtestResult.winRate.toFixed(0)}%</span></span>
    <span class="pb-sep">│</span>
    <span class="pb-stat">Sharpe <span class:positive={backtestResult.sharpeRatio >= 1}>{backtestResult.sharpeRatio.toFixed(2)}</span></span>
    <span class="pb-sep">│</span>
    <span class="pb-stat">PnL <span class="{backtestResult.totalPnlPercent >= 0 ? 'positive' : 'negative'}">{fmtPct(backtestResult.totalPnlPercent)}</span></span>
    <span class="pb-spacer"></span>
    <div class="trade-nav">
      <button class="nav-btn" onclick={onPrevTrade} disabled={selectedTradeIndex <= 0}>◀</button>
      <span class="nav-idx">{selectedTradeIndex >= 0 ? selectedTradeIndex + 1 : '—'}/{backtestResult.totalTrades}</span>
      <button class="nav-btn" onclick={onNextTrade} disabled={selectedTradeIndex >= backtestResult.totalTrades - 1}>▶</button>
    </div>

  {:else if mode === 'manual' && position}
    <span class="pb-dir" class:long={position.direction === 'long'} class:short={position.direction === 'short'}>
      {position.direction.toUpperCase()}
    </span>
    <span class="pb-price">{fmtPrice(position.entryPrice)}</span>
    <span class="pb-sep">│</span>
    <span class="pb-stat">PnL <span class="{position.pnlPercent >= 0 ? 'positive' : 'negative'}">{fmtPct(position.pnlPercent)}</span></span>
    <span class="pb-sep">│</span>
    <span class="pb-stat dim">SL {fmtPrice(position.slPrice)}</span>
    <span class="pb-sep">│</span>
    <span class="pb-stat dim">TP {fmtPrice(position.tpPrice)}</span>
    <span class="pb-spacer"></span>
    <button class="close-btn" onclick={onClose}>CLOSE</button>
    <span class="bar-progress">Bar {revealedBars}/{totalBars}</span>

  {:else if mode === 'manual'}
    <span class="pb-stat dim">No position</span>
    <span class="pb-spacer"></span>
    <span class="bar-progress">Bar {revealedBars}/{totalBars}</span>

  {:else}
    <span class="pb-stat dim">Run a strategy to begin</span>
  {/if}
</div>

<style>
  .position-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: var(--lis-surface-0);
    border: 1px solid var(--lis-border-soft);
    border-radius: 8px;
    font-family: var(--sc-font-mono);
    font-size: 12px;
    min-height: 38px;
    overflow-x: auto;
    white-space: nowrap;
  }

  .pb-stat { color: rgba(255 255 255 / 0.6); }
  .pb-stat.dim { color: rgba(255 255 255 / 0.3); }
  .pb-sep { color: rgba(255 255 255 / 0.1); }
  .pb-spacer { flex: 1; }
  .pb-price { color: rgba(255 255 255 / 0.85); font-weight: 600; }

  .positive { color: var(--lis-positive) !important; }
  .negative { color: var(--sc-bad) !important; }

  .pb-dir {
    font-weight: 700;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 3px;
  }
  .pb-dir.long { background: rgba(173, 202, 124, 0.15); color: var(--lis-positive); }
  .pb-dir.short { background: rgba(207, 127, 143, 0.15); color: var(--sc-bad); }

  .trade-nav {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .nav-btn {
    background: rgba(255 255 255 / 0.04);
    border: 1px solid rgba(255 255 255 / 0.08);
    border-radius: 4px;
    color: rgba(255 255 255 / 0.5);
    padding: 3px 8px;
    font-size: 10px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .nav-btn:hover:not(:disabled) { background: rgba(var(--lis-rgb-pink), 0.1); color: var(--lis-accent); }
  .nav-btn:disabled { opacity: 0.2; cursor: not-allowed; }

  .nav-idx {
    font-size: 11px;
    color: rgba(255 255 255 / 0.4);
    min-width: 60px;
    text-align: center;
  }

  .close-btn {
    background: rgba(207, 127, 143, 0.15);
    border: 1px solid rgba(207, 127, 143, 0.3);
    border-radius: 4px;
    color: var(--sc-bad);
    padding: 4px 12px;
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .close-btn:hover { background: rgba(207, 127, 143, 0.25); }

  .bar-progress {
    font-size: 10px;
    color: rgba(255 255 255 / 0.25);
  }
</style>
