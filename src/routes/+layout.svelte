<script lang="ts">
  import '../app.css';
  import Header from '../components/layout/Header.svelte';
  import BottomBar from '../components/layout/BottomBar.svelte';
  import MobileBottomNav from '../components/layout/MobileBottomNav.svelte';
  import WalletModal from '../components/modals/WalletModal.svelte';
  import NotificationTray from '../components/shared/NotificationTray.svelte';
  import ToastStack from '../components/shared/ToastStack.svelte';
  import P0Banner from '../components/shared/P0Banner.svelte';
  import AlphaMarketBar from '../components/cogochi/AlphaMarketBar.svelte';
  import { page } from '$app/stores';
  import { gameState } from '$lib/stores/gameState';
  import { alphaBuckets } from '$lib/stores/alphaBuckets';
  import { derived } from 'svelte/store';
  import { onMount, onDestroy } from 'svelte';
  import { fetchPrices, fetch24hrMulti, subscribeMiniTicker } from '$lib/api/binance';
  import { updatePrice, updatePrices as updatePriceStore, updatePriceFull } from '$lib/stores/priceStore';

  let { children } = $props();

  // ─── Global Thermometer (F&G, Kimchi, BTC.D, mempool, fee, USD/KRW) ───
  interface ThermoData {
    fearGreed: number | null;
    btcDominance: number | null;
    kimchiPremium: number | null;
    usdKrw: number | null;
    btcTx: number | null;
    mempoolPending: number | null;
    fastestFee: number | null;
  }
  let thermoData = $state<ThermoData>({
    fearGreed: null,
    btcDominance: null,
    kimchiPremium: null,
    usdKrw: null,
    btcTx: null,
    mempoolPending: null,
    fastestFee: null,
  });
  const currentBuckets = $derived($alphaBuckets);
  let thermoTimer: ReturnType<typeof setInterval> | null = null;

  async function loadThermo(): Promise<void> {
    try {
      const r = await fetch('/api/cogochi/thermometer', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      thermoData = {
        fearGreed: d.fearGreed ?? null,
        btcDominance: d.btcDominance ?? null,
        kimchiPremium: d.kimchiPremium ?? null,
        usdKrw: d.usdKrw ?? null,
        btcTx: d.btcTx ?? null,
        mempoolPending: d.mempoolPending ?? null,
        fastestFee: d.fastestFee ?? null,
      };
    } catch {
      /* silent */
    }
  }

  const isTerminal = derived(page, $p => $p.url.pathname.startsWith('/terminal'));
  const isHome = derived(page, $p => $p.url.pathname === '/');
  const isCogochi = derived(page, $p => $p.url.pathname.startsWith('/cogochi'));

  // Hide global BottomBar on mobile (unneeded chrome on small screens)
  // - Terminal routes ≤1024px: terminal has its own bottom nav
  // - All routes ≤768px: status bar adds no value on phones
  let windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const showMobileBottomNav = $derived(windowWidth <= 768);
  const showBottomBar = $derived(
    windowWidth > 768 && !$isHome && !($isTerminal && windowWidth <= 1024)
  );

  // Sync currentView store from URL via effect
  $effect(() => {
    const path = $page.url.pathname;
    const view = path.startsWith('/terminal') ? 'terminal'
      : path.startsWith('/passport') || path.startsWith('/lab') || path.startsWith('/agent') ? 'passport'
      : path.startsWith('/arena') || path.startsWith('/arena-war') || path.startsWith('/arena-v2') ? 'arena'
      : null;
    if (!view) return;
    gameState.update(s => {
      if (s.currentView !== view) return { ...s, currentView: view };
      return s;
    });
  });

  // ─── S-03: Global Price Feed (single WS → priceStore) ──────
  const TRACKED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;
  const SYMBOL_MAP: Record<string, string> = { BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL' };

  let globalWsCleanup: (() => void) | null = null;
  let _wsFlushTimer: ReturnType<typeof setTimeout> | null = null;
  let _wsFullFlushTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(async () => {
    // Track viewport width for conditional BottomBar
    const handleResize = () => { windowWidth = window.innerWidth; };
    window.addEventListener('resize', handleResize);
    _resizeCleanup = () => window.removeEventListener('resize', handleResize);

    // Global Thermometer: initial load + 60s polling
    void loadThermo();
    thermoTimer = setInterval(() => { void loadThermo(); }, 60_000);

    // 1) REST bootstrap — 초기 가격 + 24h 통계 세팅
    try {
      const [prices, tickers24] = await Promise.all([
        fetchPrices([...TRACKED_SYMBOLS]),
        fetch24hrMulti([...TRACKED_SYMBOLS]).catch(() => [] as any[]),
      ]);
      // 24hr 풀 데이터가 있으면 사용, 없으면 가격만
      const tickerMap = new Map<string, any>();
      for (const t of tickers24) { if (t?.symbol) tickerMap.set(t.symbol, t); }

      const updates: Record<string, number> = {};
      for (const [sym, price] of Object.entries(prices)) {
        const key = SYMBOL_MAP[sym];
        if (!key || !Number.isFinite(price) || price <= 0) continue;
        updates[key] = price;
        const t24 = tickerMap.get(sym);
        if (t24) {
          updatePriceFull(key, {
            price,
            ts: Date.now(),
            source: 'rest',
            change24h: parseFloat(t24.priceChangePercent) || 0,
            high24h: parseFloat(t24.highPrice) || 0,
            low24h: parseFloat(t24.lowPrice) || 0,
            volume24h: parseFloat(t24.quoteVolume) || 0,
          });
        } else {
          updatePrice(key, price, 'rest');
        }
      }
      if (Object.keys(updates).length) {
        // bases만 초기화 (prices는 gameState 내부 auto-sync가 처리)
        gameState.update(s => ({
          ...s,
          bases: {
            BTC: updates.BTC ?? s.bases.BTC,
            ETH: updates.ETH ?? s.bases.ETH,
            SOL: updates.SOL ?? s.bases.SOL,
          },
        }));
      }
    } catch (e) {
      console.warn('[Layout] Failed to bootstrap prices, using defaults');
    }

    // 2) WS 구독 — 실시간 가격 + 24h% 업데이트 → priceStore (단일 소스)
    try {
      let _pending: Record<string, number> = {};

      // 24h 통계는 자주 바뀌지 않으므로 5초 간격으로 batch 처리
      type FullEntry = { price: number; change24h: number; high24h: number; low24h: number; volume24h: number };
      let _pendingFull: Record<string, FullEntry> = {};

      globalWsCleanup = subscribeMiniTicker([...TRACKED_SYMBOLS], (update) => {
        Object.assign(_pending, update);
        if (_wsFlushTimer) return;
        _wsFlushTimer = setTimeout(() => {
          _wsFlushTimer = null;
          const batch = _pending;
          _pending = {};
          const mapped: Record<string, number> = {};
          for (const [sym, price] of Object.entries(batch)) {
            const key = SYMBOL_MAP[sym];
            if (key && Number.isFinite(price) && price > 0) mapped[key] = price;
          }
          if (Object.keys(mapped).length) {
            updatePriceStore(mapped, 'ws');
            // gameState에는 live price를 다시 미러링하지 않는다.
          }
        }, 350);
      }, (fullUpdate) => {
        // onUpdateFull — batch로 모아서 5초마다 flush (24h% 는 초 단위 갱신 불필요)
        for (const [sym, data] of Object.entries(fullUpdate)) {
          const key = SYMBOL_MAP[sym];
          if (key && Number.isFinite(data.price) && data.price > 0) {
            _pendingFull[key] = data;
          }
        }
        if (_wsFullFlushTimer) return;
        _wsFullFlushTimer = setTimeout(() => {
          _wsFullFlushTimer = null;
          const batch = _pendingFull;
          _pendingFull = {};
          for (const [key, data] of Object.entries(batch)) {
            updatePriceFull(key, {
              price: data.price,
              ts: Date.now(),
              source: 'ws',
              change24h: data.change24h,
              high24h: data.high24h,
              low24h: data.low24h,
              volume24h: data.volume24h,
            });
          }
        }, 5000);
      });
    } catch (e) {
      console.warn('[Layout] Global WS connection failed');
    }
  });

  let _resizeCleanup: (() => void) | null = null;

  onDestroy(() => {
    if (_wsFlushTimer) clearTimeout(_wsFlushTimer);
    if (_wsFullFlushTimer) clearTimeout(_wsFullFlushTimer);
    if (globalWsCleanup) globalWsCleanup();
    if (_resizeCleanup) _resizeCleanup();
    if (thermoTimer) clearInterval(thermoTimer);
  });
</script>

<div id="app" class:cogochi-mode={$isCogochi}>
  {#if !$isCogochi}<Header />{/if}
  {#if !$isCogochi && !$isHome}<AlphaMarketBar thermo={thermoData} buckets={currentBuckets} />{/if}
  {#if !$isCogochi}<P0Banner />{/if}
  <div id="main-content" class:terminal-route={$isTerminal}>
    {@render children()}
  </div>
  {#if !$isCogochi}
    {#if showBottomBar}
      <BottomBar />
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

<style>
  #app {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    min-height: 100vh;
    padding-top: var(--sc-header-h, 44px);
    overflow: hidden;
    position: relative;
  }
  #app.cogochi-mode {
    padding-top: 0;
  }
  #main-content {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  /* 769-1024px: compact one-line header (44px) */
  @media (max-width: 1024px) {
    #app {
      height: 100svh;
      min-height: 100svh;
    }
  }
  @media (max-width: 768px) {
    #app {
      padding-top: var(--sc-header-h-mobile, 40px);
      padding-bottom: calc(var(--sc-mobile-nav-h, 64px) + env(safe-area-inset-bottom, 0px));
    }
    #main-content {
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-y: contain;
    }
    #main-content.terminal-route {
      overflow: hidden;
      overscroll-behavior: none;
    }
  }
  @media (max-width: 480px) {
    #app {
      padding-top: var(--sc-touch-sm, 36px);
    }
  }
</style>
