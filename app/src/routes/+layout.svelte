<script lang="ts">
  import '../app.css';
  import { dev } from '$app/environment';
  import { injectAnalytics } from '@vercel/analytics/sveltekit';
  import Header from '../components/layout/Header.svelte';
  import BottomBar from '../components/layout/BottomBar.svelte';
  import MobileBottomNav from '../components/layout/MobileBottomNav.svelte';
  import WalletModal from '../components/modals/WalletModal.svelte';
  import NotificationTray from '../components/shared/NotificationTray.svelte';
  import ToastStack from '../components/shared/ToastStack.svelte';
  import CookieConsent from '../components/shared/CookieConsent.svelte';
  import P0Banner from '../components/shared/P0Banner.svelte';
  import { page } from '$app/stores';
  import { activePairState, setActiveView } from '$lib/stores/activePairStore';
  import { alphaBuckets } from '$lib/stores/alphaBuckets';
  import { EMPTY_THERMO_DATA, type ThermoData, startThermoPolling } from '$lib/cogochi/marketPulse';
  import { startGlobalPriceFeed } from '$lib/layout/globalPriceFeed';
  import { derived } from 'svelte/store';
  import { onMount, onDestroy } from 'svelte';

  injectAnalytics({ mode: dev ? 'development' : 'production' });

  let { children } = $props();

  let thermoData = $state<ThermoData>(EMPTY_THERMO_DATA);
  const currentBuckets = $derived($alphaBuckets);

  const isTerminal = derived(page, $p => $p.url.pathname.startsWith('/terminal'));
  const isHome = derived(page, $p => $p.url.pathname === '/');
  const isCogochi = derived(page, $p => $p.url.pathname.startsWith('/cogochi'));
  const showGlobalChrome = derived(page, $p => {
    const path = $p.url.pathname;
    return !path.startsWith('/cogochi');
  });
  const isScrollableSurface = derived(
    page,
    $p => !$p.url.pathname.startsWith('/terminal') && !$p.url.pathname.startsWith('/cogochi') && $p.url.pathname !== '/'
  );

  // Hide global BottomBar on mobile (unneeded chrome on small screens)
  // - Terminal routes ≤1024px: terminal has its own bottom nav
  // - All routes ≤768px: status bar adds no value on phones
  let windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1200);
  // Hide mobile nav on terminal — terminal has its own TerminalBottomDock
  const showMobileBottomNav = $derived(windowWidth <= 768 && !$isHome && !$isTerminal);
  // Terminal has its own CommandBar with price — BottomBar would duplicate it
  const showBottomBar = $derived(
    windowWidth > 768 && !$isHome && !$isTerminal
  );

  // Sync currentView store from URL via effect
  $effect(() => {
    const path = $page.url.pathname;
    const view = path.startsWith('/terminal') ? 'terminal'
      : path.startsWith('/passport') || path.startsWith('/lab') || path.startsWith('/agent') ? 'passport'
      : path.startsWith('/arena') || path.startsWith('/arena-war') || path.startsWith('/arena-v2') ? 'arena'
      : null;
    if (!view) return;
    setActiveView(view);
  });

  let stopThermoPolling: (() => void) | null = null;
  let stopGlobalPriceFeed: (() => void) | null = null;
  let stopResizeTracking: (() => void) | null = null;

  onMount(async () => {
    const handleResize = () => { windowWidth = window.innerWidth; };
    window.addEventListener('resize', handleResize);
    stopResizeTracking = () => window.removeEventListener('resize', handleResize);
    stopThermoPolling = startThermoPolling((next) => {
      thermoData = next;
    });
    stopGlobalPriceFeed = startGlobalPriceFeed();
  });

  onDestroy(() => {
    if (stopGlobalPriceFeed) stopGlobalPriceFeed();
    if (stopResizeTracking) stopResizeTracking();
    if (stopThermoPolling) stopThermoPolling();
  });
</script>

<div
  id="app"
  class:cogochi-mode={$isCogochi}
  class:terminal-mode={$isTerminal}
  class:home-mode={$isHome}
>
  {#if $showGlobalChrome}<Header />{/if}
  {#if $showGlobalChrome}<P0Banner />{/if}
  <div
    id="main-content"
    class:terminal-route={$isTerminal}
    class:home-route={$isHome}
    class:scrollable-surface={$isScrollableSurface}
  >
    {@render children()}
  </div>
  {#if !$isCogochi}
    {#if showBottomBar}
      <BottomBar thermo={thermoData} buckets={currentBuckets} />
    {:else if showMobileBottomNav}
      <MobileBottomNav />
    {/if}
  {/if}
</div>

<!-- Global Wallet Modal -->
<WalletModal />

<!-- Global Notification Tray (bottom-right bell + slide-up panel) -->
<NotificationTray />

<!-- Global Toast Stack (bottom-right, above bell) -->
<ToastStack />

<!-- Cookie Consent Banner -->
<CookieConsent />

<style>
  #app {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    min-height: 100vh;
    padding-top: var(--sc-header-h, 52px);
    overflow: hidden;
    position: relative;
  }
  #app.cogochi-mode {
    padding-top: 0;
  }
  #app.terminal-mode {
    --sc-consent-reserved-h: 0px;
    --sc-consent-bottom: 16px;
  }
  #app.home-mode {
    height: auto;
    min-height: 100dvh;
    overflow: visible;
  }
  #main-content {
    flex: 1;
    overflow: hidden;
    position: relative;
    min-height: 0;
  }
  #main-content.scrollable-surface {
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
  }
  #main-content.home-route {
    overflow: visible;
    min-height: calc(100dvh - var(--sc-header-h, 52px));
  }

  @media (max-width: 1024px) {
    #app {
      height: 100svh;
      min-height: 100svh;
    }
  }
  @media (max-width: 768px) {
    #app {
      padding-top: var(--sc-header-h-mobile, 52px);
      padding-bottom: calc(var(--sc-mobile-nav-h, 68px) + env(safe-area-inset-bottom, 0px));
    }
    #app.home-mode {
      min-height: 100svh;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }
    /* Terminal has its own bottom dock — no MobileBottomNav padding needed */
    #app.terminal-mode {
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }
    #main-content {
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-y: contain;
    }
    #main-content.terminal-route {
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-y: contain;
    }
    #main-content.home-route {
      overflow: visible;
      min-height: calc(100svh - var(--sc-header-h-mobile, 52px));
    }
  }
</style>
