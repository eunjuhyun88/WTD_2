<script lang="ts">
  import { onMount } from 'svelte';

  type JobEntry = { id: string; name: string; next_run: string | null; pending: boolean };
  type AgentStatus = {
    ok: boolean;
    scheduler?: { running: boolean; next_universe_scan: string | null; job_count: number; jobs: JobEntry[] };
    pattern_engine?: { loaded_machines: number; replayed_symbols: number };
    flywheel?: Record<string, unknown>;
    ts?: string;
  };

  let engineStatus: 'checking' | 'ok' | 'degraded' | 'fail' | 'error' = 'checking';
  let appStatus: 'checking' | 'ok' | 'error' = 'checking';
  let agentStatus: AgentStatus | null = null;
  let checkedAt: string | null = null;

  async function checkStatus() {
    engineStatus = 'checking';
    appStatus = 'checking';
    agentStatus = null;
    checkedAt = null;

    appStatus = 'ok';

    const [patternsRes, agentRes] = await Promise.allSettled([
      fetch('/api/patterns/states'),
      fetch('/api/observability/agent-status'),
    ]);

    if (patternsRes.status === 'fulfilled' && patternsRes.value.ok) {
      engineStatus = 'ok';
    } else if (patternsRes.status === 'fulfilled') {
      engineStatus = patternsRes.value.status >= 500 ? 'fail' : 'degraded';
    } else {
      engineStatus = 'error';
    }

    if (agentRes.status === 'fulfilled' && agentRes.value.ok) {
      agentStatus = await agentRes.value.json();
    }

    checkedAt = new Date().toLocaleTimeString();
  }

  onMount(() => { checkStatus(); });

  const COLOR: Record<string, string> = {
    ok: '#4ade80', degraded: '#facc15', fail: '#f87171',
    error: '#f87171', checking: '#a1a1aa',
  };

  function fmtNext(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString();
  }
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
    {#if agentStatus?.scheduler}
      <div class="status-row">
        <span class="dot" style="background:{agentStatus.scheduler.running ? COLOR.ok : COLOR.fail}"></span>
        <span class="label">Scheduler</span>
        <span class="value">{agentStatus.scheduler.running ? 'running' : 'stopped'} · {agentStatus.scheduler.job_count} jobs</span>
      </div>
    {/if}
  </div>

  {#if agentStatus?.scheduler?.jobs?.length}
    <section class="jobs">
      <h2>Scheduler Jobs</h2>
      <table>
        <thead><tr><th>Job</th><th>Next Run</th><th>Pending</th></tr></thead>
        <tbody>
          {#each agentStatus.scheduler.jobs as job}
            <tr>
              <td>{job.id}</td>
              <td>{fmtNext(job.next_run)}</td>
              <td>{job.pending ? '⏳' : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  {#if agentStatus?.pattern_engine}
    <section class="jobs">
      <h2>Pattern Engine</h2>
      <div class="kv-row"><span>Loaded machines</span><span>{agentStatus.pattern_engine.loaded_machines}</span></div>
      <div class="kv-row"><span>Replayed symbols</span><span>{agentStatus.pattern_engine.replayed_symbols}</span></div>
    </section>
  {/if}

  {#if checkedAt}
    <p class="checked-at">Last checked: {checkedAt}</p>
  {/if}

  <button on:click={checkStatus}>Refresh</button>
</main>

<style>
  main {
    max-width: 600px;
    margin: 80px auto;
    padding: 0 24px;
    font-family: monospace;
    color: #f0f0f0;
  }
  h1 { font-size: 1.4rem; margin-bottom: 32px; letter-spacing: 0.05em; }
  h2 { font-size: 0.85rem; opacity: 0.5; text-transform: uppercase; letter-spacing: 0.1em; margin: 24px 0 10px; }
  .status-grid { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
  .status-row { display: flex; align-items: center; gap: 12px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .label { flex: 1; opacity: 0.7; }
  .value { text-transform: uppercase; font-size: 0.85rem; letter-spacing: 0.08em; }
  .jobs table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .jobs th { text-align: left; opacity: 0.4; padding: 4px 8px 4px 0; font-weight: normal; }
  .jobs td { padding: 4px 8px 4px 0; opacity: 0.85; }
  .jobs tr:hover td { opacity: 1; }
  .kv-row { display: flex; justify-content: space-between; font-size: 0.85rem; padding: 4px 0; opacity: 0.8; }
  .checked-at { font-size: 0.75rem; opacity: 0.4; margin: 20px 0 16px; }
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
  button:hover { border-color: rgba(255,255,255,0.5); }
</style>
