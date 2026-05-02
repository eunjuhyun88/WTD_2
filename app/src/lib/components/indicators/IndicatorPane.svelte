<script lang="ts">
  /**
   * Registry-driven indicator pane.
   *
   * Given an ordered list of indicator ids and the live value map,
   * renders each through the dispatcher. Missing values skip silently
   * (no loading flicker on indicators that haven't loaded yet).
   */
  import type { IndicatorValue } from '$lib/indicators/types';
  import { INDICATOR_REGISTRY } from '$lib/indicators/registry';
  import IndicatorRenderer from './IndicatorRenderer.svelte';
  import { shellStore } from '$lib/hubs/terminal/shell.store';

  interface Props {
    ids: readonly string[] | string[];
    values: Record<string, IndicatorValue>;
    /** Optional label rendered above the pane (e.g., 'LIVE INDICATORS'). */
    title?: string;
    /** Layout: 'row' for gauge-heavy horizontal strip, 'stack' for venue/heatmap panes */
    layout?: 'row' | 'stack';
    /** Compact mode — tighter padding + gap, for narrow containers (Layout B/C peek). */
    compact?: boolean;
    /** Enable drag-to-reorder (W-0124 Part 2). Reorders shellStore.visibleIndicators. */
    reorderable?: boolean;
  }
  let { ids, values, title, layout = 'row', compact = false, reorderable = false }: Props = $props();

  // ── Drag state (DOM-local; no store writes until drop) ─────────────────────
  let draggingId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);

  function onDragStart(e: DragEvent, id: string) {
    if (!reorderable) return;
    draggingId = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    }
  }

  function onDragOver(e: DragEvent, id: string) {
    if (!reorderable || !draggingId || draggingId === id) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dragOverId = id;
  }

  function onDrop(e: DragEvent, targetId: string) {
    if (!reorderable || !draggingId || draggingId === targetId) { draggingId = null; dragOverId = null; return; }
    e.preventDefault();
    const srcId = draggingId;
    shellStore.update(st => {
      const vis = [...st.visibleIndicators];
      const srcIdx = vis.indexOf(srcId);
      const tgtIdx = vis.indexOf(targetId);
      if (srcIdx < 0 || tgtIdx < 0) return st;
      vis.splice(srcIdx, 1);
      const insertAt = vis.indexOf(targetId);
      vis.splice(insertAt, 0, srcId);
      return { ...st, visibleIndicators: vis };
    });
    draggingId = null;
    dragOverId = null;
  }

  function onDragEnd() {
    draggingId = null;
    dragOverId = null;
  }

  const rendered = $derived(
    ids
      .map(id => ({ id, def: INDICATOR_REGISTRY[id], value: values[id] }))
      .filter(x => x.def && x.value != null)
  );
</script>

{#if rendered.length > 0}
  <div
    class="ind-pane"
    class:layout-row={layout === 'row'}
    class:layout-stack={layout === 'stack'}
    class:compact
  >
    {#if title}
      <div class="ind-pane-title">{title}</div>
    {/if}
    <div class="ind-pane-items">
      {#each rendered as item (item.id)}
        <div
          class="ind-item-wrap"
          class:dragging={draggingId === item.id}
          class:drag-over={dragOverId === item.id && draggingId !== item.id}
          data-indicator-id={item.id}
          draggable={reorderable}
          role={reorderable ? 'listitem' : undefined}
          ondragstart={(e) => onDragStart(e, item.id)}
          ondragover={(e) => onDragOver(e, item.id)}
          ondrop={(e) => onDrop(e, item.id)}
          ondragend={onDragEnd}
        >
          <IndicatorRenderer def={item.def!} value={item.value!} />
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .ind-pane {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 0;
  }

  .ind-pane.compact {
    gap: 2px;
    padding: 3px 0;
  }

  .ind-pane-title {
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--g5, rgba(255, 255, 255, 0.4));
    padding: 0 10px 2px;
    font-family: var(--sc-font-mono, monospace);
  }

  .ind-pane.compact .ind-pane-title {
    font-size: 8px;
    padding: 0 6px 1px;
    letter-spacing: 0.06em;
  }

  .ind-pane-items {
    display: flex;
    gap: 2px;
  }

  .ind-pane.compact .ind-pane-items {
    gap: 1px;
  }

  .layout-row .ind-pane-items {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .layout-stack .ind-pane-items {
    flex-direction: column;
  }

  .ind-item-wrap {
    display: contents; /* transparent wrapper — lets inner component control layout */
  }

  /* Reorderable: wrapper must be a real box for drag events + visual feedback */
  .ind-item-wrap[draggable="true"] {
    display: block;
    cursor: grab;
    transition: opacity 0.15s ease, transform 0.15s ease;
    border-radius: 4px;
  }
  .ind-item-wrap[draggable="true"]:active { cursor: grabbing; }
  .ind-item-wrap.dragging {
    opacity: 0.4;
    transform: scale(0.96);
  }
  .ind-item-wrap.drag-over {
    box-shadow: inset 0 0 0 1.5px var(--brand, #5b8dee);
    background: color-mix(in oklab, var(--brand, #5b8dee) 8%, transparent);
  }

  /* AI focus highlight: pulsing amber border, fired via JS adding .highlight class */
  :global([data-indicator-id].highlight) {
    display: block;
    border-radius: 4px;
    animation: ind-highlight-pulse 2s ease-out forwards;
  }

  @keyframes ind-highlight-pulse {
    0%   { box-shadow: 0 0 0 2px var(--amb); background: var(--amb-dd); }
    50%  { box-shadow: 0 0 0 3px var(--amb-d); }
    100% { box-shadow: none; background: transparent; }
  }
</style>
