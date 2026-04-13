<script lang="ts">
  import type { TerminalEvidence } from '$lib/types/terminal';

  interface Props { evidence: TerminalEvidence }
  let { evidence }: Props = $props();

  const stateColor: Record<string, string> = {
    bullish: '#4ade80', bearish: '#f87171', warning: '#fbbf24', neutral: 'rgba(247,242,234,0.72)'
  };
</script>

<div class="evidence-card" data-state={evidence.state} style="--state-color: {stateColor[evidence.state]}">
  <span class="metric">{evidence.metric}</span>
  <span class="value">{evidence.value}</span>
  {#if evidence.delta}
    <span class="delta">{evidence.delta}</span>
  {/if}
  {#if evidence.interpretation}
    <span class="interp">{evidence.interpretation}</span>
  {/if}
</div>

<style>
  .evidence-card {
    display: flex; flex-direction: column; gap: 1px;
    padding: 6px 8px;
    border: 1px solid color-mix(in srgb, var(--state-color) 30%, transparent);
    border-radius: 4px;
    background: color-mix(in srgb, var(--state-color) 6%, transparent);
    min-width: 80px;
  }
  .metric {
    font-family: var(--sc-font-mono);
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--sc-text-2);
  }
  .value {
    font-family: var(--sc-font-mono);
    font-size: 13px; font-weight: 600;
    color: var(--state-color);
  }
  .delta {
    font-family: var(--sc-font-mono);
    font-size: 9px; color: var(--sc-text-2);
  }
  .interp {
    font-size: 9px; color: var(--sc-text-2);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
</style>
