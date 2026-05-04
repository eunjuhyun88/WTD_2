<script lang="ts">
  import { shellStore } from './shell.store';

  const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'] as const;

  interface Props {
    currentTF: string;
    onClose: () => void;
  }
  let { currentTF, onClose }: Props = $props();

  function select(tf: string) {
    shellStore.setTimeframe(tf);
    onClose();
  }
</script>

<div class="tf-popover" role="menu">
  {#each TIMEFRAMES as t}
    <button
      class="tf-opt"
      class:active={currentTF === t}
      role="menuitem"
      onclick={() => select(t)}
    >{t}</button>
  {/each}
</div>

<style>
.tf-popover {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-2, 6px);
  padding: var(--sp-2, 6px);
  background: var(--surface-1, #1a1d27);
  border: 1px solid var(--g3);
  border-radius: var(--r-2, 4px);
  min-width: 140px;
}

.tf-opt {
  min-height: 44px;
  min-width: 44px;
  /* visible 32px with hit-area extension via padding */
  padding: 0 var(--sp-3, 8px);
  height: 32px;
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
  /* extend hit area */
  position: relative;
}
.tf-opt::before {
  content: '';
  position: absolute;
  inset: -6px;
}
.tf-opt:hover {
  color: var(--text-primary, var(--g8));
  background: var(--surface-2, rgba(255,255,255,0.06));
}
.tf-opt.active {
  color: var(--accent-amb, var(--amb, #d6a347));
  border-color: var(--accent-amb, var(--amb, #d6a347));
  background: rgba(214,163,71,0.08);
}
</style>
