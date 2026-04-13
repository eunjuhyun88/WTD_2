<script lang="ts">
  import { activePair, activeTimeframe, setActivePair, setActiveTimeframe } from '$lib/stores/activePairStore';
  import SymbolPicker from './SymbolPicker.svelte';

  type LayoutId = 'hero3' | 'compare2x2' | 'focus';

  interface Props {
    flowBias?: 'LONG' | 'SHORT' | 'NEUTRAL';
    layout?: LayoutId;
    onLayout?: (l: LayoutId) => void;
    assetsCount?: number;
    onClear?: () => void;
  }
  let { flowBias = 'NEUTRAL', layout = 'hero3', onLayout, assetsCount = 0, onClear }: Props = $props();

  const tfs = ['15m', '1H', '4H', '1D'];
  const layouts: { id: LayoutId; label: string }[] = [
    { id: 'hero3', label: 'Hero+3' },
    { id: 'compare2x2', label: '2×2' },
    { id: 'focus', label: 'Focus' },
  ];

  let showSymbolDrop = $state(false);

  const biasColor = { LONG: '#4ade80', SHORT: '#f87171', NEUTRAL: 'rgba(247,242,234,0.4)' };
  const biasLabel = { LONG: '●LONG', SHORT: '●SHORT', NEUTRAL: '◎NEUTRAL' };
</script>

<nav class="command-bar">
  <div class="symbol-picker">
    <button class="symbol-btn" onclick={() => showSymbolDrop = !showSymbolDrop}>
      {$activePair || 'BTC/USDT'} ▾
    </button>
  </div>

  <div class="tf-ladder">
    {#each tfs as tf}
      <button
        class="tf-btn"
        class:active={$activeTimeframe === tf.toLowerCase() || ($activeTimeframe === '4h' && tf === '4H') || ($activeTimeframe === '1h' && tf === '1H') || ($activeTimeframe === '1d' && tf === '1D')}
        onclick={() => setActiveTimeframe(tf.toLowerCase() as any)}
      >
        {tf}
      </button>
    {/each}
  </div>

  <span class="bias-badge" style="color: {biasColor[flowBias]}">
    {biasLabel[flowBias]}
  </span>

  <div class="layout-switch">
    {#each layouts as l}
      <button class="layout-btn" class:active={layout === l.id} onclick={() => onLayout?.(l.id)}>
        {l.label}
      </button>
    {/each}
  </div>

  {#if assetsCount > 0}
    <button class="clear-btn" onclick={onClear} title="Clear board">CLR</button>
  {/if}
</nav>

{#if showSymbolDrop}
  <SymbolPicker
    activePair={$activePair || 'BTC/USDT'}
    onSelect={(pair) => setActivePair(pair)}
    onClose={() => showSymbolDrop = false}
  />
{/if}

<style>
  .command-bar {
    display: flex; align-items: center; gap: 12px;
    height: 48px; padding: 0 16px;
    background: var(--sc-bg-1);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    overflow-x: auto;
  }
  .symbol-btn {
    font-family: var(--sc-font-mono); font-size: 13px; font-weight: 700;
    color: var(--sc-text-0); background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 4px;
    padding: 4px 10px; cursor: pointer;
    transition: all 0.12s;
  }
  .symbol-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.18); }
  .tf-ladder { display: flex; gap: 2px; background: rgba(255,255,255,0.04); padding: 3px; border-radius: 5px; }
  .tf-btn {
    font-family: var(--sc-font-mono); font-size: 11px; font-weight: 600;
    color: var(--sc-text-2); background: none; border: none;
    padding: 3px 10px; border-radius: 3px; cursor: pointer;
    transition: all 0.15s;
  }
  .tf-btn:hover { color: var(--sc-text-0); background: rgba(255,255,255,0.06); }
  .tf-btn.active { color: var(--sc-text-0); background: rgba(255,255,255,0.12); }

  .bias-badge { font-family: var(--sc-font-mono); font-size: 11px; font-weight: 700; }

  .layout-switch { display: flex; gap: 2px; margin-left: auto; }
  .layout-btn {
    font-family: var(--sc-font-mono); font-size: 10px; color: var(--sc-text-2);
    background: none; border: 1px solid transparent; border-radius: 3px;
    padding: 3px 8px; cursor: pointer;
  }
  .layout-btn.active, .layout-btn:hover { color: var(--sc-text-0); border-color: rgba(255,255,255,0.12); }

  .clear-btn {
    font-family: var(--sc-font-mono); font-size: 9px; font-weight: 700;
    letter-spacing: 0.08em; color: var(--sc-text-2);
    background: none; border: 1px solid rgba(255,255,255,0.08);
    border-radius: 3px; padding: 3px 8px; cursor: pointer;
    transition: all 0.15s;
  }
  .clear-btn:hover { color: #f87171; border-color: rgba(248,113,113,0.3); }
</style>
