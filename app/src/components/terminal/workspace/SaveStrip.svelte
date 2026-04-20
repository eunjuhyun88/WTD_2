<script lang="ts">
  /**
   * SaveStrip.svelte
   *
   * Slim strip below chart canvas that appears only when:
   *   - chartSaveMode.active === true
   *   - both anchorA and anchorB are set
   *
   * Shows: range label, collected indicator pills, H/L/change%, note, save buttons.
   * Per W-0086/W-0117: strip appears below chart pane only, never overlays chart body.
   */
  import { chartSaveMode } from '$lib/stores/chartSaveMode';

  interface Props {
    symbol: string;
    tf: string;
    ohlcvBars?: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>;
    onSaved?: (captureId: string) => void;
  }

  let { symbol, tf, ohlcvBars = [], onSaved }: Props = $props();

  const saveState = $derived($chartSaveMode);
  const bothAnchors = $derived(saveState.anchorA !== null && saveState.anchorB !== null);
  const visible = $derived(saveState.active && bothAnchors);

  let saveError = $state<string | null>(null);

  // ── Range label ────────────────────────────────────────────────────────────
  function formatRangeLabel(a: number | null, b: number | null, barTf: string): string {
    if (a === null || b === null) return '';
    const start = Math.min(a, b);
    const end   = Math.max(a, b);
    const fmtDate = (ts: number) =>
      new Date(ts * 1000).toLocaleString('ko-KR', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
        hour12: false,
      });
    const barCount = ohlcvBars.filter((b) => b.time >= start && b.time <= end).length;
    return `${fmtDate(start)} → ${fmtDate(end)} · ${barTf.toUpperCase()}${barCount > 0 ? ` (${barCount}봉)` : ''}`;
  }

  const rangeLabel = $derived(formatRangeLabel(saveState.anchorA, saveState.anchorB, tf));

  // ── Collected indicator pills (W-0117 Slice C) ─────────────────────────────
  const INDICATOR_LABELS: Record<string, string> = {
    ema: 'EMA', bb: 'BB', vwap: 'VWAP', atr_bands: 'ATR',
    macd: 'MACD', rsi: 'RSI', cvd: 'CVD', oi: 'OI', funding: 'Funding',
    volume: 'Vol', taker_buy: 'TBV',
  };

  const indicatorPills = $derived.by(() => {
    const payload = saveState.payload;
    if (!payload?.indicators) return [];
    const indicators = payload.indicators as Record<string, unknown>;
    return Object.entries(indicators)
      .filter(([, v]) => {
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'number' && Number.isFinite(v)) return true;
        return false;
      })
      .map(([key]) => INDICATOR_LABELS[key] ?? key.toUpperCase())
      .filter((label, i, arr) => arr.indexOf(label) === i) // dedupe
      .slice(0, 8); // cap at 8 pills
  });

  // ── Range stats: H/L/change% within selected bars ─────────────────────────
  const rangeStats = $derived.by(() => {
    if (saveState.anchorA === null || saveState.anchorB === null) return null;
    const start = Math.min(saveState.anchorA, saveState.anchorB);
    const end   = Math.max(saveState.anchorA, saveState.anchorB);
    const bars = ohlcvBars.filter((b) => b.time >= start && b.time <= end);
    if (bars.length === 0) return null;
    const high = Math.max(...bars.map((b) => b.high));
    const low  = Math.min(...bars.map((b) => b.low));
    const open  = bars[0].open;
    const close = bars[bars.length - 1].close;
    const changePct = ((close - open) / open) * 100;
    return { high, low, changePct };
  });

  function fmtPrice(n: number): string {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleNoteInput(e: Event) {
    chartSaveMode.setNote((e.target as HTMLTextAreaElement).value);
  }

  async function handleSave() {
    saveError = null;
    const id = await chartSaveMode.save({ symbol, tf, ohlcvBars });
    if (!id) {
      saveError = '저장 실패 — 구간을 다시 선택해 보세요.';
      return;
    }
    onSaved?.(id);
  }

  async function handleSaveAndOpenLab() {
    saveError = null;
    const id = await chartSaveMode.save({ symbol, tf, ohlcvBars });
    if (!id) {
      saveError = '저장 실패 — 구간을 다시 선택해 보세요.';
      return;
    }
    onSaved?.(id);
    window.location.href = `/lab?capture=${encodeURIComponent(id)}`;
  }
</script>

{#if visible}
  <div class="save-strip">
    <!-- Range label + indicator pills + stats -->
    <div class="strip-left">
      <span class="strip-icon">⊡</span>
      <span class="strip-range">{rangeLabel}</span>
      {#if indicatorPills.length > 0}
        <span class="strip-sep">·</span>
        <span class="strip-pills">
          {#each indicatorPills as pill}
            <span class="strip-pill">{pill}</span>
          {/each}
        </span>
      {/if}
      {#if rangeStats}
        <span class="strip-sep">·</span>
        <span class="strip-stat">H {fmtPrice(rangeStats.high)}</span>
        <span class="strip-stat">L {fmtPrice(rangeStats.low)}</span>
        <span class="strip-stat" class:bull={rangeStats.changePct >= 0} class:bear={rangeStats.changePct < 0}>
          {rangeStats.changePct >= 0 ? '+' : ''}{rangeStats.changePct.toFixed(2)}%
        </span>
      {/if}
    </div>

    <!-- Note input -->
    <div class="strip-center">
      <textarea
        class="strip-note"
        placeholder="메모 (선택)"
        rows={1}
        value={saveState.noteDraft}
        oninput={handleNoteInput}
      ></textarea>
    </div>

    <!-- Actions -->
    <div class="strip-actions">
      {#if saveError}
        <span class="strip-error">{saveError}</span>
      {/if}
      <button
        class="strip-btn cancel"
        type="button"
        onclick={() => chartSaveMode.exitRangeMode()}
      >
        취소
      </button>
      <button
        class="strip-btn save"
        type="button"
        onclick={handleSave}
        disabled={saveState.submitting}
      >
        {saveState.submitting ? '저장 중…' : '저장'}
      </button>
      <button
        class="strip-btn lab"
        type="button"
        onclick={handleSaveAndOpenLab}
        disabled={saveState.submitting}
      >
        {saveState.submitting ? '…' : 'Save & Lab →'}
      </button>
    </div>
  </div>
{/if}

<style>
  .save-strip {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    flex-shrink: 0;
    padding: 0 10px;
    border-top: 1px solid rgba(77, 143, 245, 0.35);
    background: rgba(10, 13, 22, 0.97);
    overflow: hidden;
  }

  .strip-left {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }

  .strip-icon {
    font-size: 11px;
    color: rgba(131, 188, 255, 0.75);
    line-height: 1;
  }

  .strip-range {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(247, 242, 234, 0.65);
    white-space: nowrap;
  }

  .strip-sep {
    font-size: 9px;
    color: rgba(247, 242, 234, 0.25);
    flex-shrink: 0;
  }

  .strip-pills {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }

  .strip-pill {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 2px;
    background: rgba(77, 143, 245, 0.12);
    border: 1px solid rgba(77, 143, 245, 0.25);
    color: rgba(131, 188, 255, 0.8);
    white-space: nowrap;
  }

  .strip-stat {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(247, 242, 234, 0.55);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .strip-stat.bull {
    color: #26a69a;
  }

  .strip-stat.bear {
    color: rgba(248, 113, 113, 0.85);
  }

  .strip-center {
    flex: 1;
    min-width: 0;
  }

  .strip-note {
    width: 100%;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 3px;
    color: rgba(247, 242, 234, 0.82);
    font-family: var(--sc-font-body, sans-serif);
    font-size: 11px;
    padding: 4px 8px;
    resize: none;
    line-height: 1.4;
    box-sizing: border-box;
    height: 26px;
    overflow: hidden;
  }

  .strip-note:focus {
    outline: none;
    border-color: rgba(77, 143, 245, 0.35);
  }

  .strip-note::placeholder {
    color: rgba(247, 242, 234, 0.22);
  }

  .strip-actions {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }

  .strip-error {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(248, 113, 113, 0.9);
  }

  .strip-btn {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.1s;
    white-space: nowrap;
  }

  .strip-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .strip-btn.cancel {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(247, 242, 234, 0.38);
  }

  .strip-btn.cancel:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.18);
    color: rgba(247, 242, 234, 0.65);
  }

  .strip-btn.save {
    background: rgba(38, 166, 154, 0.10);
    border: 1px solid rgba(38, 166, 154, 0.30);
    color: #26a69a;
  }

  .strip-btn.save:hover:not(:disabled) {
    background: rgba(38, 166, 154, 0.22);
  }

  .strip-btn.lab {
    background: rgba(77, 143, 245, 0.12);
    border: 1px solid rgba(77, 143, 245, 0.38);
    color: rgba(131, 188, 255, 0.9);
  }

  .strip-btn.lab:hover:not(:disabled) {
    background: rgba(77, 143, 245, 0.22);
  }
</style>
