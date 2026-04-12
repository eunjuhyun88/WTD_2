<script lang="ts">
  const { currentStage, totalStages = 3, variant = 'stage' }: {
    currentStage: number;
    totalStages?: number;
    variant?: 'stage' | 'versions';
  } = $props();

  const stages = $derived(
    Array.from({ length: totalStages }, (_, i) => ({
      index: i + 1,
      reached: i + 1 <= currentStage,
      label: variant === 'versions' ? `v${i + 1}` : `Stage ${i + 1}`,
    }))
  );
</script>

<div class="evo-timeline" class:versions={variant === 'versions'}>
  {#each stages as s, i}
    <div class="evo-node" class:reached={s.reached}>
      <span class="evo-dot" class:reached={s.reached}></span>
      <span class="evo-label">{s.label}</span>
    </div>
    {#if i < stages.length - 1}
      <div class="evo-line" class:reached={stages[i + 1].reached}></div>
    {/if}
  {/each}
</div>

<style>
  .evo-timeline {
    display: flex;
    align-items: center;
    gap: 0;
    width: 100%;
  }

  .evo-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .evo-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid rgba(247, 242, 234, 0.12);
    background: transparent;
    transition: all var(--sc-duration-normal) var(--sc-ease);
  }

  .evo-dot.reached {
    background: var(--lis-accent);
    border-color: var(--lis-accent);
    box-shadow: 0 0 8px rgba(var(--lis-rgb-pink), 0.3);
  }

  .evo-label {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    letter-spacing: 0.5px;
    color: var(--sc-text-3);
    white-space: nowrap;
  }

  .evo-node.reached .evo-label {
    color: var(--sc-text-1);
  }

  .evo-line {
    flex: 1;
    height: 2px;
    background: rgba(247, 242, 234, 0.06);
    margin: 0 4px;
    margin-bottom: 20px; /* offset for label */
    transition: background var(--sc-duration-normal) var(--sc-ease);
  }

  .evo-line.reached {
    background: rgba(var(--lis-rgb-pink), 0.35);
  }

  .versions .evo-dot {
    width: 10px;
    height: 10px;
  }

  .versions .evo-label {
    font-size: 8px;
  }

  @media (prefers-reduced-motion: reduce) {
    .evo-dot, .evo-line { transition: none; }
  }
</style>
