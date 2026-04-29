<script lang="ts">
  import { browser } from '$app/environment';

  interface Props {
    mode: 'observe' | 'analyze' | 'execute';
    children: import('svelte').Snippet;
    rightPane?: import('svelte').Snippet;
    bottomPane?: import('svelte').Snippet;
  }

  let { mode, children, rightPane, bottomPane }: Props = $props();

  const STORAGE_KEY = 'wtd_split_ratio';
  const DEFAULT_RATIO = 0.72; // main chart width ratio

  let ratio = $state(
    browser ? parseFloat(localStorage.getItem(STORAGE_KEY) ?? String(DEFAULT_RATIO)) : DEFAULT_RATIO
  );
  let dragging = $state(false);
  let container: HTMLElement;

  function onMousedown(e: MouseEvent) {
    dragging = true;
    e.preventDefault();
  }

  function onMousemove(e: MouseEvent) {
    if (!dragging || !container) return;
    const rect = container.getBoundingClientRect();
    const newRatio = Math.min(0.85, Math.max(0.4, (e.clientX - rect.left) / rect.width));
    ratio = newRatio;
  }

  function onMouseup() {
    if (!dragging) return;
    dragging = false;
    if (browser) localStorage.setItem(STORAGE_KEY, String(ratio));
  }

  $effect(() => {
    if (browser) {
      window.addEventListener('mousemove', onMousemove);
      window.addEventListener('mouseup', onMouseup);
      return () => {
        window.removeEventListener('mousemove', onMousemove);
        window.removeEventListener('mouseup', onMouseup);
      };
    }
  });

  let showRight = $derived(mode !== 'observe');
  let showBottom = $derived(mode === 'execute');
</script>

<div
  class="split-layout"
  class:has-right={showRight}
  class:has-bottom={showBottom}
  style="--main-ratio: {showRight ? ratio : 1}"
  bind:this={container}
>
  <div class="split-main">
    {@render children()}
  </div>

  {#if showRight && rightPane}
    <div
      class="split-handle"
      onmousedown={onMousedown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      tabindex="0"
    ></div>
    <div class="split-right">
      {@render rightPane()}
    </div>
  {/if}
</div>

{#if showBottom && bottomPane}
  <div class="split-bottom">
    {@render bottomPane()}
  </div>
{/if}

<style>
  .split-layout {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .split-main {
    flex: 0 0 calc(var(--main-ratio) * 100%);
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .split-handle {
    width: 4px;
    background: transparent;
    cursor: col-resize;
    flex-shrink: 0;
    position: relative;
    z-index: 10;
  }
  .split-handle::after {
    content: '';
    position: absolute;
    inset: 0 -2px;
    background: rgba(255,255,255,0.06);
    opacity: 0;
    transition: opacity 0.15s;
  }
  .split-handle:hover::after { opacity: 1; }
  .split-right {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .split-bottom {
    flex-shrink: 0;
    height: 30%;
    min-height: 180px;
    border-top: 1px solid rgba(255,255,255,0.06);
    overflow: auto;
  }
</style>
