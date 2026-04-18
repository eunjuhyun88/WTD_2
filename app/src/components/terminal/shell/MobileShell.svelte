<script lang="ts">
  /**
   * MobileShell.svelte
   *
   * Mobile-tier shell (W-0087): single flex-column layout.
   *   [MobileSymbolStrip]  — slim 48px top strip (Chart & Detail modes)
   *   [ModeRouter]         — body; switches between Chart / Detail / Scan / Judge
   *   [MobilePromptFooter] — sticky prompt footer above BottomTabBar
   *   [BottomTabBar]       — fixed bottom navigation
   *
   * The desktop slot snippets (slotChart, slotRail, etc.) are NOT used here.
   * ModeRouter drives all content. Data required by ModeRouter is forwarded
   * as typed props from TerminalShell.
   */

  import MobileSymbolStrip from '../mobile/MobileSymbolStrip.svelte';
  import ModeRouter from '../mobile/ModeRouter.svelte';
  import MobilePromptFooter from '../mobile/MobilePromptFooter.svelte';
  import BottomTabBar from '../mobile/BottomTabBar.svelte';
  import type { TerminalVerdict, TerminalEvidence } from '$lib/types/terminal';

  interface MarketRow {
    symbol: string;
    base: string;
    price: number;
    changePct: number;
    volume24h?: number;
    bias?: 'bullish' | 'bearish' | 'neutral';
  }

  type AlertStatus = 'pending' | 'agreed' | 'disagreed';
  type AlertReason = 'valid' | 'late' | 'noisy' | 'invalid' | 'almost';

  interface Alert {
    id: string;
    symbol: string;
    tf: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    summary: string;
    timestamp: number;
    status: AlertStatus;
    reason?: AlertReason;
  }

  interface Props {
    verdict?: TerminalVerdict | null;
    evidence?: TerminalEvidence[];
    captureId?: string | null;
    marketRows?: MarketRow[];
    alerts?: Alert[];
    marketLoading?: boolean;
    alertsLoading?: boolean;
    onAlertFeedback?: (id: string, agree: boolean, reason?: AlertReason) => void;
    onMarketRefresh?: () => void;
  }

  let {
    verdict = null,
    evidence = [],
    captureId = null,
    marketRows = [],
    alerts = [],
    marketLoading = false,
    alertsLoading = false,
    onAlertFeedback,
    onMarketRefresh,
  }: Props = $props();
</script>

<div class="mobile-shell">
  <MobileSymbolStrip />

  <div class="mode-body">
    <ModeRouter
      {verdict}
      {evidence}
      {captureId}
      {marketRows}
      {alerts}
      {marketLoading}
      {alertsLoading}
      {onAlertFeedback}
      {onMarketRefresh}
    />
  </div>

  <MobilePromptFooter />

  <BottomTabBar />
</div>

<style>
  .mobile-shell {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--sc-terminal-bg, #0a0c10);
    /* Reserve space at the bottom for the fixed BottomTabBar */
    padding-bottom: calc(56px + env(safe-area-inset-bottom));
    box-sizing: border-box;
  }

  .mode-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
