<script lang="ts">
  import type { TerminalEvidence } from '$lib/types/terminal';

  interface Props {
    evidence: TerminalEvidence[];
    onExpand?: () => void;
  }
  let { evidence = [], onExpand }: Props = $props();

  const MAX_VISIBLE = 6;

  let visible = $derived(evidence.slice(0, MAX_VISIBLE));
  let overflow = $derived(Math.max(0, evidence.length - MAX_VISIBLE));

  function scoreColor(state: TerminalEvidence['state']): string {
    if (state === 'bullish')  return '#4ade80';
    if (state === 'bearish')  return '#f87171';
    if (state === 'warning')  return '#fbbf24';
    return 'rgba(247,242,234,0.3)';
  }

  function scoreBg(state: TerminalEvidence['state']): string {
    if (state === 'bullish')  return 'rgba(74,222,128,0.08)';
    if (state === 'bearish')  return 'rgba(248,113,113,0.08)';
    if (state === 'warning')  return 'rgba(251,191,36,0.08)';
    return 'rgba(255,255,255,0.03)';
  }
</script>

{#if evidence.length > 0}
<div class="evidence-strip">
  {#each visible as ev (ev.metric)}
    <button
      class="ev-badge"
      style="color: {scoreColor(ev.state)}; background: {scoreBg(ev.state)};"
      title={ev.interpretation}
      onclick={onExpand}
    >
      <span class="ev-name">{ev.metric.replace(' ','').slice(0,6)}</span>
      <span class="ev-val">{ev.value}</span>
    </button>
  {/each}
  {#if overflow > 0}
    <button class="ev-more" onclick={onExpand}>
      +{overflow} ▾
    </button>
  {/if}
</div>
{/if}

<style>
  .evidence-strip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 12px;
    border-top: 1px solid var(--sc-terminal-border, rgba(255,255,255,0.07));
    overflow-x: auto;
    flex-shrink: 0;
    scrollbar-width: none;
  }
  .evidence-strip::-webkit-scrollbar { display: none; }

  .ev-badge {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 2px 7px;
    border-radius: 3px;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.1s;
  }
  .ev-badge:hover { opacity: 0.8; }

  .ev-name {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    letter-spacing: 0.05em;
    opacity: 0.7;
  }
  .ev-val {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
  }

  .ev-more {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(247,242,234,0.35);
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 3px;
    padding: 2px 7px;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.1s;
  }
  .ev-more:hover { color: rgba(247,242,234,0.7); border-color: rgba(255,255,255,0.2); }
</style>
