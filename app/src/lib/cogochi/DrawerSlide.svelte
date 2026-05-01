<script lang="ts">
  /**
   * DrawerSlide — Phase D-7 generalized right-side detail drawer.
   *
   * 320px slide-in overlaying the chart column. Closes on Esc / outside-click /
   * ✕ button. Caller renders content via the {children} render block.
   */
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title?: string;
    width?: number;          // px, default 320
    onClose: () => void;
    children?: Snippet;
  }

  let { open, title = '', width = 320, onClose, children }: Props = $props();

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

{#if open}
  <button
    type="button"
    class="drawer-backdrop"
    aria-label="Close drawer"
    onclick={onBackdropClick}
  ></button>
  <aside
    class="drawer"
    style:width={`${width}px`}
    role="dialog"
    aria-label={title || 'Detail drawer'}
  >
    <header class="drawer-head">
      <span class="drawer-title">{title}</span>
      <button
        type="button"
        class="drawer-close"
        onclick={onClose}
        aria-label="Close drawer"
      >✕</button>
    </header>
    <div class="drawer-body">
      {#if children}{@render children()}{/if}
    </div>
  </aside>
{/if}

<style>
  .drawer-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.32);
    border: 0;
    padding: 0;
    z-index: 40;
    cursor: default;
    animation: fade-in 0.2s ease-out;
  }
  .drawer {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    background: var(--g1, #0c0a09);
    border-left: 1px solid var(--g4, #272320);
    box-shadow: -8px 0 18px rgba(0, 0, 0, 0.45);
    z-index: 41;
    display: flex;
    flex-direction: column;
    animation: slide-in 0.2s ease-out;
    font-family: 'JetBrains Mono', monospace;
  }
  .drawer-head {
    display: flex;
    align-items: center;
    height: 32px;
    padding: 0 10px;
    border-bottom: 1px solid var(--g3, #1c1918);
    background: var(--g0, #050403);
    flex-shrink: 0;
  }
  .drawer-title {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.16em;
    color: var(--g8, #cec9c4);
    text-transform: uppercase;
  }
  .drawer-close {
    margin-left: auto;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--g6, #6b655e);
    background: transparent;
    border: 0.5px solid var(--g4, #272320);
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    line-height: 1;
  }
  .drawer-close:hover {
    color: var(--g9, #eceae8);
    border-color: var(--g6, #6b655e);
  }
  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 10px 12px;
    color: var(--g8, #cec9c4);
    font-size: 11px;
  }

  @keyframes slide-in {
    from { transform: translateX(100%); opacity: 0.6; }
    to   { transform: translateX(0);    opacity: 1; }
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
</style>
