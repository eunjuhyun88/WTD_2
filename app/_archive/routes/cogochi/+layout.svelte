<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import MarketThermometer from '../../components/cogochi/MarketThermometer.svelte';

  let { children } = $props();

  const now = new Date();
  let clock = $state(formatTime(now));
  let thermoData = $state<Record<string, number | undefined>>({});

  function formatTime(d: Date): string {
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // Determine active nav from current path
  let currentPath = $derived(typeof window !== 'undefined' ? window.location.pathname : '');

  async function fetchThermometer() {
    try {
      const res = await fetch('/api/cogochi/thermometer');
      if (res.ok) thermoData = await res.json();
    } catch { /* silent */ }
  }

  $effect(() => {
    const iv = setInterval(() => { clock = formatTime(new Date()); }, 1000);
    return () => clearInterval(iv);
  });

  onMount(() => {
    fetchThermometer();
    const iv = setInterval(fetchThermometer, 60_000); // refresh every 60s
    return () => clearInterval(iv);
  });
</script>

<div class="cg-shell">
  <!-- ━━━ Top Bar ━━━ -->
  <header class="cg-topbar">
    <div class="tb-left">
      <a href="/cogochi" class="tb-brand">
        <span class="tb-logo">◈</span>
        <span class="tb-name">COGOCHI</span>
      </a>
      <span class="tb-sep">│</span>
      <nav class="tb-nav">
        <a href="/terminal" class="tb-link" class:active={currentPath.startsWith('/terminal')}>TERMINAL</a>
        <a href="/cogochi/scanner" class="tb-link" class:active={currentPath.includes('/scanner')}>SCANNER</a>
        <a href="/cogochi" class="tb-link" class:active={currentPath === '/cogochi'}>LAB</a>
      </nav>
    </div>
    <div class="tb-right">
      <span class="tb-clock">{clock}</span>
      <span class="tb-sep">│</span>
      <span class="tb-status">
        <span class="tb-dot"></span>
        LIVE
      </span>
    </div>
  </header>

  <!-- ━━━ Market Thermometer ━━━ -->
  <MarketThermometer data={thermoData} />

  <!-- ━━━ Content ━━━ -->
  <div class="cg-content">
    {@render children()}
  </div>
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');

  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  .cg-shell {
    --cg-bg: #06060b;
    --cg-surface: #0a0a11;
    --cg-surface-2: #0e0e17;
    --cg-border: #16162a;
    --cg-border-strong: #1e1e38;
    --cg-text: #c8c8e0;
    --cg-text-dim: #505078;
    --cg-text-muted: #383860;
    --cg-cyan: #00e5ff;
    --cg-red: #ff3860;
    --cg-green: #00d68f;
    --cg-orange: #ff9f43;
    --cg-purple: #a855f7;
    --cg-blue: #3b82f6;

    --font-mono: 'IBM Plex Mono', 'JetBrains Mono', monospace;
    --font-sans: 'IBM Plex Sans', -apple-system, sans-serif;

    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--cg-bg);
    color: var(--cg-text);
    font-family: var(--font-sans);
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  /* ━━━ Top Bar ━━━ */
  .cg-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 36px;
    padding: 0 12px;
    background: var(--cg-surface);
    border-bottom: 1px solid var(--cg-border);
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 11px;
    user-select: none;
  }

  .tb-left, .tb-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tb-brand {
    display: flex;
    align-items: center;
    gap: 6px;
    text-decoration: none;
    color: var(--cg-cyan);
  }

  .tb-logo {
    font-size: 14px;
    opacity: 0.9;
  }

  .tb-name {
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 2px;
  }

  .tb-sep {
    color: var(--cg-text-muted);
    font-size: 10px;
  }

  .tb-nav {
    display: flex;
    gap: 2px;
  }

  .tb-link {
    padding: 4px 10px;
    color: var(--cg-text-dim);
    text-decoration: none;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1px;
    border-radius: 3px;
    transition: all 0.12s;
  }

  .tb-link:hover {
    color: var(--cg-text);
    background: var(--cg-surface-2);
  }

  .tb-link.active {
    color: var(--cg-cyan);
    background: rgba(0, 229, 255, 0.06);
  }

  .tb-clock {
    color: var(--cg-text-dim);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.5px;
    font-variant-numeric: tabular-nums;
  }

  .tb-status {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--cg-green);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1px;
  }

  .tb-dot {
    width: 5px;
    height: 5px;
    background: var(--cg-green);
    border-radius: 50%;
    animation: pulse-dot 2s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* ━━━ Content ━━━ */
  .cg-content {
    flex: 1;
    overflow: hidden;
  }
</style>
