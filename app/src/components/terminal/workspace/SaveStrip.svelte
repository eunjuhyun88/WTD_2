<script lang="ts">
  /**
   * SaveStrip.svelte
   *
   * Slim strip below chart canvas that appears only when:
   *   - chartSaveMode.active === true
   *   - both anchorA and anchorB are set
   *
   * Contains: range display, note input, Save & Open in Lab button.
   * Per W-0086: strip appears below chart pane only, never overlays chart body.
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
    return `${fmtDate(start)} → ${fmtDate(end)} · ${barTf.toUpperCase()} ${barCount > 0 ? `(${barCount}봉)` : ''}`;
  }

  const rangeLabel = $derived(formatRangeLabel(saveState.anchorA, saveState.anchorB, tf));

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
    // Navigate to lab with capture seed
    window.location.href = `/lab?capture=${encodeURIComponent(id)}`;
  }
</script>

{#if visible}
  <div class="save-strip">
    <div class="strip-left">
      <span class="strip-icon">⊡</span>
      <span class="strip-range">{rangeLabel}</span>
    </div>

    <div class="strip-center">
      <textarea
        class="strip-note"
        placeholder="메모 (선택)"
        rows={1}
        value={saveState.noteDraft}
        oninput={handleNoteInput}
      ></textarea>
    </div>

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
        {saveState.submitting ? '…' : 'Save & Open in Lab'}
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
