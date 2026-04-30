<script lang="ts">
  import { systemToasts } from '$lib/stores/notificationStore';
</script>

{#if $systemToasts.length > 0}
  <div class="st-stack" role="region" aria-label="Notifications" aria-live="polite">
    {#each $systemToasts as toast (toast.id)}
      <div class="st-item st-{toast.type}">
        <span class="st-icon">
          {#if toast.type === 'success'}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6.5" stroke="currentColor" stroke-opacity=".4"/>
              <path d="M4 7l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {:else if toast.type === 'error'}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6.5" stroke="currentColor" stroke-opacity=".4"/>
              <path d="M5 5l4 4M9 5l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          {:else}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6.5" stroke="currentColor" stroke-opacity=".4"/>
              <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          {/if}
        </span>

        <span class="st-message">{toast.message}</span>

        {#if toast.action}
          <a class="st-action" href={toast.action.href}>{toast.action.label}</a>
        {/if}

        <button
          class="st-close"
          type="button"
          aria-label="닫기"
          onclick={() => systemToasts.dismiss(toast.id)}
        >✕</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .st-stack {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 300px;
    max-width: calc(100vw - 40px);
    pointer-events: none;
  }

  .st-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid;
    backdrop-filter: blur(16px);
    pointer-events: all;
    animation: st-slide-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    font-family: var(--sc-font-body, system-ui, sans-serif);
    font-size: 13px;
  }

  .st-success {
    background: rgba(52, 196, 112, 0.12);
    border-color: rgba(52, 196, 112, 0.28);
    color: #4ade80;
  }

  .st-error {
    background: rgba(255, 89, 89, 0.12);
    border-color: rgba(255, 89, 89, 0.28);
    color: #f87171;
  }

  .st-info {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.12);
    color: rgba(250, 247, 235, 0.85);
  }

  .st-icon {
    flex-shrink: 0;
    line-height: 0;
  }

  .st-message {
    flex: 1;
    line-height: 1.4;
    color: inherit;
  }

  .st-action {
    font-size: 11px;
    font-weight: 600;
    color: inherit;
    opacity: 0.75;
    text-decoration: underline;
    text-underline-offset: 2px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .st-action:hover {
    opacity: 1;
  }

  .st-close {
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    opacity: 0.5;
    font-size: 11px;
    padding: 2px;
    line-height: 1;
    flex-shrink: 0;
    transition: opacity 0.15s;
  }

  .st-close:hover {
    opacity: 1;
  }

  @keyframes st-slide-in {
    from {
      opacity: 0;
      transform: translateX(24px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
  }

  @media (max-width: 480px) {
    .st-stack {
      top: auto;
      bottom: 80px;
      right: 12px;
      left: 12px;
      width: auto;
    }
  }
</style>
