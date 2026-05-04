<script lang="ts">
  /**
   * SaveRangeToast — W-0402 PR11
   *
   * Centered top floating toast shown when chartSaveModeV2 enters 'preview'.
   * Auto-dismisses after 5 s. Four actions: Save / Find Pattern / Draft / ✕
   *
   * Positioning: fixed, centered horizontally, 12px from top.
   * z-index: 190 (per §9 z-order spec).
   */
  import { onDestroy } from 'svelte';
  import { chartSaveModeV2 } from '$lib/stores/chartSaveMode.store';

  const state = $derived($chartSaveModeV2);
  const visible = $derived(state.mode === 'preview' && state.range !== null);

  // Auto-dismiss timer
  let timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (visible) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        chartSaveModeV2.cancel();
      }, 5000);
    } else {
      if (timer) { clearTimeout(timer); timer = null; }
    }
  });

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });

  function fmtTs(unix: number): string {
    const d = new Date(unix * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function onSave() {
    const range = chartSaveModeV2.commitSave();
    if (!range) return;
    // Delegate to legacy chartSaveMode via event; ChartBoard or TerminalHub
    // can listen and call chartSaveMode.save(). Chart canvas drag wiring is
    // gated — see TODO in chartSaveModeV2.setRange wiring note.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chartSave:commit', { detail: range }));
    }
  }

  function onFindPattern() {
    const range = chartSaveModeV2.commitFindPattern();
    if (!range) return;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cogochi:cmd', {
        detail: {
          id: 'analyze_range',
          fromTime: range.from,
          toTime: range.to,
          symbol: range.symbol,
          timeframe: range.tf,
        },
      }));
    }
  }

  function onDraft() {
    const range = chartSaveModeV2.commitDraft();
    if (!range) return;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chartSave:draft', { detail: range }));
    }
  }

  function onDismiss() {
    chartSaveModeV2.cancel();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && visible) { e.preventDefault(); onDismiss(); }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if visible}
  {@const range = state.range!}
  <div class="save-range-toast" role="dialog" aria-label="Save range actions" aria-live="polite">
    <div class="srt-meta">
      <span class="srt-pair">{range.symbol.replace('USDT', '/USDT')} {range.tf}</span>
      <span class="srt-range">
        {fmtTs(range.from)} → {fmtTs(range.to)}
      </span>
      <button class="srt-close" onclick={onDismiss} aria-label="Dismiss">✕</button>
    </div>

    <div class="srt-actions">
      <button class="srt-btn primary" onclick={onSave}>
        <span class="srt-glyph">💾</span>
        <span class="srt-label">저장</span>
      </button>
      <button class="srt-btn" onclick={onFindPattern}>
        <span class="srt-glyph">🔍</span>
        <span class="srt-label">패턴 찾기</span>
      </button>
      <button class="srt-btn" onclick={onDraft}>
        <span class="srt-glyph">📝</span>
        <span class="srt-label">Draft</span>
      </button>
    </div>
  </div>
{/if}

<style>
  .save-range-toast {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 190;

    display: flex;
    flex-direction: column;
    gap: var(--sp-1, 4px);

    min-width: 340px;
    max-width: 520px;

    background: var(--surface-2, var(--g2));
    border: 1px solid var(--g4);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);

    padding: var(--sp-3, 12px);
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--type-md, var(--ui-text-sm));
    color: var(--g9);

    animation: srt-enter 0.12s ease-out;
  }

  @keyframes srt-enter {
    from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  .srt-meta {
    display: flex;
    align-items: center;
    gap: var(--sp-2, 8px);
  }

  .srt-pair {
    font-size: var(--type-md, var(--ui-text-sm));
    font-weight: 700;
    color: var(--g9);
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .srt-range {
    font-size: var(--type-md, var(--ui-text-sm));
    color: var(--g6);
    white-space: nowrap;
    flex: 1;
  }

  .srt-close {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 0.5px solid var(--g4);
    border-radius: 3px;
    color: var(--g6);
    font-size: 11px;
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
  }
  .srt-close:hover { color: var(--g9); border-color: var(--g6); }

  .srt-actions {
    display: flex;
    gap: var(--sp-2, 8px);
  }

  .srt-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1, 4px);
    padding: 5px var(--sp-3, 12px);
    background: var(--g3);
    border: 0.5px solid var(--g4);
    border-radius: 4px;
    color: var(--g8);
    font-family: inherit;
    font-size: var(--type-md, var(--ui-text-sm));
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.08s, color 0.08s, border-color 0.08s;
  }
  .srt-btn:hover {
    background: var(--g4);
    color: var(--g9);
    border-color: var(--g5);
  }

  .srt-btn.primary {
    color: var(--accent-amb, var(--amb));
    border-color: color-mix(in srgb, var(--accent-amb, var(--amb)) 35%, transparent);
  }
  .srt-btn.primary:hover {
    background: color-mix(in srgb, var(--accent-amb, var(--amb)) 15%, transparent);
    border-color: color-mix(in srgb, var(--accent-amb, var(--amb)) 60%, transparent);
  }

  .srt-glyph { font-size: 14px; line-height: 1; }
  .srt-label {
    font-size: var(--type-md, var(--ui-text-sm));
    letter-spacing: 0.02em;
  }
</style>
