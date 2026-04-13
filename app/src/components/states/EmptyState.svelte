<script lang="ts">
  interface Props {
    icon?: string;
    title?: string;
    hint?: string;
    action?: string;
    onAction?: () => void;
  }

  let {
    icon = '◈',
    title = 'Nothing here yet',
    hint = '',
    action = '',
    onAction,
  }: Props = $props();
</script>

<div class="empty-state">
  <span class="empty-icon">{icon}</span>
  <p class="empty-title">{title}</p>
  {#if hint}
    <p class="empty-hint">{hint}</p>
  {/if}
  {#if action}
    <button class="empty-action" onclick={onAction}>{action}</button>
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 100%;
    min-height: 160px;
    padding: 32px 24px;
    opacity: 0.6;
  }

  .empty-icon {
    font-size: 24px;
    color: var(--sc-text-3);
    line-height: 1;
  }

  .empty-title {
    font-family: var(--sc-font-mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--sc-text-2);
    margin: 0;
  }

  .empty-hint {
    font-size: 12px;
    color: var(--sc-text-3);
    margin: 0;
    text-align: center;
    max-width: 260px;
    line-height: 1.5;
  }

  .empty-action {
    margin-top: 8px;
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 600;
    color: var(--sc-text-1);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 5px;
    padding: 6px 14px;
    cursor: pointer;
    transition: all 0.15s;
    opacity: 1;
  }

  .empty-action:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--sc-text-0);
  }
</style>
