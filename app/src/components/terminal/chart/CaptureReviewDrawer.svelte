<script lang="ts">
  /**
   * CaptureReviewDrawer.svelte
   *
   * Slide-in right-rail drawer for reviewing a single capture annotation.
   * Shows: pattern info, price levels, block scores, outcome, verdict form.
   *
   * Props:
   *   annotation  — CaptureAnnotation | null (null → hidden)
   *   onClose     — called when user dismisses
   *   onVerdict   — called with (capture_id, verdict) after user labels
   */
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { CaptureAnnotation } from './primitives/CaptureMarkerPrimitive';

  interface Props {
    annotation: CaptureAnnotation | null;
    onClose?: () => void;
    onVerdict?: (captureId: string, verdict: 'valid' | 'invalid' | 'missed') => void;
  }
  let { annotation, onClose, onVerdict }: Props = $props();

  let verdictNote = $state('');
  let submitting  = $state(false);

  const STATUS_LABEL: Record<string, string> = {
    pending_outcome: 'Pending',
    outcome_ready:   'Needs Review',
    verdict_ready:   'Reviewed',
    closed:          'Closed',
  };

  const VERDICT_LABEL: Record<string, string> = {
    valid:   '✅ Valid',
    invalid: '❌ Invalid',
    missed:  '⚠️ Missed',
  };

  function _fmt(p: number | null): string {
    if (p == null) return '—';
    return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function _fmtPct(v: number | null): string {
    if (v == null) return '—';
    return `${Math.round(v * 100)}%`;
  }

  async function _submitVerdict(verdict: 'valid' | 'invalid' | 'missed'): Promise<void> {
    if (!annotation || submitting) return;
    submitting = true;
    try {
      const res = await fetch(`/api/captures/${annotation.capture_id}/verdict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict, user_note: verdictNote || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onVerdict?.(annotation.capture_id, verdict);
      onClose?.();
    } catch (e) {
      console.error('[CaptureReviewDrawer] verdict error', e);
    } finally {
      submitting = false;
    }
  }
</script>

{#if annotation}
  <!-- Backdrop -->
  <button
    class="backdrop"
    onclick={() => onClose?.()}
    aria-label="Close capture review"
    tabindex="0"
  />

  <aside
    class="drawer"
    role="dialog"
    aria-modal="true"
    aria-label="Capture Review"
    transition:fly={{ x: 320, duration: 240, easing: cubicOut }}
  >
    <!-- Header -->
    <div class="drawer-header">
      <div class="header-meta">
        <span class="slug">{annotation.pattern_slug}</span>
        <span class="phase-badge">{annotation.phase}</span>
      </div>
      <button class="close-btn" onclick={() => onClose?.()} aria-label="Close">✕</button>
    </div>

    <div class="drawer-body">
      <!-- Status row -->
      <div class="row-status">
        <span class="label">Status</span>
        <span class="value status-{annotation.status}">
          {STATUS_LABEL[annotation.status] ?? annotation.status}
        </span>
        {#if annotation.p_win != null}
          <span class="pwin">p_win {_fmtPct(annotation.p_win)}</span>
        {/if}
      </div>

      <!-- Price levels -->
      <section class="section">
        <h3 class="section-title">Price Levels</h3>
        <div class="price-grid">
          <div class="price-row entry">
            <span class="price-label">Entry</span>
            <span class="price-val">{_fmt(annotation.entry_price)}</span>
          </div>
          <div class="price-row stop">
            <span class="price-label">Stop</span>
            <span class="price-val">{_fmt(annotation.stop_price)}</span>
          </div>
          <div class="price-row tp1">
            <span class="price-label">TP1</span>
            <span class="price-val">{_fmt(annotation.tp1_price)}</span>
          </div>
          <div class="price-row tp2">
            <span class="price-label">TP2</span>
            <span class="price-val">{_fmt(annotation.tp2_price)}</span>
          </div>
        </div>
      </section>

      <!-- Eval window -->
      {#if annotation.eval_window_ms}
        <div class="eval-window">
          Eval window: {Math.round(annotation.eval_window_ms / 3600000)}h
        </div>
      {/if}

      <!-- Existing verdict -->
      {#if annotation.user_verdict}
        <div class="verdict-badge verdict-{annotation.user_verdict}">
          {VERDICT_LABEL[annotation.user_verdict] ?? annotation.user_verdict}
        </div>
      {/if}

      <!-- Verdict form — only for outcome_ready status -->
      {#if annotation.status === 'outcome_ready' && !annotation.user_verdict}
        <section class="section">
          <h3 class="section-title">Label This Capture</h3>
          <textarea
            class="note-input"
            placeholder="Optional note…"
            bind:value={verdictNote}
            rows="2"
          />
          <div class="verdict-buttons">
            <button
              class="verdict-btn valid"
              onclick={() => _submitVerdict('valid')}
              disabled={submitting}
            >✅ Valid</button>
            <button
              class="verdict-btn missed"
              onclick={() => _submitVerdict('missed')}
              disabled={submitting}
            >⚠️ Missed</button>
            <button
              class="verdict-btn invalid"
              onclick={() => _submitVerdict('invalid')}
              disabled={submitting}
            >❌ Invalid</button>
          </div>
        </section>
      {/if}

      <!-- Capture ID (for debugging) -->
      <div class="capture-id">ID: {annotation.capture_id.slice(0, 8)}…</div>
    </div>
  </aside>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 50;
    border: none;
    cursor: default;
  }

  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 300px;
    background: var(--sc-bg-1, #0f172a);
    border-left: 1px solid var(--sc-border-1, rgba(255,255,255,0.08));
    z-index: 51;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--sc-border-1, rgba(255,255,255,0.08));
    flex-shrink: 0;
  }

  .header-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .slug {
    font-size: 11px;
    color: var(--sc-text-2, #94a3b8);
    font-family: monospace;
  }

  .phase-badge {
    font-size: 13px;
    font-weight: 600;
    color: var(--sc-text-1, #e2e8f0);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--sc-text-2, #94a3b8);
    font-size: 16px;
    cursor: pointer;
    padding: 4px 6px;
    line-height: 1;
  }
  .close-btn:hover { color: var(--sc-text-1, #e2e8f0); }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .row-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .label { color: var(--sc-text-3, #64748b); }
  .value { font-weight: 600; }
  .value.status-pending_outcome { color: #94a3b8; }
  .value.status-outcome_ready   { color: #fbbf24; }
  .value.status-verdict_ready   { color: #22c55e; }
  .pwin {
    margin-left: auto;
    color: var(--sc-text-2, #94a3b8);
    font-family: monospace;
    font-size: 11px;
  }

  .section { display: flex; flex-direction: column; gap: 6px; }
  .section-title {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--sc-text-3, #64748b);
    margin: 0;
  }

  .price-grid { display: flex; flex-direction: column; gap: 3px; }
  .price-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    padding: 2px 0;
  }
  .price-label { color: var(--sc-text-2, #94a3b8); }
  .price-val   { font-family: monospace; color: var(--sc-text-1, #e2e8f0); }
  .price-row.entry .price-val { color: #4d8ff5; }
  .price-row.stop  .price-val { color: #ef4444; }
  .price-row.tp1   .price-val { color: #22c55e; }
  .price-row.tp2   .price-val { color: #86efac; }

  .eval-window {
    font-size: 11px;
    color: var(--sc-text-3, #64748b);
  }

  .verdict-badge {
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
  }
  .verdict-badge.verdict-valid   { background: rgba(34,197,94,0.15);  color: #22c55e; }
  .verdict-badge.verdict-invalid { background: rgba(239,68,68,0.15);  color: #ef4444; }
  .verdict-badge.verdict-missed  { background: rgba(251,191,36,0.15); color: #fbbf24; }

  .note-input {
    width: 100%;
    background: var(--sc-bg-2, #1e293b);
    border: 1px solid var(--sc-border-1, rgba(255,255,255,0.08));
    border-radius: 6px;
    color: var(--sc-text-1, #e2e8f0);
    font-size: 12px;
    padding: 6px 8px;
    resize: vertical;
    font-family: inherit;
    box-sizing: border-box;
  }
  .note-input:focus { outline: none; border-color: rgba(77,143,245,0.5); }

  .verdict-buttons {
    display: flex;
    gap: 6px;
  }
  .verdict-btn {
    flex: 1;
    padding: 6px 4px;
    border: none;
    border-radius: 6px;
    font-size: 11px;
    cursor: pointer;
    font-weight: 600;
    transition: opacity 0.15s;
  }
  .verdict-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .verdict-btn.valid   { background: rgba(34,197,94,0.20);  color: #22c55e; }
  .verdict-btn.invalid { background: rgba(239,68,68,0.20);  color: #ef4444; }
  .verdict-btn.missed  { background: rgba(251,191,36,0.20); color: #fbbf24; }
  .verdict-btn:hover:not(:disabled) { opacity: 0.85; }

  .capture-id {
    font-size: 10px;
    color: var(--sc-text-3, #64748b);
    font-family: monospace;
    margin-top: auto;
  }
</style>
