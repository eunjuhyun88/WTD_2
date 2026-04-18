<script lang="ts">
  /**
   * VerdictInboxSection — flywheel axis 3 product surface.
   *
   * Shows outcome_ready captures and lets the founder label each one
   * valid / missed / invalid so the ML refinement loop has ground truth.
   *
   * Data: GET /api/engine/captures/outcomes?status=outcome_ready
   * Mutate: POST /api/engine/captures/{id}/verdict  { verdict }
   */
  import { onMount } from 'svelte';

  // ── Types ──────────────────────────────────────────────────────────────────

  interface CaptureRow {
    capture_id: string;
    symbol: string;
    pattern_slug: string;
    phase: string;
    timeframe: string;
    captured_at_ms: number;
    status: string;
  }

  interface OutcomeRow {
    id: string;
    resolution: string | null;   // "win" | "loss" | null
    fwd_peak_pct: number | null;
    realistic_pct: number | null;
    eval_window_bars: number | null;
    entry_price: number | null;
    peak_price: number | null;
  }

  interface InboxItem {
    capture: CaptureRow;
    outcome: OutcomeRow | null;
  }

  type VerdictLabel = 'valid' | 'invalid' | 'missed';

  // ── State ──────────────────────────────────────────────────────────────────

  let items: InboxItem[] = [];
  let loading = true;
  let error = '';
  let submitting: Set<string> = new Set();

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onMount(load);

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/engine/captures/outcomes?status=outcome_ready&limit=100');
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      items = (data.items ?? []) as InboxItem[];
    } catch (e) {
      error = `Failed to load inbox: ${e}`;
    } finally {
      loading = false;
    }
  }

  async function submitVerdict(captureId: string, verdict: VerdictLabel) {
    submitting = new Set([...submitting, captureId]);
    try {
      const res = await fetch(`/api/engine/captures/${captureId}/verdict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `${res.status}`);
      }
      // Optimistic remove from inbox
      items = items.filter((i) => i.capture.capture_id !== captureId);
    } catch (e) {
      error = `Verdict failed: ${e}`;
    } finally {
      submitting = new Set([...submitting].filter((id) => id !== captureId));
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function formatPct(v: number | null): string {
    if (v == null) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}%`;
  }

  function resolutionClass(r: string | null): string {
    if (r === 'win') return 'win';
    if (r === 'loss') return 'loss';
    return '';
  }
</script>

<!-- ── Template ─────────────────────────────────────────────────────────── -->

<section class="surface-card verdict-inbox">
  <div class="surface-section-head">
    <div>
      <h2>
        Verdict Inbox
        {#if !loading && items.length > 0}
          <span class="inbox-badge">{items.length}</span>
        {/if}
      </h2>
      <p class="surface-caption">
        Resolved captures awaiting founder verdict — label each outcome to close flywheel axis 3.
      </p>
    </div>
    <button class="surface-button-ghost" onclick={load} disabled={loading}>
      {loading ? '…' : 'Refresh'}
    </button>
  </div>

  {#if loading}
    <div class="inbox-empty">
      <span class="pulse"></span>
      Loading…
    </div>
  {:else if error}
    <div class="inbox-empty inbox-error">{error}</div>
  {:else if items.length === 0}
    <div class="inbox-empty">
      No pending captures — check back after the outcome resolver runs.
    </div>
  {:else}
    <div class="inbox-list">
      {#each items as { capture, outcome } (capture.capture_id)}
        {@const busy = submitting.has(capture.capture_id)}
        <div class="inbox-card" class:busy>
          <!-- Header row -->
          <div class="card-head">
            <span class="card-sym">{capture.symbol}</span>
            <span class="card-phase">{capture.phase || capture.pattern_slug}</span>
            <span class="card-time">{formatDate(capture.captured_at_ms)}</span>
          </div>

          <!-- Outcome row -->
          {#if outcome}
            <div class="card-outcome">
              <span class="outcome-res {resolutionClass(outcome.resolution)}">
                {outcome.resolution ?? 'pending'}
              </span>
              <span class="outcome-stat">
                peak {formatPct(outcome.fwd_peak_pct)}
              </span>
              <span class="outcome-stat">
                realistic {formatPct(outcome.realistic_pct)}
              </span>
              {#if outcome.eval_window_bars}
                <span class="outcome-stat">{outcome.eval_window_bars}bar window</span>
              {/if}
            </div>
          {:else}
            <div class="card-outcome muted">outcome not loaded</div>
          {/if}

          <!-- Action row -->
          <div class="card-actions">
            <button
              class="verdict-btn valid"
              onclick={() => submitVerdict(capture.capture_id, 'valid')}
              disabled={busy}
            >
              Valid
            </button>
            <button
              class="verdict-btn missed"
              onclick={() => submitVerdict(capture.capture_id, 'missed')}
              disabled={busy}
            >
              Missed
            </button>
            <button
              class="verdict-btn invalid"
              onclick={() => submitVerdict(capture.capture_id, 'invalid')}
              disabled={busy}
            >
              Invalid
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<!-- ── Styles ────────────────────────────────────────────────────────────── -->

<style>
  .verdict-inbox {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .inbox-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: rgba(251, 191, 36, 0.18);
    color: #fbbf24;
    font-size: 11px;
    font-weight: 700;
    font-family: var(--sc-font-mono, monospace);
    vertical-align: middle;
    margin-left: 8px;
  }

  .inbox-empty {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: center;
    padding: 40px 24px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    color: rgba(255,255,255,0.35);
    text-align: center;
  }
  .inbox-error { color: #f87171; }

  .pulse {
    width: 6px; height: 6px; border-radius: 50%;
    background: rgba(255,255,255,0.3);
    animation: pulse 1.4s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes pulse { 0%,100%{opacity:.2} 50%{opacity:1} }

  .inbox-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 10px;
  }

  .inbox-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 8px;
    transition: opacity 0.2s;
  }
  .inbox-card.busy { opacity: 0.5; pointer-events: none; }

  .card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .card-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 14px;
    font-weight: 700;
    color: #fff;
  }
  .card-phase {
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255,255,255,0.4);
    padding: 2px 6px;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 4px;
  }
  .card-time {
    margin-left: auto;
    font-family: var(--sc-font-mono, monospace);
    font-size: 10px;
    color: rgba(255,255,255,0.25);
  }

  .card-outcome {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
  }
  .card-outcome.muted { color: rgba(255,255,255,0.2); }
  .outcome-res { font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.06em; }
  .outcome-res.win  { color: #26a69a; }
  .outcome-res.loss { color: #ef5350; }
  .outcome-stat { color: rgba(255,255,255,0.35); }

  .card-actions {
    display: flex;
    gap: 6px;
    margin-top: 2px;
  }

  .verdict-btn {
    flex: 1;
    padding: 6px 0;
    border-radius: 5px;
    font-family: var(--sc-font-mono, monospace);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    background: transparent;
    border: 1px solid;
    transition: background 0.15s, opacity 0.15s;
  }
  .verdict-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .verdict-btn.valid {
    color: #26a69a;
    border-color: rgba(38,166,154,0.3);
  }
  .verdict-btn.valid:hover:not(:disabled) {
    background: rgba(38,166,154,0.12);
  }

  .verdict-btn.missed {
    color: #fbbf24;
    border-color: rgba(251,191,36,0.3);
  }
  .verdict-btn.missed:hover:not(:disabled) {
    background: rgba(251,191,36,0.10);
  }

  .verdict-btn.invalid {
    color: #ef5350;
    border-color: rgba(239,83,80,0.25);
  }
  .verdict-btn.invalid:hover:not(:disabled) {
    background: rgba(239,83,80,0.10);
  }
</style>
