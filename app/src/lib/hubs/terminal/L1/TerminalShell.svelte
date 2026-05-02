<script lang="ts">
  /**
   * TerminalShell.svelte
   *
   * Tier-branches via viewportTier store (W-0087):
   *   MOBILE  → MobileShell  (ModeRouter drives content; desktop slots ignored)
   *   TABLET  → TabletShell  (two-column; slotChart/slotRail/slotTopBar forwarded)
   *   DESKTOP → DesktopShell (W-0078 three-column)
   *
   * Desktop layout per W-0078 blueprint:
   *   [TerminalCommandBar] (top context bar — symbol owner)
   *   [MarketDrawer] [ChartBoard + ChartHeader + SaveStrip] [TerminalContextPanel]
   *   [TerminalBottomDock] (footer)
   */
  import { viewportTier } from '$lib/stores/viewportTier';
  import DesktopShell from './DesktopShell.svelte';
  import TabletShell from './TabletShell.svelte';
  import MobileShell from './MobileShell.svelte';
  import type { TerminalVerdict, TerminalEvidence } from '$lib/types/terminal';

  type AlertReason = 'valid' | 'late' | 'noisy' | 'invalid' | 'almost';

  interface MarketRow {
    symbol: string;
    base: string;
    price: number;
    changePct: number;
    volume24h?: number;
    bias?: 'bullish' | 'bearish' | 'neutral';
  }

  interface Alert {
    id: string;
    symbol: string;
    tf: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    summary: string;
    timestamp: number;
    status: 'pending' | 'agreed' | 'disagreed';
    reason?: AlertReason;
  }

  // ── Props ──────────────────────────────────────────────────────────────────
  interface Props {
    // Desktop/Tablet snippet slots
    slotTopBar?: import('svelte').Snippet;
    slotChart?: import('svelte').Snippet;
    slotRail?: import('svelte').Snippet;
    slotFooter?: import('svelte').Snippet;
    slotLeftRail?: import('svelte').Snippet;
    /** Whether the analysis rail is visible (DESKTOP/TABLET only) */
    showRail?: boolean;
    /** Rail width px (DESKTOP/TABLET only) */
    railWidth?: number;
    // Mobile mode-router data — forwarded to MobileShell → ModeRouter
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
    slotTopBar,
    slotChart,
    slotRail,
    slotFooter,
    slotLeftRail,
    showRail = true,
    railWidth = 330,
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

  // SSR-safe: viewportTier defaults to DESKTOP on server; hydrates on mount.
  const tier = $derived($viewportTier.tier ?? 'DESKTOP');
</script>

{#if tier === 'MOBILE'}
  <MobileShell
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
{:else if tier === 'TABLET'}
  <TabletShell topBarContent={slotTopBar} railContent={slotRail}>
    {#snippet children()}
      {#if slotChart}
        {@render slotChart()}
      {/if}
    {/snippet}
  </TabletShell>
{:else}
  <DesktopShell {showRail} {railWidth} {slotTopBar} {slotChart} {slotRail} {slotFooter} {slotLeftRail} />
{/if}
