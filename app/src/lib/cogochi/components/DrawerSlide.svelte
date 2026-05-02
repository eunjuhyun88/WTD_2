<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    open?: boolean;
    title?: string;
    expanded?: boolean;
    onClose?: () => void;
    children?: import('svelte').Snippet;
  }

  let { open = false, title = '', expanded = false, onClose, children }: Props = $props();

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) onClose?.();
  }

  onMount(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  });
</script>

{#if open}
  <div
    class="drawer-backdrop"
    onclick={onClose}
    role="presentation"
  ></div>
  <aside class="drawer-panel" class:expanded>
    <div class="drawer-header">
      <span class="drawer-title">{title}</span>
      <button class="drawer-close" onclick={onClose} aria-label="Close drawer">✕</button>
    </div>
    <div class="drawer-body">
      {@render children?.()}
    </div>
  </aside>
{/if}

<style>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 49;
  background: transparent;
}
.drawer-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  width: 320px;
  background: var(--g1, #0c0a09);
  border-left: 1px solid var(--g4, #272320);
  display: flex;
  flex-direction: column;
  animation: slideIn 0.2s ease-out;
}
.drawer-panel.expanded { width: 480px; }
@keyframes slideIn {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
.drawer-header {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 12px;
  border-bottom: 1px solid var(--g3, #1c1918);
  flex-shrink: 0;
}
.drawer-title {
  flex: 1;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--g6, #5a534c);
  text-transform: uppercase;
}
.drawer-close {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--g5, #3d3830);
  cursor: pointer;
  font-size: 11px;
  transition: color 0.08s;
}
.drawer-close:hover { color: var(--g7, #9d9690); }
.drawer-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
