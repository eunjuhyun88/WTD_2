<script lang="ts">
  /**
   * Tooltip.svelte — minimal hover/long-press tooltip.
   *
   * Usage:
   *   <Tooltip label="설명 텍스트">
   *     <SomeTrigger />
   *   </Tooltip>
   *
   * - Desktop: shows on hover.
   * - Mobile: shows on long-press (500ms), dismisses on touch-end.
   * - No JS library. Pure CSS positioning with optional edge flip.
   * - Design: dark chip, mono 11px, max-width 220px, sharp edges.
   */
  import type { Snippet } from 'svelte';

  interface Props {
    /** Primary tooltip text. May contain a newline for two-line display. */
    label: string;
    /** Optional secondary line (lighter weight). */
    sublabel?: string;
    /** Preferred position. Tooltip auto-flips if near right edge. */
    position?: 'top' | 'bottom' | 'left' | 'right';
    children: Snippet;
  }

  let {
    label,
    sublabel,
    position = 'top',
    children,
  }: Props = $props();

  let visible = $state(false);
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let wrapperEl: HTMLElement | null = $state(null);

  // Determine flip: if the wrapper is in the right 40% of the viewport, flip to left-anchored.
  const resolvedPosition = $derived.by(() => {
    if (wrapperEl && position === 'top') {
      const rect = wrapperEl.getBoundingClientRect();
      const vpWidth = typeof window !== 'undefined' ? window.innerWidth : 1440;
      return rect.right > vpWidth * 0.6 ? 'top-right' : 'top-left';
    }
    return position;
  });

  function show() { visible = true; }
  function hide() { visible = false; }

  function onTouchStart() {
    longPressTimer = setTimeout(() => { visible = true; }, 500);
  }
  function onTouchEnd() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    // Short delay so user can read before dismiss
    setTimeout(() => { visible = false; }, 1200);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="tooltip-host"
  bind:this={wrapperEl}
  role="group"
  onmouseenter={show}
  onmouseleave={hide}
  onfocus={show}
  onblur={hide}
  ontouchstart={onTouchStart}
  ontouchend={onTouchEnd}
>
  {@render children()}

  {#if visible}
    <div
      class="tooltip-chip"
      class:pos-top-left={resolvedPosition === 'top-left' || resolvedPosition === 'top'}
      class:pos-top-right={resolvedPosition === 'top-right'}
      class:pos-bottom={resolvedPosition === 'bottom'}
      class:pos-left={resolvedPosition === 'left'}
      class:pos-right={resolvedPosition === 'right'}
      role="tooltip"
    >
      <span class="tooltip-label">{label}</span>
      {#if sublabel}
        <span class="tooltip-sublabel">{sublabel}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tooltip-host {
    position: relative;
    display: inline-flex;
  }

  .tooltip-chip {
    position: absolute;
    z-index: 200;
    max-width: 220px;
    padding: 8px 10px;
    background: rgba(12, 16, 22, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    color: rgba(247, 242, 234, 0.92);
    /* Sharp edge — no box-shadow */
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 3px;
    white-space: nowrap;
  }

  /* Position variants */
  .pos-top-left {
    bottom: calc(100% + 6px);
    left: 0;
  }

  .pos-top-right {
    bottom: calc(100% + 6px);
    right: 0;
  }

  .pos-bottom {
    top: calc(100% + 6px);
    left: 0;
  }

  .pos-left {
    right: calc(100% + 6px);
    top: 50%;
    transform: translateY(-50%);
  }

  .pos-right {
    left: calc(100% + 6px);
    top: 50%;
    transform: translateY(-50%);
  }

  .tooltip-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1.4;
    color: rgba(247, 242, 234, 0.92);
  }

  .tooltip-sublabel {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.02em;
    line-height: 1.4;
    color: rgba(247, 242, 234, 0.52);
    white-space: normal;
    max-width: 200px;
  }
</style>
