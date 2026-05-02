<script lang="ts">
  /**
   * MarketDrawer.svelte
   *
   * Left drawer opened from top-bar market button.
   * Per W-0078: market UI must not occupy permanent shell space by default.
   * Per W-0078: opens only from top-bar market button and behaves like a proper drawer.
   *
   * This component is a thin wrapper around TerminalLeftRail content;
   * the shell controls visibility via the `open` prop.
   */
  import TerminalLeftRail from './TerminalLeftRail.svelte';
  import type { MacroCalendarItem, TerminalAlertRule, TerminalWatchlistItem } from '$lib/contracts/terminalPersistence';

  interface PatternPhaseRow { slug: string; phaseName: string; symbols: string[]; }

  interface Props {
    open: boolean;
    onClose?: () => void;
    trendingData?: any;
    watchlistRows?: TerminalWatchlistItem[];
    alerts?: any[];
    savedAlerts?: TerminalAlertRule[];
    patternPhases?: PatternPhaseRow[];
    activeSymbol?: string;
    macroItems?: MacroCalendarItem[];
    marketEvents?: Array<{ tag?: string; level?: string; text?: string }>;
    queryPresets?: any[];
    anomalies?: any[];
    onQuery?: (query: string) => void;
    onDeleteSavedAlert?: (id: string) => void;
  }

  let {
    open,
    onClose,
    trendingData,
    watchlistRows = [],
    alerts = [],
    savedAlerts = [],
    patternPhases = [],
    activeSymbol = '',
    macroItems = [],
    marketEvents = [],
    queryPresets = [],
    anomalies = [],
    onQuery,
    onDeleteSavedAlert,
  }: Props = $props();
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="drawer-scrim"
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose?.()}
    role="none"
  ></div>
{/if}

<aside class="market-drawer" class:open>
  <div class="drawer-head">
    <span class="drawer-title">Market Rail</span>
    <button
      class="drawer-close"
      type="button"
      onclick={onClose}
      aria-label="Close market drawer"
    >✕</button>
  </div>

  <div class="drawer-body">
    <TerminalLeftRail
      {trendingData}
      {watchlistRows}
      {alerts}
      {savedAlerts}
      {patternPhases}
      {activeSymbol}
      {macroItems}
      {marketEvents}
      {queryPresets}
      {anomalies}
      {onQuery}
      {onDeleteSavedAlert}
    />
  </div>
</aside>

<style>
  .drawer-scrim {
    position: fixed;
    inset: 0;
    background: rgba(3, 6, 10, 0.42);
    z-index: 80;
    backdrop-filter: blur(2px);
  }

  .market-drawer {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 260px;
    z-index: 90;
    display: flex;
    flex-direction: column;
    background: var(--sc-bg-0, #0a0d12);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    transform: translateX(-100%);
    transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
  }

  .market-drawer.open {
    transform: translateX(0);
  }

  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    flex-shrink: 0;
  }

  .drawer-title {
    font-family: var(--sc-font-mono, monospace);
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(247, 242, 234, 0.42);
  }

  .drawer-close {
    background: none;
    border: none;
    color: rgba(247, 242, 234, 0.35);
    font-size: 12px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 2px;
  }

  .drawer-close:hover {
    color: rgba(247, 242, 234, 0.75);
    background: rgba(255, 255, 255, 0.05);
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }
</style>
