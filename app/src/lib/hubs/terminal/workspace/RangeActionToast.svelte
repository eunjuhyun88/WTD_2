<script lang="ts">
  /**
   * RangeActionToast — Phase D-6 4-action toast shown after a chart
   * range capture (mousedown→up). Offers Save / Recall / AI / Cancel.
   */
  import { chartSaveMode } from '$lib/stores/chartSaveMode';
  import {
    chartAIOverlay,
    setAIOverlayShapes,
    type AIOverlayShape,
  } from '$lib/stores/chartAIOverlay';

  interface Props {
    symbol: string;
    timeframe: string;
    onDismiss: () => void;
  }
  const { symbol, timeframe, onDismiss }: Props = $props();

  let busy = $state(false);
  let recallResults = $state<Array<{
    slug: string; label: string; similarity: number; outcome: string;
  }> | null>(null);
  let lastError = $state<string | null>(null);

  const fromTime = $derived(
    $chartSaveMode.anchorA != null && $chartSaveMode.anchorB != null
      ? Math.min($chartSaveMode.anchorA, $chartSaveMode.anchorB)
      : null,
  );
  const toTime = $derived(
    $chartSaveMode.anchorA != null && $chartSaveMode.anchorB != null
      ? Math.max($chartSaveMode.anchorA, $chartSaveMode.anchorB)
      : null,
  );

  function pushRangeMarker(label: string, color: string) {
    if (fromTime == null || toTime == null) return;
    // The Y span of an AIRangeBox should encompass the visible price range
    // for the marker to be informative. Without chart access here, we use
    // a price band that is intentionally wide; the canvas projector will
    // clip it visually.
    const marker: AIOverlayShape = {
      kind: 'range',
      fromTime,
      toTime,
      fromPrice: 0,
      toPrice: Number.MAX_SAFE_INTEGER / 1e6,
      color,
      label,
    };
    const existing = $chartAIOverlay.symbol === symbol ? $chartAIOverlay.shapes : [];
    setAIOverlayShapes(symbol, [...existing, marker]);
  }

  async function onSave() {
    if (busy || fromTime == null) return;
    busy = true;
    lastError = null;
    try {
      const res = await chartSaveMode.save({ symbol, tf: timeframe });
      if (res) {
        pushRangeMarker(`Saved ${new Date(fromTime * 1000).toLocaleTimeString()}`, '#FBBF24');
      } else {
        lastError = 'save failed';
      }
    } catch (err) {
      lastError = (err as Error).message ?? 'save error';
    } finally {
      busy = false;
      onDismiss();
    }
  }

  async function onRecall() {
    if (busy || fromTime == null || toTime == null) return;
    busy = true;
    lastError = null;
    try {
      const res = await fetch('/api/patterns/recall', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol, timeframe, fromTime, toTime }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const body = (await res.json()) as { patterns: typeof recallResults };
      recallResults = body.patterns ?? [];
      pushRangeMarker(`Recall · ${recallResults?.length ?? 0} similar`, '#3B82F6');
    } catch (err) {
      lastError = (err as Error).message ?? 'recall failed';
    } finally {
      busy = false;
    }
  }

  function onAI() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('cogochi:cmd', {
      detail: { id: 'analyze_range', fromTime, toTime, symbol, timeframe },
    }));
    onDismiss();
  }

  function onCancel() {
    chartSaveMode.exitRangeMode();
    onDismiss();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  }
</script>

<svelte:window onkeydown={onKey} />

<aside class="range-toast" role="dialog" aria-label="Range actions">
  <div class="rt-head">
    <span class="rt-title">RANGE</span>
    <span class="rt-meta">
      {fromTime != null && toTime != null
        ? `${Math.round((toTime - fromTime) / 60)}m`
        : '—'}
    </span>
    <button class="rt-close" onclick={onCancel} aria-label="Close">✕</button>
  </div>

  <div class="rt-actions">
    <button class="rt-btn primary" onclick={onSave} disabled={busy}>
      <span class="rt-glyph">💾</span>
      <span class="rt-label">Save</span>
    </button>
    <button class="rt-btn" onclick={onRecall} disabled={busy}>
      <span class="rt-glyph">⟳</span>
      <span class="rt-label">Recall</span>
    </button>
    <button class="rt-btn" onclick={onAI} disabled={busy}>
      <span class="rt-glyph">✨</span>
      <span class="rt-label">AI</span>
    </button>
    <button class="rt-btn ghost" onclick={onCancel} disabled={busy}>
      <span class="rt-label">Cancel</span>
    </button>
  </div>

  {#if lastError}
    <div class="rt-msg error">{lastError}</div>
  {/if}

  {#if recallResults && recallResults.length > 0}
    <ul class="rt-results">
      {#each recallResults.slice(0, 5) as r}
        <li class="rt-result">
          <span class="rt-result-label">{r.label}</span>
          <span class="rt-result-sim">{Math.round(r.similarity * 100)}%</span>
          <span class="rt-result-outcome rt-outcome-{r.outcome}">{r.outcome}</span>
        </li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .range-toast {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 60;
    width: 300px;
    background: var(--g1);
    border: 1px solid var(--g4);
    border-radius: 6px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45);
    font-family: 'JetBrains Mono', monospace;
    color: var(--g8);
    overflow: hidden;
  }

  .rt-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--g3);
    background: var(--g0);
  }
  .rt-title {
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.16em;
    color: var(--g9);
  }
  .rt-meta {
    font-size: var(--ui-text-xs);
    color: var(--g6);
  }
  .rt-close {
    margin-left: auto;
    background: transparent;
    border: 0.5px solid var(--g4);
    border-radius: 3px;
    color: var(--g6);
    width: 20px; height: 20px;
    cursor: pointer;
    font-size: 11px;
    line-height: 1;
  }
  .rt-close:hover { color: var(--g9); border-color: var(--g6); }

  .rt-actions {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 4px;
    padding: 8px;
  }

  .rt-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 4px;
    background: var(--g2);
    border: 0.5px solid var(--g4);
    border-radius: 3px;
    color: var(--g7);
    font-family: inherit;
    cursor: pointer;
    transition: background 0.08s, color 0.08s, border-color 0.08s;
  }
  .rt-btn:hover:not(:disabled) {
    background: var(--g3);
    color: var(--g9);
    border-color: var(--g5);
  }
  .rt-btn:disabled { opacity: 0.5; cursor: progress; }

  .rt-btn.primary {
    color: var(--brand);
    border-color: color-mix(in srgb, var(--brand) 35%, transparent);
  }
  .rt-btn.primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--brand) 15%, transparent);
    border-color: color-mix(in srgb, var(--brand) 60%, transparent);
  }

  .rt-btn.ghost { background: transparent; }

  .rt-glyph { font-size: 14px; line-height: 1; }
  .rt-label {
    font-size: var(--ui-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .rt-msg {
    padding: 6px 10px;
    font-size: var(--ui-text-xs);
    border-top: 0.5px solid var(--g3);
  }
  .rt-msg.error { color: var(--neg); }

  .rt-results {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    border-top: 0.5px solid var(--g3);
    max-height: 180px;
    overflow-y: auto;
  }
  .rt-result {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    font-size: var(--ui-text-xs);
  }
  .rt-result:hover { background: var(--g2); }
  .rt-result-label {
    color: var(--g9);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rt-result-sim {
    color: var(--g6);
    font-size: var(--ui-text-xs);
  }
  .rt-result-outcome {
    font-size: var(--ui-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 1px 4px;
    border-radius: 2px;
  }
  .rt-outcome-win    { color: var(--pos); background: color-mix(in srgb, var(--pos) 14%, transparent); }
  .rt-outcome-loss   { color: var(--neg); background: color-mix(in srgb, var(--neg) 14%, transparent); }
  .rt-outcome-neutral{ color: var(--g6); background: var(--g2); }
  .rt-outcome-unknown{ color: var(--g5); }
</style>
