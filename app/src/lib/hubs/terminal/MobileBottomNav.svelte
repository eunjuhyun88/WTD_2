<script lang="ts">
  /**
   * MobileBottomNav — PR14 W-0402 §12
   * 56px bottom nav for mobile (≤768px).
   * Structure:
   *   Top strip (20px): mini StatusBar — verdict pill + time + freshness indicator
   *   Nav row (36px): 4 navigation buttons (CHART / VER / RES / JUDGE)
   *
   * Absorbs StatusBar critical items (verdict, time, freshness).
   * Replaces TabStrip role (4-button nav).
   */

  export type MobileNavView = 'chart' | 'verdict' | 'research' | 'judge';

  interface Props {
    activeView: MobileNavView;
    onViewChange: (v: MobileNavView) => void;
    /** Mini verdict: 'LONG' | 'SHORT' | 'WAIT' | null */
    lastVerdictKind?: 'LONG' | 'SHORT' | 'WAIT' | null;
    /** Epoch ms of latest data tick. null = unknown. */
    lastUpdatedAt?: number | null;
    /** Verdict count */
    verdicts?: number;
  }

  const {
    activeView,
    onViewChange,
    lastVerdictKind = null,
    lastUpdatedAt = null,
    verdicts = 0,
  }: Props = $props();

  const NAV_ITEMS: Array<{ id: MobileNavView; label: string }> = [
    { id: 'chart',   label: 'CHART' },
    { id: 'verdict', label: 'VER'   },
    { id: 'research',label: 'RES'   },
    { id: 'judge',   label: 'JUDGE' },
  ];

  // Time display (updates every second)
  function getTime(): string {
    return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  }
  let currentTime = $state(getTime());
  let nowMs = $state(Date.now());

  $effect(() => {
    const interval = setInterval(() => {
      currentTime = getTime();
      nowMs = Date.now();
    }, 1000);
    return () => clearInterval(interval);
  });

  const freshnessSec = $derived(
    lastUpdatedAt == null ? null : Math.max(0, Math.floor((nowMs - lastUpdatedAt) / 1000)),
  );
  const freshnessClass = $derived(
    freshnessSec == null ? '' :
    freshnessSec < 15 ? 'fresh-good' :
    freshnessSec < 60 ? 'fresh-warn' : 'fresh-stale',
  );
</script>

<nav class="mobile-bottom-nav" aria-label="Mobile navigation">
  <!-- Top strip: mini StatusBar (20px) -->
  <div class="status-strip">
    {#if lastVerdictKind}
      <span
        class="verdict-mini"
        class:vp-long={lastVerdictKind === 'LONG'}
        class:vp-short={lastVerdictKind === 'SHORT'}
        class:vp-wait={lastVerdictKind === 'WAIT'}
        aria-label="Latest verdict: {lastVerdictKind}"
      >{lastVerdictKind}</span>
      <span class="strip-sep">·</span>
    {/if}
    <span class="strip-item">v<strong>{verdicts}</strong></span>
    <span class="strip-spacer"></span>
    {#if freshnessSec !== null}
      <span class="strip-item {freshnessClass}" title="Data freshness">{freshnessSec}s</span>
      <span class="strip-sep">·</span>
    {/if}
    <span class="strip-time">{currentTime}</span>
  </div>

  <!-- Nav row: 4 buttons (36px) -->
  <div class="nav-row" role="tablist">
    {#each NAV_ITEMS as item}
      <button
        class="nav-btn"
        class:active={activeView === item.id}
        onclick={() => onViewChange(item.id)}
        role="tab"
        aria-selected={activeView === item.id}
        aria-label={item.label}
      >{item.label}</button>
    {/each}
  </div>
</nav>

<style>
  .mobile-bottom-nav {
    /* PR14: 56px total = 20px strip + 36px nav */
    height: 56px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--g1);
    border-top: 1px solid var(--g4);
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    z-index: 40;
  }

  /* ── Top strip: mini StatusBar (20px) ── */
  .status-strip {
    height: 20px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border-bottom: 1px solid var(--g3);
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--g6);
    letter-spacing: 0.04em;
  }

  .strip-sep {
    color: var(--g4);
  }

  .strip-item {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  .strip-item strong {
    color: var(--g8);
  }

  .strip-spacer {
    flex: 1;
  }

  .strip-time {
    color: var(--g7);
    font-size: 10px;
  }

  .verdict-mini {
    display: inline-block;
    padding: 0 5px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    border-radius: 2px;
    border: 0.5px solid var(--g4);
    background: var(--g2);
    color: var(--amb, #f5a623);
  }
  .verdict-mini.vp-long  { color: var(--pos); border-color: color-mix(in srgb, var(--pos) 40%, transparent); }
  .verdict-mini.vp-short { color: var(--neg); border-color: color-mix(in srgb, var(--neg) 40%, transparent); }
  .verdict-mini.vp-wait  { color: var(--amb, #d6a347); border-color: color-mix(in srgb, var(--amb, #d6a347) 40%, transparent); }

  .fresh-good { color: var(--pos); }
  .fresh-warn { color: var(--amb, #d6a347); }
  .fresh-stale { color: var(--neg); }

  /* ── Nav row: 4 tab buttons (36px) ── */
  .nav-row {
    flex: 1;
    display: flex;
  }

  .nav-btn {
    flex: 1;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--g6);
    background: transparent;
    border: none;
    border-right: 1px solid var(--g3);
    cursor: pointer;
    transition: color 0.12s, background 0.12s;
    padding: 0;
  }
  .nav-btn:last-child { border-right: none; }

  .nav-btn.active {
    color: var(--brand);
    background: var(--g1);
    border-top: 1.5px solid var(--brand);
  }

  .nav-btn:active {
    background: var(--g2);
  }

  /* Only render on mobile — desktop never sees this component */
  @media (min-width: 769px) {
    .mobile-bottom-nav {
      display: none;
    }
  }
</style>
