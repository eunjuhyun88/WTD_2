<script lang="ts">
  import type { HudEvidence, HudSimilarCapture } from '$lib/components/terminal/hud/types';

  export let data: HudEvidence;

  function outcomeClass(outcome: string): string {
    if (outcome === 'win') return 'outcome-win';
    if (outcome === 'loss') return 'outcome-loss';
    return 'outcome-pending';
  }

  function simPercent(sim: number): string {
    return `${Math.round(sim * 100)}%`;
  }

  function simBarWidth(sim: number): string {
    return `${Math.round(sim * 100)}%`;
  }

  $: winRate = data.similar_captures.length
    ? Math.round(
        (data.similar_captures.filter((c: HudSimilarCapture) => c.outcome === 'win').length /
          data.similar_captures.length) *
          100
      )
    : null;
</script>

<div class="hud-card evidence-card">
  <div class="card-header">
    <span class="card-label">EVIDENCE</span>
    {#if winRate !== null}
      <span class="win-rate" class:high={winRate >= 60} class:low={winRate < 40}>
        {winRate}% win
      </span>
    {/if}
  </div>

  {#if data.similar_captures.length === 0}
    <div class="empty">No similar captures found</div>
  {:else}
    <div class="captures-list">
      {#each data.similar_captures as cap (cap.capture_id)}
        <div class="capture-row">
          <div class="capture-meta">
            <span class="capture-id">{cap.capture_id.slice(0, 8)}…</span>
            <span class="outcome-badge {outcomeClass(cap.outcome)}">{cap.outcome}</span>
          </div>
          <div class="sim-bar-wrap">
            <div class="sim-bar" style="width:{simBarWidth(cap.similarity)}"></div>
            <span class="sim-label">{simPercent(cap.similarity)}</span>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <div class="evidence-footer">{data.count} similar captures</div>
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

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .card-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.25);
    text-transform: uppercase;
  }

  .win-rate {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    color: rgba(255,255,255,0.4);
  }
  .win-rate.high { color: #26a69a; }
  .win-rate.low  { color: #ef5350; }

  .captures-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .capture-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .capture-meta {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .capture-id {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255,255,255,0.35);
  }

  .outcome-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 1px 5px;
    border-radius: 3px;
    text-transform: uppercase;
  }
  .outcome-win     { color: #26a69a; background: rgba(38,166,154,0.1); }
  .outcome-loss    { color: #ef5350; background: rgba(239,83,80,0.1); }
  .outcome-pending { color: rgba(255,255,255,0.3); background: rgba(255,255,255,0.05); }

  .sim-bar-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 4px;
    position: relative;
  }

  .sim-bar {
    height: 4px;
    background: rgba(96,165,250,0.4);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .sim-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(255,255,255,0.3);
    white-space: nowrap;
  }

  .evidence-footer {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255,255,255,0.2);
    margin-top: 2px;
  }

  .empty {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: rgba(255,255,255,0.2);
    padding: 8px 0;
  }
</style>
