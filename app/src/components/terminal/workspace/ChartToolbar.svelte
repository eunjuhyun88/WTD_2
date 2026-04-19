<script lang="ts">
  const TIMEFRAMES = ['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','1w'];

  let { tf = '1h', onTfChange, showExport = true } = $props();

  function handleTfChange(newTf: string) {
    if (onTfChange) {
      onTfChange(newTf);
    }
  }

  function handleExport() {
    // Export chart data as CSV (placeholder)
    console.log('Export chart data');
  }
</script>

<div class="chart-toolbar">
  <div class="tf-selector">
    <label for="tf-select">Timeframe:</label>
    <select
      id="tf-select"
      value={tf}
      onchange={(e) => handleTfChange((e.target as HTMLSelectElement).value)}
      class="tf-dropdown"
    >
      {#each TIMEFRAMES as t}
        <option value={t}>{t}</option>
      {/each}
    </select>
  </div>

  <div class="toolbar-spacer"></div>

  {#if showExport}
    <button class="export-btn" onclick={handleExport} title="Export chart data">
      📊
    </button>
  {/if}
</div>

<style>
  .chart-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: rgba(19, 23, 34, 0.8);
    border-bottom: 1px solid rgba(42, 46, 57, 0.9);
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
  }

  .tf-selector {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  label {
    color: rgba(177, 181, 189, 0.7);
    user-select: none;
  }

  .tf-dropdown {
    background: rgba(42, 46, 57, 0.6);
    color: rgba(177, 181, 189, 0.85);
    border: 1px solid rgba(100, 150, 200, 0.3);
    border-radius: 4px;
    padding: 4px 8px;
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .tf-dropdown:hover {
    border-color: rgba(100, 150, 200, 0.6);
  }

  .tf-dropdown:focus {
    outline: none;
    border-color: rgba(100, 200, 255, 0.8);
  }

  .toolbar-spacer {
    flex: 1;
  }

  .export-btn {
    background: none;
    border: none;
    color: rgba(177, 181, 189, 0.7);
    cursor: pointer;
    padding: 4px 8px;
    font-size: 14px;
    transition: color 0.2s;
  }

  .export-btn:hover {
    color: rgba(177, 181, 189, 0.95);
  }
</style>
