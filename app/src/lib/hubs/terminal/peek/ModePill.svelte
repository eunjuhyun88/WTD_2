<script lang="ts">
  /**
   * ModePill.svelte
   *
   * 3-segment mode switcher: TRADE / TRAIN / FLYWHEEL
   * - TRADE / FLYWHEEL: active, clickable
   * - TRAIN: aria-disabled, cursor-not-allowed, tooltip "준비 중"
   * - Active segment: amb (#f5a623) underline, g9 text
   * - Inactive: g5 text
   */

  import { workMode, type WorkMode } from '../workMode.store';

  const SEGMENTS: { mode: WorkMode; label: string; disabled: boolean }[] = [
    { mode: 'TRADE',    label: 'TRADE',    disabled: false },
    { mode: 'TRAIN',    label: 'TRAIN',    disabled: true  },
    { mode: 'FLYWHEEL', label: 'FLYWHEEL', disabled: false },
  ];

  function select(mode: WorkMode, disabled: boolean) {
    if (disabled) return;
    workMode.set(mode);
  }
</script>

<div class="mode-pill" role="tablist" aria-label="Work mode">
  {#each SEGMENTS as seg (seg.mode)}
    <button
      role="tab"
      class="segment"
      class:active={$workMode === seg.mode}
      class:disabled={seg.disabled}
      aria-selected={$workMode === seg.mode}
      aria-disabled={seg.disabled}
      title={seg.disabled ? '준비 중' : seg.label}
      tabindex={seg.disabled ? -1 : 0}
      onclick={() => select(seg.mode, seg.disabled)}
      type="button"
    >
      {seg.label}
    </button>
  {/each}
</div>

<style>
  .mode-pill {
    display: inline-flex;
    align-items: stretch;
    gap: 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--ui-text-xs);
    letter-spacing: 0.08em;
  }

  .segment {
    position: relative;
    padding: 4px 10px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--g5, rgba(255, 255, 255, 0.40));
    font-family: inherit;
    font-size: inherit;
    font-weight: 700;
    letter-spacing: inherit;
    text-transform: uppercase;
    transition: color 0.12s;
    white-space: nowrap;
    /* bottom underline slot */
    border-bottom: 2px solid transparent;
  }

  .segment:hover:not(.disabled) {
    color: var(--g7, rgba(255, 255, 255, 0.72));
  }

  .segment.active {
    color: var(--g9, rgba(255, 255, 255, 0.88));
    border-bottom-color: var(--amb, #f5a623);
  }

  .segment.disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  /* Divider between segments */
  .segment + .segment::before {
    content: '';
    position: absolute;
    left: 0;
    top: 20%;
    height: 60%;
    width: 1px;
    background: var(--g3, rgba(255, 255, 255, 0.10));
  }
</style>
