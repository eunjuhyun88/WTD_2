<script lang="ts">
  interface Props {
    lastUpdated?: number;  // unix ms
    onRefresh?: () => void;
    message?: string;
  }

  let {
    lastUpdated,
    onRefresh,
    message = 'Data may be outdated',
  }: Props = $props();

  function fmtAge(ts?: number): string {
    if (!ts) return '';
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }

  let age = $derived(fmtAge(lastUpdated));
</script>

<div class="stale-state">
  <div class="stale-icon">⚠</div>
  <div class="stale-body">
    <p class="stale-msg">{message}</p>
    {#if age}
      <p class="stale-age">Last updated {age}</p>
    {/if}
  </div>
  {#if onRefresh}
    <button class="refresh-btn" onclick={onRefresh} aria-label="Refresh data">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M23 4v6h-6M1 20v-6h6"/>
        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
      </svg>
    </button>
  {/if}
</div>

<style>
  .stale-state {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(251, 191, 36, 0.06);
    border: 1px solid rgba(251, 191, 36, 0.2);
    border-radius: 6px;
    font-family: var(--sc-font-mono);
  }

  .stale-icon {
    font-size: 12px;
    color: #fbbf24;
    flex-shrink: 0;
  }

  .stale-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .stale-msg {
    font-size: 11px;
    font-weight: 600;
    color: #fbbf24;
    margin: 0;
  }

  .stale-age {
    font-size: 9px;
    color: rgba(251, 191, 36, 0.6);
    margin: 0;
  }

  .refresh-btn {
    background: rgba(251, 191, 36, 0.1);
    border: 1px solid rgba(251, 191, 36, 0.2);
    border-radius: 4px;
    color: #fbbf24;
    cursor: pointer;
    padding: 5px 6px;
    line-height: 0;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .refresh-btn:hover {
    background: rgba(251, 191, 36, 0.18);
  }
</style>
