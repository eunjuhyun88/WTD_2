<script lang="ts">
  import { p0Override } from '$lib/stores/notificationStore';

  let p0 = $p0Override;
  $: p0 = $p0Override;

  function dismiss() {
    p0Override.clear();
  }

  function formatTime(date: Date | null): string {
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
</script>

{#if p0.active}
  <div class="p0-banner">
    <div class="p0-inner">
      <span class="p0-icon">⚠️</span>
      <span class="p0-text">
        P0 OVERRIDE: {p0.reason}
      </span>
      <span class="p0-recommendation">FORCED EXIT RECOMMENDED</span>
      {#if p0.triggeredAt}
        <span class="p0-time">{formatTime(p0.triggeredAt)}</span>
      {/if}
      <button class="p0-dismiss" on:click={dismiss}>CLEAR OVERRIDE</button>
    </div>
  </div>
{/if}

<style>
  .p0-banner {
    width: 100%;
    background:
      linear-gradient(90deg, rgba(163, 35, 58, 0.96), rgba(208, 70, 100, 0.92), rgba(163, 35, 58, 0.96));
    border-bottom: 1px solid rgba(255,255,255,0.08);
    padding: 0;
    z-index: 105;
    animation: p0ShakeIn .5s ease;
    flex-shrink: 0;
    overflow: hidden;
    position: relative;
  }

  .p0-banner::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 8px,
      rgba(0,0,0,0.08) 8px,
      rgba(0,0,0,0.08) 16px
    );
    pointer-events: none;
  }

  .p0-inner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    position: relative;
    z-index: 1;
  }

  .p0-icon {
    font-size: 14px;
    animation: p0Pulse 1s ease infinite;
    flex-shrink: 0;
  }

  .p0-text {
    font-family: var(--sc-font-body);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: #fff;
    text-shadow: 1px 1px 0 rgba(0,0,0,0.5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .p0-recommendation {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #fff;
    background: rgba(255,255,255,0.12);
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.14);
    flex-shrink: 0;
    animation: p0Pulse 1.5s ease infinite;
  }

  .p0-time {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    color: rgba(255,255,255,0.72);
    flex-shrink: 0;
  }

  .p0-dismiss {
    margin-left: auto;
    font-family: var(--sc-font-body);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: #fff;
    background: rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.22);
    border-radius: 999px;
    padding: 6px 12px;
    cursor: pointer;
    transition: all .15s;
    flex-shrink: 0;
  }
  .p0-dismiss:hover {
    background: rgba(0,0,0,0.7);
    border-color: #fff;
  }

  @media (max-width: 640px) {
    .p0-inner {
      flex-wrap: wrap;
      align-items: center;
    }

    .p0-recommendation {
      order: 3;
    }

    .p0-time {
      order: 4;
    }

    .p0-dismiss {
      margin-left: 0;
      width: 100%;
      justify-content: center;
    }
  }

  @keyframes p0ShakeIn {
    0% { transform: translateX(-100%); }
    40% { transform: translateX(2px); }
    55% { transform: translateX(-2px); }
    65% { transform: translateX(1px); }
    75% { transform: translateX(-1px); }
    100% { transform: translateX(0); }
  }

  @keyframes p0Pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
</style>
