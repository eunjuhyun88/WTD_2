<script lang="ts">
  interface Props {
    source?: string;
    onRetry?: () => void;
    compact?: boolean;
  }

  let { source = '', onRetry, compact = false }: Props = $props();
</script>

{#if compact}
  <span class="disconnected-inline">
    <span class="dc-dot">●</span>
    {source ? `${source} disconnected` : 'Disconnected'}
    {#if onRetry}
      <button class="retry-link" onclick={onRetry}>retry</button>
    {/if}
  </span>
{:else}
  <div class="disconnected-state">
    <div class="dc-icon">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
      </svg>
    </div>
    <div class="dc-body">
      <p class="dc-title">
        {source ? `${source} offline` : 'Connection lost'}
      </p>
      <p class="dc-hint">Data may be delayed or unavailable</p>
    </div>
    {#if onRetry}
      <button class="retry-btn" onclick={onRetry}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
        Retry
      </button>
    {/if}
  </div>
{/if}

<style>
  /* ── Compact inline variant ── */
  .disconnected-inline {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    color: var(--sc-text-3);
  }

  .dc-dot {
    font-size: var(--ui-text-xs);
    color: var(--sc-bias-bear);
    animation: sc-pulse 2s ease-in-out infinite;
  }

  @keyframes sc-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  .retry-link {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--sc-text-2);
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    text-decoration: underline;
    padding: 0;
  }

  /* ── Full block variant ── */
  .disconnected-state {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: rgba(248, 113, 113, 0.05);
    border: 1px solid rgba(248, 113, 113, 0.18);
    border-radius: 6px;
    font-family: var(--sc-font-mono);
  }

  .dc-icon {
    flex-shrink: 0;
    color: var(--sc-bias-bear);
    opacity: 0.7;
    line-height: 0;
  }

  .dc-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .dc-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--sc-bias-bear);
    margin: 0;
  }

  .dc-hint {
    font-size: var(--ui-text-xs);
    color: rgba(248, 113, 113, 0.5);
    margin: 0;
  }

  .retry-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: rgba(248, 113, 113, 0.1);
    border: 1px solid rgba(248, 113, 113, 0.2);
    border-radius: 4px;
    color: var(--sc-bias-bear);
    font-family: var(--sc-font-mono);
    font-size: var(--ui-text-xs);
    font-weight: 600;
    padding: 5px 10px;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .retry-btn:hover {
    background: rgba(248, 113, 113, 0.16);
  }
</style>
