<script lang="ts">
  import type { HudRisk } from '$lib/components/terminal/hud/types';

  export let data: HudRisk;

  const TREND_ICONS: Record<string, string> = {
    UP: '↑',
    DOWN: '↓',
    NEUTRAL: '→',
  };

  const TREND_COLORS: Record<string, string> = {
    UP: '#26a69a',
    DOWN: '#ef5350',
    NEUTRAL: '#fbbf24',
  };

  $: pWin = data.entry_p_win;
  $: threshold = data.threshold;
  $: aboveThreshold = pWin !== null && pWin >= threshold;
  $: pWinPct = pWin !== null ? Math.round(pWin * 100) : null;
  $: thresholdPct = Math.round(threshold * 100);
  $: trendIcon = data.btc_trend ? TREND_ICONS[data.btc_trend] ?? '—' : '—';
  $: trendColor = data.btc_trend ? TREND_COLORS[data.btc_trend] ?? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.4)';
  $: gaugeWidth = pWin !== null ? `${Math.round(pWin * 100)}%` : '0%';
</script>

<div class="hud-card risk-card">
  <div class="card-label">RISK / EDGE</div>

  <div class="p-win-row">
    <span class="p-win-label">P(win)</span>
    {#if pWinPct !== null}
      <span class="p-win-value" class:above={aboveThreshold} class:below={!aboveThreshold}>
        {pWinPct}%
      </span>
    {:else}
      <span class="p-win-value muted">—</span>
    {/if}
  </div>

  <div class="gauge-track">
    <div class="gauge-fill" style="width:{gaugeWidth}" class:above={aboveThreshold} class:below={!aboveThreshold}></div>
    <div class="gauge-threshold" style="left:{thresholdPct}%" title="Threshold {thresholdPct}%"></div>
  </div>

  <div class="threshold-label">Threshold: {thresholdPct}%</div>

  <div class="btc-row">
    <span class="btc-label">BTC Trend</span>
    <span class="btc-value" style="color:{trendColor}">
      {trendIcon} {data.btc_trend ?? '—'}
    </span>
  </div>
</div>

<style>
  .hud-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 8px;
  }

  .card-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.25);
    text-transform: uppercase;
  }

  .p-win-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .p-win-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: rgba(255,255,255,0.4);
  }

  .p-win-value {
    font-family: var(--sc-font-mono, monospace);
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
  }
  .p-win-value.above { color: #26a69a; }
  .p-win-value.below { color: #ef5350; }
  .p-win-value.muted { color: rgba(255,255,255,0.2); font-size: 18px; }

  .gauge-track {
    position: relative;
    height: 6px;
    background: rgba(255,255,255,0.07);
    border-radius: 3px;
    overflow: visible;
  }

  .gauge-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease;
  }
  .gauge-fill.above { background: #26a69a; }
  .gauge-fill.below { background: #ef5350; }

  .gauge-threshold {
    position: absolute;
    top: -3px;
    width: 2px;
    height: 12px;
    background: rgba(255,255,255,0.4);
    border-radius: 1px;
    transform: translateX(-50%);
  }

  .threshold-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(255,255,255,0.2);
  }

  .btc-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 4px;
    border-top: 1px solid rgba(255,255,255,0.05);
    margin-top: 2px;
  }

  .btc-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(255,255,255,0.3);
  }

  .btc-value {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
</style>
