<script lang="ts">
  /**
   * WatchlistRail.svelte (peek/)
   *
   * Displays recent watch_hits (up to 20) with 30s SWR.
   * Dispatches 'symbolSelect' event on row click.
   * Mobile: hidden (desktop-only rail).
   *
   * TODO(W-0395): wire to real /api/cogochi/watchlist endpoint once available.
   * Currently uses mock data.
   */

  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  type WatchStatus = 'WATCHING' | 'HIT' | 'EXPIRED';

  interface WatchHit {
    id: string;
    symbol: string;
    confidence: number; // 0–100
    status: WatchStatus;
  }

  // TODO(W-0395): replace with real API call
  const MOCK_HITS: WatchHit[] = [
    { id: '1', symbol: 'BTCUSDT', confidence: 82, status: 'WATCHING' },
    { id: '2', symbol: 'ETHUSDT', confidence: 74, status: 'HIT' },
    { id: '3', symbol: 'SOLUSDT', confidence: 61, status: 'WATCHING' },
    { id: '4', symbol: 'BNBUSDT', confidence: 55, status: 'EXPIRED' },
    { id: '5', symbol: 'AVAXUSDT', confidence: 79, status: 'HIT' },
  ];

  const dispatch = createEventDispatcher<{ symbolSelect: { symbol: string } }>();

  let hits = $state<WatchHit[]>([]);
  let loading = $state(true);
  let error = $state(false);

  async function loadWatchHits() {
    // TODO(W-0395): swap for real endpoint: GET /api/cogochi/watchlist?limit=20
    try {
      // Simulate async load
      await Promise.resolve();
      hits = MOCK_HITS;
      error = false;
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    loadWatchHits();
    timer = setInterval(loadWatchHits, 30_000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  function handleSelect(symbol: string) {
    dispatch('symbolSelect', { symbol });
  }

  const STATUS_LABEL: Record<WatchStatus, string> = {
    WATCHING: 'WATCH',
    HIT: 'HIT',
    EXPIRED: 'EXP',
  };
</script>

<div class="watchlist-rail">
  <div class="rail-header">
    <span class="rail-title">WATCHLIST</span>
    {#if loading}
      <span class="rail-loading">…</span>
    {/if}
  </div>

  {#if error}
    <div class="rail-empty">
      <span class="empty-icon">⚠</span>
      <span class="empty-text">Load failed</span>
    </div>
  {:else if hits.length === 0 && !loading}
    <div class="rail-empty">
      <span class="empty-icon">◈</span>
      <span class="empty-text">No watches yet</span>
      <a class="cta-link" href="/patterns">+ 패턴 추가</a>
    </div>
  {:else}
    <ul class="hit-list">
      {#each hits as hit (hit.id)}
        <li>
          <button
            class="hit-row"
            onclick={() => handleSelect(hit.symbol)}
            type="button"
          >
            <span class="hit-symbol">{hit.symbol.replace('USDT', '')}</span>
            <span class="hit-conf">{hit.confidence}%</span>
            <span
              class="hit-chip"
              class:chip-watching={hit.status === 'WATCHING'}
              class:chip-hit={hit.status === 'HIT'}
              class:chip-expired={hit.status === 'EXPIRED'}
            >{STATUS_LABEL[hit.status]}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .watchlist-rail {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
    font-family: 'JetBrains Mono', monospace;
  }

  /* Mobile: rail is hidden — DesktopShell handles this via .shell-left-rail display:none */
  @media (max-width: 767px) {
    .watchlist-rail {
      display: none;
    }
  }

  .rail-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--g3, rgba(255, 255, 255, 0.07));
    flex-shrink: 0;
  }

  .rail-title {
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--g5, rgba(255, 255, 255, 0.40));
    text-transform: uppercase;
  }

  .rail-loading {
    font-size: var(--ui-text-xs);
    color: var(--g4, rgba(255, 255, 255, 0.28));
    animation: fade-pulse 1.2s ease-in-out infinite;
  }

  @keyframes fade-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  .rail-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
  }

  .empty-icon {
    font-size: 22px;
    color: var(--g4, rgba(255, 255, 255, 0.28));
  }

  .empty-text {
    font-size: var(--ui-text-xs);
    color: var(--g5, rgba(255, 255, 255, 0.40));
  }

  .cta-link {
    font-size: var(--ui-text-xs);
    font-weight: 700;
    color: var(--amb, #f5a623);
    text-decoration: none;
    border: 1px solid color-mix(in srgb, var(--amb, #f5a623) 35%, transparent);
    border-radius: 3px;
    padding: 3px 8px;
    transition: background 0.12s;
  }

  .cta-link:hover {
    background: color-mix(in srgb, var(--amb, #f5a623) 12%, transparent);
  }

  .hit-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;
  }

  .hit-row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 7px 10px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--g2, rgba(255, 255, 255, 0.05));
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .hit-row:hover {
    background: var(--g2, rgba(255, 255, 255, 0.05));
  }

  .hit-symbol {
    font-size: var(--ui-text-xs);
    font-weight: 700;
    color: var(--g9, rgba(255, 255, 255, 0.88));
    flex: 1;
    letter-spacing: 0.04em;
  }

  .hit-conf {
    font-size: var(--ui-text-xs);
    color: var(--g6, rgba(255, 255, 255, 0.55));
  }

  .hit-chip {
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 1px 5px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .chip-watching {
    background: color-mix(in srgb, #38bdf8 12%, transparent);
    color: #38bdf8;
    border: 1px solid color-mix(in srgb, #38bdf8 30%, transparent);
  }

  .chip-hit {
    background: color-mix(in srgb, #22ab94 12%, transparent);
    color: #22ab94;
    border: 1px solid color-mix(in srgb, #22ab94 30%, transparent);
  }

  .chip-expired {
    background: color-mix(in srgb, var(--g5, rgba(255,255,255,0.4)) 10%, transparent);
    color: var(--g5, rgba(255, 255, 255, 0.40));
    border: 1px solid color-mix(in srgb, var(--g5, rgba(255,255,255,0.4)) 25%, transparent);
  }
</style>
