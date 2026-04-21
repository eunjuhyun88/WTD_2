<script lang="ts">
  /**
   * VerdictInboxPanel — Flywheel Axis 3
   *
   * Shows resolved captures (outcome_ready) awaiting user verdict.
   * User labels each as valid / invalid / missed to close the feedback loop.
   */

  interface OutcomeItem {
    capture: {
      capture_id: string;
      symbol: string;
      pattern_slug: string;
      phase: string;
      timeframe: string;
      captured_at_ms: number;
      user_note: string | null;
    };
    outcome: {
      outcome: string | null;        // 'target_hit' | 'stop_hit' | 'expired' | null
      entry_price: number | null;
      exit_return_pct: number | null;
      user_verdict: string | null;
    } | null;
  }

  interface Props {
    userId?: string;
    onVerdictSubmit?: (captureId: string, verdict: string) => void;
  }

  let { userId, onVerdictSubmit }: Props = $props();

  let items = $state<OutcomeItem[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let submitting = $state<Record<string, boolean>>({});
  let dismissed = $state<Set<string>>(new Set());

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/captures/outcomes?limit=50');
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as { items: OutcomeItem[] };
      items = (data.items ?? []).filter(i => !dismissed.has(i.capture.capture_id));
    } catch (e) {
      error = 'Failed to load verdict inbox';
    } finally {
      loading = false;
    }
  }

  async function submitVerdict(captureId: string, verdict: 'valid' | 'invalid' | 'missed') {
    submitting = { ...submitting, [captureId]: true };
    try {
      const res = await fetch(`/api/captures/${captureId}/verdict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ verdict }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      dismissed = new Set([...dismissed, captureId]);
      items = items.filter(i => i.capture.capture_id !== captureId);
      onVerdictSubmit?.(captureId, verdict);
    } catch {
      // keep item visible on error
    } finally {
      const { [captureId]: _, ...rest } = submitting;
      submitting = rest;
    }
  }

  function formatPnl(pct: number | null): string {
    if (pct == null) return '—';
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${(pct * 100).toFixed(1)}%`;
  }

  function pnlClass(pct: number | null): string {
    if (pct == null) return 'pnl-neutral';
    return pct > 0 ? 'pnl-pos' : pct < 0 ? 'pnl-neg' : 'pnl-neutral';
  }

  function outcomeLabel(o: string | null): string {
    if (o === 'target_hit') return '🎯 TP';
    if (o === 'stop_hit')   return '🛑 SL';
    if (o === 'expired')    return '⏱ EXP';
    return '?';
  }

  function timeAgo(ms: number): string {
    const diff = Date.now() - ms;
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return `${Math.floor(diff / 60_000)}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  $effect(() => { load(); });
</script>

<div class="verdict-inbox">
  <div class="inbox-header">
    <span class="inbox-title">REVIEW INBOX</span>
    <span class="inbox-count">{items.length} pending</span>
    <button class="reload-btn" onclick={load} disabled={loading} title="Reload">↺</button>
  </div>

  {#if loading}
    <div class="inbox-empty">Loading…</div>
  {:else if error}
    <div class="inbox-empty inbox-error">{error}</div>
  {:else if items.length === 0}
    <div class="inbox-empty">
      <span class="empty-icon">✓</span>
      <span>Inbox clear — no resolved captures yet</span>
    </div>
  {:else}
    <div class="inbox-list">
      {#each items as item (item.capture.capture_id)}
        {@const cap = item.capture}
        {@const out = item.outcome}
        {@const busy = !!submitting[cap.capture_id]}
        <div class="inbox-card" class:busy>
          <div class="card-top">
            <span class="card-sym">{cap.symbol.replace('USDT', '')}</span>
            <span class="card-pattern">{cap.pattern_slug || 'manual'}</span>
            <span class="card-phase phase-{cap.phase.toLowerCase()}">{cap.phase}</span>
            <span class="card-tf">{cap.timeframe.toUpperCase()}</span>
            <span class="card-age">{timeAgo(cap.captured_at_ms)}</span>
          </div>

          <div class="card-outcome">
            <span class="outcome-label">{outcomeLabel(out?.outcome ?? null)}</span>
            {#if out?.entry_price}
              <span class="card-entry">@ ${out.entry_price.toFixed(2)}</span>
            {/if}
            <span class="card-pnl {pnlClass(out?.exit_return_pct ?? null)}">
              {formatPnl(out?.exit_return_pct ?? null)}
            </span>
          </div>

          {#if cap.user_note}
            <div class="card-note">{cap.user_note}</div>
          {/if}

          <div class="card-actions">
            <button
              class="verdict-btn verdict-valid"
              onclick={() => submitVerdict(cap.capture_id, 'valid')}
              disabled={busy}
              title="Setup was correct"
            >✓ Valid</button>
            <button
              class="verdict-btn verdict-invalid"
              onclick={() => submitVerdict(cap.capture_id, 'invalid')}
              disabled={busy}
              title="Setup was wrong"
            >✗ Invalid</button>
            <button
              class="verdict-btn verdict-missed"
              onclick={() => submitVerdict(cap.capture_id, 'missed')}
              disabled={busy}
              title="Missed the entry"
            >~ Missed</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .verdict-inbox {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--sc-bg-0, #0b0e14);
    overflow: hidden;
  }

  .inbox-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    flex-shrink: 0;
  }
  .inbox-title {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(247,242,234,0.7);
  }
  .inbox-count {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(99,179,237,0.15);
    color: rgba(131,188,255,0.9);
  }
  .reload-btn {
    margin-left: auto;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.1);
    color: rgba(247,242,234,0.5);
    border-radius: 3px;
    width: 20px; height: 20px;
    font-size: 12px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .reload-btn:hover { color: rgba(247,242,234,1); }

  .inbox-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex: 1;
    font-size: 11px;
    color: rgba(247,242,234,0.35);
    padding: 24px;
    text-align: center;
  }
  .empty-icon { font-size: 18px; opacity: 0.4; }
  .inbox-error { color: rgba(242,54,69,0.7); }

  .inbox-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .inbox-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 4px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    transition: opacity 0.2s;
  }
  .inbox-card.busy { opacity: 0.5; pointer-events: none; }

  .card-top {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .card-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    color: rgba(247,242,234,1);
  }
  .card-pattern {
    font-size: 10px;
    color: rgba(247,242,234,0.45);
    font-family: var(--sc-font-mono, monospace);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-phase {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(255,255,255,0.06);
    color: rgba(247,242,234,0.7);
  }
  .card-phase.phase-accumulation { color: #22AB94; background: rgba(34,171,148,0.12); }
  .card-phase.phase-real_dump    { color: #F23645; background: rgba(242,54,69,0.12); }
  .card-phase.phase-breakout     { color: #4B9EFD; background: rgba(75,158,253,0.12); }

  .card-tf {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(247,242,234,0.4);
  }
  .card-age {
    font-size: 9px;
    color: rgba(247,242,234,0.3);
    margin-left: auto;
  }

  .card-outcome {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .outcome-label {
    font-size: 11px;
    min-width: 40px;
  }
  .card-entry {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(247,242,234,0.5);
  }
  .card-pnl {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    margin-left: auto;
  }
  .pnl-pos { color: #22AB94; }
  .pnl-neg { color: #F23645; }
  .pnl-neutral { color: rgba(247,242,234,0.4); }

  .card-note {
    font-size: 10px;
    color: rgba(247,242,234,0.4);
    font-style: italic;
    border-left: 2px solid rgba(255,255,255,0.1);
    padding-left: 6px;
  }

  .card-actions {
    display: flex;
    gap: 5px;
    margin-top: 2px;
  }
  .verdict-btn {
    flex: 1;
    padding: 4px 0;
    border-radius: 3px;
    border: 1px solid transparent;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .verdict-valid {
    background: rgba(34,171,148,0.1);
    border-color: rgba(34,171,148,0.25);
    color: #22AB94;
  }
  .verdict-valid:hover { background: rgba(34,171,148,0.2); }

  .verdict-invalid {
    background: rgba(242,54,69,0.1);
    border-color: rgba(242,54,69,0.25);
    color: #F23645;
  }
  .verdict-invalid:hover { background: rgba(242,54,69,0.2); }

  .verdict-missed {
    background: rgba(239,192,80,0.1);
    border-color: rgba(239,192,80,0.25);
    color: #EFC050;
  }
  .verdict-missed:hover { background: rgba(239,192,80,0.2); }

  .verdict-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
