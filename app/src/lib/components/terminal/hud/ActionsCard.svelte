<script lang="ts">
  import type { HudActions } from '$lib/components/terminal/hud/types';

  export let data: HudActions;

  let watchLoading = false;
  let watchError = '';
  let watchDone = false;

  async function handleWatch() {
    if (watchLoading || watchDone) return;
    watchLoading = true;
    watchError = '';
    try {
      const res = await fetch(`/api/captures/${data.capture_id}/watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      watchDone = true;
    } catch (e) {
      watchError = `Watch failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      watchLoading = false;
    }
  }

  function handleCapture() {
    // TODO(W-0237): Wire to POST /api/captures with current symbol + pattern context
    console.warn('Capture action not yet wired — TODO(W-0237)');
  }

  function handleVerdict() {
    // TODO(W-0237): Wire to POST /api/captures/{id}/verdict or open verdict dialog
    console.warn('Verdict action not yet wired — TODO(W-0237)');
  }
</script>

<div class="hud-card actions-card">
  <div class="card-label">ACTIONS</div>

  {#if watchError}
    <div class="action-error">{watchError}</div>
  {/if}

  <div class="actions-row">
    <button
      class="action-btn capture-btn"
      disabled={!data.can_capture}
      onclick={handleCapture}
    >
      Capture
    </button>

    <button
      class="action-btn watch-btn"
      disabled={!data.can_watch || watchLoading || watchDone}
      onclick={handleWatch}
    >
      {#if watchLoading}
        …
      {:else if watchDone}
        Watching ✓
      {:else}
        Watch
      {/if}
    </button>

    <button
      class="action-btn verdict-btn"
      disabled={!data.can_verdict}
      onclick={handleVerdict}
    >
      Verdict
    </button>
  </div>

  <div class="capture-ref">
    <span class="ref-label">capture</span>
    <span class="ref-id">{data.capture_id.slice(0, 12)}…</span>
  </div>
</div>

<style>
  .hud-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 8px;
  }

  .card-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.25);
    text-transform: uppercase;
  }

  .action-error {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: #ef5350;
    padding: 4px 0;
  }

  .actions-row {
    display: flex;
    gap: 6px;
  }

  .action-btn {
    flex: 1;
    padding: 8px 4px;
    border-radius: 6px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    border: 1px solid;
    background: transparent;
    transition: background 0.15s, opacity 0.15s;
  }
  .action-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .capture-btn {
    color: #60a5fa;
    border-color: rgba(96,165,250,0.3);
  }
  .capture-btn:hover:not(:disabled) {
    background: rgba(96,165,250,0.1);
  }

  .watch-btn {
    color: #fbbf24;
    border-color: rgba(251,191,36,0.3);
  }
  .watch-btn:hover:not(:disabled) {
    background: rgba(251,191,36,0.1);
  }

  .verdict-btn {
    color: #26a69a;
    border-color: rgba(38,166,154,0.3);
  }
  .verdict-btn:hover:not(:disabled) {
    background: rgba(38,166,154,0.1);
  }

  .capture-ref {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid rgba(255,255,255,0.05);
    margin-top: 2px;
  }

  .ref-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(255,255,255,0.2);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .ref-id {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(255,255,255,0.25);
  }
</style>
