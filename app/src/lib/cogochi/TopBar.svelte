<script lang="ts">
  import { shellStore, activeTabState } from './shell.store';
  import type { ChartType } from './shell.store';

  const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'] as const;
  const CHART_TYPES: Array<{ id: ChartType; label: string }> = [
    { id: 'candle', label: '🕯' },
    { id: 'line', label: '📈' },
    { id: 'heikin', label: 'HA' },
    { id: 'bar', label: '▐' },
  ];

  interface Props {
    onSymbolTap?: () => void;
    onIndicators?: () => void;
  }
  let { onSymbolTap, onIndicators }: Props = $props();

  const symbol = $derived($activeTabState.symbol ?? 'BTCUSDT');
  const tf = $derived($activeTabState.timeframe ?? '4h');
  const chartType = $derived($activeTabState.chartType ?? 'candle');
</script>

<header class="top-bar">
  <button class="symbol-btn" onclick={onSymbolTap}>
    <span class="symbol-text">{symbol}</span>
    <span class="symbol-arrow">▾</span>
  </button>

  <div class="tf-strip">
    {#each TIMEFRAMES as t}
      <button
        class="tf-btn"
        class:active={tf === t}
        onclick={() => shellStore.setTimeframe(t)}
      >{t}</button>
    {/each}
  </div>

  <div class="right-controls">
    <div class="chart-type-group">
      {#each CHART_TYPES as ct}
        <button
          class="ct-btn"
          class:active={chartType === ct.id}
          onclick={() => shellStore.setChartType(ct.id)}
          title={ct.id}
        >{ct.label}</button>
      {/each}
    </div>
    <button class="icon-btn" onclick={onIndicators} title="Indicators (⌘L)">⊞</button>
  </div>
</header>

<style>
.top-bar {
  height: var(--zone-top-bar, 48px);
  display: flex;
  align-items: center;
  gap: var(--sp-sm, 8px);
  padding: 0 var(--sp-md, 12px);
  background: var(--c-surface, #141210);
  border-bottom: 1px solid var(--c-border, #272320);
  flex-shrink: 0;
}

.symbol-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--c-bg, #0c0a09);
  border: 1px solid var(--c-border, #272320);
  border-radius: var(--r-sm, 3px);
  cursor: pointer;
  transition: border-color 0.1s;
}
.symbol-btn:hover {
  border-color: var(--c-text-dim, #706a62);
}

.symbol-text {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--c-text-primary, #eceae8);
}

.symbol-arrow {
  font-size: 9px;
  color: var(--c-text-dim, #706a62);
}

.tf-strip {
  display: flex;
  align-items: center;
  gap: 1px;
}

.tf-btn {
  padding: 3px 7px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-sm, 3px);
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  font-weight: 600;
  color: var(--c-text-dim, #706a62);
  cursor: pointer;
  transition: all 0.1s;
  white-space: nowrap;
}
.tf-btn:hover {
  color: var(--c-text-secondary, #9d9690);
  background: var(--c-bg, #0c0a09);
}
.tf-btn.active {
  color: var(--c-text-primary, #eceae8);
  background: var(--c-bg, #0c0a09);
  border-color: var(--c-border, #272320);
}

.right-controls {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--sp-sm, 8px);
}

.chart-type-group {
  display: flex;
  align-items: center;
  gap: 1px;
  background: var(--c-bg, #0c0a09);
  border: 1px solid var(--c-border, #272320);
  border-radius: var(--r-sm, 3px);
  padding: 2px;
}

.ct-btn {
  padding: 2px 6px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 2px;
  font-size: 11px;
  color: var(--c-text-dim, #706a62);
  cursor: pointer;
  transition: all 0.1s;
  line-height: 1.4;
}
.ct-btn:hover {
  color: var(--c-text-secondary, #9d9690);
}
.ct-btn.active {
  color: var(--c-text-primary, #eceae8);
  background: var(--c-surface, #141210);
  border-color: var(--c-border, #272320);
}

.icon-btn {
  padding: 4px 7px;
  background: transparent;
  border: 1px solid var(--c-border, #272320);
  border-radius: var(--r-sm, 3px);
  font-size: 13px;
  color: var(--c-text-dim, #706a62);
  cursor: pointer;
  transition: all 0.1s;
}
.icon-btn:hover {
  color: var(--c-text-secondary, #9d9690);
  border-color: var(--c-text-dim, #706a62);
}
</style>
