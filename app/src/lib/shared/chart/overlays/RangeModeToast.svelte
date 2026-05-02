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
          Select the range start
        {:else}
          Select the range end
        {/if}
      </span>
      <span class="toast-esc"><kbd>ESC</kbd> Cancel</span>
    {:else}
      <!-- Complete range action toolbar -->
      <span class="toast-icon">✓</span>
      <span class="toast-text">Range selected</span>
      <div class="action-buttons">
        <button
          class="action-btn save-btn"
          onclick={onSaveCapture}
          title="Save current range as capture"
        >💾 Save</button>
        <button
          class="action-btn ai-btn"
          onclick={onSendToAI}
          title="Send to AI panel"
        >🤖 AI</button>
        <button
          class="action-btn analyze-btn"
          onclick={onAnalyze}
          title="Analyze range"
        >🔍 Analyze</button>
        <button
          class="action-btn cancel-btn"
          onclick={onCancel}
          title="Cancel (ESC)"
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
    font-size: var(--ui-text-xs);
    color: rgba(247, 242, 234, 0.75);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .toast-esc {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    color: rgba(247, 242, 234, 0.38);
    white-space: nowrap;
    flex-shrink: 0;
  }

  kbd {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
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
    font-size: var(--ui-text-xs);
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
