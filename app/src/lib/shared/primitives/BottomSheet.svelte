<script lang="ts">
  /**
   * BottomSheet — Phase D-8 generalized bottom-up sheet.
   *
   * Mirrors DrawerSlide but slides up from the bottom. Used by MobileAgentSheet
   * (and any other ≤ 768px detail surface). Closes on Esc / backdrop / ✕.
   */
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title?: string;
    height?: string;          // CSS height, default '85vh'
    onClose: () => void;
    children?: Snippet;
  }

  let { open, title = '', height = '85vh', onClose, children }: Props = $props();

  function onKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <button
    type="button"
    class="sheet-backdrop"
    aria-label="Close sheet"
    onclick={onClose}
  ></button>
  <div
    class="sheet"
    style:height
    role="dialog"
    aria-modal="true"
    aria-label={title || 'Bottom sheet'}
  >
    <header class="sheet-head">
      <div class="sheet-grip" aria-hidden="true"></div>
      <span class="sheet-title">{title}</span>
      <button
        type="button"
        class="sheet-close"
        onclick={onClose}
        aria-label="Close sheet"
      >✕</button>
    </header>
    <div class="sheet-body">
      {#if children}{@render children()}{/if}
    </div>
  </div>
{/if}

<style>
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    border: 0;
    padding: 0;
    z-index: 60;
    cursor: default;
    animation: fade-in 0.2s ease-out;
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--g1, #0c0a09);
    border-top: 1px solid var(--g4, #272320);
    border-top-left-radius: 14px;
    border-top-right-radius: 14px;
    box-shadow: 0 -10px 22px rgba(0, 0, 0, 0.55);
    z-index: 61;
    display: flex;
    flex-direction: column;
    animation: slide-up 0.22s ease-out;
    font-family: 'JetBrains Mono', monospace;
    contain: layout paint;
  }
  .sheet-head {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: 6px 12px 8px;
    border-bottom: 1px solid var(--g3, #1c1918);
    flex-shrink: 0;
    position: relative;
  }
  .sheet-grip {
    width: 36px;
    height: 3px;
    border-radius: 2px;
    background: var(--g4, #272320);
    margin: 0 auto 6px;
  }
  .sheet-title {
    font-size: var(--ui-text-xs);
    font-weight: 700;
    letter-spacing: 0.16em;
    color: var(--g8, #cec9c4);
    text-transform: uppercase;
    text-align: center;
  }
  .sheet-close {
    position: absolute;
    top: 8px;
    right: 10px;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--g6, #6b655e);
    background: transparent;
    border: 0.5px solid var(--g4, #272320);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
  }
  .sheet-close:hover {
    color: var(--g9, #eceae8);
    border-color: var(--g6, #6b655e);
  }
  .sheet-body {
    flex: 1;
    overflow-y: auto;
    padding: 10px 12px calc(12px + env(safe-area-inset-bottom, 0px));
    color: var(--g8, #cec9c4);
    font-size: 11px;
    contain: layout paint;
  }

  @keyframes slide-up {
    from { transform: translateY(100%); opacity: 0.6; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
</style>
