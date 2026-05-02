<script lang="ts">
  import type { TerminalEvidence } from '$lib/types/terminal';
  import MiniIndicatorChart from './MiniIndicatorChart.svelte';

  interface Props {
    evidence: TerminalEvidence;
    bars?: any[];
    /** Per-layer override bars — takes priority over shared bars */
    layerBarsMap?: Record<string, any[]>;
  }
  let { evidence, bars = [], layerBarsMap = {} }: Props = $props();

  const stateColor: Record<string, string> = {
    bullish: '#4ade80', bearish: '#f87171', warning: '#fbbf24', neutral: 'rgba(247,242,234,0.72)'
  };

  // Map display metric name → layer key for chart type
  const METRIC_TO_LAYER: Record<string, string> = {
    'WYCKOFF': 'wyckoff',
    'MTF CONF': 'mtf',
    'CVD': 'cvd',
    'VOL SURGE': 'vsurge',
    'BREAKOUT': 'breakout',
    'FR / FLOW': 'flow',
    'OI SQUEEZE': 'oi',
    'REAL LIQ': 'real_liq',
    'LIQ EST': 'liq_est',
    'BASIS': 'basis',
    'BB(14)': 'bb14',
    'BB(16)': 'bb16',
    'ATR': 'atr',
    'FEAR/GREED': 'fg',
    'ON-CHAIN': 'onchain',
    'KIMCHI': 'kimchi',
    'SECTOR': 'sector',
    'OB': 'ob',
  };

  const layerKey = $derived(METRIC_TO_LAYER[evidence.metric] ?? evidence.metric.toLowerCase());
  const activeBars = $derived(layerBarsMap[layerKey] ?? bars);
</script>

<div class="evidence-card" data-state={evidence.state} style="--state-color: {stateColor[evidence.state]}">
  <div class="card-header">
    <div class="card-text">
      <span class="metric">{evidence.metric}</span>
      <span class="value">{evidence.value}</span>
    </div>
    {#if activeBars.length > 2}
      <div class="card-chart">
        <MiniIndicatorChart {layerKey} bars={activeBars} width={120} height={32} />
      </div>
    {/if}
  </div>
  {#if evidence.interpretation}
    <span class="interp">{evidence.interpretation}</span>
  {/if}
</div>

<style>
  .evidence-card {
    display: flex; flex-direction: column; gap: 3px;
    padding: 6px 8px;
    border: 1px solid color-mix(in srgb, var(--state-color) 30%, transparent);
    border-radius: 4px;
    background: color-mix(in srgb, var(--state-color) 6%, transparent);
    min-width: 80px;
  }
  .card-header {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
  }
  .card-text {
    display: flex; flex-direction: column; gap: 1px;
    min-width: 0; flex-shrink: 0;
  }
  .card-chart {
    flex-shrink: 0;
    opacity: 0.9;
  }
  .metric {
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--sc-text-2);
  }
  .value {
    font-family: var(--sc-font-mono);
    font-size: 13px; font-weight: 600;
    color: var(--state-color);
  }
  .interp {
    font-size: var(--ui-text-xs); color: var(--sc-text-2);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
</style>
