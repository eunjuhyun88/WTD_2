<script lang="ts">
  import { onMount } from 'svelte';
  import { notifications, unreadCount, seedNotifications, type Notification, type NotificationType } from '$lib/stores/notificationStore';

  let open = false;
  let items: Notification[] = [];
  let count = 0;

  $: items = $notifications;
  $: count = $unreadCount;

  onMount(() => {
    void (async () => {
      await notifications.hydrate();
      seedNotifications();
    })();
  });

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
  }

  function handleMarkRead(id: string) {
    notifications.markRead(id);
  }

  function handleMarkAllRead() {
    notifications.markAllRead();
  }

  function handleClearAll() {
    notifications.clearAll();
  }

  function handleDismiss(id: string) {
    notifications.remove(id);
  }

  function typeColor(type: NotificationType): string {
    switch (type) {
      case 'alert': return 'var(--ora)';
      case 'critical': return 'var(--red)';
      case 'info': return 'var(--blu)';
      case 'success': return 'var(--grn)';
      default: return 'var(--dim)';
    }
  }

  function typeIcon(type: NotificationType): string {
    switch (type) {
      case 'alert': return '⚠️';
      case 'critical': return '🚨';
      case 'info': return 'ℹ️';
      case 'success': return '✅';
      default: return '📌';
    }
  }

  function timeAgo(date: Date): string {
    const now = Date.now();
    const diff = now - date.getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }
</script>

<!-- Bell Button -->
<button class="bell-btn" onclick={toggle} aria-label="Notifications">
  <span class="bell-icon">🔔</span>
  {#if count > 0}
    <span class="bell-badge">{count > 9 ? '9+' : count}</span>
  {/if}
</button>

<!-- Overlay -->
{#if open}
  <button class="notif-overlay" onclick={close} aria-label="Close notifications"></button>
{/if}

<!-- Tray Panel -->
<div class="notif-tray" class:open>
  <div class="tray-header">
    <span class="tray-title">NOTIFICATIONS</span>
    <div class="tray-actions">
      <button class="tray-action" onclick={handleMarkAllRead}>MARK ALL READ</button>
      <button class="tray-action danger" onclick={handleClearAll}>CLEAR ALL</button>
    </div>
    <button class="tray-close" onclick={close}>✕</button>
  </div>

  <div class="tray-list">
    {#if items.length === 0}
      <div class="tray-empty">No notifications</div>
    {:else}
      {#each items as notif (notif.id)}
        <div
          class="notif-item"
          class:unread={!notif.read}
          style="border-left-color: {typeColor(notif.type)}"
          role="button"
          tabindex="0"
          onclick={() => handleMarkRead(notif.id)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleMarkRead(notif.id); }}
        >
          <div class="notif-icon">{typeIcon(notif.type)}</div>
          <div class="notif-content">
            <div class="notif-title-row">
              <span class="notif-title">{notif.title}</span>
              <span class="notif-time">{timeAgo(notif.time)}</span>
            </div>
            <div class="notif-body">{notif.body}</div>
          </div>
          {#if notif.dismissable}
            <button class="notif-dismiss" onclick={(e) => { e.stopPropagation(); handleDismiss(notif.id); }}>✕</button>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  /* ── Bell Button ── */
  .bell-btn {
    position: fixed;
    bottom: calc(84px + env(safe-area-inset-bottom));
    right: 12px;
    z-index: 200;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--card);
    border: 3px solid #000;
    box-shadow: var(--shadow);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all .15s;
  }
  .bell-btn:hover {
    transform: translate(-1px, -1px);
    box-shadow: 4px 4px 0 #000;
  }
  .bell-icon {
    font-size: 18px;
    line-height: 1;
  }
  .bell-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: var(--red);
    color: #fff;
    font-family: var(--fm);
    font-size: var(--ui-text-xs);
    font-weight: 900;
    min-width: 18px;
    height: 18px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid #000;
    letter-spacing: 0.5px;
    animation: pulse 2s ease infinite;
  }

  @media (min-width: 1024px) {
    .bell-btn {
      bottom: 26px;
      right: 18px;
    }
  }

  /* ── Overlay ── */
  .notif-overlay {
    position: fixed;
    inset: 0;
    z-index: 198;
    background: rgba(0, 0, 0, 0.4);
    border: none;
    cursor: default;
  }

  /* ── Tray Panel ── */
  .notif-tray {
    position: fixed;
    bottom: 0;
    right: 0;
    width: 380px;
    max-width: 100vw;
    max-height: 70vh;
    z-index: 199;
    background: var(--card);
    border: 3px solid #000;
    border-bottom: none;
    border-radius: 16px 16px 0 0;
    box-shadow: -4px -4px 0 #000;
    display: flex;
    flex-direction: column;
    transform: translateY(100%);
    transition: transform .3s cubic-bezier(.4, 0, .2, 1);
    overflow: hidden;
  }
  .notif-tray.open {
    transform: translateY(0);
  }

  /* ── Tray Header ── */
  .tray-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 3px solid #000;
    background: var(--blk);
    flex-shrink: 0;
  }
  .tray-title {
    font-family: var(--fd);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 3px;
    color: var(--yel);
  }
  .tray-actions {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }
  .tray-action {
    font-family: var(--fm);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 1px;
    color: var(--dim);
    background: none;
    border: 1px solid var(--dimmer);
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    transition: all .15s;
  }
  .tray-action:hover {
    color: var(--yel);
    border-color: var(--yel);
  }
  .tray-action.danger:hover {
    color: var(--red);
    border-color: var(--red);
  }
  .tray-close {
    font-size: 12px;
    color: var(--dim);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 2px;
    margin-left: 4px;
    transition: color .15s;
  }
  .tray-close:hover {
    color: var(--red);
  }

  /* ── Tray List ── */
  .tray-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px 0;
  }
  .tray-empty {
    text-align: center;
    padding: 30px 14px;
    font-family: var(--fm);
    font-size: var(--ui-text-xs);
    color: var(--dim);
    letter-spacing: 1px;
  }

  /* ── Notification Item ── */
  .notif-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 14px;
    border-left: 4px solid transparent;
    cursor: pointer;
    transition: background .12s;
    position: relative;
  }
  .notif-item:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  .notif-item.unread {
    background: rgba(232,150,125, 0.03);
  }
  .notif-item.unread::after {
    content: '';
    position: absolute;
    top: 14px;
    right: 14px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--yel);
  }

  .notif-icon {
    font-size: 14px;
    flex-shrink: 0;
    line-height: 1;
    margin-top: 1px;
  }

  .notif-content {
    flex: 1;
    min-width: 0;
  }
  .notif-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 3px;
  }
  .notif-title {
    font-family: var(--fm);
    font-size: var(--ui-text-xs);
    font-weight: 900;
    letter-spacing: 1px;
    color: var(--fg-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .notif-time {
    font-family: var(--fm);
    font-size: var(--ui-text-xs);
    color: var(--dim);
    flex-shrink: 0;
    margin-left: auto;
  }
  .notif-body {
    font-family: var(--fm);
    font-size: var(--ui-text-xs);
    color: var(--fg-medium);
    line-height: var(--lh-relaxed);
    word-wrap: break-word;
  }

  .notif-dismiss {
    font-size: var(--ui-text-xs);
    color: var(--dim);
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    flex-shrink: 0;
    transition: color .15s;
    margin-top: 2px;
  }
  .notif-dismiss:hover {
    color: var(--red);
  }
</style>
