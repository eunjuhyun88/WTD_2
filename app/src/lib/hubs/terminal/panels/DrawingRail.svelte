<script lang="ts">
  /**
   * DrawingRail — Phase D-4 left vertical drawing toolbar (36px).
   * Bound to shellStore.drawingTool / chartActiveMode.
   */
  import { shellStore } from '../shell.store';
  import type { DrawingTool } from '../shell.store';
  import { chartSaveMode } from '$lib/stores/chartSaveMode';

  interface Props {
    onClearAll?: () => void;
    onDeleteSelected?: () => void;
  }
  const { onClearAll, onDeleteSelected }: Props = $props();

  const TOOLS: Array<{
    key: DrawingTool;
    icon: string;
    label: string;
    shortcut: string;
  }> = [
    { key: 'cursor',         icon: '↖',  label: 'Cursor',          shortcut: 'Esc' },
    { key: 'trendLine',      icon: '╱',  label: 'Trend line',      shortcut: 'T' },
    { key: 'horizontalLine', icon: '—',  label: 'Horizontal line', shortcut: 'H' },
    { key: 'verticalLine',   icon: '|',  label: 'Vertical line',   shortcut: 'V' },
    { key: 'extendedLine',   icon: '↔',  label: 'Extended line',   shortcut: 'E' },
    { key: 'rectangle',      icon: '□',  label: 'Rectangle',       shortcut: 'R' },
    { key: 'fibRetracement', icon: 'Ψ',  label: 'Fib retracement', shortcut: 'F' },
    { key: 'textLabel',      icon: 'T',  label: 'Text',            shortcut: 'L' },
  ];

  const activeTool = $derived($shellStore.drawingTool);
  const inSaveRange = $derived($chartSaveMode.active);

  function pick(tool: DrawingTool) {
    if (inSaveRange) chartSaveMode.exitRangeMode();
    shellStore.setDrawingTool(tool);
  }

  function onConfirmClear() {
    if (typeof window === 'undefined') return;
    if (window.confirm('Clear all drawings on this chart?')) onClearAll?.();
  }
</script>

<aside class="drawing-rail" role="toolbar" aria-label="Drawing tools">
  {#each TOOLS as tool (tool.key)}
    <button
      class="dr-btn"
      class:active={activeTool === tool.key && !inSaveRange}
      onclick={() => pick(tool.key)}
      title="{tool.label} ({tool.shortcut})"
      aria-pressed={activeTool === tool.key}
      aria-label={tool.label}
    >
      <span class="dr-icon">{tool.icon}</span>
    </button>
  {/each}

  <div class="dr-divider"></div>

  {#if onDeleteSelected}
    <button
      class="dr-btn dr-action"
      onclick={onDeleteSelected}
      title="Delete selected"
      aria-label="Delete selected drawing"
    >✕</button>
  {/if}

  {#if onClearAll}
    <button
      class="dr-btn dr-action dr-danger"
      onclick={onConfirmClear}
      title="Clear all drawings"
      aria-label="Clear all drawings"
    >⌫</button>
  {/if}
</aside>

<style>
  .drawing-rail {
    width: 36px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 6px 3px;
    background: var(--g1);
    border-right: 1px solid var(--g3);
    z-index: 5;
  }

  .dr-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--g6);
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    line-height: 1;
    padding: 0;
    cursor: pointer;
    transition: color 0.1s, background 0.1s, border-color 0.1s;
  }

  .dr-btn:hover {
    color: var(--g9);
    background: var(--g2);
  }

  .dr-btn.active {
    color: var(--brand);
    border-color: color-mix(in srgb, var(--brand) 40%, transparent);
    background: color-mix(in srgb, var(--brand) 12%, transparent);
  }

  .dr-icon {
    pointer-events: none;
  }

  .dr-divider {
    width: 20px;
    height: 1px;
    background: var(--g3);
    margin: 4px 0;
    flex-shrink: 0;
  }

  .dr-action {
    color: var(--g5);
    font-size: 11px;
  }

  .dr-danger:hover {
    color: var(--neg);
    background: color-mix(in srgb, var(--neg) 12%, transparent);
    border-color: color-mix(in srgb, var(--neg) 35%, transparent);
  }
</style>
