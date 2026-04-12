<script lang="ts">
  export type ActivityType = 'battle' | 'lab' | 'memory' | 'market';

  const { action, detail = '', time, type }: {
    action: string;
    detail?: string;
    time: string;
    type: ActivityType;
  } = $props();

  const ICONS: Record<ActivityType, string> = {
    battle: '\u2694\uFE0F',
    lab:    '\u2697\uFE0F',
    memory: '\uD83C\uDCCF',
    market: '\uD83D\uDCC8',
  };

  const icon = $derived(ICONS[type] ?? '\u25CF');
</script>

<div class="feed-item">
  <span class="feed-icon">{icon}</span>
  <span class="feed-body">
    <span class="feed-action">{action}</span>
    {#if detail}
      <span class="feed-detail">{detail}</span>
    {/if}
  </span>
  <span class="feed-time">{time}</span>
</div>

<style>
  .feed-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--sc-radius-md);
    border: 1px solid rgba(247, 242, 234, 0.03);
    background: rgba(247, 242, 234, 0.01);
    transition: background var(--sc-duration-fast) var(--sc-ease);
  }

  .feed-item:hover {
    background: rgba(247, 242, 234, 0.025);
    border-color: rgba(247, 242, 234, 0.06);
  }

  .feed-icon {
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
    width: 20px;
    text-align: center;
  }

  .feed-body {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }

  .feed-action {
    font-family: var(--sc-font-body);
    font-size: var(--sc-fs-sm);
    font-weight: 600;
    color: var(--sc-text-0);
    white-space: nowrap;
  }

  .feed-detail {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    color: var(--sc-text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .feed-time {
    font-family: var(--sc-font-mono);
    font-size: var(--sc-fs-2xs);
    color: var(--sc-text-3);
    white-space: nowrap;
    flex-shrink: 0;
  }

  @media (max-width: 480px) {
    .feed-body { flex-direction: column; gap: 2px; }
    .feed-detail { font-size: 8px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .feed-item { transition: none; }
  }
</style>
