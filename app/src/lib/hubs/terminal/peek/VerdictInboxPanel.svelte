<script lang="ts">
  /**
   * VerdictInboxPanel — Flywheel Axis 3 (W-0345: 3-section layout)
   *
   * Section 1 — WATCH HITS: pending_outcome captures from watch-hit scanner
   * Section 2 — REVIEW: outcome_ready captures awaiting user verdict
   * Section 3 — RECENT: verdict_ready captures (last 10 closed)
   *
   * W-0397: keyboard shortcuts (1-5), 5s undo, Layer C ETA counter
   */

  import WatchToggle from '../../../shared/panels/WatchToggle.svelte';
  import AIParserModal from '../sheets/AIParserModal.svelte';

  interface OutcomeItem {
    capture: {
      capture_id: string;
      symbol: string;
      pattern_slug: string;
      phase: string;
      timeframe: string;
      captured_at_ms: number;
      user_note: string | null;
      is_watching?: boolean;
    };
    outcome: {
      outcome: string | null;
      entry_price: number | null;
      exit_return_pct: number | null;
      user_verdict: string | null;
    } | null;
  }

  interface WatchHitItem {
    capture_id: string;
    symbol: string;
    pattern_slug: string;
    phase?: string;
    timeframe: string;
    captured_at_ms: number;
    research_context?: Record<string, unknown>;
  }

  type VerdictCat = 'valid' | 'invalid' | 'near_miss' | 'too_early' | 'too_late';

  interface UndoPending {
    captureId: string;
    verdict: VerdictCat;
    label: string;
    timerId: ReturnType<typeof setTimeout>;
    expiresAt: number;
  }

  interface Props {
    userId?: string;
    onVerdictSubmit?: (captureId: string, verdict: string) => void;
  }

  let { userId, onVerdictSubmit }: Props = $props();

  // Section 2: outcome_ready
  let items = $state<OutcomeItem[]>([]);
  // Section 1: watch-hit pending_outcome (from watch-scan)
  let watchHits = $state<WatchHitItem[]>([]);
  // Section 3: verdict_ready (recently closed)
  let recentVerdicts = $state<OutcomeItem[]>([]);

  let loading = $state(false);
  let error = $state<string | null>(null);
  let submitting = $state<Record<string, boolean>>({});
  let dismissed = $state<Set<string>>(new Set());
  let parserOpen = $state(false);

  // W-0397: undo state
  let undoPending = $state<UndoPending | null>(null);
  let undoProgress = $state(100); // 0–100 countdown bar
  let undoTick: ReturnType<typeof setInterval> | null = null;

  // W-0397: Layer C ETA
  const LAYER_C_TARGET = 50;
  let layerCCount = $state<number | null>(null);

  // W-0397: consecutive same-verdict outlier detection
  let consecutiveVerdict = $state<{ cat: string; count: number }>({ cat: '', count: 0 });
  let showOutlierWarn = $state(false);

  // keyboard focus
  let panelEl = $state<HTMLDivElement | undefined>(undefined);
  let focused = $state(false);

  const VERDICT_KEYS: Record<string, VerdictCat> = {
    '1': 'valid',
    '2': 'invalid',
    '3': 'near_miss',
    '4': 'too_early',
    '5': 'too_late',
  };

  const VERDICT_LABELS: Record<VerdictCat, string> = {
    valid: '✓ Valid',
    invalid: '✗ Invalid',
    near_miss: '~ Near Miss',
    too_early: '⏫ Too Early',
    too_late: '⏰ Too Late',
  };

  async function load() {
    loading = true;
    error = null;
    try {
      const [outcomesRes, watchHitsRes, recentRes] = await Promise.all([
        fetch('/api/captures/outcomes?limit=50'),
        fetch('/api/captures/watch-hits?limit=20'),
        fetch('/api/captures/outcomes?status=verdict_ready&limit=10'),
      ]);

      if (!outcomesRes.ok) throw new Error(`${outcomesRes.status}`);
      const outcomesData = await outcomesRes.json() as { items: OutcomeItem[] };
      items = (outcomesData.items ?? []).filter(i => !dismissed.has(i.capture.capture_id));

      if (watchHitsRes.ok) {
        const wData = await watchHitsRes.json() as { items: WatchHitItem[] };
        watchHits = (wData.items ?? []).filter(w => !dismissed.has(w.capture_id));
      }

      if (recentRes.ok) {
        const rData = await recentRes.json() as { items: OutcomeItem[] };
        recentVerdicts = rData.items ?? [];
      }
    } catch (e) {
      error = 'Failed to load verdict inbox';
    } finally {
      loading = false;
    }
  }

  async function loadLayerCStatus() {
    if (!userId) return;
    try {
      const res = await fetch(`/api/users/${userId}/f60-status`);
      if (!res.ok) return;
      const data = await res.json() as { verdict_count?: number };
      if (typeof data.verdict_count === 'number') layerCCount = data.verdict_count;
    } catch {
      // non-critical, fail silently
    }
  }

  // Commit the verdict to the API (called after undo window expires)
  async function commitVerdict(captureId: string, verdict: VerdictCat) {
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
      // refresh Layer C count after submit
      void loadLayerCStatus();
    } catch {
      // restore item visibility on error
      dismissed = new Set([...dismissed].filter(id => id !== captureId));
      items = items; // trigger reactivity
    } finally {
      const { [captureId]: _, ...rest } = submitting;
      submitting = rest;
    }
  }

  function startUndoCountdown(pending: UndoPending) {
    undoProgress = 100;
    if (undoTick) clearInterval(undoTick);
    const tickMs = 50;
    const totalMs = 5000;
    undoTick = setInterval(() => {
      const remaining = pending.expiresAt - Date.now();
      undoProgress = Math.max(0, (remaining / totalMs) * 100);
      if (remaining <= 0) {
        if (undoTick) clearInterval(undoTick);
        undoTick = null;
      }
    }, tickMs);
  }

  function submitVerdict(captureId: string, verdict: VerdictCat) {
    // Cancel any existing undo for a different item (commit it immediately)
    if (undoPending && undoPending.captureId !== captureId) {
      clearTimeout(undoPending.timerId);
      if (undoTick) { clearInterval(undoTick); undoTick = null; }
      void commitVerdict(undoPending.captureId, undoPending.verdict);
      undoPending = null;
    }
    // Cancel existing undo for same item (re-verdict)
    if (undoPending && undoPending.captureId === captureId) {
      clearTimeout(undoPending.timerId);
      if (undoTick) { clearInterval(undoTick); undoTick = null; }
      undoPending = null;
    }

    // Optimistically hide item
    items = items.filter(i => i.capture.capture_id !== captureId);

    // Track outlier
    if (consecutiveVerdict.cat === verdict) {
      consecutiveVerdict = { cat: verdict, count: consecutiveVerdict.count + 1 };
    } else {
      consecutiveVerdict = { cat: verdict, count: 1 };
    }
    if (consecutiveVerdict.count >= 5) {
      showOutlierWarn = true;
      setTimeout(() => { showOutlierWarn = false; }, 4000);
    }

    const expiresAt = Date.now() + 5000;
    const timerId = setTimeout(() => {
      undoPending = null;
      if (undoTick) { clearInterval(undoTick); undoTick = null; }
      void commitVerdict(captureId, verdict);
    }, 5000);

    undoPending = { captureId, verdict, label: VERDICT_LABELS[verdict], timerId, expiresAt };
    startUndoCountdown(undoPending);
  }

  function undoVerdict() {
    if (!undoPending) return;
    clearTimeout(undoPending.timerId);
    if (undoTick) { clearInterval(undoTick); undoTick = null; }
    // Restore the item
    void load();
    undoPending = null;
    undoProgress = 100;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!focused) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Escape = undo
    if (e.key === 'Escape' && undoPending) {
      e.preventDefault();
      undoVerdict();
      return;
    }
    const verdict = VERDICT_KEYS[e.key];
    if (!verdict) return;
    const firstItem = items[0];
    if (!firstItem || submitting[firstItem.capture.capture_id]) return;
    e.preventDefault();
    submitVerdict(firstItem.capture.capture_id, verdict);
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

  $effect(() => {
    load();
    void loadLayerCStatus();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="verdict-inbox"
  bind:this={panelEl}
  tabindex="0"
  role="region"
  aria-label="Verdict Inbox"
  onfocus={() => { focused = true; }}
  onblur={() => { focused = false; }}
  onkeydown={handleKeydown}
>
  <div class="inbox-header">
    <span class="inbox-title">VERDICT INBOX</span>
    <span class="inbox-count">{watchHits.length + items.length} active</span>

    <!-- Layer C ETA counter -->
    {#if layerCCount !== null}
      <span
        class="layer-c-badge"
        class:layer-c-active={layerCCount >= LAYER_C_TARGET}
        title="Layer C LightGBM training progress"
      >
        {#if layerCCount >= LAYER_C_TARGET}
          Layer C ✓
        {:else}
          Layer C {layerCCount}/{LAYER_C_TARGET}
        {/if}
      </span>
    {/if}

    <button
      class="parser-btn"
      onclick={() => { parserOpen = true; }}
      title="자유 텍스트 메모로 패턴 만들기 (AI Parser)"
    >📝 Memo → Pattern</button>
    <button class="reload-btn" onclick={load} disabled={loading} title="Reload">↺</button>
  </div>

  <!-- Undo banner -->
  {#if undoPending}
    <div class="undo-bar">
      <span class="undo-label">
        <span class="undo-verdict">{undoPending.label}</span> submitting…
      </span>
      <button class="undo-btn" onclick={undoVerdict}>Undo</button>
      <div class="undo-progress" style="width: {undoProgress}%"></div>
    </div>
  {/if}

  <!-- Outlier warning -->
  {#if showOutlierWarn}
    <div class="outlier-warn">
      ⚠️ Same verdict 5× in a row — 맞나요?
    </div>
  {/if}

  <AIParserModal
    open={parserOpen}
    onClose={() => { parserOpen = false; }}
    onSaved={() => { load(); }}
  />

  {#if loading}
    <div class="inbox-empty">Loading…</div>
  {:else if error}
    <div class="inbox-empty inbox-error">{error}</div>
  {:else}
    <div class="inbox-list">

      <!-- Section 1: WATCH HITS — pending_outcome from watch scanner -->
      {#if watchHits.length > 0}
        <div class="section-header" data-section="watch-hits">
          <span class="section-label">WATCH HITS</span>
          <span class="section-badge">{watchHits.length} pending</span>
        </div>
        {#each watchHits as hit (hit.capture_id)}
          <div class="inbox-card watch-hit-card">
            <div class="card-top">
              <span class="card-sym">{hit.symbol.replace('USDT', '')}</span>
              <span class="card-pattern">{hit.pattern_slug || 'watch'}</span>
              {#if hit.phase}
                <span class="card-phase phase-{hit.phase.toLowerCase()}">{hit.phase}</span>
              {/if}
              <span class="card-tf">{hit.timeframe.toUpperCase()}</span>
              <span class="card-age">{timeAgo(hit.captured_at_ms)}</span>
              <span class="watch-hit-badge">⏳ Pending</span>
            </div>
          </div>
        {/each}
      {/if}

      <!-- Section 2: REVIEW — outcome_ready awaiting user verdict -->
      <div class="section-header" data-section="review">
        <span class="section-label">REVIEW</span>
        <span class="section-badge">{items.length} pending</span>
        {#if items.length > 0 && focused}
          <span class="kbd-hint">1-5 keys</span>
        {/if}
      </div>
      {#if items.length === 0}
        <div class="inbox-empty section-empty">
          <span class="empty-icon">✓</span>
          <span>No captures awaiting verdict</span>
        </div>
      {:else}
        {#each items as item, idx (item.capture.capture_id)}
          {@const cap = item.capture}
          {@const out = item.outcome}
          {@const busy = !!submitting[cap.capture_id]}
          <div class="inbox-card" class:busy class:first-item={idx === 0}>
            <div class="card-top">
              <span class="card-sym">{cap.symbol.replace('USDT', '')}</span>
              <span class="card-pattern">{cap.pattern_slug || 'manual'}</span>
              <span class="card-phase phase-{cap.phase.toLowerCase()}">{cap.phase}</span>
              <span class="card-tf">{cap.timeframe.toUpperCase()}</span>
              <span class="card-age">{timeAgo(cap.captured_at_ms)}</span>
              <span class="card-watch">
                <WatchToggle
                  captureId={cap.capture_id}
                  isWatching={cap.is_watching ?? false}
                />
              </span>
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
                title="Setup was correct [1]"
              >{idx === 0 && focused ? '1 ' : ''}✓ Valid</button>
              <button
                class="verdict-btn verdict-invalid"
                onclick={() => submitVerdict(cap.capture_id, 'invalid')}
                disabled={busy}
                title="Setup was wrong [2]"
              >{idx === 0 && focused ? '2 ' : ''}✗ Invalid</button>
              <button
                class="verdict-btn verdict-too-late"
                onclick={() => submitVerdict(cap.capture_id, 'too_late')}
                disabled={busy}
                title="Setup valid but entry too late [3]"
              >{idx === 0 && focused ? '3 ' : ''}⏰ Too Late</button>
              <button
                class="verdict-btn verdict-near-miss"
                onclick={() => submitVerdict(cap.capture_id, 'near_miss')}
                disabled={busy}
                title="Setup valid but entry missed [4]"
              >{idx === 0 && focused ? '4 ' : ''}~ Near Miss</button>
              <button
                class="verdict-btn verdict-too-early"
                onclick={() => submitVerdict(cap.capture_id, 'too_early')}
                disabled={busy}
                title="Entry too early [5]"
              >{idx === 0 && focused ? '5 ' : ''}⏫ Too Early</button>
            </div>
          </div>
        {/each}
      {/if}

      <!-- Section 3: RECENT — verdict_ready (last 10 closed) -->
      {#if recentVerdicts.length > 0}
        <div class="section-header" data-section="recent">
          <span class="section-label">RECENT</span>
          <span class="section-badge">{recentVerdicts.length}</span>
        </div>
        {#each recentVerdicts as item (item.capture.capture_id)}
          {@const cap = item.capture}
          {@const out = item.outcome}
          <div class="inbox-card recent-card">
            <div class="card-top">
              <span class="card-sym">{cap.symbol.replace('USDT', '')}</span>
              <span class="card-pattern">{cap.pattern_slug || 'manual'}</span>
              <span class="card-tf">{cap.timeframe.toUpperCase()}</span>
              <span class="card-age">{timeAgo(cap.captured_at_ms)}</span>
              {#if out?.user_verdict}
                <span class="recent-verdict verdict-tag-{out.user_verdict}">{out.user_verdict}</span>
              {/if}
            </div>
            <div class="card-outcome">
              <span class="outcome-label">{outcomeLabel(out?.outcome ?? null)}</span>
              <span class="card-pnl {pnlClass(out?.exit_return_pct ?? null)}">
                {formatPnl(out?.exit_return_pct ?? null)}
              </span>
            </div>
          </div>
        {/each}
      {/if}

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
    outline: none;
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
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(247,242,234,0.7);
  }
  .inbox-count {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(99,179,237,0.15);
    color: rgba(131,188,255,0.9);
  }

  /* Layer C ETA badge */
  .layer-c-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(147,51,234,0.12);
    border: 1px solid rgba(147,51,234,0.25);
    color: rgba(196,168,255,0.8);
    white-space: nowrap;
  }
  .layer-c-badge.layer-c-active {
    background: rgba(34,171,148,0.12);
    border-color: rgba(34,171,148,0.25);
    color: #22AB94;
  }

  .parser-btn {
    margin-left: auto;
    background: rgba(219, 154, 159, 0.10);
    border: 1px solid rgba(219, 154, 159, 0.35);
    color: #db9a9f;
    border-radius: 3px;
    padding: 3px 8px;
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: background 0.15s;
  }
  .parser-btn:hover {
    background: rgba(219, 154, 159, 0.20);
    color: #f7f2ea;
  }
  .reload-btn {
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

  /* Undo bar */
  .undo-bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    background: rgba(99,179,237,0.08);
    border-bottom: 1px solid rgba(99,179,237,0.15);
    flex-shrink: 0;
    overflow: hidden;
  }
  .undo-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.6);
    flex: 1;
  }
  .undo-verdict {
    color: rgba(131,188,255,0.9);
    font-weight: 700;
  }
  .undo-btn {
    background: rgba(99,179,237,0.15);
    border: 1px solid rgba(99,179,237,0.3);
    color: rgba(131,188,255,1);
    border-radius: 3px;
    padding: 2px 8px;
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    cursor: pointer;
    z-index: 1;
  }
  .undo-btn:hover { background: rgba(99,179,237,0.25); }
  .undo-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: rgba(99,179,237,0.5);
    transition: width 50ms linear;
  }

  /* Outlier warning */
  .outlier-warn {
    padding: 4px 12px;
    background: rgba(250,204,21,0.08);
    border-bottom: 1px solid rgba(250,204,21,0.15);
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(250,204,21,0.85);
    flex-shrink: 0;
  }

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
  .inbox-card.first-item {
    border-color: rgba(99,179,237,0.18);
  }

  .card-top {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .card-watch {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
  }
  .card-sym {
    font-family: var(--sc-font-mono, monospace);
    font-size: 12px;
    font-weight: 700;
    color: rgba(247,242,234,1);
  }
  .card-pattern {
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.45);
    font-family: var(--sc-font-mono, monospace);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-phase {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.4);
  }
  .card-age {
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.4);
    font-style: italic;
    border-left: 2px solid rgba(255,255,255,0.1);
    padding-left: 6px;
  }

  .card-actions {
    display: flex;
    gap: 5px;
    margin-top: 2px;
    flex-wrap: wrap;
  }
  .verdict-btn {
    flex: 1;
    padding: 4px 0;
    border-radius: 3px;
    border: 1px solid transparent;
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
    min-width: 60px;
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

  .verdict-too-late {
    background: rgba(250,204,21,0.1);
    border-color: rgba(250,204,21,0.25);
    color: #facc15;
  }
  .verdict-too-late:hover { background: rgba(250,204,21,0.2); }

  .verdict-near-miss {
    background: rgba(102,102,102,0.1);
    border-color: rgba(102,102,102,0.3);
    color: rgba(247,242,234,0.7);
  }
  .verdict-near-miss:hover { background: rgba(102,102,102,0.2); }

  .verdict-too-early {
    background: rgba(147,51,234,0.1);
    border-color: rgba(147,51,234,0.3);
    color: rgba(196,168,255,0.85);
  }
  .verdict-too-early:hover { background: rgba(147,51,234,0.2); }

  .verdict-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .kbd-hint {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(247,242,234,0.25);
    padding: 1px 4px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 3px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 4px 2px;
    margin-top: 4px;
  }
  .section-label {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(247,242,234,0.4);
  }
  .section-badge {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    padding: 1px 5px;
    border-radius: 6px;
    background: rgba(255,255,255,0.06);
    color: rgba(247,242,234,0.5);
  }

  .section-empty {
    flex: none;
    padding: 8px 12px;
    font-size: var(--ui-text-xs);
  }

  .watch-hit-card {
    border-color: rgba(99,179,237,0.2);
    background: rgba(99,179,237,0.04);
  }
  .watch-hit-badge {
    margin-left: auto;
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(131,188,255,0.7);
  }

  .recent-card {
    opacity: 0.7;
    border-color: rgba(255,255,255,0.05);
  }
  .recent-verdict {
    margin-left: auto;
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
  }
  .verdict-tag-valid    { color: #22AB94; background: rgba(34,171,148,0.12); }
  .verdict-tag-invalid  { color: #F23645; background: rgba(242,54,69,0.12); }
  .verdict-tag-near_miss { color: rgba(247,242,234,0.7); background: rgba(102,102,102,0.12); }
  .verdict-tag-too_early { color: rgba(196,168,255,0.85); background: rgba(147,51,234,0.12); }
  .verdict-tag-too_late  { color: #facc15; background: rgba(250,204,21,0.12); }
</style>
