<script lang="ts">
  /**
   * RangeModeToast.svelte — Phase D-6 drag-to-save action toast
   *
   * Appears top-right when range-mode is active.
   * Shows hint during selection, then 4-action toolbar on complete range.
   * Korean-first copy per W-0086 UX spec.
   * Container must have pointer-events: none;
   * Action toolbar has pointer-events: auto for button interaction.
   */
  interface Props {
    active: boolean;
    anchorASet?: boolean;
    rangeComplete?: boolean;
    onSaveCapture?: () => void;
    onSendToAI?: () => void;
    onAnalyze?: () => void;
    onCancel?: () => void;
  }

  let {
    active,
    anchorASet = false,
    rangeComplete = false,
    onSaveCapture,
    onSendToAI,
    onAnalyze,
    onCancel
  }: Props = $props();
</script>

{#if active}
  <div class="range-toast">
    {#if !rangeComplete}
      <!-- Selection hint phase -->
      <span class="toast-icon">⊡</span>
      <span class="toast-text">
        {#if !anchorASet}
          구간 시작점을 선택하세요
        {:else}
          구간 끝점을 선택하세요
        {/if}
      </span>
      <span class="toast-esc"><kbd>ESC</kbd> 취소</span>
    {:else}
      <!-- Complete range action toolbar -->
      <span class="toast-icon">✓</span>
      <span class="toast-text">구간 선택 완료</span>
      <div class="action-buttons">
        <button
          class="action-btn save-btn"
          onclick={onSaveCapture}
          title="현재 구간을 캡처로 저장"
        >💾 저장</button>
        <button
          class="action-btn ai-btn"
          onclick={onSendToAI}
          title="AI 패널로 전송"
        >🤖 AI</button>
        <button
          class="action-btn analyze-btn"
          onclick={onAnalyze}
          title="구간 분석"
        >🔍 분석</button>
        <button
          class="action-btn cancel-btn"
          onclick={onCancel}
          title="취소 (ESC)"
        >✕</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .range-toast {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid rgba(77, 143, 245, 0.35);
    background: rgba(13, 16, 22, 0.95);
    pointer-events: none;
  }

  .toast-icon {
    font-size: 11px;
    color: rgba(131, 188, 255, 0.85);
    line-height: 1;
    flex-shrink: 0;
  }

  .toast-text {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(247, 242, 234, 0.75);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .toast-esc {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    color: rgba(247, 242, 234, 0.38);
    white-space: nowrap;
    flex-shrink: 0;
  }

  kbd {
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    color: rgba(247, 242, 234, 0.55);
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 2px;
    padding: 0px 3px;
  }

  .action-buttons {
    display: flex;
    gap: 4px;
    pointer-events: auto;
    margin-left: 4px;
    padding-left: 4px;
    border-left: 1px solid rgba(247, 242, 234, 0.1);
  }

  .action-btn {
    padding: 4px 8px;
    border: 1px solid rgba(77, 143, 245, 0.5);
    border-radius: 3px;
    background: rgba(77, 143, 245, 0.1);
    color: rgba(247, 242, 234, 0.8);
    font-family: var(--sc-font-mono, monospace);
    font-size: 8px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .action-btn:hover {
    background: rgba(77, 143, 245, 0.2);
    border-color: rgba(77, 143, 245, 0.75);
    color: rgba(247, 242, 234, 1);
  }

  .action-btn:active {
    transform: scale(0.95);
  }

  .save-btn {
    border-color: rgba(34, 197, 94, 0.5);
    background: rgba(34, 197, 94, 0.1);
  }

  .save-btn:hover {
    background: rgba(34, 197, 94, 0.2);
    border-color: rgba(34, 197, 94, 0.75);
  }

  .ai-btn {
    border-color: rgba(168, 85, 247, 0.5);
    background: rgba(168, 85, 247, 0.1);
  }

  .ai-btn:hover {
    background: rgba(168, 85, 247, 0.2);
    border-color: rgba(168, 85, 247, 0.75);
  }

  .analyze-btn {
    border-color: rgba(250, 204, 21, 0.5);
    background: rgba(250, 204, 21, 0.1);
  }

  .analyze-btn:hover {
    background: rgba(250, 204, 21, 0.2);
    border-color: rgba(250, 204, 21, 0.75);
  }

  .cancel-btn {
    border-color: rgba(239, 68, 68, 0.5);
    background: rgba(239, 68, 68, 0.1);
  }

  .cancel-btn:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.75);
  }
</style>
