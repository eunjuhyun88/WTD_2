<script lang="ts">
  /**
   * TabletShell — two-column layout for TABLET tier (768px–1279px).
   * Chart takes calc(100% - 320px); right rail is fixed 320px.
   * No bottom tab bar; navigation lives in the top bar.
   * Market drawer opens as a modal, not a permanent column.
   */

  import type { Snippet } from 'svelte';

  interface Props {
    children?: Snippet;
    railContent?: Snippet;
    topBarContent?: Snippet;
  }

  let { children, railContent, topBarContent }: Props = $props();

  let drawerOpen = $state(false);
</script>

<div class="tablet-shell">
  <!-- Top bar -->
  {#if topBarContent}
    <div class="top-bar">
      <button
        class="market-btn"
        onclick={() => (drawerOpen = true)}
        aria-label="마켓 열기"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="3 17 9 11 13 15 21 7"/>
          <line x1="3" y1="21" x2="21" y2="21"/>
        </svg>
        마켓
      </button>
      {@render topBarContent()}
    </div>
  {/if}

  <!-- Main two-column body -->
  <div class="body">
    <!-- Chart area -->
    <div class="chart-col">
      {@render children?.()}
    </div>

    <!-- Right rail (fixed 320px) -->
    <div class="right-rail">
      {@render railContent?.()}
    </div>
  </div>
</div>

<!-- Market drawer (modal) -->
{#if drawerOpen}
  <div
    class="drawer-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="마켓 패널"
    tabindex="-1"
    onclick={(e) => { if ((e.target as Element).classList.contains('drawer-backdrop')) drawerOpen = false; }}
    onkeydown={(e) => e.key === 'Escape' && (drawerOpen = false)}
  >
    <div class="market-drawer">
      <div class="drawer-header">
        <span class="drawer-title">마켓</span>
        <button class="drawer-close" onclick={() => (drawerOpen = false)} aria-label="닫기">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="drawer-body">
        <p class="drawer-placeholder">마켓 패널 (W-0086 머지 후 통합)</p>
      </div>
    </div>
  </div>
{/if}

<style>
  .tablet-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--sc-terminal-bg, #0a0c10);
  }

  .top-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 48px;
    padding: 0 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
  }

  .market-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 12px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: var(--sc-text-1, rgba(247,242,234,0.78));
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }

  .body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .chart-col {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .right-rail {
    width: 320px;
    flex-shrink: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* Market drawer */
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgba(0, 0, 0, 0.6);
  }

  .market-drawer {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(340px, 85vw);
    background: var(--sc-bg-1, #0d1017);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
  }

  .drawer-title {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sc-text-2, rgba(255,255,255,0.5));
  }

  .drawer-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    color: var(--sc-text-2, rgba(255,255,255,0.5));
    cursor: pointer;
    border-radius: 4px;
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .drawer-placeholder {
    font-family: var(--sc-font-mono);
    font-size: 11px;
    color: var(--sc-text-3, rgba(255,255,255,0.3));
    text-align: center;
    margin: 60px 0 0;
  }
</style>
