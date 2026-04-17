<script lang="ts">
  /**
   * RangeModeToast.svelte — Layer 2 hint toast
   *
   * Appears top-right when range-mode is active.
   * Shows "2점 선택 · ESC 취소" hint.
   * Container must have pointer-events: none; this toast has pointer-events: none too.
   */
  interface Props {
    active: boolean;
    anchorASet?: boolean;
  }

  let { active, anchorASet = false }: Props = $props();
</script>

{#if active}
  <div class="range-toast">
    <span class="toast-icon">⊡</span>
    <span class="toast-text">
      {#if !anchorASet}
        첫 번째 점 클릭
      {:else}
        두 번째 점 클릭 · <kbd>ESC</kbd> 취소
      {/if}
    </span>
  </div>
{/if}

<style>
  .range-toast {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 4px;
    border: 1px solid rgba(77, 143, 245, 0.35);
    background: rgba(13, 16, 22, 0.92);
    /* No pointer-events on the toast itself */
    pointer-events: none;
  }

  .toast-icon {
    font-size: 11px;
    color: rgba(131, 188, 255, 0.85);
    line-height: 1;
  }

  .toast-text {
    font-family: var(--sc-font-mono, monospace);
    font-size: 9px;
    color: rgba(247, 242, 234, 0.75);
    white-space: nowrap;
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
</style>
