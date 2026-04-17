<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';

  const STORAGE_KEY = 'cogotchi-cookie-consent';

  let visible = $state(false);

  function syncLayoutVars() {
    if (!browser) return;
    const root = document.documentElement;
    const isMobile = window.innerWidth <= 768;
    root.style.setProperty('--sc-consent-reserved-h', visible ? (isMobile ? '132px' : '96px') : '0px');
    root.style.setProperty('--sc-consent-bottom', visible ? '12px' : '16px');
  }

  onMount(() => {
    if (browser && !localStorage.getItem(STORAGE_KEY)) {
      visible = true;
    }
    syncLayoutVars();
    const handleResize = () => syncLayoutVars();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  });

  onDestroy(() => {
    if (!browser) return;
    const root = document.documentElement;
    root.style.setProperty('--sc-consent-reserved-h', '0px');
    root.style.setProperty('--sc-consent-bottom', '16px');
  });

  $effect(() => {
    syncLayoutVars();
  });

  function accept() {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    visible = false;
  }

  function decline() {
    localStorage.setItem(STORAGE_KEY, 'declined');
    visible = false;
    // Disable PageSense tracking
    if (typeof window !== 'undefined') {
      (window as any)._ps_conf = (window as any)._ps_conf || {};
      (window as any)._ps_conf.optOut = true;
    }
  }
</script>

{#if visible}
  <div class="cookie-banner" role="dialog" aria-label="Cookie consent">
    <p class="cookie-text">
      We use cookies to analyze site usage and improve your experience.
      <a href="/privacy" class="cookie-link">Privacy Policy</a>
    </p>
    <div class="cookie-actions">
      <button class="btn-decline" onclick={decline}>Decline</button>
      <button class="btn-accept" onclick={accept}>Accept</button>
    </div>
  </div>
{/if}

<style>
  .cookie-banner {
    position: fixed;
    bottom: var(--sc-consent-bottom, 16px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 20px;
    background: var(--lis-surface-2, rgba(20, 22, 28, 0.9));
    border: 1px solid var(--sc-line-soft);
    border-radius: 12px;
    backdrop-filter: blur(16px);
    box-shadow: var(--lis-shadow-md);
    max-width: 640px;
    width: calc(100% - 32px);
    font-family: var(--sc-font-body);
    animation: slide-up 0.3s ease-out;
  }

  @keyframes slide-up {
    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  .cookie-text {
    flex: 1;
    font-size: var(--sc-fs-xs, 12px);
    color: var(--sc-text-1);
    line-height: 1.4;
  }

  .cookie-link {
    color: var(--sc-accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .cookie-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .btn-decline,
  .btn-accept {
    padding: 6px 14px;
    border-radius: 8px;
    font-size: var(--sc-fs-xs, 12px);
    font-family: var(--sc-font-body);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    border: none;
  }

  .btn-decline {
    background: transparent;
    color: var(--sc-text-2);
    border: 1px solid var(--sc-line-soft);
  }
  .btn-decline:hover {
    color: var(--sc-text-1);
    border-color: var(--sc-line);
  }

  .btn-accept {
    background: var(--sc-accent);
    color: #000;
  }
  .btn-accept:hover {
    background: var(--sc-accent-hover);
  }

  @media (max-width: 480px) {
    .cookie-banner {
      flex-direction: column;
      text-align: center;
      bottom: var(--sc-consent-bottom, 12px);
    }
  }
</style>
