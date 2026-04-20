<script lang="ts">
  import type { TimePoint, MacdPoint } from '$lib/server/chart/indicatorUtils';

  interface Props {
    indicators?: {
      sma5?: TimePoint[];
      sma20?: TimePoint[];
      sma60?: TimePoint[];
      ema21?: TimePoint[];
      ema55?: TimePoint[];
      atr14?: TimePoint[];
      vwap?: TimePoint[];
      bbUpper?: TimePoint[];
      bbLower?: TimePoint[];
      rsi14?: TimePoint[];
      macd?: MacdPoint[];
    };
    showCVD?: boolean;
    cvdBars?: Array<{ time: number; value: number }>;
  }

  let { indicators, showCVD = true, cvdBars } = $props();
</script>

<div class="indicator-pane-stack">
  {#if showCVD && cvdBars?.length}
    <div class="cvd-pane">
      <div class="pane-label">CVD</div>
      <!-- Chart will be rendered here by parent -->
    </div>
  {/if}

  <div class="study-pane">
    <div class="pane-label">Studies</div>
    <!-- Indicators rendered by parent -->
    <div class="placeholder">
      {#if indicators?.macd?.length}
        MACD: {indicators.macd.length} points
      {/if}
      {#if indicators?.rsi14?.length}
        RSI: {indicators.rsi14.length} points
      {/if}
    </div>
  </div>
</div>

<style>
  .indicator-pane-stack {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: rgba(19, 23, 34, 0.8);
    border-top: 1px solid rgba(42, 46, 57, 0.9);
  }

  .cvd-pane,
  .study-pane {
    background: rgba(19, 23, 34, 0.8);
    border-bottom: 1px solid rgba(42, 46, 57, 0.6);
    padding: 8px;
    min-height: 80px;
  }

  .pane-label {
    font-size: 10px;
    color: rgba(177, 181, 189, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
    font-family: var(--sc-font-mono, monospace);
  }

  .placeholder {
    color: rgba(177, 181, 189, 0.3);
    font-size: 11px;
    font-family: var(--sc-font-mono, monospace);
  }
</style>
