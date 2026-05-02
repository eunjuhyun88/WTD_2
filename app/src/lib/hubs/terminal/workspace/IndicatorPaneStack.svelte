<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { IndicatorKey } from '$lib/stores/chartIndicators';

  interface Props {
    showMACD?: boolean;
    showCVD?: boolean;
    onHidePane?: (key: IndicatorKey) => void;
    children?: Snippet;
  }

  let { showMACD = false, showCVD = true, onHidePane, children }: Props = $props();
</script>

<div class="indicator-pane-stack">
  {@render children?.()}
</div>

<style>
  .indicator-pane-stack {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: rgba(19, 23, 34, 0.8);
    border-top: 1px solid rgba(42, 46, 57, 0.9);
  }
</style>
