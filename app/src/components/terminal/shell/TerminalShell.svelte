<script lang="ts">
  /**
   * TerminalShell.svelte
   *
   * Wraps Top/Chart/Rail/Footer; tier-branches via viewportTier store.
   *
   * TODO(mobile): When mobile branch is ready, branch on viewportTier.tier === 'MOBILE'
   * to render a different shell layout. Currently every viewport is treated as DESKTOP.
   *
   * Desktop layout per W-0078 blueprint:
   *   [TerminalCommandBar] (top context bar — symbol owner)
   *   [MarketDrawer] [ChartBoard + ChartHeader + SaveStrip] [TerminalContextPanel]
   *   [TerminalBottomDock] (footer)
   */
  import { viewportTier } from '$lib/stores/viewportTier';
  import DesktopShell from './DesktopShell.svelte';

  // ── Props ──────────────────────────────────────────────────────────────────
  interface Props {
    slotTopBar?: import('svelte').Snippet;
    slotChart?: import('svelte').Snippet;
    slotRail?: import('svelte').Snippet;
    slotFooter?: import('svelte').Snippet;
    /** Whether the analysis rail is visible */
    showRail?: boolean;
    /** Rail width px */
    railWidth?: number;
  }

  let {
    slotTopBar,
    slotChart,
    slotRail,
    slotFooter,
    showRail = true,
    railWidth = 330,
  }: Props = $props();

  // TODO(mobile): use viewportTier to branch
  // const tier = $derived($viewportTier.tier);
</script>

<!--
  Currently all viewports render DesktopShell.
  TODO(mobile): when W-0087 mobile branch lands, condition here:
    {#if tier === 'MOBILE'} <MobileShell ...> {:else} <DesktopShell ...> {/if}
-->
<DesktopShell {showRail} {railWidth} {slotTopBar} {slotChart} {slotRail} {slotFooter} />
