<script lang="ts">
  import { onMount } from 'svelte';

  interface FlywheelData {
    status?: string;
    last_run?: string;
    metrics?: Record<string, unknown>;
    [key: string]: unknown;
  }

  let healthData = $state<FlywheelData | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const r = await fetch('/api/observability/flywheel');
      if (r.ok) {
        healthData = await r.json() as FlywheelData;
      } else {
        error = `HTTP ${r.status}`;
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head><title>System Health — Lab</title></svelte:head>

<div class="health-page">
  <header class="health-header">
    <h1>System Health</h1>
    <span class="health-note">Flywheel metrics and pipeline status</span>
  </header>

  <div class="health-body">
    {#if loading}
      <p class="health-state">Loading health data…</p>
    {:else if error}
      <p class="health-state health-error">Error: {error}</p>
    {:else if healthData}
      {#if healthData.status}
        <div class="health-stat">
          <span class="health-label">Status</span>
          <span class="health-value" class:pos={healthData.status === 'ok'} class:neg={healthData.status === 'error'}>
            {healthData.status}
          </span>
        </div>
      {/if}
      {#if healthData.last_run}
        <div class="health-stat">
          <span class="health-label">Last Run</span>
          <span class="health-value">{healthData.last_run}</span>
        </div>
      {/if}
      <div class="health-json-block">
        <pre class="health-json">{JSON.stringify(healthData, null, 2)}</pre>
      </div>
    {:else}
      <p class="health-state">No health data available.</p>
    {/if}
  </div>
</div>

<style>
.health-page {
  padding: 24px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--g8, #cec9c4);
  max-width: 800px;
}

.health-header {
  margin-bottom: 20px;
}

h1 {
  font-size: 16px;
  font-weight: 700;
  color: var(--g9, #eceae8);
  margin: 0 0 4px;
  letter-spacing: -0.01em;
}

.health-note {
  font-size: var(--ui-text-xs);
  color: var(--g5, #3d3830);
  letter-spacing: 0.04em;
}

.health-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.health-stat {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--g1, #0c0a09);
  border: 1px solid var(--g3, #1c1918);
  border-radius: 4px;
}

.health-label {
  font-size: var(--ui-text-xs);
  color: var(--g5, #3d3830);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  min-width: 80px;
}

.health-value {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: var(--g8, #cec9c4);
}

.health-value.pos { color: var(--pos, #22AB94); }
.health-value.neg { color: var(--neg, #F23645); }

.health-json-block {
  background: var(--g1, #0c0a09);
  border: 1px solid var(--g3, #1c1918);
  border-radius: 4px;
  padding: 16px;
  overflow-x: auto;
}

.health-json {
  font-family: inherit;
  font-size: var(--ui-text-xs);
  color: var(--g6, #6b6460);
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.health-state {
  font-size: var(--ui-text-xs);
  color: var(--g5, #3d3830);
  margin: 0;
  padding: 16px;
  background: var(--g1, #0c0a09);
  border: 1px solid var(--g3, #1c1918);
  border-radius: 4px;
}

.health-error { color: var(--neg, #F23645); }
</style>
