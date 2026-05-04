<script lang="ts">
  /**
   * AIDrawer — L3 drill-down slide-out for AIAgentPanel (W-0402 PR10).
   *
   * Design choice: div + focus trap (not <dialog>) because the drawer sits
   * inside a deeply-nested panel with `overflow: hidden` ancestors, so
   * <dialog> would need portal/teleport to escape stacking context.
   * A11y is handled via role="dialog", aria-modal, focus trap on open,
   * and Escape-key dismissal.
   *
   * Width: 320px (--ai-w), overlays panel content (position: absolute).
   * Transition: transform translateX 200ms ease.
   */

  import { tick } from 'svelte';

  // ── Tab content map ───────────────────────────────────────────────────────
  const TAB_LABEL: Record<string, string> = {
    decision: 'DECISION',
    pattern:  'PATTERN',
    verdict:  'VERDICT',
    research: 'RESEARCH',
    judge:    'JUDGE',
  };

  interface MockRow { key: string; value: string }

  const TAB_ROWS: Record<string, MockRow[]> = {
    decision: [
      { key: 'Signal',     value: 'Ensemble long bias (3/5 blocks)' },
      { key: 'Entry Zone', value: '63,200 – 63,450 USDT' },
      { key: 'Confidence', value: '74%' },
    ],
    pattern: [
      { key: 'Match',      value: 'Bull flag breakout (0.82 sim)' },
      { key: 'Last seen',  value: '2025-04-17 14:00 UTC' },
      { key: 'Outcome',    value: '3/4 bullish (75%)' },
    ],
    verdict: [
      { key: 'Pending',    value: '4 awaiting verdict' },
      { key: 'Last',       value: 'valid  —  2025-04-21' },
      { key: 'Accuracy',   value: '68% (30d)' },
    ],
    research: [
      { key: 'Query',      value: 'BTC macro outlook Q2' },
      { key: 'Updated',    value: '2025-04-21 08:30 UTC' },
      { key: 'Sources',    value: '5 ingested' },
    ],
    judge: [
      { key: 'Win rate',   value: '61% (7d)' },
      { key: 'Avoid rate', value: '39% (7d)' },
      { key: 'Decisions',  value: '23 total' },
    ],
  };

  // ── Props ─────────────────────────────────────────────────────────────────
  interface Props {
    open: boolean;
    tab: string | null;
    onClose: () => void;
  }

  let { open, tab, onClose }: Props = $props();

  // ── Focus trap ────────────────────────────────────────────────────────────
  let drawerEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (open && drawerEl) {
      // Move focus into the drawer on next tick so the element is visible.
      void tick().then(() => drawerEl?.focus());
    }
  });

  // ── Derived content ───────────────────────────────────────────────────────
  const title = $derived(tab ? (TAB_LABEL[tab] ?? tab.toUpperCase()) : '');
  const rows   = $derived(tab ? (TAB_ROWS[tab] ?? []) : []);

  // ── Event handlers ────────────────────────────────────────────────────────
  function onKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  function onBackdropClick() {
    onClose();
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- Backdrop -->
{#if open}
  <button
    type="button"
    class="ai-drawer-backdrop"
    aria-label="Close AI drawer"
    tabindex="-1"
    onclick={onBackdropClick}
  ></button>
{/if}

<!-- Drawer panel — always in DOM so CSS transition plays both ways -->
<div
  bind:this={drawerEl}
  class="ai-drawer"
  class:open
  role="dialog"
  aria-modal="true"
  aria-label={title || 'AI detail drawer'}
  tabindex="-1"
>
  <header class="ai-drawer-head">
    <span class="ai-drawer-title">{title} — drill-down details</span>
    <button
      type="button"
      class="ai-drawer-close"
      onclick={onClose}
      aria-label="Close AI drawer"
    >×</button>
  </header>

  <div class="ai-drawer-body">
    {#if tab && rows.length > 0}
      <p class="ai-drawer-subtitle">{TAB_LABEL[tab] ?? tab.toUpperCase()} — drill-down details (placeholder)</p>
      <div class="ai-mock-rows">
        {#each rows as row}
          <div class="ai-mock-row">
            <span class="ai-mock-key">{row.key}</span>
            <span class="ai-mock-val">{row.value}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="ai-drawer-empty">No content for this tab.</p>
    {/if}
  </div>
</div>

<style>
  /* Backdrop */
  .ai-drawer-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.40);
    border: 0;
    padding: 0;
    z-index: 50;
    cursor: default;
  }

  /* Drawer panel */
  .ai-drawer {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: var(--ai-w, 320px);
    background: var(--surface-1, var(--g1, #0c0a09));
    border-left: 1px solid var(--border-subtle, var(--g4, #272320));
    box-shadow: -8px 0 18px rgba(0, 0, 0, 0.45);
    z-index: 51;
    display: flex;
    flex-direction: column;
    font-family: 'JetBrains Mono', monospace;
    /* Slide-out transition — both open and close */
    transform: translateX(100%);
    transition: transform 200ms ease;
    outline: none;
  }

  .ai-drawer.open {
    transform: translateX(0);
  }

  /* Header */
  .ai-drawer-head {
    display: flex;
    align-items: center;
    height: 32px;
    padding: 0 10px;
    border-bottom: 1px solid var(--border-subtle, var(--g3, #1c1918));
    background: var(--g0, #050403);
    flex-shrink: 0;
  }

  .ai-drawer-title {
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.14em;
    color: var(--text-primary, var(--g8, #cec9c4));
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ai-drawer-close {
    margin-left: auto;
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--g6, #6b655e);
    background: transparent;
    border: 0.5px solid var(--border-subtle, var(--g4, #272320));
    border-radius: 3px;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
  }
  .ai-drawer-close:hover {
    color: var(--text-primary, var(--g9, #eceae8));
    border-color: var(--g6, #6b655e);
  }

  /* Body */
  .ai-drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    color: var(--text-primary, var(--g8, #cec9c4));
  }

  .ai-drawer-subtitle {
    font-size: var(--ui-text-xs);
    color: var(--g6, #6b655e);
    margin: 0 0 12px;
    line-height: 1.5;
  }

  .ai-mock-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ai-mock-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    padding: 6px 8px;
    background: var(--g2, #110f0d);
    border: 1px solid var(--border-subtle, var(--g3, #1c1918));
    border-radius: 2px;
  }

  .ai-mock-key {
    font-size: var(--ui-text-xs);
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--g5, #3d3830);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .ai-mock-val {
    font-size: var(--ui-text-xs);
    color: var(--text-primary, var(--g8, #cec9c4));
    text-align: right;
  }

  .ai-drawer-empty {
    font-size: var(--ui-text-xs);
    color: var(--g5, #3d3830);
    margin: 0;
  }
</style>
