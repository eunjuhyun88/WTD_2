<script lang="ts">
  import AppShell from '$lib/cogochi/AppShell.svelte';
</script>

<svelte:head>
  <title>Cogochi · Core Loop</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
</svelte:head>

<AppShell />

<style>
  /* ── Core Loop terminal palette — warm neutral dark ── */
  :global(:root) {
    --g0: #060504;
    --g1: #0c0a09;
    --g2: #131110;
    --g3: #1c1918;
    --g4: #272320;
    --g5: #3d3830;
    --g6: #706a62;
    --g7: #a8a09a;
    --g8: #cec9c4;
    --g9: #eceae8;

    --brand:    #ff7f85;
    --brand-d:  #3a1618;
    --brand-dd: #120507;

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
