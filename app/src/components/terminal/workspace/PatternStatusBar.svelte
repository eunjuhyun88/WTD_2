<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // Poll /api/patterns every 60 seconds
  let entrySymbols = $state<Array<{symbol: string, slug: string, phase: string}>>([]);
  let loading = $state(true);
  let interval: ReturnType<typeof setInterval> | null = null;

  async function fetchPatterns() {
    try {
      const res = await fetch('/api/patterns');
      if (!res.ok) return;
      const data = await res.json();
      // Flatten entry_candidates into symbol list
      const flat: Array<{symbol: string, slug: string, phase: string}> = [];
      for (const [slug, symbols] of Object.entries(data.entry_candidates ?? {})) {
        for (const sym of (symbols as string[])) {
          flat.push({ symbol: sym, slug, phase: 'ACCUMULATION' });
        }
      }
      entrySymbols = flat;
    } catch {
      // silent
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchPatterns();
    interval = setInterval(fetchPatterns, 60_000);
  });

  onDestroy(() => { if (interval) clearInterval(interval); });
</script>

{#if entrySymbols.length > 0}
<div class="pattern-bar">
  <span class="bar-label">ENTRY SIGNALS</span>
  {#each entrySymbols as item}
    <div class="signal-pill">
      <span class="sig-dot"></span>
      <span class="sig-sym">{item.symbol.replace('USDT', '')}</span>
      <span class="sig-phase">{item.phase}</span>
    </div>
  {/each}
</div>
{/if}

<style>
  .pattern-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    background: rgba(74, 222, 128, 0.05);
    border-bottom: 1px solid rgba(74, 222, 128, 0.15);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .bar-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    color: rgba(74, 222, 128, 0.6);
    letter-spacing: 0.1em;
    white-space: nowrap;
    margin-right: 4px;
  }

  .signal-pill {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    background: rgba(74, 222, 128, 0.08);
    border: 1px solid rgba(74, 222, 128, 0.2);
    border-radius: 3px;
    white-space: nowrap;
    cursor: pointer;
  }

  .signal-pill:hover {
    background: rgba(74, 222, 128, 0.15);
  }

  .sig-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #4ade80;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }

  .sig-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    color: #4ade80;
  }

  .sig-phase {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(74, 222, 128, 0.5);
  }
</style>
