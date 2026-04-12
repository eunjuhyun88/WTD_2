<script lang="ts">
  import { onDestroy } from 'svelte';
  import { toasts, type Toast, type ToastLevel } from '$lib/stores/notificationStore';

  let items: Toast[] = [];
  $: items = $toasts;

  // Auto-dismiss timer map
  let timers: Record<string, ReturnType<typeof setTimeout>> = {};

  // Set auto-dismiss timers when items change
  $: {
    for (const toast of items) {
      if (!timers[toast.id]) {
        timers[toast.id] = setTimeout(() => {
          toasts.dismiss(toast.id);
          delete timers[toast.id];
        }, 7000);
      }
    }
  }

  onDestroy(() => {
    for (const id of Object.keys(timers)) {
      clearTimeout(timers[id]);
    }
  });

  function dismiss(id: string) {
    if (timers[id]) {
      clearTimeout(timers[id]);
      delete timers[id];
    }
    toasts.dismiss(id);
  }

  function levelColor(level: ToastLevel): string {
    switch (level) {
      case 'medium': return 'var(--dim)';
      case 'high': return 'var(--ora)';
      case 'critical': return 'var(--red)';
      default: return 'var(--dim)';
    }
  }

  function levelBg(level: ToastLevel): string {
    switch (level) {
      case 'medium': return 'rgba(255,255,255,0.06)';
      case 'high': return 'rgba(255,140,59,0.1)';
      case 'critical': return 'rgba(255,45,85,0.12)';
      default: return 'rgba(255,255,255,0.04)';
    }
  }

  function levelLabel(level: ToastLevel): string {
    return level.toUpperCase();
  }
</script>

<div class="toast-stack">
  {#each items as toast (toast.id)}
    <div
      class="toast-item"
      class:critical-pulse={toast.level === 'critical'}
      class:subtle={toast.level === 'medium'}
      style="border-left-color: {levelColor(toast.level)}; background: {levelBg(toast.level)}"
    >
      <div class="toast-badge" style="background: {levelColor(toast.level)}; color: {toast.level === 'medium' ? '#000' : '#fff'}">
        {levelLabel(toast.level)}
      </div>
      <div class="toast-content">
        <span class="toast-title">{toast.title}</span>
        <span class="toast-score">SCORE: {toast.score}</span>
      </div>
      <button class="toast-dismiss" on:click={() => dismiss(toast.id)}>✕</button>
      <div class="toast-timer-bar"></div>
    </div>
  {/each}
</div>

<style>
  .toast-stack {
    position: fixed;
    bottom: 124px;
    right: 18px;
    z-index: 195;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 320px;
    max-width: calc(100vw - 36px);
    pointer-events: none;
  }

  .toast-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 2px solid #000;
    border-left: 4px solid;
    border-radius: 10px;
    box-shadow: var(--shadow);
    backdrop-filter: blur(12px);
    pointer-events: all;
    animation: toastSlideIn .3s cubic-bezier(.4, 0, .2, 1);
    position: relative;
    overflow: hidden;
  }

  .toast-item.subtle {
    opacity: 0.85;
  }

  .toast-item.critical-pulse {
    animation: toastSlideIn .3s cubic-bezier(.4, 0, .2, 1), criticalPulse 1.5s ease infinite;
  }

  @keyframes toastSlideIn {
    from {
      opacity: 0;
      transform: translateX(40px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
  }

  @keyframes criticalPulse {
    0%, 100% {
      box-shadow: var(--shadow), 0 0 0 0 rgba(255, 45, 85, 0);
    }
    50% {
      box-shadow: var(--shadow), 0 0 12px 2px rgba(255, 45, 85, 0.4);
    }
  }

  .toast-badge {
    font-family: var(--fm);
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 1.5px;
    padding: 2px 7px;
    border-radius: 4px;
    flex-shrink: 0;
    border: 1px solid rgba(0, 0, 0, 0.3);
  }

  .toast-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toast-title {
    font-family: var(--fm);
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.5px;
    color: var(--fg-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .toast-score {
    font-family: var(--fd);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 2px;
    color: var(--dim);
  }

  .toast-dismiss {
    font-size: 11px;
    color: var(--dim);
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    flex-shrink: 0;
    transition: color .15s;
    line-height: 1;
  }
  .toast-dismiss:hover {
    color: var(--red);
  }

  /* Timer bar at the bottom of each toast */
  .toast-timer-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: var(--yel);
    animation: timerShrink 7s linear forwards;
    border-radius: 0 0 0 8px;
  }

  @keyframes timerShrink {
    from {
      width: 100%;
    }
    to {
      width: 0%;
    }
  }
</style>
