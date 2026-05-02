<script lang="ts">
  const TIMEFRAMES = ['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','1w'];

  let { tf = '1h', onTfChange, drawingMode = false, onToggleDrawing } = $props();

  function handleTfChange(newTf: string) {
    if (onTfChange) onTfChange(newTf);
  }
</script>

<div class="chart-toolbar">
  <div class="tf-strip">
    {#each TIMEFRAMES as t}
      <button
        class="tf-btn"
        class:active={tf === t}
        onclick={() => handleTfChange(t)}
      >{t}</button>
    {/each}
  </div>

  <div class="toolbar-spacer"></div>

  <button
    class="draw-btn"
    class:active={drawingMode}
    onclick={onToggleDrawing}
    title={drawingMode ? 'Disable drawing' : 'Enable drawing (D)'}
  >DRAW</button>
</div>

<style>
  .chart-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: rgba(19, 23, 34, 0.8);
    border-bottom: 1px solid rgba(42, 46, 57, 0.9);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    flex-shrink: 0;
  }

  .tf-strip {
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .tf-btn {
    padding: 2px 5px;
    height: 22px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    font-family: inherit;
    font-size: var(--ui-text-xs);
    font-weight: 600;
    color: rgba(177, 181, 189, 0.6);
    cursor: pointer;
    transition: color 0.08s, border-color 0.08s;
    white-space: nowrap;
  }
  .tf-btn:hover { color: rgba(177, 181, 189, 0.9); }
  .tf-btn.active {
    color: rgba(100, 200, 255, 0.9);
    border-bottom-color: rgba(100, 200, 255, 0.7);
  }

  .toolbar-spacer { flex: 1; }

  .draw-btn {
    background: none;
    border: 1px solid transparent;
    border-radius: 3px;
    color: rgba(177, 181, 189, 0.7);
    cursor: pointer;
    padding: 2px 8px;
    font-family: inherit;
    font-size: var(--ui-text-xs);
    font-weight: 600;
    letter-spacing: 0.06em;
    transition: all 0.2s;
  }
  .draw-btn:hover {
    color: rgba(177, 181, 189, 0.95);
    border-color: rgba(100, 150, 200, 0.4);
    background: rgba(100, 150, 200, 0.1);
  }
  .draw-btn.active {
    color: rgba(100, 200, 255, 0.9);
    border-color: rgba(100, 200, 255, 0.5);
    background: rgba(100, 150, 200, 0.2);
  }
</style>
