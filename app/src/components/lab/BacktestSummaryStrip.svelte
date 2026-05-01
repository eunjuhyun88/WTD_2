<script lang="ts">
  import type { BacktestResult } from '$lib/contracts/backtest';

  interface Props {
    result: BacktestResult | null;
    isRunning?: boolean;
  }
  let { result, isRunning = false }: Props = $props();

  const dash = '——';

  const winRate   = $derived(result ? `${(result.winRate * 100).toFixed(1)}%` : dash);
  const sharpe    = $derived(result ? result.sharpeRatio.toFixed(2) : dash);
  const mdd       = $derived(result ? `${result.maxDrawdownPercent.toFixed(1)}%` : dash);
  const pnl       = $derived(result ? `${result.totalPnlPercent >= 0 ? '+' : ''}${result.totalPnlPercent.toFixed(2)}%` : dash);
  const trades    = $derived(result ? String(result.totalTrades) : dash);
  const pf        = $derived(result ? result.profitFactor.toFixed(2) : dash);
  const avgR      = $derived(result ? result.avgRMultiple.toFixed(2) : dash);

  const winClass  = $derived(!result ? '' : result.winRate >= 0.55 ? 'pos' : result.winRate < 0.4 ? 'neg' : '');
  const shrpClass = $derived(!result ? '' : result.sharpeRatio >= 1 ? 'pos' : result.sharpeRatio < 0.5 ? 'neg' : '');
  const pnlClass  = $derived(!result ? '' : result.totalPnlPercent >= 0 ? 'pos' : 'neg');
</script>

<div class="strip" class:loading={isRunning}>
  <div class="metric">
    <span class="lbl">WIN</span>
    <span class="val {winClass}">{winRate}</span>
  </div>
  <div class="sep"></div>
  <div class="metric">
    <span class="lbl">SHRP</span>
    <span class="val {shrpClass}">{sharpe}</span>
  </div>
  <div class="sep"></div>
  <div class="metric">
    <span class="lbl">MDD</span>
    <span class="val neg">{mdd}</span>
  </div>
  <div class="sep"></div>
  <div class="metric">
    <span class="lbl">PNL</span>
    <span class="val {pnlClass}">{pnl}</span>
  </div>
  <div class="sep"></div>
  <div class="metric">
    <span class="lbl">N</span>
    <span class="val">{trades}</span>
  </div>
  <div class="sep"></div>
  <div class="metric">
    <span class="lbl">PF</span>
    <span class="val">{pf}</span>
  </div>
  <div class="sep"></div>
  <div class="metric">
    <span class="lbl">AVG-R</span>
    <span class="val">{avgR}</span>
  </div>
</div>

<style>
.strip {
  display: flex;
  align-items: center;
  gap: 0;
  height: 40px;
  padding: 0 12px;
  background: var(--g1);
  border-bottom: 1px solid var(--g3);
  flex-shrink: 0;
  overflow: hidden;
}

.strip.loading {
  opacity: 0.5;
  pointer-events: none;
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 0 10px;
}

.lbl {
  font-family: var(--font-mono);
  font-size: 7px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--g6);
  text-transform: uppercase;
}

.val {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--g8);
}

.val.pos { color: var(--pos); }
.val.neg { color: var(--neg); }

.sep {
  width: 1px;
  height: 20px;
  background: var(--g3);
  flex-shrink: 0;
}
</style>
