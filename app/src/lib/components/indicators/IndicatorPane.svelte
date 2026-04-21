<script lang="ts">
  /**
   * Registry-driven indicator pane.
   *
   * Given an ordered list of indicator ids and the live value map,
   * renders each through the dispatcher. Missing values skip silently
   * (no loading flicker on indicators that haven't loaded yet).
   */
  import type { IndicatorValue } from '$lib/indicators/types';
  import { INDICATOR_REGISTRY } from '$lib/indicators/registry';
  import IndicatorRenderer from './IndicatorRenderer.svelte';

  interface Props {
    ids: readonly string[] | string[];
    values: Record<string, IndicatorValue>;
    /** Optional label rendered above the pane (e.g., 'LIVE INDICATORS'). */
    title?: string;
    /** Layout: 'row' for gauge-heavy horizontal strip, 'stack' for venue/heatmap panes */
    layout?: 'row' | 'stack';
    /** Compact mode — tighter padding + gap, for narrow containers (Layout B/C peek). */
    compact?: boolean;
  }
  let { ids, values, title, layout = 'row', compact = false }: Props = $props();

  const rendered = $derived(
    ids
      .map(id => ({ id, def: INDICATOR_REGISTRY[id], value: values[id] }))
      .filter(x => x.def && x.value != null)
  );
</script>

{#if rendered.length > 0}
  <div
    class="ind-pane"
    class:layout-row={layout === 'row'}
    class:layout-stack={layout === 'stack'}
    class:compact
  >
    {#if title}
      <div class="ind-pane-title">{title}</div>
    {/if}
    <div class="ind-pane-items">
      {#each rendered as item (item.id)}
        <IndicatorRenderer def={item.def!} value={item.value!} />
      {/each}
    </div>
  </div>
{/if}

<style>
  .ind-pane {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 0;
  }

  .ind-pane.compact {
    gap: 2px;
    padding: 3px 0;
  }

  .ind-pane-title {
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--g5, rgba(255, 255, 255, 0.4));
    padding: 0 10px 2px;
    font-family: var(--sc-font-mono, monospace);
  }

  .ind-pane.compact .ind-pane-title {
    font-size: 8px;
    padding: 0 6px 1px;
    letter-spacing: 0.06em;
  }

  .ind-pane-items {
    display: flex;
    gap: 2px;
  }

  .ind-pane.compact .ind-pane-items {
    gap: 1px;
  }

  .layout-row .ind-pane-items {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .layout-stack .ind-pane-items {
    flex-direction: column;
  }
</style>
