<script lang="ts">
  interface Props {
    label: string;
    hint?: string;
    action?: string;
    onAction?: () => void;
  }

  const { label, hint, action, onAction }: Props = $props();
</script>

<div class="header">
  <span class="label">{label}</span>
  {#if hint}
    <span class="hint">{hint}</span>
  {/if}
  <span class="spacer" />
  {#if action}
    <button class="action" onclick={onAction}>{action}</button>
  {/if}
</div>

<style>
  .header {
    padding: 10px 12px 6px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g5);
    letter-spacing: 0.16em;
  }

  .hint {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    color: var(--g6);
  }

  .spacer {
    flex: 1;
  }

  .action {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: var(--g6);
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.15s;
  }

  .action:hover {
    color: var(--g7);
  }
</style>
