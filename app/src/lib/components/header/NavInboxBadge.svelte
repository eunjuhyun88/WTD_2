<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { inboxBadgeCount, startInboxBadgePolling } from '$lib/stores/inboxBadge.store';
  import { trackInboxDotClick } from '$lib/hubs/terminal/telemetry';

  const count = $derived($inboxBadgeCount);
  const hasDot = $derived(count > 0);

  onMount(() => {
    return startInboxBadgePolling();
  });

  function handleClick() {
    trackInboxDotClick(count);
    goto('/cogochi?panel=vdt');
  }
</script>

<button
  class="nav-inbox-btn"
  class:has-dot={hasDot}
  onclick={handleClick}
  aria-label={hasDot ? `미검증 ${count}건 — 베르딕 인박스 열기` : '베르딕 인박스'}
  title="Verdict Inbox"
>
  <svg class="inbox-icon" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path d="M2 2h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9l-1 2-1-2H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
  </svg>
  {#if hasDot}
    <span class="badge-dot" aria-hidden="true"></span>
  {/if}
</button>

<style>
  .nav-inbox-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--r-2, 2px);
    color: var(--g6);
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.08s;
  }

  .nav-inbox-btn:hover {
    color: var(--g8);
  }

  .nav-inbox-btn.has-dot {
    color: var(--amb, #d6a347);
  }

  .inbox-icon {
    width: 14px;
    height: 14px;
  }

  .badge-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--neg);
    pointer-events: none;
  }
</style>
