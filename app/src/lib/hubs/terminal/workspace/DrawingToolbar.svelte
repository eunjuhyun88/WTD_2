<script lang="ts">
  /**
   * DrawingToolbar — Vertical sidebar for chart drawing tools.
   * W-0289: TradingView-style left rail with 9 tool icons.
   */
  import type { DrawingToolType } from '$lib/chart/DrawingManager';

  interface Props {
    activeTool: DrawingToolType;
    onSelectTool: (tool: DrawingToolType) => void;
    onClearAll?: () => void;
    onDeleteSelected?: () => void;
  }

  let { activeTool, onSelectTool, onClearAll, onDeleteSelected }: Props = $props();

  const TOOLS: Array<{
    key: DrawingToolType;
    icon: string;
    label: string;
    shortcut?: string;
  }> = [
    { key: 'cursor',         icon: '↖',  label: 'Select (Cursor)',       shortcut: 'Esc' },
    { key: 'trendLine',      icon: '╱',  label: 'Trend Line',            shortcut: 'T' },
    { key: 'horizontalLine', icon: '—',  label: 'Horizontal Line',       shortcut: 'H' },
    { key: 'verticalLine',   icon: '|',  label: 'Vertical Line',         shortcut: 'V' },
    { key: 'extendedLine',   icon: '↔',  label: 'Extended Line',         shortcut: 'E' },
    { key: 'rectangle',      icon: '□',  label: 'Rectangle',             shortcut: 'R' },
    { key: 'fibRetracement', icon: 'Ψ',  label: 'Fibonacci Retracement', shortcut: 'F' },
    { key: 'textLabel',      icon: 'T',  label: 'Text',                  shortcut: 'L' },
  ];
</script>

<div class="drawing-toolbar" role="toolbar" aria-label="Drawing tools">
  {#each TOOLS as tool}
    <button
      class="tool-btn"
      class:active={activeTool === tool.key}
      onclick={() => onSelectTool(tool.key)}
      title="{tool.label}{tool.shortcut ? ` (${tool.shortcut})` : ''}"
      aria-pressed={activeTool === tool.key}
      aria-label={tool.label}
    >
      <span class="tool-icon">{tool.icon}</span>
    </button>
  {/each}

  <div class="toolbar-divider"></div>

  {#if onDeleteSelected}
    <button
      class="tool-btn action-btn"
      onclick={onDeleteSelected}
      title="Delete Selected"
      aria-label="Delete selected shape"
    >
      ✕
    </button>
  {/if}

  {#if onClearAll}
    <button
      class="tool-btn action-btn danger"
      onclick={() => { if (confirm('Delete all drawings?')) onClearAll?.(); }}
      title="Clear All"
      aria-label="Delete all drawings"
    >
      ⌫
    </button>
  {/if}
</div>

<style>
  .drawing-toolbar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 6px 3px;
    background: rgba(13, 17, 23, 0.95);
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    width: 32px;
    flex-shrink: 0;
    z-index: 10;
  }

  @media (max-width: 768px) {
    /* DrawingStrip: floating overlay on left edge of ChartCanvas.
       Parent (.mobile-chart-section) must be position:relative.
       Hidden by default; shown only when parent has [data-draw-mode] attribute
       (set by TradeMode when shellStore.drawingMode === true). */
    .drawing-toolbar {
      position: absolute;
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 40px;
      height: auto;
      max-height: 200px;
      border-right: none;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      background: rgba(13, 17, 23, 0.92);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      padding: 4px 3px;
      gap: 2px;
      z-index: 20;
      overflow-y: auto;
      scrollbar-width: none;
    }
    .drawing-toolbar::-webkit-scrollbar { display: none; }
    .toolbar-divider {
      width: 24px;
      height: 1px;
      margin: 2px 0;
    }
  }

  .tool-btn {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.4);
    font-size: 13px;
    line-height: 1;
    padding: 0;
    transition: color 0.1s, background 0.1s, border-color 0.1s;
    font-family: inherit;
  }

  .tool-btn:hover {
    color: rgba(255, 255, 255, 0.75);
    background: rgba(255, 255, 255, 0.06);
  }

  .tool-btn.active {
    color: #3b82f6;
    border-color: rgba(59, 130, 246, 0.4);
    background: rgba(59, 130, 246, 0.12);
  }

  .tool-icon {
    pointer-events: none;
  }

  .toolbar-divider {
    width: 20px;
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
    margin: 4px 0;
    flex-shrink: 0;
  }

  .action-btn {
    color: rgba(255, 255, 255, 0.3);
    font-size: 11px;
  }

  .action-btn.danger:hover {
    color: #f87171;
    background: rgba(248, 113, 113, 0.1);
    border-color: rgba(248, 113, 113, 0.3);
  }
</style>
