<script lang="ts">
  import '../app.css';
  import { dev } from '$app/environment';
  import { injectAnalytics } from '@vercel/analytics/sveltekit';
  import Header from '../components/layout/Header.svelte';
  import AppNavRail from '../components/layout/AppNavRail.svelte';
  import AppTopBar from '../components/layout/AppTopBar.svelte';
  import MobileBottomNav from '../components/layout/MobileBottomNav.svelte';
  import WalletModal from '../components/modals/WalletModal.svelte';
  import NotificationTray from '../components/shared/NotificationTray.svelte';
  import ToastStack from '../components/shared/ToastStack.svelte';
  import CookieConsent from '../components/shared/CookieConsent.svelte';
  import { page } from '$app/stores';
  import { setActiveView } from '$lib/stores/activePairStore';
  import { startGlobalPriceFeed } from '$lib/layout/globalPriceFeed';
  import { derived } from 'svelte/store';
  import { onMount, onDestroy } from 'svelte';

  injectAnalytics({ mode: dev ? 'development' : 'production' });

  let { children } = $props();

  const isHome     = derived(page, $p => $p.url.pathname === '/');
  const isTerminal = derived(page, $p => $p.url.pathname.startsWith('/terminal') || $p.url.pathname.startsWith('/cogochi'));
  const isApp      = derived(page, $p => $p.url.pathname !== '/');
  const showTopBar = derived(page, $p => {
    const path = $p.url.pathname;
    return path !== '/' && !path.startsWith('/terminal') && !path.startsWith('/cogochi');
  });

  let windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const showMobileBottomNav = $derived(windowWidth <= 768);

  $effect(() => {
    const path = $page.url.pathname;
    const view = path.startsWith('/terminal') || path.startsWith('/cogochi') ? 'terminal'
      : path.startsWith('/passport') || path.startsWith('/lab') || path.startsWith('/agent') ? 'passport'
      : null;
    if (!view) return;
    setActiveView(view);
  });

  let stopGlobalPriceFeed: (() => void) | null = null;
  let stopResizeTracking: (() => void) | null = null;

  onMount(async () => {
    const handleResize = () => { windowWidth = window.innerWidth; };
    window.addEventListener('resize', handleResize);
    stopResizeTracking = () => window.removeEventListener('resize', handleResize);
    stopGlobalPriceFeed = startGlobalPriceFeed();

    const { initWalletListeners, trySilentReconnect } = await import('$lib/stores/walletStore');
    const stopWalletListeners = initWalletListeners();
    trySilentReconnect();

    const originalStopTracking = stopResizeTracking;
    stopResizeTracking = () => { originalStopTracking?.(); stopWalletListeners(); };
  });

  onDestroy(() => {
    if (stopGlobalPriceFeed) stopGlobalPriceFeed();
    if (stopResizeTracking) stopResizeTracking();
  });
</script>

<div
  id="app"
  class:home-mode={$isHome}
  class:terminal-mode={$isTerminal}
  class:app-mode={$isApp && !$isTerminal}
>
  {#if $isHome}
    <Header />
  {/if}

  {#if $isApp}
    <AppNavRail />
  {/if}
  {#if $showTopBar}
    <AppTopBar />
  {/if}

  <div id="main-content">
    {@render children()}
  </div>

  {#if showMobileBottomNav}
    <MobileBottomNav />
  {/if}
</div>

<WalletModal />
{#if !$isTerminal}<NotificationTray />{/if}
{#if !$isTerminal}<ToastStack />{/if}
<CookieConsent />

<style>
  #app {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    position: relative;
  }

  #app.home-mode {
    height: auto;
    overflow: visible;
  }

  #app.home-mode #main-content {
    overflow: visible;
    padding-top: 0;
    padding-left: 0;
  }

  #app.terminal-mode {
    height: 100dvh;
    overflow: hidden;
    --sc-consent-reserved-h: 0px;
    --sc-consent-bottom: 16px;
  }

  #app.terminal-mode #main-content {
    padding-top: 0;
    padding-left: 52px;
    height: 100dvh;
    overflow: hidden;
  }

  #app.app-mode #main-content {
    padding-top: 44px;
    padding-left: 52px;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    flex: 1;
  }

  @media (max-width: 768px) {
    #app.terminal-mode #main-content {
      padding-left: 0;
      padding-bottom: 0;
    }

    #app.app-mode #main-content {
      padding-left: 0;
      padding-top: 48px;
      padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
    }

    #app.home-mode #main-content {
      padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
    }
  }

  @media (max-width: 1024px) and (min-width: 769px) {
    #app.terminal-mode,
    #app.app-mode {
      height: 100svh;
      min-height: 100svh;
    }
  }
</style>
