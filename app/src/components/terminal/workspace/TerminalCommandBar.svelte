<script lang="ts">
  import { activePair, activeTimeframe, setActivePair, setActiveTimeframe } from '$lib/stores/activePairStore';

  type LayoutId = 'hero3' | 'compare2x2' | 'focus';

  interface Props {
    flowBias?: 'LONG' | 'SHORT' | 'NEUTRAL';
    layout?: LayoutId;
    onLayout?: (l: LayoutId) => void;
  }
  let { flowBias = 'NEUTRAL', layout = 'hero3', onLayout }: Props = $props();

  const tfs = ['15m', '1H', '4H', '1D'];
  const layouts: { id: LayoutId; label: string }[] = [
    { id: 'hero3', label: 'Hero+3' },
    { id: 'compare2x2', label: '2×2' },
    { id: 'focus', label: 'Focus' },
  ];

  let symbolInput = $state($activePair || 'BTC/USDT');
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
</nav>

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
  }
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
</style>
