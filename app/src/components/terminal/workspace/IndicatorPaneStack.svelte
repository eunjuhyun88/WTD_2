<script lang="ts">
  interface Props {
    showMACD?: boolean;
    showCVD?: boolean;
    onHidePane?: (key: string) => void;
  }

  let { showMACD = false, showCVD = true, onHidePane } = $props();
</script>

<div class="indicator-pane-stack">
  <slot></slot>
</div>

<style>
  .indicator-pane-stack {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: rgba(19, 23, 34, 0.8);
    border-top: 1px solid rgba(42, 46, 57, 0.9);
  }

  .cvd-pane,
  .study-pane {
    background: rgba(19, 23, 34, 0.8);
    border-bottom: 1px solid rgba(42, 46, 57, 0.6);
    padding: 8px;
    min-height: 80px;
  }

  .pane-label {
    font-size: 10px;
    color: rgba(177, 181, 189, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
    font-family: var(--sc-font-mono, monospace);
  }

  .placeholder {
    color: rgba(177, 181, 189, 0.3);
    font-size: 11px;
    font-family: var(--sc-font-mono, monospace);
  }
</style>
