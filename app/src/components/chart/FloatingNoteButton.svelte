<script lang="ts">
  import { chartNotesStore } from '$lib/stores/chartNotesStore.svelte';
  import NotePanel from './NotePanel.svelte';

  interface Props {
    symbol: string;
    timeframe: string;
    getCapturePrice: () => number;
    getLastClosedBarTime: () => number;
  }
  let { symbol, timeframe, getCapturePrice, getLastClosedBarTime }: Props = $props();

  let capturedPrice   = $state(0);
  let capturedBarTime = $state(0);

  function handleOpen() {
    // Snapshot price + bar_time at click moment
    capturedPrice   = getCapturePrice();
    capturedBarTime = getLastClosedBarTime();
    chartNotesStore.openCreate();
  }
</script>

<div class="fnb-root">
  {#if chartNotesStore.panelOpen}
    <NotePanel
      {symbol}
      {timeframe}
      capturePrice={capturedPrice}
      captureBarTime={capturedBarTime}
    />
  {/if}

  <button
    class="fnb-btn"
    class:active={chartNotesStore.panelOpen}
    onclick={handleOpen}
    title="Write note"
    aria-label="Write chart note"
  >
    ✏️
    {#if chartNotesStore.noteCount > 0}
      <span class="fnb-badge">{chartNotesStore.noteCount}</span>
    {/if}
  </button>
</div>

<style>
  .fnb-root {
    position: absolute;
    bottom: 12px;
    right: 12px;
    z-index: 150;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }
  .fnb-btn {
    width: 36px; height: 36px; border-radius: 50%;
    background: rgba(30,41,59,.9); border: 1px solid #334155;
    color: #94a3b8; font-size: 1rem; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    position: relative; transition: all .15s;
    backdrop-filter: blur(4px);
  }
  .fnb-btn:hover  { background: rgba(37,99,235,.25); border-color: #60a5fa; color: #e2e8f0; }
  .fnb-btn.active { background: rgba(37,99,235,.35); border-color: #60a5fa; }
  .fnb-badge {
    position: absolute; top: -4px; right: -4px;
    background: #2563eb; color: #fff;
    font-size: .6rem; font-weight: 700;
    min-width: 16px; height: 16px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    padding: 0 3px;
  }
</style>
