<script lang="ts">
  import DirectionBadge from '../../../../shared/panels/DirectionBadge.svelte';

  export let selectedCount = 0;
  export let signalPoolLength = 0;
  export let trackedCount = 0;
  export let avgConfidence = 0;
  export let avgRR = 0;
  export let consensusDir = 'NEUTRAL';
  export let topSignalHint = '';
  export let canApplyTopSignal = false;

  export let onOpenCopyTrade: () => void;
  export let onGoSignals: () => void;
  export let onApplyTopSignal: () => void;
</script>

<button class="chart-signal-cta" on:click={onApplyTopSignal} disabled={!canApplyTopSignal}>
  <span class="csc-text">APPLY TO CHART</span>
  <span class="csc-hint">{topSignalHint || 'No actionable signal yet'}</span>
  <span class="csc-arrow">↗</span>
</button>

{#if selectedCount > 0}
  <button class="copy-trade-cta" on:click={onOpenCopyTrade}>
    <span class="ctc-text">CREATE COPY TRADE</span>
    <span class="ctc-count">{selectedCount} selected</span>
    <span class="ctc-arrow">→</span>
  </button>
{/if}

<button class="signal-room-cta" on:click={onGoSignals}>
  <span class="src-text">SIGNAL ROOM</span>
  <span class="src-count">{signalPoolLength} SIGNALS</span>
  {#if trackedCount > 0}
    <span class="src-tracked">TRACKED {trackedCount}</span>
  {/if}
  <span class="src-arrow">→</span>
</button>

<div class="wr-stats">
  <div class="stat-cell"><div class="stat-lbl">SIG</div><div class="stat-val" style="color:var(--yel)">{signalPoolLength}</div></div>
  <div class="stat-cell"><div class="stat-lbl">CONF</div><div class="stat-val" style="color:var(--grn)">{avgConfidence}%</div></div>
  <div class="stat-cell"><div class="stat-lbl">R:R</div><div class="stat-val" style="color:var(--ora)">1:{avgRR.toFixed(1)}</div></div>
  <div class="stat-cell">
    <div class="stat-lbl">DIR</div>
    <div class="stat-dir-wrap">
      <DirectionBadge direction={consensusDir} size="xs" variant="soft" />
    </div>
  </div>
</div>
