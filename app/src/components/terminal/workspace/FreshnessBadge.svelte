<script lang="ts">
  import type { FreshnessStatus } from '$lib/types/terminal';

  interface Props {
    status: FreshnessStatus;
    updatedAt?: number;
  }
  let { status, updatedAt }: Props = $props();

  function formatAge(ts?: number): string {
    if (!ts) return '';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s/60)}m ago`;
  }
</script>

<span class="freshness-badge" data-status={status}>
  <span class="dot"></span>
  {#if status === 'live'}Live
  {:else if status === 'recent'}{formatAge(updatedAt)}
  {:else if status === 'delayed'}Delayed
  {:else if status === 'stale'}Stale
  {:else}Disconnected{/if}
</span>

<style>
  .freshness-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    opacity: 0.8;
  }
  .dot {
    width: 5px; height: 5px; border-radius: 50%;
  }
  [data-status="live"] .dot { background: #4ade80; }
  [data-status="live"] { color: #4ade80; }
  [data-status="recent"] .dot { background: rgba(255,255,255,0.4); }
  [data-status="recent"] { color: var(--sc-text-2); }
  [data-status="delayed"] .dot { background: #fbbf24; }
  [data-status="delayed"] { color: #fbbf24; }
  [data-status="stale"] .dot { background: #f97316; }
  [data-status="stale"] { color: #f97316; }
  [data-status="disconnected"] .dot { background: #f87171; }
  [data-status="disconnected"] { color: #f87171; }
</style>
