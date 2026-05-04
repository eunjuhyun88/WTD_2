<script lang="ts">
  import { shellStore } from './shell.store';
  import type { ChartType } from './shell.store';

  const CHART_TYPES: { id: ChartType; label: string }[] = [
    { id: 'candle',  label: 'Candle' },
    { id: 'heikin',  label: 'HA'     },
    { id: 'bar',     label: 'Bar'    },
    { id: 'line',    label: 'Line'   },
    { id: 'area',    label: 'Area'   },
  ];

  interface Props {
    currentType: ChartType;
    onClose: () => void;
  }
  let { currentType, onClose }: Props = $props();

  function select(t: ChartType) {
    shellStore.setChartType(t);
    onClose();
  }
</script>

<div class="type-popover" role="menu">
  {#each CHART_TYPES as ct}
    <button
      class="type-opt"
      class:active={currentType === ct.id}
      role="menuitem"
      onclick={() => select(ct.id)}
    >{ct.label}</button>
  {/each}
</div>

<style>
.type-popover {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2, 6px);
  padding: var(--sp-2, 6px);
  background: var(--surface-1, #1a1d27);
  border: 1px solid var(--g3);
  border-radius: var(--r-2, 4px);
  min-width: 100px;
}

.type-opt {
  min-height: 44px;
  min-width: 44px;
  height: 32px;
  padding: 0 var(--sp-3, 8px);
  background: var(--surface-2, rgba(255,255,255,0.04));
  border: 1px solid transparent;
  border-radius: var(--r-2, 3px);
  font-family: var(--font-mono, monospace);
  font-size: var(--type-xs, 10px);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-secondary, var(--g6));
  cursor: pointer;
  transition: color 0.08s, border-color 0.08s, background 0.08s;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  text-align: center;
}
.type-opt::before {
  content: '';
  position: absolute;
  inset: -6px;
}
.type-opt:hover {
  color: var(--text-primary, var(--g8));
  background: var(--surface-2, rgba(255,255,255,0.06));
}
.type-opt.active {
  color: var(--accent-amb, var(--amb, #d6a347));
  border-color: var(--accent-amb, var(--amb, #d6a347));
  background: rgba(214,163,71,0.08);
}
</style>
