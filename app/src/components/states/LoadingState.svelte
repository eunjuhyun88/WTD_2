<script lang="ts">
  interface Props {
    message?: string;
    symbol?: string;
    size?: 'sm' | 'md' | 'lg';
  }

  let { message = 'Loading…', symbol = '', size = 'md' }: Props = $props();
</script>

<div class="loading-state size-{size}">
  <div class="spinner-wrap">
    <span class="ring"></span>
    {#if symbol}
      <span class="sym-label">{symbol}</span>
    {/if}
  </div>
  <p class="msg">{message}</p>
</div>

<style>
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    min-height: 120px;
    opacity: 0.7;
  }

  .spinner-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ring {
    display: block;
    border: 2px solid rgba(255, 255, 255, 0.08);
    border-top-color: rgba(255, 255, 255, 0.5);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .size-sm .ring { width: 20px; height: 20px; }
  .size-md .ring { width: 32px; height: 32px; }
  .size-lg .ring { width: 48px; height: 48px; }

  @keyframes spin { to { transform: rotate(360deg); } }

  .sym-label {
    position: absolute;
    font-family: var(--sc-font-mono);
    font-weight: 700;
    color: var(--sc-text-1);
    font-size: 9px;
  }

  .msg {
    font-family: var(--sc-font-mono);
    color: var(--sc-text-2);
    margin: 0;
    animation: sc-pulse 1.4s ease-in-out infinite;
  }

  .size-sm .msg { font-size: 10px; }
  .size-md .msg { font-size: 11px; }
  .size-lg .msg { font-size: 13px; }

  @keyframes sc-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }
</style>
