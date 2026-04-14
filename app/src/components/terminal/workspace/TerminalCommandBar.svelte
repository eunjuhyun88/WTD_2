<script lang="ts">
  import { activePair, activeTimeframe, setActivePair, setActiveTimeframe } from '$lib/stores/activePairStore';
  import SymbolPicker from './SymbolPicker.svelte';

  type LayoutId = 'hero3' | 'compare2x2' | 'focus';

  interface Props {
    flowBias?: 'LONG' | 'SHORT' | 'NEUTRAL';
    layout?: LayoutId;
    onLayout?: (l: LayoutId) => void;
    assetsCount?: number;
    leftRailOpen?: boolean;
    analysisRailOpen?: boolean;
    onToggleLeftRail?: () => void;
    onToggleAnalysisRail?: () => void;
    onClear?: () => void;
    onCapture?: () => void;
  }
  let {
    flowBias = 'NEUTRAL',
    layout = 'hero3',
    onLayout,
    assetsCount = 0,
    leftRailOpen = true,
    analysisRailOpen = true,
    onToggleLeftRail,
    onToggleAnalysisRail,
    onClear,
    onCapture,
  }: Props = $props();

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
  <div class="workspace-badge">
    <span class="ws-label">Workspace</span>
    <span class="ws-value">{assetsCount > 1 ? 'Scan Board' : 'Focus Board'}</span>
  </div>

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

  <div class="board-badge">
    {assetsCount > 0 ? `${assetsCount} LOADED` : 'READY'}
  </div>

  <div class="layout-switch">
    {#each layouts as l}
      <button class="layout-btn" class:active={layout === l.id} onclick={() => onLayout?.(l.id)}>
        {l.label}
      </button>
    {/each}
  </div>

  <div class="shell-switch" aria-label="Toggle terminal rails">
    <button
      class="shell-btn"
      class:active={leftRailOpen}
      onclick={onToggleLeftRail}
      title={leftRailOpen ? 'Hide left market rail' : 'Show left market rail'}
      aria-pressed={leftRailOpen}
    >
      Market
    </button>
    <button
      class="shell-btn"
      class:active={analysisRailOpen}
      onclick={onToggleAnalysisRail}
      title={analysisRailOpen ? 'Hide right analysis rail' : 'Show right analysis rail'}
      aria-pressed={analysisRailOpen}
    >
      Analysis
    </button>
  </div>

  <button class="capture-btn" onclick={onCapture} title="Capture this setup as PatternSeed">
    ⚡ CAPTURE
  </button>

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
    display: flex; align-items: center; gap: 10px;
    height: 42px; padding: 0 14px;
    background: #0b0e14;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    overflow-x: auto;
  }
  .workspace-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 4px;
    background: rgba(77,143,245,0.08);
    border: 1px solid rgba(77,143,245,0.18);
    white-space: nowrap;
  }
  .ws-label,
  .board-badge {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sc-text-3);
  }
  .ws-value {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
    color: #63b3ed;
  }
  .symbol-btn {
    font-family: var(--sc-font-mono); font-size: 12px; font-weight: 700;
    color: var(--sc-text-0); background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 4px;
    padding: 4px 10px; cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
  }
  .symbol-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.18); }
  .tf-ladder { display: flex; gap: 1px; background: rgba(255,255,255,0.04); padding: 2px; border-radius: 4px; }
  .tf-btn {
    font-family: var(--sc-font-mono); font-size: 10px; font-weight: 600;
    color: var(--sc-text-2); background: none; border: none;
    padding: 3px 8px; border-radius: 3px; cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .tf-btn:hover { color: var(--sc-text-0); background: rgba(255,255,255,0.06); }
  .tf-btn.active { color: #63b3ed; background: rgba(77,143,245,0.12); }

  .bias-badge {
    font-family: var(--sc-font-mono);
    font-size: 10px;
    font-weight: 700;
    padding: 2px 0;
    white-space: nowrap;
  }

  .board-badge {
    padding: 3px 8px;
    border-radius: 4px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    white-space: nowrap;
  }

  .layout-switch { display: flex; gap: 2px; margin-left: auto; }
  .layout-btn {
    font-family: var(--sc-font-mono); font-size: 9px; color: var(--sc-text-2);
    background: none; border: 1px solid transparent; border-radius: 3px;
    padding: 3px 8px; cursor: pointer;
    white-space: nowrap;
  }
  .layout-btn.active, .layout-btn:hover { color: #63b3ed; border-color: rgba(77,143,245,0.2); background: rgba(77,143,245,0.06); }

  .shell-switch {
    display: flex;
    gap: 4px;
    margin-left: 8px;
    padding-left: 8px;
    border-left: 1px solid rgba(255,255,255,0.08);
  }
  .shell-btn {
    font-family: var(--sc-font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--sc-text-3);
    background: transparent;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 3px;
    padding: 3px 8px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .shell-btn:hover {
    color: var(--sc-text-1);
    border-color: rgba(255,255,255,0.18);
  }
  .shell-btn.active {
    color: #63b3ed;
    border-color: rgba(77,143,245,0.24);
    background: rgba(77,143,245,0.08);
  }

  .clear-btn {
    font-family: var(--sc-font-mono); font-size: 9px; font-weight: 700;
    letter-spacing: 0.08em; color: var(--sc-text-2);
    background: none; border: 1px solid rgba(255,255,255,0.08);
    border-radius: 3px; padding: 3px 8px; cursor: pointer;
    transition: all 0.15s;
  }
  .clear-btn:hover { color: #f87171; border-color: rgba(248,113,113,0.3); }

  .capture-btn {
    font-family: var(--sc-font-mono); font-size: 10px; font-weight: 700;
    letter-spacing: 0.06em;
    color: #000;
    background: rgba(173,202,124,0.9);
    border: none; border-radius: 3px;
    padding: 4px 11px; cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .capture-btn:hover { background: #adca7c; }

  @media (max-width: 768px) {
    .workspace-badge,
    .board-badge,
    .layout-switch,
    .shell-switch {
      display: none;
    }
  }
</style>
