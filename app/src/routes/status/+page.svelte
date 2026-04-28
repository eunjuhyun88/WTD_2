<script lang="ts">
  import { onMount } from 'svelte';

  let engineStatus: 'checking' | 'ok' | 'degraded' | 'fail' | 'error' = 'checking';
  let appStatus: 'checking' | 'ok' | 'error' = 'checking';
  let enginePayload: Record<string, unknown> | null = null;
  let checkedAt: string | null = null;

  async function checkStatus() {
    engineStatus = 'checking';
    appStatus = 'checking';
    checkedAt = null;

    // App check — if we can load this page, app is ok
    appStatus = 'ok';

    // Engine check via patterns/states proxy
    try {
      const res = await fetch('/api/patterns/states');
      if (res.ok) {
        engineStatus = 'ok';
      } else {
        engineStatus = res.status >= 500 ? 'fail' : 'degraded';
      }
    } catch {
      engineStatus = 'error';
    }

    checkedAt = new Date().toLocaleTimeString();
  }

  onMount(() => {
    checkStatus();
  });

  const COLOR: Record<string, string> = {
    ok: '#4ade80',
    degraded: '#facc15',
    fail: '#f87171',
    error: '#f87171',
    checking: '#a1a1aa',
  };
</script>

<svelte:head>
  <title>System Status — wtd</title>
</svelte:head>

<main>
  <h1>System Status</h1>

  <div class="status-grid">
    <div class="status-row">
      <span class="dot" style="background:{COLOR[appStatus]}"></span>
      <span class="label">App</span>
      <span class="value">{appStatus}</span>
    </div>
    <div class="status-row">
      <span class="dot" style="background:{COLOR[engineStatus]}"></span>
      <span class="label">Pattern Engine</span>
      <span class="value">{engineStatus}</span>
    </div>
  </div>

  {#if checkedAt}
    <p class="checked-at">Last checked: {checkedAt}</p>
  {/if}

  <button on:click={checkStatus}>Refresh</button>
</main>

<style>
  main {
    max-width: 480px;
    margin: 80px auto;
    padding: 0 24px;
    font-family: monospace;
    color: #f0f0f0;
  }
  h1 {
    font-size: 1.4rem;
    margin-bottom: 32px;
    letter-spacing: 0.05em;
  }
  .status-grid {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 24px;
  }
  .status-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .label {
    flex: 1;
    opacity: 0.7;
  }
  .value {
    text-transform: uppercase;
    font-size: 0.85rem;
    letter-spacing: 0.08em;
  }
  .checked-at {
    font-size: 0.75rem;
    opacity: 0.4;
    margin-bottom: 16px;
  }
  button {
    background: transparent;
    border: 1px solid rgba(255,255,255,0.2);
    color: #f0f0f0;
    padding: 8px 20px;
    cursor: pointer;
    font-family: monospace;
    font-size: 0.85rem;
    letter-spacing: 0.05em;
  }
  button:hover {
    border-color: rgba(255,255,255,0.5);
  }
</style>
