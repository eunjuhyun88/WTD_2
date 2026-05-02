<script lang="ts">
  import type { HudTransition } from '$lib/components/terminal/hud/types';

  export let data: HudTransition;
</script>

<div class="hud-card transition-card">
  <div class="card-label">NEXT TRANSITION</div>

  {#if data.next_phase}
    <div class="next-phase">
      <span class="arrow">→</span>
      <span class="phase-name">{data.next_phase}</span>
    </div>
  {:else}
    <div class="next-phase muted">No next phase</div>
  {/if}

  {#if data.conditions.length > 0}
    <ul class="conditions-list">
      {#each data.conditions as condition}
        <li class="condition-item">
          <span class="condition-dot"></span>
          <span class="condition-text">{condition}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="empty">No conditions defined</div>
  {/if}
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

  .next-phase {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .next-phase.muted {
    color: rgba(255,255,255,0.2);
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
  }

  .arrow {
    font-family: var(--sc-font-mono, monospace);
    font-size: 14px;
    color: #fbbf24;
  }

  .phase-name {
    font-family: var(--sc-font-mono, monospace);
    font-size: 14px;
    font-weight: 700;
    color: #fbbf24;
    letter-spacing: 0.04em;
  }

  .conditions-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .condition-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .condition-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(251,191,36,0.4);
    margin-top: 5px;
    flex-shrink: 0;
  }

  .condition-text {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(255,255,255,0.4);
    line-height: 1.5;
  }

  .empty {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    color: rgba(255,255,255,0.2);
    padding: 4px 0;
  }
</style>
