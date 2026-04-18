<script lang="ts">
  /**
   * DesktopShell.svelte
   *
   * 3-column layout per W-0078 desktop wireframe:
   *   [MarketDrawer (drawer)] [Chart center] [Analysis rail right]
   *
   * Slot-based so TerminalShell can compose the actual content.
   */

  interface Props {
    /** Whether the analysis rail is shown (default: true) */
    showRail?: boolean;
    /** Rail width in px (default: 330) */
    railWidth?: number;
    /** Left rail width in px (default: 240) */
    leftRailWidth?: number;
    children?: import('svelte').Snippet;
    slotChart?: import('svelte').Snippet;
    slotRail?: import('svelte').Snippet;
    slotFooter?: import('svelte').Snippet;
    slotTopBar?: import('svelte').Snippet;
    slotLeftRail?: import('svelte').Snippet;
  }

  let {
    showRail = true,
    railWidth = 330,
    leftRailWidth = 240,
    children,
    slotChart,
    slotRail,
    slotFooter,
    slotTopBar,
    slotLeftRail,
  }: Props = $props();
</script>

<div class="desktop-shell">
  <!-- Row 1: Top context bar -->
  {#if slotTopBar}
    <div class="shell-topbar">
      {@render slotTopBar()}
    </div>
  {/if}

  <!-- Row 2: Main workspace -->
  <div class="shell-workspace" style="--rail-width: {railWidth}px; --left-rail-width: {leftRailWidth}px">
    <!-- Left persistent rail (market list / watchlist) -->
    {#if slotLeftRail}
      <aside class="shell-left-rail">
        {@render slotLeftRail()}
      </aside>
    {/if}

    <!-- Center chart -->
    <div class="shell-chart">
      {#if slotChart}
        {@render slotChart()}
      {:else if children}
        {@render children()}
      {/if}
    </div>

    <!-- Right analysis rail -->
    {#if showRail && slotRail}
      <aside class="shell-rail">
        {@render slotRail()}
      </aside>
    {/if}
  </div>

  <!-- Row 3: Prompt footer -->
  {#if slotFooter}
    <div class="shell-footer">
      {@render slotFooter()}
    </div>
  {/if}
</div>

<style>
  .desktop-shell {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .shell-topbar {
    flex-shrink: 0;
  }

  .shell-workspace {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: row;
    overflow: hidden;
  }

  .shell-chart {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .shell-left-rail {
    flex-shrink: 0;
    width: var(--left-rail-width, 240px);
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    border-right: 1px solid rgba(255, 255, 255, 0.07);
  }

  .shell-rail {
    flex-shrink: 0;
    width: var(--rail-width, 330px);
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    border-left: 1px solid rgba(255, 255, 255, 0.07);
  }

  .shell-footer {
    flex-shrink: 0;
  }

  /* ── Responsive collapse (W-0087 tier boundaries) ── */
  @media (max-width: 1279px) {
    .shell-rail {
      width: 320px;
    }
  }

  @media (max-width: 1023px) {
    .shell-rail {
      width: 280px;
    }
  }

  @media (max-width: 767px) {
    /* MOBILE tier: stack vertically, whole shell scrolls so footer is reachable */
    .desktop-shell {
      height: auto;
      min-height: 100%;
      overflow: visible;
    }
    .shell-workspace {
      flex-direction: column;
      overflow: visible;
    }
    .shell-left-rail {
      display: none;
    }
    .shell-rail {
      display: none;
    }
    .shell-chart {
      /* Bounded chart portion on mobile so indicator pane + footer stay reachable */
      min-height: 60vh;
      flex: 0 0 auto;
    }
  }
</style>
