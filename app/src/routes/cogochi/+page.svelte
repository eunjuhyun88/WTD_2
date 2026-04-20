<script lang="ts">
  import AppShell from '$lib/cogochi/AppShell.svelte';
</script>

<svelte:head>
  <title>Cogochi · Core Loop</title>
</svelte:head>

<AppShell />

<style>
  /* ── Core Loop terminal palette — dark blue-gray ── */
  :global(:root) {
    --g0: #050608;
    --g1: #0a0c10;
    --g2: #10131a;
    --g3: #181c24;
    --g4: #242932;
    --g5: #3a4150;
    --g6: #6a7280;
    --g7: #9ba2ac;
    --g8: #c8ccd2;
    --g9: #e8eaec;

    --pos:    #34c470;
    --pos-d:  #0d3e22;
    --pos-dd: #04110a;

    --neg:    #e85555;
    --neg-d:  #4a1818;
    --neg-dd: #130606;

    --amb:    #d4a442;
    --amb-d:  #3a2d10;
    --amb-dd: #110c04;

    --bw: 0.5px;
  }

  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(html, body) {
    background: var(--g0);
    color: var(--g9);
    font-family: 'Geist', sans-serif;
    font-size: 11px;
    min-height: 100vh;
    line-height: 1.5;
  }

  :global(.mono) {
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
  }

  :global(button) {
    font-family: inherit;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0;
  }

  :global(input, textarea) {
    font-family: inherit;
    background: none;
    border: none;
    color: inherit;
    outline: none;
  }

  :global(::-webkit-scrollbar) {
    width: 4px;
    height: 4px;
  }

  :global(::-webkit-scrollbar-thumb) {
    background: var(--g4);
    border-radius: 2px;
  }

  :global(::-webkit-scrollbar-thumb:hover) {
    background: var(--g5);
  }

  :global(::-webkit-scrollbar-track) {
    background: transparent;
  }

  :global(::selection) {
    background: var(--pos-d);
    color: var(--g9);
  }
</style>
