<script lang="ts">
  import type { LiveSignal } from '$lib/terminal/terminalDataOrchestrator';
  import { postLiveSignalVerdict } from '$lib/terminal/terminalDataOrchestrator';

  export let signals: LiveSignal[] = [];
  export let cached: boolean = false;
  export let scannedAt: string = '';

  type Verdict = 'valid' | 'invalid' | 'late' | 'noisy';

  const VERDICT_LABELS: Record<Verdict, string> = {
    valid: '✓ valid',
    invalid: '✗ invalid',
    late: '⏰ late',
    noisy: '~ noisy',
  };

  // track submitted verdicts per signal to disable buttons after submission
  let submitted: Record<string, Verdict> = {};
  let pending: Record<string, boolean> = {};

  const accumulation = signals.filter(s => s.phase === 'ACCUMULATION');
  const watching = signals.filter(s => s.phase === 'REAL_DUMP');

  async function submitVerdict(signal: LiveSignal, verdict: Verdict) {
    const key = `${signal.symbol}_${signal.scanned_at}`;
    if (submitted[key] || pending[key]) return;
    pending = { ...pending, [key]: true };
    const ok = await postLiveSignalVerdict(signal, verdict);
    pending = { ...pending, [key]: false };
    if (ok) submitted = { ...submitted, [key]: verdict };
  }

  function fmt(pct: number | null): string {
    if (pct == null) return '—';
    return `+${pct.toFixed(1)}%`;
  }

  function relativeTime(iso: string): string {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(diff / 60_000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ago`;
    } catch {
      return '';
    }
  }
</script>

{#if accumulation.length > 0 || watching.length > 0}
<div class="live-signal-panel">
  <div class="panel-header">
    <span class="panel-title">LIVE SIGNALS</span>
    <span class="panel-meta">
      {#if cached}cached{/if}
      {#if scannedAt} · {relativeTime(scannedAt)}{/if}
    </span>
  </div>

  {#if accumulation.length > 0}
    <div class="signal-section">
      <div class="section-label accumulation">ACCUMULATION — entry candidates</div>
      {#each accumulation as signal (signal.symbol)}
        {@const key = `${signal.symbol}_${signal.scanned_at}`}
        <div class="signal-row">
          <div class="signal-info">
            <span class="symbol">{signal.symbol.replace('USDT', '')}</span>
            <span class="peak">{fmt(signal.fwd_peak_pct)}</span>
            <span class="fidelity">fid {(signal.phase_fidelity * 100).toFixed(0)}%</span>
          </div>
          <div class="verdict-buttons" class:submitted={!!submitted[key]}>
            {#if submitted[key]}
              <span class="verdict-done">{VERDICT_LABELS[submitted[key]]}</span>
            {:else}
              {#each Object.entries(VERDICT_LABELS) as [v, label]}
                <button
                  class="verdict-btn verdict-{v}"
                  disabled={!!pending[key]}
                  onclick={() => submitVerdict(signal, v as Verdict)}
                >
                  {label}
                </button>
              {/each}
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if watching.length > 0}
    <div class="signal-section">
      <div class="section-label watch">REAL_DUMP — watching</div>
      {#each watching as signal (signal.symbol)}
        <div class="signal-row watch-row">
          <span class="symbol">{signal.symbol.replace('USDT', '')}</span>
          <span class="path-label">{signal.path}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
{/if}

<style>
  .live-signal-panel {
    background: var(--sc-surface-2, #111);
    border: 1px solid var(--sc-border, #2a2a2a);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 12px;
    color: var(--sc-text-primary, #e0e0e0);
    margin-bottom: 8px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .panel-title {
    font-size: var(--ui-text-xs);
    font-weight: 600;
    letter-spacing: 0.1em;
    color: var(--sc-text-secondary, #888);
  }

  .panel-meta {
    font-size: var(--ui-text-xs);
    color: var(--sc-text-tertiary, #555);
  }

  .signal-section {
    margin-bottom: 8px;
  }

  .section-label {
    font-size: var(--ui-text-xs);
    font-weight: 600;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
    padding: 2px 6px;
    border-radius: 3px;
    display: inline-block;
  }

  .section-label.accumulation {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  .section-label.watch {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }

  .signal-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 0;
    border-bottom: 1px solid var(--sc-border, #1e1e1e);
  }

  .signal-row:last-child {
    border-bottom: none;
  }

  .signal-info {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .symbol {
    font-weight: 600;
    font-size: 13px;
    color: var(--sc-text-primary, #e0e0e0);
    min-width: 60px;
  }

  .peak {
    color: #10b981;
    font-weight: 500;
  }

  .fidelity {
    color: var(--sc-text-secondary, #888);
    font-size: 11px;
  }

  .verdict-buttons {
    display: flex;
    gap: 4px;
  }

  .verdict-btn {
    font-size: var(--ui-text-xs);
    padding: 2px 7px;
    border-radius: 3px;
    border: 1px solid var(--sc-border, #2a2a2a);
    background: transparent;
    color: var(--sc-text-secondary, #888);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .verdict-btn:hover:not(:disabled) {
    background: var(--sc-surface-3, #1e1e1e);
    color: var(--sc-text-primary, #e0e0e0);
  }

  .verdict-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .verdict-done {
    font-size: 11px;
    color: #10b981;
    font-weight: 500;
  }

  .watch-row {
    flex-direction: row;
    gap: 12px;
  }

  .path-label {
    font-size: var(--ui-text-xs);
    color: var(--sc-text-tertiary, #555);
  }
</style>
